// G0 publication transaction state machine. Pure orchestration: each step returns its result so
// callers can settle a transaction explicitly. Git access lives behind the closed transaction
// runner; the LLM tool surface cannot reach this module directly.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DEFAULT_TRANSACTION_LIMITS,
  runTransactionCommand,
  temporaryIndexPath,
  TransactionGitError,
  type TransactionGitLimits,
} from "./git-runner.ts";
import {
  PUBLICATION_PLAN_OUTCOMES,
  type PublicationPlan,
  type PublicationPlanOutcome,
} from "./types.ts";

export interface PublicationTransactionContext {
  readonly root: string;
  readonly plan: PublicationPlan;
  readonly transactionId: string;
  /** Working dir for the transaction's captured output and lock. */
  readonly transactionDir: string;
}

export interface BoundaryResult {
  readonly boundaryId: string;
  readonly expectedParent: string;
  readonly createdSha: string | null;
  readonly treeSha: string | null;
  readonly messageBytes: Buffer;
  readonly outcome: PublicationPlanOutcome;
  readonly reason?: string;
}

export interface HookOutcome {
  readonly hook: "pre-commit" | "prepare-commit-msg" | "commit-msg" | "post-commit";
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
}

export interface TransactionResult {
  readonly outcome: PublicationPlanOutcome;
  readonly reason?: string;
  readonly boundaries: readonly BoundaryResult[];
  readonly finalHead: string | null;
}

export function newPublicationTransactionContext(
  root: string,
  plan: PublicationPlan,
  transactionId: string,
): PublicationTransactionContext {
  const transactionDir = join(root, ".voila", "publications", "transactions", transactionId);
  return { root, plan, transactionId, transactionDir };
}

export async function ensureTransactionDirectories(
  ctx: PublicationTransactionContext,
): Promise<void> {
  await mkdir(ctx.transactionDir, { recursive: true });
}

export interface ProofCleanIndexInput {
  readonly root: string;
  readonly limits?: TransactionGitLimits;
}

export async function proveCleanRealIndex(
  input: ProofCleanIndexInput,
): Promise<{ clean: boolean; stagedPaths: readonly string[] }> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const diff = await runTransactionCommand(
    {
      // `git diff --cached --name-only` parses as `git diff --no-index` when the user's cwd is
      // outside the worktree. `git diff-index --cached --name-only HEAD` is unambiguous in any
      // cwd because it names an explicit tree-ish.
      args: ["diff-index", "--cached", "--name-only", "-z", "HEAD"],
      cwd: input.root,
    },
    limits,
  );
  if (!diff.ok) {
    throw new TransactionGitError(
      { args: ["diff-index", "--cached", "--name-only", "-z", "HEAD"], cwd: input.root },
      diff,
      `git diff-index --cached HEAD failed: ${diff.stderr}`,
    );
  }
  const stagedPaths = diff.stdout
    .split("\0")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return { clean: stagedPaths.length === 0, stagedPaths };
}

/**
 * Result of proving the real index is clean. The orchestrator captures the failure reason
 * (fatal git errors, non-zero exit, or non-empty staged diff) and refuses the transaction
 * without exposing the throw to its caller.
 */
export interface CleanIndexCheck {
  readonly clean: boolean;
  readonly stagedPaths: readonly string[];
  readonly failureReason?: string;
}

export async function checkCleanRealIndex(input: ProofCleanIndexInput): Promise<CleanIndexCheck> {
  try {
    return await proveCleanRealIndex(input);
  } catch (error) {
    if (error instanceof TransactionGitError) {
      return { clean: false, stagedPaths: [], failureReason: error.message };
    }
    throw error;
  }
}

export interface StageIntoTemporaryIndexInput {
  readonly ctx: PublicationTransactionContext;
  readonly paths: readonly string[];
  readonly realIndexBeforeBytes: Buffer;
  readonly limits?: TransactionGitLimits;
}

export interface StageResult {
  readonly temporaryIndexPath: string;
  readonly stagedMembership: readonly string[];
}

export async function stageIntoTemporaryIndex(
  input: StageIntoTemporaryIndexInput,
): Promise<StageResult> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const tempPath = temporaryIndexPath(input.ctx.root);
  // Ensure the parent directory of the temporary index exists before writing it.
  await mkdir(join(tempPath, ".."), { recursive: true });
  await mkdir(join(input.ctx.transactionDir, "tmp"), { recursive: true });
  await writeFile(tempPath, input.realIndexBeforeBytes);

  // `--chmod=+x` is rejected when the host index is in a state that does not support the
  // extended index entry form. The execute bit is a build-time concern, so staging leaves the
  // existing mode intact; downstream commit-tree preserves whatever the worktree already shows.
  const addArgs = ["update-index", "--add", "--", ...input.paths];
  const add = await runTransactionCommand(
    {
      args: addArgs,
      cwd: input.ctx.root,
      temporaryIndexPath: tempPath,
    },
    limits,
  );
  if (!add.ok) {
    await rm(tempPath, { force: true });
    throw new TransactionGitError(
      { args: addArgs, cwd: input.ctx.root },
      add,
      `git update-index failed: ${add.stderr}`,
    );
  }

  const listArgs = ["diff-index", "--cached", "--name-only", "--no-renames", "-z", "HEAD"];
  const list = await runTransactionCommand(
    {
      args: listArgs,
      cwd: input.ctx.root,
      temporaryIndexPath: tempPath,
    },
    limits,
  );
  if (!list.ok) {
    await rm(tempPath, { force: true });
    throw new TransactionGitError(
      { args: listArgs, cwd: input.ctx.root },
      list,
      `git diff-index failed: ${list.stderr}`,
    );
  }

  return {
    temporaryIndexPath: tempPath,
    stagedMembership: list.stdout
      .split("\0")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  };
}

export function buildCommitMessageBytes(subject: string, body: readonly string[]): Buffer {
  const lines = [subject, ...body];
  return Buffer.from(`${lines.join("\n")}\n`, "utf8");
}

export interface RunHookInput {
  readonly ctx: PublicationTransactionContext;
  readonly hook: HookOutcome["hook"];
  readonly temporaryIndexPath: string;
  readonly messageFilePath?: string;
  readonly limits?: TransactionGitLimits;
}

export async function runHook(input: RunHookInput): Promise<HookOutcome> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const args: string[] = ["hook", "run", "--ignore-missing", input.hook];
  if (input.hook === "prepare-commit-msg" || input.hook === "commit-msg") {
    if (input.messageFilePath) {
      args.push(input.messageFilePath);
    }
    // When the caller has not written a message file yet, the hooks simply receive no path;
    // the orchestrator writes the file before invoking `commit-tree` directly.
  }
  const result = await runTransactionCommand(
    {
      args,
      cwd: input.ctx.root,
      temporaryIndexPath: input.temporaryIndexPath,
    },
    limits,
  );
  return {
    hook: input.hook,
    ok: result.ok,
    stdout: result.stdout,
    stderr: result.stderr,
    timedOut: result.timedOut,
  };
}

export interface WriteTreeInput {
  readonly ctx: PublicationTransactionContext;
  readonly temporaryIndexPath: string;
  readonly limits?: TransactionGitLimits;
}

export async function writeTreeFromTemporaryIndex(input: WriteTreeInput): Promise<string> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const result = await runTransactionCommand(
    {
      args: ["write-tree"],
      cwd: input.ctx.root,
      temporaryIndexPath: input.temporaryIndexPath,
    },
    limits,
  );
  if (!result.ok) {
    throw new TransactionGitError(
      { args: ["write-tree"], cwd: input.ctx.root },
      result,
      `git write-tree failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

export interface CommitObjectInput {
  readonly ctx: PublicationTransactionContext;
  readonly treeSha: string;
  readonly parent: string;
  readonly messageBytes: Buffer;
  readonly limits?: TransactionGitLimits;
}

export async function commitObject(input: CommitObjectInput): Promise<string> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const result = await runTransactionCommand(
    {
      args: ["commit-tree", input.treeSha, "-p", input.parent],
      cwd: input.ctx.root,
      stdin: input.messageBytes.toString("utf8"),
    },
    limits,
  );
  if (!result.ok) {
    throw new TransactionGitError(
      { args: ["commit-tree", input.treeSha, "-p", input.parent], cwd: input.ctx.root },
      result,
      `git commit-tree failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

export interface AdvanceRefInput {
  readonly ctx: PublicationTransactionContext;
  readonly ref: string;
  readonly newSha: string;
  readonly expectedOldSha: string;
  readonly limits?: TransactionGitLimits;
}

export async function advanceBranchRef(input: AdvanceRefInput): Promise<void> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  const result = await runTransactionCommand(
    {
      args: ["update-ref", input.ref, input.newSha, input.expectedOldSha],
      cwd: input.ctx.root,
    },
    limits,
  );
  if (!result.ok) {
    throw new TransactionGitError(
      {
        args: ["update-ref", input.ref, input.newSha, input.expectedOldSha],
        cwd: input.ctx.root,
      },
      result,
      `git update-ref compare-and-swap failed: ${result.stderr}`,
    );
  }
}

export interface ReconcileRealIndexInput {
  readonly ctx: PublicationTransactionContext;
  readonly newSha: string;
  readonly realIndexPath: string;
  readonly limits?: TransactionGitLimits;
}

export async function reconcileRealIndexToCommit(input: ReconcileRealIndexInput): Promise<void> {
  const limits = input.limits ?? DEFAULT_TRANSACTION_LIMITS;
  // `git read-tree -u <tree>` records the tree without trying to merge. The orchestrator proved
  // the user's real index had no staged changes before staging into the temporary index, so a
  // non-merge reconcile is safe here.
  const result = await runTransactionCommand(
    {
      args: ["read-tree", "--reset", "-u", input.newSha],
      cwd: input.ctx.root,
      env: { GIT_INDEX_FILE: input.realIndexPath },
    },
    limits,
  );
  if (!result.ok) {
    throw new TransactionGitError(
      { args: ["read-tree", "--reset", "-u", input.newSha], cwd: input.ctx.root },
      result,
      `git read-tree failed: ${result.stderr}`,
    );
  }
}

export async function resolveHeadSha(
  ctx: PublicationTransactionContext,
  limits: TransactionGitLimits = DEFAULT_TRANSACTION_LIMITS,
): Promise<string> {
  const result = await runTransactionCommand(
    { args: ["rev-parse", "HEAD"], cwd: ctx.root },
    limits,
  );
  if (!result.ok) {
    throw new TransactionGitError(
      { args: ["rev-parse", "HEAD"], cwd: ctx.root },
      result,
      `git rev-parse HEAD failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

export async function resolveCurrentBranchRef(
  ctx: PublicationTransactionContext,
  limits: TransactionGitLimits = DEFAULT_TRANSACTION_LIMITS,
): Promise<string | null> {
  const result = await runTransactionCommand(
    { args: ["symbolic-ref", "-q", "HEAD"], cwd: ctx.root },
    limits,
  );
  if (!result.ok) return null;
  return result.stdout.trim();
}

export function publishPlanOutcome(outcome: string): PublicationPlanOutcome {
  if ((PUBLICATION_PLAN_OUTCOMES as readonly string[]).includes(outcome)) {
    return outcome as PublicationPlanOutcome;
  }
  return "errored";
}
