// R2A operation registry. One accepted definition lives here; the supervisor never discovers
// operations from package.json, manifests, or the filesystem. Adding a new accepted operation is
// a deliberate code change, not a configuration edit.

import type { OperationDefinition, ProjectState } from "../domain/types.ts";
import { registerDefinition, R2A_STATE_STORE_OPERATION } from "../domain/operations-runtime.ts";
import { loadState, updateState } from "./store.ts";

/** The single accepted R2A operation, with timestamps filled in for canonical persistence. */
export function r2aDefinition(now: string): OperationDefinition {
  const base = R2A_STATE_STORE_OPERATION;
  return { ...base, createdAt: now, updatedAt: now } as OperationDefinition;
}

/**
 * Ensure the R2A state-store operation is registered in canonical state. Idempotent: re-running on
 * a project that already has it is a no-op. The migration from v4 to v5 leaves both definitions
 * and runs empty, so the first supervisor start materializes the accepted definition here.
 */
export async function ensureR2ARegistry(root: string): Promise<{
  registered: boolean;
  definitionId: string;
}> {
  const state = await loadState(root);
  const existing = state.operationDefinitions.find((d) => d.id === R2A_STATE_STORE_OPERATION.id);
  if (existing) return { registered: false, definitionId: existing.id };
  const now = new Date().toISOString();
  await updateState(
    root,
    (cur) => registerDefinition(cur, r2aDefinition(now), now).state,
    () => ({ type: "operation_definition_registered", definitionId: R2A_STATE_STORE_OPERATION.id }),
  );
  return { registered: true, definitionId: R2A_STATE_STORE_OPERATION.id };
}

/** All operations the supervisor may currently launch. Pure read. */
export function listRegisteredOperations(state: ProjectState): OperationDefinition[] {
  return [...state.operationDefinitions];
}
