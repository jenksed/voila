// Deterministic repository fingerprint: a digest of the repository work state that a verification
// command observed. Evidence freshness is decided by comparing a receipt's fingerprint with the
// current one.
//
// Inputs (all deterministic, all sorted, none machine-specific):
//   - git HEAD (empty string on an unborn branch),
//   - the tracked working-tree diff vs HEAD,
//   - the staged diff,
//   - untracked, non-ignored repository files by sorted path + content hash.
//
// Deliberate exclusion: everything under `.newfang/`. Recording a receipt necessarily rewrites
// `project.json`, `events.jsonl`, the generated view, and the receipt artifact itself, so including
// NewFang's own bookkeeping would make every receipt stale the instant it was created. The tradeoff is
// stated plainly: a change confined entirely to `.newfang/` does not invalidate existing evidence.
//
// Raw diffs are hashed, never stored. No absolute paths enter the digest.

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NewfangStateError } from "./errors.ts";
import { sha256, sha256Bytes } from "./source.ts";

/** Git is unavailable, or this is not a git repository. Callers must fail clearly, never guess. */
export class FingerprintUnavailableError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "FingerprintUnavailableError";
  }
}

/** Pathspec excluding NewFang's own state from every git query used by the fingerprint. */
const EXCLUDE_NEWFANG = [".", `:(exclude,glob)${".newfang"}/**`, `:(exclude)${".newfang"}`];

/** Hard cap on untracked bytes hashed per file, so a stray large artifact cannot stall verification. */
const MAX_UNTRACKED_BYTES = 2 * 1024 * 1024;

interface GitResult {
  ok: boolean;
  stdout: string;
}

function git(root: string, args: string[]): Promise<GitResult> {
  return new Promise((resolve) => {
    execFile(
      "git",
      args,
      { cwd: root, maxBuffer: 64 * 1024 * 1024, windowsHide: true },
      (err, stdout) => {
        resolve({ ok: !err, stdout: stdout.toString() });
      },
    );
  });
}

export interface RepositoryFingerprint {
  /** sha256 hex digest over the deterministic input record. */
  value: string;
  /** Current git HEAD, when the branch is born. */
  gitHead?: string;
  /** Number of untracked repository files that contributed to the digest. */
  untrackedCount: number;
  /** True when the tracked working tree or index differs from HEAD. */
  dirty: boolean;
}

/**
 * Compute the current repository fingerprint. Throws FingerprintUnavailableError when git is missing
 * or `root` is not inside a work tree — verification must not silently record unverifiable freshness.
 */
export async function repositoryFingerprint(root: string): Promise<RepositoryFingerprint> {
  const inside = await git(root, ["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") {
    throw new FingerprintUnavailableError(
      `Cannot compute a repository fingerprint: ${root} is not inside a git work tree (or git is unavailable). Verification receipts require git so evidence freshness can be decided.`,
    );
  }

  const headResult = await git(root, ["rev-parse", "HEAD"]);
  const gitHead = headResult.ok ? headResult.stdout.trim() : "";

  // Tracked changes. On an unborn branch these calls may fail; an empty diff is then correct.
  const trackedDiff = await git(root, ["diff", "--no-color", "--", ...EXCLUDE_NEWFANG]);
  const stagedDiff = await git(root, ["diff", "--no-color", "--cached", "--", ...EXCLUDE_NEWFANG]);

  const untrackedList = await git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...EXCLUDE_NEWFANG,
  ]);
  const untrackedPaths = untrackedList.stdout
    .split("\0")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .sort();

  const untracked: Array<{ path: string; sha256: string }> = [];
  for (const relPath of untrackedPaths) {
    untracked.push({ path: relPath, sha256: await hashUntracked(root, relPath) });
  }

  const trackedDiffSha = sha256(trackedDiff.ok ? trackedDiff.stdout : "");
  const stagedDiffSha = sha256(stagedDiff.ok ? stagedDiff.stdout : "");

  // Stable key order; the JSON is the hashed record, never persisted.
  const record = JSON.stringify({
    version: 1,
    gitHead,
    trackedDiffSha,
    stagedDiffSha,
    untracked,
  });

  return {
    value: sha256(record),
    ...(gitHead ? { gitHead } : {}),
    untrackedCount: untracked.length,
    dirty:
      (trackedDiff.ok && trackedDiff.stdout.length > 0) ||
      (stagedDiff.ok && stagedDiff.stdout.length > 0),
  };
}

async function hashUntracked(root: string, relPath: string): Promise<string> {
  try {
    const bytes = await readFile(join(root, relPath));
    if (bytes.byteLength > MAX_UNTRACKED_BYTES) {
      // Hash a bounded prefix plus the length so the digest still changes with the file.
      return sha256(
        `oversize:${bytes.byteLength}:${sha256Bytes(bytes.subarray(0, MAX_UNTRACKED_BYTES))}`,
      );
    }
    return sha256Bytes(bytes);
  } catch {
    // Unreadable or vanished between listing and hashing: record that fact deterministically.
    return sha256("unreadable");
  }
}

/**
 * Best-effort fingerprint for read-only surfaces (console, widget, context injection, doctor).
 * Returns null when git is unavailable so callers can degrade rather than fail.
 */
export async function tryRepositoryFingerprint(root: string): Promise<string | null> {
  try {
    return (await repositoryFingerprint(root)).value;
  } catch {
    return null;
  }
}
