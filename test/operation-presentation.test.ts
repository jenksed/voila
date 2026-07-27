import { test } from "node:test";
import assert from "node:assert/strict";

import { createInitialState } from "../src/domain/defaults.ts";
import {
  projectOperationPresentation,
  type OperationPresentationRuntime,
} from "../src/domain/operation-presentation.ts";
import { R2B_REPOSITORY_CHECKS_OPERATION } from "../src/domain/operations-runtime.ts";
import type { OperationDefinition, OperationRun, ProjectState } from "../src/domain/types.ts";
import { homeViewLines } from "../src/ui/homeview.ts";
import { buildConsoleModel } from "../src/ui/steward-console/model.ts";
import { renderConsole, plainStyler } from "../src/ui/steward-console/render.ts";
import { INITIAL_UI } from "../src/ui/steward-console/navigation.ts";

const NOW = "2026-07-27T01:00:10.000Z";
const START = "2026-07-27T01:00:00.000Z";

function fixture(lifecycleState: OperationRun["lifecycleState"] = "running"): ProjectState {
  const state = createInitialState({ displayName: "ops", now: START, projectId: "project" });
  const definition: OperationDefinition = {
    ...R2B_REPOSITORY_CHECKS_OPERATION,
    createdAt: START,
    updatedAt: START,
  } as OperationDefinition;
  state.focusWorkItemId = "NF-20";
  state.workItems = [
    {
      id: "NF-20",
      kind: "task",
      title: "R2B",
      status: "in_progress",
      priority: "high",
      acceptanceCriteria: ["visible"],
      requiredClaimIds: [],
      dependsOn: [],
      createdAt: START,
      updatedAt: START,
    },
  ];
  state.operationDefinitions = [definition];
  state.operationRuns = [
    {
      id: "RUN-1",
      definitionId: definition.id,
      definitionVersion: 1,
      definitionFingerprint: "a".repeat(64),
      projectId: state.projectId,
      repositoryRoot: "/repo",
      worktreeIdentity: "/repo",
      ownership: { requester: "project-steward", owner: "current-runtime", workItemId: "NF-20" },
      startingFingerprint: "b".repeat(64),
      changedDuringRun: false,
      lifecycleState,
      createdAt: START,
      ...(lifecycleState === "running" ? { startedAt: START } : {}),
      outputSummary: {
        truncated: false,
        droppedBytes: 0,
        redactionCount: 0,
        redactedSecrets: false,
      },
      deliveryState: "created",
      admission: {
        result: "allow",
        ruleId: "ADMIT.OPERATIONS.ALLOW_NEW",
        policyVersion: 1,
        decidedAt: START,
      },
    },
  ];
  return state;
}

const NONE: OperationPresentationRuntime = {
  ownedReservationRunIds: [],
  ownedProcessRunIds: [],
  liveProcessRunIds: [],
};

test("presentation requires runtime ownership and liveness for active truth", () => {
  const state = fixture("running");
  const active = projectOperationPresentation({
    canonicalState: state,
    runtimeOwnership: {
      ownedReservationRunIds: [],
      ownedProcessRunIds: ["RUN-1"],
      liveProcessRunIds: ["RUN-1"],
    },
    currentTime: Date.parse(NOW),
  });
  assert.equal(active.state, "active_running");
  assert.equal(active.displayLabel, "Repository checks");
  assert.equal(active.elapsedMs, 10_000);
  assert.equal(active.workItemId, "NF-20");

  const stale = projectOperationPresentation({
    canonicalState: state,
    runtimeOwnership: NONE,
    currentTime: Date.parse(NOW),
  });
  assert.equal(stale.state, "requires_reconciliation");
  assert.equal(stale.reconciliationCode, "runtime_ownership_absent");
  assert.equal(JSON.stringify(stale).includes("processIdentity"), false);
  assert.equal(JSON.stringify(stale).includes("/repo"), false);
});

test("starting, settled pending, and acknowledged states project deterministically", () => {
  const starting = fixture("starting");
  assert.equal(
    projectOperationPresentation({
      canonicalState: starting,
      runtimeOwnership: {
        ownedReservationRunIds: ["RUN-1"],
        ownedProcessRunIds: [],
        liveProcessRunIds: [],
      },
      currentTime: Date.parse(NOW),
    }).state,
    "active_starting",
  );

  const settled = fixture("passed");
  settled.operationRuns[0] = {
    ...settled.operationRuns[0]!,
    lifecycleState: "passed",
    settledAt: NOW,
    settlementReason: "passed",
    deliveryState: "delivered",
  };
  assert.equal(
    projectOperationPresentation({
      canonicalState: settled,
      runtimeOwnership: NONE,
      currentTime: Date.parse(NOW),
    }).state,
    "settled_pending_delivery",
  );
  settled.operationRuns[0] = { ...settled.operationRuns[0]!, deliveryState: "acknowledged" };
  assert.deepEqual(
    projectOperationPresentation({
      canonicalState: settled,
      runtimeOwnership: NONE,
      currentTime: Date.parse(NOW),
    }),
    { state: "none" },
  );
});

test("widget and Console consume the same bounded active projection", () => {
  const state = fixture("running");
  const operation = projectOperationPresentation({
    canonicalState: state,
    runtimeOwnership: {
      ownedReservationRunIds: [],
      ownedProcessRunIds: ["RUN-1"],
      liveProcessRunIds: ["RUN-1"],
    },
    currentTime: Date.parse(NOW),
  });
  const normal = homeViewLines(state, 80, null, operation);
  const narrow = homeViewLines(state, 24, null, operation);
  assert.match(normal[0]!, /operation active · Repository checks/);
  assert.match(narrow[0]!, /operation active/);
  assert.equal(normal.join("\n").includes("10s"), false);
  assert.ok(normal.every((line) => line.length <= 80));
  assert.ok(narrow.every((line) => line.length <= 24));

  const model = buildConsoleModel({ status: "ok", state, operation }, {});
  const text = renderConsole(model, { ...INITIAL_UI, view: "focus" }, 80, plainStyler).join("\n");
  assert.match(text, /ACTIVE OPERATION/);
  assert.match(text, /Repository checks · running · 10s/);
  assert.match(text, /Owned by NF-20/);
  assert.equal(text.includes("stdout"), false);
  assert.equal(text.includes("/repo"), false);
});
