// Composition/registration wiring. Depends on a small structural host interface, NOT on Pi types,
// so it is fully testable with a fake host. The thin Pi adapter bridges the real ExtensionAPI here.

import type { ProjectState } from "../domain/types.ts";
import { proofSummary, type ProofSummary } from "../domain/proof.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { runInit } from "../commands/init.ts";
import { runStatus } from "../commands/status.ts";
import { runBacklog } from "../commands/backlog.ts";
import { runAssumptions, runDecisions, runRisks } from "../commands/lists.ts";
import { runMigrate } from "../commands/migrate.ts";
import { runFocus } from "../commands/focus.ts";
import {
  runBrief,
  runIntakeApply,
  runIntakeCreate,
  runIntakeReject,
  runIntakeReview,
  runIntakeRevise,
  runIntakeStatus,
  runOrient,
} from "../commands/intake.ts";
import { runClaims, runComplete, runProof, runVerify } from "../commands/proof.ts";
import { runCommitSuggestion, runDeliver } from "../commands/deliver.ts";
import { assembleContext } from "../context/assemble.ts";
import { isContinuationRequest } from "../context/continuation.ts";
import { formatDoctor, runDoctor, worstLevel } from "../commands/doctor.ts";
import type { CommandResult } from "../commands/types.ts";
import { loadState } from "../state/store.ts";
import { MigrationRequiredError, StateNotFoundError } from "../state/errors.ts";
import { LegacyStateMigrationRequiredError, StateDirectoryConflictError } from "../state/legacy.ts";
import { homeViewLines } from "../ui/homeview.ts";
import { voilaTools, type VoilaTool } from "../tools/index.ts";
import { openStewardConsole, type ConsoleUiSurface } from "../ui/steward-console/open.ts";

export interface VoilaUi {
  notify(message: string, level?: "info" | "warning" | "error"): void;
  setWidget(key: string, lines: string[] | undefined): void;
  /** Present only in TUI mode (Pi `ctx.ui.custom`). */
  custom?: ConsoleUiSurface["custom"];
}

export interface VoilaCtx {
  cwd: string;
  /** Pi run mode; `"tui"` guards terminal-only UI such as the Steward Console. */
  mode?: string;
  ui: VoilaUi;
}

export interface AutocompleteItem {
  value: string;
  label: string;
}

export interface VoilaHost {
  registerCommand(
    name: string,
    options: {
      description?: string;
      getArgumentCompletions?: (prefix: string) => AutocompleteItem[] | null;
      handler: (args: string, ctx: VoilaCtx) => unknown | Promise<unknown>;
    },
  ): void;
  registerTool(tool: VoilaTool): void;
  on(event: string, handler: (event: unknown, ctx: VoilaCtx) => unknown | Promise<unknown>): void;
}

export interface RegisterOptions {
  piVersion: string;
  expectedPiVersion: string;
  nodeVersion: string;
  minNode: string;
}

export const HOME_WIDGET_KEY = "voila-home";
export const SUBCOMMANDS = [
  "home",
  "init",
  "status",
  "focus",
  "intake",
  "orient",
  "brief",
  "backlog",
  "claims",
  "proof",
  "verify",
  "complete",
  "deliver",
  "commit",
  "decisions",
  "assumptions",
  "risks",
  "migrate",
  "doctor",
] as const;

export function registerVoila(host: VoilaHost, options: RegisterOptions): void {
  for (const tool of voilaTools()) host.registerTool(tool);

  host.registerCommand("voila", {
    description: `Voila project steward: ${SUBCOMMANDS.join(" | ")}`,
    getArgumentCompletions: (prefix) => {
      const items = SUBCOMMANDS.filter((s) => s.startsWith(prefix)).map((s) => ({
        value: s,
        label: s,
      }));
      return items.length > 0 ? items : null;
    },
    handler: async (args, ctx) => {
      const tokens = (args ?? "").trim().split(/\s+/).filter(Boolean);
      const sub = tokens[0] ?? "status";
      switch (sub) {
        case "home":
          return openConsole(ctx, options.piVersion);
        case "status":
          return renderResult(ctx, await runStatus(ctx.cwd));
        case "init":
          return renderResult(ctx, await runInit(ctx.cwd));
        case "focus":
          return renderResult(ctx, await runFocus(ctx.cwd, tokens[1]));
        case "intake":
          return renderResult(ctx, await runIntakeSub(ctx, tokens.slice(1)));
        case "orient":
          return renderResult(ctx, await runOrient(ctx.cwd));
        case "brief":
          return renderResult(ctx, await runBrief(ctx.cwd));
        case "backlog":
          return renderResult(ctx, await runBacklog(ctx.cwd, tokens[1]));
        case "claims":
          return renderResult(ctx, await runClaims(ctx.cwd, tokens[1]));
        case "proof":
          return renderResult(ctx, await runProof(ctx.cwd, tokens[1]));
        case "verify":
          return renderResult(ctx, await runVerify(ctx.cwd, tokens.slice(1)));
        case "complete":
          return renderResult(ctx, await runComplete(ctx.cwd, tokens[1]));
        case "deliver":
          return renderResult(ctx, await runDeliver(ctx.cwd));
        case "commit":
          return renderResult(ctx, await runCommitSuggestion(ctx.cwd));
        case "decisions":
          return renderResult(ctx, await runDecisions(ctx.cwd));
        case "assumptions":
          return renderResult(ctx, await runAssumptions(ctx.cwd));
        case "risks":
          return renderResult(ctx, await runRisks(ctx.cwd));
        case "migrate":
          return renderResult(ctx, await runMigrate(ctx.cwd, tokens.includes("--apply")));
        case "doctor": {
          const checks = await runDoctor({ root: ctx.cwd, ...options });
          ctx.ui.notify(formatDoctor(checks).join("\n"), worstLevel(checks));
          await restoreHomeView(ctx);
          return;
        }
        default:
          ctx.ui.notify(`Unknown subcommand "${sub}". Use: ${SUBCOMMANDS.join(" | ")}`, "warning");
      }
    },
  });

  host.on("session_start", async (_event, ctx) => {
    await restoreHomeView(ctx);
  });

  // Inject the deterministic focus capsule before agent work. Read-only: never mutates state.
  //
  // The turn's prompt is read here, at the single host boundary, so an explicit "Continue." produces
  // an action-oriented directive instead of a bare context dump. Anything that is not an explicit
  // continuation request is left alone.
  host.on("before_agent_start", async (event, ctx) => {
    try {
      const prompt = (event as { prompt?: unknown } | null | undefined)?.prompt;
      const content = await assembleContext(ctx.cwd, {
        continuation: isContinuationRequest(typeof prompt === "string" ? prompt : undefined),
      });
      return { message: { customType: "voila-context", content, display: false } };
    } catch {
      return undefined;
    }
  });
}

/** A leading `INT-n` argument selects that intake rather than the current one. */
const INTAKE_ID = /^INT-\d+$/;

/** Strip one matching pair of surrounding quotes, so `revise "text"` stores `text`. */
function stripQuotes(text: string): string {
  const t = text.trim();
  if (t.length >= 2 && ((t[0] === '"' && t.at(-1) === '"') || (t[0] === "'" && t.at(-1) === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Route `/voila intake …` subcommands. Apply requires the explicit `confirm` token. */
async function runIntakeSub(ctx: VoilaCtx, args: string[]): Promise<CommandResult> {
  const sub = args[0];
  if (!sub) return runIntakeStatus(ctx.cwd);
  switch (sub) {
    case "status":
      return runIntakeStatus(ctx.cwd);
    case "review":
      return runIntakeReview(ctx.cwd, args[1]);
    case "apply":
      return runIntakeApply(ctx.cwd, { confirm: args.includes("confirm") });
    case "revise": {
      const rest = args.slice(1);
      const target = rest[0] && INTAKE_ID.test(rest[0]) ? rest.shift() : undefined;
      const supersede = rest.includes("supersede");
      const feedback = rest.filter((a) => a !== "supersede").join(" ");
      return runIntakeRevise(ctx.cwd, stripQuotes(feedback), {
        ...(target ? { intakeId: target } : {}),
        ...(supersede ? { supersedePrevious: true } : {}),
      });
    }
    case "reject": {
      // An intake ID must route to that intake. Treating it as free-text reason rejected the
      // *current* intake and filed the ID as the reason.
      const rest = args.slice(1);
      const target = rest[0] && INTAKE_ID.test(rest[0]) ? rest.shift() : undefined;
      const reason = stripQuotes(rest.join(" ")) || undefined;
      return runIntakeReject(ctx.cwd, reason, target);
    }
    default:
      // Anything else is treated as a repository-relative source path.
      return runIntakeCreate(ctx.cwd, args.join(" "));
  }
}

async function renderResult(ctx: VoilaCtx, result: CommandResult): Promise<void> {
  ctx.ui.notify(result.lines.join("\n"), result.level);
  await restoreHomeView(ctx);
}

/**
 * Open the Steward Console. `custom()` is TUI-only in Pi, so non-TUI modes fall back to the compact
 * `/voila status` output instead of failing.
 */
async function openConsole(ctx: VoilaCtx, piVersion: string): Promise<void> {
  const custom = ctx.ui.custom;
  if (!custom || (ctx.mode !== undefined && ctx.mode !== "tui")) {
    ctx.ui.notify(
      "The Steward Console needs an interactive terminal; showing status instead.",
      "info",
    );
    return renderResult(ctx, await runStatus(ctx.cwd));
  }
  await openStewardConsole(
    {
      cwd: ctx.cwd,
      mode: ctx.mode,
      ui: { custom: custom.bind(ctx.ui), notify: ctx.ui.notify.bind(ctx.ui) },
    },
    piVersion,
  );
  await restoreHomeView(ctx);
}

export async function restoreHomeView(ctx: VoilaCtx): Promise<void> {
  let state: ProjectState | null = null;
  try {
    state = await loadState(ctx.cwd);
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      ctx.ui.setWidget(HOME_WIDGET_KEY, homeViewLines(null));
      return;
    }
    if (error instanceof StateDirectoryConflictError) {
      ctx.ui.setWidget(HOME_WIDGET_KEY, ["Voila · state directory conflict — run /voila doctor"]);
      return;
    }
    if (error instanceof LegacyStateMigrationRequiredError) {
      ctx.ui.setWidget(HOME_WIDGET_KEY, [
        "Voila · legacy state migration required — run /voila migrate",
      ]);
      return;
    }
    if (error instanceof MigrationRequiredError) {
      ctx.ui.setWidget(HOME_WIDGET_KEY, ["Voila · migration required — run /voila migrate"]);
      return;
    }
    ctx.ui.notify(`Voila state problem: ${(error as Error).message}`, "error");
    ctx.ui.setWidget(HOME_WIDGET_KEY, ["Voila · state error — run /voila doctor"]);
    return;
  }
  // Only pay for a git fingerprint when there is proof to warn about.
  let proof: ProofSummary | null = null;
  if (state.claims.length > 0) {
    proof = proofSummary(state, await tryRepositoryFingerprint(ctx.cwd));
  }
  ctx.ui.setWidget(HOME_WIDGET_KEY, homeViewLines(state, 80, proof));
}
