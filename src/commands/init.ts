// `/voila init` logic. Pure of Pi; testable with a temp directory.

import { deriveDisplayName } from "../domain/defaults.ts";
import { initState, stateExists } from "../state/store.ts";
import type { CommandResult } from "./types.ts";

/**
 * Initialize canonical Voila state for the project at `root`.
 * Refuses destructive reinitialization by default (no force option in this packet).
 */
export async function runInit(root: string): Promise<CommandResult> {
  if (stateExists(root)) {
    return {
      level: "warning",
      lines: [
        "Voila is already initialized here (.voila/project.json exists).",
        "Refusing to reinitialize — no force/reset option in this version.",
        "Run /voila status to see the current state.",
      ],
    };
  }

  const state = await initState(root, { displayName: deriveDisplayName(root) });
  return {
    level: "info",
    lines: [
      `Initialized Voila project "${state.displayName}".`,
      "Created .voila/ (project.json, events.jsonl, receipts/, views/PROJECT_STATUS.md).",
      `Phase: ${state.phase} · Health: ${state.health} · Revision: ${state.revision}`,
      `Next: ${state.nextAction}`,
    ],
    state,
  };
}
