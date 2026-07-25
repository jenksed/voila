import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState } from "../src/state/store.ts";
import { createIntake, stageIntakeDraft } from "../src/state/intake-store.ts";
import {
  runBrief,
  runIntakeApply,
  runIntakeCreate,
  runIntakeReject,
  runIntakeReview,
  runIntakeStatus,
  runOrient,
} from "../src/commands/intake.ts";
import { recordOrientation } from "../src/state/orientation-store.ts";
import { buildModelForRoot } from "../src/ui/steward-console/open.ts";
import { renderConsole, plainStyler } from "../src/ui/steward-console/render.ts";
import {
  handleKey,
  INITIAL_UI,
  type ConsoleUiState,
} from "../src/ui/steward-console/navigation.ts";
import { matchLogicalKey } from "../src/ui/steward-console/component.ts";
import { WIDTHS } from "./fixtures/console.ts";

const SOURCE = ["# Brief", "", "Use SQLite.", "No web UI.", "Latency risk."].join("\n");

function draftFor(intakeId: string, over: Record<string, unknown> = {}) {
  const ref = (l: number) => [{ intakeId, startLine: l }];
  return {
    intakeId,
    objective: "Ship a local-first tool.",
    findings: [
      {
        id: "F1",
        category: "locked_decision",
        statement: "Use SQLite.",
        origin: "source",
        sourceRefs: ref(3),
      },
      {
        id: "F2",
        category: "non_goal",
        statement: "No web UI.",
        origin: "source",
        sourceRefs: ref(4),
      },
      {
        id: "F3",
        category: "risk",
        statement: "Latency risk.",
        origin: "source",
        sourceRefs: ref(5),
      },
      { id: "F4", category: "open_question", statement: "Which index?", origin: "model_inference" },
    ],
    proposedWorkItems: [
      { id: "W1", kind: "task", title: "Add storage", sourceFindingIds: ["F1"], priority: "high" },
    ],
    proposedNextAction: "Build storage.",
    proposedNextActionRationale: "Everything depends on it.",
    ...over,
  };
}

async function repoWithStagedIntake(over: Record<string, unknown> = {}) {
  const root = await mkdtemp(join(tmpdir(), "newfang-iui-"));
  await initState(root, { displayName: "iui-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  const staged = await stageIntakeDraft(root, created.intake.id, draftFor(created.intake.id, over));
  return { root, intakeId: created.intake.id, staged };
}

function ui(over: Partial<ConsoleUiState> = {}): ConsoleUiState {
  return { ...INITIAL_UI, ...over };
}
function maxWidth(lines: string[]): number {
  return lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0);
}

// --- commands ---

test("/newfang intake <path> preserves and reports without claiming analysis", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-iui-"));
  await initState(root, { displayName: "iui-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const result = await runIntakeCreate(root, "brief.md");
  const text = result.lines.join("\n");
  assert.equal(result.level, "info");
  assert.match(text, /Preserved INT-1/);
  assert.match(text, /sha256:\s+[a-f0-9]{64}/);
  assert.match(text, /nothing has been interpreted or applied yet/);
  assert.match(text, /Project Steward/, "recommends the analysis step");
});

test("/newfang intake rejects unsafe paths with an actionable message", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-iui-"));
  await initState(root, { displayName: "iui-demo" });
  const abs = await runIntakeCreate(root, "/etc/hosts");
  assert.equal(abs.level, "warning");
  assert.match(abs.lines.join(" "), /Absolute paths are not accepted/);
  const trav = await runIntakeCreate(root, "../escape.md");
  assert.match(trav.lines.join(" "), /traversal/);
});

test("/newfang intake status lists intakes and points at review", async () => {
  const { root } = await repoWithStagedIntake();
  const result = await runIntakeStatus(root);
  const text = result.lines.join("\n");
  assert.match(text, /INT-1 \[review_required\] rev 1 \(current\)/);
  assert.match(text, /\/newfang intake review/);
});

test("/newfang intake review shows the understanding check with provenance and inferences", async () => {
  const { root } = await repoWithStagedIntake();
  const result = await runIntakeReview(root);
  const text = result.lines.join("\n");
  assert.match(text, /Understanding Check — INT-1/);
  assert.match(text, /## Locked decisions/);
  assert.match(text, /Use SQLite\..*L3/s, "source line reference shown");
  assert.match(text, /Model inferences \(not stated by the source\)/);
  assert.match(text, /Which index\?/);
  assert.match(text, /## What applying this intake will change/);
  assert.match(text, /\/newfang intake apply/);
});

test("/newfang intake apply previews first and only applies with confirm", async () => {
  const { root, intakeId } = await repoWithStagedIntake();
  const before = await loadState(root);

  const preview = await runIntakeApply(root, { confirm: false });
  assert.match(preview.lines.join("\n"), /Nothing has changed yet/);
  assert.match(preview.lines.join("\n"), /create 1 decision/);
  const mid = await loadState(root);
  assert.equal(mid.decisions.length, before.decisions.length, "preview changed nothing");

  const applied = await runIntakeApply(root, { confirm: true });
  assert.match(applied.lines.join("\n"), /Applied INT-1/);
  const after = await loadState(root);
  assert.equal(after.intakes.find((i) => i.id === intakeId)?.status, "accepted");
  assert.equal(after.workItems.length, 1);
});

test("/newfang intake apply refuses when conflicts require resolution", async () => {
  const { root } = await repoWithStagedIntake({
    conflicts: [
      { id: "C1", findingIds: ["F1", "F2"], explanation: "storage vs scope", severity: "blocking" },
    ],
  });
  const result = await runIntakeApply(root, { confirm: true });
  assert.equal(result.level, "warning");
  assert.match(result.lines.join("\n"), /require your resolution/);
  const state = await loadState(root);
  assert.equal(state.decisions.length, 0);
});

test("/newfang intake reject records rejection and keeps artifacts", async () => {
  const { root } = await repoWithStagedIntake();
  const result = await runIntakeReject(root, "not now");
  assert.match(result.lines.join("\n"), /Rejected INT-1/);
  assert.match(result.lines.join("\n"), /retained/);
  assert.equal((await loadState(root)).intakes[0]?.status, "rejected");
});

test("/newfang orient reports absence, then current status", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-iui-"));
  await initState(root, { displayName: "iui-demo" });
  const none = await runOrient(root);
  assert.equal(none.level, "warning");
  assert.match(none.lines.join("\n"), /No repository orientation recorded/);
  assert.match(none.lines.join("\n"), /Project Steward/);

  await recordOrientation(root, {
    purpose: "Demo repo.",
    instructionFiles: [],
    provenance: ["read README.md"],
  });
  const recorded = await runOrient(root);
  assert.equal(recorded.level, "info");
  assert.match(recorded.lines.join("\n"), /Orientation ORI-1 — current/);
});

test("/newfang brief generates and displays the brief", async () => {
  const { root } = await repoWithStagedIntake();
  const result = await runBrief(root);
  const text = result.lines.join("\n");
  assert.match(text, /Project Brief/);
  assert.match(text, /Next justified action/);
  assert.match(text, /Pending review/, "pending intake surfaced in the brief");
});

// --- Understanding Check UI ---

test("a pending intake appears in console Attention and the Focus intake line", async () => {
  const { root } = await repoWithStagedIntake();
  const model = await buildModelForRoot(root, "0.82.0");
  assert.ok(model.pendingIntake, "pending intake in the view model");
  assert.equal(model.pendingIntake?.id, "INT-1");
  assert.ok(
    model.attention.some((a) => a.label.includes("INT-1") && a.label.includes("awaits review")),
    "surfaced in Attention",
  );
  const text = renderConsole(model, ui(), 100, plainStyler).join("\n");
  assert.match(text, /INTAKE/);
  assert.match(text, /INT-1 awaits review \(rev 1\)/);
  assert.match(text, /press u to open the Understanding Check/);
});

test("blocked intakes are emphasized as needing resolution", async () => {
  const { root } = await repoWithStagedIntake({
    conflicts: [{ id: "C1", findingIds: ["F1"], explanation: "unresolved", severity: "blocking" }],
  });
  const model = await buildModelForRoot(root, "0.82.0");
  assert.equal(model.pendingIntake?.blocked, true);
  assert.ok(model.attention.some((a) => a.severity === "high" && a.label.includes("conflicts")));
  const text = renderConsole(model, ui({ view: "understanding" }), 100, plainStyler).join("\n");
  assert.match(text, /Apply is blocked/);
  assert.match(text, /x reject/);
  assert.ok(!text.includes("a accept and apply"), "accept is not offered while blocked");
});

test("the Understanding Check renders sections, hash, and revision at all widths", async () => {
  const { root } = await repoWithStagedIntake();
  const model = await buildModelForRoot(root, "0.82.0");
  for (const width of WIDTHS) {
    const lines = renderConsole(model, ui({ view: "understanding" }), width, plainStyler);
    const text = lines.join("\n");
    assert.ok(maxWidth(lines) <= width, `overflow at width ${width}`);
    assert.match(text, /UNDERSTANDING CHECK/);
    assert.match(text, /INT-1 — brief\.md/);
    assert.match(text, /draft revision 1/);
    assert.match(text, /file · brief\.md · sha [a-f0-9]{12}…/);
  }
});

test("the Understanding Check scrolls and reports its position", async () => {
  const { root } = await repoWithStagedIntake();
  const model = await buildModelForRoot(root, "0.82.0");
  const top = renderConsole(model, ui({ view: "understanding", scroll: 0 }), 100, plainStyler).join(
    "\n",
  );
  const down = renderConsole(
    model,
    ui({ view: "understanding", scroll: 8 }),
    100,
    plainStyler,
  ).join("\n");
  assert.notEqual(top, down, "scrolling changes the visible window");
  assert.match(top, /lines 1-\d+ of \d+ · j\/k scroll/);
});

test("navigation opens, scrolls, and closes the Understanding Check", () => {
  // u opens it and remembers where to return.
  const opened = handleKey(ui({ view: "work" }), "understanding", 3);
  assert.equal(opened.ui.view, "understanding");
  assert.equal(opened.ui.returnView, "work");
  assert.equal(opened.ui.scroll, 0);

  // j/k scroll instead of moving selection.
  const scrolled = handleKey(opened.ui, "j", 3);
  assert.equal(scrolled.ui.scroll, 1);
  assert.equal(handleKey(scrolled.ui, "k", 3).ui.scroll, 0);
  assert.equal(handleKey(opened.ui, "k", 3).ui.scroll, 0, "clamped at the top");

  // Esc returns to the previous view.
  const closed = handleKey(scrolled.ui, "escape", 3);
  assert.equal(closed.ui.view, "work");
  assert.equal(closed.ui.scroll, 0);
  assert.equal(closed.action, "none", "Esc closes the view, not the console");

  // Review actions.
  assert.equal(handleKey(opened.ui, "accept", 3).action, "apply_intake");
  assert.equal(handleKey(opened.ui, "reject", 3).action, "reject_intake");
  // q still closes the console safely.
  assert.equal(handleKey(opened.ui, "q", 3).action, "close");
});

test("intake keys are mapped from raw input", () => {
  assert.equal(matchLogicalKey("u"), "understanding");
  assert.equal(matchLogicalKey("a"), "accept");
  assert.equal(matchLogicalKey("x"), "reject");
});

test("the console shows no intake section when none is pending", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-iui-"));
  await initState(root, { displayName: "iui-demo" });
  const model = await buildModelForRoot(root, "0.82.0");
  assert.equal(model.pendingIntake, null);
  const text = renderConsole(model, ui(), 100, plainStyler).join("\n");
  assert.ok(!text.includes("INTAKE"), "no intake noise when nothing is pending");
  const uv = renderConsole(model, ui({ view: "understanding" }), 100, plainStyler).join("\n");
  assert.match(uv, /No intake awaits review/, "safe empty state");
});
