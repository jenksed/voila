// Canonical NewFang project-state types (schema version 2). Pure domain — no Pi, no I/O.

/**
 * Current schema version. Earlier versions are migrated explicitly and never silently:
 * v1 (Packet 1) -> v2 (Packet 2 operations) -> v3 (Packet 3 intake + orientation). See migrate.ts.
 */
export const SCHEMA_VERSION = 3;

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

/** `completed` is reserved for the future newfang_complete_work_item transition (not in this packet). */
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
 * generated understanding view live as artifacts under `.newfang/intakes/<id>/` — never inline here.
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

// --- Sequence counters (next value to allocate; stored in canonical state) ---

export interface Sequences {
  workItem: number;
  decision: number;
  assumption: number;
  risk: number;
  intake: number;
  orientation: number;
}

/** The authoritative current-state snapshot persisted to `.newfang/project.json`. */
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
  /** The intake currently in flight or most recently acted on, if any. */
  currentIntakeId?: string;
  /** The orientation snapshot treated as current, if any. */
  currentOrientationId?: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
}
