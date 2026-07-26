// Derived readiness presentation (R1 / NF-9 acceptance criterion 4) and the verification-contract
// grouping seam (criterion 3's preparation).
//
// The defect being fixed: an item could display "READY to complete" while a required claim recorded,
// in its own words, that its evidence does not demonstrate what acceptance requires. Passing the
// automated gates is not acceptance.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/domain/defaults.ts";
import { createWorkItem, setFocusWorkItem, updateWorkItem } from "../src/domain/operations.ts";
import {
  assessCompletion,
  createClaim,
  linkReceipt,
  requireClaim,
  uniqueVerificationContractCount,
  verificationContractGroups,
  verificationContractKey,
} from "../src/domain/proof.ts";
import {
  deriveReadiness,
  heldWork,
  outstandingLimitations,
  readinessLine,
} from "../src/domain/readiness.ts";
import type { ProjectState, VerificationReceiptRecord } from "../src/domain/types.ts";

const T = "2026-07-26T00:00:00.000Z";
const FP = "a".repeat(64);
const CRITERION = "the machinery works";

function receipt(
  id: string,
  claimId: string,
  over: Partial<VerificationReceiptRecord> = {},
): VerificationReceiptRecord {
  return {
    id,
    claimId,
    executable: "npm",
    args: ["run", "verify"],
    cwdRef: ".",
    result: "passed",
    exitCode: 0,
    repositoryFingerprint: FP,
    startedAt: T,
    finishedAt: T,
    outputTruncated: false,
    artifactRef: `receipts/${id}`,
    ...over,
  };
}

/** One work item, fully gated and supported at the current fingerprint. */
function provenState(limitations: string[]): ProjectState {
  let s = createInitialState({ displayName: "readiness", now: T, projectId: "p" });
  s = createWorkItem(
    s,
    { kind: "outcome", title: "An outcome", status: "ready", acceptanceCriteria: [CRITERION] },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "the machinery works",
      confidence: "high",
      coveredAcceptanceCriteria: [CRITERION],
      knownLimitations: limitations,
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  s = linkReceipt(s, receipt("RCP-1", "CLM-1"), T);
  return s;
}

// --- Honest readiness -----------------------------------------------------------------------------

test("passing automated proof alone does not produce an unqualified ready-to-complete label", () => {
  const state = provenState([
    "The suite exercises the machinery with test inputs. It does not demonstrate an authenticated Project Steward run against a real planning document, which is what acceptance requires.",
  ]);
  const item = state.workItems[0];
  assert.ok(item);

  // The gates themselves pass: this is exactly the situation that used to read "READY to complete".
  assert.equal(assessCompletion(state, item.id, FP).ready, true);

  const readiness = deriveReadiness(state, item, FP);
  assert.equal(readiness.kind, "held");
  assert.equal(readiness.label, "HELD");
  assert.doesNotMatch(readiness.label, /READY/);
  assert.match(readiness.detail, /every automated completion gate passes/);
  assert.match(readiness.detail, /CLM-1 still records 1 outstanding limitation/);
  assert.match(readinessLine(item, readiness), /^NF-1 — HELD: /);
});

test("the hold names what acceptance still owes, in the claim's own words", () => {
  const state = provenState([
    "an authenticated Project Steward intake against a real planning document is pending",
    "the interactive tier is unobserved",
  ]);
  const item = state.workItems[0];
  assert.ok(item);
  const readiness = deriveReadiness(state, item, FP);
  assert.deepEqual(
    readiness.outstanding.map((o) => o.limitation),
    [
      "an authenticated Project Steward intake against a real planning document is pending",
      "the interactive tier is unobserved",
    ],
  );
  assert.match(readiness.detail, /2 outstanding limitation/);
});

test("an item with no recorded limitation is genuinely ready", () => {
  const state = provenState([]);
  const item = state.workItems[0];
  assert.ok(item);
  const readiness = deriveReadiness(state, item, FP);
  assert.equal(readiness.kind, "ready");
  assert.equal(readiness.label, "READY to complete");
  assert.deepEqual(readiness.outstanding, []);
});

test("a failing gate is reported as a gate failure, not as a hold", () => {
  const state = provenState(["a limitation"]);
  const item = state.workItems[0];
  assert.ok(item);
  // No current evidence: the claim is stale, so a gate fails.
  const readiness = deriveReadiness(state, item, "b".repeat(64));
  assert.equal(readiness.kind, "blocked");
  assert.match(readiness.label, /gate\(s\) failing/);
});

test("completed and cancelled items report their canonical status, not a readiness verdict", () => {
  let state = provenState(["a limitation"]);
  state = updateWorkItem(state, { id: "NF-1", status: "cancelled" }, T);
  const cancelled = state.workItems[0];
  assert.ok(cancelled);
  assert.equal(deriveReadiness(state, cancelled, FP).kind, "cancelled");
});

test("derived readiness changes only when the supported state it reads changes", () => {
  const state = provenState(["a limitation"]);
  const item = state.workItems[0];
  assert.ok(item);
  const first = deriveReadiness(state, item, FP);
  const second = deriveReadiness(state, item, FP);
  assert.deepEqual(first, second, "deterministic for identical state");

  // Discharging the limitation through a supported claim update is what changes the label.
  const cleared: ProjectState = {
    ...state,
    claims: state.claims.map((c) => ({ ...c, knownLimitations: [] })),
  };
  const clearedItem = cleared.workItems[0];
  assert.ok(clearedItem);
  assert.equal(deriveReadiness(cleared, clearedItem, FP).kind, "ready");
});

test("held work lists startable items only, and never the ones nobody was about to start", () => {
  let state = provenState(["a limitation"]);
  // A second gated item that is only on the backlog.
  state = createWorkItem(
    state,
    { kind: "task", title: "Later", status: "backlog", acceptanceCriteria: [CRITERION] },
    T,
  );
  state = createClaim(
    state,
    {
      workItemId: "NF-2",
      statement: "later work",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
      knownLimitations: ["not demonstrated"],
    },
    T,
  );
  state = requireClaim(state, { workItemId: "NF-2", claimId: "CLM-2" }, T);

  assert.deepEqual(
    heldWork(state).map((w) => w.id),
    ["NF-1"],
    "a backlog item is already stopped by its place in the plan",
  );
  assert.equal(outstandingLimitations(state, state.workItems[0]!).length, 1);
});

test("a held item is not the focus and does not displace it", () => {
  let state = provenState(["a limitation"]);
  state = createWorkItem(state, { kind: "task", title: "Active", status: "ready" }, T);
  state = setFocusWorkItem(state, "NF-2");
  assert.equal(state.focusWorkItemId, "NF-2");
  assert.deepEqual(
    heldWork(state)
      .filter((w) => w.id !== state.focusWorkItemId)
      .map((w) => w.id),
    ["NF-1"],
    "the held item is reported as held, and the focus is untouched",
  );
});

// --- Verification-contract grouping seam ----------------------------------------------------------

test("identical verification commands share one contract; different argv do not", () => {
  const same = verificationContractKey({ executable: "npm", args: ["run", "verify"], cwdRef: "." });
  assert.equal(
    same,
    verificationContractKey({ executable: "npm", args: ["run", "verify"], cwdRef: "." }),
  );
  // Argument boundaries cannot collide.
  assert.notEqual(
    verificationContractKey({ executable: "npm", args: ["run verify"], cwdRef: "." }),
    same,
  );
  // The working directory is part of the contract.
  assert.notEqual(
    verificationContractKey({ executable: "npm", args: ["run", "verify"], cwdRef: "packages/a" }),
    same,
  );
});

test("grouping is stable and reports which claims one command already serves", () => {
  let state = provenState([]);
  state = createWorkItem(
    state,
    { kind: "task", title: "Second", status: "ready", acceptanceCriteria: [CRITERION] },
    T,
  );
  state = createClaim(
    state,
    {
      workItemId: "NF-2",
      statement: "also covered by the same gate",
      confidence: "high",
      coveredAcceptanceCriteria: [CRITERION],
    },
    T,
  );
  // The same command, run again for a second claim: one contract, two executions, two claims.
  state = linkReceipt(state, receipt("RCP-2", "CLM-2"), T);
  // A different command: a second contract.
  state = linkReceipt(state, receipt("RCP-3", "CLM-2", { executable: "npm", args: ["test"] }), T);

  const groups = verificationContractGroups(state);
  assert.equal(uniqueVerificationContractCount(state), 2);
  const verify = groups.find((g) => g.args.join(" ") === "run verify");
  assert.ok(verify);
  assert.deepEqual(verify.claimIds, ["CLM-1", "CLM-2"], "one command serves both claims");
  assert.deepEqual(verify.receiptIds, ["RCP-1", "RCP-2"], "two executions of the same contract");
  assert.deepEqual(
    verificationContractGroups(state),
    groups,
    "grouping is deterministic for identical state",
  );
});

test("the grouping seam executes nothing and deduplicates no history", () => {
  const state = provenState([]);
  const before = JSON.stringify(state);
  verificationContractGroups(state);
  uniqueVerificationContractCount(state);
  assert.equal(JSON.stringify(state), before, "grouping is pure; receipts are untouched");
});
