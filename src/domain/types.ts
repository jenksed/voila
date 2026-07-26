// Canonical Voila project-state types (schema version 4). Pure domain — no Pi, no I/O.

/**
 * Current schema version. Earlier versions are migrated explicitly and never silently:
 * v1 (Packet 1) -> v2 (Packet 2 operations) -> v3 (Packet 3 intake + orientation) ->
 * v4 (Packet 4 claims + verification receipts + protected completion). See migrate.ts.
 */
export const SCHEMA_VERSION = 4;

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
  /** The intake currently in flight or most recently acted on, if any. */
  currentIntakeId?: string;
  /** The orientation snapshot treated as current, if any. */
  currentOrientationId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
