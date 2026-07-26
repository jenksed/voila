// Shared test support for the delivery inspector. Not a test file: the `test/**/*.test.ts` glob does
// not pick this up.
//
// Two kinds of harness live here:
// 1. A **fake git runner** that replays recorded `--porcelain=v2 -z` and `--numstat -z` payloads, so
//    every pure path is testable without a real repository. It also records the argument vectors it
//    was given, which is how the read-only guarantee is asserted.
// 2. A **temporary git repository** builder for the integration tests. Identity is passed with `-c`
//    flags per invocation so nothing is written to the user's global git configuration.

import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import type { GitCommandResult, GitRunner } from "../../src/delivery-inspector/git.ts";

/** NUL, the `-z` record terminator. Named because a literal is easy to misread in a template. */
const NUL = String.fromCharCode(0);

export interface StatusEntrySpec {
  kind: "ordinary" | "rename" | "untracked" | "unmerged";
  path: string;
  previousPath?: string;
  /** Staged code. */
  x?: string;
  /** Worktree code. */
  y?: string;
}

export interface StatusPayloadSpec {
  head?: string | "(initial)";
  branch?: string;
  detached?: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
  entries?: StatusEntrySpec[];
}

const OID_A = "1111111111111111111111111111111111111111";
const OID_B = "2222222222222222222222222222222222222222";

/**
 * Build a `git status --porcelain=v2 --branch -z` payload.
 * Every record is NUL-terminated, matching real `-z` output (verified against git 2.50).
 */
export function statusPayload(spec: StatusPayloadSpec): string {
  const records: string[] = [];
  records.push(`# branch.oid ${spec.head ?? OID_A}`);
  records.push(`# branch.head ${spec.detached === true ? "(detached)" : (spec.branch ?? "main")}`);
  if (spec.upstream !== undefined) records.push(`# branch.upstream ${spec.upstream}`);
  if (spec.ahead !== undefined && spec.behind !== undefined) {
    records.push(`# branch.ab +${spec.ahead} -${spec.behind}`);
  }

  for (const entry of spec.entries ?? []) {
    const x = entry.x ?? "M";
    const y = entry.y ?? ".";
    if (entry.kind === "ordinary") {
      records.push(`1 ${x}${y} N... 100644 100644 100644 ${OID_A} ${OID_B} ${entry.path}`);
    } else if (entry.kind === "rename") {
      records.push(`2 ${x}${y} N... 100644 100644 100644 ${OID_A} ${OID_B} R100 ${entry.path}`);
      // The original path is its own NUL-terminated field immediately after the record.
      records.push(entry.previousPath ?? "old.ts");
    } else if (entry.kind === "unmerged") {
      records.push(
        `u UU N... 100644 100644 100644 100644 ${OID_A} ${OID_B} ${OID_B} ${entry.path}`,
      );
    } else {
      records.push(`? ${entry.path}`);
    }
  }
  return records.map((record) => record + NUL).join("");
}

/** Build a `git diff --numstat -z` payload. `insertions: null` means binary. */
export function numstatPayload(
  rows: readonly {
    path: string;
    previousPath?: string;
    insertions?: number | null;
    deletions?: number | null;
  }[],
): string {
  const fields: string[] = [];
  for (const row of rows) {
    const insertions = row.insertions === null ? "-" : String(row.insertions ?? 0);
    const deletions = row.deletions === null ? "-" : String(row.deletions ?? 0);
    if (row.previousPath !== undefined) {
      // A rename emits an empty path field, then the original path, then the new path.
      fields.push(`${insertions}\t${deletions}\t`, row.previousPath, row.path);
    } else {
      fields.push(`${insertions}\t${deletions}\t${row.path}`);
    }
  }
  return fields.map((field) => field + NUL).join("");
}

export interface FakeGitSpec {
  insideWorkTree?: boolean;
  status?: string;
  unstagedNumstat?: string;
  stagedNumstat?: string;
  failStatus?: boolean;
  failUnstagedNumstat?: boolean;
  failStagedNumstat?: boolean;
}

export interface FakeGit {
  runGit: GitRunner;
  /** Every argument vector the inspector asked for, in order. */
  calls: string[][];
}

const OK = (stdout: string): GitCommandResult => ({ ok: true, stdout, stderr: "", code: 0 });
const FAIL = (stderr: string): GitCommandResult => ({ ok: false, stdout: "", stderr, code: 128 });

/** A git runner that replays fixtures and records what it was asked to run. */
export function fakeGit(spec: FakeGitSpec = {}): FakeGit {
  const calls: string[][] = [];
  const runGit: GitRunner = async (args) => {
    calls.push([...args]);
    const joined = args.join(" ");
    if (joined === "rev-parse --is-inside-work-tree") {
      return spec.insideWorkTree === false ? FAIL("fatal: not a git repository") : OK("true\n");
    }
    if (args[0] === "status") {
      return spec.failStatus === true
        ? FAIL("fatal: unable to read index")
        : OK(spec.status ?? statusPayload({}));
    }
    if (args[0] === "diff" && args.includes("--cached")) {
      return spec.failStagedNumstat === true
        ? FAIL("fatal: bad revision")
        : OK(spec.stagedNumstat ?? "");
    }
    if (args[0] === "diff") {
      return spec.failUnstagedNumstat === true
        ? FAIL("fatal: bad revision")
        : OK(spec.unstagedNumstat ?? "");
    }
    return FAIL(`unexpected argument vector: ${joined}`);
  };
  return { runGit, calls };
}

/** Git subcommands that would mutate a repository. No inspection may ever issue one. */
export const MUTATING_GIT_SUBCOMMANDS: readonly string[] = [
  "add",
  "am",
  "apply",
  "checkout",
  "cherry-pick",
  "clean",
  "commit",
  "fetch",
  "gc",
  "init",
  "merge",
  "mv",
  "pull",
  "push",
  "rebase",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "switch",
  "tag",
  "update-index",
  "update-ref",
  "worktree",
];

const GIT_IDENTITY: readonly string[] = [
  "-c",
  "user.email=inspector@example.invalid",
  "-c",
  "user.name=Delivery Inspector Test",
  "-c",
  "commit.gpgsign=false",
];

/** Run git in `cwd` with a per-invocation identity, so no global config is touched. */
export function git(cwd: string, args: readonly string[]): string {
  return execFileSync("git", [...GIT_IDENTITY, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      LC_ALL: "C",
      // So the test's own probes (notably `git status`) do not opportunistically rewrite the index.
      // Explicit writes such as `add`, `mv`, and `commit` take a required lock and still work.
      GIT_OPTIONAL_LOCKS: "0",
    },
  });
}

/** Create and write a file, creating parent directories as needed. */
export async function put(root: string, relPath: string, contents: string): Promise<void> {
  const target = join(root, relPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, contents, "utf8");
}

/** Create a bare temporary directory outside the project tree. */
export async function tempDirectory(prefix = "nf-delivery-"): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

/**
 * Create a temporary git repository with one initial commit.
 * Returns the repository root. Nothing outside the OS temp directory is touched.
 */
export async function tempRepository(
  files: Readonly<Record<string, string>> = { "README.md": "# temp\n" },
): Promise<string> {
  const root = await tempDirectory();
  git(root, ["init", "-q", "-b", "main"]);
  for (const [relPath, contents] of Object.entries(files)) await put(root, relPath, contents);
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "initial"]);
  return root;
}

/** `git status --porcelain` output, used as the byte-exact no-mutation fingerprint. */
export function porcelainFingerprint(root: string): string {
  return git(root, ["status", "--porcelain", "--untracked-files=all"]);
}
