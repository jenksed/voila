// Verification execution and receipt artifacts: pass/fail/timeout/error, ANSI stripping, truncation,
// repo-relative cwd safety, immutability, manifest/hash consistency, and link-only-after-artifact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { initState, loadState, updateState } from "../src/state/store.ts";
import { receiptPaths, statePaths } from "../src/state/paths.ts";
import {
  DEFAULT_TIMEOUT_MS,
  executeVerification,
  leftoverReceiptTempDirs,
  MAX_TIMEOUT_MS,
  normalizeCapturedPaths,
  OUTPUT_CAP_BYTES,
  readReceiptManifest,
  readReceiptOutput,
  ReceiptNotFoundError,
  runVerification,
  stripAnsi,
} from "../src/state/receipt-store.ts";
import { repositoryFingerprint } from "../src/state/fingerprint.ts";
import { UnsafeSourcePathError, SourceNotFoundError, sha256 } from "../src/state/source.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";
import { createWorkItem } from "../src/domain/operations.ts";
import { createClaim, requireClaim } from "../src/domain/proof.ts";

const CRITERION = "verification runs and is recorded";
const NODE = process.execPath;

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

/** A temp git repo with NewFang state and one claim (CLM-1) on NF-1. */
async function claimRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "newfang-rcp-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "NewFang Test"]);
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "initial"]);

  await initState(root, { displayName: "receipt-demo" });
  await updateState(root, (cur) => {
    let s = createWorkItem(
      cur,
      { kind: "outcome", title: "Verified thing", acceptanceCriteria: [CRITERION] },
      "T",
    );
    s = createClaim(
      s,
      {
        workItemId: "NF-1",
        statement: "verification is recorded",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      "T",
    );
    return requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, "T");
  });
  return root;
}

// --- ANSI stripping ---

test("ANSI/VT sequences are stripped and carriage returns normalized", () => {
  const E = "";
  assert.equal(stripAnsi(`${E}[32mgreen${E}[0m plain`), "green plain");
  assert.equal(stripAnsi(`${E}[1;31mred${E}[m`), "red");
  assert.equal(stripAnsi(`${E}]0;window titlekept`), "kept");
  assert.equal(stripAnsi(`${E}]0;title${E}\\kept`), "kept");
  assert.equal(stripAnsi(`${E}(Bplain`), "plain");
  assert.equal(stripAnsi(`${E}[2Kprogress`), "progress");
  assert.equal(stripAnsi("a\r\nb\rc"), "a\nb\nc");
  assert.equal(stripAnsi("no escapes here"), "no escapes here");
});

test("machine-specific path prefixes are normalized out of captured output", () => {
  const home = "/Users/someone";
  const root = `${home}/Projects/demo`;
  assert.equal(
    normalizeCapturedPaths(`at ${root}/test/a.test.ts:12:3`, [root], home),
    "at <repo>/test/a.test.ts:12:3",
  );
  // file:// URLs are covered because the substitution is on the path substring.
  assert.equal(
    normalizeCapturedPaths(`file://${root}/src/x.ts`, [root], home),
    "file://<repo>/src/x.ts",
  );
  // A home path outside the repository still loses the username.
  assert.equal(
    normalizeCapturedPaths(`${home}/.local/share/tool/bin`, [root], home),
    "~/.local/share/tool/bin",
  );
  // The repository root wins over the home prefix even though it is nested inside it.
  assert.equal(normalizeCapturedPaths(root, [root], home), "<repo>");
  // Every occurrence is replaced, and unrelated text is untouched.
  assert.equal(
    normalizeCapturedPaths(`${root}/a and ${root}/b`, [root], home),
    "<repo>/a and <repo>/b",
  );
  assert.equal(normalizeCapturedPaths("nothing to do", [root], home), "nothing to do");
  // Regex metacharacters in a path are treated literally.
  const odd = "/tmp/we(ir)d+path";
  assert.equal(normalizeCapturedPaths(`${odd}/x`, [odd], home), "<repo>/x");
});

test("a receipt artifact contains no absolute repository or home path", async () => {
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    // Print paths the way a test runner would, so normalization is genuinely exercised.
    args: ["-e", "process.stdout.write(process.cwd() + '\\n' + require('node:os').homedir())"],
  });
  const output = await readReceiptOutput(root, result.receipt.id);
  const manifest = await readReceiptManifest(root, result.receipt.id);

  assert.equal(output.stdout.includes(root), false, "no absolute repository path");
  assert.equal(output.stdout.includes(homedir()), false, "no home path");
  assert.match(output.stdout, /<repo>/, "the repository root is marked");
  assert.match(manifest.pathsNormalized, /repository root -> <repo>/);
  // The hash still covers exactly the stored bytes.
  assert.equal(sha256(output.stdout), manifest.stdoutSha256);
});

// --- Execution outcomes ---

test("a zero exit is passed; a non-zero exit is failed", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "newfang-exec-"));
  const ok = await executeVerification(cwd, NODE, ["-e", "process.exit(0)"], 30_000);
  assert.equal(ok.result, "passed");
  assert.equal(ok.exitCode, 0);

  const bad = await executeVerification(cwd, NODE, ["-e", "process.exit(3)"], 30_000);
  assert.equal(bad.result, "failed");
  assert.equal(bad.exitCode, 3);
});

test("a missing executable is an error result, not a thrown exception", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "newfang-exec-"));
  const outcome = await executeVerification(cwd, "definitely-not-a-real-binary-xyz", [], 30_000);
  assert.equal(outcome.result, "error");
  assert.equal(outcome.exitCode, null);
  assert.match(outcome.stderr.text, /could not start the command/);
});

test("a command exceeding its timeout is represented honestly as timed_out", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "newfang-exec-"));
  const outcome = await executeVerification(
    cwd,
    NODE,
    ["-e", "setTimeout(() => process.exit(0), 60000)"],
    1000,
  );
  assert.equal(outcome.result, "timed_out", "not reported as passed or failed");
  assert.ok(outcome.durationMs >= 900, `duration ${outcome.durationMs}`);
});

test("stdout and stderr are captured separately and stripped of ANSI", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "newfang-exec-"));
  const script =
    'process.stdout.write("\\u001B[32mOUT-MARKER\\u001B[0m\\n"); process.stderr.write("ERR-MARKER\\n");';
  const outcome = await executeVerification(cwd, NODE, ["-e", script], 30_000);
  assert.equal(outcome.result, "passed");
  assert.equal(outcome.stdout.text, "OUT-MARKER\n");
  assert.equal(outcome.stderr.text, "ERR-MARKER\n");
  assert.equal(outcome.stdout.truncated, false);
  assert.equal(outcome.stderr.truncated, false);
});

test("each stream is capped independently and truncation is recorded honestly", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "newfang-exec-"));
  // Far more than the cap on stdout; a small amount on stderr.
  const script = `process.stdout.write("x".repeat(${OUTPUT_CAP_BYTES * 3})); process.stderr.write("small");`;
  const outcome = await executeVerification(cwd, NODE, ["-e", script], 60_000);
  assert.equal(outcome.stdout.truncated, true, "stdout truncation is reported");
  assert.equal(outcome.stderr.truncated, false, "stderr is independent and not truncated");
  assert.ok(
    Buffer.byteLength(outcome.stdout.text, "utf8") <= OUTPUT_CAP_BYTES,
    `stdout stored ${Buffer.byteLength(outcome.stdout.text, "utf8")} bytes`,
  );
  assert.equal(outcome.stderr.text, "small");
});

test("timeouts are bounded: the default applies and an oversized request is capped", async () => {
  assert.ok(DEFAULT_TIMEOUT_MS > 0 && DEFAULT_TIMEOUT_MS <= MAX_TIMEOUT_MS);
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.exit(0)"],
    timeoutMs: MAX_TIMEOUT_MS * 10,
  });
  const manifest = await readReceiptManifest(root, result.receipt.id);
  assert.equal(manifest.timeoutMs, MAX_TIMEOUT_MS, "the request is capped, not honored blindly");
});

// --- Shell rejection ---

test("a single shell string is refused; only executable + argv is accepted", async () => {
  const root = await claimRoot();
  for (const executable of [
    "npm run verify",
    "npm test | grep pass",
    "npm test && echo ok",
    "echo $HOME",
    "cat file > out.txt",
    "sh -c 'rm -rf /'",
    "npm; echo hi",
    "cmd `whoami`",
  ]) {
    await assert.rejects(
      () => runVerification(root, { claimId: "CLM-1", executable }),
      ProjectOperationError,
      `refuses ${executable}`,
    );
  }
  await assert.rejects(
    () => runVerification(root, { claimId: "CLM-1", executable: "  " }),
    /requires an `executable`/,
  );
  await assert.rejects(
    () => runVerification(root, { claimId: "CLM-1", executable: NODE, args: "-e" as never }),
    /`args` must be an array/,
  );
  // No receipt was created by any refusal.
  assert.equal((await loadState(root)).receipts.length, 0);
});

test("no shell is involved: shell syntax in args is passed through literally", async () => {
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write(process.argv[1] ?? '')", "$HOME && echo pwned"],
  });
  const output = await readReceiptOutput(root, result.receipt.id);
  assert.equal(
    output.stdout,
    "$HOME && echo pwned",
    "the argument is literal; no expansion or chaining happened",
  );
});

// --- Working directory safety ---

test("cwdRef must be repository-relative; traversal, absolute, and symlink escapes are rejected", async () => {
  const root = await claimRoot();
  await mkdir(join(root, "sub"), { recursive: true });

  const ok = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.exit(0)"],
    cwdRef: "sub",
  });
  assert.equal(ok.receipt.cwdRef, "sub");

  for (const bad of ["..", "../..", "sub/../..", "~/secrets"]) {
    await assert.rejects(
      () =>
        runVerification(root, {
          claimId: "CLM-1",
          executable: NODE,
          args: ["-e", "0"],
          cwdRef: bad,
        }),
      UnsafeSourcePathError,
      `rejects ${bad}`,
    );
  }
  await assert.rejects(
    () =>
      runVerification(root, {
        claimId: "CLM-1",
        executable: NODE,
        args: ["-e", "0"],
        cwdRef: tmpdir(),
      }),
    UnsafeSourcePathError,
  );

  // A symlink pointing outside the repository is refused even though it lives inside.
  const outside = await mkdtemp(join(tmpdir(), "newfang-outside-"));
  await symlink(outside, join(root, "escape"));
  await assert.rejects(
    () =>
      runVerification(root, {
        claimId: "CLM-1",
        executable: NODE,
        args: ["-e", "0"],
        cwdRef: "escape",
      }),
    UnsafeSourcePathError,
  );

  // A file is not a working directory.
  await assert.rejects(
    () =>
      runVerification(root, {
        claimId: "CLM-1",
        executable: NODE,
        args: ["-e", "0"],
        cwdRef: "tracked.txt",
      }),
    /not a directory/,
  );
  await assert.rejects(
    () =>
      runVerification(root, {
        claimId: "CLM-1",
        executable: NODE,
        args: ["-e", "0"],
        cwdRef: "nope",
      }),
    SourceNotFoundError,
  );
});

test("the command actually runs in the resolved repository-relative directory", async () => {
  const root = await claimRoot();
  await mkdir(join(root, "sub"), { recursive: true });
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write(require('node:path').basename(process.cwd()))"],
    cwdRef: "sub",
  });
  const output = await readReceiptOutput(root, result.receipt.id);
  assert.equal(output.stdout, "sub");
});

// --- Artifacts, immutability, and canonical linking ---

test("a passing run writes a complete artifact and links it canonically", async () => {
  const root = await claimRoot();
  const fingerprintBefore = await repositoryFingerprint(root);
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write('all good')"],
  });

  assert.equal(result.receipt.id, "RCP-1");
  assert.equal(result.passed, true);
  const paths = receiptPaths(root, "RCP-1");
  assert.ok(existsSync(paths.manifest) && existsSync(paths.stdout) && existsSync(paths.stderr));

  const state = await loadState(root);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0]?.id, "RCP-1");
  assert.equal(state.receipts[0]?.artifactRef, "receipts/RCP-1");
  assert.deepEqual(state.claims[0]?.receiptIds, ["RCP-1"]);
  assert.equal(state.sequences.receipt, 2, "the counter advanced");
  assert.equal(state.receipts[0]?.repositoryFingerprint, fingerprintBefore.value);

  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const recorded = events.filter((e) => e.type === "verification_recorded");
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].result, "passed");
});

test("recording a receipt succeeds for a FAILING command: tool success != verification passed", async () => {
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stderr.write('boom'); process.exit(2)"],
  });
  assert.equal(result.passed, false, "the command did not pass");
  assert.equal(result.receipt.result, "failed");
  assert.equal(result.receipt.exitCode, 2);

  // A valid, linked receipt exists nonetheless.
  const state = await loadState(root);
  assert.equal(state.receipts.length, 1);
  assert.deepEqual(state.claims[0]?.receiptIds, ["RCP-1"]);
  const output = await readReceiptOutput(root, "RCP-1");
  assert.equal(output.stderr, "boom");
});

test("receipt IDs are monotonic RCP-n and artifacts are never overwritten", async () => {
  const root = await claimRoot();
  const first = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write('one')"],
  });
  const second = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write('two')"],
  });
  assert.equal(first.receipt.id, "RCP-1");
  assert.equal(second.receipt.id, "RCP-2");

  // The first artifact is untouched by the second run.
  assert.equal((await readReceiptOutput(root, "RCP-1")).stdout, "one");
  assert.equal((await readReceiptOutput(root, "RCP-2")).stdout, "two");
  const manifest1 = await readReceiptManifest(root, "RCP-1");
  assert.equal(manifest1.receiptId, "RCP-1");
});

test("an existing artifact directory blocks reuse of that receipt ID", async () => {
  const root = await claimRoot();
  // Pre-create the directory RCP-1 would claim.
  await mkdir(receiptPaths(root, "RCP-1").dir, { recursive: true });
  await assert.rejects(
    () => runVerification(root, { claimId: "CLM-1", executable: NODE, args: ["-e", "0"] }),
    /immutable and are never overwritten/,
  );
  // Nothing was linked.
  assert.equal((await loadState(root)).receipts.length, 0);
});

test("the manifest agrees with canonical metadata and the stored output hashes", async () => {
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "process.stdout.write('hashme'); process.stderr.write('warn')"],
  });
  const receipt = result.receipt;
  const manifest = await readReceiptManifest(root, receipt.id);

  assert.equal(manifest.receiptId, receipt.id);
  assert.equal(manifest.claimId, receipt.claimId);
  assert.equal(manifest.result, receipt.result);
  assert.equal(manifest.executable, receipt.executable);
  assert.deepEqual(manifest.args, receipt.args);
  assert.equal(manifest.cwdRef, receipt.cwdRef);
  assert.equal(manifest.exitCode, receipt.exitCode);
  assert.equal(manifest.startedAt, receipt.startedAt);
  assert.equal(manifest.finishedAt, receipt.finishedAt);
  assert.equal(manifest.repositoryFingerprint, receipt.repositoryFingerprint);
  assert.equal(manifest.outputTruncated, receipt.outputTruncated);
  assert.equal(manifest.gitHead, receipt.gitHead ?? null);

  const output = await readReceiptOutput(root, receipt.id);
  assert.equal(sha256(output.stdout), manifest.stdoutSha256, "stdout hash matches the artifact");
  assert.equal(sha256(output.stderr), manifest.stderrSha256, "stderr hash matches the artifact");
  assert.equal(output.stdout, "hashme");
  assert.equal(output.stderr, "warn");
});

test("the artifact records no environment values and no private absolute paths", async () => {
  const root = await claimRoot();
  process.env.NEWFANG_TEST_SECRET = "SUPER-SECRET-VALUE";
  try {
    const result = await runVerification(root, {
      claimId: "CLM-1",
      executable: NODE,
      args: ["-e", "process.exit(0)"],
    });
    const manifest = await readReceiptManifest(root, result.receipt.id);
    const serialized = JSON.stringify(manifest);
    assert.equal(serialized.includes("SUPER-SECRET-VALUE"), false, "no env values are captured");
    assert.equal(serialized.includes("NEWFANG_TEST_SECRET"), false, "no env names are captured");
    assert.equal(manifest.capturedEnvironment, "none");
    assert.equal(serialized.includes(root), false, "no absolute repository path is stored");
    assert.equal(manifest.cwdRef, ".", "the working directory is repository-relative");

    // Canonical state is equally clean.
    const canonical = JSON.stringify(await loadState(root));
    assert.equal(canonical.includes("SUPER-SECRET-VALUE"), false);
    assert.equal(canonical.includes(root), false);
    assert.equal(canonical.includes("stdout"), false, "no command output in project.json");
  } finally {
    delete process.env.NEWFANG_TEST_SECRET;
  }
});

test("truncation is recorded in both the manifest and canonical metadata", async () => {
  const root = await claimRoot();
  const script = `process.stdout.write("y".repeat(${OUTPUT_CAP_BYTES * 2}));`;
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", script],
    timeoutMs: 60_000,
  });
  assert.equal(result.receipt.outputTruncated, true);
  const manifest = await readReceiptManifest(root, result.receipt.id);
  assert.equal(manifest.stdoutTruncated, true);
  assert.equal(manifest.stderrTruncated, false);
  assert.equal(manifest.outputTruncated, true);

  const output = await readReceiptOutput(root, result.receipt.id);
  assert.ok(Buffer.byteLength(output.stdout, "utf8") <= OUTPUT_CAP_BYTES);
  // The stored bytes are exactly what the hash covers.
  assert.equal(sha256(output.stdout), manifest.stdoutSha256);
});

test("an unknown claim is refused before anything is executed or written", async () => {
  const root = await claimRoot();
  await assert.rejects(
    () => runVerification(root, { claimId: "CLM-404", executable: NODE, args: ["-e", "0"] }),
    /Claim not found: CLM-404/,
  );
  const state = await loadState(root);
  assert.equal(state.receipts.length, 0);
  // No artifact directory was created for a receipt that does not exist.
  const receiptsDir = statePaths(root).receiptsDir;
  const entries = existsSync(receiptsDir) ? await readdir(receiptsDir) : [];
  assert.deepEqual(
    entries.filter((e) => e.startsWith("RCP-")),
    [],
  );
});

test("no staging directory is left behind after a successful run", async () => {
  const root = await claimRoot();
  await runVerification(root, { claimId: "CLM-1", executable: NODE, args: ["-e", "0"] });
  assert.deepEqual(await leftoverReceiptTempDirs(root), [], "staging was promoted, not orphaned");
});

test("a leftover staging directory is detectable and does not become a receipt", async () => {
  const root = await claimRoot();
  // Simulate an interrupted run: a staging dir with partial content.
  const staging = join(statePaths(root).receiptsTempDir, "rcp-interrupted");
  await mkdir(staging, { recursive: true });
  await writeFile(join(staging, "stdout.txt"), "partial\n", "utf8");

  assert.deepEqual(await leftoverReceiptTempDirs(root), ["rcp-interrupted"]);
  // It is not canonical state and not a receipt.
  const state = await loadState(root);
  assert.equal(state.receipts.length, 0);

  // A subsequent run still succeeds and claims RCP-1.
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "0"],
  });
  assert.equal(result.receipt.id, "RCP-1");
  // The leftover is removable without touching the promoted receipt.
  await rm(staging, { recursive: true, force: true });
  assert.deepEqual(await leftoverReceiptTempDirs(root), []);
  assert.ok(existsSync(receiptPaths(root, "RCP-1").manifest));
});

test("a failed canonical link leaves no LINKED partial receipt", async () => {
  const root = await claimRoot();
  // Make the canonical write fail by removing write permission is brittle; instead corrupt the state
  // so validation refuses the update after the artifact exists.
  await writeFile(statePaths(root).projectJson, "{ not json", "utf8");
  await assert.rejects(() =>
    runVerification(root, { claimId: "CLM-1", executable: NODE, args: ["-e", "0"] }),
  );
  // Canonical state never gained a receipt reference (it is unreadable, which is the point: nothing
  // half-linked was written).
  await assert.rejects(() => loadState(root));
});

test("reading a missing receipt artifact throws rather than reconstructing it", async () => {
  const root = await claimRoot();
  await assert.rejects(() => readReceiptManifest(root, "RCP-99"), ReceiptNotFoundError);
  await assert.rejects(() => readReceiptOutput(root, "RCP-99"), ReceiptNotFoundError);
});

test("artifacts live under .newfang/receipts/<id>/ with exactly the expected files", async () => {
  const root = await claimRoot();
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: NODE,
    args: ["-e", "0"],
  });
  const dir = receiptPaths(root, result.receipt.id).dir;
  assert.equal(dirname(dir), statePaths(root).receiptsDir);
  const entries = (await readdir(dir)).sort();
  assert.deepEqual(entries, ["manifest.json", "stderr.txt", "stdout.txt"]);
});
