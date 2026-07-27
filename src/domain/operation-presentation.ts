// Pure authoritative presentation projection for supervised operations.

import type { OperationDefinition, OperationRun, ProjectState } from "./types.ts";
import { isFinalState } from "./operations-runtime.ts";

export const OPERATION_PRESENTATION_STATES = [
  "none",
  "active_starting",
  "active_running",
  "settled_pending_delivery",
  "requires_reconciliation",
] as const;
export type OperationPresentationState = (typeof OPERATION_PRESENTATION_STATES)[number];

export interface OperationPresentationRuntime {
  ownedReservationRunIds: readonly string[];
  ownedProcessRunIds: readonly string[];
  liveProcessRunIds: readonly string[];
}

export interface ProjectOperationPresentation {
  state: OperationPresentationState;
  runId?: string;
  definitionId?: string;
  definitionVersion?: number;
  displayLabel?: string;
  lifecycleState?: OperationRun["lifecycleState"];
  elapsedMs?: number;
  workItemId?: string;
  outputRedacted?: boolean;
  outputTruncated?: boolean;
  artifactRef?: string;
  changedDuringRun?: boolean;
  reconciliationCode?: "runtime_ownership_absent" | "runtime_liveness_absent";
  settlementReason?: OperationRun["settlementReason"];
}

function definitionFor(state: ProjectState, run: OperationRun): OperationDefinition | undefined {
  return state.operationDefinitions.find(
    (definition) =>
      definition.id === run.definitionId && definition.version === run.definitionVersion,
  );
}

function curated(
  state: ProjectState,
  run: OperationRun,
  presentationState: OperationPresentationState,
  currentTime: number,
): ProjectOperationPresentation {
  const definition = definitionFor(state, run);
  const started = run.startedAt ? Date.parse(run.startedAt) : Date.parse(run.createdAt);
  const end = run.settledAt ? Date.parse(run.settledAt) : currentTime;
  return {
    state: presentationState,
    runId: run.id,
    definitionId: run.definitionId,
    definitionVersion: run.definitionVersion,
    displayLabel: definition?.displayLabel ?? run.definitionId,
    lifecycleState: run.lifecycleState,
    ...(Number.isFinite(started) && Number.isFinite(end)
      ? { elapsedMs: Math.max(0, end - started) }
      : {}),
    ...(run.ownership.workItemId ? { workItemId: run.ownership.workItemId } : {}),
    outputRedacted: run.outputSummary.redactedSecrets,
    outputTruncated: run.outputSummary.truncated,
    ...(run.outputArtifactRef ? { artifactRef: run.outputArtifactRef } : {}),
    changedDuringRun: run.changedDuringRun,
    ...(run.settlementReason ? { settlementReason: run.settlementReason } : {}),
  };
}

export function projectOperationPresentation(input: {
  canonicalState: ProjectState;
  runtimeOwnership: OperationPresentationRuntime;
  currentTime: number;
}): ProjectOperationPresentation {
  const { canonicalState: state, runtimeOwnership: runtime, currentTime } = input;
  const active = [...state.operationRuns]
    .reverse()
    .find((run) => !isFinalState(run.lifecycleState));
  if (active) {
    if (active.lifecycleState === "starting") {
      if (runtime.ownedReservationRunIds.includes(active.id)) {
        return curated(state, active, "active_starting", currentTime);
      }
      return {
        ...curated(state, active, "requires_reconciliation", currentTime),
        reconciliationCode: "runtime_ownership_absent",
      };
    }
    if (
      active.lifecycleState === "running" &&
      runtime.ownedProcessRunIds.includes(active.id) &&
      runtime.liveProcessRunIds.includes(active.id)
    ) {
      return curated(state, active, "active_running", currentTime);
    }
    return {
      ...curated(state, active, "requires_reconciliation", currentTime),
      reconciliationCode: runtime.ownedProcessRunIds.includes(active.id)
        ? "runtime_liveness_absent"
        : "runtime_ownership_absent",
    };
  }

  const pending = [...state.operationRuns]
    .reverse()
    .find((run) => isFinalState(run.lifecycleState) && run.deliveryState !== "acknowledged");
  if (pending) return curated(state, pending, "settled_pending_delivery", currentTime);
  return { state: "none" };
}
