// Assemble the focus capsule from canonical state + artifacts + bounded repository observation.
// Read-only: never mutates state.

import { loadState } from "../state/store.ts";
import { MigrationRequiredError, StateNotFoundError } from "../state/errors.ts";
import { currentOrientationStatus } from "../state/orientation-store.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { proofSummary } from "../domain/proof.ts";
import { buildFocusCapsule, type CapsuleInput } from "./inject.ts";
import { observeRepository } from "./observe.ts";
import { activeRun, latestSettlement, summarizeRun } from "../domain/operations-runtime.ts";

export interface AssembleOptions {
  /** True when the developer's prompt was an explicit request to continue the accepted work. */
  continuation?: boolean;
}

/** Build the Voila focus capsule for a project root, degrading gracefully on any problem. */
export async function assembleContext(
  root: string,
  options: AssembleOptions = {},
): Promise<string> {
  let input: CapsuleInput;
  try {
    const state = await loadState(root);
    const pending = state.intakes.find((i) => i.status === "review_required");
    const orientation = await currentOrientationStatus(root, state);
    input = {
      status: "ok",
      continuation: options.continuation === true,
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
      // Only pay for a git fingerprint when claims exist to evaluate.
      proof:
        state.claims.length > 0
          ? proofSummary(state, await tryRepositoryFingerprint(root))
          : proofSummary(state, null),
      repository: await observeRepository(root),
      operation: summarizeOperation(state),
    };
  } catch (error) {
    if (error instanceof StateNotFoundError) input = { status: "uninitialized" };
    else if (error instanceof MigrationRequiredError) input = { status: "migration" };
    else input = { status: "error", message: (error as Error).message };
  }
  return buildFocusCapsule(input);
}

/** Build the bounded operation summary that the capsule may emit. */
function summarizeOperation(state: import("../domain/types.ts").ProjectState) {
  const active = activeRun(state);
  if (active) return summarizeRun(active, Date.now());
  const settled = latestSettlement(state);
  if (!settled) return null;
  // Only surface a settled run while it is still undelivered, so the Steward can acknowledge it.
  if (settled.deliveryState === "acknowledged") return null;
  return summarizeRun(settled, Date.now());
}
