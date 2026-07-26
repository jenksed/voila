// Assembler-level guarantees for the injected focus capsule: it reads canonical state and artifacts,
// never mutates them, never leaks a preserved source document or raw history, and degrades honestly.
// The capsule's behavioral contract lives in continuation.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildFocusCapsule, CAPSULE_HARD_MAX } from "../src/context/inject.ts";
import { assembleContext } from "../src/context/assemble.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";
import { statePaths } from "../src/state/paths.ts";
import { createIntake, stageIntakeDraft } from "../src/state/intake-store.ts";
import {
  createWorkItem,
  recordDecision,
  recordRisk,
  setFocusWorkItem,
  setNextAction,
  setNextActionRationale,
} from "../src/domain/operations.ts";
import { createInitialState } from "../src/domain/defaults.ts";
import { V1_FIXTURE } from "./helpers.ts";

function seededState() {
  let s = createInitialState({ displayName: "ctx-demo", now: "T", projectId: "pid" });
  s = createWorkItem(s, { kind: "task", title: "Focused item", status: "ready" }, "T");
  s = setFocusWorkItem(s, "NF-1");
  s = setNextAction(s, "Do the next thing.");
  s = setNextActionRationale(s, "Because it unblocks the slice.");
  s = recordDecision(
    s,
    {
      title: "Canonical state",
      decision: "project.json is authoritative.",
      rationale: "ADR",
      status: "accepted",
    },
    "T",
  );
  s = recordRisk(s, { statement: "High impact risk.", likelihood: "low", impact: "high" }, "T");
  return s;
}

test("initialized project yields a compact deterministic capsule", () => {
  const state = seededState();
  const first = buildFocusCapsule({ status: "ok", state });
  const second = buildFocusCapsule({ status: "ok", state });
  assert.equal(first, second, "deterministic for identical input");
  assert.match(first, /\[Voila continuation capsule\]/);
  assert.match(first, /Project: ctx-demo · phase research/);
  assert.match(first, /Focus: NF-1 \(ready\) — Focused item/);
  assert.match(first, /Next action: Do the next thing\./);
  assert.match(first, /Why now: Because it unblocks the slice\./);
  assert.match(first, /Objective: DEC-1 Canonical state/);
  assert.ok(first.length <= CAPSULE_HARD_MAX);
});

test("uninitialized and migration states inject exactly one concise hint", () => {
  const uninit = buildFocusCapsule({ status: "uninitialized" });
  assert.equal(uninit.split("\n").length, 1);
  assert.match(uninit, /\/voila init/);

  const migration = buildFocusCapsule({ status: "migration" });
  assert.equal(migration.split("\n").length, 1);
  assert.match(migration, /migrate/);
  assert.ok(!migration.includes("Focus:"), "no project detail before migration");
});

test("error status is reported without leaking internals", () => {
  const block = buildFocusCapsule({ status: "error", message: "malformed project.json" });
  assert.match(block, /malformed project\.json/);
  assert.match(block, /doctor/);
});

test("pending intake and stale orientation appear with the right handling", () => {
  const state = seededState();
  const block = buildFocusCapsule({
    status: "ok",
    state,
    pendingIntake: { id: "INT-1", title: "Brief", draftRevision: 2 },
    orientation: { id: "ORI-1", stale: true, reasons: ["AGENTS.md changed"] },
  });
  assert.match(block, /Pending intake: INT-1 "Brief"/);
  assert.match(block, /never apply it without explicit user confirmation/);
  assert.match(block, /orientation: ORI-1 describes changed inputs \(AGENTS\.md changed\)/);
});

test("a current orientation is reported plainly and a clean worktree is observable", () => {
  const block = buildFocusCapsule({
    status: "ok",
    state: seededState(),
    orientation: { id: "ORI-2", stale: false, reasons: [] },
    repository: { isGitRepository: true, branch: "main", head: "abc1234", changedFileCount: 0 },
  });
  assert.match(block, /orientation: ORI-2 current/);
  assert.match(block, /worktree clean/);
  assert.doesNotMatch(block, /Pending intake/);
});

test("a large project stays under the hard maximum by bounding what it includes", () => {
  let s = seededState();
  for (let i = 0; i < 60; i++) {
    s = recordDecision(
      s,
      {
        title: `Decision ${i} for NF-1`,
        decision: `A fairly long decision statement number ${i} about NF-1 `.repeat(4),
        rationale: "r",
        status: "accepted",
      },
      "T",
    );
    s = recordRisk(
      s,
      {
        statement: `A long risk statement number ${i} `.repeat(4),
        likelihood: "high",
        impact: "high",
      },
      "T",
    );
  }
  const block = buildFocusCapsule({ status: "ok", state: s });
  assert.ok(block.length <= CAPSULE_HARD_MAX, `capsule was ${block.length} chars`);
  const decisionLines = block.split("\n").filter((l: string) => /^ {2}- DEC-/.test(l));
  assert.ok(decisionLines.length <= 3, `listed ${decisionLines.length} decisions`);
});

test("an enormous required field is abbreviated, not tail-truncated away", () => {
  let s = seededState();
  s = setNextAction(s, `implement ${"a very long instruction ".repeat(200)}`);
  s = setNextActionRationale(s, "very long reasoning ".repeat(400));
  const block = buildFocusCapsule({ status: "ok", state: s });
  assert.ok(block.length <= CAPSULE_HARD_MAX, `capsule was ${block.length} chars`);
  // Every required element survives: nothing was cut off the end of the block.
  for (const required of [
    /Project: ctx-demo/,
    /Focus: NF-1/,
    /Next action: implement/,
    /Blocker:/,
  ]) {
    assert.match(block, required);
  }
  assert.match(block, /Authority boundary:/, "the last required section is intact");
});

test("no source content or event history is injected", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-ctx-"));
  await initState(root, { displayName: "ctx-demo" });
  const secret = "SOURCE_MARKER_SHOULD_NOT_APPEAR";
  await writeFile(join(root, "brief.md"), `# Brief\n\n${secret}\n`, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  await stageIntakeDraft(root, created.intake.id, {
    intakeId: created.intake.id,
    objective: "o",
    findings: [
      {
        id: "F1",
        category: "requirement",
        statement: "a requirement",
        origin: "source",
        sourceRefs: [{ intakeId: created.intake.id, startLine: 3 }],
      },
    ],
  });

  const block = await assembleContext(root);
  assert.ok(!block.includes(secret), "source document content is never injected");
  assert.ok(!block.includes("intake_source_preserved"), "raw event history is never injected");
  assert.match(block, /Pending intake: INT-1/);
});

test("assembling context does not mutate canonical state", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-ctx-"));
  await initState(root, { displayName: "ctx-demo" });
  await updateState(root, (s) => createWorkItem(s, { kind: "task", title: "A" }, "T"));
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const beforeState = await loadState(root);

  await assembleContext(root);
  await assembleContext(root, { continuation: true });

  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "bytes unchanged");
  assert.equal((await loadState(root)).revision, beforeState.revision, "revision unchanged");
});

test("assembleContext threads continuation intent through to the directive", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-ctx-"));
  await initState(root, { displayName: "ctx-demo" });
  await updateState(root, (s) => {
    let next = createWorkItem(s, { kind: "task", title: "A" }, "T");
    return setFocusWorkItem(next, "NF-1");
  });

  const plain = await assembleContext(root);
  const continuing = await assembleContext(root, { continuation: true });
  assert.doesNotMatch(plain, /Continue NF-1/);
  assert.match(continuing, /Continue NF-1 inside the accepted scope/);
});

test("assembleContext reports uninitialized and migration-required projects", async () => {
  const empty = await mkdtemp(join(tmpdir(), "voila-ctx-"));
  assert.match(await assembleContext(empty), /\/voila init/);

  const legacy = await mkdtemp(join(tmpdir(), "voila-ctx-"));
  await mkdir(statePaths(legacy).dir, { recursive: true });
  await writeFile(statePaths(legacy).projectJson, JSON.stringify(V1_FIXTURE), "utf8");
  assert.match(await assembleContext(legacy), /migrate/);
});
