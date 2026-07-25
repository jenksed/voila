// `/newfang intake …`, `/newfang orient`, `/newfang brief` command logic. Pure of Pi.
//
// These commands own preservation, review, confirmation, and display. They never claim that
// preserving a source or queueing a request means the model has analyzed anything.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { loadState } from "../state/store.ts";
import { intakePaths, statePaths } from "../state/paths.ts";
import {
  applyIntake,
  createIntake,
  readDraft,
  rejectIntake,
  writeProjectBrief,
} from "../state/intake-store.ts";
import { currentOrientationStatus } from "../state/orientation-store.ts";
import { applyDraft, applySummaryLines } from "../domain/apply.ts";
import { blockingConflicts } from "../domain/intake.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import { NewfangStateError } from "../state/errors.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

function operationError(error: unknown): CommandResult | null {
  if (error instanceof ProjectOperationError || error instanceof NewfangStateError) {
    return { level: "warning", lines: [error.message] };
  }
  return null;
}

/** `/newfang intake <repository-relative-path>` — preserve the source, then recommend analysis. */
export async function runIntakeCreate(root: string, path: string): Promise<CommandResult> {
  try {
    const result = await createIntake(root, { path });
    const i = result.intake;
    return {
      level: "info",
      lines: [
        `Preserved ${i.id}: ${i.title}`,
        `  source:   ${i.sourceRef} (${result.lineCount} lines)`,
        `  sha256:   ${i.sourceSha256}`,
        `  status:   ${i.status} — nothing has been interpreted or applied yet`,
        "",
        "Next: ask the Project Steward to analyze this intake (it will read the preserved source and",
        "stage a structured draft), then run /newfang intake review.",
      ],
    };
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }
}

/** `/newfang intake status` — where the current intake stands. */
export async function runIntakeStatus(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  if (state.intakes.length === 0) {
    return {
      level: "info",
      lines: [
        "No intakes yet. Run /newfang intake <repository-relative-path> to preserve a source.",
      ],
      state,
    };
  }
  const lines = [`Intakes (${state.intakes.length}):`];
  for (const i of state.intakes) {
    const current = i.id === state.currentIntakeId ? " (current)" : "";
    lines.push(
      `  ${i.id} [${i.status}] rev ${i.draftRevision}${current} — ${i.title} (${i.sourceType})`,
    );
  }
  const pending = state.intakes.find((i) => i.status === "review_required");
  if (pending) lines.push("", `${pending.id} awaits review: run /newfang intake review.`);
  return { level: "info", lines, state };
}

export interface IntakeReviewData {
  intakeId: string;
  draftRevision: number;
  understanding: string;
  blocked: boolean;
}

/** Load the generated Understanding Check for review. */
export async function loadIntakeReview(
  root: string,
  intakeId?: string,
): Promise<IntakeReviewData | CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  const id = intakeId ?? state.currentIntakeId;
  if (!id) {
    return { level: "warning", lines: ["No current intake. Run /newfang intake <path> first."] };
  }
  const record = state.intakes.find((i) => i.id === id);
  if (!record) return { level: "warning", lines: [`No intake ${id}.`] };
  const draft = await readDraft(root, id);
  if (!draft) {
    return {
      level: "warning",
      lines: [
        `${id} has no staged draft yet (status ${record.status}).`,
        "Ask the Project Steward to analyze the preserved source first.",
      ],
    };
  }
  const paths = intakePaths(root, id);
  const understanding = existsSync(paths.understanding)
    ? await readFile(paths.understanding, "utf8")
    : "(understanding view missing; re-stage the draft)";
  return {
    intakeId: id,
    draftRevision: draft.draftRevision,
    understanding,
    blocked: blockingConflicts(draft).length > 0,
  };
}

/** `/newfang intake review` — show the understanding check as text (console shows the rich view). */
export async function runIntakeReview(root: string, intakeId?: string): Promise<CommandResult> {
  const data = await loadIntakeReview(root, intakeId);
  if ("level" in data) return data;
  return {
    level: data.blocked ? "warning" : "info",
    lines: [
      ...data.understanding.split("\n"),
      "",
      data.blocked
        ? "Apply is blocked by conflicts requiring your resolution."
        : `To accept: /newfang intake apply  ·  To reject: /newfang intake reject`,
    ],
  };
}

/**
 * `/newfang intake apply` — two-step: without `confirm`, show exactly what will change; with
 * `confirm`, apply. The confirmation the user sees comes from the same code path that applies.
 */
export async function runIntakeApply(
  root: string,
  opts: { confirm: boolean; intakeId?: string } = { confirm: false },
): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  const id = opts.intakeId ?? state.currentIntakeId;
  if (!id) return { level: "warning", lines: ["No current intake to apply."] };
  const record = state.intakes.find((i) => i.id === id);
  if (!record) return { level: "warning", lines: [`No intake ${id}.`] };
  const draft = await readDraft(root, id);
  if (!draft) return { level: "warning", lines: [`${id} has no staged draft to apply.`] };

  const blocking = blockingConflicts(draft);
  if (blocking.length > 0) {
    return {
      level: "warning",
      lines: [
        `Cannot apply ${id}: ${blocking.length} conflict(s) require your resolution:`,
        ...blocking.map((c) => `  - ${c.id}: ${c.explanation}`),
        "",
        "Ask the Project Steward for a revised draft that resolves these.",
      ],
    };
  }

  if (!opts.confirm) {
    try {
      const preview = applyDraft(state, draft, new Date().toISOString()).summary;
      return {
        level: "info",
        lines: [
          ...applySummaryLines(preview),
          "",
          `Nothing has changed yet. Run /newfang intake apply confirm to apply revision ${draft.draftRevision}.`,
        ],
      };
    } catch (error) {
      return operationError(error) ?? loadErrorResult(error);
    }
  }

  try {
    const result = await applyIntake(root, id, {
      reviewedDraftRevision: draft.draftRevision,
      confirmed: true,
    });
    if (result.alreadyApplied) {
      return {
        level: "info",
        lines: [`${id} revision ${draft.draftRevision} was already applied; nothing changed.`],
      };
    }
    return {
      level: "info",
      lines: [`Applied ${id}.`, ...applySummaryLines(result.summary), "", "Project brief updated."],
    };
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }
}

/** `/newfang intake reject` */
export async function runIntakeReject(
  root: string,
  reason?: string,
  intakeId?: string,
): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  const id = intakeId ?? state.currentIntakeId;
  if (!id) return { level: "warning", lines: ["No current intake to reject."] };
  try {
    const record = await rejectIntake(root, id, reason);
    return {
      level: "info",
      lines: [`Rejected ${record.id}. The preserved source and drafts are retained.`],
    };
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }
}

/**
 * `/newfang orient` — report current orientation and staleness, and recommend the Steward workflow.
 * It deliberately does not pretend that filesystem enumeration equals orientation.
 */
export async function runOrient(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  const status = await currentOrientationStatus(root, state);
  const lines: string[] = [];
  if (!status.record) {
    lines.push(
      "No repository orientation recorded.",
      "",
      "Ask the Project Steward to orient (it will inspect instructions, key docs, and build/test",
      "commands narrowly, then record a snapshot with newfang_record_orientation).",
    );
    return { level: "warning", lines, state };
  }
  lines.push(
    `Orientation ${status.record.id} — ${status.staleness.stale ? "STALE" : "current"}`,
    ...(status.record.repositoryHead
      ? [`  head:     ${status.record.repositoryHead.slice(0, 12)}`]
      : []),
    `  recorded: ${status.record.createdAt}`,
    `  artifact: .newfang/${status.record.artifactRef}`,
  );
  if (status.staleness.stale) {
    lines.push(`  reasons:  ${status.staleness.reasons.join("; ")}`);
    lines.push("", "Ask the Project Steward to re-orient and record a fresh snapshot.");
  }
  if (status.artifact) {
    lines.push(
      "",
      `Purpose: ${status.artifact.purpose}`,
      `Verified commands: ${status.artifact.verifiedCommands.length} · Unknowns: ${status.artifact.unknowns.length}`,
    );
  }
  return { level: status.staleness.stale ? "warning" : "info", lines, state };
}

/** `/newfang brief` — display the generated project brief, regenerating it if missing. */
export async function runBrief(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  const paths = statePaths(root);
  if (!existsSync(paths.projectBrief)) {
    await writeProjectBrief(root, state);
  }
  const brief = await readFile(paths.projectBrief, "utf8");
  return { level: "info", lines: brief.split("\n"), state };
}
