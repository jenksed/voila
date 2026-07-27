// Closed Git runner for G0 publication transactions. No shell, no caller-selected flags, and no
// network or history-rewrite subcommands. This is the only path by which the transaction can run
// Git; the LLM tool surface cannot reach it directly.

import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";

export interface TransactionGitLimits {
  readonly maxBuffer: number;
  readonly perCommandTimeoutMs: number;
  readonly transactionTimeoutMs: number;
  readonly hookTimeoutMs: number;
}

export const DEFAULT_TRANSACTION_LIMITS: TransactionGitLimits = {
  maxBuffer: 8 * 1024 * 1024,
  perCommandTimeoutMs: 15_000,
  transactionTimeoutMs: 60_000,
  hookTimeoutMs: 30_000,
};

/** Subcommands the closed runner permits. Order is irrelevant; checks are membership. */
export const TRANSACTION_GIT_SUBCOMMANDS: readonly string[] = [
  "diff",
  "diff-index",
  "diff-tree",
  "hash-object",
  "ls-files",
  "read-tree",
  "update-index",
  "cat-file",
  "rev-parse",
  "show",
  "status",
  "symbolic-ref",
  "write-tree",
  "commit-tree",
  "update-ref",
  "for-each-ref",
  "hook",
  "config",
  "var",
] as unknown as readonly string[];

const REFUSED_FLAGS: ReadonlySet<string> = new Set([
  "-c",
  "--config-env",
  "--exec",
  "--exec-path",
  "--git-dir",
  "--namespace",
  "--receive-pack",
  "--upload-pack",
  "--work-tree",
  "-C",
]);

/**
 * Flags the closed runner always rejects because they mutate the user's working state outside the
 * plan boundary. Even a permitted subcommand may not pass these.
 */
const PROHIBITED_FLAGS: ReadonlySet<string> = new Set([
  "--no-verify",
  "--amend",
  "--force",
  "--force-with-lease",
  "--allow-empty",
  "--allow-empty-message",
  "--no-gpg-sign",
  "--no-sign",
  "--reset-author",
  "--reuse-message",
  "--squash",
  "--fixup",
]);

export interface TransactionCommandInput {
  /**
   * Runtime arg vector. The closed runner validates each subcommand against
   * {@link TRANSACTION_GIT_SUBCOMMANDS}; tests can pass literal strings to exercise that guard.
   */
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly stdin?: string;
  /** Set `GIT_INDEX_FILE` only when the runner is staging into a temporary index. */
  readonly temporaryIndexPath?: string;
}

export interface TransactionCommandResult {
  readonly ok: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly code: number | null;
  readonly timedOut: boolean;
  readonly signal: NodeJS.Signals | null;
}

export class TransactionGitError extends Error {
  readonly input: TransactionCommandInput;
  readonly result: TransactionCommandResult;
  constructor(input: TransactionCommandInput, result: TransactionCommandResult, message: string) {
    super(message);
    this.input = input;
    this.result = result;
    this.name = "TransactionGitError";
  }
}

function buildEnv(
  extra: NodeJS.ProcessEnv | undefined,
  temporaryIndex?: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_OPTIONAL_LOCKS: "0",
    GIT_TERMINAL_PROMPT: "0",
    GIT_AUTHOR_NAME: "Voila Steward",
    GIT_AUTHOR_EMAIL: "voila@local.invalid",
    GIT_COMMITTER_NAME: "Voila Steward",
    GIT_COMMITTER_EMAIL: "voila@local.invalid",
    LC_ALL: "C",
    ...(temporaryIndex ? { GIT_INDEX_FILE: temporaryIndex } : {}),
    ...(extra ?? {}),
  };
}

function validateArgs(args: readonly string[]): void {
  if (args.length === 0) {
    throw new TransactionGitError(
      { args, cwd: "" },
      {
        ok: false,
        stdout: "",
        stderr: "Refused: empty arg vector.",
        code: null,
        timedOut: false,
        signal: null,
      },
      "Refused: empty arg vector.",
    );
  }
  const subcommand = args[0];
  if (typeof subcommand !== "string" || !TRANSACTION_GIT_SUBCOMMANDS.includes(subcommand)) {
    throw new TransactionGitError(
      { args, cwd: "" },
      {
        ok: false,
        stdout: "",
        stderr: `Refused: "git ${subcommand}" is not part of the closed G0 transaction surface.`,
        code: null,
        timedOut: false,
        signal: null,
      },
      `Refused: "git ${subcommand}" is not part of the closed G0 transaction surface.`,
    );
  }
  for (const arg of args) {
    if (REFUSED_FLAGS.has(arg) || arg.startsWith("-c=") || arg.startsWith("--config-env=")) {
      throw new TransactionGitError(
        { args, cwd: "" },
        {
          ok: false,
          stdout: "",
          stderr: `Refused: argument "${arg}" could redirect Git outside the transaction.`,
          code: null,
          timedOut: false,
          signal: null,
        },
        `Refused: argument "${arg}" could redirect Git outside the transaction.`,
      );
    }
    if (PROHIBITED_FLAGS.has(arg)) {
      throw new TransactionGitError(
        { args, cwd: "" },
        {
          ok: false,
          stdout: "",
          stderr: `Refused: argument "${arg}" is prohibited by the G0 transaction.`,
          code: null,
          timedOut: false,
          signal: null,
        },
        `Refused: argument "${arg}" is prohibited by the G0 transaction.`,
      );
    }
  }
}

export async function runTransactionCommand(
  input: TransactionCommandInput,
  limits: TransactionGitLimits = DEFAULT_TRANSACTION_LIMITS,
): Promise<TransactionCommandResult> {
  validateArgs(input.args);
  return new Promise<TransactionCommandResult>((resolveResult, reject) => {
    const child = execFile(
      "git",
      [...input.args] as unknown as readonly string[],
      {
        cwd: input.cwd,
        env: buildEnv(input.env, input.temporaryIndexPath),
        shell: false,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: limits.maxBuffer,
        timeout: input.args[0] === "hook" ? limits.hookTimeoutMs : limits.perCommandTimeoutMs,
      },
      (error, stdout, stderr) => {
        const rawCode: unknown = error === null ? 0 : (error as { code?: unknown }).code;
        const rawSignal: unknown = error === null ? null : (error as { signal?: unknown }).signal;
        const result: TransactionCommandResult = {
          ok: error === null,
          stdout: typeof stdout === "string" ? stdout : "",
          stderr:
            typeof stderr === "string" && stderr.length > 0
              ? stderr
              : error === null
                ? ""
                : error.message,
          code: typeof rawCode === "number" ? rawCode : null,
          timedOut:
            error !== null &&
            typeof (error as { killed?: unknown }).killed === "boolean" &&
            (error as { killed: boolean }).killed,
          signal: typeof rawSignal === "string" ? (rawSignal as NodeJS.Signals) : null,
        };
        resolveResult(result);
      },
    );
    if (input.stdin !== undefined && child.stdin) {
      child.stdin.end(input.stdin);
    }
    if (input.stdin === undefined && child.stdin) {
      child.stdin.end();
    }
    child.on("error", reject);
  });
}

/** Allocate a transaction-owned temporary index path. */
export function temporaryIndexPath(root: string): string {
  return `${root}/.voila/publications/.tmp/index-${Date.now()}-${randomBytes(4).toString("hex")}`;
}
