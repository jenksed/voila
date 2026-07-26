// Deterministic default state and project-name derivation. Pure domain.

import { basename, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectState } from "./types.ts";
import { SCHEMA_VERSION } from "./types.ts";

/** Derive a reasonable project display name from the repository directory name. */
export function deriveDisplayName(root: string): string {
  const name = basename(resolve(root)).trim();
  return name.length > 0 ? name : "newfang-project";
}

export interface CreateInitialStateInput {
  displayName: string;
  /** Override for deterministic tests. */
  now?: string;
  /** Override for deterministic tests. */
  projectId?: string;
}

/**
 * Build the initial canonical state. All non-identity fields are deterministic
 * so the default is testable; `projectId` and timestamps are the only variable parts
 * unless overridden.
 */
export function createInitialState(input: CreateInitialStateInput): ProjectState {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: input.projectId ?? randomUUID(),
    displayName: input.displayName,
    phase: "research",
    health: "unknown",
    nextAction: "Define the first work boundary, then run /newfang status.",
    focusWorkItemId: null,
    sequences: {
      workItem: 1,
      decision: 1,
      assumption: 1,
      risk: 1,
      intake: 1,
      orientation: 1,
      claim: 1,
      receipt: 1,
    },
    workItems: [],
    decisions: [],
    assumptions: [],
    risks: [],
    intakes: [],
    orientations: [],
    claims: [],
    receipts: [],
    createdAt: now,
    updatedAt: now,
    revision: 1,
  };
}
