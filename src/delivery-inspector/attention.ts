// Heuristic attention detection. Pure — no I/O.
//
// Every item produced here is a *prompt to look*, produced from naming conventions and change shape.
// The vocabulary is constrained on purpose: "possible", "potentially missing", "inspect before
// delivery". Nothing in this module may assert a confirmed secret or a confirmed defect, because
// nothing here has the evidence to support such a claim.
//
// Privacy: attention reasons are built from paths, counts, and rule NAMES only. No file content, no
// matched substring, and no absolute path ever reaches a `reason` or `suggestion` string.
//
// Output is fully sorted (severity, then kind, then first path) so the same change set always
// produces the same array.

import {
  dependencyFacts,
  isEnvironmentFile,
  looksLikeCredentialStore,
  looksLikePrivateKeyFile,
  looksLikeSecretFilename,
  pathStem,
} from "./classify.ts";
import type { ContentScanFinding } from "./scan.ts";
import type {
  AttentionKind,
  AttentionSeverity,
  ChangedFile,
  Confidence,
  DeliveryAttentionItem,
  InspectionLimits,
} from "./types.ts";
import { ATTENTION_KINDS, ATTENTION_SEVERITIES } from "./types.ts";

export interface AttentionInput {
  changes: readonly ChangedFile[];
  /** Per-file credential-marker rule names. Never values. */
  contentFindings: readonly ContentScanFinding[];
  /** True when the repository has a `docs/` directory, so documentation is a reasonable expectation. */
  docsDirectoryPresent: boolean;
  limits: InspectionLimits;
}

const SEVERITY_RANK = new Map<AttentionSeverity, number>(
  ATTENTION_SEVERITIES.map((severity, index) => [severity, index]),
);
const KIND_RANK = new Map<AttentionKind, number>(
  ATTENTION_KINDS.map((kind, index) => [kind, index]),
);

function sortedPaths(paths: readonly string[]): string[] {
  return [...new Set(paths)].sort();
}

/** Documentation and test trees are expected to contain credential-looking sample names. */
function isLikelySampleContext(path: string): boolean {
  const segments = path.split("/");
  const first = segments[0];
  return (
    first === "test" ||
    first === "tests" ||
    first === "spec" ||
    first === "docs" ||
    segments.includes("__tests__") ||
    segments.includes("fixtures") ||
    segments.includes("examples")
  );
}

/**
 * Detect attention items for a change set.
 *
 * Conservative by design: a heuristic that cannot state its evidence is not implemented, and any item
 * derived from a sample or fixture path is downgraded rather than dropped, so it stays visible without
 * crying wolf.
 */
export function detectAttention(input: AttentionInput): DeliveryAttentionItem[] {
  const { changes, contentFindings, docsDirectoryPresent, limits } = input;
  const items: DeliveryAttentionItem[] = [];

  const add = (
    kind: AttentionKind,
    severity: AttentionSeverity,
    paths: readonly string[],
    reason: string,
    confidence: Confidence,
    suggestion: string,
  ): void => {
    if (paths.length === 0) return;
    items.push({ kind, severity, paths: sortedPaths(paths), reason, confidence, suggestion });
  };

  const present = (predicate: (file: ChangedFile) => boolean): ChangedFile[] =>
    changes.filter(predicate);

  // --- Credential-shaped names and locations -------------------------------------------------

  const secretNamed = present((file) => looksLikeSecretFilename(file.path));
  for (const file of secretNamed) {
    const sample = isLikelySampleContext(file.path);
    add(
      "possible_secret_filename",
      sample ? "worth_reviewing" : "inspect_before_delivery",
      [file.path],
      sample
        ? "The filename suggests credential material, but it sits in a test, fixture, or documentation path where sample names are normal. Judged from the name only; the file's content was not asserted on."
        : "The filename suggests credential material. Judged from the name only; the inspector makes no claim about the file's content.",
      sample ? "low" : "medium",
      "Open the file and confirm it holds no real credential before delivering. If it is a template, a name such as `.env.example` makes the intent explicit.",
    );
  }

  const credentialStores = present((file) => looksLikeCredentialStore(file.path));
  add(
    "possible_credential_store",
    "inspect_before_delivery",
    credentialStores.map((file) => file.path),
    "This path matches a well-known credential-store filename, so it may hold a real credential. Such files are rarely intended for delivery. Judged from the name only.",
    "medium",
    "Confirm the file belongs in version control at all; if it does not, remove it from the change set before delivering.",
  );

  const privateKeys = present((file) => looksLikePrivateKeyFile(file.path));
  add(
    "possible_private_key_file",
    "inspect_before_delivery",
    privateKeys.map((file) => file.path),
    "The extension or filename matches a private-key convention, so this may be real key material. Judged from the name only; no key material was read or reported.",
    "medium",
    "Confirm this is a public certificate or a test fixture, not a real private key, before delivering.",
  );

  const envFiles = present((file) => isEnvironmentFile(file.path));
  add(
    "environment_file_changed",
    "inspect_before_delivery",
    envFiles.map((file) => file.path),
    "An environment file changed. Environment files commonly carry real values and are usually meant to stay local. Template names such as `.env.example` are excluded from this check.",
    "high",
    "Confirm the file is intended to be tracked; prefer committing a redacted template and keeping real values untracked.",
  );

  for (const finding of contentFindings) {
    if (finding.matchedRules.length === 0) continue;
    const sample = isLikelySampleContext(finding.path);
    add(
      "possible_secret_content_pattern",
      sample ? "worth_reviewing" : "inspect_before_delivery",
      [finding.path],
      // Rule NAMES only. The matched text is never available at this point by construction.
      `Content matched credential-shaped pattern rule(s): ${finding.matchedRules.join(", ")}. The inspector reports the rule name only and deliberately does not return, log, or hash the matched value. A match is a prompt to look, not a confirmed secret.`,
      sample ? "low" : "medium",
      "Open the file yourself and decide. If it is a real credential, rotate it and remove it from history; if it is a sample, consider an obviously fake value.",
    );
  }

  // --- Change shape ---------------------------------------------------------------------------

  const largeFiles = present(
    (file) =>
      (file.sizeBytes !== undefined && file.sizeBytes >= limits.largeFileBytes) ||
      (file.insertions ?? 0) + (file.deletions ?? 0) >= limits.largeDiffLines,
  );
  add(
    "unexpectedly_large_change",
    "worth_reviewing",
    largeFiles.map((file) => file.path),
    `At least one changed file is unusually large for review: worktree size at or above ${limits.largeFileBytes} bytes, or at or above ${limits.largeDiffLines} changed lines.`,
    "high",
    "Consider whether the file is generated, vendored, or should be split, and whether a reviewer can realistically read it.",
  );

  const binaries = present((file) => file.binary);
  add(
    "binary_change",
    "worth_reviewing",
    binaries.map((file) => file.path),
    "Binary files changed. A binary diff cannot be reviewed line by line, so its contents are effectively unreviewed.",
    "high",
    "Confirm each binary is intended, is not a build artifact, and carries no embedded credential.",
  );

  const generated = present((file) => file.category === "generated");
  const sources = present((file) => file.category === "source");
  if (generated.length > 0 && sources.length > 0) {
    add(
      "generated_mixed_with_source",
      "worth_reviewing",
      [...generated, ...sources].map((file) => file.path),
      `${generated.length} generated file(s) changed alongside ${sources.length} source file(s). Mixing them makes a review diff noisy and hides the hand-written change.`,
      "medium",
      "Consider separating the generated artifacts into their own commit, or confirm they are meant to be regenerated together with the source.",
    );
  }

  // --- Dependency manifest and lock pairing ---------------------------------------------------

  const manifests = new Map<string, string[]>();
  const locks = new Map<string, string[]>();
  for (const file of changes) {
    const facts = dependencyFacts(file.path);
    if (facts === undefined) continue;
    const target = facts.role === "manifest" ? manifests : locks;
    target.set(facts.ecosystem, [...(target.get(facts.ecosystem) ?? []), file.path]);
  }
  for (const [ecosystem, paths] of [...locks].sort(([a], [b]) => a.localeCompare(b))) {
    if (manifests.has(ecosystem)) continue;
    add(
      "dependency_lock_without_manifest",
      "worth_reviewing",
      paths,
      `A ${ecosystem} lock file changed but no ${ecosystem} manifest changed. That is normal for a lock refresh or a transitive update, and unexpected when a dependency was meant to be added or removed.`,
      "medium",
      "Confirm the lock change is an intentional refresh rather than a manifest edit that was left out.",
    );
  }
  for (const [ecosystem, paths] of [...manifests].sort(([a], [b]) => a.localeCompare(b))) {
    if (locks.has(ecosystem)) continue;
    add(
      "dependency_manifest_without_lock",
      "worth_reviewing",
      paths,
      `A ${ecosystem} manifest changed but no ${ecosystem} lock file changed. If dependencies changed, the lock is potentially missing from this change set and installs may not be reproducible.`,
      "medium",
      "If the edit touched dependencies, regenerate and include the lock file. If it touched only metadata or scripts, no lock change is expected.",
    );
  }

  // --- Potentially missing companions ---------------------------------------------------------

  const tests = present((file) => file.category === "test");
  if (sources.length > 0 && tests.length === 0) {
    add(
      "source_without_test",
      "worth_reviewing",
      sources.map((file) => file.path),
      `${sources.length} source file(s) changed and no test file changed. The inspector cannot tell whether behavior changed, so this is a question, not a defect.`,
      "medium",
      "If behavior changed, add or update a test. If this is a rename, comment, or pure refactor covered by existing tests, no new test is needed.",
    );
  }

  const docs = present(
    (file) => file.category === "documentation" || file.category === "verification_evidence",
  );
  if (docsDirectoryPresent && sources.length > 0 && docs.length === 0) {
    add(
      "potentially_missing_documentation",
      "informational",
      sources.map((file) => file.path),
      "Source changed and no document changed, in a repository that maintains a docs/ tree. Documentation may be potentially missing; the inspector cannot tell whether this change is user-visible.",
      "low",
      "If the change alters behavior, an interface, or a decision, update the relevant document in the same delivery.",
    );
  }

  const migrations = present((file) => file.category === "migration");
  if (migrations.length > 0) {
    const migrationStems = new Set(migrations.map((file) => pathStem(file.path)));
    const relatedTests = tests.filter(
      (file) =>
        migrationStems.has(pathStem(file.path)) ||
        /migrat/.test(file.path.toLowerCase()) ||
        /schema/.test(file.path.toLowerCase()),
    );
    if (relatedTests.length === 0) {
      add(
        "migration_without_test",
        "inspect_before_delivery",
        migrations.map((file) => file.path),
        "Migration files changed with no obviously related test change. Migrations are hard to reverse once applied, so an untested migration is worth confirming deliberately.",
        "medium",
        "Add or update a migration test, or state explicitly why the migration is covered by existing tests.",
      );
    }
  }

  // --- Scope and evidence ---------------------------------------------------------------------

  const structuralAreas = new Set(
    changes
      .filter(
        (file) =>
          file.category === "source" ||
          file.category === "test" ||
          file.category === "migration" ||
          file.category === "configuration",
      )
      .map((file) => file.area),
  );
  if (structuralAreas.size >= 3) {
    add(
      "unrelated_areas_touched",
      "informational",
      changes.map((file) => file.path),
      `Changes span ${structuralAreas.size} top-level areas (${[...structuralAreas].sort().join(", ")}), which may indicate more than one logical change in flight.`,
      "low",
      "Review the suggested commit boundaries; if the areas are genuinely independent, separate deliveries are easier to review and revert.",
    );
  }

  const deletedEvidence = present(
    (file) => file.category === "verification_evidence" && file.status === "deleted",
  );
  add(
    "deleted_verification_evidence",
    "inspect_before_delivery",
    deletedEvidence.map((file) => file.path),
    "Verification evidence was deleted. Removing evidence weakens any completion claim that depended on it.",
    "high",
    "Confirm the deletion is intentional and that the claim the evidence supported is either withdrawn or re-evidenced.",
  );

  const generatedViews = present(
    (file) =>
      file.category === "generated" && file.area === ".newfang" && file.status !== "deleted",
  );
  const canonicalStateChanged = changes.some(
    (file) => file.category === "project_state" && file.area === ".newfang",
  );
  if (generatedViews.length > 0 && !canonicalStateChanged) {
    add(
      "generated_view_without_state_change",
      "inspect_before_delivery",
      generatedViews.map((file) => file.path),
      "A generated NewFang view under .newfang/ changed with no corresponding canonical state change. A generated view is derived output, so an independent edit is either hand-written drift or a stale regeneration.",
      "medium",
      "Regenerate the view from canonical state, or confirm the canonical change is genuinely absent from this change set.",
    );
  }

  // Apparent delivery scope: the areas the author has already staged. Dirty files elsewhere are
  // likely unrelated work in flight rather than part of this delivery.
  const stagedAreas = new Set(changes.filter((file) => file.staged).map((file) => file.area));
  if (stagedAreas.size > 0) {
    const outside = changes.filter(
      (file) => !file.staged && (file.unstaged || file.untracked) && !stagedAreas.has(file.area),
    );
    add(
      "dirty_outside_apparent_scope",
      "informational",
      outside.map((file) => file.path),
      `Unstaged or untracked changes sit outside the staged areas (${[...stagedAreas].sort().join(", ")}), so they are probably unrelated work in flight rather than part of this delivery.`,
      "low",
      "Confirm these files are meant to be excluded from the next commit; the inspector never stages or unstages anything.",
    );
  }

  return items.sort((a, b) => {
    const bySeverity = (SEVERITY_RANK.get(a.severity) ?? 0) - (SEVERITY_RANK.get(b.severity) ?? 0);
    if (bySeverity !== 0) return bySeverity;
    const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
    if (byKind !== 0) return byKind;
    return (a.paths[0] ?? "").localeCompare(b.paths[0] ?? "");
  });
}
