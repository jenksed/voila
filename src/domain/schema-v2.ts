// Schema version 2 (Packet 2) shape, kept readable for explicit migration to v3.
// v2 is never a valid *current* state under Packet 3; it is only a migration source.

import { HEALTHS, PHASES } from "./types.ts";

export const SCHEMA_VERSION_V2 = 2;

export interface SequencesV2 {
  workItem: number;
  decision: number;
  assumption: number;
  risk: number;
}

export interface ProjectStateV2 {
  schemaVersion: number;
  projectId: string;
  displayName: string;
  phase: string;
  health: string;
  nextAction: string;
  nextActionRationale?: string;
  focusWorkItemId: string | null;
  sequences: SequencesV2;
  workItems: unknown[];
  decisions: unknown[];
  assumptions: unknown[];
  risks: unknown[];
  createdAt: string;
  updatedAt: string;
  revision: number;
}

/**
 * Structurally validate a parsed value as v2 (for migration). Entity-level validation happens when
 * the derived v3 candidate is validated, so a malformed v2 is still refused before any write.
 */
export function validateProjectStateV2(raw: unknown): ProjectStateV2 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("v2 state must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION_V2) {
    throw new Error(`Expected schemaVersion 2, found ${String(o.schemaVersion)}.`);
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
  if (o.nextActionRationale !== undefined && typeof o.nextActionRationale !== "string") {
    problems.push("nextActionRationale");
  }
  const seq = o.sequences;
  if (typeof seq !== "object" || seq === null) {
    problems.push("sequences");
  } else {
    const s = seq as Record<string, unknown>;
    for (const key of ["workItem", "decision", "assumption", "risk"]) {
      if (typeof s[key] !== "number" || !Number.isInteger(s[key]) || (s[key] as number) < 1) {
        problems.push(`sequences.${key}`);
      }
    }
  }
  for (const key of ["workItems", "decisions", "assumptions", "risks"]) {
    if (!Array.isArray(o[key])) problems.push(key);
  }
  if (problems.length > 0) {
    throw new Error(`Invalid or missing v2 fields: ${problems.join(", ")}.`);
  }

  return o as unknown as ProjectStateV2;
}
