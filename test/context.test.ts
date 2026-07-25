import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildContextBlock, CONTEXT_CHAR_LIMIT } from "../src/context/inject.ts";
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

test("initialized project yields a compact deterministic block", () => {
  const state = seededState();
  const first = buildContextBlock({ status: "ok", state });
  const second = buildContextBlock({ status: "ok", state });
  assert.equal(first, second, "deterministic for identical input");
  assert.match(first, /\[NewFang project context\]/);
  assert.match(first, /Project: ctx-demo · phase research/);
  assert.match(first, /Focus: NF-1/);
  assert.match(first, /Next action: Do the next thing\./);
  assert.match(first, /Why now: Because it unblocks the slice\./);
  assert.match(first, /Accepted decisions:/);
  assert.match(first, /Open high-impact risks:/);
  assert.match(first, /PROJECT_BRIEF\.md/);
  assert.ok(first.length <= CONTEXT_CHAR_LIMIT);
});

test("uninitialized and migration states inject exactly one concise hint", () => {
  const uninit = buildContextBlock({ status: "uninitialized" });
  assert.equal(uninit.split("\n").length, 1);
  assert.match(uninit, /\/newfang init/);

  const migration = buildContextBlock({ status: "migration" });
  assert.equal(migration.split("\n").length, 1);
  assert.match(migration, /migrate/);
  assert.ok(!migration.includes("Focus:"), "no project detail before migration");
});

test("error status is reported without leaking internals", () => {
  const block = buildContextBlock({ status: "error", message: "malformed project.json" });
  assert.match(block, /malformed project\.json/);
  assert.match(block, /doctor/);
});

test("pending intake and stale orientation appear with guidance", () => {
  const state = seededState();
  const block = buildContextBlock({
    status: "ok",
    state,
    pendingIntake: { id: "INT-1", title: "Brief", draftRevision: 2 },
    orientation: { id: "ORI-1", stale: true, reasons: ["HEAD moved"] },
  });
  assert.match(block, /Pending intake: INT-1 "Brief" \(draft revision 2\)/);
  assert.match(block, /do not apply it without explicit user confirmation/);
  assert.match(block, /Orientation: ORI-1 \(STALE: HEAD moved\)/);
});

test("absent intake and orientation are stated explicitly", () => {
  const block = buildContextBlock({ status: "ok", state: seededState() });
  assert.match(block, /Pending intake: none/);
  assert.match(block, /Orientation: none recorded/);
});

test("a large project stays under the cap by bounding what it includes", () => {
  let s = seededState();
  for (let i = 0; i < 60; i++) {
    s = recordDecision(
      s,
      {
        title: `Decision ${i}`,
        decision: `A fairly long decision statement number ${i} `.repeat(4),
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
  const block = buildContextBlock({ status: "ok", state: s });
  assert.ok(block.length <= CONTEXT_CHAR_LIMIT, `block was ${block.length} chars`);
  // Bounded by slicing: at most 5 decisions and 3 high-impact risks are listed.
  const decisionLines = block.split("\n").filter((l) => /^- DEC-/.test(l));
  const riskLines = block.split("\n").filter((l) => /^- RSK-/.test(l));
  assert.ok(decisionLines.length <= 5, `listed ${decisionLines.length} decisions`);
  assert.ok(riskLines.length <= 3, `listed ${riskLines.length} risks`);
});

test("the hard clamp truncates when a single field is enormous", () => {
  let s = seededState();
  s = setNextActionRationale(s, "very long reasoning ".repeat(400));
  const block = buildContextBlock({ status: "ok", state: s });
  assert.ok(block.length <= CONTEXT_CHAR_LIMIT, `block was ${block.length} chars`);
  assert.match(block, /context truncated/);
});

test("no source content or event history is injected", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-ctx-"));
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
  const root = await mkdtemp(join(tmpdir(), "newfang-ctx-"));
  await initState(root, { displayName: "ctx-demo" });
  await updateState(root, (s) => createWorkItem(s, { kind: "task", title: "A" }, "T"));
  const before = await readFile(statePaths(root).projectJson, "utf8");
  const beforeState = await loadState(root);

  await assembleContext(root);
  await assembleContext(root);

  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), before, "bytes unchanged");
  assert.equal((await loadState(root)).revision, beforeState.revision, "revision unchanged");
});

test("assembleContext reports uninitialized and migration-required projects", async () => {
  const empty = await mkdtemp(join(tmpdir(), "newfang-ctx-"));
  assert.match(await assembleContext(empty), /\/newfang init/);

  const legacy = await mkdtemp(join(tmpdir(), "newfang-ctx-"));
  await mkdir(statePaths(legacy).dir, { recursive: true });
  await writeFile(statePaths(legacy).projectJson, JSON.stringify(V1_FIXTURE), "utf8");
  assert.match(await assembleContext(legacy), /migrate/);
});
