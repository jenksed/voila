// Legacy `.newfang/` -> `.voila/` state-directory migration.
//
// These tests deliberately construct `.newfang/` trees. That is the one place the legacy brand is
// allowed in active code, and it exists so real pre-rename projects have a safe path forward.

import { test } from "node:test";
import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  LEGACY_STATE_DIR,
  LegacyStateMigrationRequiredError,
  StateDirectoryConflictError,
  hashStateTree,
  stateDirectoryStatus,
} from "../src/state/legacy.ts";
import {
  applyLegacyMigration,
  inspectLegacyMigration,
  rollbackMigration,
  verifyMigratedTree,
} from "../src/state/legacy-migration.ts";
import { runMigrate } from "../src/commands/migrate.ts";
import { runInit } from "../src/commands/init.ts";
import { runDoctor } from "../src/commands/doctor.ts";
import { initState, loadState } from "../src/state/store.ts";
import { statePaths, VOILA_DIR } from "../src/state/paths.ts";
import { StateValidationError } from "../src/state/errors.ts";
import { renderStatusView } from "../src/domain/status.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import { V1_FIXTURE } from "./helpers.ts";

const DOCTOR_ENV = {
  piVersion: "0.82.0",
  expectedPiVersion: "0.82.0",
  nodeVersion: "v22.23.1",
  minNode: "22.19.0",
};

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "voila-legacy-"));
}

/**
 * Build a realistic legacy project: canonical state plus immutable intake, orientation, and
 * receipt artifacts, an append-only review log, and event history.
 */
async function withLegacyProject(): Promise<{ root: string; legacyDir: string }> {
  const root = await tempRoot();

  // Build the state through supported code, then move it to the legacy name so the fixture is a
  // genuine Voila tree rather than a hand-written approximation.
  await initState(root, { displayName: "newfang", now: "2026-07-24T00:00:00.000Z" });
  const paths = statePaths(root);

  await mkdir(join(paths.intakesDir, "INT-1", "drafts"), { recursive: true });
  await mkdir(join(paths.intakesDir, "INT-1", "understandings"), { recursive: true });
  await writeFile(
    join(paths.intakesDir, "INT-1", "source.md"),
    "# Source\nNewFang plan.\n",
    "utf8",
  );
  await writeFile(
    join(paths.intakesDir, "INT-1", "drafts", "0001.json"),
    '{"draftRevision":1}\n',
    "utf8",
  );
  await writeFile(
    join(paths.intakesDir, "INT-1", "understandings", "0001.md"),
    "# Understanding\n",
    "utf8",
  );
  await writeFile(
    join(paths.intakesDir, "INT-1", "reviews.jsonl"),
    '{"action":"revision_requested","reviewedRevision":1}\n{"action":"accepted","reviewedRevision":1}\n',
    "utf8",
  );

  await mkdir(join(paths.orientationsDir, "ORI-1"), { recursive: true });
  await writeFile(
    join(paths.orientationsDir, "ORI-1", "ORIENTATION.md"),
    "# Orientation\n",
    "utf8",
  );

  await mkdir(join(paths.receiptsDir, "RCP-1"), { recursive: true });
  await writeFile(join(paths.receiptsDir, "RCP-1", "stdout.txt"), "355 tests passed\n", "utf8");
  await writeFile(join(paths.receiptsDir, "RCP-1", "stderr.txt"), "", "utf8");
  await writeFile(
    join(paths.receiptsDir, "RCP-1", "manifest.json"),
    '{"receiptId":"RCP-1","result":"pass"}\n',
    "utf8",
  );

  const { rename } = await import("node:fs/promises");
  const legacyDir = join(root, LEGACY_STATE_DIR);
  await rename(paths.dir, legacyDir);
  return { root, legacyDir };
}

// --- Four-case detection ---

test("neither state directory present is a normal uninitialized project", async () => {
  const root = await tempRoot();
  assert.equal(stateDirectoryStatus(root).kind, "none");

  const result = await runInit(root);
  assert.equal(result.level, "info");
  assert.ok(existsSync(join(root, VOILA_DIR, "project.json")));
  assert.equal(stateDirectoryStatus(root).kind, "current");
});

test("only .voila/ present is normal operation", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  assert.equal(stateDirectoryStatus(root).kind, "current");
  const state = await loadState(root);
  assert.equal(state.displayName, "demo");
});

test("only .newfang/ present raises an explicit legacy migration requirement", async () => {
  const { root } = await withLegacyProject();
  assert.equal(stateDirectoryStatus(root).kind, "legacy");
  await assert.rejects(() => loadState(root), LegacyStateMigrationRequiredError);
});

test("both directories present is a hard failure that names both paths", async () => {
  const { root, legacyDir } = await withLegacyProject();
  await mkdir(join(root, VOILA_DIR), { recursive: true });
  assert.equal(stateDirectoryStatus(root).kind, "conflict");

  await assert.rejects(() => loadState(root), StateDirectoryConflictError);

  const result = await runMigrate(root, true);
  assert.equal(result.level, "error");
  const text = result.lines.join("\n");
  assert.match(text, /both state directories exist/i);
  assert.ok(text.includes(legacyDir), "names the legacy path");
  assert.ok(text.includes(join(root, VOILA_DIR)), "names the current path");
  // Refusal must not have moved anything.
  assert.ok(existsSync(legacyDir));
});

// --- Read-only inspection ---

test("migration inspection is read-only and writes nothing", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const before = await hashStateTree(legacyDir);

  const report = await inspectLegacyMigration(root);
  assert.equal(report.status, "inspectable");
  assert.equal(report.from, LEGACY_STATE_DIR);
  assert.equal(report.to, VOILA_DIR);
  assert.ok(report.fileCount > 0);
  assert.ok(report.immutableCount >= 7, "counts intake, orientation, and receipt artifacts");

  assert.ok(existsSync(legacyDir), "legacy directory still present");
  assert.ok(!existsSync(join(root, VOILA_DIR)), "no destination created");

  const after = await hashStateTree(legacyDir);
  assert.deepEqual([...after.files.entries()].sort(), [...before.files.entries()].sort());
});

test("inspection is safe to repeat", async () => {
  const { root } = await withLegacyProject();
  const first = await inspectLegacyMigration(root);
  const second = await inspectLegacyMigration(root);
  assert.deepEqual(second, first);
});

test("the command surface reports inspection without applying", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const result = await runMigrate(root, false);
  assert.equal(result.level, "info");
  const text = result.lines.join("\n");
  assert.match(text, /Legacy state migration available: \.newfang\/ -> \.voila\//);
  assert.match(text, /wrote nothing/i);
  assert.ok(existsSync(legacyDir));
});

// --- Application ---

test("applying the migration preserves every immutable artifact byte-for-byte", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const before = await hashStateTree(legacyDir);

  const report = await applyLegacyMigration(root);
  assert.equal(report.status, "migrated");

  const currentDir = join(root, VOILA_DIR);
  assert.ok(existsSync(currentDir), "destination exists");
  assert.ok(!existsSync(legacyDir), "no legacy directory remains");

  const after = await hashStateTree(currentDir);
  for (const [path, hash] of before.files) {
    // Canonical, mutable files legitimately change; immutable artifacts must not.
    if (path === "project.json" || path === "events.jsonl" || path.startsWith("views/")) continue;
    assert.equal(after.files.get(path), hash, `${path} changed during migration`);
  }
});

test("review logs and receipt outputs survive the migration unchanged", async () => {
  const { root } = await withLegacyProject();
  await applyLegacyMigration(root);
  const paths = statePaths(root);

  assert.equal(
    await readFile(join(paths.intakesDir, "INT-1", "reviews.jsonl"), "utf8"),
    '{"action":"revision_requested","reviewedRevision":1}\n{"action":"accepted","reviewedRevision":1}\n',
  );
  assert.equal(
    await readFile(join(paths.receiptsDir, "RCP-1", "stdout.txt"), "utf8"),
    "355 tests passed\n",
  );
  assert.equal(
    await readFile(join(paths.intakesDir, "INT-1", "source.md"), "utf8"),
    "# Source\nNewFang plan.\n",
  );
});

test("migration appends one honest event and preserves prior history", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const historyBefore = await readFile(join(legacyDir, "events.jsonl"), "utf8");

  await applyLegacyMigration(root);
  const historyAfter = await readFile(statePaths(root).eventsJsonl, "utf8");

  assert.ok(historyAfter.startsWith(historyBefore), "prior events are unchanged and still first");
  const added = historyAfter.slice(historyBefore.length).trim().split("\n").filter(Boolean);
  assert.equal(added.length, 1, "exactly one event appended");
  const event = JSON.parse(added[0] as string);
  assert.equal(event.type, "state_directory_migrated");
  assert.equal(event.from, LEGACY_STATE_DIR);
  assert.equal(event.to, VOILA_DIR);
});

test("migration rebrands current metadata but not records", async () => {
  const { root } = await withLegacyProject();
  const report = await applyLegacyMigration(root);
  assert.ok(report.metadataUpdates.includes("displayName"));

  const state = await loadState(root);
  assert.equal(state.displayName, "voila");
  assert.doesNotMatch(state.nextAction, /newfang/i);
});

test("migration regenerates the current view through supported code", async () => {
  const { root } = await withLegacyProject();
  await applyLegacyMigration(root);
  const state = await loadState(root);
  const onDisk = await readFile(statePaths(root).statusView, "utf8");
  assert.equal(onDisk, renderStatusView(state));
  assert.doesNotMatch(onDisk.split("\n").slice(0, 6).join("\n"), /newfang/i);
});

test("migration leaves no temporary directory behind", async () => {
  const { root } = await withLegacyProject();
  await applyLegacyMigration(root);
  const entries = await readdir(root);
  assert.deepEqual(entries.sort(), [VOILA_DIR]);
});

test("migration is safe to rerun after success", async () => {
  const { root } = await withLegacyProject();
  await applyLegacyMigration(root);
  const stateBefore = await loadState(root);

  const rerun = await applyLegacyMigration(root);
  assert.equal(rerun.status, "noop");
  const stateAfter = await loadState(root);
  assert.equal(stateAfter.revision, stateBefore.revision, "a no-op writes nothing");

  const result = await runMigrate(root, true);
  assert.notEqual(result.level, "error");
});

test("migration never overwrites an existing .voila/ tree", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const currentDir = join(root, VOILA_DIR);
  await mkdir(currentDir, { recursive: true });
  await writeFile(join(currentDir, "project.json"), '{"schemaVersion":4}\n', "utf8");

  await assert.rejects(() => applyLegacyMigration(root), StateDirectoryConflictError);
  assert.equal(
    await readFile(join(currentDir, "project.json"), "utf8"),
    '{"schemaVersion":4}\n',
    "existing destination untouched",
  );
  assert.ok(existsSync(legacyDir), "legacy tree untouched");
});

// --- Validation and rollback ---

test("a legacy directory without project.json is refused, not migrated", async () => {
  const root = await tempRoot();
  const legacyDir = join(root, LEGACY_STATE_DIR);
  await mkdir(join(legacyDir, "receipts"), { recursive: true });

  const result = await runMigrate(root, true);
  assert.equal(result.level, "error");
  assert.match(result.lines.join("\n"), /no project\.json/i);
  assert.ok(existsSync(legacyDir), "nothing moved");
  assert.ok(!existsSync(join(root, VOILA_DIR)));
});

test("malformed legacy canonical state is refused before any move", async () => {
  const root = await tempRoot();
  const legacyDir = join(root, LEGACY_STATE_DIR);
  await mkdir(legacyDir, { recursive: true });
  await writeFile(join(legacyDir, "project.json"), "{not json", "utf8");

  const result = await runMigrate(root, true);
  assert.equal(result.level, "error");
  assert.match(result.lines.join("\n"), /Malformed JSON/i);
  assert.ok(existsSync(join(legacyDir, "project.json")));
  assert.ok(!existsSync(join(root, VOILA_DIR)));
});

test("post-move verification rejects a tree whose bytes changed during the move", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const before = await hashStateTree(legacyDir);
  const { rename } = await import("node:fs/promises");
  const currentDir = join(root, VOILA_DIR);
  await rename(legacyDir, currentDir);

  // An immutable receipt artifact is altered between the move and the verification.
  await writeFile(join(currentDir, "receipts", "RCP-1", "stdout.txt"), "tampered\n", "utf8");

  await assert.rejects(
    () => verifyMigratedTree(root, currentDir, before),
    (error: Error) => {
      assert.equal(error.name, "LegacyMigrationFailedError");
      assert.match(error.message, /content changed: receipts\/RCP-1\/stdout\.txt/);
      return true;
    },
  );
});

test("post-move verification rejects canonical state that no longer reads", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const { rename } = await import("node:fs/promises");
  const currentDir = join(root, VOILA_DIR);
  await rename(legacyDir, currentDir);
  await writeFile(join(currentDir, "project.json"), '{"schemaVersion":"bogus"}\n', "utf8");
  const before = await hashStateTree(currentDir);

  await assert.rejects(() => verifyMigratedTree(root, currentDir, before), StateValidationError);
});

test("rollback restores the legacy directory and leaves no destination behind", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const before = await hashStateTree(legacyDir);
  const { rename } = await import("node:fs/promises");
  const currentDir = join(root, VOILA_DIR);
  await rename(legacyDir, currentDir);

  await rollbackMigration(currentDir, legacyDir, new Error("post-move validation failed"));

  assert.ok(existsSync(legacyDir), "legacy directory restored");
  assert.ok(!existsSync(currentDir), "no destination left behind");

  const after = await hashStateTree(legacyDir);
  assert.deepEqual([...after.files.entries()].sort(), [...before.files.entries()].sort());
});

test("a failed rollback is reported loudly and names both paths", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const { rename } = await import("node:fs/promises");
  const currentDir = join(root, VOILA_DIR);
  await rename(legacyDir, currentDir);
  // The legacy path is re-occupied by a non-empty directory, so the rollback rename cannot succeed.
  await mkdir(join(legacyDir, "blocker"), { recursive: true });

  await assert.rejects(
    () => rollbackMigration(currentDir, legacyDir, new Error("post-move validation failed")),
    (error: Error) => {
      assert.equal(error.name, "LegacyMigrationFailedError");
      assert.match(error.message, /rollback failed/i);
      assert.ok(error.message.includes(currentDir), "names where the tree actually is");
      assert.ok(error.message.includes(legacyDir), "names where it should be moved back to");
      return true;
    },
  );
});

test("a legacy tree on an older schema migrates its directory, then its schema", async () => {
  const root = await tempRoot();
  const legacyDir = join(root, LEGACY_STATE_DIR);
  await mkdir(legacyDir, { recursive: true });
  await writeFile(
    join(legacyDir, "project.json"),
    `${JSON.stringify(V1_FIXTURE, null, 2)}\n`,
    "utf8",
  );

  const first = await runMigrate(root, true);
  assert.equal(first.level, "info");
  assert.match(first.lines.join("\n"), /Schema is still v1/);
  assert.ok(existsSync(join(root, VOILA_DIR, "project.json")));
  assert.ok(!existsSync(legacyDir));

  const second = await runMigrate(root, true);
  assert.match(second.lines.join("\n"), new RegExp(`Migrated schema v1 -> v${SCHEMA_VERSION}`));
  const state = await loadState(root);
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
});

// --- Surrounding surfaces ---

test("init refuses to initialize next to legacy state", async () => {
  const { root, legacyDir } = await withLegacyProject();
  const result = await runInit(root);
  assert.equal(result.level, "warning");
  assert.match(result.lines.join("\n"), /Refusing to initialize/);
  assert.ok(!existsSync(join(root, VOILA_DIR)), "no new state directory created");
  assert.ok(existsSync(legacyDir));
});

test("doctor fails on a legacy-only tree and passes after migration", async () => {
  const { root } = await withLegacyProject();

  const before = await runDoctor({ root, ...DOCTOR_ENV });
  const dirBefore = before.find((c) => c.name === "state directory");
  assert.equal(dirBefore?.level, "fail");
  assert.match(dirBefore?.detail ?? "", /run \/voila migrate --apply/);

  await applyLegacyMigration(root);

  const after = await runDoctor({ root, ...DOCTOR_ENV });
  const dirAfter = after.find((c) => c.name === "state directory");
  assert.equal(dirAfter?.level, "pass");
  assert.equal(dirAfter?.detail, `${VOILA_DIR}/`);
});

test("doctor fails when both state directories exist", async () => {
  const { root } = await withLegacyProject();
  await mkdir(join(root, VOILA_DIR), { recursive: true });

  const checks = await runDoctor({ root, ...DOCTOR_ENV });
  const dir = checks.find((c) => c.name === "state directory");
  assert.equal(dir?.level, "fail");
  assert.match(dir?.detail ?? "", /both .newfang\/ and .voila\/ exist/);
});

test("hashStateTree records a symlink distinctly from the file it points at", async () => {
  const root = await tempRoot();
  const dir = join(root, VOILA_DIR);
  await mkdir(join(dir, "receipts"), { recursive: true });
  await writeFile(join(dir, "receipts", "real.txt"), "evidence\n", "utf8");
  const { symlink } = await import("node:fs/promises");
  await symlink(join(dir, "receipts", "real.txt"), join(dir, "receipts", "link.txt"));

  const digest = await hashStateTree(dir);
  assert.equal(digest.files.get("receipts/link.txt"), "non-regular-file");
  assert.notEqual(digest.files.get("receipts/real.txt"), "non-regular-file");
  await chmod(join(dir, "receipts", "real.txt"), 0o644);
});

test("migration regenerates an existing project brief under the new name", async () => {
  const { root, legacyDir } = await withLegacyProject();
  // A brief generated before the rename still carries the old banner and project name.
  await mkdir(join(legacyDir, "briefs"), { recursive: true });
  await writeFile(
    join(legacyDir, "briefs", "PROJECT_BRIEF.md"),
    "<!-- GENERATED by NewFang from .newfang/project.json -->\n# newfang — Project Brief\n",
    "utf8",
  );

  await applyLegacyMigration(root);

  const brief = await readFile(statePaths(root).projectBrief, "utf8");
  const header = brief.split("\n").slice(0, 6).join("\n");
  assert.doesNotMatch(header, /newfang/i, "brief header regenerated under the Voila name");
  assert.match(header, /Voila/);
});
