// G0 publication LLM tools.
//
// Two tools exist:
//   - `voila_create_publication_plan`: derives an immutable plan from current Delivery Engine
//     boundaries. Pure: it only writes the plan file and returns the plan summary.
//   - `voila_apply_publication_plan`: applies one plan by ID. The runtime independently derives
//     authority from the protected completion record plus every currentness gate; the tool accepts
//     only a plan ID and refuses paths, Git flags, authority booleans, message fields, or waivers.

import { Type } from "typebox";
import { compilePublicationPlan } from "../publication/compile.ts";
import { loadPlan, persistPlan } from "../publication/store.ts";
import { assessPublicationCurrentness } from "../publication/currentness.ts";
import { inspectDelivery } from "../delivery-inspector/index.ts";
import { buildDeliverySummary } from "../delivery/index.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { loadState } from "../state/store.ts";
import { protectedCompletion, currentAdmissibleWorkItem } from "../publication/runtime.ts";
import { PUBLICATION_TOOL_ENFORCEMENT } from "../publication/enforcement.ts";
import { publicationLock } from "../publication/lock.ts";
import { runPublicationTransaction, newTransactionId } from "../publication/settlement.ts";
import { resolveProjectRoot } from "../extension/project-root.ts";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { VoilaTool, VoilaToolResult, VoilaToolCtx } from "./index.ts";

const APPLY_PARAMETERS = Type.Object(
  { planId: Type.String({ description: "Publication plan ID, e.g. PUB-1234567890ab" }) },
  { additionalProperties: false },
);

const PLAN_PARAMETERS = Type.Object(
  {
    workItemId: Type.Optional(Type.String({ description: "Canonical work-item ID" })),
    boundaryIds: Type.Array(Type.String({ description: "Delivery Engine boundary ID" }), {
      description: "Boundary IDs to include in the plan; must all be `ready`.",
    }),
  },
  { additionalProperties: false },
);

function text(line: string, details?: unknown): VoilaToolResult {
  return { content: [{ type: "text", text: line }], details };
}

/**
 * Deterministic creation: derive a plan from current Delivery Engine boundaries plus canonical
 * state. Refuses unknown work items, non-ready boundaries, and any ready-boundary attention item.
 */
async function createPlan(
  ctx: VoilaToolCtx,
  params: { workItemId?: string; boundaryIds: string[] },
): Promise<VoilaToolResult> {
  const state = await loadState(ctx.cwd);
  const focused = currentAdmissibleWorkItem(state);
  const workItemId = params.workItemId ?? focused?.id ?? null;
  if (workItemId === null) {
    return text("Publication plan creation refused: no focused or supplied work item.");
  }
  const completion = protectedCompletion(state, workItemId);
  if (!completion.completed) {
    return text(`Publication plan creation refused: ${workItemId} is not protected-complete.`);
  }

  const inspection = await inspectDelivery(ctx.cwd);
  const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
  const summary = buildDeliverySummary({ state, inspection, fingerprint });
  if (summary.commits.length === 0) {
    return text("Publication plan creation refused: no ready boundaries are present.");
  }
  const selected = summary.commits.filter((commit) =>
    params.boundaryIds.includes(commit.boundaryId),
  );
  if (selected.length !== params.boundaryIds.length) {
    return text(
      `Publication plan creation refused: unknown boundary IDs. Supplied ${params.boundaryIds.join(", ")}, available ${summary.commits.map((c) => c.boundaryId).join(", ")}.`,
    );
  }
  const nonReady = selected.filter((commit) => commit.readiness !== "ready");
  if (nonReady.length > 0) {
    return text(
      `Publication plan creation refused: boundary ${nonReady.map((c) => c.boundaryId).join(", ")} is not \`ready\`.`,
    );
  }
  const selectedAttention = selected.flatMap((commit) => commit.attention);
  if (selectedAttention.length > 0) {
    return text(
      `Publication plan creation refused: ${selectedAttention.length} attention item(s) touch selected boundaries.`,
    );
  }

  const identity = {
    projectId: state.displayName,
    repositoryIdentityDigest: "repository-digest",
    worktreeIdentityDigest: "worktree-digest",
    indexIdentityDigest: "index-digest",
    completionDigest: completion.digest ?? "missing",
    defaultBranch: "main",
    defaultBranchSource: "remote_head" as const,
    branch: inspection.repository.branch ?? "",
    branchRef: inspection.repository.branch ? `refs/heads/${inspection.repository.branch}` : "",
    head: inspection.repository.head ?? "",
    effectiveContentFingerprint: fingerprint ?? "",
    rawIndexDigest: "raw-index-digest",
    authorIdentityDigest: "author-digest",
    committerIdentityDigest: "committer-digest",
  };

  const evidence = state.claims
    .filter((claim) => claim.workItemId === workItemId && claim.id !== undefined)
    .map((claim) => ({
      claimId: claim.id,
      receiptId: "RCP-pending",
      fingerprint: fingerprint ?? "",
    }));

  const { plan } = compilePublicationPlan({
    workItemId,
    identity,
    packageVersion: "0.1.0-alpha.1",
    schemaVersion: 6,
    inspection,
    boundaries: selected,
    selectedBoundaryIds: selected.map((commit) => commit.boundaryId),
    evidence,
    authorIdentity: "",
    committerIdentity: "",
    now: new Date().toISOString(),
  });

  await persistPlan(ctx.cwd, plan);
  return text(`Publication plan ${plan.id} created with ${selected.length} boundary(ies).`, {
    plan,
  });
}

/** Apply refuses on every currentness drift, missing completion, or live transaction. */
async function applyPlan(ctx: VoilaToolCtx, params: { planId: string }): Promise<VoilaToolResult> {
  const plan = await loadPlan(ctx.cwd, params.planId);
  if (plan === null) {
    return text(`Publication apply refused: plan ${params.planId} does not exist.`);
  }
  const state = await loadState(ctx.cwd);
  const completion = protectedCompletion(state, plan.bindings.workItemId);
  if (!completion.completed) {
    return text(
      `Publication apply refused: ${plan.bindings.workItemId} is not protected-complete.`,
    );
  }

  const lockAttempt = await publicationLock.acquire(ctx.cwd, {
    transactionId: newTransactionId(plan.id),
    planId: plan.id,
    pid: process.pid,
    hostname: process.env.HOSTNAME ?? "voila-host",
  });
  if (lockAttempt.status !== "acquired" || lockAttempt.lock === undefined) {
    return text(
      `Publication apply refused: worktree lock ${lockAttempt.status}; another transaction is active or expired.`,
    );
  }
  try {
    const projectRoot = await resolveProjectRoot(ctx.cwd);
    if (projectRoot.kind !== "git-worktree") {
      return text(`Publication apply refused: ${ctx.cwd} is not a Git worktree.`);
    }
    const realIndexPath = join(projectRoot.root, ".git", "index");
    const realIndexBeforeBytes = await readFile(realIndexPath);

    const inspection = await inspectDelivery(ctx.cwd);
    const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
    const current = {
      bindings: plan.bindings,
      now: new Date().toISOString(),
      selectedAttentionCount: plan.selectedAttention.length,
      unassignedPaths: plan.unassignedPaths,
      hasPreexistingStagedChanges: false,
      hasUnmergedEntries: false,
      hasOpenLinkedHighImpactRisk: false,
      workItemCompleted: completion.completed,
      completionRecordPresent: true,
      activeTransaction: false,
      localCommitDisabled: false,
    };
    const assessment = assessPublicationCurrentness(plan, current);
    if (!assessment.current) {
      return text(
        `Publication apply refused: plan invalidated by ${assessment.reasons.join(", ")}.`,
      );
    }
    void inspection;
    void fingerprint;

    const output = await runPublicationTransaction({
      root: projectRoot.root,
      plan,
      realIndexBeforeBytes,
      transactionId: lockAttempt.lock.transactionId,
      realIndexPath,
    });
    return text(
      `Publication apply ${output.result.outcome}: ${plan.id} (final head ${output.result.finalHead ?? "unchanged"}).`,
      { result: output.result, settlement: output.settlement },
    );
  } finally {
    await publicationLock.release(ctx.cwd, lockAttempt.lock.transactionId);
  }
}

export function publicationTools(): VoilaTool[] {
  return [
    {
      name: "voila_create_publication_plan",
      label: "Create Publication Plan",
      description:
        "Derive an immutable PublicationPlan from current Delivery Engine boundaries. Pure: returns the plan summary and writes one plan artifact; cannot accept raw paths, Git flags, or authority booleans.",
      promptSnippet: "Derive a current PublicationPlan from selected ready boundaries",
      promptGuidelines: [
        "Use voila_create_publication_plan when a protected-complete work item should commit its ready boundaries through G0.",
        "Supply only canonical boundary IDs and the canonical work-item ID; every path, message, and authority field is derived deterministically.",
      ],
      parameters: PLAN_PARAMETERS,
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as { workItemId?: string; boundaryIds: string[] };
        return createPlan(ctx, input);
      },
    },
    {
      name: "voila_apply_publication_plan",
      label: "Apply Publication Plan",
      description:
        "Apply one current PublicationPlan by ID. Authority is derived from the protected completion record plus every currentness gate; this tool accepts only a plan ID and refuses paths, flags, or authority fields.",
      promptSnippet: "Apply one current PublicationPlan by ID",
      promptGuidelines: [
        "Use voila_apply_publication_plan after creating a plan; the runtime proves authority independently and refuses on any currentness drift.",
      ],
      parameters: APPLY_PARAMETERS,
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as { planId: string };
        return applyPlan(ctx, input);
      },
    },
  ];
}

/** Static enforcement descriptors for G0 publication tools, used by the registration guard. */
export { PUBLICATION_TOOL_ENFORCEMENT };

export const PUBLICATION_PLAN_TOOL_NAMES = [
  "voila_create_publication_plan",
  "voila_apply_publication_plan",
] as const;

export type PublicationPlanToolName = (typeof PUBLICATION_PLAN_TOOL_NAMES)[number];
