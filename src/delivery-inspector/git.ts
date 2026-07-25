// Read-only git state collection.
//
// Safety properties, in order of importance:
// 1. **No mutation, enforced at the seam.** `createGitRunner` refuses any argument vector whose
//    subcommand is not in `READ_ONLY_GIT_SUBCOMMANDS`, and refuses argument-injection flags. So even
//    a caller that hands the runner an `add` or `commit` vector cannot mutate the repository.
// 2. **No shell.** `execFile` is invoked with an argument array and `shell: false`. No string
//    concatenation, so a path containing spaces, quotes, or `;` is inert data.
// 3. **No index writes.** `GIT_OPTIONAL_LOCKS=0` stops `git status` from taking the index lock to
//    opportunistically refresh it. That is what makes `git status --porcelain` byte-identical before
//    and after an inspection.
// 4. **No network, no prompts.** `GIT_TERMINAL_PROMPT=0`, and no subcommand that contacts a remote is
//    on the allowlist (`fetch`, `pull`, `push`, `ls-remote` are all absent).
//
// Parsing targets `git status --porcelain=v2 --branch -z` and `git diff --numstat -z`, both of which
// are documented stable machine formats. `-z` means paths are NUL-terminated and never quoted or
// escaped, so filenames containing spaces, quotes, or newlines parse correctly.

import { execFile } from "node:child_process";
import type { ChangeStatus, InspectionLimits } from "./types.ts";

export interface GitCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  /** Process exit code, or `null` when the process was signalled or never started. */
  code: number | null;
}

/** Runs a git argument vector and resolves (never rejects) with the outcome. */
export type GitRunner = (args: readonly string[]) => Promise<GitCommandResult>;

/** The only git subcommands the inspector is permitted to run. All are read-only. */
export const READ_ONLY_GIT_SUBCOMMANDS: readonly string[] = ["diff", "rev-parse", "status"];

/**
 * Flags refused regardless of subcommand: they can redirect git at another repository or run another
 * program, which would defeat the read-only allowlist.
 */
const REFUSED_ARGUMENTS: readonly string[] = [
  "-c",
  "--config-env",
  "--exec",
  "--exec-path",
  "--git-dir",
  "--namespace",
  "--receive-pack",
  "--upload-pack",
  "--work-tree",
];

/** Thrown-as-result guard message, so a violation is visible rather than silent. */
function refuse(reason: string): GitCommandResult {
  return { ok: false, stdout: "", stderr: reason, code: null };
}

/**
 * Build a read-only git runner rooted at `root`.
 *
 * The returned runner refuses any argument vector that is not a read-only inspection, so it is safe
 * to expose as the injectable seam: the guard travels with the runner, not with the call sites.
 */
export function createGitRunner(root: string, limits: InspectionLimits): GitRunner {
  return (args) =>
    new Promise<GitCommandResult>((resolveResult) => {
      const subcommand = args[0];
      if (args.length === 0 || typeof subcommand !== "string") {
        resolveResult(refuse("Refused: no git subcommand was given."));
        return;
      }
      if (!READ_ONLY_GIT_SUBCOMMANDS.includes(subcommand)) {
        resolveResult(
          refuse(
            `Refused: "git ${subcommand}" is not read-only. The delivery inspector may only run: ${READ_ONLY_GIT_SUBCOMMANDS.join(", ")}.`,
          ),
        );
        return;
      }
      const bad = args.find((arg) =>
        REFUSED_ARGUMENTS.some((flag) => arg === flag || arg.startsWith(`${flag}=`)),
      );
      if (bad !== undefined) {
        resolveResult(
          refuse(`Refused: argument "${bad}" could redirect git outside the inspection.`),
        );
        return;
      }

      execFile(
        "git",
        [...args],
        {
          cwd: root,
          shell: false,
          windowsHide: true,
          encoding: "utf8",
          maxBuffer: limits.maxGitOutputBytes,
          timeout: limits.gitTimeoutMs,
          env: {
            ...process.env,
            // Prevents `git status` from writing a refreshed index. This is the no-mutation guarantee.
            GIT_OPTIONAL_LOCKS: "0",
            // No credential or passphrase prompt can block or reach the network.
            GIT_TERMINAL_PROMPT: "0",
            // Stable, parseable diagnostics.
            LC_ALL: "C",
          },
        },
        (error, stdout, stderr) => {
          // `error.code` is the exit status for a normal failure, but an errno string (for example
          // "ENOENT" when git is not installed) when the process never ran.
          const rawCode: unknown = error === null ? 0 : (error as { code?: unknown }).code;
          resolveResult({
            ok: error === null,
            stdout: typeof stdout === "string" ? stdout : "",
            stderr:
              typeof stderr === "string" && stderr.length > 0
                ? stderr
                : error === null
                  ? ""
                  : error.message,
            code: typeof rawCode === "number" ? rawCode : null,
          });
        },
      );
    });
}

/** One raw entry from `git status --porcelain=v2`. */
export interface GitStatusEntry {
  path: string;
  previousPath?: string;
  /** Staged (index vs HEAD) code. `.` means unmodified. */
  x: string;
  /** Worktree (worktree vs index) code. `.` means unmodified. */
  y: string;
  untracked: boolean;
}

export interface GitBranchFacts {
  branch?: string;
  head?: string;
  detachedHead: boolean;
  upstream?: string;
  ahead?: number;
  behind?: number;
}

export interface ParsedStatus extends GitBranchFacts {
  entries: GitStatusEntry[];
  /** Record prefixes the parser did not recognize, for honest reporting. */
  unrecognizedRecords: number;
}

/** Split on single spaces into at most `count` parts, leaving the remainder intact as the last part. */
function splitFields(record: string, count: number): string[] {
  const parts: string[] = [];
  let rest = record;
  while (parts.length < count - 1) {
    const at = rest.indexOf(" ");
    if (at === -1) break;
    parts.push(rest.slice(0, at));
    rest = rest.slice(at + 1);
  }
  parts.push(rest);
  return parts;
}

function parseCount(text: string | undefined): number | undefined {
  if (text === undefined) return undefined;
  const value = Number.parseInt(text, 10);
  return Number.isFinite(value) ? Math.abs(value) : undefined;
}

/**
 * Parse `git status --porcelain=v2 --branch --untracked-files=all -z`.
 *
 * Record shapes (verified against git 2.50):
 * - `# branch.oid <oid>` | `# branch.oid (initial)`
 * - `# branch.head <branch>` | `# branch.head (detached)`
 * - `# branch.upstream <name>` (absent when no upstream is configured)
 * - `# branch.ab +<ahead> -<behind>`
 * - `1 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <path>`
 * - `2 <XY> <sub> <mH> <mI> <mW> <hH> <hI> <Xscore> <path>` followed by `<origPath>` as the next
 *   NUL-separated field
 * - `u <XY> <sub> <m1> <m2> <m3> <mW> <h1> <h2> <h3> <path>`
 * - `? <path>`
 */
export function parseStatusPorcelainV2(stdout: string): ParsedStatus {
  const records = stdout.split("\0");
  // A trailing NUL yields a final empty element; drop empties, which are never valid records.
  const entries: GitStatusEntry[] = [];
  let unrecognizedRecords = 0;
  const facts: GitBranchFacts = { detachedHead: false };

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record === undefined || record.length === 0) continue;

    if (record.startsWith("# ")) {
      const [key, value] = splitFields(record.slice(2), 2);
      if (key === "branch.oid" && value !== undefined && value !== "(initial)") {
        facts.head = value;
      } else if (key === "branch.head" && value !== undefined) {
        if (value === "(detached)") facts.detachedHead = true;
        else facts.branch = value;
      } else if (key === "branch.upstream" && value !== undefined) {
        facts.upstream = value;
      } else if (key === "branch.ab" && value !== undefined) {
        const [aheadText, behindText] = splitFields(value, 2);
        facts.ahead = parseCount(aheadText?.replace(/^\+/, ""));
        facts.behind = parseCount(behindText?.replace(/^-/, ""));
      }
      continue;
    }

    const kind = record[0];
    if (kind === "1") {
      const fields = splitFields(record, 9);
      const xy = fields[1] ?? "..";
      const path = fields[8];
      if (path === undefined || path.length === 0) {
        unrecognizedRecords += 1;
        continue;
      }
      entries.push({ path, x: xy[0] ?? ".", y: xy[1] ?? ".", untracked: false });
    } else if (kind === "2") {
      const fields = splitFields(record, 10);
      const xy = fields[1] ?? "..";
      const path = fields[9];
      // The original path is a separate NUL-terminated field immediately after this record.
      const previousPath = records[index + 1];
      index += 1;
      if (path === undefined || path.length === 0) {
        unrecognizedRecords += 1;
        continue;
      }
      entries.push({
        path,
        ...(previousPath !== undefined && previousPath.length > 0 ? { previousPath } : {}),
        x: xy[0] ?? ".",
        y: xy[1] ?? ".",
        untracked: false,
      });
    } else if (kind === "u") {
      const fields = splitFields(record, 11);
      const xy = fields[1] ?? "UU";
      const path = fields[10];
      if (path === undefined || path.length === 0) {
        unrecognizedRecords += 1;
        continue;
      }
      entries.push({ path, x: xy[0] ?? "U", y: xy[1] ?? "U", untracked: false });
    } else if (kind === "?") {
      const path = record.slice(2);
      if (path.length === 0) {
        unrecognizedRecords += 1;
        continue;
      }
      entries.push({ path, x: "?", y: "?", untracked: true });
    } else if (kind === "!") {
      // Ignored files: never requested, and never reported if they appear.
      continue;
    } else {
      unrecognizedRecords += 1;
    }
  }

  return { ...facts, entries, unrecognizedRecords };
}

export interface NumstatEntry {
  path: string;
  previousPath?: string;
  insertions?: number;
  deletions?: number;
  binary: boolean;
}

/**
 * Parse `git diff --numstat -z`.
 *
 * Shapes (verified against git 2.50):
 * - `<ins>\t<del>\t<path>` as one NUL-terminated record
 * - a rename emits `<ins>\t<del>\t` with an empty path, then `<origPath>` and `<newPath>` as the two
 *   following NUL-separated fields
 * - a binary file reports `-` for both counts
 */
export function parseNumstatZ(stdout: string): NumstatEntry[] {
  const fields = stdout.split("\0");
  const out: NumstatEntry[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const record = fields[index];
    if (record === undefined || record.length === 0) continue;
    const firstTab = record.indexOf("\t");
    if (firstTab === -1) continue;
    const secondTab = record.indexOf("\t", firstTab + 1);
    if (secondTab === -1) continue;

    const insertionsText = record.slice(0, firstTab);
    const deletionsText = record.slice(firstTab + 1, secondTab);
    let path = record.slice(secondTab + 1);
    let previousPath: string | undefined;

    if (path.length === 0) {
      previousPath = fields[index + 1];
      const newPath = fields[index + 2];
      index += 2;
      if (newPath === undefined || newPath.length === 0) continue;
      path = newPath;
    }

    const binary = insertionsText === "-" || deletionsText === "-";
    const insertions = binary ? undefined : parseCount(insertionsText);
    const deletions = binary ? undefined : parseCount(deletionsText);
    out.push({
      path,
      ...(previousPath !== undefined && previousPath.length > 0 ? { previousPath } : {}),
      ...(insertions !== undefined ? { insertions } : {}),
      ...(deletions !== undefined ? { deletions } : {}),
      binary,
    });
  }
  return out;
}

/** Derive one primary status from git's staged/worktree code pair, most significant first. */
export function primaryStatus(x: string, y: string): ChangeStatus {
  if (x === "?" || y === "?") return "untracked";
  if (x === "U" || y === "U") return "unmerged";
  if (x === "R" || y === "R") return "renamed";
  if (x === "C" || y === "C") return "copied";
  if (x === "A") return "added";
  if (x === "D" || y === "D") return "deleted";
  if (x === "T" || y === "T") return "type_changed";
  return "modified";
}

export interface GitCollection {
  isGitRepository: boolean;
  facts: GitBranchFacts;
  entries: GitStatusEntry[];
  /** Line counts and binary indication, keyed by current path. */
  diffStats: Map<string, { insertions?: number; deletions?: number; binary: boolean }>;
  limitations: string[];
}

function mergeStat(
  target: Map<string, { insertions?: number; deletions?: number; binary: boolean }>,
  entry: NumstatEntry,
): void {
  const existing = target.get(entry.path);
  if (existing === undefined) {
    target.set(entry.path, {
      ...(entry.insertions !== undefined ? { insertions: entry.insertions } : {}),
      ...(entry.deletions !== undefined ? { deletions: entry.deletions } : {}),
      binary: entry.binary,
    });
    return;
  }
  // A path can appear in both the staged and the unstaged diff; sum the two.
  const insertions =
    entry.insertions === undefined && existing.insertions === undefined
      ? undefined
      : (existing.insertions ?? 0) + (entry.insertions ?? 0);
  const deletions =
    entry.deletions === undefined && existing.deletions === undefined
      ? undefined
      : (existing.deletions ?? 0) + (entry.deletions ?? 0);
  target.set(entry.path, {
    ...(insertions !== undefined ? { insertions } : {}),
    ...(deletions !== undefined ? { deletions } : {}),
    binary: existing.binary || entry.binary,
  });
}

/**
 * Collect read-only git state. Never throws: each step that fails records a limitation and the
 * collection continues, so callers always get a partial-but-honest result.
 */
export async function collectGitState(runGit: GitRunner): Promise<GitCollection> {
  const limitations: string[] = [];

  const insideWorktree = await runGit(["rev-parse", "--is-inside-work-tree"]);
  if (!insideWorktree.ok || insideWorktree.stdout.trim() !== "true") {
    return {
      isGitRepository: false,
      facts: { detachedHead: false },
      entries: [],
      diffStats: new Map(),
      limitations: [
        "The inspected root is not inside a git worktree, so no branch, HEAD, upstream, or change set could be collected. Verification-command discovery still ran; point the inspector at a repository root for change analysis.",
      ],
    };
  }

  const status = await runGit([
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "-z",
  ]);
  if (!status.ok) {
    return {
      isGitRepository: true,
      facts: { detachedHead: false },
      entries: [],
      diffStats: new Map(),
      limitations: [
        `git status failed, so the change set is unknown and this inspection reports no changes rather than guessing (git: ${summarizeStderr(status.stderr)}).`,
      ],
    };
  }

  const parsed = parseStatusPorcelainV2(status.stdout);
  if (parsed.unrecognizedRecords > 0) {
    limitations.push(
      `${parsed.unrecognizedRecords} git status record(s) were not recognized by the parser and were skipped; the change set may be incomplete.`,
    );
  }
  if (parsed.head === undefined) {
    limitations.push(
      "HEAD could not be resolved (the repository appears to have no commits yet), so ahead/behind and staged-vs-HEAD comparisons are limited.",
    );
  }
  if (parsed.upstream === undefined) {
    limitations.push(
      "No upstream is configured for the current branch, so ahead/behind counts are unavailable.",
    );
  } else if (parsed.ahead === undefined || parsed.behind === undefined) {
    limitations.push(
      `An upstream (${parsed.upstream}) is configured but git did not report divergence counts, so ahead/behind are unavailable. The upstream ref may be missing locally; no fetch was performed because the inspector never touches the network.`,
    );
  }

  const diffStats = new Map<string, { insertions?: number; deletions?: number; binary: boolean }>();
  for (const [label, args] of [
    ["unstaged", ["diff", "--numstat", "-z"]],
    ["staged", ["diff", "--cached", "--numstat", "-z"]],
  ] as const) {
    const result = await runGit(args);
    if (!result.ok) {
      limitations.push(
        `Line counts for ${label} changes are unavailable (git: ${summarizeStderr(result.stderr)}); insertions and deletions are omitted for affected files.`,
      );
      continue;
    }
    for (const entry of parseNumstatZ(result.stdout)) mergeStat(diffStats, entry);
  }

  const { entries, unrecognizedRecords: _ignored, ...facts } = parsed;
  return { isGitRepository: true, facts, entries, diffStats, limitations };
}

/** One short line of git's own error, with no absolute paths echoed back. */
function summarizeStderr(stderr: string): string {
  const firstLine = stderr.split("\n").find((line) => line.trim().length > 0) ?? "no detail";
  return firstLine
    .trim()
    .replace(/\/[^\s]*/g, "<path>")
    .slice(0, 160);
}
