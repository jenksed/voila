// The delivery inspector's single entry point.
//
// `inspectDelivery` answers four questions about a repository, read-only: what changed, how the change
// is scoped, what looks risky or incomplete, and what should be inspected before preparing a commit or
// a delivery summary.
//
// Contract:
// - **Read-only.** Git access goes through a runner that refuses non-read-only subcommands, and file
//   access goes through a bounded read-only filesystem. Nothing is staged, written, or committed.
// - **Deterministic.** Every collection is explicitly sorted and the result carries no timestamp, so
//   the same repository state serializes byte-identically.
// - **Partial over fatal.** A step that fails records a `limitations` entry and the inspection
//   continues. The only throws are an unusable root and a violated output invariant.
// - **Standalone.** No Pi APIs, no Voila canonical state, no UI. This module is the substrate a
//   later delivery engine will build on, not that engine.

import { stat } from "node:fs/promises";
import { detectAttention } from "./attention.ts";
import { suggestCommitBoundaries } from "./boundaries.ts";
import { classifyPath, topLevelArea } from "./classify.ts";
import { discoverVerificationCommands } from "./commands.ts";
import { InspectionRootError } from "./errors.ts";
import type { InspectionFileSystem } from "./fs.ts";
import { createNodeFileSystem } from "./fs.ts";
import type { GitRunner } from "./git.ts";
import { collectGitState, createGitRunner, primaryStatus } from "./git.ts";
import type { ContentScanFinding } from "./scan.ts";
import { looksBinary, scanTextForCredentialMarkers } from "./scan.ts";
import type {
  ChangeCategory,
  ChangeScope,
  ChangeSummary,
  ChangedFile,
  DeliveryInspection,
  InspectionLimits,
  RepositoryFacts,
} from "./types.ts";
import { CHANGE_CATEGORIES, DEFAULT_INSPECTION_LIMITS } from "./types.ts";

export interface InspectDeliveryOptions {
  /**
   * Injectable git runner. Defaults to a read-only runner rooted at `root`.
   * Tests use this to drive every pure path without a real repository.
   */
  runGit?: GitRunner;
  /** Injectable read-only filesystem. Defaults to a bounded one rooted at `root`. */
  fileSystem?: InspectionFileSystem;
  /** Overrides for the documented caps. Unspecified caps keep their defaults. */
  limits?: Partial<InspectionLimits>;
  /**
   * Skip the existence check on `root`. Required when a caller supplies both injectables and there is
   * no real directory to check.
   */
  skipRootCheck?: boolean;
}

function emptyCategoryCounts(): Record<ChangeCategory, number> {
  // Built in `CHANGE_CATEGORIES` order so JSON key order is deterministic.
  const counts = {} as Record<ChangeCategory, number>;
  for (const category of CHANGE_CATEGORIES) counts[category] = 0;
  return counts;
}

function describeScope(
  areaCount: number,
  fileCount: number,
): { scope: ChangeScope; reason: string } {
  if (fileCount === 0) {
    return { scope: "empty", reason: "no changes were detected in the worktree or the index" };
  }
  if (areaCount <= 1) {
    return { scope: "single_area", reason: "every changed file sits in one top-level area" };
  }
  if (areaCount <= 2) {
    return { scope: "focused", reason: `changes touch ${areaCount} top-level areas` };
  }
  return {
    scope: "spread",
    reason: `changes touch ${areaCount} top-level areas, which may mean more than one logical change is in flight`,
  };
}

function summarize(changes: readonly ChangedFile[]): ChangeSummary {
  const byCategory = emptyCategoryCounts();
  const areaCounts = new Map<string, number>();
  let insertions: number | undefined;
  let deletions: number | undefined;

  for (const file of changes) {
    byCategory[file.category] += 1;
    areaCounts.set(file.area, (areaCounts.get(file.area) ?? 0) + 1);
    if (file.insertions !== undefined) insertions = (insertions ?? 0) + file.insertions;
    if (file.deletions !== undefined) deletions = (deletions ?? 0) + file.deletions;
  }

  const { scope, reason } = describeScope(areaCounts.size, changes.length);
  return {
    totalFiles: changes.length,
    stagedFiles: changes.filter((file) => file.staged).length,
    unstagedFiles: changes.filter((file) => file.unstaged).length,
    untrackedFiles: changes.filter((file) => file.untracked).length,
    binaryFiles: changes.filter((file) => file.binary).length,
    renamedFiles: changes.filter((file) => file.status === "renamed" || file.status === "copied")
      .length,
    deletedFiles: changes.filter((file) => file.status === "deleted").length,
    byCategory,
    byArea: [...areaCounts.entries()]
      .map(([area, files]) => ({ area, files }))
      .sort((a, b) => a.area.localeCompare(b.area)),
    ...(insertions !== undefined ? { insertions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    scope,
    scopeReason: reason,
  };
}

/**
 * Inspect a repository's delivery readiness, read-only.
 *
 * @param root Absolute path to the repository root to inspect.
 * @param options Injectable git runner, injectable filesystem, and cap overrides.
 * @throws InspectionRootError when `root` is not a usable directory path.
 * @throws InspectionInvariantError when the produced boundaries would overlap (a bug in this module).
 */
export async function inspectDelivery(
  root: string,
  options: InspectDeliveryOptions = {},
): Promise<DeliveryInspection> {
  if (typeof root !== "string" || root.trim().length === 0) {
    throw new InspectionRootError("An inspection root path is required.");
  }

  const limits: InspectionLimits = { ...DEFAULT_INSPECTION_LIMITS, ...options.limits };
  const fullyInjected = options.runGit !== undefined && options.fileSystem !== undefined;
  if (!(options.skipRootCheck ?? fullyInjected)) {
    try {
      if (!(await stat(root)).isDirectory()) {
        throw new InspectionRootError(`The inspection root is not a directory: "${root}".`);
      }
    } catch (error) {
      if (error instanceof InspectionRootError) throw error;
      throw new InspectionRootError(
        `The inspection root does not exist or is not readable: "${root}".`,
      );
    }
  }

  const runGit = options.runGit ?? createGitRunner(root, limits);
  const fs = options.fileSystem ?? createNodeFileSystem(root);
  const limitations: string[] = [];

  // --- Git state ------------------------------------------------------------------------------
  const git = await collectGitState(runGit);
  limitations.push(...git.limitations);

  const repository: RepositoryFacts = {
    isGitRepository: git.isGitRepository,
    ...(git.facts.branch !== undefined ? { branch: git.facts.branch } : {}),
    ...(git.facts.head !== undefined ? { head: git.facts.head } : {}),
    detachedHead: git.facts.detachedHead,
    ...(git.facts.upstream !== undefined ? { upstream: git.facts.upstream } : {}),
    ...(git.facts.ahead !== undefined ? { ahead: git.facts.ahead } : {}),
    ...(git.facts.behind !== undefined ? { behind: git.facts.behind } : {}),
    dirty: git.entries.length > 0,
  };

  // --- Changed files --------------------------------------------------------------------------
  const entries = [...git.entries].sort((a, b) => a.path.localeCompare(b.path));
  let inspected = entries;
  if (entries.length > limits.maxFilesInspected) {
    inspected = entries.slice(0, limits.maxFilesInspected);
    limitations.push(
      `${entries.length} changed files were detected and the inspection was capped at ${limits.maxFilesInspected}; the change set, summary, attention items, and suggested boundaries are all incomplete.`,
    );
  }

  const changes: ChangedFile[] = [];
  const contentFindings: ContentScanFinding[] = [];
  let contentBudget = limits.maxFilesContentScanned;
  let cappedByContentBudget = 0;
  let truncatedByByteCap = 0;

  for (const entry of inspected) {
    const classification = classifyPath(entry.path);
    const status = primaryStatus(entry.x, entry.y);
    const stats = git.diffStats.get(entry.path);

    const file: ChangedFile = {
      path: entry.path,
      ...(entry.previousPath !== undefined ? { previousPath: entry.previousPath } : {}),
      status,
      staged: entry.x !== "." && entry.x !== "?",
      unstaged: entry.y !== "." && entry.y !== "?",
      untracked: entry.untracked,
      category: classification.category,
      confidence: classification.confidence,
      categoryReason: classification.reason,
      binary: stats?.binary ?? false,
      area: topLevelArea(entry.path),
      ...(stats?.insertions !== undefined ? { insertions: stats.insertions } : {}),
      ...(stats?.deletions !== undefined ? { deletions: stats.deletions } : {}),
    };

    // A deleted path has no worktree bytes; skip both the stat and the read.
    if (status !== "deleted") {
      const size = await fs.fileSize(entry.path);
      if (size !== null) file.sizeBytes = size;

      if (contentBudget > 0) {
        contentBudget -= 1;
        const bytes = await fs.readBytes(entry.path, limits.maxContentScanBytes);
        if (bytes !== null) {
          if (looksBinary(bytes)) {
            file.binary = true;
          } else {
            // Decoded, scanned, and dropped. Only rule NAMES survive this block.
            const matchedRules = scanTextForCredentialMarkers(Buffer.from(bytes).toString("utf8"));
            if (matchedRules.length > 0) contentFindings.push({ path: entry.path, matchedRules });
          }
          if (size !== null && size > limits.maxContentScanBytes) {
            file.inspectionCapped = true;
            truncatedByByteCap += 1;
          }
        }
      } else {
        file.inspectionCapped = true;
        cappedByContentBudget += 1;
      }
    }

    changes.push(file);
  }

  if (cappedByContentBudget > 0) {
    limitations.push(
      `${cappedByContentBudget} changed file(s) were not read because the content-inspection cap of ${limits.maxFilesContentScanned} files was reached; credential-marker scanning and byte-level binary detection did not run for them.`,
    );
  }
  if (truncatedByByteCap > 0) {
    limitations.push(
      `${truncatedByByteCap} changed file(s) are larger than the ${limits.maxContentScanBytes}-byte read cap, so only their first ${limits.maxContentScanBytes} bytes were scanned for credential markers; a marker later in such a file would not be detected.`,
    );
  }

  // --- Derived analysis -----------------------------------------------------------------------
  const summary = summarize(changes);
  const docsDirectoryPresent = await fs.directoryExists("docs");
  const attention = detectAttention({ changes, contentFindings, docsDirectoryPresent, limits });
  const { boundaries, unassignedPaths, notes } = suggestCommitBoundaries(changes);
  limitations.push(...notes);

  const discovery = await discoverVerificationCommands(fs, limits);
  limitations.push(...discovery.limitations);
  if (discovery.commands.length > 0) {
    limitations.push(
      "Discovered commands were NOT executed and are NOT verified. Each carries a basis naming how it became known; a declaration is not evidence that the command passes.",
    );
  }

  return {
    repository,
    changes,
    summary,
    attention,
    suggestedBoundaries: boundaries,
    unassignedPaths,
    discoveredVerificationCommands: discovery.commands,
    limitations: [...new Set(limitations)].sort(),
  };
}
