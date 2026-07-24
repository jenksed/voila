import { test } from "node:test";
import assert from "node:assert/strict";

import { loadState } from "../src/state/store.ts";
import { runDoctor } from "../src/commands/doctor.ts";

// The NewFang repository dogfoods its own canonical state. These assertions load the committed
// .newfang/project.json from the repo root (the test runner's cwd).

test("repository loads its own dogfooded v2 canonical state", async () => {
  const state = await loadState(process.cwd());
  assert.equal(state.schemaVersion, 2);
  assert.equal(state.phase, "build");
  assert.equal(state.workItems.length, 7);
  assert.equal(state.activeWorkItemId, "NF-2");
  assert.equal(state.decisions.filter((d) => d.status === "accepted").length, 5);
  assert.ok(state.risks.length >= 4);
  // The active item is not completed/cancelled.
  const active = state.workItems.find((w) => w.id === state.activeWorkItemId);
  assert.ok(active && active.status !== "completed" && active.status !== "cancelled");
});

test("doctor reports no failures on the dogfooded repository state", async () => {
  const checks = await runDoctor({
    root: process.cwd(),
    piVersion: "0.82.0",
    expectedPiVersion: "0.82.0",
    nodeVersion: process.version,
    minNode: "22.19.0",
  });
  const failures = checks.filter((c) => c.level === "fail");
  assert.deepEqual(failures, [], `unexpected doctor failures: ${JSON.stringify(failures)}`);
});
