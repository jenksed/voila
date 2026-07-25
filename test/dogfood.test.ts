import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import { loadState } from "../src/state/store.ts";
import { leftoverReceiptTempDirs, OUTPUT_CAP_BYTES } from "../src/state/receipt-store.ts";
import { runDoctor } from "../src/commands/doctor.ts";

// The NewFang repository dogfoods its own canonical state. These assertions load the committed
// .newfang/project.json from the repo root (the test runner's cwd).

test("repository loads its own dogfooded v4 canonical state", async () => {
  const state = await loadState(process.cwd());
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.phase, "build");
  assert.ok(state.workItems.length >= 7);
  assert.equal(state.focusWorkItemId, "NF-2");
  assert.ok(state.nextActionRationale && state.nextActionRationale.length > 0);
  assert.ok(state.decisions.filter((d) => d.status === "accepted").length >= 6);
  assert.ok(state.risks.length >= 4);
  // The focused item is neither completed nor cancelled.
  const focus = state.workItems.find((w) => w.id === state.focusWorkItemId);
  assert.ok(focus && focus.status !== "completed" && focus.status !== "cancelled");
});

test("dogfooded state stays honest: nothing is marked completed yet", async () => {
  const state = await loadState(process.cwd());
  assert.equal(
    state.workItems.filter((w) => w.status === "completed").length,
    0,
    "no work item has honestly satisfied every completion gate yet",
  );
  const nf1 = state.workItems.find((w) => w.id === "NF-1");
  assert.ok(nf1);
  assert.equal(nf1.status, "in_progress");

  // NF-2 must NOT be completed: the authenticated Project Steward intake acceptance is still
  // pending, so its acceptance criteria have not actually been demonstrated.
  const nf2 = state.workItems.find((w) => w.id === "NF-2");
  assert.ok(nf2);
  assert.notEqual(nf2.status, "completed", "authenticated intake acceptance is still pending");
});

test("dogfooded proof state is real: a claim exists with a linked receipt artifact", async () => {
  const state = await loadState(process.cwd());
  assert.ok(state.claims.length >= 1, "at least one real claim is recorded");

  const claim = state.claims.find((c) => c.id === "CLM-1");
  assert.ok(claim, "CLM-1 exists");
  assert.equal(claim.workItemId, "NF-3", "the claim is about the Packet 4 work item");
  assert.ok(claim.knownLimitations.length > 0, "limitations are recorded honestly");

  // Every covered criterion is an exact criterion of its work item.
  const item = state.workItems.find((w) => w.id === claim.workItemId);
  assert.ok(item);
  for (const criterion of claim.coveredAcceptanceCriteria) {
    assert.ok(
      item.acceptanceCriteria.includes(criterion),
      `covered criterion is stated by ${item.id}: ${criterion}`,
    );
  }

  // The claim is a real completion requirement, and its receipts resolve.
  assert.ok(item.requiredClaimIds.includes(claim.id), "the claim is required by its work item");
  assert.ok(claim.receiptIds.length >= 1, "at least one receipt was recorded");
  for (const receiptId of claim.receiptIds) {
    const receipt = state.receipts.find((r) => r.id === receiptId);
    assert.ok(receipt, `${receiptId} resolves`);
    assert.equal(receipt.claimId, claim.id);
    assert.ok(existsSync(join(process.cwd(), ".newfang", receipt.artifactRef, "manifest.json")));
    assert.ok(existsSync(join(process.cwd(), ".newfang", receipt.artifactRef, "stdout.txt")));
  }
});

test("dogfooded receipt artifacts leak no credentials, env values, or absolute paths", async () => {
  const state = await loadState(process.cwd());
  const home = homedir();
  for (const receipt of state.receipts) {
    const dir = join(process.cwd(), ".newfang", receipt.artifactRef);
    const manifest = await readFile(join(dir, "manifest.json"), "utf8");
    const stdout = await readFile(join(dir, "stdout.txt"), "utf8");
    const stderr = await readFile(join(dir, "stderr.txt"), "utf8");

    // The manifest must agree with canonical metadata and record no environment.
    const parsed = JSON.parse(manifest) as Record<string, unknown>;
    assert.equal(parsed.receiptId, receipt.id);
    assert.equal(parsed.claimId, receipt.claimId);
    assert.equal(parsed.result, receipt.result);
    assert.equal(parsed.repositoryFingerprint, receipt.repositoryFingerprint);
    assert.equal(parsed.capturedEnvironment, "none");

    // Repository-relative only: no home directory or absolute repository path anywhere.
    for (const [label, content] of [
      ["manifest", manifest],
      ["stdout", stdout],
      ["stderr", stderr],
    ] as const) {
      assert.equal(content.includes(home), false, `${receipt.id} ${label} has no home path`);
      assert.equal(
        content.includes(process.cwd()),
        false,
        `${receipt.id} ${label} has no absolute repository path`,
      );
    }
    assert.equal(receipt.cwdRef.startsWith("/"), false, "cwdRef is repository-relative");

    // Stored output respects the per-stream cap.
    assert.ok(Buffer.byteLength(stdout, "utf8") <= OUTPUT_CAP_BYTES);
    assert.ok(Buffer.byteLength(stderr, "utf8") <= OUTPUT_CAP_BYTES);
  }
});

test("no receipt staging directory was left behind in the repository", async () => {
  assert.deepEqual(await leftoverReceiptTempDirs(process.cwd()), []);
});

test("doctor reports no failures on the dogfooded repository state", async () => {
  const checks = await runDoctor({
    root: process.cwd(),
    piVersion: "0.82.0",
    expectedPiVersion: "0.82.0",
    nodeVersion: process.version,
    minNode: "22.19.0",
  });
  const failures = checks.filter((c) => c.level === "fail");
  assert.deepEqual(failures, [], `unexpected doctor failures: ${JSON.stringify(failures)}`);
});
