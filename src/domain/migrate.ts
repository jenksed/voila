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

const V6_ADDITIONS: MigrationAddition[] = [
  {
    name: "operationDefinitions.effectProfile",
    detail: "closed effect vocabulary; declared on the definition, never inferred",
  },
  {
    name: "operationDefinitions.authorityRequirement",
    detail: "closed authority vocabulary; resolved before execution against canonical sources",
  },
  {
    name: "operationDefinitions.authoritySourceRef",
    detail: "reference to the canonical decision or definition granting the authority",
  },
  {
    name: "operationRuns.admission",
    detail: "immutable record of the admission decision that authorized or reused the run",
  },
];

/** Migration steps required to reach the current schema version from `fromVersion`. */
export function migrationPlan(fromVersion: number): {
  steps: Array<{ from: number; to: number }>;
  additions: MigrationAddition[];
} | null {
  if (fromVersion === SCHEMA_VERSION) return { steps: [], additions: [] };
  if (fromVersion === 5) {
    return { steps: [{ from: 5, to: 6 }], additions: V6_ADDITIONS };
  }
  if (fromVersion === 4) {
    return {
      steps: [
        { from: 4, to: 5 },
        { from: 5, to: 6 },
      ],
      additions: [...V5_ADDITIONS, ...V6_ADDITIONS],
    };
  }
  if (fromVersion === 3) {
    return {
      steps: [
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 5, to: 6 },
      ],
      additions: [...V4_ADDITIONS, ...V5_ADDITIONS, ...V6_ADDITIONS],
    };
  }
  if (fromVersion === 2) {
    return {
      steps: [
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 5, to: 6 },
      ],
      additions: [...V3_ADDITIONS, ...V4_ADDITIONS, ...V5_ADDITIONS, ...V6_ADDITIONS],
    };
  }
  if (fromVersion === 1) {
    return {
      steps: [
        { from: 1, to: 2 },
        { from: 2, to: 3 },
        { from: 3, to: 4 },
        { from: 4, to: 5 },
        { from: 5, to: 6 },
      ],
      additions: [
        ...V2_ADDITIONS,
        ...V3_ADDITIONS,
        ...V4_ADDITIONS,
        ...V5_ADDITIONS,
        ...V6_ADDITIONS,
      ],
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
export function migrateV4ToV5(v4: ProjectStateV4): ProjectStateStateV5 {
  return {
    schemaVersion: 5,
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
 * v5 -> v6: introduce the closed effect-profile and authority-requirement vocabularies on
 * operation definitions, and the immutable admission record on operation runs. Pre-policy-kernel
 * runs are preserved with `admission.legacy` so their admission provenance stays honest.
 *
 * No authority is invented. Definitions whose v5 fields do not identify a trustworthy authority
 * source (decision or accepted operation definition) are migrated with
 * `authorityRequirement: "not_authorized"` so the admission kernel can refuse them until DEC-22
 * (or any successor decision) references them.
 */
import type { OperationAdmission, OperationDefinition, OperationRun } from "./types.ts";

export interface ProjectStateV5 {
  schemaVersion: number;
  projectId: string;
  displayName: string;
  phase: string;
  health: string;
  nextAction: string;
  nextActionRationale?: string;
  focusWorkItemId: string | null;
  sequences: ProjectStateV4["sequences"] & {
    operationDefinition: number;
    operationRun: number;
  };
  workItems: unknown[];
  decisions: unknown[];
  assumptions: unknown[];
  risks: unknown[];
  intakes: unknown[];
  orientations: unknown[];
  claims: unknown[];
  receipts: unknown[];
  operationDefinitions: unknown[];
  operationRuns: unknown[];
  currentIntakeId?: string;
  currentOrientationId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export function validateProjectStateV5(raw: unknown): ProjectStateV5 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("v5 state must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;
  if (o.schemaVersion !== 5) {
    throw new Error(`Expected schemaVersion 5, found ${String(o.schemaVersion)}.`);
  }
  return raw as ProjectStateV5;
}

const DEC22_REF: OperationDefinition["authoritySourceRef"] = {
  kind: "decision",
  id: "DEC-22",
};

const POLICY_VERSION_VALUE = 1;

const R2A_EFFECTS: OperationDefinition["effectProfile"] = ["local_read", "bounded_temporary_write"];

function v5DefinitionToV6(raw: unknown, now: string): OperationDefinition {
  const def = raw as Partial<OperationDefinition> & { riskClassification?: unknown };
  // Only the registered r2a.state-store-tests definition is admitted to v6. Any other
  // v5-era definition is migrated as `not_authorized` so the policy kernel can refuse
  // it until a successor decision references it.
  const r2a = def.id === "r2a.state-store-tests";
  return {
    ...(def as OperationDefinition),
    effectProfile: r2a ? R2A_EFFECTS : [],
    authorityRequirement: r2a ? "accepted_project_operation" : "not_authorized",
    ...(r2a ? { authoritySourceRef: DEC22_REF } : {}),
    updatedAt: now,
  } as OperationDefinition;
}

function v5RunToV6(raw: unknown, now: string): OperationRun {
  const run = raw as OperationRun & { cwdRef?: unknown };
  // The migration must never fabricate an admission decision for a run that predates the
  // policy kernel. Mark its admission provenance as legacy so the supervisor can refuse to
  // rely on it for current authority.
  const admission: OperationAdmission = {
    result: "allow",
    ruleId: "ADMIT.OPERATIONS.MIGRATION_LEGACY",
    policyVersion: POLICY_VERSION_VALUE,
    ...(run.ownership?.workItemId
      ? {
          authorityReference: {
            kind: "decision" as const,
            id: "DEC-22",
          },
        }
      : {}),
    decidedAt: now,
    legacy: {
      reason: "pre_policy_kernel",
      note:
        "Run was admitted by the pre-v6 supervisor. Authority provenance is preserved " +
        "for traceability but is not relied on by the v6 policy kernel.",
    },
  };
  return {
    ...run,
    // One pre-v6 draft runtime recorded `cwdRef: "."` instead of repositoryRoot. Preserve the
    // already-recorded absolute worktree identity as the repository root rather than inventing a
    // path or making the migrated state unloadable.
    ...(!run.repositoryRoot && typeof run.worktreeIdentity === "string"
      ? { repositoryRoot: run.worktreeIdentity }
      : {}),
    admission,
  };
}

export function migrateV5ToV6(v5: ProjectStateV5): ProjectState {
  const now = new Date().toISOString();
  const definitions = (v5.operationDefinitions ?? []).map((d) => v5DefinitionToV6(d, now));
  const runs = (v5.operationRuns ?? []).map((r) => v5RunToV6(r, now));
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: v5.projectId,
    displayName: v5.displayName,
    phase: v5.phase as ProjectState["phase"],
    health: v5.health as ProjectState["health"],
    nextAction: v5.nextAction,
    ...(v5.nextActionRationale !== undefined
      ? { nextActionRationale: v5.nextActionRationale }
      : {}),
    focusWorkItemId: v5.focusWorkItemId,
    sequences: v5.sequences,
    workItems: v5.workItems as ProjectState["workItems"],
    decisions: v5.decisions as ProjectState["decisions"],
    assumptions: v5.assumptions as ProjectState["assumptions"],
    risks: v5.risks as ProjectState["risks"],
    intakes: v5.intakes as ProjectState["intakes"],
    orientations: v5.orientations as ProjectState["orientations"],
    claims: v5.claims as ProjectState["claims"],
    receipts: v5.receipts as ProjectState["receipts"],
    operationDefinitions: definitions as OperationDefinition[],
    operationRuns: runs as OperationRun[],
    ...(v5.currentIntakeId !== undefined ? { currentIntakeId: v5.currentIntakeId } : {}),
    ...(v5.currentOrientationId !== undefined
      ? { currentOrientationId: v5.currentOrientationId }
      : {}),
    createdAt: v5.createdAt,
    updatedAt: v5.updatedAt,
    revision: v5.revision,
  };
}

// Local alias kept to avoid touching every older migration call site below.
type ProjectStateStateV5 = ProjectStateV5 & {
  operationDefinitions?: unknown[];
  operationRuns?: unknown[];
};

/**
 * Run the full migration chain from an untrusted raw value to a current-version candidate.
 * Validates each source step; throws on any malformed source. Performs no I/O.
 */
export function migrateToCurrent(raw: unknown, fromVersion: number): ProjectState {
  if (fromVersion === 1) {
    const v2 = validateProjectStateV2(migrateV1ToV2(validateProjectStateV1(raw)));
    const v3 = validateProjectStateV3(migrateV2ToV3(v2));
    const v4 = migrateV3ToV4(v3);
    return migrateV5ToV6(migrateV4ToV5(validateProjectStateV4(v4)));
  }
  if (fromVersion === 2) {
    const v3 = validateProjectStateV3(migrateV2ToV3(validateProjectStateV2(raw)));
    const v4 = migrateV3ToV4(v3);
    return migrateV5ToV6(migrateV4ToV5(validateProjectStateV4(v4)));
  }
  if (fromVersion === 3) {
    const v4 = migrateV3ToV4(validateProjectStateV3(raw));
    return migrateV5ToV6(migrateV4ToV5(validateProjectStateV4(v4)));
  }
  if (fromVersion === 4) {
    const v5 = migrateV4ToV5(validateProjectStateV4(raw));
    return migrateV5ToV6(validateProjectStateV5(v5));
  }
  if (fromVersion === 5) {
    return migrateV5ToV6(validateProjectStateV5(raw));
  }
  throw new Error(`No migration path from schema version ${fromVersion}.`);
}
