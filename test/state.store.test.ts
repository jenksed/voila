import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendEvent,
  initState,
  loadState,
  stateExists,
  updateState,
  validateProjectState,
} from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import {
  SchemaVersionError,
  StateExistsError,
  StateNotFoundError,
  StateValidationError,
} from "../src/state/errors.ts";
import { renderStatusView, GENERATED_BANNER } from "../src/domain/status.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "newfang-store-"));
}

test("initState creates canonical files and deterministic defaults", async () => {
  const root = await tempRoot();
  const state = await initState(root, { displayName: "demo", now: "2026-07-24T00:00:00.000Z" });
  const paths = statePaths(root);

  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.displayName, "demo");
  assert.equal(state.phase, "research");
  assert.equal(state.health, "unknown");
  assert.equal(state.revision, 1);
  assert.equal(state.createdAt, "2026-07-24T00:00:00.000Z");
  assert.ok(state.projectId.length > 0);

  assert.ok(existsSync(paths.projectJson), "project.json exists");
  assert.ok(existsSync(paths.eventsJsonl), "events.jsonl exists");
  assert.ok(existsSync(paths.receiptsDir), "receipts/ exists");
  assert.ok(existsSync(paths.statusView), "views/PROJECT_STATUS.md exists");
});

test("initState refuses to overwrite existing state", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await assert.rejects(() => initState(root, { displayName: "demo2" }), StateExistsError);
});

test("loadState round-trips the persisted state", async () => {
  const root = await tempRoot();
  const created = await initState(root, { displayName: "demo", projectId: "fixed-id" });
  const loaded = await loadState(root);
  assert.deepEqual(loaded, created);
});

test("loadState throws StateNotFoundError when uninitialized", async () => {
  const root = await tempRoot();
  assert.equal(stateExists(root), false);
  await assert.rejects(() => loadState(root), StateNotFoundError);
});

test("malformed JSON yields StateValidationError", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, "{ not json", "utf8");
  await assert.rejects(() => loadState(root), StateValidationError);
});

test("incompatible schema version is rejected and not rewritten", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  const future = JSON.stringify({
    schemaVersion: 999,
    projectId: "x",
    displayName: "x",
    phase: "build",
    health: "green",
    nextAction: "x",
    createdAt: "2026-07-24T00:00:00.000Z",
    updatedAt: "2026-07-24T00:00:00.000Z",
    revision: 1,
  });
  await writeFile(paths.projectJson, future, "utf8");
  await assert.rejects(() => loadState(root), SchemaVersionError);
  assert.equal(await readFile(paths.projectJson, "utf8"), future, "file left untouched");
});

test("validateProjectState rejects invalid phase, health, and revision", () => {
  const base = {
    schemaVersion: SCHEMA_VERSION,
    projectId: "x",
    displayName: "x",
    phase: "build",
    health: "green",
    nextAction: "x",
    createdAt: "t",
    updatedAt: "t",
    revision: 1,
  };
  assert.throws(() => validateProjectState({ ...base, phase: "nope" }), StateValidationError);
  assert.throws(() => validateProjectState({ ...base, health: "nope" }), StateValidationError);
  assert.throws(() => validateProjectState({ ...base, revision: 0 }), StateValidationError);
  assert.throws(() => validateProjectState({ ...base, revision: 1.5 }), StateValidationError);
});

test("updateState increments revision monotonically and preserves identity fields", async () => {
  const root = await tempRoot();
  const created = await initState(root, { displayName: "demo", projectId: "id-1" });
  const updated = await updateState(
    root,
    (draft) => {
      draft.phase = "build";
      draft.nextAction = "ship the slice";
    },
    { type: "phase_changed", to: "build" },
  );

  assert.equal(updated.revision, created.revision + 1);
  assert.equal(updated.projectId, created.projectId);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.phase, "build");
  assert.ok(updated.updatedAt >= created.updatedAt);

  const reloaded = await loadState(root);
  assert.deepEqual(reloaded, updated);
});

test("appendEvent appends JSON lines to events.jsonl", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await appendEvent(root, { type: "custom_event", note: "hello" });
  const text = await readFile(statePaths(root).eventsJsonl, "utf8");
  const lines = text.trim().split("\n");
  assert.ok(lines.length >= 2, "init + custom event");
  const last = JSON.parse(lines[lines.length - 1] as string);
  assert.equal(last.type, "custom_event");
  assert.ok(typeof last.ts === "string");
});

test("generated view matches renderStatusView and is marked generated", async () => {
  const root = await tempRoot();
  const state = await initState(root, { displayName: "demo" });
  const view = await readFile(statePaths(root).statusView, "utf8");
  assert.ok(view.startsWith(GENERATED_BANNER), "generated banner present");
  assert.equal(view, renderStatusView(state));
});

test("no temporary files remain after atomic writes", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await updateState(root, (d) => {
    d.health = "green";
  });
  const entries = await readdir(statePaths(root).dir);
  assert.equal(
    entries.some((e) => e.includes(".tmp-")),
    false,
    "no leftover temp files",
  );
});
