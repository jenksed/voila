// Shared test fixtures and helpers.

import { loadState } from "../src/state/store.ts";
import { requestIntakeRevision } from "../src/state/intake-store.ts";

/**
 * Record a revision request against an intake's current draft.
 *
 * Staging revision N+1 requires a recorded request against revision N, so tests that legitimately
 * stage a corrected draft go through the same gate a reviewer does.
 */
export async function requestRevision(
  root: string,
  intakeId: string,
  feedback = "Correct the objective before this is applied.",
): Promise<void> {
  const state = await loadState(root);
  const record = state.intakes.find((i) => i.id === intakeId);
  if (!record) throw new Error(`test helper: no intake ${intakeId}`);
  await requestIntakeRevision(root, intakeId, {
    reviewedDraftRevision: record.draftRevision,
    feedback,
  });
}

/** A valid Packet 1 (schema v1) canonical state, for migration tests. */
export const V1_FIXTURE = {
  schemaVersion: 1,
  projectId: "v1-project-id",
  displayName: "legacy-demo",
  phase: "research",
  health: "unknown",
  nextAction: "Define the first work boundary, then run /newfang status.",
  createdAt: "2026-07-24T00:00:00.000Z",
  updatedAt: "2026-07-24T00:00:00.000Z",
  revision: 3,
};

const T = "2026-07-24T00:00:00.000Z";

/** A valid Packet 2 (schema v2) canonical state with real operations, for v2 -> v3 migration tests. */
export const V2_FIXTURE = {
  schemaVersion: 2,
  projectId: "v2-project-id",
  displayName: "ops-demo",
  phase: "build",
  health: "green",
  nextAction: "Ship the operations layer.",
  nextActionRationale: "It unblocks intake.",
  focusWorkItemId: "NF-1",
  sequences: { workItem: 3, decision: 2, assumption: 2, risk: 2 },
  workItems: [
    {
      id: "NF-1",
      kind: "outcome",
      title: "Operations layer",
      status: "in_progress",
      priority: "high",
      acceptanceCriteria: ["work items persist"],
      dependsOn: [],
      createdAt: T,
      updatedAt: T,
    },
    {
      id: "NF-2",
      kind: "task",
      title: "Intake",
      status: "ready",
      priority: "high",
      acceptanceCriteria: [],
      dependsOn: ["NF-1"],
      createdAt: T,
      updatedAt: T,
    },
  ],
  decisions: [
    {
      id: "DEC-1",
      title: "Canonical state",
      decision: "project.json is authoritative.",
      rationale: "ADR-0003.",
      status: "accepted",
      createdAt: T,
      updatedAt: T,
    },
  ],
  assumptions: [
    {
      id: "ASM-1",
      statement: "Single machine target.",
      confidence: "high",
      status: "open",
      createdAt: T,
      updatedAt: T,
    },
  ],
  risks: [
    {
      id: "RSK-1",
      statement: "Pi version churn.",
      likelihood: "medium",
      impact: "medium",
      status: "open",
      createdAt: T,
      updatedAt: T,
    },
  ],
  createdAt: T,
  updatedAt: T,
  revision: 12,
};
