// Canonical `.voila/` state store (current schema): init, load, validate, immutable update,
// append-only events, generated view, and migration primitives. Pure Node I/O — no Pi.
//
// Invariants (ADR-0003):
// - project.json is the authoritative snapshot; writes are atomic (temp + rename).
// - A successful canonical write happens BEFORE the generated view / UI.
// - events.jsonl is append-only history and never authoritative current state.
// - Version 1 is never a valid current state; it must be migrated explicitly (see state/migration.ts).

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type {
  Assumption,
  Claim,
  Decision,
  IntakeRecord,
  OperationDefinition,
  OperationLifecycleState,
  OperationRun,
  OperationDeliveryState,
  OperationFinalState,
  OrientationRecord,
  ProjectState,
  Risk,
  Sequences,
  VerificationReceiptRecord,
  WorkItem,
  WorkingDirectoryPolicy,
} from "../domain/types.ts";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCES,
  DECISION_STATUSES,
  HEALTHS,
  IMPACTS,
  INTAKE_SOURCE_TYPES,
  INTAKE_STATUSES,
  LIKELIHOODS,
  OPERATION_LIFECYCLE_STATES,
  OPERATION_FINAL_STATES,
  OPERATION_RISK_CLASSES,
  OPERATION_DELIVERY_STATES,
  ORIENTATION_STATUSES,
  PHASES,
  RECEIPT_RESULTS,
  RISK_STATUSES,
  SCHEMA_VERSION,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
  WORKING_DIRECTORY_POLICIES,
} from "../domain/types.ts";
import { createInitialState } from "../domain/defaults.ts";
import { renderStatusView } from "../domain/status.ts";
import { migrationPlan } from "../domain/migrate.ts";
import { statePaths } from "./paths.ts";
import { assertUsableStateDirectory } from "./legacy.ts";
import {
  MigrationRequiredError,
  StateExistsError,
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "./errors.ts";

export interface VoilaEvent {
  type: string;
  ts?: string;
  [key: string]: unknown;
}

function serializeState(state: ProjectState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** Deep-freeze an object so the update reducer cannot mutate its input. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export function stateExists(root: string): boolean {
  return existsSync(statePaths(root).projectJson);
}

// --- Validation helpers ---

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function inEnum(v: unknown, values: readonly string[]): boolean {
  return typeof v === "string" && values.includes(v);
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateTimestamps(o: Record<string, unknown>, prefix: string, problems: string[]): void {
  if (!isNonEmptyString(o.createdAt)) problems.push(`${prefix}.createdAt`);
  if (!isNonEmptyString(o.updatedAt)) problems.push(`${prefix}.updatedAt`);
}

function validateWorkItem(raw: unknown, i: number, problems: string[]): void {
  const p = `workItems[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!inEnum(o.kind, WORK_ITEM_KINDS)) problems.push(`${p}.kind`);
  if (!isNonEmptyString(o.title)) problems.push(`${p}.title`);
  if (o.description !== undefined && typeof o.description !== "string")
    problems.push(`${p}.description`);
  if (!inEnum(o.status, WORK_ITEM_STATUSES)) problems.push(`${p}.status`);
  if (!inEnum(o.priority, WORK_ITEM_PRIORITIES)) problems.push(`${p}.priority`);
  if (!isStringArray(o.acceptanceCriteria)) problems.push(`${p}.acceptanceCriteria`);
  if (!isStringArray(o.dependsOn)) problems.push(`${p}.dependsOn`);
  if (!isStringArray(o.requiredClaimIds)) problems.push(`${p}.requiredClaimIds`);
  if (o.blockedReason !== undefined && typeof o.blockedReason !== "string")
    problems.push(`${p}.blockedReason`);
  validateTimestamps(o, p, problems);
}

function validateClaim(raw: unknown, i: number, problems: string[]): void {
  const p = `claims[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.workItemId)) problems.push(`${p}.workItemId`);
  if (!isNonEmptyString(o.statement)) problems.push(`${p}.statement`);
  if (!inEnum(o.confidence, CONFIDENCES)) problems.push(`${p}.confidence`);
  if (!isStringArray(o.coveredAcceptanceCriteria)) problems.push(`${p}.coveredAcceptanceCriteria`);
  if (!isStringArray(o.knownLimitations)) problems.push(`${p}.knownLimitations`);
  if (!isStringArray(o.receiptIds)) problems.push(`${p}.receiptIds`);
  validateTimestamps(o, p, problems);
}

function validateReceipt(raw: unknown, i: number, problems: string[]): void {
  const p = `receipts[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.claimId)) problems.push(`${p}.claimId`);
  if (!inEnum(o.result, RECEIPT_RESULTS)) problems.push(`${p}.result`);
  if (!isNonEmptyString(o.artifactRef)) problems.push(`${p}.artifactRef`);
  if (!isNonEmptyString(o.executable)) problems.push(`${p}.executable`);
  if (!isStringArray(o.args)) problems.push(`${p}.args`);
  if (!isNonEmptyString(o.cwdRef)) problems.push(`${p}.cwdRef`);
  if (o.exitCode !== undefined && !Number.isInteger(o.exitCode)) problems.push(`${p}.exitCode`);
  if (!isNonEmptyString(o.startedAt)) problems.push(`${p}.startedAt`);
  if (!isNonEmptyString(o.finishedAt)) problems.push(`${p}.finishedAt`);
  if (
    typeof o.repositoryFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(o.repositoryFingerprint)
  )
    problems.push(`${p}.repositoryFingerprint`);
  if (o.gitHead !== undefined && !isNonEmptyString(o.gitHead)) problems.push(`${p}.gitHead`);
  if (typeof o.outputTruncated !== "boolean") problems.push(`${p}.outputTruncated`);
}

function validateDecision(raw: unknown, i: number, problems: string[]): void {
  const p = `decisions[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.title)) problems.push(`${p}.title`);
  if (!isNonEmptyString(o.decision)) problems.push(`${p}.decision`);
  if (!isNonEmptyString(o.rationale)) problems.push(`${p}.rationale`);
  if (!inEnum(o.status, DECISION_STATUSES)) problems.push(`${p}.status`);
  if (o.supersededBy !== undefined && typeof o.supersededBy !== "string")
    problems.push(`${p}.supersededBy`);
  validateTimestamps(o, p, problems);
}

function validateAssumption(raw: unknown, i: number, problems: string[]): void {
  const p = `assumptions[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.statement)) problems.push(`${p}.statement`);
  if (!inEnum(o.confidence, CONFIDENCES)) problems.push(`${p}.confidence`);
  if (!inEnum(o.status, ASSUMPTION_STATUSES)) problems.push(`${p}.status`);
  if (o.note !== undefined && typeof o.note !== "string") problems.push(`${p}.note`);
  validateTimestamps(o, p, problems);
}

function validateRisk(raw: unknown, i: number, problems: string[]): void {
  const p = `risks[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.statement)) problems.push(`${p}.statement`);
  if (!inEnum(o.likelihood, LIKELIHOODS)) problems.push(`${p}.likelihood`);
  if (!inEnum(o.impact, IMPACTS)) problems.push(`${p}.impact`);
  if (!inEnum(o.status, RISK_STATUSES)) problems.push(`${p}.status`);
  if (o.mitigation !== undefined && typeof o.mitigation !== "string")
    problems.push(`${p}.mitigation`);
  if (o.linkedWorkItems !== undefined && !isStringArray(o.linkedWorkItems))
    problems.push(`${p}.linkedWorkItems`);
  validateTimestamps(o, p, problems);
}

function validateIntake(raw: unknown, i: number, problems: string[]): void {
  const p = `intakes[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.title)) problems.push(`${p}.title`);
  if (!inEnum(o.sourceType, INTAKE_SOURCE_TYPES)) problems.push(`${p}.sourceType`);
  if (!isNonEmptyString(o.sourceRef)) problems.push(`${p}.sourceRef`);
  if (typeof o.sourceSha256 !== "string" || !/^[a-f0-9]{64}$/.test(o.sourceSha256)) {
    problems.push(`${p}.sourceSha256`);
  }
  if (!inEnum(o.status, INTAKE_STATUSES)) problems.push(`${p}.status`);
  if (
    typeof o.draftRevision !== "number" ||
    !Number.isInteger(o.draftRevision) ||
    o.draftRevision < 0
  ) {
    problems.push(`${p}.draftRevision`);
  }
  if (o.acceptedAt !== undefined && !isNonEmptyString(o.acceptedAt))
    problems.push(`${p}.acceptedAt`);
  validateTimestamps(o, p, problems);
}

function validateOrientation(raw: unknown, i: number, problems: string[]): void {
  const p = `orientations[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.artifactRef)) problems.push(`${p}.artifactRef`);
  if (o.repositoryHead !== undefined && !isNonEmptyString(o.repositoryHead)) {
    problems.push(`${p}.repositoryHead`);
  }
  if (!inEnum(o.status, ORIENTATION_STATUSES)) problems.push(`${p}.status`);
  validateTimestamps(o, p, problems);
}

function validateOperationDefinition(raw: unknown, i: number, problems: string[]): void {
  const p = `operationDefinitions[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.purpose)) problems.push(`${p}.purpose`);
  if (!inEnum(o.kind, ["finite"])) problems.push(`${p}.kind`);
  if (!isNonEmptyString(o.executable)) problems.push(`${p}.executable`);
  if (!isStringArray(o.args)) problems.push(`${p}.args`);
  if (!inEnum(o.workingDirectory, WORKING_DIRECTORY_POLICIES))
    problems.push(`${p}.workingDirectory`);
  const env = o.environmentPolicy;
  if (typeof env !== "object" || env === null) {
    problems.push(`${p}.environmentPolicy`);
  } else {
    const e = env as Record<string, unknown>;
    if (!inEnum(e.kind, ["inherit", "isolate"])) problems.push(`${p}.environmentPolicy.kind`);
    if (e.recordedVariableNames !== undefined && !isStringArray(e.recordedVariableNames))
      problems.push(`${p}.environmentPolicy.recordedVariableNames`);
  }
  const risk = o.riskClassification;
  if (typeof risk !== "object" || risk === null) {
    problems.push(`${p}.riskClassification`);
  } else {
    const r = risk as Record<string, unknown>;
    if (!inEnum(r.riskClass, OPERATION_RISK_CLASSES))
      problems.push(`${p}.riskClassification.riskClass`);
    for (const f of [
      "impact",
      "externalEffects",
      "privilegesRequired",
      "trustSource",
      "concurrency",
    ]) {
      if (!isNonEmptyString(r[f])) problems.push(`${p}.riskClassification.${f}`);
    }
    if (typeof r.networkRequired !== "boolean")
      problems.push(`${p}.riskClassification.networkRequired`);
    if (typeof r.interactive !== "boolean") problems.push(`${p}.riskClassification.interactive`);
    if (typeof r.reversible !== "boolean") problems.push(`${p}.riskClassification.reversible`);
  }
  const success = o.successContract;
  if (typeof success !== "object" || success === null) {
    problems.push(`${p}.successContract`);
  } else {
    const s = success as Record<string, unknown>;
    if (!Number.isInteger(s.exitCode)) problems.push(`${p}.successContract.exitCode`);
    if (!isNonEmptyString(s.description)) problems.push(`${p}.successContract.description`);
  }
  const timeouts = o.timeoutContract;
  if (typeof timeouts !== "object" || timeouts === null) {
    problems.push(`${p}.timeoutContract`);
  } else {
    const t = timeouts as Record<string, unknown>;
    for (const f of ["startupMs", "totalMs", "gracefulMs", "forcedMs"]) {
      if (typeof t[f] !== "number" || !Number.isInteger(t[f]) || (t[f] as number) < 1) {
        problems.push(`${p}.timeoutContract.${f}`);
      }
    }
  }
  const cancel = o.cancellationContract;
  if (typeof cancel !== "object" || cancel === null) {
    problems.push(`${p}.cancellationContract`);
  } else {
    const c = cancel as Record<string, unknown>;
    if (!inEnum(c.gracefulSignal, ["SIGTERM", "SIGINT"]))
      problems.push(`${p}.cancellationContract.gracefulSignal`);
    if (!inEnum(c.escalationSignal, ["SIGKILL", "SIGABRT"]))
      problems.push(`${p}.cancellationContract.escalationSignal`);
  }
  const out = o.outputPolicy;
  if (typeof out !== "object" || out === null) {
    problems.push(`${p}.outputPolicy`);
  } else {
    const op = out as Record<string, unknown>;
    for (const f of ["maxChunkBytes", "maxInMemoryTailBytes", "maxDurableBytes"]) {
      if (typeof op[f] !== "number" || !Number.isInteger(op[f]) || (op[f] as number) < 1) {
        problems.push(`${p}.outputPolicy.${f}`);
      }
    }
  }
  const redact = o.redactionPolicy;
  if (typeof redact !== "object" || redact === null) {
    problems.push(`${p}.redactionPolicy`);
  } else {
    const rd = redact as Record<string, unknown>;
    if (!isStringArray(rd.secretVariableNames))
      problems.push(`${p}.redactionPolicy.secretVariableNames`);
    if (typeof rd.redactAuthorizationHeaders !== "boolean")
      problems.push(`${p}.redactionPolicy.redactAuthorizationHeaders`);
    if (typeof rd.skipShortValues !== "boolean")
      problems.push(`${p}.redactionPolicy.skipShortValues`);
    if (typeof rd.minSecretLength !== "number" || !Number.isInteger(rd.minSecretLength)) {
      problems.push(`${p}.redactionPolicy.minSecretLength`);
    }
  }
  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
    problems.push(`${p}.version`);
  }
  validateTimestamps(o, p, problems);
}

function validateOperationRun(raw: unknown, i: number, problems: string[]): void {
  const p = `operationRuns[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.definitionId)) problems.push(`${p}.definitionId`);
  if (typeof o.definitionVersion !== "number" || !Number.isInteger(o.definitionVersion)) {
    problems.push(`${p}.definitionVersion`);
  }
  if (
    typeof o.definitionFingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(o.definitionFingerprint)
  ) {
    problems.push(`${p}.definitionFingerprint`);
  }
  if (!isNonEmptyString(o.projectId)) problems.push(`${p}.projectId`);
  if (!isNonEmptyString(o.repositoryRoot)) problems.push(`${p}.repositoryRoot`);
  if (!isNonEmptyString(o.worktreeIdentity)) problems.push(`${p}.worktreeIdentity`);
  const ownership = o.ownership;
  if (typeof ownership !== "object" || ownership === null) {
    problems.push(`${p}.ownership`);
  } else {
    const own = ownership as Record<string, unknown>;
    if (!isNonEmptyString(own.requester)) problems.push(`${p}.ownership.requester`);
    if (!isNonEmptyString(own.owner)) problems.push(`${p}.ownership.owner`);
    if (own.workItemId !== undefined && typeof own.workItemId !== "string") {
      problems.push(`${p}.ownership.workItemId`);
    }
  }
  if (typeof o.startingFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(o.startingFingerprint)) {
    problems.push(`${p}.startingFingerprint`);
  }
  if (o.endingFingerprint !== undefined) {
    if (typeof o.endingFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(o.endingFingerprint)) {
      problems.push(`${p}.endingFingerprint`);
    }
  }
  if (typeof o.changedDuringRun !== "boolean") problems.push(`${p}.changedDuringRun`);
  if (!inEnum(o.lifecycleState, OPERATION_LIFECYCLE_STATES)) problems.push(`${p}.lifecycleState`);
  if (!isNonEmptyString(o.createdAt)) problems.push(`${p}.createdAt`);
  if (o.startedAt !== undefined && !isNonEmptyString(o.startedAt)) problems.push(`${p}.startedAt`);
  if (o.settledAt !== undefined && !isNonEmptyString(o.settledAt)) problems.push(`${p}.settledAt`);
  const proc = o.processIdentity;
  if (proc !== undefined) {
    if (typeof proc !== "object" || proc === null) {
      problems.push(`${p}.processIdentity`);
    } else {
      const pp = proc as Record<string, unknown>;
      if (typeof pp.pid !== "number" || !Number.isInteger(pp.pid) || pp.pid < 0)
        problems.push(`${p}.processIdentity.pid`);
      if (
        typeof pp.processGroupId !== "number" ||
        !Number.isInteger(pp.processGroupId) ||
        pp.processGroupId < 0
      )
        problems.push(`${p}.processIdentity.processGroupId`);
      if (typeof pp.processGroupOwned !== "boolean")
        problems.push(`${p}.processIdentity.processGroupOwned`);
      if (typeof pp.platform !== "string") problems.push(`${p}.processIdentity.platform`);
    }
  }
  if (o.exitCode !== undefined && (!Number.isInteger(o.exitCode) || (o.exitCode as number) < 0))
    problems.push(`${p}.exitCode`);
  if (o.terminatingSignal !== undefined && typeof o.terminatingSignal !== "string")
    problems.push(`${p}.terminatingSignal`);
  if (o.settlementReason !== undefined && !inEnum(o.settlementReason, OPERATION_FINAL_STATES))
    problems.push(`${p}.settlementReason`);
  const summary = o.outputSummary;
  if (typeof summary !== "object" || summary === null) {
    problems.push(`${p}.outputSummary`);
  } else {
    const sm = summary as Record<string, unknown>;
    if (typeof sm.truncated !== "boolean") problems.push(`${p}.outputSummary.truncated`);
    if (typeof sm.droppedBytes !== "number" || !Number.isInteger(sm.droppedBytes)) {
      problems.push(`${p}.outputSummary.droppedBytes`);
    }
    if (typeof sm.redactionCount !== "number" || !Number.isInteger(sm.redactionCount)) {
      problems.push(`${p}.outputSummary.redactionCount`);
    }
    if (typeof sm.redactedSecrets !== "boolean")
      problems.push(`${p}.outputSummary.redactedSecrets`);
  }
  if (o.outputArtifactRef !== undefined && typeof o.outputArtifactRef !== "string")
    problems.push(`${p}.outputArtifactRef`);
  if (!inEnum(o.deliveryState, OPERATION_DELIVERY_STATES)) problems.push(`${p}.deliveryState`);
}

function validateSequences(raw: unknown, problems: string[]): void {
  if (typeof raw !== "object" || raw === null) {
    problems.push("sequences");
    return;
  }
  const o = raw as Record<string, unknown>;
  for (const key of [
    "workItem",
    "decision",
    "assumption",
    "risk",
    "intake",
    "orientation",
    "claim",
    "receipt",
    "operationDefinition",
    "operationRun",
  ]) {
    if (typeof o[key] !== "number" || !Number.isInteger(o[key]) || (o[key] as number) < 1) {
      problems.push(`sequences.${key}`);
    }
  }
}

function uniqueIds(items: Array<{ id: string }>, prefix: string, problems: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) problems.push(`${prefix}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

/** Validate an untrusted parsed value as a current-schema ProjectState, or throw an actionable error. */
export function validateProjectState(raw: unknown): ProjectState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StateValidationError("project.json must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.schemaVersion !== "number") {
    throw new StateValidationError("project.json is missing a numeric 'schemaVersion'.");
  }
  if (o.schemaVersion !== SCHEMA_VERSION) {
    throw new StateValidationError(
      `Expected schemaVersion ${SCHEMA_VERSION}, found ${o.schemaVersion}.`,
    );
  }

  const problems: string[] = [];
  for (const key of ["projectId", "displayName", "nextAction", "createdAt", "updatedAt"]) {
    if (!isNonEmptyString(o[key])) problems.push(key);
  }
  if (!inEnum(o.phase, PHASES)) problems.push("phase");
  if (!inEnum(o.health, HEALTHS)) problems.push("health");
  if (typeof o.revision !== "number" || !Number.isInteger(o.revision) || o.revision < 1) {
    problems.push("revision");
  }
  if (o.focusWorkItemId !== null && typeof o.focusWorkItemId !== "string") {
    problems.push("focusWorkItemId");
  }
  if (o.nextActionRationale !== undefined && !isNonEmptyString(o.nextActionRationale)) {
    problems.push("nextActionRationale");
  }
  if (o.currentIntakeId !== undefined && !isNonEmptyString(o.currentIntakeId)) {
    problems.push("currentIntakeId");
  }
  if (o.currentOrientationId !== undefined && !isNonEmptyString(o.currentOrientationId)) {
    problems.push("currentOrientationId");
  }
  validateSequences(o.sequences, problems);

  for (const [key, fn] of [
    ["workItems", validateWorkItem],
    ["decisions", validateDecision],
    ["assumptions", validateAssumption],
    ["risks", validateRisk],
    ["intakes", validateIntake],
    ["orientations", validateOrientation],
    ["claims", validateClaim],
    ["receipts", validateReceipt],
    ["operationDefinitions", validateOperationDefinition],
    ["operationRuns", validateOperationRun],
  ] as const) {
    if (!Array.isArray(o[key])) {
      problems.push(key);
      continue;
    }
    (o[key] as unknown[]).forEach((item, i) => fn(item, i, problems));
  }

  if (problems.length > 0) {
    throw new StateValidationError(
      `Invalid or missing fields in project.json: ${problems.join(", ")}.`,
    );
  }

  // Uniqueness (structural integrity, not referential — referential checks live in doctor).
  const state = o as unknown as ProjectState;
  uniqueIds(state.workItems, "workItems", problems);
  uniqueIds(state.decisions, "decisions", problems);
  uniqueIds(state.assumptions, "assumptions", problems);
  uniqueIds(state.risks, "risks", problems);
  uniqueIds(state.intakes, "intakes", problems);
  uniqueIds(state.orientations, "orientations", problems);
  uniqueIds(state.claims, "claims", problems);
  uniqueIds(state.receipts, "receipts", problems);
  uniqueIds(state.operationDefinitions, "operationDefinitions", problems);
  uniqueIds(state.operationRuns, "operationRuns", problems);
  if (problems.length > 0) {
    throw new StateValidationError(`Structural problems in project.json: ${problems.join(", ")}.`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: state.projectId,
    displayName: state.displayName,
    phase: state.phase,
    health: state.health,
    nextAction: state.nextAction,
    ...(state.nextActionRationale !== undefined
      ? { nextActionRationale: state.nextActionRationale }
      : {}),
    focusWorkItemId: state.focusWorkItemId,
    sequences: state.sequences as Sequences,
    workItems: state.workItems as WorkItem[],
    decisions: state.decisions as Decision[],
    assumptions: state.assumptions as Assumption[],
    risks: state.risks as Risk[],
    intakes: state.intakes as IntakeRecord[],
    orientations: state.orientations as OrientationRecord[],
    claims: state.claims as Claim[],
    receipts: state.receipts as VerificationReceiptRecord[],
    operationDefinitions: state.operationDefinitions as OperationDefinition[],
    operationRuns: state.operationRuns as OperationRun[],
    ...(state.currentIntakeId !== undefined ? { currentIntakeId: state.currentIntakeId } : {}),
    ...(state.currentOrientationId !== undefined
      ? { currentOrientationId: state.currentOrientationId }
      : {}),
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
  };
}

// --- Raw read / canonical write ---

export interface RawState {
  version: unknown;
  raw: unknown;
  bytes: string;
}

/** Read and parse project.json without schema validation (for migration and doctor). */
export async function readRawState(root: string): Promise<RawState> {
  const paths = statePaths(root);
  // Single chokepoint: a legacy-only or conflicting state directory must never be operated on
  // implicitly, so every command that reads state inherits the explicit refusal.
  assertUsableStateDirectory(root);
  if (!existsSync(paths.projectJson)) {
    throw new StateNotFoundError(`No Voila state at ${paths.projectJson}. Run /voila init.`);
  }
  let bytes: string;
  try {
    bytes = await readFile(paths.projectJson, "utf8");
  } catch (error) {
    throw new StateValidationError(`Cannot read ${paths.projectJson}: ${(error as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    throw new StateValidationError(`Malformed JSON in ${paths.projectJson}. Fix or reinitialize.`);
  }
  const version =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).schemaVersion : undefined;
  return { version, raw, bytes };
}

/** Atomically write canonical project.json only (no event, no view). Used by init/update/migration. */
export async function writeCanonical(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await atomicWriteFile(paths.projectJson, serializeState(state));
}

/** Write a timestamped backup of the current project.json bytes. Returns the backup path. */
export async function backupProjectJson(
  root: string,
  bytes: string,
  fromVersion: number,
  timestamp?: string,
): Promise<string> {
  const paths = statePaths(root);
  await mkdir(paths.backupsDir, { recursive: true });
  const ts = (timestamp ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const dest = `${paths.backupsDir}/project.json.v${fromVersion}.${ts}`;
  await writeFile(dest, bytes, "utf8");
  return dest;
}

export async function appendEvent(root: string, event: VoilaEvent): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  const line = `${JSON.stringify({ ...event, ts: event.ts ?? new Date().toISOString() })}\n`;
  await appendFile(paths.eventsJsonl, line, "utf8");
}

export async function writeStatusView(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.viewsDir, { recursive: true });
  await atomicWriteFile(paths.statusView, renderStatusView(state));
}

// --- Load / init / update ---

/** Load and validate canonical state. Older versions -> MigrationRequiredError; unknown -> UnknownSchemaVersionError. */
export async function loadState(root: string): Promise<ProjectState> {
  const { version, raw } = await readRawState(root);
  if (version === SCHEMA_VERSION) return validateProjectState(raw);
  // Any version with a known migration path reports "migration required", never "unknown".
  if (typeof version === "number" && migrationPlan(version) !== null) {
    throw new MigrationRequiredError(version, SCHEMA_VERSION);
  }
  throw new UnknownSchemaVersionError(version);
}

export interface InitStateInput {
  displayName: string;
  now?: string;
  projectId?: string;
}

export async function initState(root: string, input: InitStateInput): Promise<ProjectState> {
  const paths = statePaths(root);
  if (existsSync(paths.projectJson)) {
    throw new StateExistsError(
      `Voila is already initialized at ${paths.projectJson}. Refusing to overwrite.`,
    );
  }
  await mkdir(paths.receiptsDir, { recursive: true });
  await mkdir(paths.viewsDir, { recursive: true });
  await mkdir(paths.intakesDir, { recursive: true });
  await mkdir(paths.orientationsDir, { recursive: true });
  await mkdir(paths.briefsDir, { recursive: true });

  const state = createInitialState({
    displayName: input.displayName,
    now: input.now,
    projectId: input.projectId,
  });

  await writeCanonical(root, state);
  await appendEvent(root, {
    type: "project_initialized",
    projectId: state.projectId,
    revision: state.revision,
  });
  await writeStatusView(root, state);
  return state;
}

/**
 * Immutable update. The reducer receives a deep-frozen clone of current state (it must not mutate it)
 * and returns a complete candidate. Identity fields (schemaVersion, projectId, createdAt) and
 * store-owned fields (revision, updatedAt) are enforced by the store. Validation happens before the
 * canonical write; a rejected update leaves canonical and prior in-memory state untouched.
 */
export type EventOrBuilder = VoilaEvent | ((next: ProjectState) => VoilaEvent);

// --- Per-root write serialization ---
//
// `updateState` is the only path that mutates project.json, the append-only event log, and the
// generated view together. Without serialization, two concurrent calls would each load the same
// pre-mutation state, both increment the same revision, and the second canonical write would silently
// overwrite the first while leaving two duplicate events for one transition. We guard the entire
// load → reduce → write → append → view sequence with a per-root async mutex so two concurrent
// callers see distinct revisions, append distinct events, and never duplicate history.

interface WriteLock {
  chain: Promise<unknown>;
}

const writeLocks = new Map<string, WriteLock>();

function acquireWriteLock(root: string): Promise<() => void> {
  const previous = writeLocks.get(root)?.chain ?? Promise.resolve();
  let release: () => void = () => {};
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  writeLocks.set(root, { chain: previous.then(() => next) });
  return previous.then(() => release);
}

export async function updateState(
  root: string,
  reducer: (current: Readonly<ProjectState>) => ProjectState,
  event?: EventOrBuilder,
): Promise<ProjectState> {
  const release = await acquireWriteLock(root);
  try {
    const current = await loadState(root);
    const frozenInput = deepFreeze(structuredClone(current));
    const candidate = reducer(frozenInput);

    const next: ProjectState = {
      ...candidate,
      schemaVersion: SCHEMA_VERSION,
      projectId: current.projectId,
      createdAt: current.createdAt,
      revision: current.revision + 1,
      updatedAt: new Date().toISOString(),
    };

    const validated = validateProjectState(next);

    await writeCanonical(root, validated);
    if (event) {
      const evt = typeof event === "function" ? event(validated) : event;
      await appendEvent(root, { ...evt, revision: validated.revision });
    }
    await writeStatusView(root, validated);
    return validated;
  } finally {
    release();
  }
}
