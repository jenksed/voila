// Deterministic, collision-safe ID allocation from canonical sequence counters.

import type { ProjectState, Sequences } from "./types.ts";

export type SequenceKey = keyof Sequences;

export const ID_PREFIXES: Record<SequenceKey, string> = {
  workItem: "NF",
  decision: "DEC",
  assumption: "ASM",
  risk: "RSK",
  intake: "INT",
  orientation: "ORI",
  claim: "CLM",
  receipt: "RCP",
  operationDefinition: "OP",
  operationRun: "RUN",
};

/**
 * Allocate the next ID for a collection using the stored counter, returning the ID and the
 * incremented sequences. IDs are derived from canonical counters, never from scanning entities.
 */
export function allocateId(
  sequences: Sequences,
  key: SequenceKey,
): { id: string; sequences: Sequences } {
  const n = sequences[key];
  return {
    id: `${ID_PREFIXES[key]}-${n}`,
    sequences: { ...sequences, [key]: n + 1 },
  };
}

export interface SequenceCounterRepair {
  key: SequenceKey;
  from: number;
  to: number;
  maxUsed: number;
}

function idNumber(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/** Explicitly repair only counters that no longer exceed their used numeric IDs. */
export function repairSequenceCounters(state: ProjectState): {
  state: ProjectState;
  repairs: SequenceCounterRepair[];
} {
  const ids: Record<SequenceKey, readonly string[]> = {
    workItem: state.workItems.map((item) => item.id),
    decision: state.decisions.map((item) => item.id),
    assumption: state.assumptions.map((item) => item.id),
    risk: state.risks.map((item) => item.id),
    intake: state.intakes.map((item) => item.id),
    orientation: state.orientations.map((item) => item.id),
    claim: state.claims.map((item) => item.id),
    receipt: state.receipts.map((item) => item.id),
    operationDefinition: state.operationDefinitions.map((item) => item.id),
    operationRun: state.operationRuns.map((item) => item.id),
  };
  let sequences = state.sequences;
  const repairs: SequenceCounterRepair[] = [];
  for (const key of Object.keys(ID_PREFIXES) as SequenceKey[]) {
    const maxUsed = ids[key].reduce((max, id) => Math.max(max, idNumber(id)), 0);
    if (sequences[key] > maxUsed) continue;
    const to = maxUsed + 1;
    repairs.push({ key, from: sequences[key], to, maxUsed });
    sequences = { ...sequences, [key]: to };
  }
  return {
    state: repairs.length > 0 ? { ...state, sequences } : state,
    repairs,
  };
}
