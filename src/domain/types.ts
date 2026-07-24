// Canonical NewFang project-state types. Pure domain — no Pi, no I/O.

/** Bump only with an explicit, documented migration. Incompatible versions are never auto-rewritten. */
export const SCHEMA_VERSION = 1;

export const PHASES = ["research", "sketch", "build", "harden", "release"] as const;
export type Phase = (typeof PHASES)[number];

export const HEALTHS = ["green", "yellow", "red", "unknown"] as const;
export type Health = (typeof HEALTHS)[number];

/**
 * The authoritative current-state snapshot persisted to `.newfang/project.json`.
 * Deliberately minimal for Packet 1: no backlog/claims/risks/receipts yet.
 */
export interface ProjectState {
  schemaVersion: number;
  /** Stable identifier, generated once at init and never changed. */
  projectId: string;
  displayName: string;
  phase: Phase;
  health: Health;
  nextAction: string;
  /** ISO-8601, set at init, never changed. */
  createdAt: string;
  /** ISO-8601, updated on every state mutation. */
  updatedAt: string;
  /** Monotonic, starts at 1, increments by 1 per mutation. */
  revision: number;
}
