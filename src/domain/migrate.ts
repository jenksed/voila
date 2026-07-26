// Pure schema migration transforms and plans. No I/O.
// Chain: v1 (Packet 1) -> v2 (Packet 2 operations) -> v3 (Packet 3 intake + orientation)
//        -> v4 (Packet 4 claims + receipts + protected completion)
//        -> v5 (R2A finite-operation supervision: operation definitions, runs, lifecycle).

import type { ProjectState } from "./types.ts";
import type { ProjectStateV1 } from "./schema-v1.ts";
import { validateProjectStateV1 } from "./schema-v1.ts";
import type { ProjectStateV2 } from "./schema-v2.ts";
import { validateProjectStateV2 } from "./schema-v2.ts";
import type { ProjectStateV3 } from "./schema-v3.ts";
import { validateProjectStateV3 } from "./schema-v3.ts";
import type { ProjectStateV4 } from "./schema-v4.ts";
import { validateProjectStateV4 } from "./schema-v4.ts";
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

const V4_ADDITIONS: MigrationAddition[] = [
  { name: "claims", detail: "claims about work items; support is derived, never stored (empty)" },
  {
    name: "receipts",
    detail: "compact verification-receipt metadata; artifacts live in .voila/receipts/ (empty)",
  },
  {
    name: "workItems[].requiredClaimIds",
    detail:
      "proof requirements per work item; existing items default to [] and therefore cannot be completed until claims are attached",
  },
  {
    name: "sequences.claim / sequences.receipt",
    detail: "monotonic CLM-n and RCP-n counters (start at 1)",
  },
];

const V5_ADDITIONS: MigrationAddition[] = [
  {
    name: "operationDefinitions",
    detail: "explicit accepted operation definitions; never discovered (initially empty)",
  },
  {
    name: "operationRuns",
    detail:
      "canonical metadata for finite-operation runs; output content lives in .voila/operations/",
  },
  {
    name: "sequences.operationDefinition / sequences.operationRun",
    detail: "monotonic OP-n and RUN-n counters (start at 1)",
  },
];

/** Migration steps required to reach the current schema version from `fromVersion`. */
export function migrationPlan(fromVersion: number): {
  steps: Array<{ from: number; to: number }>;
  additions: MigrationAddition[];
} | null {
  if (fromVersion === SCHEMA_VERSION) return { steps: [], additions: [] };
  if (fromVersion === 4) {
    return { steps: [{ from: 4, to: 5 }], additions: V5_ADDITIONS };
  }
  if (fromVersion === 3) {
    return {
      steps: [
        { from: 3, to: 4 },
        { from: 4, to: 5 },
      ],
      additions: [...V4_ADDITIONS, ...V5_ADDITIONS],
    };
  }
  if (fromVersion === 2) {
    return {
      steps: [
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
      ],
      additions: [...V3_ADDITIONS, ...V4_ADDITIONS, ...V5_ADDITIONS],
    };
  }
  if (fromVersion === 1) {
    return {
      steps: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
      ],
      additions: [...V2_ADDITIONS, ...V3_ADDITIONS, ...V4_ADDITIONS, ...V5_ADDITIONS],
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
export function migrateV2ToV3(v2: ProjectStateV2): ProjectStateV3 {
  return {
    schemaVersion: 3,
    projectId: v2.projectId,
    displayName: v2.displayName,
    phase: v2.phase,
    health: v2.health,
    nextAction: v2.nextAction,
    ...(v2.nextActionRationale !== undefined
      ? { nextActionRationale: v2.nextActionRationale }
      : {}),
    focusWorkItemId: v2.focusWorkItemId,
    sequences: { ...v2.sequences, intake: 1, orientation: 1 },
    workItems: v2.workItems,
    decisions: v2.decisions,
    assumptions: v2.assumptions,
    risks: v2.risks,
    intakes: [],
    orientations: [],
    createdAt: v2.createdAt,
    updatedAt: v2.updatedAt,
    revision: v2.revision,
  };
}

/**
 * v3 -> v4: introduce claims, verification receipts, and per-work-item proof requirements.
 * Existing work items default to `requiredClaimIds: []`, which means they cannot be completed until
 * claims are attached deliberately — the migration never invents proof.
 */
export function migrateV3ToV4(v3: ProjectStateV3): ProjectStateV4 {
  const workItems = v3.workItems.map((raw) => {
    if (typeof raw !== "object" || raw === null) return raw;
    const item = raw as Record<string, unknown>;
    return {
      ...item,
      requiredClaimIds: Array.isArray(item.requiredClaimIds) ? item.requiredClaimIds : [],
    };
  });

  return {
    schemaVersion: 4,
    projectId: v3.projectId,
    displayName: v3.displayName,
    phase: v3.phase,
    health: v3.health,
    nextAction: v3.nextAction,
    ...(v3.nextActionRationale !== undefined
      ? { nextActionRationale: v3.nextActionRationale }
      : {}),
    focusWorkItemId: v3.focusWorkItemId,
    sequences: { ...v3.sequences, claim: 1, receipt: 1 },
    workItems,
    decisions: v3.decisions,
    assumptions: v3.assumptions,
    risks: v3.risks,
    intakes: v3.intakes,
    orientations: v3.orientations,
    claims: [],
    receipts: [],
    ...(v3.currentIntakeId !== undefined ? { currentIntakeId: v3.currentIntakeId } : {}),
    ...(v3.currentOrientationId !== undefined
      ? { currentOrientationId: v3.currentOrientationId }
      : {}),
    createdAt: v3.createdAt,
    updatedAt: v3.updatedAt,
    revision: v3.revision,
  };
}

/**
 * v4 -> v5: introduce operation definitions and runs for R2A. No retroactive definitions or runs are
 * invented — the migration leaves both collections empty. The supervisor registers the first
 * accepted operation at runtime when the registry initializes.
 */
export function migrateV4ToV5(v4: ProjectStateV4): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: v4.projectId,
    displayName: v4.displayName,
    phase: v4.phase as ProjectState["phase"],
    health: v4.health as ProjectState["health"],
    nextAction: v4.nextAction,
    ...(v4.nextActionRationale !== undefined
      ? { nextActionRationale: v4.nextActionRationale }
      : {}),
    focusWorkItemId: v4.focusWorkItemId,
    sequences: { ...v4.sequences, operationDefinition: 1, operationRun: 1 },
    workItems: v4.workItems as ProjectState["workItems"],
    decisions: v4.decisions as ProjectState["decisions"],
    assumptions: v4.assumptions as ProjectState["assumptions"],
    risks: v4.risks as ProjectState["risks"],
    intakes: v4.intakes as ProjectState["intakes"],
    orientations: v4.orientations as ProjectState["orientations"],
    claims: v4.claims as ProjectState["claims"],
    receipts: v4.receipts as ProjectState["receipts"],
    operationDefinitions: [],
    operationRuns: [],
    ...(v4.currentIntakeId !== undefined ? { currentIntakeId: v4.currentIntakeId } : {}),
    ...(v4.currentOrientationId !== undefined
      ? { currentOrientationId: v4.currentOrientationId }
      : {}),
    createdAt: v4.createdAt,
    updatedAt: v4.updatedAt,
    revision: v4.revision,
  };
}

/**
 * Run the full migration chain from an untrusted raw value to a current-version candidate.
 * Validates each source step; throws on any malformed source. Performs no I/O.
 */
export function migrateToCurrent(raw: unknown, fromVersion: number): ProjectState {
  if (fromVersion === 1) {
    const v2 = validateProjectStateV2(migrateV1ToV2(validateProjectStateV1(raw)));
    const v3 = validateProjectStateV3(migrateV2ToV3(v2));
    return migrateV4ToV5(migrateV3ToV4(v3));
  }
  if (fromVersion === 2) {
    const v3 = validateProjectStateV3(migrateV2ToV3(validateProjectStateV2(raw)));
    return migrateV4ToV5(migrateV3ToV4(v3));
  }
  if (fromVersion === 3) {
    return migrateV4ToV5(migrateV3ToV4(validateProjectStateV3(raw)));
  }
  if (fromVersion === 4) {
    return migrateV4ToV5(validateProjectStateV4(raw));
  }
  throw new Error(`No migration path from schema version ${fromVersion}.`);
}
