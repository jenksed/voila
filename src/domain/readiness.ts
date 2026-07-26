// Derived readiness presentation. Pure — no I/O, no state writes.
//
// Why this exists (R1, NF-9 acceptance criterion 4): passing the automated completion gates is not
// the same as being accepted. A required claim's `knownLimitations` are, by construction, the things
// its evidence does NOT establish — including a pending authenticated or interactive human tier. An
// item whose gates all pass while such a limitation still stands must not be presented as an
// unqualified "READY to complete"; it is HELD.
//
// This changes presentation only. It does not add a completion gate, alter a lifecycle status, or
// introduce a human-attestation framework: the canonical status of a held item is whatever it was,
// and `completeWorkItem` still owns the transition. The derivation reads only supported canonical
// state, so it changes exactly when that state changes.

import { assessCompletion } from "./proof.ts";
import { abbreviate } from "./status.ts";
import type { Claim, ProjectState, WorkItem } from "./types.ts";

export type ReadinessKind = "completed" | "cancelled" | "held" | "blocked" | "ready";

export interface OutstandingLimitation {
  claimId: string;
  limitation: string;
}

export interface Readiness {
  kind: ReadinessKind;
  /** Short label safe for any surface. Never an unqualified "READY" while a hold stands. */
  label: string;
  /** One line of why, printable next to the label. */
  detail: string;
  /** Limitations recorded on the item's required claims. Empty for an unqualified ready item. */
  outstanding: OutstandingLimitation[];
  failingGateCount: number;
}

/** Limitations recorded on an item's **required** claims, in canonical order. */
export function outstandingLimitations(
  state: Readonly<ProjectState>,
  item: WorkItem,
): OutstandingLimitation[] {
  const byId = new Map(state.claims.map((c) => [c.id, c] as const));
  const out: OutstandingLimitation[] = [];
  for (const claimId of item.requiredClaimIds) {
    const claim: Claim | undefined = byId.get(claimId);
    if (!claim) continue;
    for (const limitation of claim.knownLimitations) out.push({ claimId, limitation });
  }
  return out;
}

/**
 * Classify a work item's readiness for presentation.
 *
 * - `completed` / `cancelled` — the canonical status speaks for itself.
 * - `blocked` — at least one completion gate fails; the count is the honest summary.
 * - `held` — every gate passes, but a required claim still records what its evidence does not
 *   establish. Automated proof alone cannot accept the work.
 * - `ready` — every gate passes and no required claim records an outstanding limitation.
 */
export function deriveReadiness(
  state: Readonly<ProjectState>,
  item: WorkItem,
  currentFingerprint: string | null,
): Readiness {
  const outstanding = outstandingLimitations(state, item);
  if (item.status === "completed") {
    return {
      kind: "completed",
      label: "completed",
      detail: "the completion transition is recorded in canonical state",
      outstanding,
      failingGateCount: 0,
    };
  }
  if (item.status === "cancelled") {
    return {
      kind: "cancelled",
      label: "cancelled",
      detail: "cancelled work has no readiness",
      outstanding,
      failingGateCount: 0,
    };
  }

  const assessment = assessCompletion(state, item.id, currentFingerprint);
  if (!assessment.ready) {
    return {
      kind: "blocked",
      label: `${assessment.failing.length} gate(s) failing`,
      detail: assessment.failing.map((g) => g.label).join("; "),
      outstanding,
      failingGateCount: assessment.failing.length,
    };
  }
  if (outstanding.length > 0) {
    return {
      kind: "held",
      label: "HELD",
      detail: `every automated completion gate passes, but ${holdSummary(outstanding)}`,
      outstanding,
      failingGateCount: 0,
    };
  }
  return {
    kind: "ready",
    label: "READY to complete",
    detail: "every completion gate passes and no required claim records an outstanding limitation",
    outstanding,
    failingGateCount: 0,
  };
}

/**
 * One phrase naming the hold, without choosing between recorded limitations: which limitation
 * matters most is a judgement, and the capsule budget is not the place to guess. Surfaces with room
 * (`/voila proof NF-n`) list every one.
 */
export function holdSummary(outstanding: OutstandingLimitation[]): string {
  const claimIds = [...new Set(outstanding.map((o) => o.claimId))];
  return `${claimIds.join(", ")} still records ${outstanding.length} outstanding limitation(s), so automated proof alone cannot accept this work`;
}

/** One compact line, e.g. `NF-2 — HELD: CLM-4 still records 3 outstanding limitation(s)`. */
export function readinessLine(item: WorkItem, readiness: Readiness, max = 140): string {
  return `${item.id} — ${readiness.label}: ${abbreviate(readiness.detail, max)}`;
}

const HELD_ORDER: Record<string, number> = { in_progress: 0, ready: 1 };

/**
 * Startable work whose required claims still record outstanding limitations — the work a Steward
 * could wrongly pick up and drive to completion. Backlog and blocked items are excluded: their
 * dependencies already stop them, and listing them would crowd the capsule with items nobody was
 * about to start.
 *
 * Fingerprint-independent by design: a hold is a property of the recorded evidence, not of today's
 * repository state, so it does not appear and disappear as verification goes stale.
 */
export function heldWork(state: Readonly<ProjectState>): WorkItem[] {
  return state.workItems
    .filter((w) => w.status === "ready" || w.status === "in_progress")
    .filter((w) => outstandingLimitations(state, w).length > 0)
    .sort((a, b) => (HELD_ORDER[a.status] ?? 9) - (HELD_ORDER[b.status] ?? 9));
}
