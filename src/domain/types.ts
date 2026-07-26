// Canonical Voila project-state types (schema version 6). Pure domain — no Pi, no I/O.

/**
 * Current schema version. Earlier versions are migrated explicitly and never silently:
 * v1 (Packet 1) -> v2 (Packet 2 operations) -> v3 (Packet 3 intake + orientation) ->
 * v4 (Packet 4 claims + verification receipts + protected completion) ->
 * v5 (R2A finite-operation supervision: operation definitions, runs, lifecycle) ->
 * v6 (R2A authority pivot: effect profile, authority requirement, admission record,
 *     typed policy version). See migrate.ts.
 */
export const SCHEMA_VERSION = 6;

/**
 * Independent of schema. The R2A admission kernel reads `POLICY_VERSION` directly.
 * Schema v6 does not imply policy version 6.
 */
export const POLICY_VERSION = 1;

export const PHASES = ["research", "sketch", "build", "harden", "release"] as const;
export type Phase = (typeof PHASES)[number];

export const HEALTHS = ["green", "yellow", "red", "unknown"] as const;
export type Health = (typeof HEALTHS)[number];

// --- Work items ---

export const WORK_ITEM_KINDS = ["outcome", "task", "defect"] as const;
export type WorkItemKind = (typeof WORK_ITEM_KINDS)[number];

export const WORK_ITEM_PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export const WORK_ITEM_STATUSES = [
  "backlog",
  "ready",
  "in_progress",
  "blocked",
  "completed",
  "cancelled",
] as const;
export type WorkItemStatus = (typeof WORK_ITEM_STATUSES)[number];

/** `completed` is reachable ONLY through the protected transition (see domain/proof.ts). */
export const COMPLETED_STATUS: WorkItemStatus = "completed";

export interface WorkItem {
  id: string; // e.g. "NF-1"
  kind: WorkItemKind;
  title: string;
  description?: string;
  status: WorkItemStatus;
  priority: WorkItemPriority;
  acceptanceCriteria: string[];
  dependsOn: string[]; // work-item IDs
  /**
   * Claims that must be supported by current passing evidence before this item may be completed.
   * An item with no required claims can never be completed (v4 default for migrated items is `[]`).
   */
  requiredClaimIds: string[];
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Decisions ---

export const DECISION_STATUSES = ["proposed", "accepted", "superseded"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

export interface Decision {
  id: string; // e.g. "DEC-1"
  title: string;
  decision: string;
  rationale: string;
  status: DecisionStatus;
  supersededBy?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Assumptions ---

export const CONFIDENCES = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const ASSUMPTION_STATUSES = ["open", "validated", "invalidated"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];

export interface Assumption {
  id: string; // e.g. "ASM-1"
  statement: string;
  confidence: Confidence;
  status: AssumptionStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

// --- Risks ---

export const LIKELIHOODS = ["low", "medium", "high"] as const;
export type Likelihood = (typeof LIKELIHOODS)[number];

export const IMPACTS = ["low", "medium", "high"] as const;
export type Impact = (typeof IMPACTS)[number];

export const RISK_STATUSES = ["open", "mitigated", "accepted", "closed"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];

export interface Risk {
  id: string; // e.g. "RSK-1"
  statement: string;
  likelihood: Likelihood;
  impact: Impact;
  status: RiskStatus;
  mitigation?: string;
  linkedWorkItems?: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Intake (planning-document / request ingestion) ---

export const INTAKE_SOURCE_TYPES = ["file", "conversation", "pasted_text"] as const;
export type IntakeSourceType = (typeof INTAKE_SOURCE_TYPES)[number];

export const INTAKE_STATUSES = [
  "source_preserved",
  "draft_ready",
  "review_required",
  "accepted",
  "rejected",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

/**
 * Compact canonical metadata about an intake. The preserved source, the structured draft, and the
 * generated understanding view live as artifacts under `.voila/intakes/<id>/` — never inline here.
 */
export interface IntakeRecord {
  id: string; // e.g. "INT-1"
  title: string;
  sourceType: IntakeSourceType;
  /** Repository-relative path for file sources, or a stable label for text sources. */
  sourceRef: string;
  sourceSha256: string;
  status: IntakeStatus;
  /** The current (latest staged) draft revision; 0 before any draft is staged. */
  draftRevision: number;
  /** The exact revision that was accepted and applied, when status is `accepted`. */
  acceptedDraftRevision?: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string;
}

// --- Repository orientation ---

export const ORIENTATION_STATUSES = ["current", "stale"] as const;
export type OrientationStatus = (typeof ORIENTATION_STATUSES)[number];

/** Compact canonical metadata about an orientation snapshot; the artifact holds the detail. */
export interface OrientationRecord {
  id: string; // e.g. "ORI-1"
  artifactRef: string;
  repositoryHead?: string;
  status: OrientationStatus;
  createdAt: string;
  updatedAt: string;
}

// --- Claims (Packet 4: what is asserted to be true about a work item) ---

/**
 * A claim about a work item, stated by whoever did the work. Support is **derived** from receipts and
 * the current repository fingerprint — there is deliberately no manual "supported" flag, and nothing
 * in this record asserts that the claim holds. Claims are never deleted.
 */
export interface Claim {
  id: string; // e.g. "CLM-1"
  workItemId: string;
  statement: string;
  confidence: Confidence;
  /** Exact acceptance-criterion strings from the referenced work item that this claim covers. */
  coveredAcceptanceCriteria: string[];
  /** What this claim does NOT establish. Stays visible everywhere the claim is shown. */
  knownLimitations: string[];
  /** Receipts recorded for this claim, in creation order. Historical receipts are never rewritten. */
  receiptIds: string[];
  createdAt: string;
  updatedAt: string;
}

// --- Verification receipts (Packet 4: immutable evidence of one executed command) ---

export const RECEIPT_RESULTS = ["passed", "failed", "error", "timed_out"] as const;
export type ReceiptResult = (typeof RECEIPT_RESULTS)[number];

/**
 * Compact canonical metadata for one verification receipt. The full artifact
 * (`manifest.json`, `stdout.txt`, `stderr.txt`) lives under `.voila/receipts/<id>/` and is
 * immutable. Canonical state never holds command output, environment values, absolute paths, or
 * diffs.
 */
export interface VerificationReceiptRecord {
  id: string; // e.g. "RCP-1"
  claimId: string;
  result: ReceiptResult;
  /** Repository-relative artifact directory, e.g. `receipts/RCP-1`. */
  artifactRef: string;
  executable: string;
  args: string[];
  /** Repository-relative working directory the command ran in (`.` for the repository root). */
  cwdRef: string;
  exitCode?: number;
  startedAt: string;
  finishedAt: string;
  /** Deterministic digest of the repository work state observed when the command ran. */
  repositoryFingerprint: string;
  /** Algorithm that produced this fingerprint. v1 receipts have no such field. */
  fingerprintAlgorithm?: "v1" | "v2";
  gitHead?: string;
  /** True when either captured stream was capped. Recorded honestly; never silently hidden. */
  outputTruncated: boolean;
}

// --- Sequence counters (next value to allocate; stored in canonical state) ---

export interface Sequences {
  workItem: number;
  decision: number;
  assumption: number;
  risk: number;
  intake: number;
  orientation: number;
  claim: number;
  receipt: number;
  /** Monotonic OP-n counter for operation definitions. */
  operationDefinition: number;
  /** Monotonic RUN-n counter for operation runs. */
  operationRun: number;
}

// --- Operation definitions and runs (R2A: one finite supervised operation) ---

export const OPERATION_KINDS = ["finite"] as const;
export type OperationKind = (typeof OPERATION_KINDS)[number];

export const OPERATION_RISK_CLASSES = [
  "safe_and_expected",
  "recoverable_operational_problem",
  "ambiguous_or_potentially_unsafe",
  "material_authority_boundary",
  "structural_integrity_failure",
] as const;
export type OperationRiskClass = (typeof OPERATION_RISK_CLASSES)[number];

/**
 * Lifecycle of an operation run. Final states are terminal and a run never transitions from one final
 * state to another. `supervisor_error` records a defect in the supervisor itself, not in the child.
 */
export const OPERATION_LIFECYCLE_STATES = [
  "queued",
  "starting",
  "running",
  "passed",
  "failed",
  "cancelled",
  "timed_out",
  "supervisor_error",
] as const;
export type OperationLifecycleState = (typeof OPERATION_LIFECYCLE_STATES)[number];

export const OPERATION_FINAL_STATES = [
  "passed",
  "failed",
  "cancelled",
  "timed_out",
  "supervisor_error",
] as const satisfies readonly OperationLifecycleState[];
export type OperationFinalState = (typeof OPERATION_FINAL_STATES)[number];

/** Allowed transitions for an operation run's lifecycle. Anything not listed is rejected. */
export const OPERATION_TRANSITIONS: Readonly<
  Record<OperationLifecycleState, readonly OperationLifecycleState[]>
> = {
  queued: ["starting", "supervisor_error", "cancelled"],
  starting: ["running", "failed", "cancelled", "timed_out", "supervisor_error"],
  running: ["passed", "failed", "cancelled", "timed_out", "supervisor_error"],
  passed: ["passed"],
  failed: ["failed"],
  cancelled: ["cancelled"],
  timed_out: ["timed_out"],
  supervisor_error: ["supervisor_error"],
};

/** Where the operation runs. The repository root is the only supported value in R2A. */
export const WORKING_DIRECTORY_POLICIES = ["repository_root"] as const;
export type WorkingDirectoryPolicy = (typeof WORKING_DIRECTORY_POLICIES)[number];

/** Environment policy. `inherit_minimal` records no variable names; explicit names are recorded. */
export type OperationEnvironmentPolicy =
  { kind: "inherit"; recordedVariableNames?: string[] } | { kind: "isolate" };

/** Output policy for one run. Limits are bytes, not characters. */
export interface OperationOutputPolicy {
  /** Maximum captured chunk in bytes. Default 16 KiB. */
  maxChunkBytes: number;
  /** Maximum in-memory tail per stream (stdout, stderr) in bytes. Default 256 KiB. */
  maxInMemoryTailBytes: number;
  /** Maximum durable redacted output per run in bytes. Default 1 MiB. */
  maxDurableBytes: number;
}

/** Risk classification for one operation. Drives Steward behavior, not safety guarantees. */
export interface OperationRiskClassification {
  riskClass: OperationRiskClass;
  impact: string;
  externalEffects: string;
  networkRequired: boolean;
  privilegesRequired: string;
  interactive: boolean;
  reversible: boolean;
  trustSource: string;
  concurrency: string;
}

/** A bounded description of what success means for one operation. */
export interface OperationSuccessContract {
  /** The exit code that counts as success. R2A accepts only 0. */
  exitCode: number;
  /** Human-readable description. */
  description: string;
}

/** Time budgets for one operation. Values are owned by the operation, not by the supervisor. */
export interface OperationTimeoutContract {
  /** Bound on `starting` state, in ms. Default 10_000. */
  startupMs: number;
  /** Bound on `running` state, in ms. Default 120_000. */
  totalMs: number;
  /** Graceful cancellation window, in ms. Default 5_000. */
  gracefulMs: number;
  /** Forced termination window after graceful elapses, in ms. Default 5_000. */
  forcedMs: number;
}

/** Cancellation contract. R2A uses POSIX signals on supported platforms. */
export interface OperationCancellationContract {
  /** Signal sent for graceful cancellation. R2A sends SIGTERM. */
  gracefulSignal: "SIGTERM" | "SIGINT";
  /** Escalation when graceful is ignored. R2A sends SIGKILL after the forced window. */
  escalationSignal: "SIGKILL" | "SIGABRT";
}

/** Redaction configuration. Exact-value secrets come from the environment variable whitelist. */
export interface OperationRedactionPolicy {
  /** Variable names whose exact values are redacted from output. Compared case-insensitively. */
  secretVariableNames: string[];
  /** Reject authorization header values, embedded-credential URLs, etc. */
  redactAuthorizationHeaders: boolean;
  /** Skip empty values and values too short to identify safely. */
  skipShortValues: boolean;
  /** Minimum value length to redact; values below this length are left alone. */
  minSecretLength: number;
}

/** Closed effect-profile vocabulary (R2A). Effects declared on the operation definition. */
export const OPERATION_EFFECTS = [
  "local_read",
  "bounded_temporary_write",
  "repository_source_write",
  "canonical_state_write",
  "local_process_control",
  "network_read",
  "network_write",
  "external_state_mutation",
  "privileged_effect",
  "unknown_effect",
] as const;
export type OperationEffect = (typeof OPERATION_EFFECTS)[number];

/** Closed authority-requirement vocabulary (R2A). Resolved before execution. */
export const AUTHORITY_REQUIREMENTS = [
  "accepted_project_operation",
  "explicit_single_use_owner_authority",
  "read_only_project_access",
  "internal_supported_state_transition",
  "not_authorized",
] as const;
export type AuthorityRequirement = (typeof AUTHORITY_REQUIREMENTS)[number];

/** Reference to the canonical decision or operation definition that authorizes this run. */
export interface AuthorityReference {
  kind: "decision" | "operation_definition";
  id: string;
}

/**
 * Accepted operation definition. One definition describes what MAY be executed; an instance of it
 * is a run. Definitions are explicitly accepted; the supervisor never invents operations.
 */
export interface OperationDefinition {
  id: string; // e.g. "r2a.state-store-tests"
  version: number;
  purpose: string;
  kind: OperationKind;
  executable: string;
  args: string[];
  workingDirectory: WorkingDirectoryPolicy;
  environmentPolicy: OperationEnvironmentPolicy;
  /** Closed vocabulary; declared once on the definition. Never inferred from argv. */
  effectProfile: OperationEffect[];
  /** Authority requirement; resolved before execution against canonical sources. */
  authorityRequirement: AuthorityRequirement;
  /** Reference granting authority; absent only when authorityRequirement is not_authorized. */
  authoritySourceRef?: AuthorityReference;
  riskClassification: OperationRiskClassification;
  successContract: OperationSuccessContract;
  timeoutContract: OperationTimeoutContract;
  cancellationContract: OperationCancellationContract;
  outputPolicy: OperationOutputPolicy;
  redactionPolicy: OperationRedactionPolicy;
  createdAt: string;
  updatedAt: string;
}

/** Compact metadata about an operation's output. The bounded content lives under .voila/operations/. */
export interface OperationOutputSummary {
  /** True when either captured stream was capped. Recorded honestly; never silently hidden. */
  truncated: boolean;
  /** Bytes dropped from in-memory tail after it exceeded the policy. */
  droppedBytes: number;
  /** Approximate count of redacted secrets across all streams. */
  redactionCount: number;
  /** True when at least one secret value was redacted. */
  redactedSecrets: boolean;
}

/** Who asked for the run and what work it relates to. */
export interface OperationRunOwnership {
  /** The model requester (Pi turn ID, "user", or "steward"). */
  requester: string;
  /** The Steward or component that owns the run for the duration. */
  owner: string;
  /** The work item the run informs, when one is known. */
  workItemId?: string;
}

/** Process identity returned by the supervisor after spawn. */
export interface OperationProcessIdentity {
  /** OS-reported PID. May be 0 for non-POSIX platforms. */
  pid: number;
  /** The owned process-group ID. POSIX only; 0 elsewhere. */
  processGroupId: number;
  /** True when the supervisor could establish an owned process group. */
  processGroupOwned: boolean;
  /** Platform identifier (linux, darwin, win32). Recorded for honest portability. */
  platform: NodeJS.Platform;
}

/** How far the settlement has reached the parent Steward. */
export const OPERATION_DELIVERY_STATES = ["created", "delivered", "acknowledged"] as const;
export type OperationDeliveryState = (typeof OPERATION_DELIVERY_STATES)[number];

/** Closed admission result vocabulary (R2A admission kernel). */
export const OPERATION_ADMISSION_RESULTS = [
  "allow",
  "reuse_existing",
  "deny_unknown_operation",
  "deny_invalid_definition",
  "deny_wrong_project",
  "deny_wrong_worktree",
  "deny_capacity",
  "deny_retry_budget",
  "deny_missing_authority",
  "deny_structural_integrity",
] as const;
export type OperationAdmissionResult = (typeof OPERATION_ADMISSION_RESULTS)[number];

/** One immutable admission decision attached to an operation run. */
export interface OperationAdmission {
  result: OperationAdmissionResult;
  /** Stable rule identifier (for example "ADMIT.OPERATIONS.EQUIVALENT_REUSE"). */
  ruleId: string;
  /** Policy version active when this admission was evaluated. */
  policyVersion: number;
  /** Authority reference recorded when the request was admitted or reused. */
  authorityReference?: AuthorityReference;
  /** Existing run returned by `reuse_existing`; absent for every other result. */
  existingRunId?: string;
  /** Stable structured explanation data. Human text is derived from the rule ID. */
  explanationData?: Record<string, string | number | boolean>;
  /** ISO timestamp when the admission was evaluated. */
  decidedAt: string;
  /** Provenance for legacy runs whose admission was never re-evaluated by the policy kernel. */
  legacy?: { reason: "pre_policy_kernel"; note: string };
}

/** Canonical metadata for one operation run. Output content lives under .voila/operations/. */
export interface OperationRun {
  id: string; // e.g. "RUN-1"
  definitionId: string;
  definitionVersion: number;
  /** Stable identifier for the operation definition content. */
  definitionFingerprint: string;
  projectId: string;
  /** Absolute repository root resolved internally from the active project, never model-supplied. */
  repositoryRoot: string;
  /** Stable worktree identity (realpath of the repository root at start). */
  worktreeIdentity: string;
  ownership: OperationRunOwnership;
  /** Effective content fingerprint before launch. */
  startingFingerprint: string;
  /** Effective content fingerprint after settlement; absent when never recorded. */
  endingFingerprint?: string;
  /** True when the relevant effective content differs at start vs end. */
  changedDuringRun: boolean;
  /** Current lifecycle state; transitions go through store-mediated updates. */
  lifecycleState: OperationLifecycleState;
  createdAt: string;
  /** When the process was actually spawned (entry into `running`). */
  startedAt?: string;
  /** When the canonical settlement was recorded. */
  settledAt?: string;
  processIdentity?: OperationProcessIdentity;
  /** True only when the owned process group was observed empty at settlement. */
  processGroupCleaned?: boolean;
  /** Final exit code for `passed`/`failed`. Absent when the run did not reach the OS exit. */
  exitCode?: number;
  /** Terminating signal for `cancelled`/`timed_out`/`supervisor_error`. */
  terminatingSignal?: string;
  /** The single canonical settlement reason. */
  settlementReason?: OperationFinalState;
  outputSummary: OperationOutputSummary;
  /** Where the bounded redacted output lives; absent for runs that produced no output. */
  outputArtifactRef?: string;
  /** Whether the parent Steward has already received the settlement. */
  deliveryState: OperationDeliveryState;
  /** Immutable record of the admission decision that authorized this run. */
  admission: OperationAdmission;
  /** When the runtime that owned this run exited unexpectedly (legacy / stale / orphaned). */
  runtimeLostAt?: string;
}

/** The authoritative current-state snapshot persisted to `.voila/project.json`. */
export interface ProjectState {
  schemaVersion: number;
  projectId: string;
  displayName: string;
  phase: Phase;
  health: Health;
  nextAction: string;
  /** Optional Steward-authored explanation of why the next action is justified. */
  nextActionRationale?: string;
  /**
   * ID of the work item currently receiving attention (the focus pointer). Distinct from lifecycle
   * status: an item may be focused while still `ready`; an `in_progress` item need not be focused.
   */
  focusWorkItemId: string | null;
  sequences: Sequences;
  workItems: WorkItem[];
  decisions: Decision[];
  assumptions: Assumption[];
  risks: Risk[];
  intakes: IntakeRecord[];
  orientations: OrientationRecord[];
  claims: Claim[];
  receipts: VerificationReceiptRecord[];
  /** Accepted operation definitions (R2A: explicit, not discovered). */
  operationDefinitions: OperationDefinition[];
  /** Canonical operation runs. Output content lives under .voila/operations/. */
  operationRuns: OperationRun[];
  /** The intake currently in flight or most recently acted on, if any. */
  currentIntakeId?: string;
  /** The orientation snapshot treated as current, if one. */
  currentOrientationId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
