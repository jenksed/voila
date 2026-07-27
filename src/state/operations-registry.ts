// Bounded R2 operation registry. Exactly two accepted definitions live here; the supervisor never
// discovers operations from package.json, manifests, or the filesystem. Adding an operation is a
// deliberate accepted code change, not a configuration edit.

import type { OperationDefinition, ProjectState } from "../domain/types.ts";
import {
  registerDefinition,
  R2A_STATE_STORE_OPERATION,
  R2B_REPOSITORY_CHECKS_OPERATION,
} from "../domain/operations-runtime.ts";
import { loadState, updateState } from "./store.ts";

/** Accepted definitions with timestamps filled in for canonical persistence. */
export function r2aDefinition(now: string): OperationDefinition {
  return { ...R2A_STATE_STORE_OPERATION, createdAt: now, updatedAt: now } as OperationDefinition;
}

export function r2bDefinition(now: string): OperationDefinition {
  return {
    ...R2B_REPOSITORY_CHECKS_OPERATION,
    createdAt: now,
    updatedAt: now,
  } as OperationDefinition;
}

/**
 * Ensure both accepted R2 definitions are registered in canonical state. Idempotent: existing
 * definitions are preserved and only missing definitions are added. The first supervisor start
 * after an accepted implementation materializes any missing definition here.
 */
export async function ensureR2ARegistry(root: string): Promise<{
  registered: boolean;
  definitionId: string;
}> {
  const state = await loadState(root);
  const missing = [r2aDefinition, r2bDefinition].filter((factory) => {
    const id = factory("1970-01-01T00:00:00.000Z").id;
    return !state.operationDefinitions.some((definition) => definition.id === id);
  });
  if (missing.length === 0) {
    return { registered: false, definitionId: R2A_STATE_STORE_OPERATION.id };
  }
  const now = new Date().toISOString();
  await updateState(
    root,
    (cur) =>
      missing.reduce(
        (candidate, factory) => registerDefinition(candidate, factory(now), now).state,
        cur,
      ),
    () => ({
      type: "operation_definitions_registered",
      definitionIds: missing.map((factory) => factory(now).id),
    }),
  );
  return { registered: true, definitionId: R2A_STATE_STORE_OPERATION.id };
}

/** All operations the supervisor may currently launch. Pure read. */
export function listRegisteredOperations(state: ProjectState): OperationDefinition[] {
  return [...state.operationDefinitions];
}
