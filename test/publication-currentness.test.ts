import assert from "node:assert/strict";
import { test } from "node:test";

import { assessPublicationCurrentness } from "../src/publication/currentness.ts";
import type {
  PublicationBindings,
  PublicationCurrentObservation,
  PublicationPlan,
} from "../src/publication/types.ts";

const bindings: PublicationBindings = {
  projectId: "project-a",
  workItemId: "NF-23",
  completionDigest: "completion-a",
  repositoryIdentityDigest: "repository-a",
  worktreeIdentityDigest: "worktree-a",
  indexIdentityDigest: "index-identity-a",
  defaultBranch: "main",
  defaultBranchSource: "remote_head",
  branch: "feat/g0",
  branchRef: "refs/heads/feat/g0",
  head: "a".repeat(40),
  effectiveContentFingerprint: "content-a",
  rawIndexDigest: "index-a",
  changeSetDigest: "changes-a",
  boundaryDigest: "boundaries-a",
  evidenceDigest: "evidence-a",
  messageDigest: "messages-a",
  authorIdentityDigest: "author-a",
  committerIdentityDigest: "committer-a",
  packageVersion: "0.1.0-alpha.1",
  schemaVersion: 6,
  publicationPolicyVersion: 1,
};

const plan: PublicationPlan = {
  id: "PUB-0123456789ab",
  formatVersion: 1,
  bindings,
  paths: [],
  boundaries: [],
  evidence: [],
  selectedAttention: [],
  unassignedPaths: ["notes.unknown"],
  nonSelectedPaths: ["notes.unknown"],
  selfBookkeepingPaths: [".voila/publications/plans/PUB-0123456789ab.json"],
  createdAt: "2026-07-27T00:00:00.000Z",
  expiresAt: "2026-07-27T00:30:00.000Z",
  payloadSha256: "payload-a",
};

const observation: PublicationCurrentObservation = {
  bindings,
  now: "2026-07-27T00:10:00.000Z",
  selectedAttentionCount: 0,
  unassignedPaths: ["notes.unknown"],
  hasPreexistingStagedChanges: false,
  hasUnmergedEntries: false,
  hasOpenLinkedHighImpactRisk: false,
  workItemCompleted: true,
  completionRecordPresent: true,
  activeTransaction: false,
  localCommitDisabled: false,
};

test("an unchanged protected-complete publication plan is current", () => {
  assert.deepEqual(assessPublicationCurrentness(plan, observation), {
    current: true,
    reasons: [],
  });
});

test("binding drift is reported completely and in stable policy order", () => {
  const drifted: PublicationBindings = {
    ...bindings,
    projectId: "project-b",
    workItemId: "NF-24",
    completionDigest: "completion-b",
    repositoryIdentityDigest: "repository-b",
    worktreeIdentityDigest: "worktree-b",
    indexIdentityDigest: "index-identity-b",
    defaultBranch: "trunk",
    defaultBranchSource: "project_setting",
    branch: "feat/other",
    branchRef: "refs/heads/feat/other",
    head: "b".repeat(40),
    effectiveContentFingerprint: "content-b",
    rawIndexDigest: "index-b",
    changeSetDigest: "changes-b",
    boundaryDigest: "boundaries-b",
    evidenceDigest: "evidence-b",
    messageDigest: "messages-b",
    authorIdentityDigest: "author-b",
    committerIdentityDigest: "committer-b",
    packageVersion: "0.2.0",
    schemaVersion: 7,
    publicationPolicyVersion: 2,
  };

  assert.deepEqual(
    assessPublicationCurrentness(plan, { ...observation, bindings: drifted }).reasons,
    [
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
    ],
  );
});

test("every non-binding gate fails closed without hiding another reason", () => {
  const result = assessPublicationCurrentness(
    { ...plan, selectedAttention: [{} as PublicationPlan["selectedAttention"][number]] },
    {
      ...observation,
      now: plan.expiresAt,
      selectedAttentionCount: 1,
      unassignedPaths: ["different.unknown"],
      hasPreexistingStagedChanges: true,
      hasUnmergedEntries: true,
      hasOpenLinkedHighImpactRisk: true,
      workItemCompleted: false,
      completionRecordPresent: false,
      activeTransaction: true,
      localCommitDisabled: true,
    },
  );

  assert.equal(result.current, false);
  assert.deepEqual(result.reasons, [
    "expired",
    "attention_present",
    "unassigned_paths_changed",
    "preexisting_staged_changes",
    "unmerged_entries",
    "linked_high_impact_risk",
    "work_item_not_completed",
    "completion_record_missing",
    "transaction_capacity_busy",
    "local_commit_disabled",
  ]);
});

test("invalid timestamps expire rather than accidentally extending authority", () => {
  assert.deepEqual(
    assessPublicationCurrentness(
      { ...plan, expiresAt: "not-a-time" },
      { ...observation, now: "also-not-a-time" },
    ).reasons,
    ["expired"],
  );
});
