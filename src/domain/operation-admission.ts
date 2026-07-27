// Pure deterministic admission for one accepted finite operation (R2A).
//
// This module has no Pi, process, filesystem, clock, environment, prompt, model, or conversation
// inputs. Callers resolve canonical/runtime facts first, inject the decision timestamp, and then use
// the returned stable decision. Human-readable explanations are derived from rule IDs.

import type {
  AuthorityReference,
  OperationAdmission,
  OperationDefinition,
  OperationRun,
  ProjectState,
  Sequences,
} from "./types.ts";
import { POLICY_VERSION } from "./types.ts";
import { definitionFingerprint, isFinalState, validateDefinition } from "./operations-runtime.ts";
import { ProjectOperationError } from "./errors.ts";

/** Stable rule IDs emitted by the R2A policy kernel. */
export const ADMISSION_RULES = {
  ALLOW_NEW: "ADMIT.OPERATIONS.ALLOW_NEW",
  REUSE_EXISTING: "ADMIT.OPERATIONS.EQUIVALENT_REUSE",
  DENY_UNKNOWN_OPERATION: "ADMIT.OPERATIONS.DENY_UNKNOWN",
  DENY_INVALID_DEFINITION: "ADMIT.OPERATIONS.DENY_INVALID_DEFINITION",
  DENY_WRONG_PROJECT: "ADMIT.OPERATIONS.DENY_WRONG_PROJECT",
  DENY_WRONG_WORKTREE: "ADMIT.OPERATIONS.DENY_WRONG_WORKTREE",
  DENY_CAPACITY: "ADMIT.OPERATIONS.DENY_CAPACITY",
  DENY_RETRY_BUDGET: "ADMIT.OPERATIONS.DENY_RETRY_BUDGET",
  DENY_MISSING_AUTHORITY: "ADMIT.OPERATIONS.DENY_MISSING_AUTHORITY",
  DENY_STRUCTURAL_INTEGRITY: "ADMIT.OPERATIONS.DENY_STRUCTURAL_INTEGRITY",
} as const;

export type OperationAdmissionRuleId = (typeof ADMISSION_RULES)[keyof typeof ADMISSION_RULES];

/** The complete model-supplied request. No executable, argv, path, authority, or policy metadata. */
export interface OperationAdmissionRequest {
  operationId: string;
}

/** Retry facts resolved by the runtime; automatic retries have a zero budget in R2A. */
export interface OperationRetryState {
  intent: "initial" | "automatic_retry";
  remainingAutomaticRetries: number;
}

/** Canonical structural-health facts, reduced to stable codes before admission. */
export interface OperationStructuralHealth {
  valid: boolean;
  problemCodes: readonly string[];
}

function numericId(id: string): number {
  const match = id.match(/-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

/** Reduce canonical integrity facts to stable codes used by the admission kernel. */
export function operationStructuralHealth(state: ProjectState): OperationStructuralHealth {
  const problems: string[] = [];
  const sequenceCollections: Array<[keyof Sequences, readonly string[]]> = [
    ["workItem", state.workItems.map((item) => item.id)],
    ["decision", state.decisions.map((item) => item.id)],
    ["assumption", state.assumptions.map((item) => item.id)],
    ["risk", state.risks.map((item) => item.id)],
    ["intake", state.intakes.map((item) => item.id)],
    ["orientation", state.orientations.map((item) => item.id)],
    ["claim", state.claims.map((item) => item.id)],
    ["receipt", state.receipts.map((item) => item.id)],
    ["operationRun", state.operationRuns.map((item) => item.id)],
  ];
  for (const [sequence, ids] of sequenceCollections) {
    const max = ids.reduce((value, id) => Math.max(value, numericId(id)), 0);
    if (state.sequences[sequence] <= max) problems.push(`sequence.${sequence}`);
  }

  const workItemIds = new Set(state.workItems.map((item) => item.id));
  if (state.focusWorkItemId !== null && !workItemIds.has(state.focusWorkItemId)) {
    problems.push("reference.focusWorkItem");
  }
  for (const item of state.workItems) {
    if (item.dependsOn.some((id) => !workItemIds.has(id))) {
      problems.push(`reference.workItem.${item.id}`);
    }
  }
  for (const risk of state.risks) {
    if ((risk.linkedWorkItems ?? []).some((id) => !workItemIds.has(id))) {
      problems.push(`reference.risk.${risk.id}`);
    }
  }

  const activeCount = state.operationRuns.filter((run) => !isFinalState(run.lifecycleState)).length;
  if (activeCount > 1) problems.push("operation.capacity");

  return { valid: problems.length === 0, problemCodes: problems };
}

/** Canonical references that may satisfy an operation definition's authority requirement. */
export function acceptedOperationAuthorityReferences(
  state: ProjectState,
): readonly AuthorityReference[] {
  return [
    ...state.decisions
      .filter((decision) => decision.status === "accepted")
      .map((decision) => ({ kind: "decision" as const, id: decision.id })),
    ...state.operationDefinitions.map((definition) => ({
      kind: "operation_definition" as const,
      id: definition.id,
    })),
  ];
}

/**
 * Complete deterministic input to admission. Facts named `request*` are resolved by the trusted
 * runtime boundary; they are not accepted from the model-facing tool schema.
 */
export interface OperationAdmissionContext {
  policyVersion: number;
  definition?: unknown;
  canonicalProjectId: string;
  requestProjectId: string;
  canonicalRepositoryRoot: string;
  requestRepositoryRoot: string;
  canonicalWorktreeIdentity: string;
  requestWorktreeIdentity: string;
  activeWorkItemId: string | null;
  activeRun?: OperationRun;
  retry: OperationRetryState;
  structuralHealth: OperationStructuralHealth;
  authorityReferences: readonly AuthorityReference[];
  startingFingerprint: string;
  decidedAt: string;
}

/** Internal resolved value consumed by the process supervisor after an `allow` decision. */
export interface AuthorizedOperationStart {
  operationId: string;
  definition: OperationDefinition;
  definitionVersion: number;
  definitionFingerprint: string;
  policyVersion: number;
  authorityReference: AuthorityReference;
  projectId: string;
  repositoryRoot: string;
  worktreeIdentity: string;
  startingFingerprint: string;
  retryBudget: {
    automaticRetriesRemaining: number;
    transientStartupRetriesRemaining: 1;
  };
  timeoutContract: OperationDefinition["timeoutContract"];
  effectProfile: OperationDefinition["effectProfile"];
  outputPolicy: OperationDefinition["outputPolicy"];
  admission: OperationAdmission;
}

export interface OperationAdmissionEvaluation {
  decision: OperationAdmission;
  /** Present only when the decision is `allow`. Reuse returns the existing run ID instead. */
  authorizedStart?: AuthorizedOperationStart;
}

function sameAuthority(a: AuthorityReference, b: AuthorityReference): boolean {
  return a.kind === b.kind && a.id === b.id;
}

function baseDecision(
  context: OperationAdmissionContext,
  result: OperationAdmission["result"],
  ruleId: OperationAdmissionRuleId,
  explanationData?: OperationAdmission["explanationData"],
): OperationAdmission {
  return {
    result,
    ruleId,
    policyVersion: context.policyVersion,
    ...(explanationData ? { explanationData } : {}),
    decidedAt: context.decidedAt,
  };
}

function deny(
  context: OperationAdmissionContext,
  result: OperationAdmission["result"],
  ruleId: OperationAdmissionRuleId,
  explanationData?: OperationAdmission["explanationData"],
): OperationAdmissionEvaluation {
  return { decision: baseDecision(context, result, ruleId, explanationData) };
}

function validPolicyContext(context: OperationAdmissionContext): boolean {
  return (
    Number.isInteger(context.policyVersion) &&
    context.policyVersion >= 1 &&
    context.policyVersion === POLICY_VERSION &&
    context.decidedAt.length > 0 &&
    /^[a-f0-9]{64}$/.test(context.startingFingerprint)
  );
}

function equivalentActiveRun(
  run: OperationRun,
  definition: OperationDefinition,
  context: OperationAdmissionContext,
): boolean {
  return (
    !isFinalState(run.lifecycleState) &&
    run.definitionFingerprint === definitionFingerprint(definition) &&
    run.projectId === context.canonicalProjectId &&
    run.repositoryRoot === context.canonicalRepositoryRoot &&
    run.worktreeIdentity === context.canonicalWorktreeIdentity &&
    run.startingFingerprint === context.startingFingerprint
  );
}

/**
 * Evaluate one request using only canonical and runtime facts. The function never throws for a
 * policy denial and never reads ambient model/session/process state.
 */
export function evaluateOperationAdmission(
  context: OperationAdmissionContext,
  request: OperationAdmissionRequest,
): OperationAdmissionEvaluation {
  if (!validPolicyContext(context)) {
    return deny(context, "deny_structural_integrity", ADMISSION_RULES.DENY_STRUCTURAL_INTEGRITY, {
      problem: "invalid_policy_context",
    });
  }

  if (context.definition === undefined) {
    return deny(context, "deny_unknown_operation", ADMISSION_RULES.DENY_UNKNOWN_OPERATION, {
      operationId: request.operationId,
    });
  }

  let definition: OperationDefinition;
  try {
    definition = validateDefinition(context.definition);
  } catch {
    return deny(context, "deny_invalid_definition", ADMISSION_RULES.DENY_INVALID_DEFINITION, {
      operationId: request.operationId,
    });
  }
  if (definition.id !== request.operationId) {
    return deny(context, "deny_invalid_definition", ADMISSION_RULES.DENY_INVALID_DEFINITION, {
      operationId: request.operationId,
      definitionId: definition.id,
    });
  }

  if (context.requestProjectId !== context.canonicalProjectId) {
    return deny(context, "deny_wrong_project", ADMISSION_RULES.DENY_WRONG_PROJECT, {
      expectedProjectId: context.canonicalProjectId,
      actualProjectId: context.requestProjectId,
    });
  }

  if (
    context.requestRepositoryRoot !== context.canonicalRepositoryRoot ||
    context.requestWorktreeIdentity !== context.canonicalWorktreeIdentity
  ) {
    return deny(context, "deny_wrong_worktree", ADMISSION_RULES.DENY_WRONG_WORKTREE, {
      repositoryRootMatches: context.requestRepositoryRoot === context.canonicalRepositoryRoot,
      worktreeIdentityMatches:
        context.requestWorktreeIdentity === context.canonicalWorktreeIdentity,
    });
  }

  if (!context.structuralHealth.valid || context.structuralHealth.problemCodes.length > 0) {
    return deny(context, "deny_structural_integrity", ADMISSION_RULES.DENY_STRUCTURAL_INTEGRITY, {
      problemCount: context.structuralHealth.problemCodes.length,
      firstProblem: context.structuralHealth.problemCodes[0] ?? "structural_health_invalid",
    });
  }

  const authority = definition.authoritySourceRef;
  if (
    definition.authorityRequirement === "not_authorized" ||
    authority === undefined ||
    !context.authorityReferences.some((ref) => sameAuthority(ref, authority))
  ) {
    return deny(context, "deny_missing_authority", ADMISSION_RULES.DENY_MISSING_AUTHORITY, {
      requirement: definition.authorityRequirement,
      authorityId: authority?.id ?? "missing",
    });
  }

  if (context.retry.intent === "automatic_retry" && context.retry.remainingAutomaticRetries <= 0) {
    return deny(context, "deny_retry_budget", ADMISSION_RULES.DENY_RETRY_BUDGET, {
      remainingAutomaticRetries: context.retry.remainingAutomaticRetries,
    });
  }

  if (context.activeRun && !isFinalState(context.activeRun.lifecycleState)) {
    if (equivalentActiveRun(context.activeRun, definition, context)) {
      return {
        decision: {
          ...baseDecision(context, "reuse_existing", ADMISSION_RULES.REUSE_EXISTING, {
            existingRunId: context.activeRun.id,
          }),
          authorityReference: authority,
          existingRunId: context.activeRun.id,
        },
      };
    }
    return deny(context, "deny_capacity", ADMISSION_RULES.DENY_CAPACITY, {
      activeRunId: context.activeRun.id,
    });
  }

  const decision: OperationAdmission = {
    ...baseDecision(context, "allow", ADMISSION_RULES.ALLOW_NEW, {
      operationId: definition.id,
      definitionVersion: definition.version,
    }),
    authorityReference: authority,
  };
  return {
    decision,
    authorizedStart: {
      operationId: definition.id,
      definition,
      definitionVersion: definition.version,
      definitionFingerprint: definitionFingerprint(definition),
      policyVersion: context.policyVersion,
      authorityReference: authority,
      projectId: context.canonicalProjectId,
      repositoryRoot: context.canonicalRepositoryRoot,
      worktreeIdentity: context.canonicalWorktreeIdentity,
      startingFingerprint: context.startingFingerprint,
      retryBudget: {
        automaticRetriesRemaining: context.retry.remainingAutomaticRetries,
        transientStartupRetriesRemaining: 1,
      },
      timeoutContract: definition.timeoutContract,
      effectProfile: definition.effectProfile,
      outputPolicy: definition.outputPolicy,
      admission: decision,
    },
  };
}

/** Render non-authoritative human text from a stable kernel decision. */
export function explainAdmission(decision: OperationAdmission): string {
  switch (decision.ruleId) {
    case ADMISSION_RULES.ALLOW_NEW:
      return "Accepted operation is authorized and project capacity is available.";
    case ADMISSION_RULES.REUSE_EXISTING:
      return `Equivalent operation is already active${decision.existingRunId ? ` as ${decision.existingRunId}` : ""}.`;
    case ADMISSION_RULES.DENY_UNKNOWN_OPERATION:
      return "No accepted operation matches the requested operation ID.";
    case ADMISSION_RULES.DENY_INVALID_DEFINITION:
      return "The accepted operation definition is invalid or does not match the request.";
    case ADMISSION_RULES.DENY_WRONG_PROJECT:
      return "The request does not belong to the active Voila project.";
    case ADMISSION_RULES.DENY_WRONG_WORKTREE:
      return "The request does not resolve to the active repository worktree.";
    case ADMISSION_RULES.DENY_CAPACITY:
      return "A non-equivalent operation already occupies the project capacity.";
    case ADMISSION_RULES.DENY_RETRY_BUDGET:
      return "The automatic retry budget is exhausted.";
    case ADMISSION_RULES.DENY_MISSING_AUTHORITY:
      return "Canonical project state does not grant the required operation authority.";
    case ADMISSION_RULES.DENY_STRUCTURAL_INTEGRITY:
      return "Canonical or policy input integrity is not sufficient to start an operation.";
    default:
      throw new ProjectOperationError(`Unknown admission rule ID: ${decision.ruleId}.`);
  }
}
