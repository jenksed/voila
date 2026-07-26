// Quiet ambient widget. Pure — returns 1–2 lines for a Pi widget. Answers "where am I?" without
// demanding attention: identity, phase, health, focus, next action, and only non-empty counts.

import type { ProjectState } from "../domain/types.ts";
import type { ProofSummary } from "../domain/proof.ts";
import { abbreviate } from "../domain/status.ts";

/**
 * The single most severe proof problem, as one compact fragment — or null when proof is quiet.
 * Deliberately at most ONE warning: the widget's two-line contract is not negotiable.
 */
export function proofWarning(proof: ProofSummary | null | undefined): string | null {
  if (!proof || proof.total === 0) return null;
  if (proof.unsupported > 0) return `${proof.unsupported} unsupported`;
  if (proof.stale > 0) return `${proof.stale} stale`;
  if (proof.pending > 0) return `${proof.pending} unproven`;
  return null;
}

/**
 * Ambient view. Shape:
 *   Voila · BUILD · GREEN · Focus NF-2
 *   Next: Build planning-document intake · 3 risks · 1 blocked · 2 stale
 * Empty counts are omitted; long text is abbreviated; narrow widths degrade by dropping the tail.
 * At most one proof warning is added, and the result is always at most two lines.
 */
export function homeViewLines(
  state: ProjectState | null,
  width = 80,
  proof?: ProofSummary | null,
): string[] {
  if (state === null) {
    return ["Voila · not initialized — run /voila init"];
  }

  const head = ["Voila", state.phase.toUpperCase(), state.health.toUpperCase()];
  if (state.focusWorkItemId) head.push(`Focus ${state.focusWorkItemId}`);
  const line1 = abbreviate(head.join(" · "), Math.max(20, width));

  const counts: string[] = [];
  const blocked = state.workItems.filter((w) => w.status === "blocked").length;
  const openRisks = state.risks.filter((r) => r.status === "open").length;
  if (openRisks > 0) counts.push(`${openRisks} risk${openRisks === 1 ? "" : "s"}`);
  if (blocked > 0) counts.push(`${blocked} blocked`);
  const warning = proofWarning(proof);
  if (warning) counts.push(warning);

  const budget = Math.max(20, width);
  const tail = counts.length > 0 ? ` · ${counts.join(" · ")}` : "";
  const nextBudget = Math.max(12, budget - tail.length - 6);
  const line2 = `Next: ${abbreviate(state.nextAction, nextBudget)}${tail}`;

  return [line1, abbreviate(line2, budget)];
}
