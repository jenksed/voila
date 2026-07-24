import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigration } from "../src/state/migration.ts";
import { loadState, initState, readRawState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { StateValidationError, UnknownSchemaVersionError } from "../src/state/errors.ts";
import { renderStatusView } from "../src/domain/status.ts";
import { V1_FIXTURE } from "./helpers.ts";

async function withV1(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "newfang-migrate-"));
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, `${JSON.stringify(V1_FIXTURE, null, 2)}\n`, "utf8");
  return root;
}

test("inspecting a v1 project reports the supported 1 -> 2 migration", async () => {
  const root = await withV1();
  const report = await runMigration(root, { apply: false });
  assert.equal(report.status, "inspectable");
  assert.equal(report.fromVersion, 1);
  assert.equal(report.toVersion, 2);
  assert.ok(report.additions.length >= 4);
  assert.ok(report.safe);
  // No write happened.
  assert.equal((await readRawState(root)).version, 1);
});

test("applying migration produces valid v2, backup, identity preservation, event, and view", async () => {
  const root = await withV1();
  const before = await readFile(statePaths(root).projectJson, "utf8");

  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "migrated");
  assert.ok(report.backupLocation && existsSync(report.backupLocation));

  // Backup contains the original v1 bytes.
  assert.equal(await readFile(report.backupLocation as string, "utf8"), before);

  // Canonical is now valid v2 with preserved identity and bumped revision.
  const v2 = await loadState(root);
  assert.equal(v2.schemaVersion, 2);
  assert.equal(v2.projectId, V1_FIXTURE.projectId);
  assert.equal(v2.createdAt, V1_FIXTURE.createdAt);
  assert.equal(v2.displayName, V1_FIXTURE.displayName);
  assert.equal(v2.revision, V1_FIXTURE.revision + 1);
  assert.deepEqual(v2.workItems, []);

  // Migration event appended.
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.ok(events.some((e) => e.type === "schema_migrated" && e.from === 1 && e.to === 2));

  // Status view regenerated and consistent.
  const view = await readFile(statePaths(root).statusView, "utf8");
  assert.equal(view, renderStatusView(v2));
});

test("rerunning migration on v2 is a safe no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-migrate-"));
  await initState(root, { displayName: "demo" });
  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "noop");
});

test("unknown source version is rejected", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-migrate-"));
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, JSON.stringify({ schemaVersion: 7 }), "utf8");
  await assert.rejects(() => runMigration(root, { apply: false }), UnknownSchemaVersionError);
});

test("malformed v1 is refused and leaves canonical bytes intact", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-migrate-"));
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  const bad = JSON.stringify({ schemaVersion: 1, displayName: "x" }); // missing required fields
  await writeFile(paths.projectJson, bad, "utf8");
  await assert.rejects(() => runMigration(root, { apply: true }), StateValidationError);
  assert.equal(await readFile(paths.projectJson, "utf8"), bad);
  // No backups created.
  const hasBackups = existsSync(paths.backupsDir) && (await readdir(paths.backupsDir)).length > 0;
  assert.equal(hasBackups, false);
});
