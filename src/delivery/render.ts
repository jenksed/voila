// Render a delivery summary as terminal lines. Pure — no I/O.
//
// Ordering is fixed so two runs are diffable: what changed, evidence, risks, limitations,
// verification commands, proposed commits, next action.
//
// Evidence is rendered *unrounded*. Supported and unsupported claims appear in the same list with
// their real status, because a delivery summary that shows only the good news is the exact failure
// the proof engine exists to prevent.

import type { CommitSuggestion, DeliverySummary } from "./types.ts";

const RULE = "─".repeat(60);

function section(lines: string[], title: string): void {
  lines.push("", title, RULE);
}

function bulletsOrNone(lines: string[], items: readonly string[], none: string): void {
  if (items.length === 0) {
    lines.push(`  ${none}`);
    return;
  }
  for (const item of items) lines.push(`  - ${item}`);
}

/** One-line status marker per claim. Deliberately literal. */
const CLAIM_MARK: Record<string, string> = {
  supported: "SUPPORTED  ",
  stale: "STALE      ",
  unsupported: "UNSUPPORTED",
  pending: "PENDING    ",
};

export function renderDeliverySummary(summary: DeliverySummary): string[] {
  const lines: string[] = [];
  const repo = summary.inspection.repository;

  lines.push(`Delivery summary — ${summary.projectName}`);
  lines.push(
    `  phase ${summary.phase} · health ${summary.health}` +
      (summary.branch ? ` · branch ${summary.branch}` : "") +
      (summary.head ? ` · head ${summary.head.slice(0, 8)}` : ""),
  );
  if (repo.upstream) {
    const ahead = repo.ahead ?? 0;
    const behind = repo.behind ?? 0;
    lines.push(`  upstream ${repo.upstream} · ahead ${ahead} · behind ${behind}`);
  }

  // --- What changed ---
  section(lines, "What changed");
  if (summary.clean) {
    lines.push("  Nothing changed. There is no delivery to prepare.");
  } else {
    const s = summary.inspection.summary;
    lines.push(
      `  ${s.totalFiles} file(s): ${s.stagedFiles} staged · ${s.unstagedFiles} unstaged · ${s.untrackedFiles} untracked`,
    );
    if (s.insertions !== undefined || s.deletions !== undefined) {
      lines.push(`  +${s.insertions ?? 0} / -${s.deletions ?? 0} lines`);
    }
    if (s.binaryFiles > 0 || s.renamedFiles > 0 || s.deletedFiles > 0) {
      lines.push(
        `  ${s.binaryFiles} binary · ${s.renamedFiles} renamed · ${s.deletedFiles} deleted`,
      );
    }
    lines.push(`  scope: ${s.scope} — ${s.scopeReason}`);
    const areas = s.byArea.slice(0, 8).map((a) => `${a.area} (${a.files})`);
    if (areas.length > 0) lines.push(`  areas: ${areas.join(", ")}`);
  }

  // --- Evidence ---
  section(lines, "Claims and evidence");
  if (summary.claims.length === 0) {
    lines.push("  No claims recorded. This delivery carries no evidence.");
  } else {
    lines.push(
      `  ${summary.supportingClaimIds.length} of ${summary.claims.length} claim(s) currently supported by evidence.`,
    );
    for (const claim of summary.claims) {
      const mark = CLAIM_MARK[claim.status] ?? claim.status;
      lines.push(`  [${mark}] ${claim.claimId} (${claim.workItemId}) ${claim.statement}`);
      lines.push(`      ${claim.reason}`);
      if (claim.currentReceiptId) {
        lines.push(`      current receipt: ${claim.currentReceiptId}`);
      }
      for (const limitation of claim.knownLimitations) {
        lines.push(`      limitation: ${limitation}`);
      }
    }
  }

  // --- Risks ---
  section(lines, "Risks and attention");
  bulletsOrNone(lines, summary.risks, "No open risks recorded and nothing flagged for inspection.");

  // --- Limitations ---
  section(lines, "Limitations");
  bulletsOrNone(lines, summary.limitations, "(none recorded)");

  // --- Verification ---
  section(lines, "Verification commands (discovered, never executed)");
  if (summary.verificationCommands.length === 0) {
    lines.push("  None discovered.");
  } else {
    for (const command of summary.verificationCommands) {
      lines.push(`  ${command.command}  [${command.basis} — ${command.source}]`);
    }
  }

  // --- Proposed commits ---
  section(lines, "Proposed commits");
  if (summary.commits.length === 0) {
    lines.push("  No commit boundary was suggested.");
  } else {
    for (const commit of summary.commits) {
      lines.push(...renderCommitProposal(commit));
    }
  }
  if (summary.inspection.unassignedPaths.length > 0) {
    lines.push(
      `  Ungrouped (${summary.inspection.unassignedPaths.length}): ${summary.inspection.unassignedPaths
        .slice(0, 10)
        .join(", ")}`,
    );
  }

  // --- Next action ---
  section(lines, "Next justified action");
  lines.push(`  ${summary.nextAction}`);
  if (summary.nextActionRationale) lines.push(`  Why now: ${summary.nextActionRationale}`);

  return lines;
}

export function renderCommitProposal(commit: CommitSuggestion): string[] {
  const lines: string[] = [];
  lines.push(`  ${commit.boundaryId} [${commit.readiness}] ${commit.subject}`);
  lines.push(`      ${commit.readinessReason}`);
  lines.push(`      files (${commit.paths.length}): ${commit.paths.slice(0, 10).join(", ")}`);
  if (commit.paths.length > 10) {
    lines.push(`      (+${commit.paths.length - 10} more)`);
  }
  return lines;
}
