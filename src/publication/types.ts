// G0 publication contracts. Pure data only: no Git, filesystem, Pi, or process access.
//
// Authority is deliberately absent from caller-controlled fields. A model may select current
// Delivery Engine boundary IDs and propose message text, but only the runtime can derive the
// immutable bindings below and only protected completion can satisfy the apply gate.

import type { ChangeStatus, DeliveryAttentionItem } from "../delivery-inspector/types.ts";

export const PUBLICATION_PLAN_FORMAT_VERSION = 1 as const;
export const PUBLICATION_POLICY_VERSION = 1 as const;
export const PUBLICATION_PLAN_TTL_MS = 30 * 60 * 1000;

export const PUBLICATION_PLAN_OUTCOMES = [
  "succeeded",
  "refused",
  "partial",
  "interrupted",
  "errored",
  "timed_out",
] as const;
export type PublicationPlanOutcome = (typeof PUBLICATION_PLAN_OUTCOMES)[number];

export type PublicationDefaultBranchSource = "remote_head" | "project_setting";

export interface PublicationPathSnapshot {
  /** Repository-relative POSIX path. */
  readonly path: string;
  /** Rename/copy source when Git reported one. */
  readonly previousPath?: string;
  readonly status: ChangeStatus;
  readonly tracked: boolean;
  readonly untracked: boolean;
  readonly mode: "regular" | "executable" | "symlink" | "deleted";
  /** sha256 of effective worktree bytes or symlink target; absent for deletion. */
  readonly contentSha256?: string;
}

export interface PublicationExpectedDiffEntry {
  /** Stable enforcement status with rename detection disabled. */
  readonly status: "A" | "M" | "D" | "T";
  readonly path: string;
}

export interface PublicationMessage {
  readonly subject: string;
  readonly body: readonly string[];
}

export interface PublicationBoundary {
  readonly boundaryId: string;
  /** Delivery Engine paths shown to the user/model. */
  readonly displayPaths: readonly string[];
  /** Literal paths passed after `--`, including rename/copy sources. */
  readonly stagePaths: readonly string[];
  /** Exact no-renames index-vs-parent membership required before object creation. */
  readonly expectedDiff: readonly PublicationExpectedDiffEntry[];
  readonly message: PublicationMessage;
}

export interface PublicationEvidenceBinding {
  readonly claimId: string;
  readonly receiptId: string;
  readonly fingerprint: string;
}

/**
 * Compact identities re-derived immediately before every effect. Digest fields bind private local
 * paths without persisting or presenting the absolute path itself.
 */
export interface PublicationBindings {
  readonly projectId: string;
  readonly workItemId: string;
  readonly completionDigest: string;
  readonly repositoryIdentityDigest: string;
  readonly worktreeIdentityDigest: string;
  readonly indexIdentityDigest: string;
  readonly defaultBranch: string;
  readonly defaultBranchSource: PublicationDefaultBranchSource;
  readonly branch: string;
  readonly branchRef: string;
  readonly head: string;
  readonly effectiveContentFingerprint: string;
  readonly rawIndexDigest: string;
  readonly changeSetDigest: string;
  readonly boundaryDigest: string;
  readonly evidenceDigest: string;
  readonly messageDigest: string;
  readonly authorIdentityDigest: string;
  readonly committerIdentityDigest: string;
  readonly packageVersion: string;
  readonly schemaVersion: number;
  readonly publicationPolicyVersion: number;
}

export interface PublicationPlan {
  readonly id: string;
  readonly formatVersion: typeof PUBLICATION_PLAN_FORMAT_VERSION;
  readonly bindings: PublicationBindings;
  readonly paths: readonly PublicationPathSnapshot[];
  readonly boundaries: readonly PublicationBoundary[];
  readonly evidence: readonly PublicationEvidenceBinding[];
  /** Must be empty for an executable v1 plan, but retained for honest inspection. */
  readonly selectedAttention: readonly DeliveryAttentionItem[];
  readonly unassignedPaths: readonly string[];
  readonly nonSelectedPaths: readonly string[];
  /** Only this plan's own runtime artifacts may be ignored by its currentness comparison. */
  readonly selfBookkeepingPaths: readonly string[];
  readonly createdAt: string;
  readonly expiresAt: string;
  /** sha256 of the canonical payload excluding this field. */
  readonly payloadSha256: string;
}

/** Current repository/canonical observations needed by the pure invalidation assessment. */
export interface PublicationCurrentObservation {
  readonly bindings: PublicationBindings;
  readonly now: string;
  readonly selectedAttentionCount: number;
  readonly unassignedPaths: readonly string[];
  readonly hasPreexistingStagedChanges: boolean;
  readonly hasUnmergedEntries: boolean;
  readonly hasOpenLinkedHighImpactRisk: boolean;
  readonly workItemCompleted: boolean;
  readonly completionRecordPresent: boolean;
  readonly activeTransaction: boolean;
  readonly localCommitDisabled: boolean;
}

export const PUBLICATION_INVALIDATION_REASONS = [
  "expired",
  "project_changed",
  "work_item_changed",
  "completion_changed",
  "repository_changed",
  "worktree_changed",
  "index_identity_changed",
  "default_branch_changed",
  "branch_changed",
  "head_changed",
  "content_changed",
  "index_changed",
  "change_membership_changed",
  "boundary_changed",
  "evidence_changed",
  "message_changed",
  "git_identity_changed",
  "package_changed",
  "schema_changed",
  "policy_changed",
  "attention_present",
  "unassigned_paths_changed",
  "preexisting_staged_changes",
  "unmerged_entries",
  "linked_high_impact_risk",
  "work_item_not_completed",
  "completion_record_missing",
  "transaction_capacity_busy",
  "local_commit_disabled",
] as const;
export type PublicationInvalidationReason = (typeof PUBLICATION_INVALIDATION_REASONS)[number];

export interface PublicationCurrentness {
  readonly current: boolean;
  /** Every failing condition, in stable policy order. */
  readonly reasons: readonly PublicationInvalidationReason[];
}
