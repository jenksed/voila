// Pure PublicationPlan invalidation. Every condition is evaluated so callers receive the complete
// refusal picture rather than repairing one drift only to discover another.

import type {
  PublicationBindings,
  PublicationCurrentObservation,
  PublicationCurrentness,
  PublicationInvalidationReason,
  PublicationPlan,
} from "./types.ts";

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function invalidOrExpired(expiresAt: string, now: string): boolean {
  const expiry = Date.parse(expiresAt);
  const observed = Date.parse(now);
  return !Number.isFinite(expiry) || !Number.isFinite(observed) || observed >= expiry;
}

function compareBindings(
  expected: PublicationBindings,
  actual: PublicationBindings,
  reasons: PublicationInvalidationReason[],
): void {
  if (actual.projectId !== expected.projectId) reasons.push("project_changed");
  if (actual.workItemId !== expected.workItemId) reasons.push("work_item_changed");
  if (actual.completionDigest !== expected.completionDigest) reasons.push("completion_changed");
  if (actual.repositoryIdentityDigest !== expected.repositoryIdentityDigest) {
    reasons.push("repository_changed");
  }
  if (actual.worktreeIdentityDigest !== expected.worktreeIdentityDigest) {
    reasons.push("worktree_changed");
  }
  if (actual.indexIdentityDigest !== expected.indexIdentityDigest) {
    reasons.push("index_identity_changed");
  }
  if (
    actual.defaultBranch !== expected.defaultBranch ||
    actual.defaultBranchSource !== expected.defaultBranchSource
  ) {
    reasons.push("default_branch_changed");
  }
  if (actual.branch !== expected.branch || actual.branchRef !== expected.branchRef) {
    reasons.push("branch_changed");
  }
  if (actual.head !== expected.head) reasons.push("head_changed");
  if (actual.effectiveContentFingerprint !== expected.effectiveContentFingerprint) {
    reasons.push("content_changed");
  }
  if (actual.rawIndexDigest !== expected.rawIndexDigest) reasons.push("index_changed");
  if (actual.changeSetDigest !== expected.changeSetDigest) {
    reasons.push("change_membership_changed");
  }
  if (actual.boundaryDigest !== expected.boundaryDigest) reasons.push("boundary_changed");
  if (actual.evidenceDigest !== expected.evidenceDigest) reasons.push("evidence_changed");
  if (actual.messageDigest !== expected.messageDigest) reasons.push("message_changed");
  if (
    actual.authorIdentityDigest !== expected.authorIdentityDigest ||
    actual.committerIdentityDigest !== expected.committerIdentityDigest
  ) {
    reasons.push("git_identity_changed");
  }
  if (actual.packageVersion !== expected.packageVersion) reasons.push("package_changed");
  if (actual.schemaVersion !== expected.schemaVersion) reasons.push("schema_changed");
  if (actual.publicationPolicyVersion !== expected.publicationPolicyVersion) {
    reasons.push("policy_changed");
  }
}

/** Assess a plan without mutating it or the observation. Reasons are emitted in stable policy order. */
export function assessPublicationCurrentness(
  plan: Readonly<PublicationPlan>,
  observation: Readonly<PublicationCurrentObservation>,
): PublicationCurrentness {
  const reasons: PublicationInvalidationReason[] = [];

  if (invalidOrExpired(plan.expiresAt, observation.now)) reasons.push("expired");
  compareBindings(plan.bindings, observation.bindings, reasons);

  if (observation.selectedAttentionCount > 0 || plan.selectedAttention.length > 0) {
    reasons.push("attention_present");
  }
  if (!sameStrings(observation.unassignedPaths, plan.unassignedPaths)) {
    reasons.push("unassigned_paths_changed");
  }
  if (observation.hasPreexistingStagedChanges) reasons.push("preexisting_staged_changes");
  if (observation.hasUnmergedEntries) reasons.push("unmerged_entries");
  if (observation.hasOpenLinkedHighImpactRisk) reasons.push("linked_high_impact_risk");
  if (!observation.workItemCompleted) reasons.push("work_item_not_completed");
  if (!observation.completionRecordPresent) reasons.push("completion_record_missing");
  if (observation.activeTransaction) reasons.push("transaction_capacity_busy");
  if (observation.localCommitDisabled) reasons.push("local_commit_disabled");

  return { current: reasons.length === 0, reasons };
}
