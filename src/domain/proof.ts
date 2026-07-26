// Pure proof domain: claims, derived evidence evaluation, and the protected completion transition.
// No Pi, no I/O, no clock reads beyond an injected `now`. The store's updateState wraps these.
//
// The guarantee implemented here is narrow and deliberate: canonical state will not move a work item
// to `completed` unless every acceptance criterion is covered by a required claim and every required
// claim is supported by a current passing receipt. It does NOT guarantee that a model never writes
// unsupported prose — only that the state transition is refused.

import type {
  Claim,
  Confidence,
  ProjectState,
  ReceiptResult,
  VerificationReceiptRecord,
  WorkItem,
} from "./types.ts";
import { CONFIDENCES } from "./types.ts";
import { allocateId } from "./ids.ts";
import { ProjectOperationError } from "./errors.ts";

// --- Evidence evaluation (derived; NEVER written into canonical state by reading) ---

export const CLAIM_EVALUATIONS = ["pending", "supported", "unsupported", "stale"] as const;
export type ClaimEvaluationStatus = (typeof CLAIM_EVALUATIONS)[number];

export interface ClaimEvaluation {
  claimId: string;
  status: ClaimEvaluationStatus;
  /** Newest receipt recorded for the claim, regardless of fingerprint. */
  latestReceiptId?: string;
  latestResult?: ReceiptResult;
  /** Newest receipt whose fingerprint matches the current repository state, if any. */
  currentReceiptId?: string;
  currentResult?: ReceiptResult;
  receiptCount: number;
  reason: string;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProjectOperationError(`${field} is required and must be a non-empty string.`);
  }
  return value;
}

function requireConfidence(value: unknown): Confidence {
  if (typeof value !== "string" || !(CONFIDENCES as readonly string[]).includes(value)) {
    throw new ProjectOperationError(
      `Invalid confidence: ${String(value)}. Allowed: ${CONFIDENCES.join(", ")}.`,
    );
  }
  return value as Confidence;
}

export function findClaim(state: Readonly<ProjectState>, claimId: string): Claim {
  const claim = state.claims.find((c) => c.id === claimId);
  if (!claim) throw new ProjectOperationError(`Claim not found: ${claimId}.`);
  return claim;
}

export function findWorkItem(state: Readonly<ProjectState>, workItemId: string): WorkItem {
  const item = state.workItems.find((w) => w.id === workItemId);
  if (!item) throw new ProjectOperationError(`Work item not found: ${workItemId}.`);
  return item;
}

export function findReceipt(
  state: Readonly<ProjectState>,
  receiptId: string,
): VerificationReceiptRecord {
  const receipt = state.receipts.find((r) => r.id === receiptId);
  if (!receipt) throw new ProjectOperationError(`Receipt not found: ${receiptId}.`);
  return receipt;
}

/** Receipts linked to a claim, in creation order. Unresolvable links are skipped (doctor reports them). */
export function receiptsForClaim(
  state: Readonly<ProjectState>,
  claim: Claim,
): VerificationReceiptRecord[] {
  const byId = new Map(state.receipts.map((r) => [r.id, r]));
  return claim.receiptIds
    .map((id) => byId.get(id))
    .filter((r): r is VerificationReceiptRecord => r !== undefined);
}

/**
 * Derive a claim's evidence status against the current repository fingerprint.
 *
 * - `pending`     — no receipt exists
 * - `supported`   — the newest receipt matching the current fingerprint passed
 * - `unsupported` — the newest receipt matching the current fingerprint failed/errored/timed out
 * - `stale`       — receipts exist but none matches the current fingerprint
 *
 * When the fingerprint is unavailable (no git), nothing can be shown as current, so any existing
 * evidence is reported `stale` rather than optimistically `supported`.
 */
export function evaluateClaim(
  state: Readonly<ProjectState>,
  claim: Claim,
  currentFingerprint: string | null,
): ClaimEvaluation {
  const receipts = receiptsForClaim(state, claim);
  const latest = receipts[receipts.length - 1];
  const base = {
    claimId: claim.id,
    receiptCount: receipts.length,
    ...(latest ? { latestReceiptId: latest.id, latestResult: latest.result } : {}),
  };

  if (receipts.length === 0) {
    return { ...base, status: "pending", reason: "no verification receipt has been recorded" };
  }
  if (currentFingerprint === null) {
    return {
      ...base,
      status: "stale",
      reason: "the repository fingerprint is unavailable, so no receipt can be shown as current",
    };
  }
  const current = [...receipts]
    .reverse()
    .find((r) => r.repositoryFingerprint === currentFingerprint);
  if (!current) {
    return {
      ...base,
      status: "stale",
      reason: `the repository changed since ${latest?.id ?? "the last receipt"} was recorded; re-run verification`,
    };
  }
  const withCurrent = { ...base, currentReceiptId: current.id, currentResult: current.result };
  if (current.result === "passed") {
    return {
      ...withCurrent,
      status: "supported",
      reason: `${current.id} passed against the current repository state`,
    };
  }
  return {
    ...withCurrent,
    status: "unsupported",
    reason: `${current.id} ${current.result === "failed" ? "failed" : current.result.replace("_", " ")} against the current repository state`,
  };
}

/** Evaluate every claim, keyed by claim ID. Read-only. */
export function evaluateAllClaims(
  state: Readonly<ProjectState>,
  currentFingerprint: string | null,
): Map<string, ClaimEvaluation> {
  return new Map(state.claims.map((c) => [c.id, evaluateClaim(state, c, currentFingerprint)]));
}

// --- Claim operations ---

export interface CreateClaimInput {
  workItemId: string;
  statement: string;
  confidence: Confidence;
  coveredAcceptanceCriteria: string[];
  knownLimitations?: string[];
}

/**
 * Create a claim. Every covered criterion must match a criterion currently on the referenced work
 * item **exactly** — a claim cannot cover a criterion the work item does not state.
 */
export function createClaim(
  state: Readonly<ProjectState>,
  input: CreateClaimInput,
  now: string,
): ProjectState {
  const item = findWorkItem(state, requireNonEmpty(input.workItemId, "workItemId"));
  const statement = requireNonEmpty(input.statement, "statement");
  const confidence = requireConfidence(input.confidence);
  const covered = normalizeCoverage(input.coveredAcceptanceCriteria, item);

  const { id, sequences } = allocateId(state.sequences, "claim");
  const claim: Claim = {
    id,
    workItemId: item.id,
    statement,
    confidence,
    coveredAcceptanceCriteria: covered,
    knownLimitations: [...(input.knownLimitations ?? [])],
    receiptIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...state, sequences, claims: [...state.claims, claim] };
}

function normalizeCoverage(raw: unknown, item: WorkItem): string[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ProjectOperationError(
      `A claim must cover at least one acceptance criterion of ${item.id}. Its criteria are: ${
        item.acceptanceCriteria.length > 0
          ? item.acceptanceCriteria.map((c) => `"${c}"`).join(", ")
          : "(none recorded — add acceptance criteria first)"
      }.`,
    );
  }
  const known = new Set(item.acceptanceCriteria);
  const covered: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== "string") {
      throw new ProjectOperationError("coveredAcceptanceCriteria entries must be strings.");
    }
    if (!known.has(entry)) {
      throw new ProjectOperationError(
        `Criterion is not an exact acceptance criterion of ${item.id}: "${entry}". Copy the criterion text exactly; current criteria: ${
          item.acceptanceCriteria.map((c) => `"${c}"`).join(", ") || "(none)"
        }.`,
      );
    }
    if (!covered.includes(entry)) covered.push(entry);
  }
  return covered;
}

export interface UpdateClaimInput {
  id: string;
  statement?: string;
  confidence?: Confidence;
  coveredAcceptanceCriteria?: string[];
  knownLimitations?: string[];
}

/**
 * Update the permitted fields of a claim. The work item it refers to is immutable, receipts are never
 * rewritten, and there is no support flag to set.
 */
export function updateClaim(
  state: Readonly<ProjectState>,
  input: UpdateClaimInput,
  now: string,
): ProjectState {
  const index = state.claims.findIndex((c) => c.id === input.id);
  if (index < 0) throw new ProjectOperationError(`Claim not found: ${input.id}.`);
  const current = state.claims[index] as Claim;
  const item = findWorkItem(state, current.workItemId);

  const next: Claim = {
    ...current,
    // Historical receipt links are preserved exactly; updating a claim never rewrites evidence.
    receiptIds: [...current.receiptIds],
    updatedAt: now,
  };
  if (input.statement !== undefined) next.statement = requireNonEmpty(input.statement, "statement");
  if (input.confidence !== undefined) next.confidence = requireConfidence(input.confidence);
  if (input.coveredAcceptanceCriteria !== undefined) {
    next.coveredAcceptanceCriteria = normalizeCoverage(input.coveredAcceptanceCriteria, item);
  }
  if (input.knownLimitations !== undefined) {
    next.knownLimitations = [...input.knownLimitations];
  }

  const claims = [...state.claims];
  claims[index] = next;
  return { ...state, claims };
}

/** Attach a claim to its work item as a completion requirement. Duplicates are rejected. */
export function requireClaim(
  state: Readonly<ProjectState>,
  input: { workItemId: string; claimId: string },
  now: string,
): ProjectState {
  const item = findWorkItem(state, input.workItemId);
  const claim = findClaim(state, input.claimId);
  if (claim.workItemId !== item.id) {
    throw new ProjectOperationError(
      `Claim ${claim.id} is about ${claim.workItemId}, not ${item.id}; a claim cannot be required by another work item.`,
    );
  }
  if (item.requiredClaimIds.includes(claim.id)) {
    throw new ProjectOperationError(`${claim.id} is already a required claim of ${item.id}.`);
  }
  if (item.status === "completed") {
    throw new ProjectOperationError(
      `${item.id} is completed; its proof requirements are part of the completion record and cannot change.`,
    );
  }
  return {
    ...state,
    workItems: state.workItems.map((w) =>
      w.id === item.id
        ? { ...w, requiredClaimIds: [...w.requiredClaimIds, claim.id], updatedAt: now }
        : w,
    ),
  };
}

/** Detach a proof requirement. Refused for completed work: completion records never lose their proof. */
export function detachClaim(
  state: Readonly<ProjectState>,
  input: { workItemId: string; claimId: string },
  now: string,
): ProjectState {
  const item = findWorkItem(state, input.workItemId);
  if (item.status === "completed") {
    throw new ProjectOperationError(
      `Cannot remove proof requirements from completed work item ${item.id}.`,
    );
  }
  if (!item.requiredClaimIds.includes(input.claimId)) {
    throw new ProjectOperationError(`${input.claimId} is not a required claim of ${item.id}.`);
  }
  return {
    ...state,
    workItems: state.workItems.map((w) =>
      w.id === item.id
        ? {
            ...w,
            requiredClaimIds: w.requiredClaimIds.filter((c) => c !== input.claimId),
            updatedAt: now,
          }
        : w,
    ),
  };
}

export interface ClaimFilter {
  workItemId?: string;
  status?: ClaimEvaluationStatus;
}

/** List claims, optionally filtered by work item and derived evaluation status. */
export function listClaims(
  state: Readonly<ProjectState>,
  currentFingerprint: string | null,
  filter: ClaimFilter = {},
): Array<{ claim: Claim; evaluation: ClaimEvaluation; required: boolean }> {
  const requiredIds = new Set(state.workItems.flatMap((w) => w.requiredClaimIds));
  return state.claims
    .filter((c) => filter.workItemId === undefined || c.workItemId === filter.workItemId)
    .map((claim) => ({
      claim,
      evaluation: evaluateClaim(state, claim, currentFingerprint),
      required: requiredIds.has(claim.id),
    }))
    .filter((row) => filter.status === undefined || row.evaluation.status === filter.status);
}

/**
 * Link a newly created receipt to its claim and advance the receipt counter. The artifact must already
 * exist on disk before this runs.
 *
 * The ID is re-derived from the canonical counter here so the counter stays authoritative. If it no
 * longer matches the ID the caller reserved, state moved underneath the run and the link is refused
 * rather than silently colliding with another receipt.
 */
export function linkReceipt(
  state: Readonly<ProjectState>,
  receipt: VerificationReceiptRecord,
  now: string,
): ProjectState {
  const claim = findClaim(state, receipt.claimId);
  if (state.receipts.some((r) => r.id === receipt.id)) {
    throw new ProjectOperationError(
      `Receipt ${receipt.id} already exists; receipts are immutable.`,
    );
  }
  const alloc = allocateId(state.sequences, "receipt");
  if (alloc.id !== receipt.id) {
    throw new ProjectOperationError(
      `Receipt ID ${receipt.id} no longer matches the canonical counter (which would allocate ${alloc.id}); canonical state changed during verification. The artifact is on disk but was not linked.`,
    );
  }
  return {
    ...state,
    sequences: alloc.sequences,
    receipts: [...state.receipts, receipt],
    claims: state.claims.map((c) =>
      c.id === claim.id ? { ...c, receiptIds: [...c.receiptIds, receipt.id], updatedAt: now } : c,
    ),
  };
}

// --- Acceptance-criterion coverage ---

export interface CriterionCoverage {
  criterion: string;
  claimIds: string[];
  covered: boolean;
}

/** Which of a work item's acceptance criteria are covered by its **required** claims. */
export function criterionCoverage(
  state: Readonly<ProjectState>,
  item: WorkItem,
): CriterionCoverage[] {
  const required = item.requiredClaimIds
    .map((id) => state.claims.find((c) => c.id === id))
    .filter((c): c is Claim => c !== undefined);
  return item.acceptanceCriteria.map((criterion) => {
    const claimIds = required
      .filter((c) => c.coveredAcceptanceCriteria.includes(criterion))
      .map((c) => c.id);
    return { criterion, claimIds, covered: claimIds.length > 0 };
  });
}

// --- Protected completion ---

export interface CompletionGate {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface CompletionAssessment {
  workItemId: string;
  gates: CompletionGate[];
  ready: boolean;
  failing: CompletionGate[];
}

/** Domain error carrying **every** failing gate, not just the first. */
export class CompletionRejectedError extends ProjectOperationError {
  assessment: CompletionAssessment;
  constructor(assessment: CompletionAssessment) {
    super(
      [
        `Cannot complete ${assessment.workItemId}: ${assessment.failing.length} gate(s) fail.`,
        ...assessment.failing.map((g) => `  - ${g.label}: ${g.detail}`),
      ].join("\n"),
    );
    this.name = "CompletionRejectedError";
    this.assessment = assessment;
  }
}

function gate(id: string, label: string, passed: boolean, detail: string): CompletionGate {
  return { id, label, passed, detail };
}

/**
 * Evaluate every completion gate for a work item. Read-only and total: all gates are reported so the
 * caller can show the complete list of what is missing.
 */
export function assessCompletion(
  state: Readonly<ProjectState>,
  workItemId: string,
  currentFingerprint: string | null,
): CompletionAssessment {
  const item = findWorkItem(state, workItemId);
  const gates: CompletionGate[] = [];

  gates.push(
    gate(
      "not_completed",
      "not already completed",
      item.status !== "completed",
      item.status === "completed" ? `${item.id} is already completed` : "ok",
    ),
  );
  gates.push(
    gate(
      "not_cancelled",
      "not cancelled",
      item.status !== "cancelled",
      item.status === "cancelled" ? `${item.id} is cancelled` : "ok",
    ),
  );
  gates.push(
    gate(
      "not_blocked",
      "not blocked",
      item.status !== "blocked",
      item.status === "blocked" ? `${item.id} is blocked` : "ok",
    ),
  );
  const reason = item.blockedReason?.trim() ?? "";
  gates.push(
    gate(
      "no_blocked_reason",
      "no outstanding blocked reason",
      reason.length === 0,
      reason.length > 0 ? `blocked reason still recorded: ${reason}` : "ok",
    ),
  );

  const byId = new Map(state.workItems.map((w) => [w.id, w]));
  const openDeps = item.dependsOn.filter((d) => byId.get(d)?.status !== "completed");
  gates.push(
    gate(
      "dependencies_completed",
      "dependencies completed",
      openDeps.length === 0,
      openDeps.length > 0 ? `not completed: ${openDeps.join(", ")}` : "ok",
    ),
  );

  gates.push(
    gate(
      "acceptance_criteria_present",
      "acceptance criteria recorded",
      item.acceptanceCriteria.length > 0,
      item.acceptanceCriteria.length === 0
        ? "no acceptance criteria; completion is undefined without them"
        : `${item.acceptanceCriteria.length} criterion(s)`,
    ),
  );

  gates.push(
    gate(
      "required_claims_present",
      "required claims attached",
      item.requiredClaimIds.length > 0,
      item.requiredClaimIds.length === 0
        ? "no required claims; attach one with voila_require_claim"
        : `${item.requiredClaimIds.join(", ")}`,
    ),
  );

  const missingClaims = item.requiredClaimIds.filter(
    (id) => !state.claims.some((c) => c.id === id),
  );
  gates.push(
    gate(
      "required_claims_resolve",
      "required claims exist",
      missingClaims.length === 0,
      missingClaims.length > 0 ? `unknown claim(s): ${missingClaims.join(", ")}` : "ok",
    ),
  );

  const coverage = criterionCoverage(state, item);
  const uncovered = coverage.filter((c) => !c.covered);
  gates.push(
    gate(
      "criteria_covered",
      "every acceptance criterion covered by a required claim",
      item.acceptanceCriteria.length > 0 && uncovered.length === 0,
      item.acceptanceCriteria.length === 0
        ? "no criteria to cover"
        : uncovered.length > 0
          ? `uncovered: ${uncovered.map((c) => `"${c.criterion}"`).join(", ")}`
          : "ok",
    ),
  );

  const evaluations = item.requiredClaimIds
    .map((id) => state.claims.find((c) => c.id === id))
    .filter((c): c is Claim => c !== undefined)
    .map((c) => evaluateClaim(state, c, currentFingerprint));
  const unsupported = evaluations.filter((e) => e.status !== "supported");
  gates.push(
    gate(
      "claims_supported",
      "every required claim supported by current passing evidence",
      item.requiredClaimIds.length > 0 && unsupported.length === 0,
      item.requiredClaimIds.length === 0
        ? "no required claims to support"
        : unsupported.length > 0
          ? unsupported.map((e) => `${e.claimId} is ${e.status} (${e.reason})`).join("; ")
          : "ok",
    ),
  );

  const highRisks = state.risks.filter(
    (r) =>
      r.status === "open" && r.impact === "high" && (r.linkedWorkItems ?? []).includes(item.id),
  );
  gates.push(
    gate(
      "no_open_high_impact_risk",
      "no open high-impact linked risk",
      highRisks.length === 0,
      highRisks.length > 0
        ? `open high-impact risk(s): ${highRisks.map((r) => r.id).join(", ")}`
        : "ok",
    ),
  );

  const failing = gates.filter((g) => !g.passed);
  return { workItemId: item.id, gates, ready: failing.length === 0, failing };
}

/**
 * The ONLY pure transition to `completed`. Throws CompletionRejectedError listing every failing gate;
 * a rejected transition returns no state at all, so callers leave canonical bytes untouched.
 * On success the item's history is preserved and focus is cleared if it pointed at this item — no new
 * focus is selected automatically.
 */
export function completeWorkItem(
  state: Readonly<ProjectState>,
  workItemId: string,
  currentFingerprint: string | null,
  now: string,
): { state: ProjectState; assessment: CompletionAssessment } {
  const assessment = assessCompletion(state, workItemId, currentFingerprint);
  if (!assessment.ready) throw new CompletionRejectedError(assessment);

  const next: ProjectState = {
    ...state,
    workItems: state.workItems.map((w) =>
      w.id === workItemId ? { ...w, status: "completed" as const, updatedAt: now } : w,
    ),
    focusWorkItemId: state.focusWorkItemId === workItemId ? null : state.focusWorkItemId,
  };
  return { state: next, assessment };
}

/** Compact proof summary used by the ambient widget and injected context. */
export interface ProofSummary {
  total: number;
  pending: number;
  supported: number;
  unsupported: number;
  stale: number;
  fingerprintAvailable: boolean;
}

export function proofSummary(
  state: Readonly<ProjectState>,
  currentFingerprint: string | null,
): ProofSummary {
  const summary: ProofSummary = {
    total: state.claims.length,
    pending: 0,
    supported: 0,
    unsupported: 0,
    stale: 0,
    fingerprintAvailable: currentFingerprint !== null,
  };
  for (const claim of state.claims) {
    summary[evaluateClaim(state, claim, currentFingerprint).status] += 1;
  }
  return summary;
}
