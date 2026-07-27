// Runtime helpers for plan admission. Pure functions over canonical state, no Git, no Pi.
//
// The apply tool derives authority from `protectedCompletion(workItemId)` plus one current
// immutable plan, never from a model-supplied boolean. These helpers describe the only paths
// through which a PublicationPlan becomes admissible.

import { createHash } from "node:crypto";
import type { ProjectState, WorkItem } from "../domain/types.ts";
import { COMPLETED_STATUS } from "../domain/types.ts";

/** sha256 over the immutable completion record fields, normalized. */
export function computeCompletionDigest(workItem: WorkItem): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        completedAt: workItem.updatedAt,
        requiredClaimIds: [...workItem.requiredClaimIds].sort(),
        status: workItem.status,
        workItemId: workItem.id,
      }),
    )
    .digest("hex");
}

/**
 * A work item has a protected completion record when `voila_complete_work_item` recorded the
 * `completed` status through the canonical state transition. Only such items admit a publication
 * plan; a model-authored `nextAction` never qualifies.
 */
export function protectedCompletion(
  state: ProjectState,
  workItemId: string,
): {
  completed: boolean;
  digest?: string;
} {
  const item = state.workItems.find((candidate) => candidate.id === workItemId);
  if (!item || item.status !== COMPLETED_STATUS) return { completed: false };
  return { completed: true, digest: computeCompletionDigest(item) };
}

/**
 * Select the canonical current work item. Returns null when no item is focused or the focus is
 * cancelled/blocked. Completed items remain admissible because protected completion is the G0
 * trigger.
 */
export function currentAdmissibleWorkItem(state: ProjectState): WorkItem | null {
  if (state.focusWorkItemId === null) return null;
  const item = state.workItems.find((candidate) => candidate.id === state.focusWorkItemId);
  if (!item) return null;
  if (item.status === "cancelled" || item.status === "blocked") return null;
  return item;
}
