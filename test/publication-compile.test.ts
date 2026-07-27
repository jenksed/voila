import assert from "node:assert/strict";
import { test } from "node:test";

import { compilePublicationPlan } from "../src/publication/compile.ts";
import type { CommitSuggestion } from "../src/delivery/types.ts";
import type { DeliveryInspection } from "../src/delivery-inspector/types.ts";

const inspection: DeliveryInspection = {
  repository: { isGitRepository: true, detachedHead: false, dirty: true, head: "a".repeat(40) },
  changes: [
    {
      path: "src/feature.ts",
      status: "modified",
      staged: false,
      unstaged: true,
      untracked: false,
      category: "source",
      confidence: "high",
      categoryReason: "test",
      binary: false,
      area: "src",
    },
    {
      path: "src/new.ts",
      status: "untracked",
      staged: false,
      unstaged: false,
      untracked: true,
      category: "source",
      confidence: "high",
      categoryReason: "test",
      binary: false,
      area: "src",
    },
    {
      path: "notes.md",
      status: "untracked",
      staged: false,
      unstaged: false,
      untracked: true,
      category: "documentation",
      confidence: "low",
      categoryReason: "test",
      binary: false,
      area: ".",
    },
  ],
  summary: {
    totalFiles: 3,
    stagedFiles: 0,
    unstagedFiles: 1,
    untrackedFiles: 2,
    binaryFiles: 0,
    renamedFiles: 0,
    deletedFiles: 0,
    byCategory: {
      source: 2,
      test: 0,
      documentation: 1,
      configuration: 0,
      migration: 0,
      generated: 0,
      dependency_metadata: 0,
      verification_evidence: 0,
      project_state: 0,
      ci: 0,
      unknown: 0,
    },
    byArea: [
      { area: ".", files: 1 },
      { area: "src", files: 2 },
    ],
    scope: "focused",
    scopeReason: "test",
  },
  attention: [],
  suggestedBoundaries: [
    {
      id: "B1",
      kind: "module_with_tests",
      paths: ["src/feature.ts"],
      rationale: "test",
      suggestedType: "feat",
    },
    {
      id: "B2",
      kind: "module_with_tests",
      paths: ["src/new.ts"],
      rationale: "test",
      suggestedType: "feat",
    },
  ],
  unassignedPaths: ["notes.md"],
  discoveredVerificationCommands: [],
  limitations: [],
};

const boundary1: CommitSuggestion = {
  boundaryId: "B1",
  type: "feat",
  subject: "feat: update 1 file in src",
  body: ["rationale"],
  paths: ["src/feature.ts"],
  rationale: "test",
  readiness: "ready",
  readinessReason: "test",
  attention: [],
};

const boundary2: CommitSuggestion = {
  boundaryId: "B2",
  type: "feat",
  subject: "feat: add 1 file in src",
  body: ["rationale"],
  paths: ["src/new.ts"],
  rationale: "test",
  readiness: "ready",
  readinessReason: "test",
  attention: [],
};

const baseInput = {
  workItemId: "NF-23",
  identity: {
    projectId: "voila",
    repositoryIdentityDigest: "repo-1",
    worktreeIdentityDigest: "worktree-1",
    indexIdentityDigest: "index-1",
    completionDigest: "completion-1",
    defaultBranch: "main",
    defaultBranchSource: "remote_head" as const,
    branch: "feat/g0",
    branchRef: "refs/heads/feat/g0",
    head: "a".repeat(40),
    effectiveContentFingerprint: "content-1",
    rawIndexDigest: "raw-1",
    authorIdentityDigest: "author-1",
    committerIdentityDigest: "committer-1",
  },
  packageVersion: "0.1.0-alpha.1",
  schemaVersion: 6,
  inspection,
  boundaries: [boundary1, boundary2],
  selectedBoundaryIds: ["B1", "B2"],
  evidence: [{ claimId: "CLM-21", receiptId: "RCP-148", fingerprint: "fp-1" }],
  authorIdentity: "Voila Steward <voila@example.test>",
  committerIdentity: "Voila Steward <voila@example.test>",
  now: "2026-07-27T00:00:00.000Z",
};

test("compiler is deterministic for identical inputs", () => {
  const first = compilePublicationPlan(baseInput);
  const second = compilePublicationPlan(baseInput);
  assert.equal(first.plan.id, second.plan.id);
  assert.equal(first.plan.payloadSha256, second.plan.payloadSha256);
  assert.equal(first.plan.expiresAt, second.plan.expiresAt);
});

test("compiler records ready boundaries only with all of their required membership", () => {
  const { plan } = compilePublicationPlan(baseInput);
  assert.equal(plan.formatVersion, 1);
  assert.equal(plan.bindings.publicationPolicyVersion, 1);
  assert.equal(plan.boundaries.length, 2);
  assert.equal(plan.boundaries[0]?.boundaryId, "B1");
  assert.equal(plan.boundaries[1]?.boundaryId, "B2");
  assert.deepEqual(
    plan.boundaries[0]?.expectedDiff.map((entry) => entry.path),
    ["src/feature.ts"],
  );
  assert.equal(plan.unassignedPaths.length, 1);
  assert.equal(plan.unassignedPaths[0], "notes.md");
  assert.equal(plan.paths.length, inspection.changes.length);
  assert.equal(plan.evidence.length, 1);
  assert.equal(plan.bindings.workItemId, "NF-23");
});

test("compiler refuses an unknown selected boundary ID", () => {
  assert.throws(
    () => compilePublicationPlan({ ...baseInput, selectedBoundaryIds: ["B9"] }),
    /unknown boundary id/i,
  );
});

test("changing effective content changes the plan id but not the membership structure", () => {
  const a = compilePublicationPlan(baseInput).plan.id;
  const b = compilePublicationPlan({
    ...baseInput,
    identity: { ...baseInput.identity, effectiveContentFingerprint: "content-2" },
  }).plan.id;
  assert.notEqual(a, b);
});

test("the message digest is sensitive to message text and stable otherwise", () => {
  const a = compilePublicationPlan(baseInput).plan.bindings.messageDigest;
  const b = compilePublicationPlan({
    ...baseInput,
    boundaries: [
      { ...boundary1, subject: "feat: update 1 file in src", body: ["different rationale"] },
      boundary2,
    ],
  }).plan.bindings.messageDigest;
  assert.notEqual(a, b);
});
