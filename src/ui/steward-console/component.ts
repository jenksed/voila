// Console component: a structural Pi TUI Component (render/handleInput/invalidate) that delegates to
// the pure render + navigation layers. No pi-tui import is needed — the Component shape is structural
// and theme/tui are injected. Extra getter methods are for tests and ignored by Pi.

import { renderConsole, type Styler } from "./render.ts";
import { handleKey, INITIAL_UI, type ConsoleUiState, type LogicalKey } from "./navigation.ts";
import { selectableRefs, type ConsoleModel } from "./model.ts";

export interface ConsoleComponent {
  render(width: number): string[];
  handleInput(data: string): void;
  invalidate(): void;
  getUiState(): ConsoleUiState;
  getModel(): ConsoleModel;
}

/** Map raw terminal input to a logical key the navigation reducer understands. */
export function matchLogicalKey(data: string): LogicalKey | null {
  switch (data) {
    case "\t":
      return "tab";
    case "\x1b[Z":
      return "shift-tab";
    case "\r":
    case "\n":
      return "enter";
    case "\x1b":
      return "escape";
    case "j":
      return "j";
    case "k":
      return "k";
    case "h":
      return "h";
    case "l":
      return "l";
    case "q":
      return "q";
    case "r":
      return "reload";
    case "?":
      return "help";
    default:
      return null;
  }
}

export interface ConsoleComponentDeps {
  initialModel: ConsoleModel;
  styler: Styler;
  requestRender: () => void;
  done: () => void;
  reload: () => Promise<ConsoleModel>;
  matchKey?: (data: string) => LogicalKey | null;
}

export function createConsoleComponent(deps: ConsoleComponentDeps): ConsoleComponent {
  let model = deps.initialModel;
  let ui: ConsoleUiState = { ...INITIAL_UI };
  const match = deps.matchKey ?? matchLogicalKey;

  return {
    render(width: number): string[] {
      return renderConsole(model, ui, width, deps.styler);
    },
    handleInput(data: string): void {
      const key = match(data);
      if (!key) return;
      const count = selectableRefs(model, ui.view).length;
      const result = handleKey(ui, key, count);
      ui = result.ui;
      if (result.action === "close") {
        deps.done();
        return;
      }
      if (result.action === "reload") {
        deps
          .reload()
          .then((m) => {
            model = m;
            deps.requestRender();
          })
          .catch(() => {});
        return;
      }
      deps.requestRender();
    },
    invalidate(): void {},
    getUiState(): ConsoleUiState {
      return ui;
    },
    getModel(): ConsoleModel {
      return model;
    },
  };
}
