// Composition/registration wiring. Depends on a small structural host interface,
// NOT on Pi types, so it is fully testable with a fake host. The thin Pi adapter
// (.pi/extensions/newfang.ts) bridges the real ExtensionAPI to this interface.

import type { ProjectState } from "../domain/types.ts";
import { runInit } from "../commands/init.ts";
import { runStatus } from "../commands/status.ts";
import { formatDoctor, runDoctor, worstLevel } from "../commands/doctor.ts";
import type { CommandResult } from "../commands/types.ts";
import { loadState } from "../state/store.ts";
import { StateNotFoundError } from "../state/errors.ts";
import { homeViewLines } from "../ui/homeview.ts";

export interface NewfangUi {
  notify(message: string, level?: "info" | "warning" | "error"): void;
  setWidget(key: string, lines: string[] | undefined): void;
}

export interface NewfangCtx {
  cwd: string;
  ui: NewfangUi;
}

export interface AutocompleteItem {
  value: string;
  label: string;
}

export interface NewfangHost {
  registerCommand(
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
      handler: (args: string, ctx: NewfangCtx) => unknown | Promise<unknown>;
    },
  ): void;
  on(event: string, handler: (event: unknown, ctx: NewfangCtx) => unknown | Promise<unknown>): void;
}

export interface RegisterOptions {
  piVersion: string;
  expectedPiVersion: string;
  nodeVersion: string;
  minNode: string;
}

export const HOME_WIDGET_KEY = "newfang-home";
export const SUBCOMMANDS = ["init", "status", "doctor"] as const;

/** Register NewFang's command surface and lifecycle wiring on a host. */
export function registerNewfang(host: NewfangHost, options: RegisterOptions): void {
  host.registerCommand("newfang", {
    description: "NewFang project steward: init | status | doctor",
    getArgumentCompletions: (prefix) => {
      const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix)).map((s) => ({
        value: s,
        label: s,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const sub = (args ?? "").trim().split(/\s+/)[0] ?? "";
      switch (sub) {
        case "":
        case "status":
          await renderResult(ctx, await runStatus(ctx.cwd));
          return;
        case "init":
          await renderResult(ctx, await runInit(ctx.cwd));
          return;
        case "doctor": {
          const checks = await runDoctor({ root: ctx.cwd, ...options });
          ctx.ui.notify(formatDoctor(checks).join("\n"), worstLevel(checks));
          return;
        }
        default:
          ctx.ui.notify(
            `Unknown subcommand "${sub}". Use: /newfang init | status | doctor`,
            "warning",
          );
      }
    },
  });

  // On resume: restore the minimal home view from canonical state. Never overwrites
  // canonical state, and records no event merely because a session started.
  host.on("session_start", async (_event, ctx) => {
    await restoreHomeView(ctx);
  });
}

async function renderResult(ctx: NewfangCtx, result: CommandResult): Promise<void> {
  ctx.ui.notify(result.lines.join("\n"), result.level);
  await restoreHomeView(ctx);
}

/** Load canonical state (read-only) and set the home-view widget. */
export async function restoreHomeView(ctx: NewfangCtx): Promise<void> {
  let state: ProjectState | null = null;
  try {
    state = await loadState(ctx.cwd);
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      // Normal before init: show the quiet initialization hint.
      ctx.ui.setWidget(HOME_WIDGET_KEY, homeViewLines(null));
      return;
    }
    // Malformed or incompatible canonical state: surface clearly, do not overwrite.
    ctx.ui.notify(`NewFang state problem: ${(error as Error).message}`, "error");
    ctx.ui.setWidget(HOME_WIDGET_KEY, ["NewFang · state error — run /newfang doctor"]);
    return;
  }
  ctx.ui.setWidget(HOME_WIDGET_KEY, homeViewLines(state));
}
