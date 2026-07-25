// Pure keyboard-navigation reducer for the Steward Console. Takes a normalized logical key and the
// number of selectable rows in the current view; returns the next UI state and an optional action.

import type { ConsoleView } from "./model.ts";
import { CONSOLE_VIEWS } from "./model.ts";

export interface ConsoleUiState {
  view: ConsoleView;
  selection: number;
  detailOpen: boolean;
  helpOpen: boolean;
  /** Scroll offset for long content (the Understanding Check). */
  scroll: number;
  /** The view to return to when the Understanding Check closes. */
  returnView?: ConsoleView;
}

export const INITIAL_UI: ConsoleUiState = {
  view: "focus",
  selection: 0,
  detailOpen: false,
  helpOpen: false,
  scroll: 0,
};

export type NavAction =
  "none" | "close" | "reload" | "apply_intake" | "revise_intake" | "reject_intake";

/** Logical keys the console understands (the Pi component normalizes raw input to these). */
export type LogicalKey =
  | "tab"
  | "shift-tab"
  | "h"
  | "l"
  | "j"
  | "k"
  | "enter"
  | "escape"
  | "q"
  | "help"
  | "reload"
  | "understanding"
  | "accept"
  | "revise"
  | "reject";

function cycleView(view: ConsoleView, dir: 1 | -1): ConsoleView {
  const i = CONSOLE_VIEWS.indexOf(view);
  const n = CONSOLE_VIEWS.length;
  return CONSOLE_VIEWS[(i + dir + n) % n] as ConsoleView;
}

function clamp(n: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(n, max - 1));
}

export function handleKey(
  ui: ConsoleUiState,
  key: LogicalKey,
  selectableCount: number,
): { ui: ConsoleUiState; action: NavAction } {
  // Help overlay: any key except reload closes it (Esc/?/q handled below).
  if (ui.helpOpen && key !== "reload") {
    if (key === "help" || key === "escape" || key === "q") {
      return { ui: { ...ui, helpOpen: false }, action: "none" };
    }
    return { ui: { ...ui, helpOpen: false }, action: "none" };
  }

  // Understanding Check: scrolling and review actions take precedence.
  if (ui.view === "understanding") {
    switch (key) {
      case "j":
        return { ui: { ...ui, scroll: ui.scroll + 1 }, action: "none" };
      case "k":
        return { ui: { ...ui, scroll: Math.max(0, ui.scroll - 1) }, action: "none" };
      case "accept":
        return { ui, action: "apply_intake" };
      case "revise":
        return { ui, action: "revise_intake" };
      case "reject":
        return { ui, action: "reject_intake" };
      case "escape":
      case "understanding":
        return {
          ui: { ...ui, view: ui.returnView ?? "focus", scroll: 0, detailOpen: false },
          action: "none",
        };
      case "q":
        return { ui, action: "close" };
      case "help":
        return { ui: { ...ui, helpOpen: true }, action: "none" };
      case "reload":
        return { ui, action: "reload" };
      default:
        return { ui, action: "none" };
    }
  }

  switch (key) {
    case "help":
      return { ui: { ...ui, helpOpen: true }, action: "none" };
    case "understanding":
      return {
        ui: { ...ui, view: "understanding", returnView: ui.view, scroll: 0, detailOpen: false },
        action: "none",
      };
    case "reload":
      return { ui, action: "reload" };
    case "q":
      return { ui, action: "close" };
    case "escape":
      if (ui.detailOpen) return { ui: { ...ui, detailOpen: false }, action: "none" };
      return { ui, action: "close" };
    case "tab":
    case "l":
      return {
        ui: { ...ui, view: cycleView(ui.view, 1), selection: 0, detailOpen: false },
        action: "none",
      };
    case "shift-tab":
    case "h":
      return {
        ui: { ...ui, view: cycleView(ui.view, -1), selection: 0, detailOpen: false },
        action: "none",
      };
    case "j":
      if (ui.detailOpen) return { ui, action: "none" };
      return { ui: { ...ui, selection: clamp(ui.selection + 1, selectableCount) }, action: "none" };
    case "k":
      if (ui.detailOpen) return { ui, action: "none" };
      return { ui: { ...ui, selection: clamp(ui.selection - 1, selectableCount) }, action: "none" };
    case "enter":
      if (selectableCount <= 0) return { ui, action: "none" };
      return { ui: { ...ui, detailOpen: true }, action: "none" };
    default:
      return { ui, action: "none" };
  }
}
