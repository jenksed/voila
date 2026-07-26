// Commit suggestion. Pure — no I/O, no git, no writes.
//
// The inspector decides how changes group; this module decides what to *say* about a group and
// whether it is safe to act on without looking first. It proposes; it never commits.
//
// Readiness is deliberately conservative:
//   - `blocked`        — an `inspect_before_delivery` item touches this boundary. Do not commit blind.
//   - `inspect_first`  — a `worth_reviewing` or `informational` item touches it.
//   - `ready`          — nothing flagged. Still a proposal, not a guarantee of correctness.
//
// A subject line is generated from paths and category, never from file *content*, so no changed
// text can leak into a commit message the engine wrote.

import type {
  ChangedFile,
  DeliveryAttentionItem,
  DeliveryInspection,
  SuggestedCommitBoundary,
} from "../delivery-inspector/types.ts";
import type { CommitReadiness, CommitSuggestion } from "./types.ts";

/** Conventional-commit subjects stay short enough to read in a log. */
export const SUBJECT_SOFT_LIMIT = 72;

/** Longest common directory prefix of a path set, or undefined when they do not share one. */
function commonArea(paths: readonly string[]): string | undefined {
  if (paths.length === 0) return undefined;
  const split = paths.map((p) => p.split("/").slice(0, -1));
  const first = split[0];
  if (!first || first.length === 0) return undefined;
  const shared: string[] = [];
  for (let i = 0; i < first.length; i++) {
    const segment = first[i];
    if (split.every((parts) => parts[i] === segment)) shared.push(segment as string);
    else break;
  }
  return shared.length > 0 ? shared.join("/") : undefined;
}

/** Trim a subject to the soft limit on a word boundary, never mid-word. */
function fitSubject(text: string): string {
  if (text.length <= SUBJECT_SOFT_LIMIT) return text;
  const cut = text.slice(0, SUBJECT_SOFT_LIMIT);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * A subject describing the change shape. It is intentionally generic: the engine knows which files
 * moved and what kind of files they are, and nothing whatsoever about intent. A vague-but-true
 * subject the author will rewrite beats a confident invention.
 */
function buildSubject(boundary: SuggestedCommitBoundary, files: readonly ChangedFile[]): string {
  const area = commonArea(boundary.paths);
  const count = boundary.paths.length;
  const noun = count === 1 ? "file" : "files";

  // An untracked file that lands in a commit is an addition, so both statuses count as "add".
  const allAdded =
    files.length > 0 && files.every((f) => f.status === "added" || f.status === "untracked");
  const allDeleted = files.length > 0 && files.every((f) => f.status === "deleted");

  const scope = area ? ` in ${area}` : "";
  if (allAdded) return fitSubject(`${boundary.suggestedType}: add ${count} ${noun}${scope}`);
  if (allDeleted) return fitSubject(`${boundary.suggestedType}: remove ${count} ${noun}${scope}`);
  return fitSubject(`${boundary.suggestedType}: update ${count} ${noun}${scope}`);
}

/**
 * Body lines stating only what is verifiable from the inspection: the grouping rationale, and the
 * fact that the subject is a placeholder. No claim about behavior is made, because the engine has
 * no evidence about behavior.
 */
function buildBody(boundary: SuggestedCommitBoundary, readiness: CommitReadiness): string[] {
  const body = [boundary.rationale];
  body.push(
    "Subject generated from the change shape, not from intent or file content. Replace it with what this change actually does before committing.",
  );
  if (readiness !== "ready") {
    body.push(
      "This proposal has unresolved attention items; see the delivery summary before acting on it.",
    );
  }
  return body;
}

function readinessFor(attention: readonly DeliveryAttentionItem[]): {
  readiness: CommitReadiness;
  reason: string;
} {
  const blocking = attention.filter((item) => item.severity === "inspect_before_delivery");
  if (blocking.length > 0) {
    return {
      readiness: "blocked",
      reason: `${blocking.length} item(s) marked inspect-before-delivery touch these paths: ${blocking
        .map((item) => item.kind)
        .join(", ")}. Inspect before committing.`,
    };
  }
  if (attention.length > 0) {
    return {
      readiness: "inspect_first",
      reason: `${attention.length} attention item(s) touch these paths: ${attention
        .map((item) => item.kind)
        .join(", ")}.`,
    };
  }
  return {
    readiness: "ready",
    reason:
      "No attention item touches these paths. This is still a proposal: the inspector checks shape and naming, not correctness.",
  };
}

/**
 * Build one commit proposal per suggested boundary, in boundary order.
 * Boundaries are disjoint by construction, so no path appears in two proposals.
 */
export function suggestCommits(inspection: DeliveryInspection): CommitSuggestion[] {
  const byPath = new Map(inspection.changes.map((file) => [file.path, file]));

  return inspection.suggestedBoundaries.map((boundary) => {
    const paths = new Set(boundary.paths);
    const attention = inspection.attention.filter((item) =>
      item.paths.some((path) => paths.has(path)),
    );
    const files = boundary.paths
      .map((path) => byPath.get(path))
      .filter((file): file is ChangedFile => file !== undefined);
    const { readiness, reason } = readinessFor(attention);

    return {
      boundaryId: boundary.id,
      type: boundary.suggestedType,
      subject: buildSubject(boundary, files),
      body: buildBody(boundary, readiness),
      paths: [...boundary.paths],
      rationale: boundary.rationale,
      readiness,
      readinessReason: reason,
      attention,
    };
  });
}

/** Render one proposal as the text a user would paste into `git commit`. */
export function renderCommitMessage(suggestion: CommitSuggestion): string {
  return [suggestion.subject, "", ...suggestion.body.map((p) => p)].join("\n");
}
