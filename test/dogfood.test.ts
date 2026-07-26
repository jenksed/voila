import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import { loadState } from "../src/state/store.ts";
import { leftoverReceiptTempDirs, OUTPUT_CAP_BYTES } from "../src/state/receipt-store.ts";
import { runDoctor } from "../src/commands/doctor.ts";

// The Voila repository dogfoods its own canonical state. These assertions load the committed
// .voila/project.json from the repo root (the test runner's cwd).

test("repository loads its own dogfooded v4 canonical state", async () => {
  const state = await loadState(process.cwd());
  assert.equal(state.schemaVersion, 4);
  assert.equal(state.phase, "build");
  assert.ok(state.workItems.length >= 7);
  // R1 (NF-9) was completed through the protected transition. Canonical focus is empty and the next
  // action points at R2 planning. NF-2 is still held and still owed its authenticated intake —
  // asserted below, which is where that invariant belongs.
  assert.equal(state.focusWorkItemId, null);
  assert.ok(state.nextActionRationale && state.nextActionRationale.length > 0);
  assert.ok(state.decisions.filter((d) => d.status === "accepted").length >= 6);
  assert.ok(state.risks.length >= 4);
});

test("the realignment is recorded in canonical state and the R-sequence is sequenced", async () => {
  const state = await loadState(process.cwd());

  // DEC-18 must exist and be accepted: canonical state, not only documents, carries the direction.
  const dec18 = state.decisions.find((d) => d.id === "DEC-18");
  assert.ok(dec18, "DEC-18 records the operational realignment");
  assert.equal(dec18.status, "accepted");

  // R1..R7 exist as work items and form a dependency chain. R1 (NF-9) is completed; R2..R7
  // remain uncompleted, so no later R-packet can be picked up before its predecessor.
  const chain = ["NF-9", "NF-10", "NF-11", "NF-12", "NF-13", "NF-14", "NF-15"];
  for (const [i, id] of chain.entries()) {
    const item = state.workItems.find((w) => w.id === id);
    assert.ok(item, `${id} exists for R${i + 1}`);
    if (i === 0) {
      assert.equal(item.status, "completed", "R1 is completed on this branch");
      assert.deepEqual(item.dependsOn, [], "R1 has no predecessor in the R-sequence");
    } else {
      assert.notEqual(
        item.status,
        "completed",
        `${id} is unbuilt; nothing here may claim otherwise`,
      );
      assert.deepEqual(item.dependsOn, [chain[i - 1]], `${id} depends on ${chain[i - 1]}`);
    }
    assert.ok(item.acceptanceCriteria.length > 0, `${id} states how it will be judged`);
  }
});

test("dogfooded state stays honest: completed set is exactly {NF-1, NF-9}; NF-2..NF-4 remain held", async () => {
  const state = await loadState(process.cwd());
  const completed = state.workItems
    .filter((w) => w.status === "completed")
    .map((w) => w.id)
    .sort();
  assert.deepEqual(
    completed,
    ["NF-1", "NF-9"],
    "only NF-1 and NF-9 have satisfied every completion gate; NF-2..NF-4 remain held",
  );

  const nf1 = state.workItems.find((w) => w.id === "NF-1");
  assert.ok(nf1);
  assert.equal(nf1.status, "completed", "DEC-17 released NF-1; it must be marked completed");

  const nf9 = state.workItems.find((w) => w.id === "NF-9");
  assert.ok(nf9);
  assert.equal(nf9.status, "completed", "NF-9 was completed through voila_complete_work_item");

  // NF-2 must NOT be completed: the authenticated Project Steward intake acceptance is still
  // pending, so its acceptance criteria have not actually been demonstrated.
  const nf2 = state.workItems.find((w) => w.id === "NF-2");
  assert.ok(nf2);
  assert.notEqual(nf2.status, "completed", "authenticated intake acceptance is still pending");

  // NF-3 and NF-4 remain uncompleted and dependency-blocked on the chain ahead of them.
  for (const id of ["NF-3", "NF-4"]) {
    const item = state.workItems.find((w) => w.id === id);
    assert.ok(item, `${id} is on the backlog`);
    assert.notEqual(item.status, "completed", `${id} cannot complete ahead of its dependency`);
    assert.ok(item.dependsOn.length > 0, `${id} still has unmet dependencies on the chain`);
  }
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
    assert.ok(existsSync(join(process.cwd(), ".voila", receipt.artifactRef, "manifest.json")));
    assert.ok(existsSync(join(process.cwd(), ".voila", receipt.artifactRef, "stdout.txt")));
  }
});

test("dogfooded receipt artifacts leak no credentials, env values, or absolute paths", async () => {
  const state = await loadState(process.cwd());
  const home = homedir();
  for (const receipt of state.receipts) {
    const dir = join(process.cwd(), ".voila", receipt.artifactRef);
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

// The Project Steward skill is only proof-aware if Pi can actually parse and load it. An unquoted
// YAML `description:` containing a colon-space parses as a nested mapping and the skill is silently
// dropped with a warning — the skill file looks fine, and nothing else fails. This asserts the real
// outcome through the pinned Pi's own loader. The deep import is deliberate: `core/skills.js` is not
// in Pi's `exports` map, but it is what decides whether the skill loads, so nothing else is a
// faithful check. If a Pi upgrade moves this path, fix the import — do not weaken the assertion.
test("Pi loads the Project Steward skill from this repository with no diagnostics", async () => {
  const { loadSkills } =
    await import("../node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js");

  // agentDir points at an empty temp directory so the machine's global skills cannot influence the
  // result: this test is about THIS repository's project-local skills only.
  const emptyAgentDir = await mkdtemp(join(tmpdir(), "voila-agentdir-"));
  const result = loadSkills({
    cwd: process.cwd(),
    agentDir: emptyAgentDir,
    skillPaths: [],
    includeDefaults: true,
  });

  assert.deepEqual(
    result.diagnostics ?? [],
    [],
    `Pi reported skill diagnostics: ${JSON.stringify(result.diagnostics)}`,
  );

  const steward = result.skills.find((s) => s.name === "project-steward");
  assert.ok(steward, "the project-steward skill loaded");
  // The description survives quoting intact, including its colons and embedded double quotes.
  assert.match(steward.description, /^Act as the Voila Project Steward\./);
  assert.match(steward.description, /Voila-managed project: reading project context/);
  assert.match(steward.description, /asks "where is this project\?"\.$/);
  // Pi's spec caps the description at 1024 characters; a longer one is rejected outright.
  assert.ok(
    steward.description.length <= 1024,
    `description is ${steward.description.length} chars, over Pi's 1024 cap`,
  );
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
