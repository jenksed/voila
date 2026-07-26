// Deterministic Steward Console fixtures. Pure builders — no I/O.

import { createInitialState } from "../../src/domain/defaults.ts";
import {
  createWorkItem,
  recordAssumption,
  recordDecision,
  recordRisk,
  setFocusWorkItem,
  setNextAction,
  setNextActionRationale,
  setPhase,
  setHealth,
  updateWorkItem,
} from "../../src/domain/operations.ts";
import type { ProjectState } from "../../src/domain/types.ts";
import {
  buildConsoleModel,
  type ConsoleModel,
  type RuntimeContext,
} from "../../src/ui/steward-console/model.ts";

export const T = "2026-07-24T00:00:00.000Z";

export const RUNTIME: RuntimeContext = {
  branch: "feat/project-operations",
  dirty: false,
  piVersion: "0.82.0",
  nodeVersion: "v22.23.1",
};

export function emptyProject(): ProjectState {
  return createInitialState({ displayName: "empty-demo", now: T, projectId: "pid" });
}

/** A normal dogfood-like project: focus, rationale, mixed statuses, truth entries. */
export function normalProject(): ProjectState {
  let s = createInitialState({ displayName: "voila", now: T, projectId: "pid" });
  s = setPhase(s, "build");
  s = setHealth(s, "green");
  s = createWorkItem(
    s,
    {
      kind: "outcome",
      title: "Complete project operations",
      status: "in_progress",
      priority: "high",
    },
    T,
  ); // NF-1
  s = createWorkItem(
    s,
    { kind: "outcome", title: "Build planning-document intake", status: "ready", priority: "high" },
    T,
  ); // NF-2
  s = createWorkItem(s, { kind: "task", title: "Claims and receipts", dependsOn: ["NF-2"] }, T); // NF-3
  s = setFocusWorkItem(s, "NF-2");
  s = setNextAction(s, "Build planning-document intake and repository orientation.");
  s = setNextActionRationale(
    s,
    "It unlocks the first useful daily workflow and NF-3 depends on it.",
  );
  s = recordDecision(
    s,
    {
      title: "Canonical repository state",
      decision: "project.json is authoritative.",
      rationale: "ADR-0003.",
      status: "accepted",
    },
    T,
  );
  s = recordDecision(
    s,
    { title: "Proposed theme work", decision: "Ship a theme later.", rationale: "Not MVP." },
    T,
  );
  s = recordAssumption(
    s,
    { statement: "Pi 0.82.0 surfaces are stable enough.", confidence: "medium" },
    T,
  );
  s = recordRisk(
    s,
    { statement: "Single-writer state assumption remains.", likelihood: "low", impact: "high" },
    T,
  );
  return s;
}

/** Focus item is blocked, plus an invalidated assumption. */
export function blockedProject(): ProjectState {
  let s = normalProject();
  s = updateWorkItem(
    s,
    { id: "NF-2", status: "blocked", blockedReason: "waiting on schema decision" },
    T,
  );
  s = recordAssumption(
    s,
    { statement: "Terminal width is at least 80.", confidence: "low", status: "invalidated" },
    T,
  );
  return s;
}

/** Many work items, to exercise grouping and ordering. */
export function manyItemsProject(): ProjectState {
  let s = createInitialState({ displayName: "big", now: T, projectId: "pid" });
  const priorities = ["low", "urgent", "normal", "high"] as const;
  for (let i = 0; i < 12; i++) {
    s = createWorkItem(
      s,
      {
        kind: "task",
        title: `Item number ${i + 1}`,
        status: i % 3 === 0 ? "ready" : "backlog",
        priority: priorities[i % priorities.length],
      },
      T,
    );
  }
  return s;
}

/** Very long title and rationale, to exercise truncation and wrapping. */
export function longTextProject(): ProjectState {
  let s = createInitialState({ displayName: "long-text-demo", now: T, projectId: "pid" });
  s = createWorkItem(
    s,
    {
      kind: "task",
      title: `Long title ${"lorem ipsum dolor sit amet ".repeat(8)}`,
      status: "ready",
    },
    T,
  );
  s = setFocusWorkItem(s, "NF-1");
  s = setNextAction(s, `Do the thing ${"and then the next thing ".repeat(10)}`);
  s = setNextActionRationale(s, `Because ${"of a long chain of reasoning ".repeat(10)}`);
  return s;
}

export function modelOf(state: ProjectState): ConsoleModel {
  return buildConsoleModel({ status: "ok", state }, RUNTIME);
}

export function uninitializedModel(): ConsoleModel {
  return buildConsoleModel({ status: "uninitialized" }, RUNTIME);
}

export function migrationModel(): ConsoleModel {
  return buildConsoleModel({ status: "migration", message: "schema version 1" }, RUNTIME);
}

export function errorModel(): ConsoleModel {
  return buildConsoleModel({ status: "error", message: "malformed project.json" }, RUNTIME);
}

export const WIDTHS = [60, 80, 100, 120, 160];
