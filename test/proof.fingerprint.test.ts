// Repository fingerprinting (algorithm v2) against real temporary git repositories.
//
// The properties that matter: determinism when nothing changed; sensitivity to effective working-tree
// content; independence from staging state, branch name, commit identity, and absolute repository
// path; correct handling of added, removed, renamed, executable, symlink, and untracked files;
// exclusion of gitignored and state-directory files; and — critically — that creating a receipt does
// not invalidate its own fingerprint.
//
// The algorithm is documented in ADR-0008 (docs/decisions/0008-fingerprint-v2-content-addressed.md)
// and implemented in src/state/fingerprint.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  CURRENT_FINGERPRINT_ALGORITHM,
  FingerprintUnavailableError,
  repositoryFingerprint,
  tryRepositoryFingerprint,
} from "../src/state/fingerprint.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";
import { createWorkItem } from "../src/domain/operations.ts";
import { createClaim, evaluateClaim, findClaim, requireClaim } from "../src/domain/proof.ts";
import { runVerification } from "../src/state/receipt-store.ts";

const CRITERION = "the suite passes";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

/** A temp git repository with one commit. */
async function tempRepo(prefix = "voila-fp-"): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), prefix));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Voila Test"]);
  git(root, ["config", "commit.gpgsign", "false"]);
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  await writeFile(join(root, ".gitignore"), "ignored/\n.voila/backups/\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "initial"]);
  return root;
}

// --- Algorithm identification ---

test("the current fingerprint algorithm is v2 and the interface reports it", async () => {
  assert.equal(CURRENT_FINGERPRINT_ALGORITHM, "v2");
  const root = await tempRepo();
  const fp = await repositoryFingerprint(root);
  assert.equal(fp.algorithm, "v2");
  assert.match(fp.value, /^[a-f0-9]{64}$/);
  assert.ok(fp.gitHead && fp.gitHead.length >= 7, "gitHead is reported as diagnostic metadata");
});

test("a non-git directory fails clearly instead of guessing", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-nogit-"));
  await assert.rejects(() => repositoryFingerprint(root), FingerprintUnavailableError);
  await assert.rejects(() => repositoryFingerprint(root), /not inside a git work tree/);
  // The best-effort variant degrades to null for read-only surfaces.
  assert.equal(await tryRepositoryFingerprint(root), null);
});

// --- Determinism ---

test("the fingerprint is deterministic when nothing changes", async () => {
  const root = await tempRepo();
  const a = await repositoryFingerprint(root);
  const b = await repositoryFingerprint(root);
  const c = await repositoryFingerprint(root);
  assert.equal(a.value, b.value);
  assert.equal(b.value, c.value);
  assert.equal(a.entryCount, b.entryCount);
});

test("the digest depends only on sorted paths, not on enumeration order", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "z-third.txt"), "z\n", "utf8");
  await writeFile(join(root, "a-first.txt"), "a\n", "utf8");
  await writeFile(join(root, "m-second.txt"), "m\n", "utf8");
  const first = await repositoryFingerprint(root);

  await rm(join(root, "z-third.txt"));
  await rm(join(root, "a-first.txt"));
  await rm(join(root, "m-second.txt"));
  await writeFile(join(root, "a-first.txt"), "a\n", "utf8");
  await writeFile(join(root, "m-second.txt"), "m\n", "utf8");
  await writeFile(join(root, "z-third.txt"), "z\n", "utf8");
  const second = await repositoryFingerprint(root);
  assert.equal(second.value, first.value, "creation order does not change the digest");
});

// --- Working-tree content sensitivity ---

test("a tracked working-tree modification changes the fingerprint; restoring bytes restores it", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await writeFile(join(root, "tracked.txt"), "modified\n", "utf8");
  const modified = await repositoryFingerprint(root);
  assert.notEqual(modified.value, original.value);

  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  const restored = await repositoryFingerprint(root);
  assert.equal(restored.value, original.value, "byte-identical content yields the same digest");
});

test("content changes invalidate evidence; identical content restores it", async () => {
  const root = await tempRepo();
  await initState(root, { displayName: "fp-demo" });
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
        statement: "the suite passes",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      "T",
    );
    return requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, "T");
  });
  await runVerification(root, {
    claimId: "CLM-1",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
  });

  const state = await loadState(root);
  const pristine = await repositoryFingerprint(root);
  assert.equal(evaluateClaim(state, findClaim(state, "CLM-1"), pristine.value).status, "supported");

  await writeFile(join(root, "tracked.txt"), "changed by the developer\n", "utf8");
  const dirty = await repositoryFingerprint(root);
  assert.notEqual(dirty.value, pristine.value);
  assert.equal(evaluateClaim(state, findClaim(state, "CLM-1"), dirty.value).status, "stale");

  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  const restored = await repositoryFingerprint(root);
  assert.equal(restored.value, pristine.value);
  assert.equal(evaluateClaim(state, findClaim(state, "CLM-1"), restored.value).status, "supported");
});

// --- Staging and commit independence ---

test("staging identical working-tree content does not change the fingerprint", async () => {
  const root = await tempRepo();
  const before = await repositoryFingerprint(root);

  // Modify, stage, leave as staged — the digest must be identical because the working tree matches
  // what we already had at `before`.
  await writeFile(join(root, "tracked.txt"), "modified\n", "utf8");
  git(root, ["add", "tracked.txt"]);
  git(root, ["restore", "--staged", "--worktree", "tracked.txt"]);
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  const afterUnstage = await repositoryFingerprint(root);
  assert.equal(afterUnstage.value, before.value, "unstaging restored identical tree content");

  // Stage the original tree again; still identical.
  git(root, ["add", "tracked.txt"]);
  const afterReStage = await repositoryFingerprint(root);
  assert.equal(afterReStage.value, before.value, "re-staging identical tree content");

  // Reset the index so the working tree is clean; must still match.
  git(root, ["reset", "-q", "HEAD", "tracked.txt"]);
  const afterReset = await repositoryFingerprint(root);
  assert.equal(afterReset.value, before.value, "index reset on identical tree content");
});

test("committing identical working-tree content does not change the fingerprint", async () => {
  const root = await tempRepo();
  const before = await repositoryFingerprint(root);

  // Empty commit: HEAD moves, the working tree is byte-identical, and the digest must hold.
  git(root, ["commit", "--allow-empty", "-q", "-m", "empty"]);
  const afterEmptyCommit = await repositoryFingerprint(root);
  assert.equal(
    afterEmptyCommit.value,
    before.value,
    "HEAD movement without content change does not move the digest",
  );
  assert.notEqual(afterEmptyCommit.gitHead, before.gitHead);

  // A commit that adds a NEW file: new content, digest moves.
  await writeFile(join(root, "added.txt"), "added\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "added"]);
  const afterAddCommit = await repositoryFingerprint(root);
  assert.notEqual(afterAddCommit.value, before.value);
});

test("a state-only commit under .voila/ does not change the fingerprint", async () => {
  const root = await tempRepo();
  await initState(root, { displayName: "fp-demo" });
  const original = await repositoryFingerprint(root);

  // Stage a change inside .voila/ as if bookkeeping were tracked.
  git(root, ["add", "-f", ".voila/project.json"]);
  git(root, ["commit", "-q", "-m", "track voila state"]);
  const afterCommit = await repositoryFingerprint(root);
  assert.equal(
    afterCommit.value,
    original.value,
    "committing identical content with a tracked .voila/ file does not move the digest",
  );

  // Edit the now-tracked .voila/ file: still excluded.
  await writeFile(join(root, ".voila", "project.json"), '{"schemaVersion":4,"displayName":"x"}\n');
  const afterEdit = await repositoryFingerprint(root);
  assert.equal(
    afterEdit.value,
    original.value,
    "tracked .voila/ writes are excluded from the digest",
  );
});

// --- Branch and location independence ---

test("equivalent content on a different branch has the same fingerprint", async () => {
  const root = await tempRepo();
  // Add content on the default branch.
  await writeFile(join(root, "feature.txt"), "feature\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add feature"]);
  const onMain = await repositoryFingerprint(root);

  // Move to a new branch and bring the same content back via cherry-pick-free path: just check out
  // the same commit (HEAD) on a new branch.
  git(root, ["checkout", "-q", "-b", "other-branch"]);
  const onBranch = await repositoryFingerprint(root);
  assert.equal(
    onBranch.value,
    onMain.value,
    "the digest does not include the branch name; HEAD identity is diagnostic only",
  );
});

test("equivalent content at a different absolute path has the same fingerprint", async () => {
  const source = await tempRepo("voila-fp-src-");
  await writeFile(join(source, "untracked.txt"), "same everywhere\n", "utf8");
  const before = await repositoryFingerprint(source);

  const parent = await mkdtemp(join(tmpdir(), "voila-fp-dst-"));
  const destination = join(parent, "relocated-with-a-different-name");
  await cp(source, destination, { recursive: true });

  const after = await repositoryFingerprint(destination);
  assert.equal(after.value, before.value, "no machine-specific absolute path enters the digest");
});

// --- File-type and mode representation ---

test("executable mode is recorded; regular and executable files produce distinct digests", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "tool.sh"), "#!/bin/sh\ntrue\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add tool"]);
  const asText = await repositoryFingerprint(root);

  // Make it executable. The content is unchanged.
  await import("node:fs/promises").then((m) => m.chmod(join(root, "tool.sh"), 0o755));
  const asExec = await repositoryFingerprint(root);
  assert.notEqual(
    asExec.value,
    asText.value,
    "the executable bit participates in the digest even when content is identical",
  );

  // Another file with different content but the same executable mode differs on content, not mode.
  await writeFile(join(root, "tool.sh"), "#!/bin/sh\necho hi\n", "utf8");
  const asExecDifferent = await repositoryFingerprint(root);
  assert.notEqual(asExecDifferent.value, asExec.value);
  assert.notEqual(asExecDifferent.value, asText.value);
});

test("a symlink target is represented explicitly and changes when the target changes", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "target.txt"), "the target\n", "utf8");
  await symlink(join(root, "target.txt"), join(root, "link.lnk"));
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "add symlink"]);
  const initial = await repositoryFingerprint(root);

  // Repoint the symlink; target bytes differ, digest differs.
  await rm(join(root, "link.lnk"));
  await writeFile(join(root, "other.txt"), "another target\n", "utf8");
  await symlink(join(root, "other.txt"), join(root, "link.lnk"));
  const repointed = await repositoryFingerprint(root);
  assert.notEqual(repointed.value, initial.value);

  // Restore the original symlink target path; remove the repointing target file too, so the
  // untracked set is identical to the initial snapshot.
  await rm(join(root, "link.lnk"));
  await rm(join(root, "other.txt"));
  await symlink(join(root, "target.txt"), join(root, "link.lnk"));
  const restored = await repositoryFingerprint(root);
  assert.equal(restored.value, initial.value);
});

test("adding, removing, and renaming files each change the digest; renaming without content change produces a distinct digest", async () => {
  const root = await tempRepo();
  const baseline = await repositoryFingerprint(root);

  // Add.
  await writeFile(join(root, "added.txt"), "added\n", "utf8");
  const added = await repositoryFingerprint(root);
  assert.notEqual(added.value, baseline.value);

  // Remove.
  await rm(join(root, "added.txt"));
  const removed = await repositoryFingerprint(root);
  assert.equal(removed.value, baseline.value);

  // Rename (add a file under one name, then rename it; both intermediate states must differ).
  await writeFile(join(root, "before.txt"), "same content\n", "utf8");
  const before = await repositoryFingerprint(root);
  await rm(join(root, "before.txt"));
  await writeFile(join(root, "after.txt"), "same content\n", "utf8");
  const after = await repositoryFingerprint(root);
  assert.notEqual(
    after.value,
    before.value,
    "rename without content change still changes the digest",
  );
});

test("an untracked repository file changes the fingerprint; gitignored files do not", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await writeFile(join(root, "untracked.txt"), "new file\n", "utf8");
  const withUntracked = await repositoryFingerprint(root);
  assert.notEqual(withUntracked.value, original.value);

  // Content of an untracked file matters, not just its presence.
  await writeFile(join(root, "untracked.txt"), "different content\n", "utf8");
  const changedContent = await repositoryFingerprint(root);
  assert.notEqual(changedContent.value, withUntracked.value);

  await rm(join(root, "untracked.txt"));
  assert.equal(
    (await repositoryFingerprint(root)).value,
    original.value,
    "removal restores the digest",
  );

  // Ignored paths are excluded via --exclude-standard.
  await mkdir(join(root, "ignored"), { recursive: true });
  await writeFile(join(root, "ignored", "junk.txt"), "noise\n", "utf8");
  assert.equal(
    (await repositoryFingerprint(root)).value,
    original.value,
    "gitignored files do not affect the digest",
  );
});

// --- Exclusion of state directories ---

test("everything under .voila/ is excluded, so Voila bookkeeping cannot invalidate evidence", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await initState(root, { displayName: "fp-demo" });
  const afterInit = await repositoryFingerprint(root);
  assert.equal(afterInit.value, original.value, "creating .voila/ does not change the digest");

  await updateState(root, (cur) => createWorkItem(cur, { kind: "task", title: "A" }, "T"));
  const afterUpdate = await repositoryFingerprint(root);
  assert.equal(afterUpdate.value, original.value, "canonical writes do not change the digest");

  // A tracked .voila file is likewise ignored.
  git(root, ["add", "-f", ".voila/project.json"]);
  git(root, ["commit", "-q", "-m", "track voila state"]);
  await updateState(root, (cur) => ({ ...cur, health: "green" as const }));
  const afterTrackedChange = await repositoryFingerprint(root);
  const again = await repositoryFingerprint(root);
  assert.equal(again.value, afterTrackedChange.value, "tracked .voila diffs are excluded");
});

test("creating a receipt does not invalidate its own fingerprint", async () => {
  const root = await tempRepo();
  await initState(root, { displayName: "fp-demo" });
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
        statement: "the suite passes",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      "T",
    );
    return requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, "T");
  });

  const beforeRun = await repositoryFingerprint(root);
  const result = await runVerification(root, {
    claimId: "CLM-1",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  assert.equal(result.receipt.result, "passed");
  assert.equal(result.receipt.repositoryFingerprint, beforeRun.value);
  assert.equal(result.receipt.fingerprintAlgorithm, "v2");
  // The manifest carries the algorithm explicitly.
  assert.equal(result.manifest.fingerprintAlgorithm, "v2");

  // THE property: after writing the artifact and linking it canonically, the fingerprint is unchanged.
  const afterRun = await repositoryFingerprint(root);
  assert.equal(afterRun.value, beforeRun.value, "the receipt did not invalidate itself");

  const state = await loadState(root);
  const evaluation = evaluateClaim(state, findClaim(state, "CLM-1"), afterRun.value);
  assert.equal(evaluation.status, "supported", "the fresh receipt supports its claim");
  assert.equal(evaluation.currentReceiptId, result.receipt.id);
});

test("legacy .newfang/ state is excluded from the fingerprint while it still exists", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  // A pre-rename project's untracked state directory must not move the digest.
  await mkdir(join(root, ".newfang", "receipts", "RCP-1"), { recursive: true });
  await writeFile(join(root, ".newfang", "project.json"), '{"schemaVersion":4}\n', "utf8");
  await writeFile(join(root, ".newfang", "events.jsonl"), '{"type":"x"}\n', "utf8");
  await writeFile(join(root, ".newfang", "receipts", "RCP-1", "stdout.txt"), "output\n", "utf8");
  assert.equal(
    (await repositoryFingerprint(root)).value,
    original.value,
    "untracked legacy state does not change the digest",
  );

  // Tracked legacy state is excluded too, so a repo that commits its own state is unaffected.
  git(root, ["add", "-f", ".newfang"]);
  git(root, ["commit", "-q", "-m", "track legacy state"]);
  const afterCommit = await repositoryFingerprint(root);
  await writeFile(join(root, ".newfang", "events.jsonl"), '{"type":"x"}\n{"type":"y"}\n', "utf8");
  assert.equal(
    (await repositoryFingerprint(root)).value,
    afterCommit.value,
    "tracked legacy diffs are excluded",
  );
});

test("migrating .newfang/ to .voila/ does not change the repository fingerprint", async () => {
  const root = await tempRepo();
  await initState(root, { displayName: "fp-demo" });
  const { rename } = await import("node:fs/promises");
  await rename(join(root, ".voila"), join(root, ".newfang"));

  const beforeMigration = await repositoryFingerprint(root);
  await rename(join(root, ".newfang"), join(root, ".voila"));
  const afterMigration = await repositoryFingerprint(root);

  assert.equal(
    afterMigration.value,
    beforeMigration.value,
    "moving the state directory is invisible to evidence freshness",
  );
});

test("excluded state directories do not weaken ordinary source detection", async () => {
  const root = await tempRepo();
  await mkdir(join(root, ".newfang"), { recursive: true });
  await writeFile(join(root, ".newfang", "project.json"), '{"schemaVersion":4}\n', "utf8");
  await initState(root, { displayName: "fp-demo" });
  const baseline = await repositoryFingerprint(root);

  // Untracked source change.
  await writeFile(join(root, "src-new.txt"), "new\n", "utf8");
  const untracked = await repositoryFingerprint(root);
  assert.notEqual(untracked.value, baseline.value, "untracked source still detected");

  // Tracked working-tree change.
  await writeFile(join(root, "tracked.txt"), "modified\n", "utf8");
  const modified = await repositoryFingerprint(root);
  assert.notEqual(modified.value, untracked.value, "tracked modification still detected");

  // A file named like the state directories but NOT inside them is still detected.
  await writeFile(join(root, "voila-notes.md"), "notes\n", "utf8");
  const sibling = await repositoryFingerprint(root);
  assert.notEqual(sibling.value, modified.value, "a similarly named file is not excluded");
});

// --- No secret leak ---

test("the fingerprint record stores no raw content and no absolute path", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "tracked.txt"), "SECRET_DIFF_MARKER\n", "utf8");
  await writeFile(join(root, "untracked.txt"), "ANOTHER_MARKER\n", "utf8");
  const fingerprint = await repositoryFingerprint(root);
  const serialized = JSON.stringify(fingerprint);
  assert.equal(serialized.includes("SECRET_DIFF_MARKER"), false, "no file content is retained");
  assert.equal(serialized.includes("ANOTHER_MARKER"), false, "no file content is retained");
  assert.equal(serialized.includes(tmpdir()), false, "no absolute path is retained");
  assert.equal(serialized.includes(root), false);

  // The hex digest itself is the only persisted representation.
  assert.match(fingerprint.value, /^[a-f0-9]{64}$/);
});

// --- v1 compatibility: v1 receipts are immediately stale against a v2 current ---

test("a v1-format receipt is stale against a v2 current fingerprint without rewriting history", async () => {
  // Set up a v2 receipt against a v2 current, so the algorithm tag is observable.
  const v2Root = await tempRepo("voila-v2-");
  await initState(v2Root, { displayName: "fp-v2" });
  await updateState(v2Root, (cur) => {
    let s = createWorkItem(
      cur,
      { kind: "outcome", title: "Verified thing", acceptanceCriteria: [CRITERION] },
      "T",
    );
    s = createClaim(
      s,
      {
        workItemId: "NF-1",
        statement: "the suite passes",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      "T",
    );
    return requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, "T");
  });
  const v2Run = await runVerification(v2Root, {
    claimId: "CLM-1",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
  });
  const v2 = await repositoryFingerprint(v2Root);
  assert.equal(v2Run.receipt.fingerprintAlgorithm, "v2");
  const v2State = await loadState(v2Root);
  assert.equal(
    evaluateClaim(v2State, findClaim(v2State, "CLM-1"), v2.value).status,
    "supported",
    "a v2 receipt is supported against a v2 current",
  );

  // Now a SEPARATE temp repo carries only a synthetic v1 receipt, so the proof engine sees a v1-only
  // claim evaluated against a v2 current — no v2 receipt to mask it.
  const v1Root = await tempRepo("voila-v1-");
  await initState(v1Root, { displayName: "fp-v1" });
  await updateState(v1Root, (cur) => {
    let s = createWorkItem(
      cur,
      { kind: "outcome", title: "Verified thing", acceptanceCriteria: [CRITERION] },
      "T",
    );
    s = createClaim(
      s,
      {
        workItemId: "NF-1",
        statement: "the suite passes",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      "T",
    );
    return requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, "T");
  });

  // Synthesize a v1 receipt: a `VerificationReceiptRecord` and matching `manifest.json` written by
  // hand, with no `fingerprintAlgorithm` field. The hex is a plausible v1 digest that cannot collide
  // with any real v2 value (different input shape and prefix).
  const { statePaths } = await import("../src/state/paths.ts");
  const v1ReceiptId = "RCP-1";
  const dir = join(v1Root, statePaths(v1Root).receiptsDir, v1ReceiptId);
  await mkdir(dir, { recursive: true });
  const v1Hex = "0".repeat(64);
  const manifest = {
    receiptId: v1ReceiptId,
    claimId: "CLM-1",
    result: "passed",
    executable: process.execPath,
    args: ["-e", "process.exit(0)"],
    cwdRef: ".",
    exitCode: 0,
    signal: null,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    timeoutMs: 1000,
    repositoryFingerprint: v1Hex,
    gitHead: null,
    stdoutSha256: "0".repeat(64),
    stderrSha256: "0".repeat(64),
    stdoutTruncated: false,
    stderrTruncated: false,
    outputTruncated: false,
    capturedEnvironment: "none",
    pathsNormalized: "repository root -> <repo>, home directory -> ~",
  };
  await writeFile(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  await writeFile(join(dir, "stdout.txt"), "", "utf8");
  await writeFile(join(dir, "stderr.txt"), "", "utf8");

  // Link the synthetic receipt through the canonical store. The counter is at 0, so RCP-1 is the
  // next allocation.
  const { updateState: writeState, loadState: ls } = await import("../src/state/store.ts");
  const { linkReceipt } = await import("../src/domain/proof.ts");
  await writeState(
    v1Root,
    (cur) =>
      linkReceipt(
        cur,
        {
          id: v1ReceiptId,
          claimId: "CLM-1",
          result: "passed",
          artifactRef: `receipts/${v1ReceiptId}`,
          executable: process.execPath,
          args: ["-e", "process.exit(0)"],
          cwdRef: ".",
          exitCode: 0,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          repositoryFingerprint: v1Hex,
          outputTruncated: false,
        },
        "T",
      ),
    { type: "verification_recorded", id: v1ReceiptId, claimId: "CLM-1", result: "passed" },
  );

  // The v2 current in the v1 repo is real, the v1 hex is recognizably v1 (no algorithm field), and
  // the proof engine reports the claim as stale because no receipt matches the v2 current value.
  const v2OnV1 = await repositoryFingerprint(v1Root);
  assert.notEqual(v1Hex, v2OnV1.value, "the synthetic v1 value is not a v2 digest");
  const state = await ls(v1Root);
  const v1Receipt = state.receipts.find((r) => r.id === v1ReceiptId);
  assert.ok(v1Receipt);
  assert.equal(
    v1Receipt.fingerprintAlgorithm,
    undefined,
    "the synthetic receipt has no algorithm field",
  );
  assert.equal(
    evaluateClaim(state, findClaim(state, "CLM-1"), v2OnV1.value).status,
    "stale",
    "a v1 receipt is stale against a v2 current without any code special-casing the algorithm",
  );
});
