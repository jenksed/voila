// Schema version 1 (Packet 1) shape and validator, kept read-only for explicit migration.
// v1 is never a valid *current* state under Packet 2; it is only readable for migration.

import { HEALTHS, PHASES } from "./types.ts";

export const SCHEMA_VERSION_V1 = 1;

export interface ProjectStateV1 {
  schemaVersion: number;
  projectId: string;
  displayName: string;
  phase: string;
  health: string;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

/** Validate a parsed value as a well-formed v1 state (for migration). Throws Error on problems. */
export function validateProjectStateV1(raw: unknown): ProjectStateV1 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("v1 state must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== SCHEMA_VERSION_V1) {
    throw new Error(`Expected schemaVersion 1, found ${String(o.schemaVersion)}.`);
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
  if (problems.length > 0) {
    throw new Error(`Invalid or missing v1 fields: ${problems.join(", ")}.`);
  }
  return {
    schemaVersion: SCHEMA_VERSION_V1,
    projectId: o.projectId as string,
    displayName: o.displayName as string,
    phase: o.phase as string,
    health: o.health as string,
    nextAction: o.nextAction as string,
    createdAt: o.createdAt as string,
    updatedAt: o.updatedAt as string,
    revision: o.revision as number,
  };
}
