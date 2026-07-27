// Schema version 4 (Packet 4) shape, kept readable for explicit migration to v5.
// v4 is never a valid *current* state under R2A; it is only a migration source.

import { HEALTHS, PHASES } from "./types.ts";

export const SCHEMA_VERSION_V4 = 4;

export interface SequencesV4 {
  workItem: number;
  decision: number;
  assumption: number;
  risk: number;
  intake: number;
  orientation: number;
  claim: number;
  receipt: number;
}

export interface ProjectStateV4 {
  schemaVersion: number;
  projectId: string;
  displayName: string;
  phase: string;
  health: string;
  nextAction: string;
  nextActionRationale?: string;
  focusWorkItemId: string | null;
  sequences: SequencesV4;
  workItems: unknown[];
  decisions: unknown[];
  assumptions: unknown[];
  risks: unknown[];
  intakes: unknown[];
  orientations: unknown[];
  claims: unknown[];
  receipts: unknown[];
  currentIntakeId?: string;
  currentOrientationId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

/**
 * Structurally validate a parsed value as v4 (for migration). Entity-level validation happens when
 * the derived v5 candidate is validated, so a malformed v4 is still refused before any write.
 */
export function validateProjectStateV4(raw: unknown): ProjectStateV4 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("v4 state must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION_V4) {
    throw new Error(`Expected schemaVersion 4, found ${String(o.schemaVersion)}.`);
  }

  const problems: string[] = [];
  for (const key of ["projectId", "displayName", "nextAction", "createdAt", "updatedAt"]) {
    if (typeof o[key] !== "string" || (o[key] as string).length === 0) problems.push(key);
  }
  if (typeof o.phase !== "string" || !(PHASES as readonly string[]).includes(o.phase)) {
    problems.push("phase");
  }
  if (typeof o.health !== "string" || !(HEALTHS as readonly string[]).includes(o.health)) {
    problems.push("health");
  }
  if (typeof o.revision !== "number" || !Number.isInteger(o.revision) || o.revision < 1) {
    problems.push("revision");
  }
  if (o.focusWorkItemId !== null && typeof o.focusWorkItemId !== "string") {
    problems.push("focusWorkItemId");
  }
  for (const key of ["nextActionRationale", "currentIntakeId", "currentOrientationId"]) {
    if (o[key] !== undefined && typeof o[key] !== "string") problems.push(key);
  }
  const seq = o.sequences;
  if (typeof seq !== "object" || seq === null) {
    problems.push("sequences");
  } else {
    const s = seq as Record<string, unknown>;
    for (const key of [
      "workItem",
      "decision",
      "assumption",
      "risk",
      "intake",
      "orientation",
      "claim",
      "receipt",
    ]) {
      if (typeof s[key] !== "number" || !Number.isInteger(s[key]) || (s[key] as number) < 1) {
        problems.push(`sequences.${key}`);
      }
    }
  }
  for (const key of [
    "workItems",
    "decisions",
    "assumptions",
    "risks",
    "intakes",
    "orientations",
    "claims",
    "receipts",
  ]) {
    if (!Array.isArray(o[key])) problems.push(key);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid or missing v4 fields: ${problems.join(", ")}.`);
  }

  return o as unknown as ProjectStateV4;
}
