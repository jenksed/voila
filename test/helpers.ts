// Shared test fixtures.

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
