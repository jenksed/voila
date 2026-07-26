// Pure claim domain: ID allocation, references, exact criterion coverage, updates, requirement
// linking, and derived evaluation. No I/O and no git.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/domain/defaults.ts";
import { createWorkItem, updateWorkItem } from "../src/domain/operations.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";
import {
  createClaim,
  criterionCoverage,
  detachClaim,
  evaluateClaim,
  evaluateAllClaims,
  findClaim,
  findReceipt,
  linkReceipt,
  listClaims,
  proofSummary,
  receiptsForClaim,
  requireClaim,
  updateClaim,
} from "../src/domain/proof.ts";
import type { ProjectState, VerificationReceiptRecord } from "../src/domain/types.ts";

const T = "2026-07-25T00:00:00.000Z";
const FP_A = "a".repeat(64);
const FP_B = "b".repeat(64);

const CRITERION_1 = "the completion transition rejects unsupported claims";
const CRITERION_2 = "receipts are immutable once written";

/** A project with one work item (NF-1) carrying two acceptance criteria. */
function baseState(): ProjectState {
  let s = createInitialState({ displayName: "proof-demo", now: T, projectId: "pid" });
  s = createWorkItem(
    s,
    {
      kind: "outcome",
      title: "Proof engine",
      status: "in_progress",
      acceptanceCriteria: [CRITERION_1, CRITERION_2],
    },
    T,
  );
  return s;
}

function receipt(
  id: string,
  claimId: string,
  result: VerificationReceiptRecord["result"],
  fingerprint: string,
): VerificationReceiptRecord {
  return {
    id,
    claimId,
    result,
    artifactRef: `receipts/${id}`,
    executable: "npm",
    args: ["test"],
    cwdRef: ".",
    exitCode: result === "passed" ? 0 : 1,
    startedAt: T,
    finishedAt: T,
    repositoryFingerprint: fingerprint,
    outputTruncated: false,
  };
}

test("claim IDs come from the canonical counter as CLM-n", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "The gate rejects unsupported completion.",
      confidence: "high",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  assert.equal(s.claims[0]?.id, "CLM-1");
  assert.equal(s.sequences.claim, 2);
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "Receipts are never rewritten.",
      confidence: "medium",
      coveredAcceptanceCriteria: [CRITERION_2],
    },
    T,
  );
  assert.equal(s.claims[1]?.id, "CLM-2");
  assert.equal(s.sequences.claim, 3);
});

test("a claim records no support flag and starts with no receipts", () => {
  const s = createClaim(
    baseState(),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
      knownLimitations: ["does not cover interactive use"],
    },
    T,
  );
  const claim = s.claims[0];
  assert.ok(claim);
  assert.deepEqual(claim.receiptIds, []);
  assert.deepEqual(claim.knownLimitations, ["does not cover interactive use"]);
  assert.equal("supported" in claim, false, "no manual support flag exists on the record");
});

test("a claim must reference an existing work item", () => {
  assert.throws(
    () =>
      createClaim(
        baseState(),
        {
          workItemId: "NF-99",
          statement: "x",
          confidence: "low",
          coveredAcceptanceCriteria: [CRITERION_1],
        },
        T,
      ),
    /Work item not found: NF-99/,
  );
});

test("covered criteria must match the work item's criteria EXACTLY", () => {
  const s = baseState();
  // Near-miss text is refused, not fuzzily matched.
  for (const bad of [
    "The completion transition rejects unsupported claims",
    `${CRITERION_1} `,
    CRITERION_1.slice(0, -1),
    "something else entirely",
  ]) {
    assert.throws(
      () =>
        createClaim(
          s,
          {
            workItemId: "NF-1",
            statement: "x",
            confidence: "low",
            coveredAcceptanceCriteria: [bad],
          },
          T,
        ),
      ProjectOperationError,
      `refuses "${bad}"`,
    );
  }
});

test("a claim must cover at least one criterion, and duplicates collapse", () => {
  const s = baseState();
  assert.throws(
    () =>
      createClaim(
        s,
        { workItemId: "NF-1", statement: "x", confidence: "low", coveredAcceptanceCriteria: [] },
        T,
      ),
    /must cover at least one acceptance criterion/,
  );
  const withDupes = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1, CRITERION_1],
    },
    T,
  );
  assert.deepEqual(withDupes.claims[0]?.coveredAcceptanceCriteria, [CRITERION_1]);
});

test("a work item with no acceptance criteria cannot have a claim created for it", () => {
  let s = createInitialState({ displayName: "d", now: T, projectId: "p" });
  s = createWorkItem(s, { kind: "task", title: "No criteria" }, T);
  // Inventing a criterion is refused, and the error names the item's (empty) real criteria.
  assert.throws(
    () =>
      createClaim(
        s,
        {
          workItemId: "NF-1",
          statement: "x",
          confidence: "low",
          coveredAcceptanceCriteria: ["invented"],
        },
        T,
      ),
    /not an exact acceptance criterion of NF-1[\s\S]*current criteria: \(none\)/,
  );
  // An empty coverage list points at the real fix: record acceptance criteria first.
  assert.throws(
    () =>
      createClaim(
        s,
        { workItemId: "NF-1", statement: "x", confidence: "low", coveredAcceptanceCriteria: [] },
        T,
      ),
    /none recorded — add acceptance criteria first/,
  );
});

test("updateClaim changes permitted fields and never rewrites receipt history", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "first",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP_A), T);
  const before = s.claims[0]?.receiptIds.slice();

  s = updateClaim(
    s,
    {
      id: "CLM-1",
      statement: "revised",
      confidence: "high",
      coveredAcceptanceCriteria: [CRITERION_1, CRITERION_2],
      knownLimitations: ["only automated coverage"],
    },
    "2026-07-26T00:00:00.000Z",
  );
  const claim = s.claims[0];
  assert.equal(claim?.statement, "revised");
  assert.equal(claim?.confidence, "high");
  assert.deepEqual(claim?.coveredAcceptanceCriteria, [CRITERION_1, CRITERION_2]);
  assert.deepEqual(claim?.knownLimitations, ["only automated coverage"]);
  assert.deepEqual(claim?.receiptIds, before, "receipt links are untouched");
  assert.equal(claim?.workItemId, "NF-1", "the work item reference is immutable");
  assert.equal(s.receipts[0]?.result, "passed", "the historical receipt is unchanged");
  assert.equal(s.receipts[0]?.repositoryFingerprint, FP_A);
});

test("updateClaim rejects unknown claims and non-exact criteria", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  assert.throws(() => updateClaim(s, { id: "CLM-9", statement: "y" }, T), /Claim not found/);
  assert.throws(
    () => updateClaim(s, { id: "CLM-1", coveredAcceptanceCriteria: ["nope"] }, T),
    /not an exact acceptance criterion/,
  );
  assert.throws(() => updateClaim(s, { id: "CLM-1", statement: "  " }, T), /statement is required/);
  assert.throws(
    () => updateClaim(s, { id: "CLM-1", confidence: "certain" as never }, T),
    /Invalid confidence/,
  );
});

test("requireClaim links a claim as a completion requirement, rejecting duplicates and cross-links", () => {
  let s = baseState();
  s = createWorkItem(s, { kind: "task", title: "Other", acceptanceCriteria: ["other thing"] }, T);
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  assert.deepEqual(s.workItems[0]?.requiredClaimIds, ["CLM-1"]);

  assert.throws(
    () => requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T),
    /already a required claim/,
  );
  assert.throws(
    () => requireClaim(s, { workItemId: "NF-2", claimId: "CLM-1" }, T),
    /is about NF-1, not NF-2/,
  );
  assert.throws(
    () => requireClaim(s, { workItemId: "NF-1", claimId: "CLM-9" }, T),
    /Claim not found/,
  );
  assert.throws(
    () => requireClaim(s, { workItemId: "NF-9", claimId: "CLM-1" }, T),
    /Work item not found/,
  );
});

test("detachClaim removes a requirement while open, and refuses on completed work", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  const detached = detachClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  assert.deepEqual(detached.workItems[0]?.requiredClaimIds, []);
  assert.throws(
    () => detachClaim(s, { workItemId: "NF-1", claimId: "CLM-2" }, T),
    /not a required claim/,
  );

  // Simulate a completed item: requirements are part of the completion record.
  const completed: ProjectState = {
    ...s,
    workItems: s.workItems.map((w) => ({ ...w, status: "completed" as const })),
  };
  assert.throws(
    () => detachClaim(completed, { workItemId: "NF-1", claimId: "CLM-1" }, T),
    /Cannot remove proof requirements from completed work item/,
  );
  assert.throws(
    () => requireClaim(completed, { workItemId: "NF-1", claimId: "CLM-1" }, T),
    /already a required claim/,
  );
});

test("linkReceipt appends to the claim and rejects duplicate receipt IDs", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "failed", FP_A), T);
  s = linkReceipt(s, receipt("RCP-2", "CLM-1", "passed", FP_A), T);
  assert.deepEqual(s.claims[0]?.receiptIds, ["RCP-1", "RCP-2"]);
  assert.equal(s.receipts.length, 2);
  assert.throws(
    () => linkReceipt(s, receipt("RCP-2", "CLM-1", "passed", FP_A), T),
    /already exists; receipts are immutable/,
  );
  assert.throws(
    () => linkReceipt(s, receipt("RCP-3", "CLM-9", "passed", FP_A), T),
    /Claim not found/,
  );
});

test("evaluation is derived: pending, supported, unsupported, and stale", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  const claim = () => findClaim(s, "CLM-1");

  // pending: no receipt at all
  assert.equal(evaluateClaim(s, claim(), FP_A).status, "pending");
  assert.match(evaluateClaim(s, claim(), FP_A).reason, /no verification receipt/);

  // unsupported: newest current receipt failed
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "failed", FP_A), T);
  let evaluation = evaluateClaim(s, claim(), FP_A);
  assert.equal(evaluation.status, "unsupported");
  assert.equal(evaluation.currentReceiptId, "RCP-1");

  // supported: a newer current receipt passed
  s = linkReceipt(s, receipt("RCP-2", "CLM-1", "passed", FP_A), T);
  evaluation = evaluateClaim(s, claim(), FP_A);
  assert.equal(evaluation.status, "supported");
  assert.equal(evaluation.currentReceiptId, "RCP-2");
  assert.equal(evaluation.receiptCount, 2);

  // stale: the repository moved; no receipt matches the new fingerprint
  evaluation = evaluateClaim(s, claim(), FP_B);
  assert.equal(evaluation.status, "stale");
  assert.equal(evaluation.currentReceiptId, undefined);
  assert.equal(evaluation.latestReceiptId, "RCP-2", "the newest receipt is still reported");

  // no fingerprint at all: nothing can be current, so evidence is stale, never optimistic
  assert.equal(evaluateClaim(s, claim(), null).status, "stale");
  assert.match(evaluateClaim(s, claim(), null).reason, /fingerprint is unavailable/);
});

test("a newer failing receipt at the current fingerprint overrides an older pass", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP_A), T);
  s = linkReceipt(s, receipt("RCP-2", "CLM-1", "timed_out", FP_A), T);
  const evaluation = evaluateClaim(s, findClaim(s, "CLM-1"), FP_A);
  assert.equal(evaluation.status, "unsupported");
  assert.match(evaluation.reason, /timed out/);
});

test("an older receipt still matching the current fingerprint keeps a claim supported", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  // RCP-1 passed at the CURRENT fingerprint; RCP-2 ran at a different (older/other) state.
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP_A), T);
  s = linkReceipt(s, receipt("RCP-2", "CLM-1", "failed", FP_B), T);
  assert.equal(evaluateClaim(s, findClaim(s, "CLM-1"), FP_A).status, "supported");
});

test("receiptsForClaim ignores unresolvable links rather than throwing", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = { ...s, claims: s.claims.map((c) => ({ ...c, receiptIds: ["RCP-404"] })) };
  assert.deepEqual(receiptsForClaim(s, findClaim(s, "CLM-1")), []);
  assert.equal(evaluateClaim(s, findClaim(s, "CLM-1"), FP_A).status, "pending");
  assert.throws(() => findReceipt(s, "RCP-404"), /Receipt not found/);
});

test("criterionCoverage reflects only REQUIRED claims", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "a",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  // Not required yet: coverage is empty.
  let coverage = criterionCoverage(s, s.workItems[0]!);
  assert.deepEqual(
    coverage.map((c) => c.covered),
    [false, false],
  );

  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  coverage = criterionCoverage(s, s.workItems[0]!);
  assert.deepEqual(
    coverage.map((c) => c.covered),
    [true, false],
  );
  assert.deepEqual(coverage[0]?.claimIds, ["CLM-1"]);

  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "b",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_2],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-2" }, T);
  coverage = criterionCoverage(s, s.workItems[0]!);
  assert.deepEqual(
    coverage.map((c) => c.covered),
    [true, true],
  );
});

test("editing a work item's acceptance criteria can orphan existing coverage", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "a",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  // Rewriting the criteria leaves the claim covering text the item no longer states.
  s = updateWorkItem(s, { id: "NF-1", acceptanceCriteria: ["a totally new criterion"] }, T);
  const coverage = criterionCoverage(s, s.workItems[0]!);
  assert.deepEqual(coverage, [
    { criterion: "a totally new criterion", claimIds: [], covered: false },
  ]);
});

test("listClaims and proofSummary aggregate derived status", () => {
  let s = baseState();
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "a",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_1],
    },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "b",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION_2],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP_A), T);

  const all = listClaims(s, FP_A);
  assert.equal(all.length, 2);
  assert.equal(all[0]?.required, true);
  assert.equal(all[1]?.required, false);
  assert.equal(all[0]?.evaluation.status, "supported");
  assert.equal(all[1]?.evaluation.status, "pending");

  assert.deepEqual(
    listClaims(s, FP_A, { status: "supported" }).map((r) => r.claim.id),
    ["CLM-1"],
  );
  assert.deepEqual(
    listClaims(s, FP_A, { workItemId: "NF-1" }).map((r) => r.claim.id),
    ["CLM-1", "CLM-2"],
  );
  assert.deepEqual(listClaims(s, FP_A, { workItemId: "NF-2" }), []);

  const summary = proofSummary(s, FP_A);
  assert.deepEqual(summary, {
    total: 2,
    pending: 1,
    supported: 1,
    unsupported: 0,
    stale: 0,
    fingerprintAvailable: true,
  });
  assert.equal(proofSummary(s, null).fingerprintAvailable, false);
  assert.equal(proofSummary(s, FP_B).stale, 1);

  const map = evaluateAllClaims(s, FP_A);
  assert.equal(map.get("CLM-1")?.status, "supported");
  assert.equal(map.get("CLM-2")?.status, "pending");
});

test("claims are never deleted: no domain function removes one", async () => {
  const proof = (await import("../src/domain/proof.ts")) as Record<string, unknown>;
  const removers = Object.keys(proof).filter((k) => /delete|remove|drop/i.test(k));
  assert.deepEqual(removers, [], "no delete/remove claim operation is exported");
});
