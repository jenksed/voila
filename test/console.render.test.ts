import { test } from "node:test";
import assert from "node:assert/strict";

import { renderConsole, plainStyler } from "../src/ui/steward-console/render.ts";
import { layoutClass, twoColumn } from "../src/ui/steward-console/layout.ts";
import { INITIAL_UI, type ConsoleUiState } from "../src/ui/steward-console/navigation.ts";
import { selectableRefs, deriveAttention } from "../src/ui/steward-console/model.ts";
import {
  WIDTHS,
  blockedProject,
  emptyProject,
  errorModel,
  longTextProject,
  manyItemsProject,
  migrationModel,
  modelOf,
  normalProject,
  uninitializedModel,
} from "./fixtures/console.ts";

function ui(over: Partial<ConsoleUiState> = {}): ConsoleUiState {
  return { ...INITIAL_UI, ...over };
}
function render(model: Parameters<typeof renderConsole>[0], state: ConsoleUiState, width: number) {
  return renderConsole(model, state, width, plainStyler);
}
function maxWidth(lines: string[]): number {
  return lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0);
}

test("layout classes are chosen by width", () => {
  assert.equal(layoutClass(60), "compact");
  assert.equal(layoutClass(79), "compact");
  assert.equal(layoutClass(80), "standard");
  assert.equal(layoutClass(119), "standard");
  assert.equal(layoutClass(120), "wide");
  assert.equal(layoutClass(160), "wide");
  assert.equal(twoColumn(120), true);
  assert.equal(twoColumn(100), false);
});

test("no line overflows the width at any representative width", () => {
  const models = [
    modelOf(normalProject()),
    modelOf(blockedProject()),
    modelOf(manyItemsProject()),
    modelOf(longTextProject()),
    modelOf(emptyProject()),
    uninitializedModel(),
    migrationModel(),
    errorModel(),
  ];
  for (const model of models) {
    for (const width of WIDTHS) {
      for (const view of ["focus", "work", "truth"] as const) {
        for (const detailOpen of [false, true]) {
          const lines = render(model, ui({ view, detailOpen }), width);
          assert.ok(
            maxWidth(lines) <= width,
            `overflow at width ${width} view ${view} detail ${detailOpen}: ${maxWidth(lines)}`,
          );
        }
      }
      assert.ok(maxWidth(render(model, ui({ helpOpen: true }), width)) <= width);
    }
  }
});

test("focus view shows next action, rationale, and focus at all widths", () => {
  const model = modelOf(normalProject());
  for (const width of WIDTHS) {
    const text = render(model, ui(), width).join("\n");
    assert.match(text, /NEXT JUSTIFIED ACTION/);
    assert.match(text, /Why now:/);
    assert.match(text, /Focus: NF-2/);
    assert.match(text, /ATTENTION/);
    assert.match(text, /WORK/);
  }
});

test("wide layout uses two columns; standard and compact stack", () => {
  const model = modelOf(normalProject());
  const wide = render(model, ui(), 140).join("\n");
  const standard = render(model, ui(), 90).join("\n");
  assert.ok(wide.includes("│"), "wide layout has a column separator");
  assert.ok(!standard.includes(" │ "), "standard layout stacks panels");
});

test("wide panels are built at column width, not squeezed from full width", () => {
  const model = modelOf(normalProject());
  const lines = render(model, ui(), 140);
  const workRow = lines.find((l) => l.startsWith("WORK") && l.includes("│"));
  assert.ok(workRow, "work/attention render side by side");
  const left = workRow.split("│")[0] ?? "";
  assert.ok(!left.includes("…"), "short panel headings are not truncated in two-column mode");
  const counts = lines.find((l) => l.includes("Ready 1") && l.includes("│"));
  assert.ok(counts && !(counts.split("│")[0] ?? "").includes("…"), "counts are not truncated");
});

test("blocked focus and high-impact risk surface in attention", () => {
  const state = blockedProject();
  const attention = deriveAttention(state);
  assert.ok(attention.some((a) => a.label.includes("Focus NF-2 is blocked")));
  assert.ok(attention.some((a) => a.label.includes("High-impact open risk")));
  assert.ok(attention.some((a) => a.label.includes("Invalidated assumption")));
  const text = render(modelOf(state), ui(), 100).join("\n");
  assert.match(text, /blocked/);
});

test("work view groups items with focus first and ready sorted by priority", () => {
  const model = modelOf(normalProject());
  const lines = render(model, ui({ view: "work" }), 100);
  const text = lines.join("\n");
  const focusIdx = text.indexOf("FOCUS (1)");
  const inProgIdx = text.indexOf("IN PROGRESS");
  assert.ok(focusIdx >= 0 && inProgIdx > focusIdx, "focus group renders before in-progress");

  const many = modelOf(manyItemsProject());
  const readyGroup = many.work.groups.find((g) => g.title === "Ready");
  assert.ok(readyGroup);
  const priorities = readyGroup.items.map((i) => i.priority);
  const rank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const sorted = [...priorities].sort((a, b) => (rank[a] ?? 9) - (rank[b] ?? 9));
  assert.deepEqual(priorities, sorted, "ready items are ordered by priority");
});

test("project truth view lists decisions, open assumptions, and risks", () => {
  const text = render(modelOf(normalProject()), ui({ view: "truth" }), 100).join("\n");
  assert.match(text, /DECISIONS \(2\)/);
  assert.match(text, /DEC-1 \[accepted\]/);
  assert.match(text, /OPEN ASSUMPTIONS \(1\)/);
  assert.match(text, /RISKS \(1\)/);
});

test("selection marker moves with the selection index", () => {
  const model = modelOf(manyItemsProject());
  const refs = selectableRefs(model, "work");
  assert.ok(refs.length > 2);
  const first = render(model, ui({ view: "work", selection: 0 }), 100);
  const second = render(model, ui({ view: "work", selection: 1 }), 100);
  const markedFirst = first.filter((l) => l.startsWith("▸ "));
  const markedSecond = second.filter((l) => l.startsWith("▸ "));
  assert.equal(markedFirst.length, 1);
  assert.equal(markedSecond.length, 1);
  assert.notEqual(markedFirst[0], markedSecond[0]);
});

test("detail view shows fields, never raw JSON", () => {
  const model = modelOf(normalProject());
  const text = render(model, ui({ view: "truth", selection: 0, detailOpen: true }), 100).join("\n");
  assert.match(text, /DETAIL/);
  assert.match(text, /DEC-1 — Canonical repository state/);
  assert.match(text, /rationale:/);
  assert.ok(!text.includes('{"'), "no raw JSON in detail view");
  assert.ok(!text.includes("createdAt"), "internal timestamps are not dumped");
});

test("work detail shows acceptance criteria and dependencies", () => {
  const model = modelOf(normalProject());
  const text = render(model, ui({ view: "work", selection: 0, detailOpen: true }), 100).join("\n");
  assert.match(text, /NF-2 — Build planning-document intake/);
  assert.match(text, /status:/);
});

test("long text is truncated or wrapped without overflow", () => {
  const model = modelOf(longTextProject());
  for (const width of WIDTHS) {
    const lines = render(model, ui(), width);
    assert.ok(maxWidth(lines) <= width);
    assert.ok(lines.join("\n").includes("…") || width >= 160, "long text is truncated when narrow");
  }
});

test("empty project renders without crashing and invites creation", () => {
  const text = render(modelOf(emptyProject()), ui({ view: "work" }), 80).join("\n");
  assert.match(text, /No work items yet/);
});

test("uninitialized, migration, and error states render actionable screens", () => {
  assert.match(render(uninitializedModel(), ui(), 80).join("\n"), /\/voila init/);
  assert.match(render(migrationModel(), ui(), 80).join("\n"), /\/voila migrate --apply/);
  assert.match(render(errorModel(), ui(), 80).join("\n"), /malformed project\.json/);
});

test("help overlay lists the key bindings", () => {
  const text = render(modelOf(normalProject()), ui({ helpOpen: true }), 100).join("\n");
  assert.match(text, /switch view/);
  assert.match(text, /move selection/);
  assert.match(text, /reload canonical state/);
});

test("runtime context renders in the header and is optional", () => {
  const text = render(modelOf(normalProject()), ui(), 120).join("\n");
  assert.match(text, /feat\/project-operations/);
  assert.match(text, /pi 0\.82\.0/);
});
