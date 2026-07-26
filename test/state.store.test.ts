import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  appendEvent,
  initState,
  loadState,
  readRawState,
  stateExists,
  updateState,
  validateProjectState,
} from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import {
  MigrationRequiredError,
  StateExistsError,
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "../src/state/errors.ts";
import { renderStatusView, GENERATED_BANNER } from "../src/domain/status.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import { V1_FIXTURE } from "./helpers.ts";

async function tempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "voila-store-"));
}

test("initState creates current-schema canonical state with empty collections", async () => {
  const root = await tempRoot();
  const state = await initState(root, { displayName: "demo", now: "2026-07-24T00:00:00.000Z" });
  assert.equal(state.schemaVersion, SCHEMA_VERSION);
  assert.equal(state.revision, 1);
  assert.deepEqual(state.workItems, []);
  assert.deepEqual(state.sequences, {
    workItem: 1,
    decision: 1,
    assumption: 1,
    risk: 1,
    intake: 1,
    orientation: 1,
    claim: 1,
    receipt: 1,
    operationDefinition: 1,
    operationRun: 1,
  });
  assert.deepEqual(state.intakes, []);
  assert.deepEqual(state.orientations, []);
  assert.deepEqual(state.claims, []);
  assert.deepEqual(state.receipts, []);
  assert.deepEqual(state.operationDefinitions, []);
  assert.deepEqual(state.operationRuns, []);
  assert.equal(state.focusWorkItemId, null);
  const paths = statePaths(root);
  assert.ok(
    existsSync(paths.projectJson) && existsSync(paths.eventsJsonl) && existsSync(paths.statusView),
  );
});

test("initState refuses to overwrite existing state", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await assert.rejects(() => initState(root, { displayName: "demo2" }), StateExistsError);
});

test("loadState round-trips persisted current-schema state", async () => {
  const root = await tempRoot();
  const created = await initState(root, { displayName: "demo", projectId: "fixed" });
  assert.deepEqual(await loadState(root), created);
});

test("loadState throws StateNotFoundError when uninitialized", async () => {
  const root = await tempRoot();
  assert.equal(stateExists(root), false);
  await assert.rejects(() => loadState(root), StateNotFoundError);
});

test("loading v1 reports migration required (never silent)", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, JSON.stringify(V1_FIXTURE), "utf8");
  await assert.rejects(() => loadState(root), MigrationRequiredError);
  const { version } = await readRawState(root);
  assert.equal(version, 1); // still readable for inspection
});

test("unknown schema version is rejected", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, JSON.stringify({ schemaVersion: 99 }), "utf8");
  await assert.rejects(() => loadState(root), UnknownSchemaVersionError);
});

test("malformed JSON yields StateValidationError", async () => {
  const root = await tempRoot();
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, "{ not json", "utf8");
  await assert.rejects(() => readRawState(root), StateValidationError);
});

test("validateProjectState rejects invalid collections and duplicate IDs", async () => {
  const base = await (async () => {
    const root = await tempRoot();
    return initState(root, { displayName: "demo" });
  })();
  assert.throws(
    () => validateProjectState({ ...base, workItems: [{ id: "NF-1" }] }),
    StateValidationError,
  );
  const wi = {
    id: "NF-1",
    kind: "task",
    title: "t",
    status: "backlog",
    priority: "normal",
    acceptanceCriteria: [],
    dependsOn: [],
    requiredClaimIds: [],
    createdAt: "t",
    updatedAt: "t",
  };
  assert.throws(() => validateProjectState({ ...base, workItems: [wi, wi] }), StateValidationError);
});

test("updateState (immutable reducer) increments revision and persists", async () => {
  const root = await tempRoot();
  const created = await initState(root, { displayName: "demo", projectId: "id" });
  const updated = await updateState(root, (cur) => ({ ...cur, nextAction: "ship" }), {
    type: "next_action_set",
  });
  assert.equal(updated.revision, created.revision + 1);
  assert.equal(updated.projectId, created.projectId);
  assert.equal(updated.createdAt, created.createdAt);
  assert.equal(updated.nextAction, "ship");
  assert.deepEqual(await loadState(root), updated);
});

test("rejected update leaves canonical and prior state untouched", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo", projectId: "id" });
  const beforeBytes = await readFile(statePaths(root).projectJson, "utf8");
  const prior = await loadState(root);
  await assert.rejects(() =>
    updateState(root, () => {
      throw new Error("reducer failed");
    }),
  );
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), beforeBytes);
  assert.deepEqual(await loadState(root), prior);
});

test("reducer input is frozen: mutating it throws and does not write", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  const beforeBytes = await readFile(statePaths(root).projectJson, "utf8");
  await assert.rejects(() =>
    updateState(root, (cur) => {
      (cur as { phase: string }).phase = "build"; // frozen -> throws in strict mode
      return cur;
    }),
  );
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), beforeBytes);
});

test("appendEvent appends JSON lines", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await appendEvent(root, { type: "custom" });
  const lines = (await readFile(statePaths(root).eventsJsonl, "utf8")).trim().split("\n");
  assert.ok(lines.length >= 2);
  assert.equal(JSON.parse(lines[lines.length - 1] as string).type, "custom");
});

test("generated view matches renderStatusView and is marked generated", async () => {
  const root = await tempRoot();
  const state = await initState(root, { displayName: "demo" });
  const view = await readFile(statePaths(root).statusView, "utf8");
  assert.ok(view.startsWith(GENERATED_BANNER));
  assert.equal(view, renderStatusView(state));
});

test("no temporary files remain after atomic writes", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  await updateState(root, (cur) => ({ ...cur, health: "green" }));
  const entries = await readdir(statePaths(root).dir);
  assert.equal(
    entries.some((e) => e.includes(".tmp-")),
    false,
  );
});

test("concurrent updateState calls do not produce duplicate events or colliding revisions", async () => {
  const root = await tempRoot();
  await initState(root, { displayName: "demo" });
  const N = 20;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      updateState(root, (cur) => ({ ...cur, nextAction: `r${i}` }), {
        type: "next_action_set",
        focus: `NF-${i}`,
      }),
    ),
  );
  const revisions = results.map((s) => s.revision).sort((a, b) => a - b);
  // Exactly N distinct revisions, starting at 2 and ending at N+1 (init is revision 1).
  assert.deepEqual(
    revisions,
    Array.from({ length: N }, (_, i) => i + 2),
    "revisions are distinct and strictly increasing",
  );
  // The event log records exactly N next_action_set entries (plus the init event).
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { type: string; revision: number; focus?: string });
  const nextActionEvents = events.filter((e) => e.type === "next_action_set");
  assert.equal(
    nextActionEvents.length,
    N,
    "no duplicate events across concurrent updateState calls",
  );
  const eventRevisions = nextActionEvents.map((e) => e.revision).sort((a, b) => a - b);
  assert.deepEqual(
    eventRevisions,
    Array.from({ length: N }, (_, i) => i + 2),
    "each event carries its own distinct revision",
  );
  // Canonical state was not clobbered: it matches the last write by revision order.
  const final = await loadState(root);
  assert.equal(final.revision, N + 1);
  const lastEvent = nextActionEvents[nextActionEvents.length - 1] as {
    type: string;
    focus: string;
  };
  assert.equal(final.nextAction, `r${N - 1}`);
  assert.equal(lastEvent.focus, `NF-${N - 1}`);
});
