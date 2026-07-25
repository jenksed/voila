// Pure schema migration transforms and plans. No I/O.
// Chain: v1 (Packet 1) -> v2 (Packet 2 operations) -> v3 (Packet 3 intake + orientation).

import type { ProjectState } from "./types.ts";
import type { ProjectStateV1 } from "./schema-v1.ts";
import { validateProjectStateV1 } from "./schema-v1.ts";
import type { ProjectStateV2 } from "./schema-v2.ts";
import { validateProjectStateV2 } from "./schema-v2.ts";
import { SCHEMA_VERSION } from "./types.ts";

export interface MigrationAddition {
  name: string;
  detail: string;
}

const V2_ADDITIONS: MigrationAddition[] = [
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

const V3_ADDITIONS: MigrationAddition[] = [
  { name: "intakes", detail: "compact intake metadata records (initially empty)" },
  { name: "orientations", detail: "compact repository-orientation records (initially empty)" },
  { name: "currentIntakeId", detail: "pointer to the in-flight intake (initially none)" },
  { name: "currentOrientationId", detail: "pointer to the current orientation (initially none)" },
  {
    name: "sequences.intake / sequences.orientation",
    detail: "monotonic INT-n and ORI-n counters (start at 1)",
  },
];

/** Migration steps required to reach the current schema version from `fromVersion`. */
export function migrationPlan(fromVersion: number): {
  steps: Array<{ from: number; to: number }>;
  additions: MigrationAddition[];
} | null {
  if (fromVersion === SCHEMA_VERSION) return { steps: [], additions: [] };
  if (fromVersion === 2) return { steps: [{ from: 2, to: 3 }], additions: V3_ADDITIONS };
  if (fromVersion === 1) {
    return {
      steps: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
      ],
      additions: [...V2_ADDITIONS, ...V3_ADDITIONS],
    };
  }
  return null;
}

/** v1 -> v2: initialize the project-operations collections. Preserves identity and existing fields. */
export function migrateV1ToV2(v1: ProjectStateV1): ProjectStateV2 {
  return {
    schemaVersion: 2,
    projectId: v1.projectId,
    displayName: v1.displayName,
    phase: v1.phase,
    health: v1.health,
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

/** v2 -> v3: initialize intake and orientation metadata. Preserves everything already present. */
export function migrateV2ToV3(v2: ProjectStateV2): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: v2.projectId,
    displayName: v2.displayName,
    phase: v2.phase as ProjectState["phase"],
    health: v2.health as ProjectState["health"],
    nextAction: v2.nextAction,
    ...(v2.nextActionRationale !== undefined
      ? { nextActionRationale: v2.nextActionRationale }
      : {}),
    focusWorkItemId: v2.focusWorkItemId,
    sequences: { ...v2.sequences, intake: 1, orientation: 1 },
    workItems: v2.workItems as ProjectState["workItems"],
    decisions: v2.decisions as ProjectState["decisions"],
    assumptions: v2.assumptions as ProjectState["assumptions"],
    risks: v2.risks as ProjectState["risks"],
    intakes: [],
    orientations: [],
    createdAt: v2.createdAt,
    updatedAt: v2.updatedAt,
    revision: v2.revision,
  };
}

/**
 * Run the full migration chain from an untrusted raw value to a v3 candidate.
 * Validates each source step; throws on any malformed source. Performs no I/O.
 */
export function migrateToCurrent(raw: unknown, fromVersion: number): ProjectState {
  if (fromVersion === 1) {
    return migrateV2ToV3(validateProjectStateV2(migrateV1ToV2(validateProjectStateV1(raw))));
  }
  if (fromVersion === 2) {
    return migrateV2ToV3(validateProjectStateV2(raw));
  }
  throw new Error(`No migration path from schema version ${fromVersion}.`);
}
