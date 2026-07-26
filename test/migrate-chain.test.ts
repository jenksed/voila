// Migration chain toward the current schema version from v2 and v1 sources.
// The v3 -> v4 step's own semantics live in migrate-v4.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigration } from "../src/state/migration.ts";
import { initState, loadState, readRawState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { StateValidationError, UnknownSchemaVersionError } from "../src/state/errors.ts";
import { MigrationRequiredError } from "../src/state/errors.ts";
import { renderStatusView } from "../src/domain/status.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import { V1_FIXTURE, V2_FIXTURE } from "./helpers.ts";

async function seed(raw: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-migchain-"));
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return root;
}

test("valid v2 inspection reports the chained 2 -> 3 -> 4 migration without writing", async () => {
  const root = await seed(V2_FIXTURE);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: false });
  assert.equal(report.status, "inspectable");
  assert.equal(report.fromVersion, 2);
  assert.equal(report.toVersion, SCHEMA_VERSION);
  assert.deepEqual(report.steps, [
    { from: 2, to: 3 },
    { from: 3, to: 4 },
  ]);
  assert.ok(report.additions.some((a) => a.name === "intakes"));
  assert.ok(report.additions.some((a) => a.name === "orientations"));
  assert.ok(report.additions.some((a) => a.name === "claims"));
  assert.ok(report.additions.some((a) => a.name === "receipts"));
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "no write on inspect");
});

test("loading v2 reports migration required (never silent)", async () => {
  const root = await seed(V2_FIXTURE);
  await assert.rejects(() => loadState(root), MigrationRequiredError);
  assert.equal((await readRawState(root)).version, 2);
});

test("v2 migrates to the current version preserving identity and existing operations", async () => {
  const root = await seed(V2_FIXTURE);
  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "migrated");

  const migrated = await loadState(root);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.projectId, V2_FIXTURE.projectId);
  assert.equal(migrated.createdAt, V2_FIXTURE.createdAt);
  assert.equal(migrated.displayName, V2_FIXTURE.displayName);
  assert.equal(migrated.revision, V2_FIXTURE.revision + 1);
  // Existing operations carried over intact.
  assert.equal(migrated.workItems.length, V2_FIXTURE.workItems.length);
  assert.equal(migrated.decisions.length, V2_FIXTURE.decisions.length);
  assert.equal(migrated.focusWorkItemId, V2_FIXTURE.focusWorkItemId);
  assert.equal(migrated.nextActionRationale, V2_FIXTURE.nextActionRationale);
  // v3 collections default empty; v3 sequences start at 1.
  assert.deepEqual(migrated.intakes, []);
  assert.deepEqual(migrated.orientations, []);
  assert.equal(migrated.sequences.intake, 1);
  assert.equal(migrated.sequences.orientation, 1);
  assert.equal(migrated.currentIntakeId, undefined);
  // v4 collections default empty; v4 sequences start at 1.
  assert.deepEqual(migrated.claims, []);
  assert.deepEqual(migrated.receipts, []);
  assert.equal(migrated.sequences.claim, 1);
  assert.equal(migrated.sequences.receipt, 1);
  // Existing counters preserved.
  assert.equal(migrated.sequences.workItem, V2_FIXTURE.sequences.workItem);
});

test("migration writes a timestamped backup of the original bytes", async () => {
  const root = await seed(V2_FIXTURE);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: true });
  assert.ok(report.backupLocation && existsSync(report.backupLocation));
  assert.equal(await readFile(report.backupLocation as string, "utf8"), before);
  assert.match(report.backupLocation as string, /project\.json\.v2\./);
});

test("migration appends one event and refreshes the generated view", async () => {
  const root = await seed(V2_FIXTURE);
  await runMigration(root, { apply: true });
  const state = await loadState(root);
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const migrations = events.filter((e) => e.type === "schema_migrated");
  assert.equal(migrations.length, 1, "exactly one migration event");
  assert.equal(migrations[0].from, 2);
  assert.equal(migrations[0].to, SCHEMA_VERSION);
  assert.equal(await readFile(statePaths(root).statusView, "utf8"), renderStatusView(state));
});

test("rerunning migration on the current version is a safe no-op", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-migchain-"));
  await initState(root, { displayName: "demo" });
  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "noop");
  assert.deepEqual(report.steps, []);
});

test("v1 migrates through the full chain to the current version", async () => {
  const root = await seed(V1_FIXTURE);
  const inspect = await runMigration(root, { apply: false });
  assert.deepEqual(inspect.steps, [
    { from: 1, to: 2 },
    { from: 2, to: 3 },
    { from: 3, to: 4 },
  ]);
  await runMigration(root, { apply: true });
  const migrated = await loadState(root);
  assert.equal(migrated.schemaVersion, SCHEMA_VERSION);
  assert.equal(migrated.projectId, V1_FIXTURE.projectId);
  assert.deepEqual(migrated.workItems, []);
  assert.deepEqual(migrated.intakes, []);
  assert.deepEqual(migrated.claims, []);
  assert.equal(migrated.sequences.orientation, 1);
  assert.equal(migrated.sequences.receipt, 1);
});

test("unknown source version is rejected", async () => {
  const root = await seed({ schemaVersion: 99, projectId: "x" });
  await assert.rejects(() => runMigration(root, { apply: false }), UnknownSchemaVersionError);
  await assert.rejects(() => loadState(root), UnknownSchemaVersionError);
});

test("malformed v2 is refused and leaves canonical bytes intact", async () => {
  const bad = { ...V2_FIXTURE, phase: "not-a-phase" };
  const root = await seed(bad);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  await assert.rejects(() => runMigration(root, { apply: true }), StateValidationError);
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before);
  const hasBackups =
    existsSync(statePaths(root).backupsDir) &&
    (await readdir(statePaths(root).backupsDir)).length > 0;
  assert.equal(hasBackups, false, "no backup written for a refused migration");
});

test("malformed v2 entity content is caught by candidate validation", async () => {
  const bad = { ...V2_FIXTURE, workItems: [{ id: "NF-1" }] };
  const root = await seed(bad);
  await assert.rejects(() => runMigration(root, { apply: true }), StateValidationError);
});
