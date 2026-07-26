// Pure domain contracts for finite supervised operations (R2A).
//
// Everything in this module is deterministic and free of Pi and I/O. It produces a candidate
// ProjectState by appending or updating entries in `operationDefinitions` and `operationRuns`,
// enforcing the lifecycle invariants, and deriving the definition fingerprint. The supervisor
// (state/operations-runtime.ts) is the only module that actually launches a child process.

import type {
  OperationDefinition,
  OperationDeliveryState,
  OperationEnvironmentPolicy,
  OperationFinalState,
  OperationLifecycleState,
  OperationOutputPolicy,
  OperationProcessIdentity,
  OperationRedactionPolicy,
  OperationRiskClassification,
  OperationRun,
  OperationRunOwnership,
  OperationSuccessContract,
  OperationTimeoutContract,
  OperationCancellationContract,
  ProjectState,
  WorkingDirectoryPolicy,
} from "./types.ts";
import {
  OPERATION_FINAL_STATES,
  OPERATION_LIFECYCLE_STATES,
  OPERATION_TRANSITIONS,
} from "./types.ts";
import { createHash } from "node:crypto";
import { ProjectOperationError } from "./errors.ts";
import { allocateId } from "./ids.ts";

/** Redaction defaults for R2A. Other policies belong to a later operation packet. */
export const R2A_DEFAULT_REDACTION: Readonly<OperationRedactionPolicy> = {
  secretVariableNames: [
    "TOKEN",
    "SECRET",
    "PASSWORD",
    "PASSWD",
    "API_KEY",
    "PRIVATE_KEY",
    "AUTH",
    "AUTHORIZATION",
    "COOKIE",
    "SESSION",
    "CREDENTIAL",
  ],
  redactAuthorizationHeaders: true,
  skipShortValues: true,
  minSecretLength: 6,
};

/** Output limits for R2A. Values are bytes, applied after ANSI/path normalization. */
export const R2A_DEFAULT_OUTPUT_POLICY: Readonly<OperationOutputPolicy> = {
  maxChunkBytes: 16 * 1024,
  maxInMemoryTailBytes: 256 * 1024,
  maxDurableBytes: 1024 * 1024,
};

/** Time budgets for R2A. */
export const R2A_DEFAULT_TIMEOUTS: Readonly<OperationTimeoutContract> = {
  startupMs: 10_000,
  totalMs: 120_000,
  gracefulMs: 5_000,
  forcedMs: 5_000,
};

/** Cancellation defaults for R2A. */
export const R2A_DEFAULT_CANCELLATION: Readonly<OperationCancellationContract> = {
  gracefulSignal: "SIGTERM",
  escalationSignal: "SIGKILL",
};

const SUCCESS_CONTRACT: Readonly<OperationSuccessContract> = {
  exitCode: 0,
  description: "Process exits with code 0 within the total time budget.",
};

const RISK_CLASSIFICATION: Readonly<OperationRiskClassification> = {
  riskClass: "safe_and_expected",
  impact: "Local read with bounded temporary writes inside the worktree.",
  externalEffects: "None expected.",
  networkRequired: false,
  privilegesRequired: "Normal user.",
  interactive: false,
  reversible: true,
  trustSource: "Explicit accepted project operation.",
  concurrency: "One active operation per project root.",
};

/** The single accepted R2A operation: the state-store test, run via `mise`. */
export const R2A_STATE_STORE_OPERATION: Readonly<
  Omit<OperationDefinition, "createdAt" | "updatedAt">
> = {
  id: "r2a.state-store-tests",
  version: 1,
  purpose: "test",
  kind: "finite",
  executable: "mise",
  args: ["exec", "--", "node", "--test", "test/state.store.test.ts"],
  workingDirectory: "repository_root",
  environmentPolicy: { kind: "inherit" },
  riskClassification: RISK_CLASSIFICATION,
  successContract: SUCCESS_CONTRACT,
  timeoutContract: R2A_DEFAULT_TIMEOUTS,
  cancellationContract: R2A_DEFAULT_CANCELLATION,
  outputPolicy: R2A_DEFAULT_OUTPUT_POLICY,
  redactionPolicy: R2A_DEFAULT_REDACTION,
};

/** True when a state is one of the canonical final states. */
export function isFinalState(state: OperationLifecycleState): state is OperationFinalState {
  return (OPERATION_FINAL_STATES as readonly OperationLifecycleState[]).includes(state);
}

/** Validate a single transition. Throws on an illegal move. */
export function assertTransition(from: OperationLifecycleState, to: OperationLifecycleState): void {
  if (from === to) return;
  const allowed = OPERATION_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new ProjectOperationError(
      `Illegal operation lifecycle transition: ${from} -> ${to}. Allowed from ${from}: ${allowed.join(", ") || "<none>"}.`,
    );
  }
}

/** Compute the stable fingerprint of an operation definition content. */
export function definitionFingerprint(definition: OperationDefinition): string {
  // The fingerprint hashes only the load-bearing content: identity, executable, args, working
  // directory, environment policy, risk class, timeouts, cancellation contract, output policy, and
  // redaction policy. Timestamps are excluded so an `updatedAt` rewrite does not invalidate the
  // fingerprint; the store proves freshness separately through receipts.
  const canonical = {
    id: definition.id,
    version: definition.version,
    purpose: definition.purpose,
    kind: definition.kind,
    executable: definition.executable,
    args: [...definition.args].sort(),
    workingDirectory: definition.workingDirectory,
    environmentPolicy: definition.environmentPolicy,
    riskClassification: definition.riskClassification,
    successContract: definition.successContract,
    timeoutContract: definition.timeoutContract,
    cancellationContract: definition.cancellationContract,
    outputPolicy: definition.outputPolicy,
    redactionPolicy: definition.redactionPolicy,
  };
  return sha256Hex(JSON.stringify(canonical));
}

/** Minimal SHA-256 hex over a UTF-8 string. */
function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

/** Pure validation of an operation definition. Throws on any structural problem. */
export function validateDefinition(input: unknown): OperationDefinition {
  if (typeof input !== "object" || input === null) {
    throw new ProjectOperationError("Operation definition must be an object.");
  }
  const o = input as Record<string, unknown>;
  if (typeof o.id !== "string" || o.id.length === 0) {
    throw new ProjectOperationError("Operation definition requires a non-empty id.");
  }
  if (typeof o.version !== "number" || !Number.isInteger(o.version) || o.version < 1) {
    throw new ProjectOperationError("Operation definition version must be a positive integer.");
  }
  if (typeof o.purpose !== "string" || o.purpose.length === 0) {
    throw new ProjectOperationError("Operation definition requires a non-empty purpose.");
  }
  if (o.kind !== "finite") {
    throw new ProjectOperationError(
      `R2A supports only finite operations; got "${String(o.kind)}".`,
    );
  }
  if (typeof o.executable !== "string" || o.executable.trim().length === 0) {
    throw new ProjectOperationError("Operation definition requires a non-empty executable.");
  }
  if (SHELL_METACHARS.test(o.executable)) {
    throw new ProjectOperationError(
      `Refusing operation executable "${o.executable}" because it contains shell metacharacters. Pass an executable plus argv.`,
    );
  }
  if (!Array.isArray(o.args) || !o.args.every((a) => typeof a === "string")) {
    throw new ProjectOperationError("Operation definition args must be an array of strings.");
  }
  for (const arg of o.args) {
    if (SHELL_METACHARS.test(arg)) {
      throw new ProjectOperationError(
        `Refusing operation arg "${arg}" because it contains shell metacharacters. Pass executable plus argv only.`,
      );
    }
  }
  if (!isWorkingDirectory(o.workingDirectory)) {
    throw new ProjectOperationError(
      `Unsupported working directory policy: ${String(o.workingDirectory)}.`,
    );
  }
  validateEnvironmentPolicy(o.environmentPolicy);
  validateRiskClassification(o.riskClassification);
  validateSuccessContract(o.successContract);
  validateTimeoutContract(o.timeoutContract);
  validateCancellationContract(o.cancellationContract);
  validateOutputPolicy(o.outputPolicy);
  validateRedactionPolicy(o.redactionPolicy);

  return o as unknown as OperationDefinition;
}

const SHELL_METACHARS = /[|&;<>()$`\\"'\n\r*?[\]{}~!#\s]/;

function isWorkingDirectory(v: unknown): v is WorkingDirectoryPolicy {
  return v === "repository_root";
}

function validateEnvironmentPolicy(v: unknown): asserts v is OperationEnvironmentPolicy {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Environment policy must be an object.");
  }
  const e = v as Record<string, unknown>;
  if (e.kind !== "inherit" && e.kind !== "isolate") {
    throw new ProjectOperationError(`Unsupported environment policy kind: ${String(e.kind)}.`);
  }
  if (e.recordedVariableNames !== undefined) {
    if (!Array.isArray(e.recordedVariableNames) || !e.recordedVariableNames.every(isString)) {
      throw new ProjectOperationError("recordedVariableNames must be an array of strings.");
    }
  }
}

function validateRiskClassification(v: unknown): asserts v is OperationRiskClassification {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Risk classification must be an object.");
  }
  const r = v as Record<string, unknown>;
  const strings = ["impact", "externalEffects", "privilegesRequired", "trustSource", "concurrency"];
  for (const f of strings) {
    if (typeof r[f] !== "string" || (r[f] as string).length === 0) {
      throw new ProjectOperationError(`Risk classification.${f} is required.`);
    }
  }
  for (const f of ["networkRequired", "interactive", "reversible"]) {
    if (typeof r[f] !== "boolean") {
      throw new ProjectOperationError(`Risk classification.${f} must be boolean.`);
    }
  }
}

function validateSuccessContract(v: unknown): asserts v is OperationSuccessContract {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Success contract must be an object.");
  }
  const s = v as Record<string, unknown>;
  if (!Number.isInteger(s.exitCode)) {
    throw new ProjectOperationError("Success contract.exitCode must be an integer.");
  }
  if (typeof s.description !== "string" || s.description.length === 0) {
    throw new ProjectOperationError("Success contract.description must be a non-empty string.");
  }
}

function validateTimeoutContract(v: unknown): asserts v is OperationTimeoutContract {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Timeout contract must be an object.");
  }
  const t = v as Record<string, unknown>;
  for (const f of ["startupMs", "totalMs", "gracefulMs", "forcedMs"]) {
    if (typeof t[f] !== "number" || !Number.isInteger(t[f]) || (t[f] as number) < 1) {
      throw new ProjectOperationError(`Timeout contract.${f} must be a positive integer.`);
    }
  }
}

function validateCancellationContract(v: unknown): asserts v is OperationCancellationContract {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Cancellation contract must be an object.");
  }
  const c = v as Record<string, unknown>;
  if (c.gracefulSignal !== "SIGTERM" && c.gracefulSignal !== "SIGINT") {
    throw new ProjectOperationError(
      "Cancellation contract.gracefulSignal must be SIGTERM or SIGINT.",
    );
  }
  if (c.escalationSignal !== "SIGKILL" && c.escalationSignal !== "SIGABRT") {
    throw new ProjectOperationError(
      "Cancellation contract.escalationSignal must be SIGKILL or SIGABRT.",
    );
  }
}

function validateOutputPolicy(v: unknown): asserts v is OperationOutputPolicy {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Output policy must be an object.");
  }
  const op = v as Record<string, unknown>;
  for (const f of ["maxChunkBytes", "maxInMemoryTailBytes", "maxDurableBytes"]) {
    if (typeof op[f] !== "number" || !Number.isInteger(op[f]) || (op[f] as number) < 1) {
      throw new ProjectOperationError(`Output policy.${f} must be a positive integer.`);
    }
  }
}

function validateRedactionPolicy(v: unknown): asserts v is OperationRedactionPolicy {
  if (typeof v !== "object" || v === null) {
    throw new ProjectOperationError("Redaction policy must be an object.");
  }
  const rd = v as Record<string, unknown>;
  if (!Array.isArray(rd.secretVariableNames) || !rd.secretVariableNames.every(isString)) {
    throw new ProjectOperationError("Redaction policy.secretVariableNames must be string[]. ");
  }
  if (typeof rd.redactAuthorizationHeaders !== "boolean") {
    throw new ProjectOperationError("Redaction policy.redactAuthorizationHeaders must be boolean.");
  }
  if (typeof rd.skipShortValues !== "boolean") {
    throw new ProjectOperationError("Redaction policy.skipShortValues must be boolean.");
  }
  if (typeof rd.minSecretLength !== "number" || !Number.isInteger(rd.minSecretLength)) {
    throw new ProjectOperationError("Redaction policy.minSecretLength must be an integer.");
  }
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/** Find an operation definition by id and version (latest when version is omitted). */
export function findDefinition(
  state: ProjectState,
  id: string,
  version?: number,
): OperationDefinition | undefined {
  const matches = state.operationDefinitions.filter((d) => d.id === id);
  if (matches.length === 0) return undefined;
  if (version === undefined) {
    return matches.reduce((acc, d) => (d.version > acc.version ? d : acc), matches[0]!);
  }
  return matches.find((d) => d.version === version);
}

/** Register an operation definition in canonical state. Idempotent on (id, version). */
export function registerDefinition(
  state: ProjectState,
  definition: OperationDefinition,
  now: string,
): { state: ProjectState; created: boolean } {
  const existing = state.operationDefinitions.find(
    (d) => d.id === definition.id && d.version === definition.version,
  );
  if (existing) {
    return { state, created: false };
  }
  return {
    state: {
      ...state,
      operationDefinitions: [
        ...state.operationDefinitions,
        { ...definition, createdAt: now, updatedAt: now },
      ],
    },
    created: true,
  };
}

/**
 * Insert the one canonical placeholder run record describing the as-yet-unstarted operation.
 * Used by the supervisor at spawn time. The caller must replace it via settle() once the run ends.
 */
export interface CreateRunInput {
  definition: OperationDefinition;
  ownership: OperationRunOwnership;
  projectId: string;
  repositoryRoot: string;
  worktreeIdentity: string;
  startingFingerprint: string;
}

export function createQueuedRun(
  state: ProjectState,
  input: CreateRunInput,
  now: string,
): { state: ProjectState; run: OperationRun } {
  const { id, sequences } = allocateId(state.sequences, "operationRun");
  const run: OperationRun = {
    id,
    definitionId: input.definition.id,
    definitionVersion: input.definition.version,
    definitionFingerprint: definitionFingerprint(input.definition),
    projectId: input.projectId,
    repositoryRoot: input.repositoryRoot,
    worktreeIdentity: input.worktreeIdentity,
    ownership: input.ownership,
    startingFingerprint: input.startingFingerprint,
    changedDuringRun: false,
    lifecycleState: "queued",
    createdAt: now,
    outputSummary: {
      truncated: false,
      droppedBytes: 0,
      redactionCount: 0,
      redactedSecrets: false,
    },
    deliveryState: "created",
  };
  return {
    state: { ...state, sequences, operationRuns: [...state.operationRuns, run] },
    run,
  };
}

/** Update an operation run record; rejects illegal lifecycle transitions. */
export interface UpdateRunPatch {
  lifecycleState?: OperationLifecycleState;
  startedAt?: string;
  settledAt?: string;
  processIdentity?: OperationProcessIdentity;
  exitCode?: number;
  terminatingSignal?: string;
  settlementReason?: OperationFinalState;
  endingFingerprint?: string;
  changedDuringRun?: boolean;
  outputSummary?: OperationRun["outputSummary"];
  outputArtifactRef?: string;
  deliveryState?: OperationDeliveryState;
}

export function updateRun(
  state: ProjectState,
  runId: string,
  patch: UpdateRunPatch,
): { state: ProjectState; run: OperationRun } {
  const idx = state.operationRuns.findIndex((r) => r.id === runId);
  if (idx < 0) throw new ProjectOperationError(`Operation run not found: ${runId}.`);
  const current = state.operationRuns[idx]!;
  if (patch.lifecycleState && patch.lifecycleState !== current.lifecycleState) {
    assertTransition(current.lifecycleState, patch.lifecycleState);
  }
  const next: OperationRun = {
    ...current,
    ...(patch.lifecycleState !== undefined ? { lifecycleState: patch.lifecycleState } : {}),
    ...(patch.startedAt !== undefined ? { startedAt: patch.startedAt } : {}),
    ...(patch.settledAt !== undefined ? { settledAt: patch.settledAt } : {}),
    ...(patch.processIdentity !== undefined ? { processIdentity: patch.processIdentity } : {}),
    ...(patch.exitCode !== undefined ? { exitCode: patch.exitCode } : {}),
    ...(patch.terminatingSignal !== undefined
      ? { terminatingSignal: patch.terminatingSignal }
      : {}),
    ...(patch.settlementReason !== undefined ? { settlementReason: patch.settlementReason } : {}),
    ...(patch.endingFingerprint !== undefined
      ? { endingFingerprint: patch.endingFingerprint }
      : {}),
    ...(patch.changedDuringRun !== undefined ? { changedDuringRun: patch.changedDuringRun } : {}),
    ...(patch.outputSummary !== undefined ? { outputSummary: patch.outputSummary } : {}),
    ...(patch.outputArtifactRef !== undefined
      ? { outputArtifactRef: patch.outputArtifactRef }
      : {}),
    ...(patch.deliveryState !== undefined ? { deliveryState: patch.deliveryState } : {}),
  };
  const operationRuns = [...state.operationRuns];
  operationRuns[idx] = next;
  return { state: { ...state, operationRuns }, run: next };
}

/** True when the two runs are operationally equivalent (same definition, project, root, worktree, fingerprint). */
export function runsEquivalent(a: OperationRun, b: OperationRun): boolean {
  return (
    a.definitionFingerprint === b.definitionFingerprint &&
    a.projectId === b.projectId &&
    a.repositoryRoot === b.repositoryRoot &&
    a.worktreeIdentity === b.worktreeIdentity &&
    a.startingFingerprint === b.startingFingerprint &&
    !isFinalState(a.lifecycleState)
  );
}

/** The most recent active run for a definition+worktree identity, or undefined. */
export function findActiveRun(state: ProjectState, runId?: string): OperationRun | undefined {
  if (runId) return state.operationRuns.find((r) => r.id === runId);
  for (let i = state.operationRuns.length - 1; i >= 0; i--) {
    const r = state.operationRuns[i]!;
    if (!isFinalState(r.lifecycleState)) return r;
  }
  return undefined;
}

/** Mark the most recent settled run as delivered to the parent (no-op when none qualifies). */
export function acknowledgeLatestSettlement(state: ProjectState, now: string): ProjectState {
  let latestIndex = -1;
  for (let i = state.operationRuns.length - 1; i >= 0; i--) {
    const r = state.operationRuns[i]!;
    if (isFinalState(r.lifecycleState) && r.deliveryState === "delivered") {
      latestIndex = i;
      break;
    }
  }
  if (latestIndex < 0) return state;
  const target = state.operationRuns[latestIndex]!;
  const updated = { ...target, deliveryState: "acknowledged" as const };
  const operationRuns = [...state.operationRuns];
  operationRuns[latestIndex] = updated;
  return { ...state, operationRuns };
}

/** Read the most recent settled run, or undefined when no settlement is available. */
export function latestSettlement(state: ProjectState): OperationRun | undefined {
  for (let i = state.operationRuns.length - 1; i >= 0; i--) {
    const r = state.operationRuns[i]!;
    if (isFinalState(r.lifecycleState)) return r;
  }
  return undefined;
}

/** Read the active (non-final) run, if any. */
export function activeRun(state: ProjectState): OperationRun | undefined {
  return state.operationRuns.find((r) => !isFinalState(r.lifecycleState));
}

/** Compact summary for the focus capsule. */
export interface OperationSummary {
  id: string;
  definitionId: string;
  lifecycleState: OperationLifecycleState;
  /** True when this is an undelivered settlement the Steward must acknowledge. */
  pendingAcknowledgement: boolean;
  durationMs: number | null;
  /** Bounded final settlement output (redacted, truncated). */
  outputSummary: OperationRun["outputSummary"];
  /** Final settlement reason. */
  settlementReason?: OperationFinalState;
}

/** Build a bounded summary for one operation run, suitable for the focus capsule. */
export function summarizeRun(run: OperationRun, nowMs: number): OperationSummary {
  const startedMs = run.startedAt ? Date.parse(run.startedAt) : NaN;
  const settledMs = run.settledAt ? Date.parse(run.settledAt) : NaN;
  let durationMs: number | null = null;
  if (!Number.isNaN(startedMs) && !Number.isNaN(settledMs)) {
    durationMs = Math.max(0, settledMs - startedMs);
  } else if (!Number.isNaN(startedMs) && Number.isNaN(settledMs)) {
    durationMs = Math.max(0, nowMs - startedMs);
  }
  return {
    id: run.id,
    definitionId: run.definitionId,
    lifecycleState: run.lifecycleState,
    pendingAcknowledgement: isFinalState(run.lifecycleState) && run.deliveryState === "delivered",
    durationMs,
    outputSummary: run.outputSummary,
    settlementReason: run.settlementReason,
  };
}

/** Lifecycle states the run may legally reach at the given stage (exposed for tests). */
export function allowedNextStates(
  state: OperationLifecycleState,
): readonly OperationLifecycleState[] {
  return OPERATION_TRANSITIONS[state];
}

/** All lifecycle states, exposed for completeness checks. */
export function allLifecycleStates(): readonly OperationLifecycleState[] {
  return OPERATION_LIFECYCLE_STATES;
}
