// Deterministic, collision-safe ID allocation from canonical sequence counters.

import type { Sequences } from "./types.ts";

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
