// Pure v1 -> v2 migration transform. No I/O.

import type { ProjectState } from "./types.ts";
import type { ProjectStateV1 } from "./schema-v1.ts";
import { SCHEMA_VERSION } from "./types.ts";

export interface MigrationAddition {
  name: string;
  detail: string;
}

/** Human-readable description of what v2 adds over v1. */
export function migrationAdditions(): MigrationAddition[] {
  return [
    {
      name: "focusWorkItemId",
      detail: "focus pointer: the work item receiving attention (initially none)",
    },
    {
      name: "nextActionRationale",
      detail: "optional Steward explanation of why the next action is justified",
    },
    { name: "sequences", detail: "monotonic ID counters (workItem, decision, assumption, risk)" },
    { name: "workItems", detail: "backlog of outcomes, tasks, and defects (initially empty)" },
    { name: "decisions", detail: "operational decision records (initially empty)" },
    { name: "assumptions", detail: "assumptions (initially empty)" },
    { name: "risks", detail: "risks (initially empty)" },
  ];
}

/**
 * Build a complete v2 candidate from a validated v1 state. Preserves identity and existing fields;
 * initializes the new collections empty. `updatedAt` and `revision` are finalized by the caller.
 */
export function migrateV1ToV2(v1: ProjectStateV1): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: v1.projectId,
    displayName: v1.displayName,
    phase: v1.phase as ProjectState["phase"],
    health: v1.health as ProjectState["health"],
    nextAction: v1.nextAction,
    focusWorkItemId: null,
    sequences: { workItem: 1, decision: 1, assumption: 1, risk: 1 },
    workItems: [],
    decisions: [],
    assumptions: [],
    risks: [],
    createdAt: v1.createdAt,
    updatedAt: v1.updatedAt,
    revision: v1.revision,
  };
}
