// Delivery summary. Pure — no I/O.
//
// Joins the read-only inspection to canonical project truth: what changed, which claims currently
// carry evidence, what is risky or unknown, and what the project says to do next.
//
// The honesty rules that matter here:
//   - A claim is reported at its REAL evaluation status. A stale claim is listed as unsupported
//     with its reason, never quietly counted as support. This is the whole point of the proof
//     engine, and a delivery summary is exactly where the temptation to round up would appear.
//   - `nextAction` is read from canonical state. The summary never invents one.
//   - Everything unseen or capped is stated, including the case where git was unavailable so no
//     claim could be shown as current evidence.

import type { DeliveryInspection } from "../delivery-inspector/types.ts";
import type { ProjectState } from "../domain/types.ts";
import { evaluateAllClaims } from "../domain/proof.ts";
import { suggestCommits } from "./commit.ts";
import type { DeliveryClaim, DeliverySummary } from "./types.ts";

export interface BuildDeliverySummaryInput {
  state: Readonly<ProjectState>;
  inspection: DeliveryInspection;
  /** Current repository fingerprint, or null when git could not provide one. */
  fingerprint: string | null;
}

/**
 * Build the summary. Deterministic: the same state, inspection, and fingerprint always produce the
 * same object, so a summary can be diffed across runs.
 */
export function buildDeliverySummary(input: BuildDeliverySummaryInput): DeliverySummary {
  const { state, inspection, fingerprint } = input;

  const evaluations = [...evaluateAllClaims(state, fingerprint).values()];
  const claims: DeliveryClaim[] = evaluations
    .map((evaluation): DeliveryClaim | null => {
      const claim = state.claims.find((c) => c.id === evaluation.claimId);
      if (!claim) return null;
      return {
        claimId: claim.id,
        workItemId: claim.workItemId,
        statement: claim.statement,
        status: evaluation.status,
        reason: evaluation.reason,
        receiptCount: evaluation.receiptCount,
        ...(evaluation.currentReceiptId ? { currentReceiptId: evaluation.currentReceiptId } : {}),
        knownLimitations: [...claim.knownLimitations],
      } satisfies DeliveryClaim;
    })
    .filter((c): c is DeliveryClaim => c !== null)
    .sort((a, b) => (a.claimId < b.claimId ? -1 : 1));

  const supportingClaimIds = claims.filter((c) => c.status === "supported").map((c) => c.claimId);
  const unsupportedClaimIds = claims.filter((c) => c.status !== "supported").map((c) => c.claimId);

  const risks = buildRisks(state, inspection);
  const limitations = buildLimitations(inspection, fingerprint, claims.length);

  return {
    projectName: state.displayName,
    phase: state.phase,
    health: state.health,
    ...(inspection.repository.branch ? { branch: inspection.repository.branch } : {}),
    ...(inspection.repository.head ? { head: inspection.repository.head } : {}),
    inspection,
    claims,
    supportingClaimIds,
    unsupportedClaimIds,
    risks,
    limitations,
    verificationCommands: inspection.discoveredVerificationCommands,
    nextAction: state.nextAction,
    ...(state.nextActionRationale ? { nextActionRationale: state.nextActionRationale } : {}),
    commits: suggestCommits(inspection),
    clean: inspection.changes.length === 0,
  };
}

/**
 * Open project risks, plus delivery-shaped concerns derived from the change set. Every entry is
 * traceable to canonical state or to the inspection; none is invented.
 */
function buildRisks(state: Readonly<ProjectState>, inspection: DeliveryInspection): string[] {
  const risks: string[] = [];

  for (const risk of state.risks) {
    if (risk.status !== "open") continue;
    risks.push(`${risk.id} (${risk.likelihood}/${risk.impact}) ${risk.statement}`);
  }

  const blocking = inspection.attention.filter(
    (item) => item.severity === "inspect_before_delivery",
  );
  for (const item of blocking) {
    risks.push(
      `${item.kind}: ${item.reason} Paths: ${item.paths.slice(0, 5).join(", ")}${
        item.paths.length > 5 ? ` (+${item.paths.length - 5} more)` : ""
      }`,
    );
  }

  if (inspection.unassignedPaths.length > 0) {
    risks.push(
      `${inspection.unassignedPaths.length} changed path(s) were not grouped into any suggested commit, so they are easy to deliver by accident or to forget entirely.`,
    );
  }

  return risks;
}

function buildLimitations(
  inspection: DeliveryInspection,
  fingerprint: string | null,
  claimCount: number,
): string[] {
  const limitations = [...inspection.limitations];

  if (fingerprint === null) {
    limitations.push(
      "Git could not provide a repository fingerprint, so no claim can be shown as current evidence. Every claim below is reported without freshness.",
    );
  }
  if (claimCount === 0) {
    limitations.push(
      "No claims are recorded, so this delivery carries no evidence. A summary without claims describes what changed, not what is proven.",
    );
  }
  limitations.push(
    "The delivery engine proposes; it does not commit, stage, push, or open a pull request. Verification commands are listed, never executed.",
  );

  return limitations;
}
