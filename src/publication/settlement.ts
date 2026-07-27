// G0 publication transaction orchestrator: drives the closed transaction step by step and
// persists an immutable settlement record. Pure orchestration + deterministic serial writes;
// every Git effect still flows through the closed runner.

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DEFAULT_TRANSACTION_LIMITS, type TransactionGitLimits } from "./git-runner.ts";
import {
  advanceBranchRef,
  buildCommitMessageBytes,
  checkCleanRealIndex,
  commitObject,
  newPublicationTransactionContext,
  reconcileRealIndexToCommit,
  resolveCurrentBranchRef,
  resolveHeadSha,
  runHook,
  stageIntoTemporaryIndex,
  writeTreeFromTemporaryIndex,
  type BoundaryResult,
  type HookOutcome,
  type PublicationTransactionContext,
  type TransactionResult,
} from "./transaction.ts";
import type { PublicationPlan, PublicationPlanOutcome } from "./types.ts";

const SETTLEMENT_FORMAT_VERSION = 1;

export interface RunPublicationTransactionInput {
  readonly root: string;
  readonly plan: PublicationPlan;
  readonly realIndexBeforeBytes: Buffer;
  readonly transactionId: string;
  readonly realIndexPath: string;
  readonly limits?: TransactionGitLimits;
}

export interface RunPublicationTransactionOutput {
  readonly result: TransactionResult;
  readonly settlement: PublicationSettlement;
}

export interface PublicationSettlement {
  readonly transactionId: string;
  readonly planId: string;
  readonly root: string;
  readonly formatVersion: typeof SETTLEMENT_FORMAT_VERSION;
  readonly outcome: PublicationPlanOutcome;
  readonly reason?: string;
  readonly finalHead: string | null;
  readonly boundaries: readonly BoundarySettlementEntry[];
  readonly capturedAt: string;
}

export interface BoundarySettlementEntry {
  readonly boundaryId: string;
  readonly outcome: PublicationPlanOutcome;
  readonly createdSha: string | null;
  readonly treeSha: string | null;
  readonly expectedParent: string;
  readonly messageBytesSha256: string;
  readonly hooks: readonly HookOutcome[];
}

export async function runPublicationTransaction(
  input: RunPublicationTransactionInput,
): Promise<RunPublicationTransactionOutput> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const ctx = newPublicationTransactionContext(input.root, input.plan, input.transactionId);
  await mkdir(ctx.transactionDir, { recursive: true });

  const clean = await checkCleanRealIndex({ root: input.root, limits });
  if (!clean.clean) {
    return writeAndReturn(
      input,
      ctx,
      buildSettlement(input, "refused", clean.failureReason ?? "real_index_not_clean", null, []),
      {
        outcome: "refused",
        reason: "real_index_not_clean",
        boundaries: [],
        finalHead: null,
      },
    );
  }

  const headBefore = await resolveHeadSha(ctx, limits);
  const branchRef = await resolveCurrentBranchRef(ctx, limits);
  const branch = branchRef?.replace(/^refs\/heads\//, "");
  if (branch !== undefined && branch === input.plan.bindings.defaultBranch) {
    return writeAndReturn(
      input,
      ctx,
      buildSettlement(input, "refused", "default_branch", headBefore, []),
      {
        outcome: "refused",
        reason: "default_branch",
        boundaries: [],
        finalHead: headBefore,
      },
    );
  }
  if (branchRef !== input.plan.bindings.branchRef) {
    return writeAndReturn(
      input,
      ctx,
      buildSettlement(input, "refused", "branch_ref_drift", headBefore, []),
      {
        outcome: "refused",
        reason: "branch_ref_drift",
        boundaries: [],
        finalHead: headBefore,
      },
    );
  }

  const boundaryEntries: BoundarySettlementEntry[] = [];
  const boundaryResults: BoundaryResult[] = [];
  let lastSha: string = headBefore;

  for (const boundary of input.plan.boundaries) {
    const staged = await stageIntoTemporaryIndex({
      ctx,
      paths: boundary.stagePaths,
      realIndexBeforeBytes: input.realIndexBeforeBytes,
      limits,
    });

    const messageBytes = buildCommitMessageBytes(boundary.message.subject, boundary.message.body);
    const hooks: HookOutcome[] = [];

    let rejected: { hookName: string } | null = null;
    for (const hookName of ["pre-commit", "prepare-commit-msg", "commit-msg"] as const) {
      const hookResult = await runHook({
        ctx,
        hook: hookName,
        temporaryIndexPath: staged.temporaryIndexPath,
        limits,
      });
      hooks.push(hookResult);
      if (!hookResult.ok) {
        rejected = { hookName };
        break;
      }
    }

    if (rejected !== null) {
      const entry: BoundarySettlementEntry = {
        boundaryId: boundary.boundaryId,
        outcome: "refused",
        createdSha: null,
        treeSha: null,
        expectedParent: lastSha,
        messageBytesSha256: createHash("sha256").update(messageBytes).digest("hex"),
        hooks,
      };
      boundaryEntries.push(entry);
      boundaryResults.push({
        boundaryId: boundary.boundaryId,
        expectedParent: lastSha,
        createdSha: null,
        treeSha: null,
        messageBytes,
        outcome: "refused",
        reason: `${rejected.hookName}_rejected`,
      });
      const settlement = buildSettlement(
        input,
        "partial",
        `${rejected.hookName}_rejected`,
        lastSha,
        boundaryEntries,
      );
      await writeSettlement(settlement, ctx);
      return {
        result: {
          outcome: "partial",
          reason: `${rejected.hookName}_rejected`,
          boundaries: boundaryResults,
          finalHead: lastSha,
        },
        settlement,
      };
    }

    const treeSha = await writeTreeFromTemporaryIndex({
      ctx,
      temporaryIndexPath: staged.temporaryIndexPath,
      limits,
    });
    const commitSha = await commitObject({ ctx, treeSha, parent: lastSha, messageBytes, limits });
    await advanceBranchRef({
      ctx,
      ref: branchRef,
      newSha: commitSha,
      expectedOldSha: lastSha,
      limits,
    });
    await reconcileRealIndexToCommit({
      ctx,
      newSha: commitSha,
      realIndexPath: input.realIndexPath,
      limits,
    });

    const postCommit = await runHook({
      ctx,
      hook: "post-commit",
      temporaryIndexPath: staged.temporaryIndexPath,
      limits,
    });
    hooks.push(postCommit);

    const entry: BoundarySettlementEntry = {
      boundaryId: boundary.boundaryId,
      outcome: "succeeded",
      createdSha: commitSha,
      treeSha,
      expectedParent: lastSha,
      messageBytesSha256: createHash("sha256").update(messageBytes).digest("hex"),
      hooks,
    };
    boundaryEntries.push(entry);
    boundaryResults.push({
      boundaryId: boundary.boundaryId,
      expectedParent: lastSha,
      createdSha: commitSha,
      treeSha,
      messageBytes,
      outcome: "succeeded",
    });
    lastSha = commitSha;
  }

  const settlement = buildSettlement(input, "succeeded", undefined, lastSha, boundaryEntries);
  await writeSettlement(settlement, ctx);
  return {
    result: { outcome: "succeeded", boundaries: boundaryResults, finalHead: lastSha },
    settlement,
  };
}

async function writeAndReturn(
  input: RunPublicationTransactionInput,
  ctx: PublicationTransactionContext,
  settlement: PublicationSettlement,
  result: TransactionResult,
): Promise<RunPublicationTransactionOutput> {
  await writeSettlement(settlement, ctx);
  return { result, settlement };
}

function buildSettlement(
  input: RunPublicationTransactionInput,
  outcome: PublicationPlanOutcome,
  reason: string | undefined,
  finalHead: string | null,
  boundaries: readonly BoundarySettlementEntry[],
): PublicationSettlement {
  return {
    transactionId: input.transactionId,
    planId: input.plan.id,
    root: input.root,
    formatVersion: SETTLEMENT_FORMAT_VERSION,
    outcome,
    ...(reason !== undefined ? { reason } : {}),
    finalHead,
    boundaries,
    capturedAt: new Date().toISOString(),
  };
}

async function writeSettlement(
  settlement: PublicationSettlement,
  ctx: PublicationTransactionContext,
): Promise<void> {
  await writeFile(
    join(ctx.transactionDir, "settlement.json"),
    `${JSON.stringify(settlement, null, 2)}\n`,
    "utf8",
  );
}

export async function loadSettlement(
  ctx: PublicationTransactionContext,
): Promise<PublicationSettlement> {
  const raw = await readFile(join(ctx.transactionDir, "settlement.json"), "utf8");
  return JSON.parse(raw) as PublicationSettlement;
}

export function newTransactionId(planId: string): string {
  const random = randomBytes(2).toString("hex");
  return `PTX-${planId.slice(4, 12)}-${Date.now().toString(36)}-${random}`;
}
