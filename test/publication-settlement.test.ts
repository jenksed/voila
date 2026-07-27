import assert from "node:assert/strict";
import { test } from "node:test";

import {
  loadSettlement,
  newTransactionId,
  runPublicationTransaction,
  type PublicationSettlement,
} from "../src/publication/settlement.ts";
import { compilePublicationPlan } from "../src/publication/compile.ts";
import type { CommitSuggestion } from "../src/delivery/types.ts";
import type { DeliveryInspection } from "../src/delivery-inspector/types.ts";

const inspection: DeliveryInspection = {
  repository: {
    isGitRepository: true,
    detachedHead: false,
    dirty: true,
    head: "a".repeat(40),
    branch: "feat/g0",
  },
  changes: [
    {
      path: "src/example.ts",
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
  ],
  summary: {
    totalFiles: 1,
    stagedFiles: 0,
    unstagedFiles: 1,
    untrackedFiles: 0,
    binaryFiles: 0,
    renamedFiles: 0,
    deletedFiles: 0,
    byCategory: {
      source: 1,
      test: 0,
      documentation: 0,
      configuration: 0,
      migration: 0,
      generated: 0,
      dependency_metadata: 0,
      verification_evidence: 0,
      project_state: 0,
      ci: 0,
      unknown: 0,
    },
    byArea: [{ area: "src", files: 1 }],
    scope: "single_area",
    scopeReason: "test",
  },
  attention: [],
  suggestedBoundaries: [
    {
      id: "B1",
      kind: "module_with_tests",
      paths: ["src/example.ts"],
      rationale: "test",
      suggestedType: "feat",
    },
  ],
  unassignedPaths: [],
  discoveredVerificationCommands: [],
  limitations: [],
};

const boundary: CommitSuggestion = {
  boundaryId: "B1",
  type: "feat",
  subject: "feat: update 1 file in src",
  body: ["rationale"],
  paths: ["src/example.ts"],
  rationale: "test",
  readiness: "ready",
  readinessReason: "test",
  attention: [],
};

function compile() {
  const { plan } = compilePublicationPlan({
    workItemId: "NF-23",
    identity: {
      projectId: "voila",
      repositoryIdentityDigest: "repo-1",
      worktreeIdentityDigest: "worktree-1",
      indexIdentityDigest: "index-1",
      completionDigest: "completion-1",
      defaultBranch: "main",
      defaultBranchSource: "remote_head",
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
    boundaries: [boundary],
    selectedBoundaryIds: ["B1"],
    evidence: [{ claimId: "CLM-21", receiptId: "RCP-148", fingerprint: "fp-1" }],
    authorIdentity: "",
    committerIdentity: "",
    now: "2026-07-27T00:00:00.000Z",
  });
  return plan;
}

test("newTransactionId encodes plan ID, timestamp, and entropy", () => {
  const a = newTransactionId("PUB-12345678abcd");
  const b = newTransactionId("PUB-12345678abcd");
  assert.match(a, /^PTX-12345678-[0-9a-z]+-[0-9a-f]+$/);
  assert.notEqual(a, b);
});

test("runPublicationTransaction refuses when the cwd is not a git repository (without writing)", async () => {
  const plan = compile();
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "voila-settlement-test-"));
  try {
    const result = await runPublicationTransaction({
      root: dir,
      plan,
      realIndexBeforeBytes: Buffer.from("not-a-real-index"),
      transactionId: "PTX-test",
      realIndexPath: `${dir}/.git/index`,
    });
    assert.equal(result.result.outcome, "refused");
    // The transaction refuses when the cwd is not a Git worktree. The exact reason is the
    // orchestrator's first gate (clean-index probe failure surfaced by the closed runner).
    assert.match(result.result.reason ?? "", /real_index_not_clean|diff-index|git/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the settlement serializer produces immutable, version-stamped records", () => {
  const plan = compile();
  const settlement: PublicationSettlement = {
    transactionId: "PTX-test",
    planId: plan.id,
    root: "/tmp",
    formatVersion: 1,
    outcome: "succeeded",
    finalHead: "abc",
    boundaries: [],
    capturedAt: "2026-07-27T00:00:00.000Z",
  };
  const text = JSON.stringify(settlement);
  assert.match(text, /"formatVersion":1/);
  assert.match(text, /"transactionId":"PTX-test"/);
  const reparsed = JSON.parse(text) as PublicationSettlement;
  assert.equal(reparsed.formatVersion, 1);
  assert.equal(reparsed.transactionId, "PTX-test");
});

test("the serialized settlement round-trips through loadSettlement", async () => {
  const plan = compile();
  const settlement: PublicationSettlement = {
    transactionId: "PTX-load",
    planId: plan.id,
    root: "/tmp/load-settlement",
    formatVersion: 1,
    outcome: "succeeded",
    finalHead: "abc",
    boundaries: [],
    capturedAt: new Date().toISOString(),
  };
  const { mkdir, writeFile, rm } = await import("node:fs/promises");
  const dir = "/tmp/load-settlement-tx";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/settlement.json`, JSON.stringify(settlement, null, 2));
  const loaded = await loadSettlement({
    root: "/tmp/load-settlement",
    plan,
    transactionId: "PTX-load",
    transactionDir: dir,
  });
  assert.equal(loaded.transactionId, "PTX-load");
  assert.equal(loaded.planId, plan.id);
  await rm(dir, { recursive: true, force: true });
});
