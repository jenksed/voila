// Minimal, quiet home-view projection. Pure — returns lines for a widget.

import type { ProjectState } from "../domain/types.ts";
import { abbreviate } from "../domain/status.ts";

/**
 * Restrained persistent home view: NewFang, phase, health, and an abbreviated next action.
 * When there is no project state, show a single concise initialization hint (not an error wall).
 */
export function homeViewLines(state: ProjectState | null): string[] {
  if (state === null) {
    return ["NewFang · not initialized — run /newfang init"];
  }
  return [
    `NewFang · phase: ${state.phase} · health: ${state.health}`,
    `→ ${abbreviate(state.nextAction, 72)}`,
  ];
}
