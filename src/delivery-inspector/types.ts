// Result model for the read-only delivery inspector. Pure types and closed vocabularies — no I/O.
//
// Honesty constraints encoded in this model:
// - The inspector never runs a command, so `DiscoveredCommand.executed` is the literal `false` and no
//   field may describe a command as "verified". Formal verification waits for real receipts.
// - Attention items are *suspicions with a stated reason*, never confirmed secrets or confirmed
//   defects. Vocabulary is deliberately hedged ("possible", "potentially missing", "inspect").
// - No field ever carries file content, matched substrings, or absolute paths. Paths are always
//   repository-relative and POSIX-separated.
// - Output contains no timestamps: the same repository state must produce byte-identical results.

/** What a changed file appears to be. Deterministic, first-matching-rule wins. */
export const CHANGE_CATEGORIES = [
  "source",
  "test",
  "documentation",
  "configuration",
  "migration",
  "generated",
  "dependency_metadata",
  "verification_evidence",
  "project_state",
  "ci",
  "unknown",
] as const;
export type ChangeCategory = (typeof CHANGE_CATEGORIES)[number];

/** How much the inspector trusts one of its own conclusions. Never a claim about the code. */
export type Confidence = "high" | "medium" | "low";

/** Primary change status, derived from git's staged/worktree code pair. */
export const CHANGE_STATUSES = [
  "added",
  "modified",
  "deleted",
  "renamed",
  "copied",
  "type_changed",
  "unmerged",
  "untracked",
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];

export interface ChangedFile {
  /** Repository-relative, POSIX-separated. Never absolute. */
  path: string;
  /** Original path for a rename or copy. */
  previousPath?: string;
  status: ChangeStatus;
  /** The index differs from HEAD for this path. */
  staged: boolean;
  /** The worktree differs from the index for this path. */
  unstaged: boolean;
  untracked: boolean;
  category: ChangeCategory;
  confidence: Confidence;
  /** Why this category was chosen, in one short phrase. */
  categoryReason: string;
  binary: boolean;
  /** First path segment, or "." for a repository-root file. */
  area: string;
  /** Added lines across the staged and unstaged diffs. Absent when git did not resolve them. */
  insertions?: number;
  /** Removed lines across the staged and unstaged diffs. Absent when git did not resolve them. */
  deletions?: number;
  /** Worktree size. Absent when the file does not exist in the worktree (for example, deleted). */
  sizeBytes?: number;
  /** True when a cap stopped the inspector from reading this file's bytes. */
  inspectionCapped?: boolean;
}

/** How concentrated the change set looks. Advisory only. */
export const CHANGE_SCOPES = ["empty", "single_area", "focused", "spread"] as const;
export type ChangeScope = (typeof CHANGE_SCOPES)[number];

export interface ChangeSummary {
  totalFiles: number;
  stagedFiles: number;
  unstagedFiles: number;
  untrackedFiles: number;
  binaryFiles: number;
  renamedFiles: number;
  deletedFiles: number;
  /** Every category, always present, in `CHANGE_CATEGORIES` order. */
  byCategory: Record<ChangeCategory, number>;
  /** Sorted by area name. */
  byArea: { area: string; files: number }[];
  /** Absent when no file reported line counts. */
  insertions?: number;
  deletions?: number;
  scope: ChangeScope;
  scopeReason: string;
}

/**
 * Attention kinds. Each is a heuristic prompt to look, not a finding of fact.
 * `possible_*` and `potentially_missing_*` naming is load-bearing: it keeps callers honest.
 */
export const ATTENTION_KINDS = [
  "possible_secret_filename",
  "possible_credential_store",
  "possible_private_key_file",
  "environment_file_changed",
  "possible_secret_content_pattern",
  "unexpectedly_large_change",
  "binary_change",
  "generated_mixed_with_source",
  "dependency_lock_without_manifest",
  "dependency_manifest_without_lock",
  "source_without_test",
  "potentially_missing_documentation",
  "migration_without_test",
  "unrelated_areas_touched",
  "deleted_verification_evidence",
  "generated_view_without_state_change",
  "dirty_outside_apparent_scope",
] as const;
export type AttentionKind = (typeof ATTENTION_KINDS)[number];

/**
 * Severity is about how strongly the inspector suggests looking — not about proven risk.
 * `inspect_before_delivery` is the strongest thing this module is allowed to say.
 */
export const ATTENTION_SEVERITIES = [
  "inspect_before_delivery",
  "worth_reviewing",
  "informational",
] as const;
export type AttentionSeverity = (typeof ATTENTION_SEVERITIES)[number];

export interface DeliveryAttentionItem {
  kind: AttentionKind;
  severity: AttentionSeverity;
  /** Repository-relative paths, sorted. Never file content. */
  paths: string[];
  /** Explainable reason. Must never quote file content or a suspected secret value. */
  reason: string;
  confidence: Confidence;
  /** What a human could do about it. Advisory. */
  suggestion: string;
}

/** Why a group of files was suggested as one commit. */
export const BOUNDARY_KINDS = [
  "coherent_single_commit",
  "module_with_tests",
  "migration",
  "documentation",
  "verification_evidence",
  "generated_artifacts",
  "configuration",
  "ci",
  "dependencies",
  "project_state",
] as const;
export type BoundaryKind = (typeof BOUNDARY_KINDS)[number];

export interface SuggestedCommitBoundary {
  /** Stable within one inspection: "B1", "B2", ... in emitted order. */
  id: string;
  kind: BoundaryKind;
  /** Sorted. Guaranteed disjoint from every other boundary in the same inspection. */
  paths: string[];
  rationale: string;
  /** Advisory conventional-commit type. The inspector never writes a commit. */
  suggestedType: "feat" | "fix" | "docs" | "test" | "chore" | "refactor" | "build" | "ci";
}

/** How a candidate verification command became known. Never "verified". */
export const DISCOVERY_BASES = [
  "declared_in_manifest",
  "declared_in_documentation",
  "candidate",
] as const;
export type DiscoveryBasis = (typeof DISCOVERY_BASES)[number];

export interface DiscoveredCommand {
  command: string;
  basis: DiscoveryBasis;
  /** Repository-relative path of the manifest or document that declared it. */
  source: string;
  /**
   * Always `false`. The inspector discovers commands and never executes them, so no result exists.
   * Encoded as a literal type so no caller can set it to `true` through this model.
   */
  executed: false;
  note?: string;
}

export interface RepositoryFacts {
  /** False when the inspected root is not inside a git worktree. */
  isGitRepository: boolean;
  /** Absent when detached or unresolvable. */
  branch?: string;
  /** Absent in a repository with no commits yet. */
  head?: string;
  detachedHead: boolean;
  /** Absent when no upstream is configured. */
  upstream?: string;
  /** Absent unless git resolved the divergence counts. */
  ahead?: number;
  behind?: number;
  dirty: boolean;
}

export interface DeliveryInspection {
  repository: RepositoryFacts;
  /** Sorted by path. */
  changes: ChangedFile[];
  summary: ChangeSummary;
  /** Sorted by severity, then kind, then first path. */
  attention: DeliveryAttentionItem[];
  /** Advisory groupings. Mutually disjoint by construction. */
  suggestedBoundaries: SuggestedCommitBoundary[];
  /** Changed paths the inspector declined to group. Kept visible on purpose. */
  unassignedPaths: string[];
  /** Sorted by basis, then command. Never executed. */
  discoveredVerificationCommands: DiscoveredCommand[];
  /** Everything the inspector could not do, could not see, or deliberately capped. Sorted. */
  limitations: string[];
}

/** Documented caps. Every cap that bites is reported in `limitations`. */
export interface InspectionLimits {
  /** Maximum changed files carried into the result. */
  maxFilesInspected: number;
  /** Maximum changed files whose bytes are read (for binary detection and pattern scanning). */
  maxFilesContentScanned: number;
  /** Maximum bytes read from any one file. Content is never retained. */
  maxContentScanBytes: number;
  /** A single changed file at or above this worktree size raises an attention item. */
  largeFileBytes: number;
  /** A single changed file at or above this many changed lines raises an attention item. */
  largeDiffLines: number;
  /** `execFile` output cap for a single git invocation. */
  maxGitOutputBytes: number;
  /** Wall-clock cap for a single git invocation. */
  gitTimeoutMs: number;
  /** Maximum discovered verification commands. */
  maxCommandsDiscovered: number;
  /** Maximum bytes read from a manifest or document during command discovery. */
  maxManifestBytes: number;
}

export const DEFAULT_INSPECTION_LIMITS: InspectionLimits = {
  maxFilesInspected: 2000,
  maxFilesContentScanned: 200,
  maxContentScanBytes: 65_536,
  largeFileBytes: 524_288,
  largeDiffLines: 2000,
  maxGitOutputBytes: 8_388_608,
  gitTimeoutMs: 15_000,
  maxCommandsDiscovered: 100,
  maxManifestBytes: 131_072,
};
