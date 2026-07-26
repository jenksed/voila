// Pi tools, human commands, and doctor diagnostics for the proof engine.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { voilaTools, type VoilaTool } from "../src/tools/index.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";
import { receiptPaths, statePaths } from "../src/state/paths.ts";
import {
  runClaims,
  runComplete,
  runProof,
  runVerify,
  parseVerifyArgs,
} from "../src/commands/proof.ts";
import { formatDoctor, runDoctor, worstLevel, type DoctorCheck } from "../src/commands/doctor.ts";
import { createWorkItem, setFocusWorkItem, updateWorkItem } from "../src/domain/operations.ts";
import { CompletionRejectedError } from "../src/domain/proof.ts";
import { readReceiptManifest } from "../src/state/receipt-store.ts";

const NODE = process.execPath;
const CRITERION = "the recorded command passes";

function git(root: string, args: string[]): string {
  return execFileSync("git", args, { cwd: root, stdio: ["ignore", "pipe", "pipe"] })
    .toString()
    .trim();
}

function tool(name: string): VoilaTool {
  const found = voilaTools().find((t) => t.name === name);
  assert.ok(found, `tool ${name} exists`);
  return found;
}

async function run(t: VoilaTool, params: Record<string, unknown>, cwd: string) {
  return t.execute("call-1", params, undefined, undefined, { cwd });
}

function textOf(result: { content: Array<{ text: string }> }): string {
  return result.content.map((c) => c.text).join("\n");
}

/** A temp git repo with Voila state and one work item carrying one acceptance criterion. */
async function projectRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-ptools-"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Voila Test"]);
  await writeFile(join(root, "tracked.txt"), "original\n", "utf8");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "initial"]);
  await initState(root, { displayName: "tools-demo" });
  await updateState(root, (cur) =>
    createWorkItem(
      cur,
      {
        kind: "outcome",
        title: "Verified outcome",
        status: "in_progress",
        acceptanceCriteria: [CRITERION],
      },
      new Date().toISOString(),
    ),
  );
  return root;
}

/** Drive the full happy path through tools: claim -> require -> verify. */
async function proveRoot(): Promise<string> {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "the recorded command passes",
      confidence: "high",
      coveredAcceptanceCriteria: [CRITERION],
      knownLimitations: ["automated only; no interactive check"],
    },
    root,
  );
  await run(tool("voila_require_claim"), { workItemId: "NF-1", claimId: "CLM-1" }, root);
  await run(
    tool("voila_run_verification"),
    { claimId: "CLM-1", executable: NODE, args: ["-e", "process.stdout.write('ok')"] },
    root,
  );
  return root;
}

function check(checks: DoctorCheck[], name: string): DoctorCheck {
  const found = checks.find((c) => c.name === name);
  assert.ok(found, `check "${name}" present`);
  return found;
}

function doctorInput(root: string) {
  return {
    root,
    piVersion: "0.82.0",
    expectedPiVersion: "0.82.0",
    nodeVersion: process.version,
    minNode: "22.19.0",
  };
}

// --- Tool registration ---

test("the eight proof tools are registered with strict schemas", () => {
  const names = voilaTools().map((t) => t.name);
  for (const expected of [
    "voila_create_claim",
    "voila_update_claim",
    "voila_require_claim",
    "voila_list_claims",
    "voila_run_verification",
    "voila_get_receipt",
    "voila_complete_work_item",
    "voila_get_proof",
  ]) {
    assert.ok(names.includes(expected), `${expected} is registered`);
    const schema = tool(expected).parameters as { additionalProperties?: boolean };
    assert.equal(schema.additionalProperties, false, `${expected} rejects extra properties`);
  }
});

test("no proof tool accepts a filesystem path outside the repository or a support flag", () => {
  for (const name of [
    "voila_create_claim",
    "voila_update_claim",
    "voila_require_claim",
    "voila_list_claims",
    "voila_run_verification",
    "voila_get_receipt",
    "voila_complete_work_item",
    "voila_get_proof",
  ]) {
    const properties =
      (tool(name).parameters as { properties?: Record<string, unknown> }).properties ?? {};
    const keys = Object.keys(properties);
    assert.equal(keys.includes("root"), false, `${name} takes no root`);
    assert.equal(keys.includes("cwd"), false, `${name} takes no absolute cwd`);
    for (const forbidden of ["supported", "isSupported", "markSupported", "status"]) {
      if (name === "voila_list_claims" && forbidden === "status") continue; // read-only filter
      assert.equal(keys.includes(forbidden), false, `${name} has no ${forbidden} field`);
    }
  }
});

// --- Claim tools ---

test("voila_create_claim persists a pending claim and says so", async () => {
  const root = await projectRoot();
  const result = await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "it works",
      confidence: "medium",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  assert.match(textOf(result), /Created CLM-1 for NF-1/);
  assert.match(textOf(result), /pending — no verification receipt exists yet/);
  const state = await loadState(root);
  assert.equal(state.claims.length, 1);
  assert.deepEqual(state.claims[0]?.receiptIds, []);
});

test("voila_create_claim rejects a criterion the work item does not state", async () => {
  const root = await projectRoot();
  await assert.rejects(
    () =>
      run(
        tool("voila_create_claim"),
        {
          workItemId: "NF-1",
          statement: "x",
          confidence: "low",
          coveredAcceptanceCriteria: ["not a real criterion"],
        },
        root,
      ),
    /not an exact acceptance criterion/,
  );
  assert.equal((await loadState(root)).claims.length, 0);
});

test("voila_update_claim revises fields without touching receipts", async () => {
  const root = await proveRoot();
  const before = await loadState(root);
  const result = await run(
    tool("voila_update_claim"),
    { id: "CLM-1", confidence: "low", knownLimitations: ["narrower than before"] },
    root,
  );
  assert.match(textOf(result), /Existing receipts are unchanged/);
  const after = await loadState(root);
  assert.equal(after.claims[0]?.confidence, "low");
  assert.deepEqual(after.claims[0]?.knownLimitations, ["narrower than before"]);
  assert.deepEqual(after.claims[0]?.receiptIds, before.claims[0]?.receiptIds);
  assert.deepEqual(after.receipts, before.receipts);
});

test("voila_require_claim reports remaining uncovered criteria", async () => {
  const root = await projectRoot();
  await updateState(root, (cur) =>
    updateWorkItem(cur, { id: "NF-1", acceptanceCriteria: [CRITERION, "a second criterion"] }, "T"),
  );
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  const result = await run(
    tool("voila_require_claim"),
    { workItemId: "NF-1", claimId: "CLM-1" },
    root,
  );
  assert.match(textOf(result), /CLM-1 is now required by NF-1/);
  assert.match(textOf(result), /Uncovered acceptance criteria remaining: 1/);
});

test("voila_list_claims reports derived status and limitations", async () => {
  const root = await proveRoot();
  const result = await run(tool("voila_list_claims"), {}, root);
  const text = textOf(result);
  assert.match(text, /CLM-1 \[supported\] \(required\) NF-1/);
  assert.match(text, /limitations: automated only; no interactive check/);
  const details = result.details as { summary: { supported: number } };
  assert.equal(details.summary.supported, 1);

  const filtered = await run(tool("voila_list_claims"), { status: "pending" }, root);
  assert.match(textOf(filtered), /no matching claims/);
});

// --- Verification tool ---

test("voila_run_verification records a receipt and says success != passed", async () => {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  const failing = await run(
    tool("voila_run_verification"),
    { claimId: "CLM-1", executable: NODE, args: ["-e", "process.exit(1)"] },
    root,
  );
  const text = textOf(failing);
  assert.match(text, /Recorded RCP-1 for CLM-1: failed \(exit 1\)/);
  assert.match(text, /The command did NOT pass/);
  assert.match(text, /no shell/);
  const details = failing.details as { passed: boolean };
  assert.equal(details.passed, false);
  // The receipt exists even though verification failed.
  assert.equal((await loadState(root)).receipts.length, 1);
});

test("voila_run_verification refuses a shell string", async () => {
  const root = await proveRoot();
  await assert.rejects(
    () =>
      run(tool("voila_run_verification"), { claimId: "CLM-1", executable: "npm test | tee" }, root),
    /Refusing to run/,
  );
});

// --- Receipt tool ---

test("voila_get_receipt returns curated metadata and only a bounded excerpt on request", async () => {
  const root = await proveRoot();
  const plain = await run(tool("voila_get_receipt"), { receiptId: "RCP-1" }, root);
  const plainText = textOf(plain);
  assert.match(plainText, /RCP-1 for CLM-1: passed \(exit 0\)/);
  assert.match(plainText, /matches the current repository state/);
  assert.match(plainText, /Artifact: \.voila\/receipts\/RCP-1\//);
  assert.equal(plainText.includes("stdout excerpt"), false, "output is not returned by default");

  const withOutput = await run(
    tool("voila_get_receipt"),
    { receiptId: "RCP-1", includeOutput: true },
    root,
  );
  assert.match(textOf(withOutput), /stdout excerpt \(complete\)/);
  const details = withOutput.details as { stdoutExcerpt: string; excerptTruncated: boolean };
  assert.equal(details.stdoutExcerpt, "ok");
  assert.equal(details.excerptTruncated, false);
});

test("voila_get_receipt truncates a large excerpt for display", async () => {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  await run(
    tool("voila_run_verification"),
    {
      claimId: "CLM-1",
      executable: NODE,
      args: ["-e", "process.stdout.write('z'.repeat(20000))"],
      timeoutMs: 30000,
    },
    root,
  );
  const result = await run(
    tool("voila_get_receipt"),
    { receiptId: "RCP-1", includeOutput: true },
    root,
  );
  const details = result.details as { stdoutExcerpt: string; excerptTruncated: boolean };
  assert.equal(details.excerptTruncated, true);
  assert.ok(details.stdoutExcerpt.length <= 4000, `excerpt was ${details.stdoutExcerpt.length}`);
});

test("voila_get_receipt rejects an unknown receipt", async () => {
  const root = await proveRoot();
  await assert.rejects(
    () => run(tool("voila_get_receipt"), { receiptId: "RCP-99" }, root),
    /Receipt not found/,
  );
});

// --- Proof and completion tools ---

test("voila_get_proof reports counts and, for an item, every gate", async () => {
  const root = await proveRoot();
  const overall = await run(tool("voila_get_proof"), {}, root);
  assert.match(textOf(overall), /Claims: 1 — 1 supported, 0 unsupported, 0 stale, 0 pending/);

  const forItem = await run(tool("voila_get_proof"), { workItemId: "NF-1" }, root);
  const text = textOf(forItem);
  // Every gate passes, but CLM-1 records a limitation, so the model is told HELD — not READY.
  assert.match(text, /NF-1 \[in_progress\] — completion HELD/);
  assert.match(text, /outstanding: CLM-1: automated only; no interactive check/);
  assert.match(text, /\[pass\] every required claim supported by current passing evidence/);
  const details = forItem.details as {
    assessment: { ready: boolean };
    readiness: { kind: string };
    coverage: unknown[];
  };
  assert.equal(details.assessment.ready, true, "the gates themselves still pass");
  assert.equal(details.readiness.kind, "held");
  assert.equal(details.coverage.length, 1);

  const missing = await run(tool("voila_get_proof"), { workItemId: "NF-9" }, root);
  assert.match(textOf(missing), /Work item not found: NF-9/);
});

test("voila_complete_work_item completes a fully proven item and clears focus", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) => setFocusWorkItem(cur, "NF-1"));
  const result = await run(tool("voila_complete_work_item"), { workItemId: "NF-1" }, root);
  const text = textOf(result);
  assert.match(text, /Completed NF-1: Verified outcome/);
  assert.match(text, /completion gates passed/);
  assert.match(text, /Focus was cleared/);

  const state = await loadState(root);
  assert.equal(state.workItems[0]?.status, "completed");
  assert.equal(state.focusWorkItemId, null);
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(events.filter((e) => e.type === "work_item_completed").length, 1);
});

test("voila_complete_work_item refuses an unproven item and changes nothing", async () => {
  const root = await projectRoot();
  const before = await readFile(statePaths(root).projectJson, "utf8");
  await assert.rejects(
    () => run(tool("voila_complete_work_item"), { workItemId: "NF-1" }, root),
    CompletionRejectedError,
  );
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "bytes unchanged");
});

// --- Commands ---

test("parseVerifyArgs consumes only the FIRST -- separator", () => {
  assert.deepEqual(parseVerifyArgs(["CLM-1", "--", "mise", "exec", "--", "npm", "run", "verify"]), {
    claimId: "CLM-1",
    executable: "mise",
    args: ["exec", "--", "npm", "run", "verify"],
  });
  assert.deepEqual(parseVerifyArgs(["CLM-2", "--", "npm", "test"]), {
    claimId: "CLM-2",
    executable: "npm",
    args: ["test"],
  });
  assert.match(parseVerifyArgs([]) as string, /Usage: \/voila verify/);
  assert.match(parseVerifyArgs(["CLM-1"]) as string, /the -- separator is required/);
  assert.match(parseVerifyArgs(["CLM-1", "--"]) as string, /No executable given after --/);
});

test("/voila verify echoes the exact structured command before executing", async () => {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  const result = await runVerify(root, ["CLM-1", "--", NODE, "-e", "process.exit(0)"]);
  const text = result.lines.join("\n");
  assert.match(text, /Running verification \(no shell, structured argv\)/);
  assert.match(text, /claim:\s+CLM-1/);
  assert.match(text, new RegExp(`executable: ${NODE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(text, /args:\s+"-e" "process\.exit\(0\)"/);
  assert.match(text, /not a sandbox/);
  assert.match(text, /Recorded RCP-1: passed/);
  assert.equal(result.level, "info");
});

test("/voila verify echoes the command even when it is refused", async () => {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  const result = await runVerify(root, ["CLM-1", "--", "npm test | tee out"]);
  const text = result.lines.join("\n");
  assert.match(text, /Running verification/);
  assert.match(text, /Refusing to run/);
  assert.equal(result.level, "warning");
});

test("/voila verify warns, not errors, when the command fails", async () => {
  const root = await projectRoot();
  await run(
    tool("voila_create_claim"),
    {
      workItemId: "NF-1",
      statement: "x",
      confidence: "low",
      coveredAcceptanceCriteria: [CRITERION],
    },
    root,
  );
  const result = await runVerify(root, ["CLM-1", "--", NODE, "-e", "process.exit(4)"]);
  assert.equal(result.level, "warning");
  assert.match(result.lines.join("\n"), /is NOT supported: the command did not pass/);
});

test("/voila claims lists and details claims", async () => {
  const root = await proveRoot();
  const list = await runClaims(root);
  assert.match(list.lines.join("\n"), /Claims — 1 \(supported 1/);
  assert.match(list.lines.join("\n"), /CLM-1 \[supported\] \(required\)/);

  const detail = await runClaims(root, "CLM-1");
  const text = detail.lines.join("\n");
  assert.match(text, /CLM-1 — the recorded command passes/);
  assert.match(text, /evidence:\s+supported/);
  assert.match(text, /required:\s+yes/);
  assert.match(text, /limitations:/);
  assert.match(text, /receipts:\s+RCP-1/);

  const byItem = await runClaims(root, "NF-1");
  assert.match(byItem.lines.join("\n"), /Claims for NF-1/);
  assert.match((await runClaims(root, "CLM-9")).lines.join("\n"), /No claim or claimed work item/);
});

test("/voila claims explains an empty project", async () => {
  const root = await projectRoot();
  const result = await runClaims(root);
  assert.match(result.lines.join("\n"), /No claims yet/);
  assert.match(result.lines.join("\n"), /cannot be completed until claims cover/);
});

test("/voila proof shows an overview, a work item's gates, and a receipt without output", async () => {
  const root = await proveRoot();
  const overview = await runProof(root);
  assert.match(overview.lines.join("\n"), /Proof — 1 claim\(s\)/);
  assert.match(overview.lines.join("\n"), /Receipts: 1/);
  assert.match(overview.lines.join("\n"), /NF-1 — HELD: /);

  const item = await runProof(root, "NF-1");
  const itemText = item.lines.join("\n");
  assert.match(itemText, /completion: HELD/);
  assert.match(itemText, /outstanding acceptance:/);
  assert.match(itemText, /\[covered\] the recorded command passes \(CLM-1\)/);
  assert.match(itemText, /\[pass\] dependencies completed/);

  const receipt = await runProof(root, "RCP-1");
  const receiptText = receipt.lines.join("\n");
  assert.match(receiptText, /RCP-1 — passed \(exit 0\)/);
  assert.match(receiptText, /no shell; structured argv/);
  assert.match(receiptText, /hashes:\s+stdout [a-f0-9]{12}…/);
  assert.match(receiptText, /Full output is not shown here/);
  assert.equal(receiptText.includes("\nok\n"), false, "stdout content is not dumped");

  const claim = await runProof(root, "CLM-1");
  assert.match(claim.lines.join("\n"), /CLM-1 — the recorded command passes/);
  assert.match((await runProof(root, "RCP-9")).lines.join("\n"), /No receipt RCP-9/);
  assert.match((await runProof(root, "NF-9")).lines.join("\n"), /No work item NF-9/);
});

test("/voila complete lists EVERY failing gate and changes nothing", async () => {
  const root = await projectRoot();
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const result = await runComplete(root, "NF-1");
  const text = result.lines.join("\n");
  assert.equal(result.level, "warning");
  assert.match(text, /Cannot complete NF-1: \d+ gate\(s\) fail/);
  assert.match(text, /required claims attached/);
  assert.match(text, /every acceptance criterion covered by a required claim/);
  assert.match(text, /every required claim supported by current passing evidence/);
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "bytes unchanged");

  assert.match((await runComplete(root)).lines.join("\n"), /Usage: \/voila complete NF-n/);
});

test("/voila complete succeeds on a fully proven item", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) => setFocusWorkItem(cur, "NF-1"));
  const result = await runComplete(root, "NF-1");
  assert.equal(result.level, "info");
  assert.match(result.lines.join("\n"), /Completed NF-1 — Verified outcome/);
  assert.match(result.lines.join("\n"), /Focus was cleared/);
  assert.equal((await loadState(root)).workItems[0]?.status, "completed");
});

// --- Doctor ---

test("doctor passes on a healthy proof state", async () => {
  const root = await proveRoot();
  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "proof references").level, "pass");
  assert.equal(check(checks, "claim criterion agreement").level, "pass");
  assert.equal(check(checks, "receipt artifacts").level, "pass");
  assert.equal(check(checks, "receipt output hashes").level, "pass");
  assert.equal(check(checks, "evidence freshness").level, "pass");
  assert.equal(check(checks, "acceptance criterion coverage").level, "pass");
  assert.deepEqual(
    checks.filter((c) => c.level === "fail"),
    [],
  );
});

test("doctor warns when a project has no claims at all", async () => {
  const root = await projectRoot();
  const checks = await runDoctor(doctorInput(root));
  const proof = check(checks, "proof");
  assert.equal(proof.level, "warn");
  assert.match(proof.detail, /no claims or receipts recorded/);
});

test("doctor detects a claim referencing a missing work item and a broken receipt link", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) => ({
    ...cur,
    claims: cur.claims.map((c) => ({
      ...c,
      workItemId: "NF-404",
      receiptIds: [...c.receiptIds, "RCP-404"],
    })),
  }));
  const checks = await runDoctor(doctorInput(root));
  const refs = check(checks, "proof references");
  assert.equal(refs.level, "fail");
  assert.match(refs.detail, /references missing work item NF-404/);
  assert.match(refs.detail, /links missing receipt RCP-404/);
});

test("doctor detects a required claim that belongs to another work item", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) => {
    const withSecond = createWorkItem(cur, { kind: "task", title: "Other" }, "T");
    return {
      ...withSecond,
      workItems: withSecond.workItems.map((w) =>
        w.id === "NF-2" ? { ...w, requiredClaimIds: ["CLM-1"] } : w,
      ),
    };
  });
  const refs = check(await runDoctor(doctorInput(root)), "proof references");
  assert.equal(refs.level, "fail");
  assert.match(refs.detail, /NF-2 requires CLM-1, which is about NF-1/);
});

test("doctor detects a claim/work-item criterion mismatch", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) =>
    updateWorkItem(cur, { id: "NF-1", acceptanceCriteria: ["a completely new criterion"] }, "T"),
  );
  const checks = await runDoctor(doctorInput(root));
  const mismatch = check(checks, "claim criterion agreement");
  assert.equal(mismatch.level, "fail");
  assert.match(mismatch.detail, /covers a criterion NF-1 no longer states/);
  assert.equal(check(checks, "acceptance criterion coverage").level, "warn");
});

test("doctor detects missing receipt artifacts", async () => {
  const root = await proveRoot();
  await rm(receiptPaths(root, "RCP-1").dir, { recursive: true, force: true });
  const artifacts = check(await runDoctor(doctorInput(root)), "receipt artifacts");
  assert.equal(artifacts.level, "fail");
  assert.match(artifacts.detail, /RCP-1: artifact directory missing/);
});

test("doctor detects a manifest that disagrees with canonical metadata", async () => {
  const root = await proveRoot();
  const manifest = await readReceiptManifest(root, "RCP-1");
  await writeFile(
    receiptPaths(root, "RCP-1").manifest,
    `${JSON.stringify({ ...manifest, result: "failed", exitCode: 9 }, null, 2)}\n`,
    "utf8",
  );
  const artifacts = check(await runDoctor(doctorInput(root)), "receipt artifacts");
  assert.equal(artifacts.level, "fail");
  assert.match(artifacts.detail, /manifest disagrees with canonical metadata/);
  assert.match(artifacts.detail, /result/);
});

test("doctor detects a modified receipt output file via its hash", async () => {
  const root = await proveRoot();
  await writeFile(receiptPaths(root, "RCP-1").stdout, "tampered\n", "utf8");
  const hashes = check(await runDoctor(doctorInput(root)), "receipt output hashes");
  assert.equal(hashes.level, "fail");
  assert.match(hashes.detail, /RCP-1: stdout\.txt hash mismatch/);
});

test("doctor treats development staleness as informational, not structural", async () => {
  const root = await proveRoot();
  const before = await readFile(statePaths(root).projectJson, "utf8");
  await writeFile(join(root, "tracked.txt"), "changed\n", "utf8");

  const checks = await runDoctor(doctorInput(root));
  const reconciliation = check(checks, "evidence reconciliation");
  assert.equal(reconciliation.level, "info", "editing files is not a structural fault");
  assert.match(reconciliation.detail, /1 claim\(s\) affected by current development changes/);
  assert.match(reconciliation.detail, /reconciles at the completion boundary/);
  // Nothing tells the developer to go refresh anything, and the run is read-only.
  assert.doesNotMatch(reconciliation.detail, /re-run|refresh/i);
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "doctor is read-only");

  // Structural health is reported separately from readiness drift.
  const formatted = formatDoctor(checks).join("\n");
  assert.match(formatted, /\[INFO\] evidence reconciliation/);
  assert.match(formatted, /Structural health: OK/);
  assert.equal(worstLevel(checks), "info", "an INFO item never escalates the notification");
});

test("doctor still warns when current evidence actually contradicts a claim", async () => {
  const root = await proveRoot();
  // A receipt recorded at the CURRENT repository state that failed: not staleness, a real failure.
  await run(
    tool("voila_run_verification"),
    { claimId: "CLM-1", executable: NODE, args: ["-e", "process.exit(3)"] },
    root,
  );
  const freshness = check(await runDoctor(doctorInput(root)), "evidence freshness");
  assert.equal(freshness.level, "warn");
  assert.match(freshness.detail, /CLM-1 is unsupported/);
});

test("doctor detects duplicate claim IDs through canonical validation", async () => {
  const root = await proveRoot();
  const state = await loadState(root);
  const duplicated = { ...state, claims: [...state.claims, state.claims[0]] };
  await writeFile(statePaths(root).projectJson, `${JSON.stringify(duplicated, null, 2)}\n`, "utf8");
  const checks = await runDoctor(doctorInput(root));
  const valid = check(checks, "canonical state valid");
  assert.equal(valid.level, "fail");
  assert.match(valid.detail, /duplicate id CLM-1/);
});

test("doctor detects an out-of-date claim/receipt counter", async () => {
  const root = await proveRoot();
  await updateState(root, (cur) => ({
    ...cur,
    sequences: { ...cur.sequences, claim: 1, receipt: 1 },
  }));
  const counters = check(await runDoctor(doctorInput(root)), "id counter consistency");
  assert.equal(counters.level, "fail");
  assert.match(counters.detail, /CLM next=1 <= max used 1/);
  assert.match(counters.detail, /RCP next=1 <= max used 1/);
});

test("doctor reports leftover receipt staging directories", async () => {
  const root = await proveRoot();
  const staging = join(statePaths(root).receiptsTempDir, "rcp-orphan");
  await mkdir(staging, { recursive: true });
  const leftovers = check(await runDoctor(doctorInput(root)), "receipt staging directories");
  assert.equal(leftovers.level, "warn");
  assert.match(leftovers.detail, /leftover temp dir\(s\)/);
  assert.match(leftovers.detail, /rcp-orphan/);
  assert.match(leftovers.detail, /safe to delete/);
});

test("completed work whose evidence merely went stale is informational, never reverted", async () => {
  const root = await proveRoot();
  await run(tool("voila_complete_work_item"), { workItemId: "NF-1" }, root);
  // The repository moves: the receipt that justified completion is no longer current.
  await writeFile(join(root, "tracked.txt"), "moved on\n", "utf8");

  const before = await readFile(statePaths(root).projectJson, "utf8");
  const checks = await runDoctor(doctorInput(root));
  const evidence = check(checks, "completed work evidence");
  assert.equal(evidence.level, "info", "ordinary staleness is not a structural fault");
  assert.match(evidence.detail, /NF-1/);
  assert.match(evidence.detail, /completion record stands/);
  assert.equal(
    checks.find((c) => c.name === "completed work revalidation"),
    undefined,
    "staleness alone does not raise the revalidation warning",
  );

  // The completed status is untouched and no bytes changed.
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before);
  assert.equal((await loadState(root)).workItems[0]?.status, "completed");
});

test("doctor WARNS (never reverts) when a completed item's evidence actually fails now", async () => {
  const root = await proveRoot();
  await run(tool("voila_complete_work_item"), { workItemId: "NF-1" }, root);
  // A receipt at the CURRENT state that failed: the completion record is no longer supportable, and
  // that is not ordinary development drift.
  await run(
    tool("voila_run_verification"),
    { claimId: "CLM-1", executable: NODE, args: ["-e", "process.exit(4)"] },
    root,
  );

  const before = await readFile(statePaths(root).projectJson, "utf8");
  const revalidation = check(await runDoctor(doctorInput(root)), "completed work revalidation");
  assert.equal(revalidation.level, "warn", "a warning, never a failure that implies reversion");
  assert.match(revalidation.detail, /current evidence no longer supports revalidating/);
  assert.match(revalidation.detail, /NF-1/);
  assert.match(revalidation.detail, /not ordinary staleness/);

  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before);
  assert.equal((await loadState(root)).workItems[0]?.status, "completed");
});

test("doctor passes revalidation while completed work still has current evidence", async () => {
  const root = await proveRoot();
  await run(tool("voila_complete_work_item"), { workItemId: "NF-1" }, root);
  const revalidation = check(await runDoctor(doctorInput(root)), "completed work revalidation");
  assert.equal(revalidation.level, "pass");
});

test("doctor warns that migration is required for a v3 project", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-v3-"));
  await mkdir(statePaths(root).dir, { recursive: true });
  const { V3_FIXTURE } = await import("./helpers.ts");
  await writeFile(statePaths(root).projectJson, `${JSON.stringify(V3_FIXTURE, null, 2)}\n`, "utf8");
  const migration = check(await runDoctor(doctorInput(root)), "schema migration");
  assert.equal(migration.level, "warn");
  assert.match(migration.detail, /v3 state; migration to v4 is required/);
  assert.match(migration.detail, /\/voila migrate --apply/);
});
