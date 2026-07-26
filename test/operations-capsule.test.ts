// Focus-capsule tests for R2A bounded operation summary.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, updateState } from "../src/state/store.ts";
import { ensureR2ARegistry } from "../src/state/operations-registry.ts";
import { assembleContext } from "../src/context/assemble.ts";
import { FiniteOperationSupervisor } from "../src/state/operations-runtime.ts";

async function initedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-capsule-"));
  await mkdir(join(root, ".git"), { recursive: true });
  await writeFile(join(root, "README.md"), "# ops\n", "utf8");
  await initState(root, { displayName: "ops-fixture" });
  return root;
}

import { mkdir } from "node:fs/promises";

async function grantR2AAuthority(root: string): Promise<void> {
  await updateState(root, (cur) => ({
    ...cur,
    sequences: { ...cur.sequences, decision: 23 },
    decisions: [
      ...cur.decisions,
      {
        id: "DEC-22",
        title: "R2A fixture authority",
        decision: "Authorize the accepted fixture operation.",
        rationale: "Exercise the canonical authority boundary.",
        status: "accepted",
        createdAt: "2026-07-26T22:30:00.000Z",
        updatedAt: "2026-07-26T22:30:00.000Z",
      },
    ],
  }));
}

test("capsule omits operation lines when no run has been recorded", async () => {
  const root = await initedRoot();
  const capsule = await assembleContext(root, { continuation: false });
  assert.equal(capsule.includes("Active operation"), false);
  assert.equal(capsule.includes("Settled operation"), false);
});

test("capsule includes one bounded active operation line while a run is in flight", async () => {
  const root = await initedRoot();
  await ensureR2ARegistry(root);
  await grantR2AAuthority(root);
  const supervisor = new FiniteOperationSupervisor(root);
  // Use a long-running definition so the run is still active when we read the capsule.
  // The accepted operation's executable is `mise`, so we keep the `exec --` separator to ensure
  // mise forwards the rest of the argv to node rather than parsing it as its own options.
  await updateState(
    root,
    (cur) => ({
      ...cur,
      operationDefinitions: cur.operationDefinitions.map((d) =>
        d.id === "r2a.state-store-tests"
          ? {
              ...d,
              timeoutContract: {
                startupMs: 5_000,
                totalMs: 30_000,
                gracefulMs: 500,
                forcedMs: 500,
              },
              args: ["exec", "--", "node", "-e", "setTimeout(()=>{}, 1500)"],
            }
          : d,
      ),
    }),
    { type: "r2a-fixture-override" },
  );
  const outcome = await supervisor.start("r2a.state-store-tests", {
    requester: "capsule-test",
    owner: "project-steward",
  });
  assert.equal(outcome.kind, "ok");

  const capsule = await assembleContext(root, { continuation: false });
  assert.match(capsule, /Active operation: r2a\.state-store-tests · running/);
  // No output is injected.
  assert.equal(capsule.includes("stdout"), false);
  assert.equal(capsule.includes("stderr"), false);
  // Wait for natural close and recorded delivery before acknowledging.
  let final = outcome.run;
  for (let i = 0; i < 400; i++) {
    final = (await supervisor.inspect(outcome.run.id))!;
    if (final.deliveryState === "delivered") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  assert.equal(final.deliveryState, "delivered", "settlement delivered before acknowledgement");
  // Acknowledge to release buffered output and remove the operation line.
  await supervisor.acknowledge(outcome.run.id);
  const after = await assembleContext(root, { continuation: false });
  assert.equal(after.includes("Active operation"), false);
  assert.equal(after.includes("Settled operation"), false);
});

test(
  "capsule surfaces settled operation until acknowledged, then omits",
  // Node 22 refuses nested `node --test` invocations; running the real operation from inside
  // the project test runner would recurse.
  { skip: process.env.NODE_TEST_CONTEXT !== undefined },
  async () => {
    const root = await initedRoot();
    await ensureR2ARegistry(root);
    await grantR2AAuthority(root);
    const supervisor = new FiniteOperationSupervisor(root);
    const outcome = await supervisor.start("r2a.state-store-tests", {
      requester: "capsule-test",
      owner: "project-steward",
    });
    assert.equal(outcome.kind, "ok");
    let final = outcome.run;
    for (let i = 0; i < 400; i++) {
      final = (await supervisor.inspect(outcome.run.id))!;
      if (
        final.lifecycleState !== "queued" &&
        final.lifecycleState !== "starting" &&
        final.lifecycleState !== "running"
      )
        break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(final.lifecycleState, "passed");

    // The settled line is present until acknowledged.
    const settledCapsule = await assembleContext(root, { continuation: false });
    assert.match(settledCapsule, /Settled operation: r2a\.state-store-tests · passed/);

    // Acknowledge and re-read.
    await supervisor.acknowledge(outcome.run.id);
    const after = await assembleContext(root, { continuation: false });
    assert.equal(after.includes("Settled operation"), false);
  },
);
