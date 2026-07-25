// Quiet ambient widget. Pure — returns 1–2 lines for a Pi widget. Answers "where am I?" without
// demanding attention: identity, phase, health, focus, next action, and only non-empty counts.

import type { ProjectState } from "../domain/types.ts";
import { abbreviate } from "../domain/status.ts";

/**
 * Ambient view. Shape:
 *   NewFang · BUILD · GREEN · Focus NF-2
 *   Next: Build planning-document intake · 3 risks · 1 blocked
 * Empty counts are omitted; long text is abbreviated; narrow widths degrade by dropping the tail.
 */
export function homeViewLines(state: ProjectState | null, width = 80): string[] {
  if (state === null) {
    return ["NewFang · not initialized — run /newfang init"];
  }

  const head = ["NewFang", state.phase.toUpperCase(), state.health.toUpperCase()];
  if (state.focusWorkItemId) head.push(`Focus ${state.focusWorkItemId}`);
  const line1 = abbreviate(head.join(" · "), Math.max(20, width));

  const counts: string[] = [];
  const blocked = state.workItems.filter((w) => w.status === "blocked").length;
  const openRisks = state.risks.filter((r) => r.status === "open").length;
  if (openRisks > 0) counts.push(`${openRisks} risk${openRisks === 1 ? "" : "s"}`);
  if (blocked > 0) counts.push(`${blocked} blocked`);

  const budget = Math.max(20, width);
  const tail = counts.length > 0 ? ` · ${counts.join(" · ")}` : "";
  const nextBudget = Math.max(12, budget - tail.length - 6);
  const line2 = `Next: ${abbreviate(state.nextAction, nextBudget)}${tail}`;

  return [line1, abbreviate(line2, budget)];
}
