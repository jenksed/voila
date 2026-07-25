import { test } from "node:test";
import assert from "node:assert/strict";

import {
  handleKey,
  INITIAL_UI,
  type ConsoleUiState,
} from "../src/ui/steward-console/navigation.ts";
import { createConsoleComponent, matchLogicalKey } from "../src/ui/steward-console/component.ts";
import { selectableRefs } from "../src/ui/steward-console/model.ts";
import { plainStyler } from "../src/ui/steward-console/render.ts";
import { modelOf, normalProject, manyItemsProject } from "./fixtures/console.ts";

function ui(over: Partial<ConsoleUiState> = {}): ConsoleUiState {
  return { ...INITIAL_UI, ...over };
}

test("tab and h/l cycle views in order Focus -> Work -> Proof -> Project Truth", () => {
  let s = ui({ selection: 3 });
  s = handleKey(s, "tab", 5).ui;
  assert.equal(s.view, "work");
  assert.equal(s.selection, 0, "selection resets when the view changes");
  s = handleKey(s, "tab", 5).ui;
  assert.equal(s.view, "proof");
  s = handleKey(s, "tab", 5).ui;
  assert.equal(s.view, "truth");
  s = handleKey(s, "tab", 5).ui;
  assert.equal(s.view, "focus", "wraps around");
  s = handleKey(s, "shift-tab", 5).ui;
  assert.equal(s.view, "truth", "reverse wraps");
  s = handleKey(s, "shift-tab", 5).ui;
  assert.equal(s.view, "proof");
  assert.equal(handleKey(ui(), "l", 5).ui.view, "work");
  assert.equal(handleKey(ui(), "h", 5).ui.view, "truth");
});

test("j/k move selection and clamp at the ends", () => {
  let s = ui();
  s = handleKey(s, "j", 3).ui;
  assert.equal(s.selection, 1);
  s = handleKey(s, "j", 3).ui;
  s = handleKey(s, "j", 3).ui;
  assert.equal(s.selection, 2, "clamped at last row");
  s = handleKey(s, "k", 3).ui;
  assert.equal(s.selection, 1);
  s = handleKey(s, "k", 3).ui;
  s = handleKey(s, "k", 3).ui;
  assert.equal(s.selection, 0, "clamped at first row");
  assert.equal(handleKey(ui(), "j", 0).ui.selection, 0, "no rows: stays at 0");
});

test("enter opens detail, escape closes detail then closes console", () => {
  let s = ui();
  s = handleKey(s, "enter", 2).ui;
  assert.equal(s.detailOpen, true);
  const back = handleKey(s, "escape", 2);
  assert.equal(back.ui.detailOpen, false);
  assert.equal(back.action, "none");
  const close = handleKey(back.ui, "escape", 2);
  assert.equal(close.action, "close");
  assert.equal(handleKey(ui(), "enter", 0).ui.detailOpen, false, "no rows: detail stays closed");
});

test("j/k do not move selection while detail is open", () => {
  const s = ui({ detailOpen: true, selection: 1 });
  assert.equal(handleKey(s, "j", 5).ui.selection, 1);
  assert.equal(handleKey(s, "k", 5).ui.selection, 1);
});

test("help toggles and any key dismisses it", () => {
  const opened = handleKey(ui(), "help", 3).ui;
  assert.equal(opened.helpOpen, true);
  assert.equal(handleKey(opened, "help", 3).ui.helpOpen, false);
  assert.equal(handleKey(opened, "escape", 3).ui.helpOpen, false);
  assert.equal(handleKey(opened, "j", 3).ui.helpOpen, false);
});

test("q closes and r requests reload", () => {
  assert.equal(handleKey(ui(), "q", 3).action, "close");
  assert.equal(handleKey(ui(), "reload", 3).action, "reload");
});

test("raw terminal input maps to logical keys", () => {
  assert.equal(matchLogicalKey("\t"), "tab");
  assert.equal(matchLogicalKey("\x1b[Z"), "shift-tab");
  assert.equal(matchLogicalKey("\r"), "enter");
  assert.equal(matchLogicalKey("\x1b"), "escape");
  assert.equal(matchLogicalKey("j"), "j");
  assert.equal(matchLogicalKey("?"), "help");
  assert.equal(matchLogicalKey("r"), "reload");
  assert.equal(matchLogicalKey("z"), null, "unknown keys are ignored");
});

test("component renders, navigates, reloads, and closes", async () => {
  const model = modelOf(normalProject());
  let renders = 0;
  let closed = false;
  let reloads = 0;
  const component = createConsoleComponent({
    initialModel: model,
    styler: plainStyler,
    requestRender: () => {
      renders++;
    },
    done: () => {
      closed = true;
    },
    reload: async () => {
      reloads++;
      return modelOf(manyItemsProject());
    },
  });

  assert.ok(component.render(100).length > 5);
  assert.equal(component.getUiState().view, "focus");

  component.handleInput("\t");
  assert.equal(component.getUiState().view, "work");
  assert.ok(renders > 0, "view change requests a render");

  component.handleInput("z"); // unknown key is ignored
  assert.equal(component.getUiState().view, "work");

  component.handleInput("j");
  assert.equal(component.getUiState().selection, 1);

  component.handleInput("\r");
  assert.equal(component.getUiState().detailOpen, true);
  component.handleInput("\x1b");
  assert.equal(component.getUiState().detailOpen, false);

  component.handleInput("r");
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(reloads, 1);
  assert.equal(component.getModel().work.groups.length > 0, true, "model replaced after reload");

  component.handleInput("q");
  assert.equal(closed, true);
});

test("selectable refs match what each view can open", () => {
  const model = modelOf(normalProject());
  assert.ok(selectableRefs(model, "focus").length >= 1);
  assert.equal(
    selectableRefs(model, "work").length,
    model.work.groups.flatMap((g) => g.items).length,
  );
  assert.equal(
    selectableRefs(model, "truth").length,
    model.truth.decisions.length + model.truth.assumptions.length + model.truth.risks.length,
  );
});
