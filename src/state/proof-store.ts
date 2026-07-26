// Read-only assembly of proof state: canonical claims/receipts + the current repository fingerprint,
// turned into derived evaluations. Every surface (tools, commands, console, widget, context, doctor)
// reads through here so they cannot disagree.
//
// Strictly read-only: computing an overview never writes canonical state, and a derived status is
// never persisted.

import type { Claim, ProjectState, VerificationReceiptRecord, WorkItem } from "../domain/types.ts";
import type { ClaimEvaluation, CompletionAssessment, ProofSummary } from "../domain/proof.ts";
import {
  assessCompletion,
  criterionCoverage,
  evaluateClaim,
  proofSummary,
  receiptsForClaim,
} from "../domain/proof.ts";
import { loadState } from "./store.ts";
import { tryRepositoryFingerprint } from "./fingerprint.ts";

export interface ClaimOverview {
  claim: Claim;
  evaluation: ClaimEvaluation;
  /** True when some work item lists this claim as a completion requirement. */
  required: boolean;
  workItem: WorkItem | null;
  latestReceipt: VerificationReceiptRecord | null;
}

export interface ProofOverview {
  state: ProjectState;
  /** null when git is unavailable; nothing can then be shown as current evidence. */
  fingerprint: string | null;
  claims: ClaimOverview[];
  summary: ProofSummary;
}

/** Build the derived proof overview for a project root. */
export async function loadProofOverview(root: string): Promise<ProofOverview> {
  const state = await loadState(root);
  const fingerprint = await tryRepositoryFingerprint(root);
  return buildProofOverview(state, fingerprint);
}

/** Pure projection, so tests and the console can build an overview without touching git. */
export function buildProofOverview(state: ProjectState, fingerprint: string | null): ProofOverview {
  const requiredIds = new Set(state.workItems.flatMap((w) => w.requiredClaimIds));
  const claims: ClaimOverview[] = state.claims.map((claim) => {
    const receipts = receiptsForClaim(state, claim);
    return {
      claim,
      evaluation: evaluateClaim(state, claim, fingerprint),
      required: requiredIds.has(claim.id),
      workItem: state.workItems.find((w) => w.id === claim.workItemId) ?? null,
      latestReceipt: receipts[receipts.length - 1] ?? null,
    };
  });
  return { state, fingerprint, claims, summary: proofSummary(state, fingerprint) };
}

/** Completion readiness for one work item, using the same gates the transition enforces. */
export function completionReadiness(
  overview: ProofOverview,
  workItemId: string,
): CompletionAssessment | null {
  if (!overview.state.workItems.some((w) => w.id === workItemId)) return null;
  return assessCompletion(overview.state, workItemId, overview.fingerprint);
}

/** Criterion-by-criterion coverage for one work item, for curated display. */
export function coverageFor(overview: ProofOverview, workItemId: string) {
  const item = overview.state.workItems.find((w) => w.id === workItemId);
  if (!item) return [];
  return criterionCoverage(overview.state, item);
}
