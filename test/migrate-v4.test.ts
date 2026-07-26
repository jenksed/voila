// The v3 -> v5 migration: claims, receipts, per-item proof requirements, and the R2A
// operation-definition and operation-run fields. The legacy v3 -> v4 semantics are covered
// transitively (every migration now passes through v4 on its way to the current schema).

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runMigration } from "../src/state/migration.ts";
import { loadState, readRawState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { MigrationRequiredError, StateValidationError } from "../src/state/errors.ts";
import { renderStatusView } from "../src/domain/status.ts";
import {
  migrationPlan,
  migrateV3ToV4,
  migrateV4ToV5,
  migrateV5ToV6,
  validateProjectStateV5,
} from "../src/domain/migrate.ts";
import { validateProjectStateV3 } from "../src/domain/schema-v3.ts";
import { validateProjectStateV4 } from "../src/domain/schema-v4.ts";
import { V4_FIXTURE } from "./helpers.ts";
import { assessCompletion } from "../src/domain/proof.ts";
import { SCHEMA_VERSION } from "../src/domain/types.ts";
import { V3_FIXTURE } from "./helpers.ts";

async function seed(raw: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-mig4-"));
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.projectJson, `${JSON.stringify(raw, null, 2)}\n`, "utf8");
  return root;
}

test("the current schema version is 6", () => {
  assert.equal(SCHEMA_VERSION, 6);
});

test("v3 inspection reports the chained 3 -> 4 -> 5 -> 6 migration without writing", async () => {
  const root = await seed(V3_FIXTURE);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: false });
  assert.equal(report.status, "inspectable");
  assert.equal(report.fromVersion, 3);
  assert.equal(report.toVersion, SCHEMA_VERSION);
  assert.deepEqual(report.steps, [
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);
  assert.ok(report.additions.some((a) => a.name === "claims"));
  assert.ok(report.additions.some((a) => a.name === "receipts"));
  assert.ok(report.additions.some((a) => a.name === "workItems[].requiredClaimIds"));
  assert.ok(report.additions.some((a) => a.name.includes("sequences.claim")));
  assert.ok(report.additions.some((a) => a.name === "operationDefinitions"));
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "no write on inspect");
  assert.equal((await readRawState(root)).version, 3, "still v3 on disk");
});

test("loading v3 reports migration required (never silent)", async () => {
  const root = await seed(V3_FIXTURE);
  await assert.rejects(() => loadState(root), MigrationRequiredError);
});

test("migrationPlan chains every supported source version to v6", () => {
  assert.deepEqual(migrationPlan(SCHEMA_VERSION)?.steps, []);
  assert.deepEqual(migrationPlan(5)?.steps, [{ from: 5, to: 6 }]);
  assert.deepEqual(migrationPlan(4)?.steps, [
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);
  assert.deepEqual(migrationPlan(3)?.steps, [
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);
  assert.deepEqual(migrationPlan(2)?.steps, [
    { from: 2, to: 3 },
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);
  assert.equal(migrationPlan(0), null);
  assert.deepEqual(migrationPlan(SCHEMA_VERSION)?.steps, []);
  assert.deepEqual(migrationPlan(SCHEMA_VERSION)?.additions, []);
  assert.equal(migrationPlan(SCHEMA_VERSION + 1), null);
});

test("v3 -> v6 preserves everything and defaults requiredClaimIds to empty", async () => {
  const root = await seed(V3_FIXTURE);
  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "migrated");

  const v4 = await loadState(root);
  assert.equal(v4.schemaVersion, SCHEMA_VERSION);
  // Identity and existing content preserved exactly.
  assert.equal(v4.projectId, V3_FIXTURE.projectId);
  assert.equal(v4.createdAt, V3_FIXTURE.createdAt);
  assert.equal(v4.displayName, V3_FIXTURE.displayName);
  assert.equal(v4.revision, V3_FIXTURE.revision + 1);
  assert.equal(v4.focusWorkItemId, "NF-2");
  assert.equal(v4.nextActionRationale, V3_FIXTURE.nextActionRationale);
  assert.equal(v4.workItems.length, 2);
  assert.equal(v4.intakes.length, 1);
  assert.equal(v4.orientations.length, 1);
  assert.equal(v4.currentIntakeId, "INT-1");
  assert.equal(v4.currentOrientationId, "ORI-1");
  assert.equal(v4.sequences.workItem, V3_FIXTURE.sequences.workItem);
  assert.equal(v4.sequences.intake, V3_FIXTURE.sequences.intake);

  // New collections and counters.
  assert.deepEqual(v4.claims, []);
  assert.deepEqual(v4.receipts, []);
  assert.equal(v4.sequences.claim, 1);
  assert.equal(v4.sequences.receipt, 1);

  // Every migrated work item gains an EMPTY requirement list — the migration invents no proof.
  for (const item of v4.workItems) {
    assert.deepEqual(item.requiredClaimIds, [], `${item.id} defaults to no required claims`);
  }
});

test("a migrated work item cannot be completed: it has no required claims", async () => {
  const root = await seed(V3_FIXTURE);
  await runMigration(root, { apply: true });
  const v4 = await loadState(root);
  const assessment = assessCompletion(v4, "NF-1", "f".repeat(64));
  assert.equal(assessment.ready, false);
  const ids = assessment.failing.map((g) => g.id);
  assert.ok(ids.includes("required_claims_present"), "no required claims gate fails");
  assert.ok(ids.includes("claims_supported"), "no supported evidence gate fails");
});

test("migration writes a timestamped v3 backup of the original bytes", async () => {
  const root = await seed(V3_FIXTURE);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: true });
  assert.ok(report.backupLocation && existsSync(report.backupLocation));
  assert.equal(await readFile(report.backupLocation as string, "utf8"), before);
  assert.match(report.backupLocation as string, /project\.json\.v3\./);
});

test("migration appends exactly one schema_migrated event and refreshes the view", async () => {
  const root = await seed(V3_FIXTURE);
  await runMigration(root, { apply: true });
  const state = await loadState(root);
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const migrations = events.filter((e) => e.type === "schema_migrated");
  // v3 -> v5 produces one combined event because the migration chain collapses into a single apply.
  assert.equal(migrations.length, 1);
  assert.equal(migrations[0].from, 3);
  assert.equal(migrations[0].to, SCHEMA_VERSION);
  assert.equal(await readFile(statePaths(root).statusView, "utf8"), renderStatusView(state));
});

test("rerunning the migration on the current version is a safe no-op", async () => {
  const root = await seed(V3_FIXTURE);
  await runMigration(root, { apply: true });
  const again = await runMigration(root, { apply: true });
  assert.equal(again.status, "noop");
  assert.deepEqual(again.steps, []);
  assert.equal(again.backupLocation, null);
});

test("a failed v3 migration leaves canonical bytes byte-identical and writes no backup", async () => {
  // Structurally valid v3 envelope, but an entity that cannot validate as v4.
  const bad = { ...V3_FIXTURE, workItems: [{ id: "NF-1", kind: "task" }] };
  const root = await seed(bad);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  await assert.rejects(() => runMigration(root, { apply: true }), StateValidationError);
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "bytes unchanged");
  const hasBackups =
    existsSync(statePaths(root).backupsDir) &&
    (await readdir(statePaths(root).backupsDir)).length > 0;
  assert.equal(hasBackups, false, "no backup written for a refused migration");
  const events = statePaths(root).eventsJsonl;
  assert.equal(existsSync(events), false, "no event appended for a refused migration");
});

test("a malformed v3 envelope is refused before any transform", async () => {
  const root = await seed({ ...V3_FIXTURE, sequences: { workItem: 1 } });
  await assert.rejects(() => runMigration(root, { apply: true }), StateValidationError);
});

test("the v3 validator rejects non-v3 input and accepts the fixture", () => {
  assert.throws(() => validateProjectStateV3({ schemaVersion: 2 }), /Expected schemaVersion 3/);
  assert.throws(() => validateProjectStateV3(null), /must be a JSON object/);
  assert.throws(() => validateProjectStateV3({ ...V3_FIXTURE, phase: "nope" }), /phase/);
  const ok = validateProjectStateV3(V3_FIXTURE);
  assert.equal(ok.schemaVersion, 3);
});

// The fixture below is the REAL integrated Packet 3 canonical state (the schema-v3
// .voila/project.json at the main merge commit 3169878), not a synthetic envelope. It is the
// state this migration actually has to survive, including the full intake and review history.
const INTEGRATED_V3 = JSON.parse(
  await readFile(new URL("./fixtures/integrated-v3-project.json", import.meta.url), "utf8"),
) as Record<string, unknown> & {
  intakes: Array<Record<string, unknown>>;
  workItems: Array<Record<string, unknown>>;
  decisions: Array<Record<string, unknown>>;
  revision: number;
};

test("the integrated Packet 3 state is genuinely v3 and carries the real history", () => {
  assert.equal(INTEGRATED_V3.schemaVersion, 3, "fixture is a real v3 state, not a v4 snapshot");
  assert.equal(INTEGRATED_V3.intakes.length, 8);
  assert.equal(INTEGRATED_V3.workItems.length, 8);
  assert.equal(INTEGRATED_V3.decisions.length, 10);
  assert.equal(INTEGRATED_V3.focusWorkItemId, "NF-2");
  assert.equal(INTEGRATED_V3.currentIntakeId, "INT-8");
});

test("the integrated v3 state migrates to v6 and keeps every intake and review record", async () => {
  const root = await seed(INTEGRATED_V3);
  const report = await runMigration(root, { apply: true });
  assert.equal(report.status, "migrated");
  assert.deepEqual(report.steps, [
    { from: 3, to: 4 },
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);

  const v4 = await loadState(root);
  assert.equal(v4.schemaVersion, SCHEMA_VERSION);
  assert.equal(v4.revision, INTEGRATED_V3.revision + 1);

  // Nothing from Packet 3 is dropped or rewritten.
  assert.equal(v4.intakes.length, 8);
  assert.equal(v4.workItems.length, 8);
  assert.equal(v4.decisions.length, 10);
  assert.equal(v4.decisions.filter((d) => d.id === "DEC-10").length, 1, "DEC-10 exactly once");
  assert.equal(v4.focusWorkItemId, "NF-2", "focus still NF-2");
  assert.equal(v4.currentIntakeId, "INT-8");
  assert.equal(v4.currentOrientationId, "ORI-2");
  assert.equal(v4.sequences.intake, 9);
  assert.equal(v4.sequences.orientation, 3);

  for (const before of INTEGRATED_V3.intakes) {
    const after = v4.intakes.find((i) => i.id === before.id);
    assert.deepEqual(after, before, `${before.id} metadata is carried through untouched`);
  }
});

test("accepted INT-8 revision 3 survives the migration as accepted", async () => {
  const root = await seed(INTEGRATED_V3);
  await runMigration(root, { apply: true });
  const v4 = await loadState(root);
  const int8 = v4.intakes.find((i) => i.id === "INT-8");
  assert.ok(int8, "INT-8 is present after migration");
  assert.equal(int8?.status, "accepted");
  assert.equal(int8?.acceptedDraftRevision, 3, "revision 3 is the accepted draft");
  assert.equal(int8?.draftRevision, 3);
});

test("migrating the integrated state completes no work item and invents no proof", async () => {
  const root = await seed(INTEGRATED_V3);
  await runMigration(root, { apply: true });
  const v4 = await loadState(root);
  assert.deepEqual(v4.claims, []);
  assert.deepEqual(v4.receipts, []);
  assert.deepEqual(
    v4.workItems.filter((w) => w.status === "completed"),
    [],
    "migration completes nothing retroactively",
  );
  for (const item of v4.workItems) {
    assert.deepEqual(item.requiredClaimIds, [], `${item.id} gains no invented requirement`);
  }
});

test("migrating the integrated state appends exactly one event and refreshes the view", async () => {
  const root = await seed(INTEGRATED_V3);
  await runMigration(root, { apply: true });
  const state = await loadState(root);
  const events = (await readFile(statePaths(root).eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  assert.equal(events.length, 1, "exactly one event for the migration");
  assert.equal(events[0].type, "schema_migrated");
  assert.equal(events[0].from, 3);
  assert.equal(events[0].to, SCHEMA_VERSION);
  assert.equal(await readFile(statePaths(root).statusView, "utf8"), renderStatusView(state));
});

test("inspecting the integrated v3 state is read-only", async () => {
  const root = await seed(INTEGRATED_V3);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: false });
  assert.equal(report.status, "inspectable");
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before);
  assert.equal(existsSync(statePaths(root).eventsJsonl), false, "inspection appends no event");
  // The reported backup path is a plan, not a write: nothing lands on disk.
  assert.match(report.backupLocation as string, /<timestamp>$/);
  const wroteBackup =
    existsSync(statePaths(root).backupsDir) &&
    (await readdir(statePaths(root).backupsDir)).length > 0;
  assert.equal(wroteBackup, false, "inspection creates no backup file");
});

test("migrating the integrated v3 state backs up the original bytes", async () => {
  const root = await seed(INTEGRATED_V3);
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const report = await runMigration(root, { apply: true });
  assert.ok(report.backupLocation && existsSync(report.backupLocation));
  assert.equal(await readFile(report.backupLocation as string, "utf8"), before);
});

test("migrateV3ToV4 keeps an already-present requiredClaimIds array", () => {
  const source = validateProjectStateV3({
    ...V3_FIXTURE,
    workItems: [
      { ...(V3_FIXTURE.workItems[0] as object), requiredClaimIds: ["CLM-7"] },
      V3_FIXTURE.workItems[1],
    ],
  });
  const v4 = migrateV3ToV4(source);
  const items = v4.workItems as Array<{ id: string; requiredClaimIds?: string[] }>;
  assert.deepEqual(items[0]?.requiredClaimIds, ["CLM-7"]);
  assert.deepEqual(items[1]?.requiredClaimIds, []);
});

// --- v4 -> v5 migration (R2A operation supervision) ---

test("v4 -> v5 -> v6 migration initializes operation fields without inventing authority", () => {
  const v4 = validateProjectStateV4(V4_FIXTURE);
  const v5 = migrateV4ToV5(v4);
  const v6 = migrateV5ToV6(validateProjectStateV5(v5));
  assert.equal(v6.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(v6.operationDefinitions, []);
  assert.deepEqual(v6.operationRuns, []);
  assert.equal(v6.sequences.operationDefinition, 1);
  assert.equal(v6.sequences.operationRun, 1);
  // All v4 fields survive.
  assert.deepEqual(
    (v6.workItems as Array<{ id: string }>).map((w) => w.id),
    ["NF-1", "NF-2"],
  );
  assert.deepEqual(
    (v6.decisions as Array<{ id: string }>).map((d) => d.id),
    ["DEC-1"],
  );
  assert.equal(v6.claims.length, 0);
  assert.equal(v6.receipts.length, 0);
});

test("migrationPlan reports the v4 -> v5 -> v6 steps with the expected additions", () => {
  const plan = migrationPlan(4);
  assert.ok(plan, "a plan must exist for v4");
  assert.deepEqual(plan?.steps, [
    { from: 4, to: 5 },
    { from: 5, to: 6 },
  ]);
  const names = plan?.additions.map((a) => a.name) ?? [];
  assert.ok(names.includes("operationDefinitions"));
  assert.ok(names.includes("operationRuns"));
  assert.ok(names.includes("sequences.operationDefinition / sequences.operationRun"));
});

test("v5 -> v6 migration adds effect profile, authority, and admission without inventing authority", () => {
  const v5raw = {
    ...JSON.parse(JSON.stringify(V4_FIXTURE)),
    schemaVersion: 5,
    operationDefinitions: [
      {
        id: "r2a.state-store-tests",
        version: 1,
        purpose: "test",
        kind: "finite",
        executable: "mise",
        args: ["exec", "--", "node", "--test", "test/state.store.test.ts"],
        workingDirectory: "repository_root",
        environmentPolicy: { kind: "inherit" },
        riskClassification: { riskClass: "safe_and_expected" },
        successContract: { exitCode: 0, description: "exit 0" },
        timeoutContract: {
          startupMs: 10_000,
          totalMs: 120_000,
          gracefulMs: 5_000,
          forcedMs: 5_000,
        },
        cancellationContract: { gracefulSignal: "SIGTERM", escalationSignal: "SIGKILL" },
        outputPolicy: {
          maxChunkBytes: 16384,
          maxInMemoryTailBytes: 262144,
          maxDurableBytes: 1048576,
        },
        redactionPolicy: {
          secretVariableNames: ["TOKEN"],
          redactAuthorizationHeaders: true,
          skipShortValues: true,
          minSecretLength: 6,
        },
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
      {
        id: "rogue.legacy",
        version: 1,
        purpose: "test",
        kind: "finite",
        executable: "sh",
        args: ["-c", "echo"],
        workingDirectory: "repository_root",
        environmentPolicy: { kind: "inherit" },
        riskClassification: { riskClass: "safe_and_expected" },
        successContract: { exitCode: 0, description: "exit 0" },
        timeoutContract: {
          startupMs: 10_000,
          totalMs: 120_000,
          gracefulMs: 5_000,
          forcedMs: 5_000,
        },
        cancellationContract: { gracefulSignal: "SIGTERM", escalationSignal: "SIGKILL" },
        outputPolicy: {
          maxChunkBytes: 16384,
          maxInMemoryTailBytes: 262144,
          maxDurableBytes: 1048576,
        },
        redactionPolicy: {
          secretVariableNames: ["TOKEN"],
          redactAuthorizationHeaders: true,
          skipShortValues: true,
          minSecretLength: 6,
        },
        createdAt: "2026-07-26T00:00:00.000Z",
        updatedAt: "2026-07-26T00:00:00.000Z",
      },
    ],
    operationRuns: [],
  };
  const v6 = migrateV5ToV6(v5raw);
  const defs = v6.operationDefinitions;
  const r2a = defs.find((d) => d.id === "r2a.state-store-tests")!;
  assert.deepEqual(r2a.effectProfile, ["local_read", "bounded_temporary_write"]);
  assert.equal(r2a.authorityRequirement, "accepted_project_operation");
  assert.deepEqual(r2a.authoritySourceRef, { kind: "decision", id: "DEC-22" });
  const rogue = defs.find((d) => d.id === "rogue.legacy")!;
  assert.equal(rogue.authorityRequirement, "not_authorized");
  assert.equal(rogue.effectProfile.length, 0);
});

test("v5 -> v6 migration preserves legacy admission and repairs the abandoned cwdRef draft", () => {
  const v5raw = {
    ...JSON.parse(JSON.stringify(V4_FIXTURE)),
    schemaVersion: 5,
    operationDefinitions: [],
    operationRuns: [
      {
        id: "RUN-1",
        definitionId: "r2a.state-store-tests",
        definitionVersion: 1,
        definitionFingerprint: "f".repeat(64),
        projectId: "test-project",
        cwdRef: ".",
        worktreeIdentity: "/abs/repo",
        ownership: { requester: "test", owner: "steward" },
        startingFingerprint: "a".repeat(64),
        changedDuringRun: false,
        lifecycleState: "passed",
        createdAt: "2026-07-26T00:00:00.000Z",
        settledAt: "2026-07-26T00:00:01.000Z",
        exitCode: 0,
        settlementReason: "passed",
        outputSummary: {
          truncated: false,
          droppedBytes: 0,
          redactionCount: 0,
          redactedSecrets: false,
        },
        deliveryState: "delivered",
      },
    ],
  };
  const v6 = migrateV5ToV6(v5raw);
  const run = v6.operationRuns[0]!;
  assert.equal(run.repositoryRoot, "/abs/repo");
  assert.equal(run.admission.result, "allow");
  assert.equal(run.admission.ruleId, "ADMIT.OPERATIONS.MIGRATION_LEGACY");
  assert.equal(run.admission.policyVersion, 1);
  assert.ok(run.admission.legacy);
  assert.equal(run.admission.legacy?.reason, "pre_policy_kernel");
});
