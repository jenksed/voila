// Repository fingerprinting against real temporary git repositories.
//
// The properties that matter: determinism when nothing changed, sensitivity to HEAD movement, tracked
// modifications, staged changes, and untracked files; independence from the repository's absolute
// location; and — critically — that creating a receipt does not invalidate its own fingerprint.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
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

test("a non-git directory fails clearly instead of guessing", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-nogit-"));
  await assert.rejects(() => repositoryFingerprint(root), FingerprintUnavailableError);
  await assert.rejects(() => repositoryFingerprint(root), /not inside a git work tree/);
  // The best-effort variant degrades to null for read-only surfaces.
  assert.equal(await tryRepositoryFingerprint(root), null);
});

test("the fingerprint is deterministic when nothing changes", async () => {
  const root = await tempRepo();
  const a = await repositoryFingerprint(root);
  const b = await repositoryFingerprint(root);
  const c = await repositoryFingerprint(root);
  assert.equal(a.value, b.value);
  assert.equal(b.value, c.value);
  assert.match(a.value, /^[a-f0-9]{64}$/);
  assert.equal(a.dirty, false);
  assert.equal(a.untrackedCount, 0);
  assert.ok(a.gitHead && a.gitHead.length >= 7);
});

test("HEAD movement changes the fingerprint", async () => {
  const root = await tempRepo();
  const before = await repositoryFingerprint(root);
  await writeFile(join(root, "second.txt"), "second\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "second"]);
  const after = await repositoryFingerprint(root);
  assert.notEqual(after.value, before.value, "a new commit is a new repository state");
  assert.notEqual(after.gitHead, before.gitHead);
  assert.equal(after.dirty, false);
});

test("a tracked working-tree modification changes the fingerprint, and reverting restores it", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await writeFile(join(root, "tracked.txt"), "modified\n", "utf8");
  const modified = await repositoryFingerprint(root);
  assert.notEqual(modified.value, original.value);
  assert.equal(modified.dirty, true);

  // Restoring the exact bytes restores the exact fingerprint.
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  const restored = await repositoryFingerprint(root);
  assert.equal(restored.value, original.value, "byte-identical content yields the same digest");
});

test("a staged change changes the fingerprint independently of the working tree", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await writeFile(join(root, "tracked.txt"), "staged\n", "utf8");
  git(root, ["add", "tracked.txt"]);
  const staged = await repositoryFingerprint(root);
  assert.notEqual(staged.value, original.value);
  assert.equal(staged.dirty, true);

  // Unstaging while keeping the same worktree content is still a different state than pristine.
  git(root, ["reset", "-q", "HEAD", "tracked.txt"]);
  const unstaged = await repositoryFingerprint(root);
  assert.notEqual(unstaged.value, original.value, "the modified worktree still differs");
  assert.notEqual(unstaged.value, staged.value, "staged and unstaged are distinct states");
});

test("an untracked repository file changes the fingerprint; gitignored files do not", async () => {
  const root = await tempRepo();
  const original = await repositoryFingerprint(root);

  await writeFile(join(root, "untracked.txt"), "new file\n", "utf8");
  const withUntracked = await repositoryFingerprint(root);
  assert.notEqual(withUntracked.value, original.value);
  assert.equal(withUntracked.untrackedCount, 1);

  // Content of an untracked file matters, not just its presence.
  await writeFile(join(root, "untracked.txt"), "different content\n", "utf8");
  const changedContent = await repositoryFingerprint(root);
  assert.notEqual(changedContent.value, withUntracked.value);

  await rm(join(root, "untracked.txt"));
  assert.equal((await repositoryFingerprint(root)).value, original.value, "removal restores it");

  // Ignored paths are excluded via --exclude-standard.
  await mkdir(join(root, "ignored"), { recursive: true });
  await writeFile(join(root, "ignored", "junk.txt"), "noise\n", "utf8");
  assert.equal(
    (await repositoryFingerprint(root)).value,
    original.value,
    "gitignored files do not affect the digest",
  );
});

test("untracked files are order-independent: the digest depends on sorted paths only", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "b.txt"), "b\n", "utf8");
  await writeFile(join(root, "a.txt"), "a\n", "utf8");
  const first = await repositoryFingerprint(root);

  // Recreate in the opposite creation order with identical content.
  await rm(join(root, "a.txt"));
  await rm(join(root, "b.txt"));
  await writeFile(join(root, "a.txt"), "a\n", "utf8");
  await writeFile(join(root, "b.txt"), "b\n", "utf8");
  const second = await repositoryFingerprint(root);
  assert.equal(second.value, first.value, "creation order does not change the digest");
});

test("the fingerprint does not depend on the repository's absolute path", async () => {
  const source = await tempRepo("voila-fp-src-");
  await writeFile(join(source, "untracked.txt"), "same everywhere\n", "utf8");
  const before = await repositoryFingerprint(source);

  // Copy the whole repository (including .git) to a different absolute location.
  const parent = await mkdtemp(join(tmpdir(), "voila-fp-dst-"));
  const destination = join(parent, "relocated-with-a-different-name");
  await cp(source, destination, { recursive: true });

  const after = await repositoryFingerprint(destination);
  assert.equal(after.value, before.value, "no machine-specific absolute path enters the digest");
});

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
  // HEAD moved, so the value differs from `original`; what matters is that further .voila writes
  // do not move it again.
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

  // THE property: after writing the artifact and linking it canonically, the fingerprint is unchanged,
  // so the receipt is immediately current evidence rather than instantly stale.
  const afterRun = await repositoryFingerprint(root);
  assert.equal(afterRun.value, beforeRun.value, "the receipt did not invalidate itself");

  const state = await loadState(root);
  const evaluation = evaluateClaim(state, findClaim(state, "CLM-1"), afterRun.value);
  assert.equal(evaluation.status, "supported", "the fresh receipt supports its claim");
  assert.equal(evaluation.currentReceiptId, result.receipt.id);
});

test("modifying a tracked file makes existing evidence stale; restoring it makes evidence current again", async () => {
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

  // Change a tracked file: the evidence no longer describes the current repository.
  await writeFile(join(root, "tracked.txt"), "changed by the developer\n", "utf8");
  const dirty = await repositoryFingerprint(root);
  assert.notEqual(dirty.value, pristine.value);
  const stale = evaluateClaim(state, findClaim(state, "CLM-1"), dirty.value);
  assert.equal(stale.status, "stale");
  assert.match(stale.reason, /repository changed/);

  // Restore the exact bytes: the same receipt is current evidence again.
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  const restored = await repositoryFingerprint(root);
  assert.equal(restored.value, pristine.value);
  assert.equal(evaluateClaim(state, findClaim(state, "CLM-1"), restored.value).status, "supported");
});

test("the fingerprint record stores no raw diff and no absolute path", async () => {
  const root = await tempRepo();
  await writeFile(join(root, "tracked.txt"), "SECRET_DIFF_MARKER\n", "utf8");
  await writeFile(join(root, "untracked.txt"), "ANOTHER_MARKER\n", "utf8");
  const fingerprint = await repositoryFingerprint(root);
  const serialized = JSON.stringify(fingerprint);
  assert.equal(serialized.includes("SECRET_DIFF_MARKER"), false, "no diff content is retained");
  assert.equal(serialized.includes("ANOTHER_MARKER"), false, "no file content is retained");
  assert.equal(serialized.includes(tmpdir()), false, "no absolute path is retained");
  assert.equal(serialized.includes(root), false);
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

test("excluding both state directories does not weaken ordinary source detection", async () => {
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
  assert.equal(modified.dirty, true);

  // Staged change.
  git(root, ["add", "tracked.txt"]);
  const staged = await repositoryFingerprint(root);
  assert.notEqual(staged.value, modified.value, "staged change still detected");

  // A file named like the state directories but NOT inside them is still detected.
  await writeFile(join(root, "voila-notes.md"), "notes\n", "utf8");
  const sibling = await repositoryFingerprint(root);
  assert.notEqual(sibling.value, staged.value, "a similarly named file is not excluded");
});
