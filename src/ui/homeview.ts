// Minimal, quiet home-view projection. Pure — returns lines for a widget.

import type { ProjectState } from "../domain/types.ts";
import { abbreviate } from "../domain/status.ts";

/**
 * Restrained persistent home view: NewFang, phase, health, and an abbreviated next action.
 * Adds at most the active work-item ID (when set) and a blocked count (when nonzero).
 * When there is no project state, shows a single concise initialization hint.
 */
export function homeViewLines(state: ProjectState | null): string[] {
  if (state === null) {
    return ["NewFang · not initialized — run /newfang init"];
  }
  const blocked = state.workItems.filter((w) => w.status === "blocked").length;
  const parts = [`NewFang · phase: ${state.phase} · health: ${state.health}`];
  if (state.activeWorkItemId) parts.push(`active ${state.activeWorkItemId}`);
  if (blocked > 0) parts.push(`blocked ${blocked}`);
  return [parts.join(" · "), `→ ${abbreviate(state.nextAction, 72)}`];
}
