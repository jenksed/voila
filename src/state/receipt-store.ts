// Verification execution and immutable receipt artifacts.
//
// Ordering invariant: fingerprint -> execute -> write the COMPLETE artifact in a Voila-owned temp
// directory -> atomically promote it into place -> only then link it into canonical state. A failed
// canonical update therefore never leaves a linked partial receipt; it leaves at most an unreferenced
// promoted directory, which `/voila doctor` reports.
//
// Safety boundaries (documented, not enforced by a sandbox):
//   - the command runs with `shell: false`; no pipes, redirection, chaining, or env expansion,
//   - a single arbitrary shell string is refused; executable + argv array only,
//   - the working directory must be repository-relative (traversal and symlink escape rejected),
//   - execution is bounded by a timeout,
//   - the command may still have side effects. This is NOT a sandbox.
//
// Recorded evidence never includes environment-variable values, absolute private paths, or diffs.

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { receiptPaths, statePaths } from "./paths.ts";
import { loadState, updateState } from "./store.ts";
import { VoilaStateError } from "./errors.ts";
import { CURRENT_FINGERPRINT_ALGORITHM, repositoryFingerprint } from "./fingerprint.ts";
import type { FingerprintAlgorithm } from "./fingerprint.ts";
import { resolveRepoRelativeDir, sha256 } from "./source.ts";
import { allocateId } from "../domain/ids.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import { findClaim, linkReceipt } from "../domain/proof.ts";
import type { ReceiptResult, VerificationReceiptRecord } from "../domain/types.ts";

export class ReceiptNotFoundError extends VoilaStateError {
  constructor(id: string) {
    super(`Receipt artifact not found: ${id}.`);
    this.name = "ReceiptNotFoundError";
  }
}

/** Per-stream cap on stored output, applied after ANSI stripping. */
export const OUTPUT_CAP_BYTES = 64 * 1024;
/** Per-stream cap on raw captured bytes, so a runaway command cannot exhaust memory. */
const RAW_CAPTURE_LIMIT = 1024 * 1024;

export const DEFAULT_TIMEOUT_MS = 300_000;
export const MAX_TIMEOUT_MS = 1_800_000;

/** Characters that only make sense to a shell. Their presence means the caller expected shell parsing. */
const SHELL_METACHARACTERS = /[|&;<>()$`\\"'\n\r*?[\]{}~!#]/;

// ANSI/VT sequences, written with explicit code points so the source stays free of control bytes.
const ESC = "\\u001B";
/** OSC: ESC ] ... terminated by BEL or ST. */
const OSC_PATTERN = new RegExp(`${ESC}\\][^\\u0007\\u001B]*(?:\\u0007|${ESC}\\\\)`, "g");
/** CSI: ESC [ parameters intermediates final. */
const CSI_PATTERN = new RegExp(`${ESC}\\[[0-9;:?]*[ -/]*[@-~]`, "g");
/** nF-class escapes such as character-set designation (ESC ( B). */
const NF_PATTERN = new RegExp(`${ESC}[ -/]+[0-~]`, "g");
/** Any remaining two-character escape sequence. */
const ESC_PATTERN = new RegExp(`${ESC}[@-Z\\\\-_]`, "g");

/**
 * Strip ANSI/VT control sequences (CSI, OSC, two-character escapes) and normalize carriage returns.
 * Applied before capping so stored output is plain text and its hash is stable.
 */
export function stripAnsi(text: string): string {
  return text
    .replace(OSC_PATTERN, "")
    .replace(CSI_PATTERN, "")
    .replace(NF_PATTERN, "")
    .replace(ESC_PATTERN, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
}

/** Marker substituted for the repository's absolute location in captured output. */
export const REPO_PATH_MARKER = "<repo>";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace machine-specific absolute path prefixes in captured output: the repository root becomes
 * `<repo>` and the home directory becomes `~`.
 *
 * Receipts are committed alongside the code, so a stack trace naming `/Users/<name>/...` would leak a
 * username and make the artifact non-portable. This is a narrow, deterministic prefix substitution —
 * the relative structure of every path is preserved, so the output remains readable evidence — and it
 * is recorded in the manifest as `pathsNormalized`. Nothing else about the command's output is
 * altered.
 *
 * The repository root is substituted first because it is usually nested inside the home directory.
 */
export function normalizeCapturedPaths(text: string, roots: string[], home: string): string {
  let out = text;
  // Longest first, so a nested root is replaced before its parent.
  const ordered = [...new Set(roots.filter((r) => r.length > 0))].sort(
    (a, b) => b.length - a.length,
  );
  for (const root of ordered) {
    out = out.replace(new RegExp(escapeRegExp(root), "g"), REPO_PATH_MARKER);
  }
  if (home.length > 0) {
    out = out.replace(new RegExp(escapeRegExp(home), "g"), "~");
  }
  return out;
}

export interface VerificationRequest {
  claimId: string;
  executable: string;
  args?: string[];
  /** Repository-relative working directory; defaults to the repository root. */
  cwdRef?: string;
  timeoutMs?: number;
}

export interface ReceiptManifest {
  receiptId: string;
  claimId: string;
  result: ReceiptResult;
  executable: string;
  args: string[];
  cwdRef: string;
  exitCode: number | null;
  signal: string | null;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  timeoutMs: number;
  repositoryFingerprint: string;
  /** Algorithm that produced this fingerprint. v1 receipts have no such field; the proof engine
   * recognizes them as v1 by absence. */
  fingerprintAlgorithm?: FingerprintAlgorithm;
  gitHead: string | null;
  stdoutSha256: string;
  stderrSha256: string;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  outputTruncated: boolean;
  /** Explicit note that no environment values or absolute paths are captured. */
  capturedEnvironment: "none";
  /** How machine-specific absolute prefixes were rewritten in the stored output. */
  pathsNormalized: string;
}

export interface RunVerificationResult {
  receipt: VerificationReceiptRecord;
  manifest: ReceiptManifest;
  /** True when the command itself passed. Recording a receipt succeeds either way. */
  passed: boolean;
}

/** Reject anything that implies shell parsing rather than a structured executable + argv. */
function validateCommand(request: VerificationRequest): { executable: string; args: string[] } {
  const executable = request.executable;
  if (typeof executable !== "string" || executable.trim().length === 0) {
    throw new ProjectOperationError(
      "A verification command requires an `executable`. Provide the program name and its arguments separately (structured argv), not one shell string.",
    );
  }
  if (/\s/.test(executable.trim()) || SHELL_METACHARACTERS.test(executable)) {
    throw new ProjectOperationError(
      `Refusing to run "${executable}" as a shell string. Voila executes a single program with an argument array and no shell, so pipes, redirection, chaining, quoting, and variable expansion are unavailable. Pass the program in \`executable\` and each argument separately in \`args\`.`,
    );
  }
  const rawArgs = request.args ?? [];
  if (!Array.isArray(rawArgs)) {
    throw new ProjectOperationError("`args` must be an array of strings.");
  }
  const args: string[] = [];
  for (const arg of rawArgs) {
    if (typeof arg !== "string") {
      throw new ProjectOperationError("`args` entries must be strings.");
    }
    args.push(arg);
  }
  return { executable: executable.trim(), args };
}

function boundedTimeout(requested?: number): number {
  if (requested === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(requested) || requested < 1000) {
    throw new ProjectOperationError(
      "`timeoutMs` must be an integer of at least 1000 milliseconds.",
    );
  }
  return Math.min(requested, MAX_TIMEOUT_MS);
}

interface CapturedStream {
  text: string;
  truncated: boolean;
}

/**
 * Turn raw captured bytes into stored text: strip ANSI, normalize machine-specific path prefixes,
 * then cap. Capping happens last so the stored bytes are exactly what the manifest hash covers.
 */
function finalizeStream(
  chunks: Buffer[],
  rawTruncated: boolean,
  paths: { roots: string[]; home: string },
): CapturedStream {
  const stripped = stripAnsi(Buffer.concat(chunks).toString("utf8"));
  const normalized = normalizeCapturedPaths(stripped, paths.roots, paths.home);
  const buf = Buffer.from(normalized, "utf8");
  if (buf.byteLength <= OUTPUT_CAP_BYTES) {
    return { text: normalized, truncated: rawTruncated };
  }
  return { text: buf.subarray(0, OUTPUT_CAP_BYTES).toString("utf8"), truncated: true };
}

export interface ExecutionOutcome {
  result: ReceiptResult;
  exitCode: number | null;
  signal: string | null;
  stdout: CapturedStream;
  stderr: CapturedStream;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
}

/**
 * Execute one command with no shell, bounded output and time. Never throws for a failing command —
 * failure is data (`failed`), as are `timed_out` and `error` (spawn failure).
 */
export async function executeVerification(
  absoluteCwd: string,
  executable: string,
  args: string[],
  timeoutMs: number,
  /** Absolute prefixes to normalize out of captured output (repository root and its realpath). */
  normalizeRoots: string[] = [],
): Promise<ExecutionOutcome> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();
  const paths = { roots: normalizeRoots, home: homedir() };

  return new Promise<ExecutionOutcome>((resolve) => {
    const child = spawn(executable, args, {
      cwd: absoluteCwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let outBytes = 0;
    let errBytes = 0;
    let outRawTruncated = false;
    let errRawTruncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Escalate if the child ignores SIGTERM, so a hung command cannot block forever.
      setTimeout(() => child.kill("SIGKILL"), 5000).unref?.();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (outBytes >= RAW_CAPTURE_LIMIT) {
        outRawTruncated = true;
        return;
      }
      out.push(chunk);
      outBytes += chunk.byteLength;
      if (outBytes > RAW_CAPTURE_LIMIT) outRawTruncated = true;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (errBytes >= RAW_CAPTURE_LIMIT) {
        errRawTruncated = true;
        return;
      }
      err.push(chunk);
      errBytes += chunk.byteLength;
      if (errBytes > RAW_CAPTURE_LIMIT) errRawTruncated = true;
    });

    function settle(result: ReceiptResult, exitCode: number | null, signal: string | null): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        result,
        exitCode,
        signal,
        stdout: finalizeStream(out, outRawTruncated, paths),
        stderr: finalizeStream(err, errRawTruncated, paths),
        startedAt,
        finishedAt: new Date().toISOString(),
        durationMs: Date.now() - startMs,
      });
    }

    child.on("error", (error) => {
      err.push(Buffer.from(`Voila could not start the command: ${error.message}\n`, "utf8"));
      settle("error", null, null);
    });

    child.on("close", (code, signal) => {
      if (timedOut) return settle("timed_out", code, signal ?? null);
      if (code === 0) return settle("passed", 0, null);
      if (code === null) return settle("error", null, signal ?? null);
      settle("failed", code, signal ?? null);
    });
  });
}

/**
 * Run a verification for a claim and record an immutable receipt.
 *
 * Success of this function means **the receipt was recorded**, not that verification passed: a failing
 * command produces a valid `failed` receipt.
 */
export async function runVerification(
  root: string,
  request: VerificationRequest,
): Promise<RunVerificationResult> {
  const { executable, args } = validateCommand(request);
  const timeoutMs = boundedTimeout(request.timeoutMs);

  const state = await loadState(root);
  // Fails loudly for an unknown claim before anything is executed.
  const claim = findClaim(state, request.claimId);

  const cwd = await resolveRepoRelativeDir(root, request.cwdRef);
  // Fingerprint BEFORE execution and before any receipt bytes exist, so the digest describes the
  // repository state the command actually observed.
  const fingerprint = await repositoryFingerprint(root);

  // Normalize both the given root and its realpath (they differ under symlinked temp dirs).
  const normalizeRoots = [resolve(root)];
  try {
    normalizeRoots.push(await realpath(resolve(root)));
  } catch {
    // unreadable root is impossible here (state loaded above); ignore defensively
  }

  const outcome = await executeVerification(
    cwd.absolutePath,
    executable,
    args,
    timeoutMs,
    normalizeRoots,
  );

  const { id: receiptId } = allocateId(state.sequences, "receipt");
  const paths = receiptPaths(root, receiptId);
  if (existsSync(paths.dir)) {
    throw new ProjectOperationError(
      `Receipt artifact ${receiptId} already exists; receipts are immutable and are never overwritten.`,
    );
  }

  const manifest: ReceiptManifest = {
    receiptId,
    claimId: claim.id,
    result: outcome.result,
    executable,
    args,
    cwdRef: cwd.relativePath,
    exitCode: outcome.exitCode,
    signal: outcome.signal,
    startedAt: outcome.startedAt,
    finishedAt: outcome.finishedAt,
    durationMs: outcome.durationMs,
    timeoutMs,
    repositoryFingerprint: fingerprint.value,
    fingerprintAlgorithm: fingerprint.algorithm,
    gitHead: fingerprint.gitHead ?? null,
    stdoutSha256: sha256(outcome.stdout.text),
    stderrSha256: sha256(outcome.stderr.text),
    stdoutTruncated: outcome.stdout.truncated,
    stderrTruncated: outcome.stderr.truncated,
    outputTruncated: outcome.stdout.truncated || outcome.stderr.truncated,
    capturedEnvironment: "none",
    pathsNormalized: `repository root -> ${REPO_PATH_MARKER}, home directory -> ~`,
  };

  // Build the COMPLETE artifact in a Voila-owned staging directory, then promote atomically.
  const tempRoot = statePaths(root).receiptsTempDir;
  await mkdir(tempRoot, { recursive: true });
  const staging = await mkdtemp(join(tempRoot, "rcp-"));
  try {
    await writeFile(join(staging, "stdout.txt"), outcome.stdout.text, "utf8");
    await writeFile(join(staging, "stderr.txt"), outcome.stderr.text, "utf8");
    await writeFile(
      join(staging, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    await mkdir(statePaths(root).receiptsDir, { recursive: true });
    await rename(staging, paths.dir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }

  const record: VerificationReceiptRecord = {
    id: receiptId,
    claimId: claim.id,
    result: outcome.result,
    artifactRef: paths.artifactRef,
    executable,
    args,
    cwdRef: cwd.relativePath,
    ...(outcome.exitCode !== null ? { exitCode: outcome.exitCode } : {}),
    startedAt: outcome.startedAt,
    finishedAt: outcome.finishedAt,
    repositoryFingerprint: fingerprint.value,
    fingerprintAlgorithm: fingerprint.algorithm,
    ...(fingerprint.gitHead ? { gitHead: fingerprint.gitHead } : {}),
    outputTruncated: manifest.outputTruncated,
  };

  // Link only after the complete artifact exists on disk.
  await updateState(root, (cur) => linkReceipt(cur, record, new Date().toISOString()), {
    type: "verification_recorded",
    id: receiptId,
    claimId: claim.id,
    result: outcome.result,
  });

  return { receipt: record, manifest, passed: outcome.result === "passed" };
}

/** Read a receipt manifest. Throws when the artifact is missing (never reconstructed). */
export async function readReceiptManifest(
  root: string,
  receiptId: string,
): Promise<ReceiptManifest> {
  const paths = receiptPaths(root, receiptId);
  if (!existsSync(paths.manifest)) throw new ReceiptNotFoundError(receiptId);
  return JSON.parse(await readFile(paths.manifest, "utf8")) as ReceiptManifest;
}

export interface ReceiptOutput {
  stdout: string;
  stderr: string;
}

/** Read stored receipt output. Deliberate inspection only — never rendered in a primary view. */
export async function readReceiptOutput(root: string, receiptId: string): Promise<ReceiptOutput> {
  const paths = receiptPaths(root, receiptId);
  if (!existsSync(paths.stdout) || !existsSync(paths.stderr)) {
    throw new ReceiptNotFoundError(receiptId);
  }
  return {
    stdout: await readFile(paths.stdout, "utf8"),
    stderr: await readFile(paths.stderr, "utf8"),
  };
}

/** Staging directories left behind by an interrupted run. Detectable and safely removable. */
export async function leftoverReceiptTempDirs(root: string): Promise<string[]> {
  const tempRoot = statePaths(root).receiptsTempDir;
  if (!existsSync(tempRoot)) return [];
  try {
    return (await readdir(tempRoot)).filter((e) => e.startsWith("rcp-")).sort();
  } catch {
    return [];
  }
}
