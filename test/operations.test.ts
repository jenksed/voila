import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/domain/defaults.ts";
import type { ProjectState } from "../src/domain/types.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";
import {
  backlogSummary,
  createWorkItem,
  detectCycle,
  listWorkItems,
  recordAssumption,
  recordDecision,
  recordRisk,
  setFocusWorkItem,
  updateAssumption,
  updateDecision,
  updateRisk,
  updateWorkItem,
} from "../src/domain/operations.ts";

const T = "2026-07-24T00:00:00.000Z";

function base(): ProjectState {
  return createInitialState({ displayName: "demo", now: T, projectId: "id" });
}

test("createWorkItem allocates monotonic NF IDs and bumps the sequence", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "first" }, T);
  s = createWorkItem(s, { kind: "outcome", title: "second" }, T);
  assert.deepEqual(
    s.workItems.map((w) => w.id),
    ["NF-1", "NF-2"],
  );
  assert.equal(s.sequences.workItem, 3);
  assert.equal(s.workItems[0]?.status, "backlog");
  assert.equal(s.workItems[0]?.priority, "normal");
});

test("independent ID sequences per entity type", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "w" }, T);
  s = recordDecision(s, { title: "d", decision: "x", rationale: "y" }, T);
  s = recordAssumption(s, { statement: "a", confidence: "high" }, T);
  s = recordRisk(s, { statement: "r", likelihood: "low", impact: "high" }, T);
  assert.equal(s.workItems[0]?.id, "NF-1");
  assert.equal(s.decisions[0]?.id, "DEC-1");
  assert.equal(s.assumptions[0]?.id, "ASM-1");
  assert.equal(s.risks[0]?.id, "RSK-1");
});

test("invalid kind/status/priority are rejected (table-driven)", () => {
  const s = base();
  const cases: Array<[string, () => unknown]> = [
    ["kind", () => createWorkItem(s, { kind: "epic" as never, title: "t" }, T)],
    ["priority", () => createWorkItem(s, { kind: "task", title: "t", priority: "p0" as never }, T)],
    ["status", () => createWorkItem(s, { kind: "task", title: "t", status: "doing" as never }, T)],
  ];
  for (const [, fn] of cases) assert.throws(fn, ProjectOperationError);
});

test("work items cannot be created or updated to completed", () => {
  let s = base();
  assert.throws(
    () => createWorkItem(s, { kind: "task", title: "t", status: "completed" }, T),
    ProjectOperationError,
  );
  s = createWorkItem(s, { kind: "task", title: "t" }, T);
  assert.throws(
    () => updateWorkItem(s, { id: "NF-1", status: "completed" }, T),
    ProjectOperationError,
  );
});

test("dependencies must reference existing items and cannot be self", () => {
  let s = base();
  assert.throws(
    () => createWorkItem(s, { kind: "task", title: "t", dependsOn: ["NF-9"] }, T),
    ProjectOperationError,
  );
  s = createWorkItem(s, { kind: "task", title: "t" }, T);
  assert.throws(
    () => updateWorkItem(s, { id: "NF-1", addDependsOn: ["NF-1"] }, T),
    ProjectOperationError,
  );
});

test("direct and multi-hop cycles are rejected; diamonds are allowed", () => {
  // Diamond: A<-B, A<-C, D depends on B and C. No cycle.
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A" }, T); // NF-1
  s = createWorkItem(s, { kind: "task", title: "B", dependsOn: ["NF-1"] }, T); // NF-2
  s = createWorkItem(s, { kind: "task", title: "C", dependsOn: ["NF-1"] }, T); // NF-3
  s = createWorkItem(s, { kind: "task", title: "D", dependsOn: ["NF-2", "NF-3"] }, T); // NF-4
  assert.equal(detectCycle(s.workItems), null);

  // Direct cycle: make NF-1 depend on NF-2 (NF-2 already depends on NF-1).
  assert.throws(
    () => updateWorkItem(s, { id: "NF-1", addDependsOn: ["NF-2"] }, T),
    ProjectOperationError,
  );

  // Multi-hop cycle: NF-1 -> NF-4 -> NF-2 -> NF-1.
  assert.throws(
    () => updateWorkItem(s, { id: "NF-1", addDependsOn: ["NF-4"] }, T),
    ProjectOperationError,
  );
});

test("dependency removal works", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A" }, T); // NF-1
  s = createWorkItem(s, { kind: "task", title: "B", dependsOn: ["NF-1"] }, T); // NF-2
  s = updateWorkItem(s, { id: "NF-2", removeDependsOn: ["NF-1"] }, T);
  assert.deepEqual(s.workItems.find((w) => w.id === "NF-2")?.dependsOn, []);
});

test("blocked reason is kept while blocked and cleared otherwise", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A" }, T);
  s = updateWorkItem(s, { id: "NF-1", status: "blocked", blockedReason: "waiting on API" }, T);
  assert.equal(s.workItems[0]?.blockedReason, "waiting on API");
  s = updateWorkItem(s, { id: "NF-1", status: "in_progress" }, T);
  assert.equal(s.workItems[0]?.blockedReason, undefined);
});

test("setFocusWorkItem rejects completed/cancelled and missing items", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A" }, T); // NF-1
  s = setFocusWorkItem(s, "NF-1");
  assert.equal(s.focusWorkItemId, "NF-1");
  assert.throws(() => setFocusWorkItem(s, "NF-9"), ProjectOperationError);
  s = updateWorkItem(s, { id: "NF-1", status: "cancelled" }, T);
  assert.throws(() => setFocusWorkItem(s, "NF-1"), ProjectOperationError);
  s = setFocusWorkItem(s, null);
  assert.equal(s.focusWorkItemId, null);
});

test("decision lifecycle: record then supersede", () => {
  let s = base();
  s = recordDecision(s, { title: "d1", decision: "x", rationale: "y" }, T);
  assert.equal(s.decisions[0]?.status, "proposed");
  s = recordDecision(s, { title: "d2", decision: "x2", rationale: "y2", status: "accepted" }, T);
  s = updateDecision(s, { id: "DEC-1", status: "superseded", supersededById: "DEC-2" }, T);
  assert.equal(s.decisions[0]?.status, "superseded");
  assert.equal(s.decisions[0]?.supersededBy, "DEC-2");
});

test("decision transitions: allowed paths, terminal state, and supersede rules", () => {
  let s = base();
  s = recordDecision(s, { title: "d1", decision: "x", rationale: "y" }, T); // DEC-1 proposed
  s = recordDecision(s, { title: "d2", decision: "x", rationale: "y" }, T); // DEC-2 proposed

  // proposed -> accepted
  s = updateDecision(s, { id: "DEC-1", status: "accepted" }, T);
  assert.equal(s.decisions[0]?.status, "accepted");

  // superseding requires an existing replacement, not self, and no cycle
  assert.throws(
    () => updateDecision(s, { id: "DEC-1", status: "superseded" }, T),
    ProjectOperationError,
  );
  assert.throws(
    () => updateDecision(s, { id: "DEC-1", status: "superseded", supersededById: "DEC-1" }, T),
    ProjectOperationError,
  );
  assert.throws(
    () => updateDecision(s, { id: "DEC-1", status: "superseded", supersededById: "DEC-9" }, T),
    ProjectOperationError,
  );

  // accepted -> superseded by DEC-2
  s = updateDecision(s, { id: "DEC-1", status: "superseded", supersededById: "DEC-2" }, T);
  // cycle: DEC-2 cannot be superseded by DEC-1 (DEC-1 already points at DEC-2)
  assert.throws(
    () => updateDecision(s, { id: "DEC-2", status: "superseded", supersededById: "DEC-1" }, T),
    ProjectOperationError,
  );
  // terminal: superseded cannot be reopened
  assert.throws(
    () => updateDecision(s, { id: "DEC-1", status: "accepted" }, T),
    ProjectOperationError,
  );
  // supersededById only applies when superseding
  assert.throws(
    () => updateDecision(s, { id: "DEC-2", supersededById: "DEC-1" }, T),
    ProjectOperationError,
  );
});

test("assumption transitions: terminal states are not reopened", () => {
  let s = base();
  s = recordAssumption(s, { statement: "a", confidence: "low" }, T);
  s = updateAssumption(s, { id: "ASM-1", status: "invalidated" }, T);
  assert.throws(
    () => updateAssumption(s, { id: "ASM-1", status: "open" }, T),
    ProjectOperationError,
  );
  // note updates on a terminal assumption are still allowed
  s = updateAssumption(s, { id: "ASM-1", note: "explained" }, T);
  assert.equal(s.assumptions[0]?.note, "explained");
});

test("risk transitions: closing needs a resolution; terminal states are not reopened", () => {
  let s = base();
  s = recordRisk(s, { statement: "r", likelihood: "low", impact: "low" }, T);
  // open -> closed without mitigation is rejected
  assert.throws(() => updateRisk(s, { id: "RSK-1", status: "closed" }, T), ProjectOperationError);
  // open -> closed with a resolution is allowed
  const closed = updateRisk(s, { id: "RSK-1", status: "closed", mitigation: "resolved" }, T);
  assert.equal(closed.risks[0]?.status, "closed");
  assert.throws(
    () => updateRisk(closed, { id: "RSK-1", status: "open" }, T),
    ProjectOperationError,
  );
  // open -> mitigated -> closed
  s = updateRisk(s, { id: "RSK-1", status: "mitigated", mitigation: "pinned" }, T);
  s = updateRisk(s, { id: "RSK-1", status: "closed" }, T);
  assert.equal(s.risks[0]?.status, "closed");
});

test("assumption lifecycle: record then validate", () => {
  let s = base();
  s = recordAssumption(s, { statement: "a", confidence: "medium" }, T);
  assert.equal(s.assumptions[0]?.status, "open");
  s = updateAssumption(s, { id: "ASM-1", status: "validated", note: "confirmed" }, T);
  assert.equal(s.assumptions[0]?.status, "validated");
  assert.equal(s.assumptions[0]?.note, "confirmed");
});

test("risk lifecycle with linked work items", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A" }, T); // NF-1
  s = recordRisk(
    s,
    { statement: "r", likelihood: "high", impact: "high", linkedWorkItems: ["NF-1"] },
    T,
  );
  assert.deepEqual(s.risks[0]?.linkedWorkItems, ["NF-1"]);
  assert.throws(
    () =>
      recordRisk(
        s,
        { statement: "bad", likelihood: "low", impact: "low", linkedWorkItems: ["NF-9"] },
        T,
      ),
    ProjectOperationError,
  );
  s = updateRisk(s, { id: "RSK-1", status: "mitigated", mitigation: "pinned" }, T);
  assert.equal(s.risks[0]?.status, "mitigated");
});

test("listWorkItems filters and backlogSummary counts", () => {
  let s = base();
  s = createWorkItem(s, { kind: "task", title: "A", status: "ready", priority: "high" }, T);
  s = createWorkItem(s, { kind: "defect", title: "B", status: "in_progress" }, T);
  s = createWorkItem(s, { kind: "task", title: "C", status: "blocked" }, T);
  assert.equal(listWorkItems(s, { status: "ready" }).length, 1);
  assert.equal(listWorkItems(s, { kind: "task" }).length, 2);
  const summary = backlogSummary(s);
  assert.equal(summary.total, 3);
  assert.equal(summary.openCount, 3);
  assert.equal(summary.inProgress.length, 1);
  assert.equal(summary.blocked.length, 1);
  assert.equal(summary.readyByPriority.length, 1);
});
