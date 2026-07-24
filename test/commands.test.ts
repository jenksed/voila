import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runInit } from "../src/commands/init.ts";
import { runStatus } from "../src/commands/status.ts";
import { runDoctor, type DoctorInput } from "../src/commands/doctor.ts";
import { loadState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "newfang-cmd-"));
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

test("runInit creates state and reports created", async () => {
  const root = await tempRoot();
  const result = await runInit(root);
  assert.equal(result.level, "info");
  assert.ok(result.state);
  assert.ok(existsSync(statePaths(root).projectJson));
});

test("runInit refuses to overwrite and leaves revision unchanged", async () => {
  const root = await tempRoot();
  await runInit(root);
  const before = await loadState(root);
  const second = await runInit(root);
  assert.equal(second.level, "warning");
  const after = await loadState(root);
  assert.equal(after.revision, before.revision);
  assert.equal(after.projectId, before.projectId);
});

test("runStatus reads persisted state", async () => {
  const root = await tempRoot();
  await runInit(root);
  const result = await runStatus(root);
  assert.equal(result.level, "info");
  assert.match(result.lines.join("\n"), /phase:\s+research/);
});

test("runStatus warns when uninitialized", async () => {
  const root = await tempRoot();
  const result = await runStatus(root);
  assert.equal(result.level, "warning");
  assert.match(result.lines.join("\n"), /\/newfang init/);
});

test("runStatus errors on malformed state", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, "{ broken", "utf8");
  const result = await runStatus(root);
  assert.equal(result.level, "error");
});

test("runStatus is stable across repeated loads (restart parity)", async () => {
  const root = await tempRoot();
  await runInit(root);
  const first = await runStatus(root);
  const second = await runStatus(root);
  assert.deepEqual(first.lines, second.lines);
});

test("runDoctor passes on a healthy initialized project", async () => {
  const root = await tempRoot();
  await runInit(root);
  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "pi version").level, "pass");
  assert.equal(check(checks, "node version").level, "pass");
  assert.equal(check(checks, "newfang state").level, "pass");
  assert.equal(check(checks, "schema valid").level, "pass");
  assert.equal(check(checks, "generated view").level, "pass");
});

test("runDoctor fails the node check below the minimum", async () => {
  const root = await tempRoot();
  await runInit(root);
  const checks = await runDoctor(doctorInput(root, { nodeVersion: "v20.0.0" }));
  assert.equal(check(checks, "node version").level, "fail");
});

test("runDoctor warns on a Pi version mismatch and on missing state", async () => {
  const root = await tempRoot();
  const mismatch = await runDoctor(doctorInput(root, { piVersion: "0.80.0" }));
  assert.equal(check(mismatch, "pi version").level, "warn");
  assert.equal(check(mismatch, "newfang state").level, "warn");
});

test("runDoctor warns when Pi version cannot be determined", async () => {
  const root = await tempRoot();
  await runInit(root);
  const checks = await runDoctor(doctorInput(root, { piVersion: "unknown" }));
  assert.equal(check(checks, "pi version").level, "warn");
});
