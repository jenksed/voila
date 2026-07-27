// Pure domain tests for R2A finite-operation contracts. No process spawning.

import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  OperationDefinition,
  OperationLifecycleState,
  ProjectState,
} from "../src/domain/types.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import {
  R2A_STATE_STORE_OPERATION,
  R2B_REPOSITORY_CHECKS_OPERATION,
  activeRun,
  allowedNextStates,
  allLifecycleStates,
  createQueuedRun,
  definitionFingerprint,
  findActiveRun,
  findDefinition,
  isFinalState,
  latestSettlement,
  registerDefinition,
  runsEquivalent,
  summarizeRun,
  updateRun,
  validateDefinition,
} from "../src/domain/operations-runtime.ts";

function emptyState(): ProjectState {
  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: "test-project",
    displayName: "demo",
    phase: "build",
    health: "green",
    nextAction: "test",
    focusWorkItemId: null,
    sequences: {
      workItem: 1,
      decision: 1,
      assumption: 1,
      risk: 1,
      intake: 1,
      orientation: 1,
      claim: 1,
      receipt: 1,
      operationDefinition: 1,
      operationRun: 1,
    },
    workItems: [],
    decisions: [],
    assumptions: [],
    risks: [],
    intakes: [],
    orientations: [],
    claims: [],
    receipts: [],
    operationDefinitions: [],
    operationRuns: [],
    createdAt: "2026-07-26T00:00:00.000Z",
    updatedAt: "2026-07-26T00:00:00.000Z",
    revision: 1,
  };
}

const NOW = "2026-07-26T00:00:00.000Z";

function withDefinition(state: ProjectState, def: OperationDefinition): ProjectState {
  const { state: next } = registerDefinition(state, def, NOW);
  return next;
}

function r2aDefinition(overrides: Partial<OperationDefinition> = {}): OperationDefinition {
  return {
    ...R2A_STATE_STORE_OPERATION,
    ...overrides,
    createdAt: NOW,
    updatedAt: NOW,
  } as OperationDefinition;
}

/** Build a minimal allow admission for tests. */
function allowAdmission(
  overrides: Partial<import("../src/domain/types.ts").OperationAdmission> = {},
): import("../src/domain/types.ts").OperationAdmission {
  return {
    result: "allow",
    ruleId: "ADMIT.OPERATIONS.ALLOW_NEW",
    policyVersion: 1,
    authorityReference: { kind: "decision", id: "DEC-22" },
    decidedAt: NOW,
    ...overrides,
  };
}

test("the accepted R2A and R2B definitions bind their exact execution and authority contracts", () => {
  assert.equal(R2A_STATE_STORE_OPERATION.id, "r2a.state-store-tests");
  assert.equal(R2A_STATE_STORE_OPERATION.version, 1);
  assert.equal(R2A_STATE_STORE_OPERATION.kind, "finite");
  assert.equal(R2A_STATE_STORE_OPERATION.executable, "mise");
  assert.deepEqual(R2A_STATE_STORE_OPERATION.args, [
    "exec",
    "--",
    "node",
    "--test",
    "test/state.store.test.ts",
  ]);
  assert.equal(R2A_STATE_STORE_OPERATION.workingDirectory, "repository_root");
  assert.deepEqual(R2A_STATE_STORE_OPERATION.effectProfile, [
    "local_read",
    "bounded_temporary_write",
  ]);
  assert.equal(R2A_STATE_STORE_OPERATION.authorityRequirement, "accepted_project_operation");
  assert.deepEqual(R2A_STATE_STORE_OPERATION.authoritySourceRef, {
    kind: "decision",
    id: "DEC-22",
  });
  assert.equal(R2A_STATE_STORE_OPERATION.riskClassification.riskClass, "safe_and_expected");
  assert.equal(R2A_STATE_STORE_OPERATION.successContract.exitCode, 0);
  assert.equal(R2A_STATE_STORE_OPERATION.timeoutContract.totalMs, 120_000);
  assert.equal(R2A_STATE_STORE_OPERATION.timeoutContract.startupMs, 10_000);
  assert.equal(R2A_STATE_STORE_OPERATION.timeoutContract.gracefulMs, 5_000);
  assert.equal(R2A_STATE_STORE_OPERATION.timeoutContract.forcedMs, 5_000);

  assert.equal(R2B_REPOSITORY_CHECKS_OPERATION.id, "r2b.repository-checks");
  assert.equal(R2B_REPOSITORY_CHECKS_OPERATION.displayLabel, "Repository checks");
  assert.deepEqual(R2B_REPOSITORY_CHECKS_OPERATION.args, ["exec", "--", "npm", "run", "verify"]);
  assert.deepEqual(R2B_REPOSITORY_CHECKS_OPERATION.authoritySourceRef, {
    kind: "decision",
    id: "DEC-23",
  });
  assert.equal(R2B_REPOSITORY_CHECKS_OPERATION.timeoutContract.totalMs, 300_000);
  assert.equal(R2B_REPOSITORY_CHECKS_OPERATION.ownershipPolicy, "focused_work_item_required");
});

test("definition fingerprint is stable across re-registration and ignores timestamps", () => {
  const a = r2aDefinition({
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
  const b = r2aDefinition({
    createdAt: "2026-12-31T00:00:00.000Z",
    updatedAt: "2026-12-31T00:00:00.000Z",
  });
  assert.equal(definitionFingerprint(a), definitionFingerprint(b));
});

test("definition fingerprint binds ordered argv, effects, authority, and executable", () => {
  const base = r2aDefinition();
  const withExtraArg = r2aDefinition({ args: [...base.args, "--extra"] });
  const withReorderedArgv = r2aDefinition({ args: [...base.args].reverse() });
  const withDifferentExec = r2aDefinition({ executable: "node" });
  const withDifferentEffects = r2aDefinition({ effectProfile: ["local_read"] });
  const withDifferentAuthority = r2aDefinition({
    authoritySourceRef: { kind: "decision", id: "DEC-999" },
  });
  const withDifferentOwnership = r2aDefinition({ ownershipPolicy: "focused_work_item_required" });
  const withDifferentLabel = r2aDefinition({ displayLabel: "Display only" });
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withExtraArg));
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withReorderedArgv));
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withDifferentExec));
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withDifferentEffects));
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withDifferentAuthority));
  assert.notEqual(definitionFingerprint(base), definitionFingerprint(withDifferentOwnership));
  assert.equal(definitionFingerprint(base), definitionFingerprint(withDifferentLabel));
});

test("validateDefinition rejects shell metacharacters in the executable", () => {
  assert.throws(
    () =>
      validateDefinition({
        ...R2A_STATE_STORE_OPERATION,
        executable: "rm -rf /",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    /shell metacharacters/,
  );
});

test("validateDefinition treats shell syntax inside argv as literal data", () => {
  const def = validateDefinition({
    ...R2A_STATE_STORE_OPERATION,
    args: [...R2A_STATE_STORE_OPERATION.args, "rm -rf /"],
    createdAt: NOW,
    updatedAt: NOW,
  });
  assert.equal(def.args.at(-1), "rm -rf /");
  assert.notEqual(
    definitionFingerprint(def),
    definitionFingerprint(r2aDefinition()),
    "argv substitution changes the accepted-definition fingerprint",
  );
});

test("validateDefinition accepts the canonical R2A operation", () => {
  const def = validateDefinition({ ...R2A_STATE_STORE_OPERATION, createdAt: NOW, updatedAt: NOW });
  assert.equal(def.id, "r2a.state-store-tests");
});

test("validateDefinition rejects unknown effects and missing authority provenance", () => {
  assert.throws(
    () =>
      validateDefinition({
        ...R2A_STATE_STORE_OPERATION,
        effectProfile: ["invented_effect"],
        createdAt: NOW,
        updatedAt: NOW,
      }),
    /unknown effect/,
  );
  assert.throws(
    () =>
      validateDefinition({
        ...R2A_STATE_STORE_OPERATION,
        authoritySourceRef: undefined,
        createdAt: NOW,
        updatedAt: NOW,
      }),
    /authority source reference/,
  );
});

test("validateDefinition rejects operations that are not 'finite'", () => {
  assert.throws(
    () =>
      validateDefinition({
        ...R2A_STATE_STORE_OPERATION,
        kind: "streaming",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    /finite/,
  );
});

test("validateDefinition rejects unsupported working directory policies", () => {
  assert.throws(
    () =>
      validateDefinition({
        ...R2A_STATE_STORE_OPERATION,
        workingDirectory: "arbitrary_path",
        createdAt: NOW,
        updatedAt: NOW,
      }),
    /Unsupported working directory/,
  );
});

test("registerDefinition is idempotent on (id, version)", () => {
  const def = r2aDefinition();
  const first = registerDefinition(emptyState(), def, NOW);
  const second = registerDefinition(first.state, def, NOW);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.state.operationDefinitions.length, 1);
});

test("findDefinition returns the latest version when version is omitted", () => {
  const a = r2aDefinition({ version: 1 });
  const b = r2aDefinition({ version: 2 });
  let state = emptyState();
  state = withDefinition(state, a);
  state = withDefinition(state, b);
  const latest = findDefinition(state, "r2a.state-store-tests");
  assert.equal(latest?.version, 2);
});

test("lifecycle states cover the bounded R2A set exactly", () => {
  const expected = [
    "queued",
    "starting",
    "running",
    "passed",
    "failed",
    "cancelled",
    "timed_out",
    "supervisor_error",
  ];
  assert.deepEqual(allLifecycleStates(), expected);
  assert.deepEqual(allowedNextStates("queued"), ["starting", "supervisor_error", "cancelled"]);
  assert.deepEqual(allowedNextStates("running"), [
    "passed",
    "failed",
    "cancelled",
    "timed_out",
    "supervisor_error",
  ]);
});

test("isFinalState is true exactly for the canonical final set", () => {
  for (const state of ["queued", "starting", "running"] as const) {
    assert.equal(isFinalState(state), false);
  }
  for (const state of ["passed", "failed", "cancelled", "timed_out", "supervisor_error"] as const) {
    assert.equal(isFinalState(state), true);
  }
});

test("createQueuedRun allocates RUN-1 and stamps a starting fingerprint", () => {
  const def = r2aDefinition();
  const state = withDefinition(emptyState(), def);
  const allocated = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "project-steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  assert.equal(allocated.run.id, "RUN-1");
  assert.equal(allocated.run.lifecycleState, "queued");
  assert.equal(allocated.run.definitionFingerprint, definitionFingerprint(def));
  assert.equal(allocated.run.deliveryState, "created");
  assert.equal(allocated.state.sequences.operationRun, 2);
});

test("updateRun rejects illegal lifecycle transitions", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const queued = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = queued.state;
  // queued -> passed is illegal
  assert.throws(
    () => updateRun(state, "RUN-1", { lifecycleState: "passed" }),
    /Illegal operation lifecycle transition/,
  );
});

test("updateRun allows queued -> starting -> running -> passed", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const queued = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = queued.state;
  let next = updateRun(state, "RUN-1", { lifecycleState: "starting" });
  assert.equal(next.run.lifecycleState, "starting");
  next = updateRun(next.state, "RUN-1", { lifecycleState: "running", startedAt: NOW });
  assert.equal(next.run.lifecycleState, "running");
  next = updateRun(next.state, "RUN-1", {
    lifecycleState: "passed",
    settledAt: NOW,
    exitCode: 0,
    settlementReason: "passed",
  });
  assert.equal(next.run.lifecycleState, "passed");
  assert.equal(next.run.settlementReason, "passed");
});

test("updateRun forbids transitions from a final state", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const queued = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = queued.state;
  const settled = updateRun(state, "RUN-1", {
    lifecycleState: "starting",
  });
  const passed = updateRun(settled.state, "RUN-1", { lifecycleState: "running", startedAt: NOW });
  const finished = updateRun(passed.state, "RUN-1", {
    lifecycleState: "passed",
    settledAt: NOW,
    exitCode: 0,
    settlementReason: "passed",
  });
  assert.throws(
    () => updateRun(finished.state, "RUN-1", { lifecycleState: "running" }),
    /Illegal operation lifecycle transition/,
  );
});

test("runsEquivalent is true for two active runs that share definition, project, root, and fingerprint", () => {
  const a: OperationLifecycleState = "running";
  const base: import("../src/domain/types.ts").OperationRun = {
    id: "RUN-1",
    definitionId: "r2a.state-store-tests",
    definitionVersion: 1,
    definitionFingerprint: "f".repeat(64),
    projectId: "test-project",
    repositoryRoot: "/abs/repo",
    worktreeIdentity: "/abs/repo",
    ownership: { requester: "test", owner: "steward" },
    startingFingerprint: "a".repeat(64),
    changedDuringRun: false,
    lifecycleState: a,
    createdAt: NOW,
    outputSummary: {
      truncated: false,
      droppedBytes: 0,
      redactionCount: 0,
      redactedSecrets: false,
    },
    deliveryState: "created",
    admission: allowAdmission(),
  };
  const dup = { ...base, id: "RUN-2" };
  assert.equal(runsEquivalent(base, dup), true);
  const different = { ...dup, projectId: "other" };
  assert.equal(runsEquivalent(base, different), false);
});

test("activeRun returns the only active run; latestSettlement returns the most recent final run", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const a = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = a.state;
  const started = updateRun(state, "RUN-1", { lifecycleState: "starting" });
  const running = updateRun(started.state, "RUN-1", { lifecycleState: "running", startedAt: NOW });
  state = running.state;
  const active = activeRun(state);
  assert.ok(active);
  assert.equal(active?.id, "RUN-1");
  assert.equal(active?.lifecycleState, "running");
  const finished = updateRun(state, "RUN-1", {
    lifecycleState: "passed",
    settledAt: NOW,
    exitCode: 0,
    settlementReason: "passed",
  });
  assert.equal(activeRun(finished.state), undefined);
  const last = latestSettlement(finished.state);
  assert.equal(last?.id, "RUN-1");
  assert.equal(last?.settlementReason, "passed");
});

test("summarizeRun returns duration and lifecycle state for an active run", () => {
  const start = Date.now();
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const q = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    new Date(start).toISOString(),
  );
  state = q.state;
  const started = updateRun(state, "RUN-1", { lifecycleState: "starting" });
  const running = updateRun(started.state, "RUN-1", {
    lifecycleState: "running",
    startedAt: new Date(start + 1000).toISOString(),
  });
  const summary = summarizeRun(running.run, start + 2000);
  assert.equal(summary.lifecycleState, "running");
  assert.equal(summary.durationMs, 1000);
  assert.equal(summary.pendingAcknowledgement, false);
});

test("summarizeRun marks settled runs as pending acknowledgement until the parent acks", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const q = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = q.state;
  const started = updateRun(state, "RUN-1", { lifecycleState: "starting" });
  const running = updateRun(started.state, "RUN-1", { lifecycleState: "running", startedAt: NOW });
  const finished = updateRun(running.state, "RUN-1", {
    lifecycleState: "passed",
    settledAt: NOW,
    exitCode: 0,
    settlementReason: "passed",
    deliveryState: "delivered",
  });
  const summary = summarizeRun(finished.run, Date.now());
  assert.equal(summary.lifecycleState, "passed");
  assert.equal(summary.pendingAcknowledgement, true);
  assert.equal(summary.settlementReason, "passed");
});

test("findActiveRun returns the named active run when runId matches", () => {
  const def = r2aDefinition();
  let state = withDefinition(emptyState(), def);
  const q = createQueuedRun(
    state,
    {
      definition: def,
      ownership: { requester: "test", owner: "steward" },
      projectId: "test-project",
      repositoryRoot: "/abs/repo",
      worktreeIdentity: "/abs/repo",
      startingFingerprint: "a".repeat(64),
      admission: allowAdmission(),
    },
    NOW,
  );
  state = q.state;
  const started = updateRun(state, "RUN-1", { lifecycleState: "starting" });
  const running = updateRun(started.state, "RUN-1", { lifecycleState: "running", startedAt: NOW });
  const found = findActiveRun(running.state, "RUN-1");
  assert.equal(found?.id, "RUN-1");
  const wrong = findActiveRun(running.state, "RUN-2");
  assert.equal(wrong, undefined);
});
