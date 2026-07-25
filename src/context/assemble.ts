// Assemble the injected context from canonical state + artifacts. Read-only: never mutates state.

import { loadState } from "../state/store.ts";
import { MigrationRequiredError, StateNotFoundError } from "../state/errors.ts";
import { currentOrientationStatus } from "../state/orientation-store.ts";
import { buildContextBlock, type ContextInput } from "./inject.ts";

/** Build the NewFang context block for a project root, degrading gracefully on any problem. */
export async function assembleContext(root: string): Promise<string> {
  let input: ContextInput;
  try {
    const state = await loadState(root);
    const pending = state.intakes.find((i) => i.status === "review_required");
    const orientation = await currentOrientationStatus(root, state);
    input = {
      status: "ok",
      state,
      pendingIntake: pending
        ? { id: pending.id, title: pending.title, draftRevision: pending.draftRevision }
        : null,
      orientation: orientation.record
        ? {
            id: orientation.record.id,
            stale: orientation.staleness.stale,
            reasons: orientation.staleness.reasons,
          }
        : null,
    };
  } catch (error) {
    if (error instanceof StateNotFoundError) input = { status: "uninitialized" };
    else if (error instanceof MigrationRequiredError) input = { status: "migration" };
    else input = { status: "error", message: (error as Error).message };
  }
  return buildContextBlock(input);
}
