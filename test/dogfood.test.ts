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
  assert.equal(state.focusWorkItemId, "NF-2");
  assert.ok(state.nextActionRationale && state.nextActionRationale.length > 0);
  assert.equal(state.decisions.filter((d) => d.status === "accepted").length, 6);
  assert.ok(state.risks.length >= 4);
  // The focused item is neither completed nor cancelled.
  const focus = state.workItems.find((w) => w.id === state.focusWorkItemId);
  assert.ok(focus && focus.status !== "completed" && focus.status !== "cancelled");
});

test("dogfooded state stays honest: nothing is marked completed yet", async () => {
  const state = await loadState(process.cwd());
  assert.equal(
    state.workItems.filter((w) => w.status === "completed").length,
    0,
    "the protected completion transition does not exist yet, so nothing may be complete",
  );
  const nf1 = state.workItems.find((w) => w.id === "NF-1");
  assert.ok(nf1);
  assert.equal(nf1.status, "in_progress");
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
