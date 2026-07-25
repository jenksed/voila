// Protected completion: the full gate matrix, all-gates-pass, byte-identical canonical state on
// rejection, focus clearing, exactly one event, and the absence of any alternative path to completed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createInitialState } from "../src/domain/defaults.ts";
import {
  createWorkItem,
  recordRisk,
  setFocusWorkItem,
  updateRisk,
  updateWorkItem,
} from "../src/domain/operations.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";
import {
  assessCompletion,
  completeWorkItem,
  CompletionRejectedError,
  createClaim,
  linkReceipt,
  requireClaim,
} from "../src/domain/proof.ts";
import { initState, loadState, updateState, validateProjectState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { newfangTools } from "../src/tools/index.ts";
import type { ProjectState, VerificationReceiptRecord } from "../src/domain/types.ts";

const T = "2026-07-25T00:00:00.000Z";
const FP = "a".repeat(64);
const OTHER_FP = "b".repeat(64);

const C1 = "criterion one is met";
const C2 = "criterion two is met";

function receipt(
  id: string,
  claimId: string,
  result: VerificationReceiptRecord["result"],
  fingerprint = FP,
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

/**
 * A work item that satisfies EVERY completion gate. Each table case below breaks exactly one thing,
 * so a failure names the gate under test rather than an unrelated precondition.
 */
function readyState(): ProjectState {
  let s = createInitialState({ displayName: "gate-demo", now: T, projectId: "pid" });
  s = createWorkItem(
    s,
    { kind: "outcome", title: "Target", status: "in_progress", acceptanceCriteria: [C1, C2] },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "one holds",
      confidence: "high",
      coveredAcceptanceCriteria: [C1],
    },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "two holds",
      confidence: "high",
      coveredAcceptanceCriteria: [C2],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-2" }, T);
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed"), T);
  s = linkReceipt(s, receipt("RCP-2", "CLM-2", "passed"), T);
  return s;
}

test("the ready fixture passes every gate", () => {
  const assessment = assessCompletion(readyState(), "NF-1", FP);
  assert.equal(assessment.ready, true, `failing: ${JSON.stringify(assessment.failing)}`);
  assert.deepEqual(assessment.failing, []);
  assert.ok(assessment.gates.length >= 11, "the full gate set is reported");
});

// --- Rejection matrix: one broken precondition per row ---

interface GateCase {
  name: string;
  break: (s: ProjectState) => ProjectState;
  expectGate: string;
  fingerprint?: string | null;
}

const CASES: GateCase[] = [
  {
    name: "cancelled item",
    break: (s) => updateWorkItem(s, { id: "NF-1", status: "cancelled" }, T),
    expectGate: "not_cancelled",
  },
  {
    name: "blocked item",
    break: (s) => updateWorkItem(s, { id: "NF-1", status: "blocked" }, T),
    expectGate: "not_blocked",
  },
  {
    name: "outstanding blocked reason while not blocked",
    break: (s) => ({
      ...s,
      workItems: s.workItems.map((w) =>
        w.id === "NF-1" ? { ...w, blockedReason: "waiting on review" } : w,
      ),
    }),
    expectGate: "no_blocked_reason",
  },
  {
    name: "dependency not completed",
    break: (s) => {
      const withDep = createWorkItem(s, { kind: "task", title: "Dependency" }, T);
      return updateWorkItem(withDep, { id: "NF-1", addDependsOn: ["NF-2"] }, T);
    },
    expectGate: "dependencies_completed",
  },
  {
    name: "no acceptance criteria",
    break: (s) => updateWorkItem(s, { id: "NF-1", acceptanceCriteria: [] }, T),
    expectGate: "acceptance_criteria_present",
  },
  {
    name: "no required claims",
    break: (s) => ({
      ...s,
      workItems: s.workItems.map((w) => (w.id === "NF-1" ? { ...w, requiredClaimIds: [] } : w)),
    }),
    expectGate: "required_claims_present",
  },
  {
    name: "required claim does not exist",
    break: (s) => ({
      ...s,
      workItems: s.workItems.map((w) =>
        w.id === "NF-1" ? { ...w, requiredClaimIds: [...w.requiredClaimIds, "CLM-404"] } : w,
      ),
    }),
    expectGate: "required_claims_resolve",
  },
  {
    name: "an acceptance criterion is not covered by any required claim",
    break: (s) => ({
      ...s,
      workItems: s.workItems.map((w) =>
        w.id === "NF-1" ? { ...w, requiredClaimIds: ["CLM-1"] } : w,
      ),
    }),
    expectGate: "criteria_covered",
  },
  {
    name: "a required claim is pending (no receipt)",
    break: (s) => ({
      ...s,
      claims: s.claims.map((c) => (c.id === "CLM-2" ? { ...c, receiptIds: [] } : c)),
      receipts: s.receipts.filter((r) => r.id !== "RCP-2"),
    }),
    expectGate: "claims_supported",
  },
  {
    name: "a required claim is unsupported (its current receipt failed)",
    break: (s) => ({
      ...s,
      receipts: s.receipts.map((r) => (r.id === "RCP-2" ? { ...r, result: "failed" as const } : r)),
    }),
    expectGate: "claims_supported",
  },
  {
    name: "a required claim timed out",
    break: (s) => ({
      ...s,
      receipts: s.receipts.map((r) =>
        r.id === "RCP-2" ? { ...r, result: "timed_out" as const } : r,
      ),
    }),
    expectGate: "claims_supported",
  },
  {
    name: "a required claim errored",
    break: (s) => ({
      ...s,
      receipts: s.receipts.map((r) => (r.id === "RCP-2" ? { ...r, result: "error" as const } : r)),
    }),
    expectGate: "claims_supported",
  },
  {
    name: "evidence is stale (the repository moved)",
    break: (s) => s,
    expectGate: "claims_supported",
    fingerprint: OTHER_FP,
  },
  {
    name: "no fingerprint available at all",
    break: (s) => s,
    expectGate: "claims_supported",
    fingerprint: null,
  },
  {
    name: "an open high-impact linked risk remains",
    break: (s) => {
      const withRisk = recordRisk(
        s,
        {
          statement: "Single-writer race",
          likelihood: "low",
          impact: "high",
          linkedWorkItems: ["NF-1"],
        },
        T,
      );
      return withRisk;
    },
    expectGate: "no_open_high_impact_risk",
  },
  {
    name: "already completed",
    break: (s) => ({
      ...s,
      workItems: s.workItems.map((w) =>
        w.id === "NF-1" ? { ...w, status: "completed" as const } : w,
      ),
    }),
    expectGate: "not_completed",
  },
];

for (const testCase of CASES) {
  test(`completion is refused: ${testCase.name}`, () => {
    const broken = testCase.break(readyState());
    const fingerprint = testCase.fingerprint === undefined ? FP : testCase.fingerprint;
    const assessment = assessCompletion(broken, "NF-1", fingerprint);
    assert.equal(assessment.ready, false, "must not be completable");
    assert.ok(
      assessment.failing.some((g) => g.id === testCase.expectGate),
      `expected gate ${testCase.expectGate} to fail; failing were ${assessment.failing
        .map((g) => g.id)
        .join(", ")}`,
    );
    assert.throws(() => completeWorkItem(broken, "NF-1", fingerprint, T), CompletionRejectedError);
  });
}

test("completion of a missing work item throws before any gate evaluation", () => {
  assert.throws(() => assessCompletion(readyState(), "NF-404", FP), /Work item not found: NF-404/);
  assert.throws(() => completeWorkItem(readyState(), "NF-404", FP, T), ProjectOperationError);
});

test("a rejection reports ALL failing gates, not just the first", () => {
  let s = readyState();
  // Break several things at once.
  s = updateWorkItem(s, { id: "NF-1", status: "blocked", blockedReason: "stuck" }, T);
  s = updateWorkItem(s, { id: "NF-1", acceptanceCriteria: [] }, T);
  const assessment = assessCompletion(s, "NF-1", null);
  const ids = assessment.failing.map((g) => g.id);
  for (const expected of [
    "not_blocked",
    "no_blocked_reason",
    "acceptance_criteria_present",
    "criteria_covered",
    "claims_supported",
  ]) {
    assert.ok(ids.includes(expected), `${expected} is reported`);
  }
  assert.ok(assessment.failing.length >= 5, `expected many gates, got ${ids.join(", ")}`);

  try {
    completeWorkItem(s, "NF-1", null, T);
    assert.fail("should have thrown");
  } catch (error) {
    assert.ok(error instanceof CompletionRejectedError);
    // The message enumerates every failing gate.
    for (const gate of assessment.failing) {
      assert.ok(error.message.includes(gate.label), `message mentions ${gate.label}`);
    }
  }
});

test("a mitigated or non-linked high-impact risk does not block completion", () => {
  let s = readyState();
  s = recordRisk(s, { statement: "Elsewhere", likelihood: "low", impact: "high" }, T);
  assert.equal(assessCompletion(s, "NF-1", FP).ready, true, "unlinked risk does not block");

  s = recordRisk(
    s,
    {
      statement: "Linked but mitigated",
      likelihood: "low",
      impact: "high",
      linkedWorkItems: ["NF-1"],
      mitigation: "atomic writes",
    },
    T,
  );
  assert.equal(assessCompletion(s, "NF-1", FP).ready, false, "open linked high-impact risk blocks");
  s = updateRisk(s, { id: "RSK-2", status: "mitigated" }, T);
  assert.equal(assessCompletion(s, "NF-1", FP).ready, true, "mitigating it unblocks completion");
});

test("a completed dependency satisfies the dependency gate", () => {
  let s = readyState();
  s = createWorkItem(s, { kind: "task", title: "Dependency", acceptanceCriteria: ["dep done"] }, T);
  s = updateWorkItem(s, { id: "NF-1", addDependsOn: ["NF-2"] }, T);
  assert.equal(assessCompletion(s, "NF-1", FP).ready, false);
  s = {
    ...s,
    workItems: s.workItems.map((w) =>
      w.id === "NF-2" ? { ...w, status: "completed" as const } : w,
    ),
  };
  assert.equal(assessCompletion(s, "NF-1", FP).ready, true);
});

test("success marks completed, preserves history, and clears focus without picking a new one", () => {
  let s = readyState();
  s = createWorkItem(s, { kind: "task", title: "Another ready item", status: "ready" }, T);
  s = setFocusWorkItem(s, "NF-1");
  const before = s.workItems.find((w) => w.id === "NF-1");

  const { state: next, assessment } = completeWorkItem(s, "NF-1", FP, "2026-07-26T00:00:00.000Z");
  const item = next.workItems.find((w) => w.id === "NF-1");
  assert.equal(item?.status, "completed");
  assert.equal(item?.updatedAt, "2026-07-26T00:00:00.000Z");
  assert.equal(assessment.ready, true);

  // History preserved: identity, criteria, requirements, and creation time all survive.
  assert.equal(item?.createdAt, before?.createdAt);
  assert.deepEqual(item?.acceptanceCriteria, before?.acceptanceCriteria);
  assert.deepEqual(item?.requiredClaimIds, before?.requiredClaimIds);
  assert.equal(item?.title, before?.title);
  // Claims and receipts are untouched by completion.
  assert.deepEqual(next.claims, s.claims);
  assert.deepEqual(next.receipts, s.receipts);

  // Focus is cleared, NOT reassigned.
  assert.equal(next.focusWorkItemId, null, "focus cleared");
});

test("completing a non-focused item leaves focus alone", () => {
  let s = readyState();
  s = createWorkItem(s, { kind: "task", title: "Focused elsewhere", status: "ready" }, T);
  s = setFocusWorkItem(s, "NF-2");
  const { state: next } = completeWorkItem(s, "NF-1", FP, T);
  assert.equal(next.focusWorkItemId, "NF-2");
});

// --- Store-level guarantees ---

async function seededRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "newfang-complete-"));
  await initState(root, { displayName: "gate-demo" });
  await updateState(root, () => ({
    ...readyState(),
    schemaVersion: 4,
    projectId: "pid",
    createdAt: T,
    updatedAt: T,
    revision: 1,
  }));
  return root;
}

test("a rejected completion leaves canonical bytes byte-identical and appends no event", async () => {
  const root = await seededRoot();
  // Break one gate so completion must be refused.
  await updateState(root, (cur) => updateWorkItem(cur, { id: "NF-1", status: "blocked" }, T));

  const paths = statePaths(root);
  const beforeBytes = await readFile(paths.projectJson, "utf8");
  const beforeEvents = await readFile(paths.eventsJsonl, "utf8");

  await assert.rejects(
    () =>
      updateState(root, (cur) => completeWorkItem(cur, "NF-1", FP, T).state, {
        type: "work_item_completed",
        id: "NF-1",
      }),
    CompletionRejectedError,
  );

  assert.equal(await readFile(paths.projectJson, "utf8"), beforeBytes, "canonical bytes unchanged");
  assert.equal(await readFile(paths.eventsJsonl, "utf8"), beforeEvents, "no event appended");
});

test("a successful completion appends exactly one completion event and regenerates the view", async () => {
  const root = await seededRoot();
  const paths = statePaths(root);
  const viewBefore = await readFile(paths.statusView, "utf8");

  await updateState(root, (cur) => completeWorkItem(cur, "NF-1", FP, T).state, {
    type: "work_item_completed",
    id: "NF-1",
  });

  const events = (await readFile(paths.eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const completions = events.filter((e) => e.type === "work_item_completed");
  assert.equal(completions.length, 1, "exactly one completion event");
  assert.equal(completions[0].id, "NF-1");

  const state = await loadState(root);
  assert.equal(state.workItems.find((w) => w.id === "NF-1")?.status, "completed");
  const viewAfter = await readFile(paths.statusView, "utf8");
  assert.notEqual(viewAfter, viewBefore, "generated view refreshed");
});

test("no alternative path reaches completed: generic update and creation both refuse", () => {
  const s = readyState();
  assert.throws(
    () => updateWorkItem(s, { id: "NF-1", status: "completed" }, T),
    /Generic updates cannot mark a work item completed/,
  );
  assert.throws(
    () => createWorkItem(s, { kind: "task", title: "x", status: "completed" }, T),
    /cannot be created as completed/,
  );
});

test("no tool other than newfang_complete_work_item can set status completed", () => {
  const tools = newfangTools();
  const completers = tools.filter((t) => t.name === "newfang_complete_work_item");
  assert.equal(completers.length, 1, "exactly one completion tool exists");

  // Every other tool that accepts a `status` enum must exclude "completed".
  for (const tool of tools) {
    if (tool.name === "newfang_complete_work_item") continue;
    const schema = JSON.stringify(tool.parameters);
    if (!schema.includes('"status"')) continue;
    const properties =
      (tool.parameters as { properties?: Record<string, unknown> }).properties ?? {};
    const status = properties.status as { enum?: string[] } | undefined;
    if (!status?.enum) continue;
    // newfang_list_work_items may FILTER by completed; it cannot set it.
    if (tool.name === "newfang_list_work_items") continue;
    assert.equal(
      status.enum.includes("completed"),
      false,
      `${tool.name} must not offer "completed" as a settable status`,
    );
  }
});

test("hand-authored completed state still validates: the gate protects transitions, not files", () => {
  // Honest boundary: a completed item written directly into project.json is schema-valid. NewFang
  // guarantees its own state TRANSITION, not that a file was never edited by hand.
  const s = readyState();
  const handAuthored = {
    ...s,
    workItems: s.workItems.map((w) => ({ ...w, status: "completed" as const })),
  };
  const validated = validateProjectState(handAuthored);
  assert.equal(validated.workItems[0]?.status, "completed");
});
