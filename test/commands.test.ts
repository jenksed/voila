import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../src/commands/init.ts";
import { runStatus } from "../src/commands/status.ts";
import { runBacklog } from "../src/commands/backlog.ts";
import { runDecisions, runAssumptions, runRisks } from "../src/commands/lists.ts";
import { runMigrate } from "../src/commands/migrate.ts";
import { runDoctor, type DoctorInput } from "../src/commands/doctor.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { createWorkItem, recordDecision, recordRisk } from "../src/domain/operations.ts";
import { createInitialState } from "../src/domain/defaults.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import { V1_FIXTURE } from "./helpers.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "voila-cmd-"));
}

async function seededRoot(): Promise<string> {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await updateState(root, (s) =>
    createWorkItem(s, { kind: "task", title: "A", status: "ready", priority: "high" }, "T"),
  );
  await updateState(root, (s) =>
    recordDecision(s, { title: "d", decision: "x", rationale: "y", status: "accepted" }, "T"),
  );
  await updateState(root, (s) =>
    recordRisk(s, { statement: "r", likelihood: "high", impact: "high" }, "T"),
  );
  return root;
}

function doctorInput(root: string, over: Partial<DoctorInput> = {}): DoctorInput {
  return {
    root,
    piVersion: "0.82.0",
    expectedPiVersion: "0.82.0",
    nodeVersion: "v22.23.1",
    minNode: "22.19.0",
    ...over,
  };
}

function check(checks: Awaited<ReturnType<typeof runDoctor>>, name: string) {
  const c = checks.find((x) => x.name === name);
  assert.ok(c, `check "${name}" present`);
  return c;
}

test("runInit creates state; second init refuses", async () => {
  const root = await tempRoot();
  assert.equal((await runInit(root)).level, "info");
  assert.equal((await runInit(root)).level, "warning");
});

test("runStatus reads v2 state and shows operations summary", async () => {
  const root = await seededRoot();
  const r = await runStatus(root);
  assert.equal(r.level, "info");
  assert.match(r.lines.join("\n"), /operations:/);
});

test("runStatus warns uninitialized and on migration-required", async () => {
  const empty = await tempRoot();
  assert.equal((await runStatus(empty)).level, "warning");

  const v1 = await tempRoot();
  await mkdir(statePaths(v1).dir, { recursive: true });
  await writeFile(statePaths(v1).projectJson, JSON.stringify(V1_FIXTURE), "utf8");
  const r = await runStatus(v1);
  assert.equal(r.level, "warning");
  assert.match(r.lines.join("\n"), /migrate/);
});

test("runBacklog: empty, summary, and detail by ID", async () => {
  const empty = await tempRoot();
  await initState(empty, { displayName: "demo" });
  assert.match((await runBacklog(empty)).lines.join("\n"), /0 items/);

  const seeded = await seededRoot();
  assert.match((await runBacklog(seeded)).lines.join("\n"), /Ready/);
  assert.match((await runBacklog(seeded, "NF-1")).lines.join("\n"), /NF-1 — A/);
  assert.equal((await runBacklog(seeded, "NF-9")).level, "warning");
});

test("list commands render decisions/assumptions/risks", async () => {
  const root = await seededRoot();
  assert.match((await runDecisions(root)).lines.join("\n"), /DEC-1/);
  assert.match((await runAssumptions(root)).lines.join("\n"), /No assumptions/);
  assert.match((await runRisks(root)).lines.join("\n"), /RSK-1/);
});

test("runMigrate inspects then applies", async () => {
  const root = await tempRoot();
  await mkdir(statePaths(root).dir, { recursive: true });
  await writeFile(statePaths(root).projectJson, `${JSON.stringify(V1_FIXTURE, null, 2)}\n`, "utf8");

  const inspect = await runMigrate(root, false);
  assert.match(
    inspect.lines.join("\n"),
    new RegExp(`Migration available: v1 -> v${SCHEMA_VERSION}`),
  );

  const applied = await runMigrate(root, true);
  assert.match(applied.lines.join("\n"), new RegExp(`Migrated schema v1 -> v${SCHEMA_VERSION}`));
  assert.equal((await loadState(root)).schemaVersion, SCHEMA_VERSION);

  assert.match(
    (await runMigrate(root, false)).lines.join("\n"),
    new RegExp(`already v${SCHEMA_VERSION}`),
  );
});

test("runDoctor passes on a healthy seeded project", async () => {
  const root = await seededRoot();
  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "schema migration").level, "pass");
  assert.equal(check(checks, "canonical state valid").level, "pass");
  assert.equal(check(checks, "id counter consistency").level, "pass");
  assert.equal(check(checks, "work-item references").level, "pass");
  assert.equal(check(checks, "dependency cycles").level, "pass");
  assert.equal(check(checks, "generated view").level, "pass");
});

test("runDoctor warns migration-required for v1 and fails node below minimum", async () => {
  const v1 = await tempRoot();
  await mkdir(statePaths(v1).dir, { recursive: true });
  await writeFile(statePaths(v1).projectJson, JSON.stringify(V1_FIXTURE), "utf8");
  assert.equal(check(await runDoctor(doctorInput(v1)), "schema migration").level, "warn");

  const seeded = await seededRoot();
  assert.equal(
    check(await runDoctor(doctorInput(seeded, { nodeVersion: "v20.0.0" })), "node version").level,
    "fail",
  );
});

test("runDoctor detects dangling references, cycles, and bad ID counters", async () => {
  // Hand-craft a schema-valid but referentially broken current-schema state.
  const s = createInitialState({ displayName: "demo", now: "T", projectId: "id" });
  const broken = {
    ...s,
    sequences: { ...s.sequences, workItem: 1 }, // stale: less than used NF-5
    workItems: [
      {
        id: "NF-5",
        kind: "task",
        title: "A",
        status: "backlog",
        priority: "normal",
        acceptanceCriteria: [],
        dependsOn: ["NF-6", "NF-99"],
        requiredClaimIds: [],
        createdAt: "T",
        updatedAt: "T",
      },
      {
        id: "NF-6",
        kind: "task",
        title: "B",
        status: "backlog",
        priority: "normal",
        acceptanceCriteria: [],
        dependsOn: ["NF-5"],
        requiredClaimIds: [],
        createdAt: "T",
        updatedAt: "T",
      },
    ],
  };
  const root = await tempRoot();
  await mkdir(statePaths(root).dir, { recursive: true });
  await writeFile(statePaths(root).projectJson, `${JSON.stringify(broken, null, 2)}\n`, "utf8");

  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "id counter consistency").level, "fail");
  assert.equal(check(checks, "work-item references").level, "fail");
  assert.equal(check(checks, "dependency cycles").level, "fail");
});
