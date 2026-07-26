// Deterministic repository fingerprint: a content-addressed digest of the effective working tree.
// Evidence freshness is decided by comparing a receipt's fingerprint with the current one.
//
// Algorithm: v2. The digest input is the literal header "fingerprint-v2\n" followed by one
// `<path>\t<mode>\t<hash>\n` line per entry, where:
//   - path is a sorted, repository-relative path,
//   - mode is one of "regular", "executable", or "symlink",
//   - hash is sha256 over the regular-file contents (streaming) or the symlink target bytes.
//
// Inputs:
//   - every file in the working tree that is tracked by git (and not deleted), and
//   - every untracked, non-ignored repository file.
//
// Exclusions:
//   - everything under `.voila/` (canonical state) — recording a receipt necessarily rewrites the
//     state directory and we must not invalidate the receipt we just wrote,
//   - everything under the legacy `.newfang/` directory, while it still exists, on the same grounds.
//
// Staging state, branch name, commit identity, absolute paths, and timestamps are NEVER part of the
// digest. `gitHead` is reported alongside the digest as non-authoritative diagnostic metadata only.
//
// Receipts written by this algorithm carry `fingerprintAlgorithm: "v2"` in their manifest. v1 receipts
// carry no such field; the proof engine recognizes them as v1 by absence and treats them as stale
// against any v2 current fingerprint. v1 hex values cannot equal v2 hex values without a sha256
// collision because the digest input is prefixed differently, so no special-case comparison is
// needed to make old receipts go stale.

import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readlinkSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { VoilaStateError } from "./errors.ts";
import { LEGACY_STATE_DIR } from "./legacy.ts";
import { VOILA_DIR } from "./paths.ts";

/** Git is unavailable, or this is not inside a git repository. Callers must fail clearly, never guess. */
export class FingerprintUnavailableError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "FingerprintUnavailableError";
  }
}

/**
 * Algorithms a fingerprint can carry. New algorithms must be appended; the value of an existing
 * algorithm is the contract that holds historical receipts valid.
 */
export type FingerprintAlgorithm = "v1" | "v2";

/** The algorithm every newly computed fingerprint uses. Receipts record the algorithm that produced them. */
export const CURRENT_FINGERPRINT_ALGORITHM: FingerprintAlgorithm = "v2";

/**
 * Pathspec excluding Voila's own state from every git query used by the fingerprint. Both the
 * current and the legacy state directory are excluded, so migrating one to the other is invisible
 * to evidence freshness.
 */
const EXCLUDE_STATE_DIRS = [
  ".",
  ...[VOILA_DIR, LEGACY_STATE_DIR].flatMap((dir) => [
    `:(exclude,glob)${dir}/**`,
    `:(exclude)${dir}`,
  ]),
];

/** Hard cap on the bytes hashed per file. A stray large artifact cannot stall verification. */
const MAX_FILE_BYTES = 64 * 1024 * 1024;
/** Read buffer size for streaming hashes. */
const READ_CHUNK = 64 * 1024;

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

export type EntryMode = "regular" | "executable" | "symlink";

export interface FingerprintEntry {
  /** Repository-relative path, normalized (no leading `./`, forward slashes). */
  path: string;
  /** Normalized file mode. */
  mode: EntryMode;
  /** sha256 hex of the regular-file contents or the symlink target. */
  hash: string;
}

export interface RepositoryFingerprint {
  /** sha256 hex digest over the deterministic v2 input record. */
  value: string;
  /** Algorithm that produced this digest. */
  algorithm: FingerprintAlgorithm;
  /** Current git HEAD, when the branch is born. Diagnostic only — never used in the digest. */
  gitHead?: string;
  /** Number of entries (tracked + untracked files) that contributed to the digest. */
  entryCount: number;
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

  // 1. Tracked files currently present (NOT deleted from the working tree).
  const trackedList = await git(root, ["ls-files", "-z"]);
  const trackedPaths = splitNullPaths(trackedList.stdout);

  // 2. Untracked, non-ignored files outside .voila/ and .newfang/.
  const untrackedList = await git(root, [
    "ls-files",
    "--others",
    "--exclude-standard",
    "-z",
    "--",
    ...EXCLUDE_STATE_DIRS,
  ]);
  const untrackedPaths = splitNullPaths(untrackedList.stdout);

  const entries: FingerprintEntry[] = [];
  for (const relPath of trackedPaths) {
    if (isExcludedStatePath(relPath)) continue;
    const entry = await fingerprintEntry(root, relPath);
    if (entry !== null) entries.push(entry);
  }
  for (const relPath of untrackedPaths) {
    // The untracked query already excludes state directories; do not re-check.
    const entry = await fingerprintEntry(root, relPath);
    if (entry !== null) entries.push(entry);
  }

  entries.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // 3. Build the deterministic v2 digest input. The header ensures v1 and v2 inputs are disjoint.
  const hash = createHash("sha256");
  hash.update("fingerprint-v2\n");
  for (const entry of entries) {
    hash.update(`${entry.path}\t${entry.mode}\t${entry.hash}\n`);
  }
  const value = hash.digest("hex");

  return {
    value,
    algorithm: CURRENT_FINGERPRINT_ALGORITHM,
    ...(gitHead ? { gitHead } : {}),
    entryCount: entries.length,
  };
}

/**
 * Compute the fingerprint entry for one path. Returns null when the path is missing from the working
 * tree (a tracked file deleted locally is not "currently present"), or when the file type is not
 * representable as regular/executable/symlink (a directory, FIFO, socket, or device — `git ls-files`
 * normally never returns those, but be defensive).
 */
async function fingerprintEntry(root: string, relPath: string): Promise<FingerprintEntry | null> {
  const absPath = join(root, relPath);
  let stat;
  try {
    stat = lstatSync(absPath);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(absPath);
    return {
      path: relPath,
      mode: "symlink",
      hash: createHash("sha256").update(Buffer.from(target, "utf8")).digest("hex"),
    };
  }
  if (stat.isFile()) {
    const mode: EntryMode = stat.mode & 0o111 ? "executable" : "regular";
    return { path: relPath, mode, hash: await streamSha256(absPath) };
  }
  return null;
}

/**
 * Streaming SHA-256 over a regular file. The bound on the bytes hashed is large enough to cover any
 * realistic source tree; an oversize file is hashed with a deterministic prefix to ensure the digest
 * still reflects content changes without unbounded memory use.
 */
async function streamSha256(absPath: string): Promise<string> {
  let size = 0;
  try {
    const fd = await open(absPath, "r");
    try {
      size = (await fd.stat()).size;
      if (size > MAX_FILE_BYTES) {
        return createHash("sha256")
          .update(`oversize:${size}:${await streamPrefixSha256(fd)}`)
          .digest("hex");
      }
      const hash = createHash("sha256");
      const buffer = Buffer.allocUnsafe(READ_CHUNK);
      let offset = 0;
      while (offset < size) {
        const want = Math.min(READ_CHUNK, size - offset);
        const { bytesRead } = await fd.read(buffer, 0, want, offset);
        if (bytesRead === 0) break;
        hash.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      return hash.digest("hex");
    } finally {
      await fd.close();
    }
  } catch {
    // Unreadable file (race with deletion, permission denial): record deterministically.
    return createHash("sha256").update(`unreadable:${absPath}`).digest("hex");
  }
}

/** SHA-256 over the first MAX_FILE_BYTES bytes of an open file. Used only when the file is oversize. */
async function streamPrefixSha256(fd: Awaited<ReturnType<typeof open>>): Promise<string> {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(READ_CHUNK);
  let total = 0;
  while (total < MAX_FILE_BYTES) {
    const want = Math.min(READ_CHUNK, MAX_FILE_BYTES - total);
    const { bytesRead } = await fd.read(buffer, 0, want, total);
    if (bytesRead === 0) break;
    hash.update(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  return hash.digest("hex");
}

function splitNullPaths(stdout: string): string[] {
  return stdout
    .split("\0")
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map(normalizePath)
    .sort();
}

/** Drop a leading `./` and normalize separators. `git` always emits forward slashes. */
function normalizePath(p: string): string {
  let out = p;
  if (out.startsWith("./")) out = out.slice(2);
  return out;
}

/** True when the path lives under the canonical state directory or the legacy state directory. */
function isExcludedStatePath(relPath: string): boolean {
  return (
    relPath === VOILA_DIR ||
    relPath.startsWith(`${VOILA_DIR}/`) ||
    relPath === LEGACY_STATE_DIR ||
    relPath.startsWith(`${LEGACY_STATE_DIR}/`)
  );
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
