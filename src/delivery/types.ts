// Delivery engine types: the commit suggestion and the delivery summary.
//
// Both are *proposals*. The delivery engine never writes a commit, never stages a file, never
// pushes, and never opens a pull request. It joins the read-only inspection to canonical project
// truth and renders something a human can act on.
//
// Honesty rules carried over from the inspector and the proof engine:
//   - An attention item is a prompt to look, never a confirmed secret or defect.
//   - A claim is reported at its real evaluation status; a stale claim is never shown as support.
//   - Anything the engine could not see or deliberately capped is stated in `limitations`.

import type {
  DeliveryAttentionItem,
  DeliveryInspection,
  DiscoveredCommand,
  SuggestedCommitBoundary,
} from "../delivery-inspector/types.ts";
import type { ClaimEvaluationStatus } from "../domain/proof.ts";

/** Whether a proposed commit is safe to act on without looking first. */
export const COMMIT_READINESS = ["ready", "inspect_first", "blocked"] as const;
export type CommitReadiness = (typeof COMMIT_READINESS)[number];

export interface CommitSuggestion {
  /** Boundary this proposal covers, e.g. "B1". */
  boundaryId: string;
  /** Conventional-commit type carried from the inspector. */
  type: SuggestedCommitBoundary["suggestedType"];
  /** Proposed subject line, imperative and under the subject cap. */
  subject: string;
  /** Proposed body paragraphs. Empty when there is nothing honest to add. */
  body: string[];
  /** Sorted repository-relative paths this commit would cover. */
  paths: string[];
  /** Why the inspector grouped these paths. */
  rationale: string;
  readiness: CommitReadiness;
  /** Why the readiness is what it is. Always populated. */
  readinessReason: string;
  /** Attention items whose paths intersect this boundary. */
  attention: DeliveryAttentionItem[];
}

/** A claim joined to its current evidence, as it stands right now. */
export interface DeliveryClaim {
  claimId: string;
  workItemId: string;
  statement: string;
  status: ClaimEvaluationStatus;
  reason: string;
  receiptCount: number;
  currentReceiptId?: string;
  knownLimitations: string[];
}

export interface DeliverySummary {
  /** Project identity and position, from canonical state. */
  projectName: string;
  phase: string;
  health: string;
  branch?: string;
  head?: string;
  /** What changed, straight from the inspection. */
  inspection: DeliveryInspection;
  /** Claims relevant to this delivery, at their real status. */
  claims: DeliveryClaim[];
  /** Claims that currently support a completion argument (status "supported"). */
  supportingClaimIds: string[];
  /** Claims that do NOT currently support one, with the reason. Never hidden. */
  unsupportedClaimIds: string[];
  /** Open risks from canonical state, plus honest delivery-shaped concerns. */
  risks: string[];
  /** Everything the engine could not see, could not do, or capped. */
  limitations: string[];
  /** Verification commands the inspector found. Never executed by the engine. */
  verificationCommands: DiscoveredCommand[];
  /** Canonical next action; the summary never invents one. */
  nextAction: string;
  nextActionRationale?: string;
  /** Proposed commits, in boundary order. */
  commits: CommitSuggestion[];
  /** True when no change was observed at all. */
  clean: boolean;
}
