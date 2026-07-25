// Console opener: loads canonical state into a view model, then shows the component through Pi's
// `ctx.ui.custom`. This is the only console module aware of the Pi UI context shape.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadState } from "../../state/store.ts";
import { MigrationRequiredError, StateNotFoundError } from "../../state/errors.ts";
import { readDraft, readUnderstanding } from "../../state/intake-store.ts";
import { currentOrientationStatus } from "../../state/orientation-store.ts";
import { blockingConflicts } from "../../domain/intake.ts";
import { runIntakeApply, runIntakeReject } from "../../commands/intake.ts";
import { buildConsoleModel, type ConsoleModel } from "./model.ts";
import { getRuntimeContext } from "./runtime.ts";
import { createConsoleComponent, type ConsoleComponent } from "./component.ts";
import type { Styler, StyleToken } from "./render.ts";
import { plainStyler } from "./render.ts";

/** Minimal structural shape of Pi's Theme that the console needs. */
export interface ThemeLike {
  fg(color: string, text: string): string;
  bold(text: string): string;
}

/** Minimal structural shape of Pi's TUI that the console needs. */
export interface TuiLike {
  requestRender(force?: boolean): void;
}

/** Map console style tokens to Pi theme color tokens. */
const TOKEN_MAP: Record<StyleToken, string> = {
  accent: "accent",
  success: "success",
  warning: "warning",
  error: "error",
  muted: "muted",
  dim: "dim",
  border: "borderMuted",
  text: "text",
};

export function themeStyler(theme: ThemeLike | undefined): Styler {
  if (!theme) return plainStyler;
  return {
    fg: (token, text) => {
      try {
        return theme.fg(TOKEN_MAP[token], text);
      } catch {
        return text;
      }
    },
    bold: (text) => {
      try {
        return theme.bold(text);
      } catch {
        return text;
      }
    },
  };
}

/** Build the console view model for a project root (canonical state + runtime context). */
export async function buildModelForRoot(root: string, piVersion?: string): Promise<ConsoleModel> {
  const runtime = getRuntimeContext(root, piVersion);
  try {
    const state = await loadState(root);

    // Pending intake + its generated Understanding Check (read-only).
    let pendingIntake = null as Parameters<typeof buildConsoleModel>[0]["pendingIntake"];
    const pending = state.intakes.find((i) => i.status === "review_required");
    if (pending) {
      const draft = await readDraft(root, pending.id);
      const understandingText = await readUnderstanding(root, pending.id, draft?.draftRevision);
      const understanding = understandingText
        ? understandingText.split("\n")
        : ["(understanding view missing for this revision; re-stage the draft)"];
      pendingIntake = {
        id: pending.id,
        title: pending.title,
        draftRevision: pending.draftRevision,
        sourceType: pending.sourceType,
        sourceRef: pending.sourceRef,
        sourceSha256: pending.sourceSha256,
        blocked: draft ? blockingConflicts(draft).length > 0 : false,
        understanding,
      };
    }

    const orientationStatus = await currentOrientationStatus(root, state);
    const orientation = orientationStatus.record
      ? {
          id: orientationStatus.record.id,
          stale: orientationStatus.staleness.stale,
          reasons: orientationStatus.staleness.reasons,
        }
      : null;

    return buildConsoleModel({ status: "ok", state, pendingIntake, orientation }, runtime);
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      return buildConsoleModel({ status: "uninitialized" }, runtime);
    }
    if (error instanceof MigrationRequiredError) {
      return buildConsoleModel({ status: "migration", message: error.message }, runtime);
    }
    return buildConsoleModel({ status: "error", message: (error as Error).message }, runtime);
  }
}

/** UI surface the console needs from Pi's extension context. */
export interface ConsoleUiSurface {
  custom<T>(
    factory: (
      tui: TuiLike,
      theme: ThemeLike,
      keybindings: unknown,
      done: (result: T) => void,
    ) => ConsoleComponent,
  ): Promise<T>;
  notify(message: string, level?: "info" | "warning" | "error"): void;
}

export interface OpenConsoleCtx {
  cwd: string;
  mode?: string;
  ui: ConsoleUiSurface;
}

/**
 * Open the Steward Console. Requires a real terminal (Pi `custom()` is TUI-only); in other modes the
 * caller should fall back to `/newfang status`.
 */
export async function openStewardConsole(ctx: OpenConsoleCtx, piVersion?: string): Promise<void> {
  const initialModel = await buildModelForRoot(ctx.cwd, piVersion);
  await ctx.ui.custom<void>((tui, theme, _keybindings, done) =>
    createConsoleComponent({
      initialModel,
      styler: themeStyler(theme),
      requestRender: () => tui.requestRender(),
      done: () => done(undefined),
      reload: () => buildModelForRoot(ctx.cwd, piVersion),
      // Review actions from the Understanding Check. `confirm: true` here IS the user's explicit
      // in-console confirmation (they pressed `a` on the reviewed draft).
      applyIntake: async () => {
        const result = await runIntakeApply(ctx.cwd, { confirm: true });
        ctx.ui.notify(result.lines.join("\n"), result.level);
        return buildModelForRoot(ctx.cwd, piVersion);
      },
      rejectIntake: async () => {
        const result = await runIntakeReject(ctx.cwd, "rejected in Steward Console");
        ctx.ui.notify(result.lines.join("\n"), result.level);
        return buildModelForRoot(ctx.cwd, piVersion);
      },
    }),
  );
}
