// LLM-callable tools for intake, orientation, next action, and project context.
// The model supplies interpretation; Voila validates, persists, and gates. A tool never treats
// model intent as user confirmation — applying an intake requires an explicit confirmation flag that
// the human workflow sets.

import { Type } from "typebox";
import { StringEnum } from "./schema.ts";
import type { VoilaTool, VoilaToolResult } from "./index.ts";
import { loadState, updateState } from "../state/store.ts";
import {
  applyIntake,
  createIntake,
  findIntake,
  MAX_REVIEW_FEEDBACK_LENGTH,
  rejectIntake,
  requestIntakeRevision,
  stageIntakeDraft,
  writeProjectBrief,
} from "../state/intake-store.ts";
import { currentOrientationStatus, recordOrientation } from "../state/orientation-store.ts";
import { applySummaryLines } from "../domain/apply.ts";
import { setFocusWorkItem, setNextAction, setNextActionRationale } from "../domain/operations.ts";
import { blockingConflicts, modelInferences } from "../domain/intake.ts";
import { readDraft } from "../state/intake-store.ts";
import { backlogSummary } from "../domain/operations.ts";
import { INTAKE_SOURCE_TYPES } from "../domain/types.ts";

function text(line: string, details?: unknown): VoilaToolResult {
  return { content: [{ type: "text", text: line }], details };
}

const SourceRefSchema = Type.Object(
  {
    intakeId: Type.String(),
    startLine: Type.Optional(Type.Integer({ minimum: 1 })),
    endLine: Type.Optional(Type.Integer({ minimum: 1 })),
    marker: Type.Optional(Type.String()),
    excerpt: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const FindingSchema = Type.Object(
  {
    id: Type.String({ description: "Draft-local ID, e.g. F1" }),
    category: StringEnum([
      "objective",
      "locked_decision",
      "proposed_decision",
      "constraint",
      "requirement",
      "acceptance_criterion",
      "open_question",
      "assumption",
      "risk",
      "non_goal",
      "evidence",
      "example",
    ] as const),
    statement: Type.String(),
    origin: StringEnum(["source", "model_inference"] as const, "source requires sourceRefs"),
    sourceRefs: Type.Optional(Type.Array(SourceRefSchema)),
    relatedFindingIds: Type.Optional(Type.Array(Type.String())),
    confidence: Type.Optional(StringEnum(["low", "medium", "high"] as const)),
    note: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const ConflictSchema = Type.Object(
  {
    id: Type.String(),
    findingIds: Type.Array(Type.String()),
    explanation: Type.String(),
    severity: StringEnum(["blocking", "warning", "info"] as const),
    requiresUserResolution: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);

const ProposedWorkSchema = Type.Object(
  {
    id: Type.String(),
    kind: StringEnum(["outcome", "task", "defect"] as const),
    title: Type.String(),
    description: Type.Optional(Type.String()),
    priority: Type.Optional(StringEnum(["urgent", "high", "normal", "low"] as const)),
    acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
    sourceFindingIds: Type.Array(Type.String()),
    relatesToWorkItemId: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

const InstructionFileSchema = Type.Object(
  { path: Type.String(), sha256: Type.String(), note: Type.Optional(Type.String()) },
  { additionalProperties: false },
);

const CommandFindingSchema = Type.Object(
  {
    command: Type.String(),
    basis: StringEnum(
      ["declared_in_documentation", "observed_in_session", "candidate"] as const,
      "declared_in_documentation = a repo document/manifest presents it; observed_in_session = you actually ran it this session; candidate = likely but not executed",
    ),
    observedResult: Type.Optional(
      StringEnum(["passed", "failed"] as const, "only permitted with basis observed_in_session"),
    ),
    evidenceNote: Type.Optional(
      Type.String({
        description:
          "Provenance: which document/manifest declared it, or how it was observed. Required for declared_in_documentation.",
      }),
    ),
  },
  { additionalProperties: false },
);

export function intakeTools(): VoilaTool[] {
  return [
    {
      name: "voila_create_intake",
      label: "Create Intake",
      description:
        "Preserve a planning document or request as an intake source. Provide EITHER a repository-relative path (read from disk byte-for-byte) OR exact text. Absolute paths, traversal, and symlink escapes are rejected. Preserves the source before reporting success; interprets nothing.",
      promptSnippet: "Preserve a planning document or request as a Voila intake source",
      promptGuidelines: [
        "Use voila_create_intake to preserve a source before interpreting it; never paste a file's contents as text when a repository path exists.",
      ],
      parameters: Type.Object(
        {
          path: Type.Optional(
            Type.String({ description: "Repository-relative file path, e.g. docs/plans/BRIEF.md" }),
          ),
          text: Type.Optional(
            Type.String({ description: "Exact text for pasted/conversation intake" }),
          ),
          sourceType: Type.Optional(StringEnum(INTAKE_SOURCE_TYPES)),
          title: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { path?: string; text?: string; sourceType?: never; title?: string };
        const result = await createIntake(ctx.cwd, p);
        return text(
          `Preserved ${result.intake.id}: "${result.intake.title}" (${result.intake.sourceType}, ${result.lineCount} lines, sha256 ${result.intake.sourceSha256.slice(0, 12)}…). Source is stored; nothing has been interpreted or applied yet.`,
          { intake: result.intake, lineCount: result.lineCount },
        );
      },
    },

    {
      name: "voila_stage_intake_draft",
      label: "Stage Intake Draft",
      description:
        "Submit the complete structured interpretation of a preserved intake. Findings with origin 'source' must cite sourceRefs (line ranges for files); model inferences must use origin 'model_inference'. Changes NO project truth: it stores the draft, regenerates the Understanding Check, and marks the intake review_required.",
      promptSnippet: "Stage a structured interpretation of a preserved Voila intake for review",
      promptGuidelines: [
        "Use voila_stage_intake_draft after reading a preserved source; cite line ranges and mark inferences explicitly.",
      ],
      parameters: Type.Object(
        {
          intakeId: Type.String(),
          objective: Type.String(),
          findings: Type.Array(FindingSchema),
          conflicts: Type.Optional(Type.Array(ConflictSchema)),
          proposedWorkItems: Type.Optional(Type.Array(ProposedWorkSchema)),
          possibleDuplicates: Type.Optional(
            Type.Array(
              Type.Object(
                {
                  kind: StringEnum(["decision", "risk", "assumption", "work_item"] as const),
                  draftRef: Type.String(),
                  existingId: Type.String(),
                  reason: Type.String(),
                },
                { additionalProperties: false },
              ),
            ),
          ),
          proposedNextAction: Type.Optional(Type.String()),
          proposedNextActionRationale: Type.Optional(Type.String()),
          reviewNotes: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { intakeId: string };
        const result = await stageIntakeDraft(ctx.cwd, p.intakeId, params);
        const blocking = blockingConflicts(result.draft);
        const inferences = modelInferences(result.draft);
        const lines = [
          `Staged draft revision ${result.draft.draftRevision} for ${result.intake.id}. Status: review_required — no project truth has changed.`,
          `${result.draft.findings.length} finding(s), ${inferences.length} model inference(s), ${result.draft.conflicts.length} conflict(s), ${result.draft.proposedWorkItems.length} proposed work item(s).`,
        ];
        if (blocking.length > 0) {
          lines.push(
            `Apply is BLOCKED by ${blocking.length} conflict(s) requiring user resolution: ${blocking.map((c) => c.id).join(", ")}.`,
          );
        } else {
          lines.push(...applySummaryLines(result.summary));
        }
        lines.push("Ask the user to run /voila intake review.");
        return text(lines.join("\n"), {
          intake: result.intake,
          draftRevision: result.draft.draftRevision,
          summary: result.summary,
          blocked: result.blocked,
        });
      },
    },

    {
      name: "voila_apply_intake",
      label: "Apply Intake",
      description:
        "Apply a reviewed intake draft to canonical project truth. Requires status review_required, the exact reviewed draft revision, no blocking conflicts, and userConfirmed=true which the human review workflow supplies. Model intent alone is NOT confirmation. Idempotent for an already-applied revision.",
      promptSnippet: "Apply a reviewed Voila intake after explicit user confirmation",
      promptGuidelines: [
        "Use voila_apply_intake only after the user has reviewed the Understanding Check and explicitly confirmed; never set userConfirmed on your own initiative.",
      ],
      parameters: Type.Object(
        {
          intakeId: Type.String(),
          reviewedDraftRevision: Type.Integer({ minimum: 1 }),
          userConfirmed: Type.Boolean({
            description: "Must be true and must reflect explicit user confirmation",
          }),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as {
          intakeId: string;
          reviewedDraftRevision: number;
          userConfirmed: boolean;
        };
        const result = await applyIntake(ctx.cwd, p.intakeId, {
          reviewedDraftRevision: p.reviewedDraftRevision,
          confirmed: p.userConfirmed === true,
        });
        if (result.alreadyApplied) {
          return text(
            `${p.intakeId} revision ${p.reviewedDraftRevision} was already applied; nothing changed (idempotent).`,
            { intake: result.intake, alreadyApplied: true },
          );
        }
        return text([`Applied ${p.intakeId}.`, ...applySummaryLines(result.summary)].join("\n"), {
          intake: result.intake,
          summary: result.summary,
        });
      },
    },

    {
      name: "voila_request_intake_revision",
      label: "Request Intake Revision",
      description:
        "Record the user's request for a corrected intake draft. Requires status review_required and the exact current draft revision. Appends one revision_requested record to the append-only review log and changes NO project truth; the intake stays review_required. Staging a corrected draft requires this record first, so the next revision is attributable. Feedback must be the user's concise correction — never your own reasoning, and never a transcript.",
      promptSnippet: "Record a user's request for a corrected Voila intake draft",
      promptGuidelines: [
        "Use voila_request_intake_revision only to record a correction the user actually asked for; never invent a revision request, and store their concise wording rather than your explanation of it.",
      ],
      parameters: Type.Object(
        {
          intakeId: Type.String(),
          reviewedDraftRevision: Type.Integer({ minimum: 1 }),
          feedback: Type.String({
            minLength: 1,
            maxLength: MAX_REVIEW_FEEDBACK_LENGTH,
            description: "The user's concise description of what must change",
          }),
          supersedePrevious: Type.Optional(
            Type.Boolean({
              description:
                "Explicitly add a further correction to a revision that already has a request",
            }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as {
          intakeId: string;
          reviewedDraftRevision: number;
          feedback: string;
          supersedePrevious?: boolean;
        };
        const result = await requestIntakeRevision(ctx.cwd, p.intakeId, {
          reviewedDraftRevision: p.reviewedDraftRevision,
          feedback: p.feedback,
          ...(p.supersedePrevious ? { supersedePrevious: true } : {}),
        });
        return text(
          `Recorded a revision request for ${p.intakeId} revision ${result.record.reviewedRevision}. Stage a corrected draft that addresses it; project truth is unchanged.`,
          {
            intake: result.intake,
            review: result.record,
            supersededRequests: result.supersededRequests,
          },
        );
      },
    },

    {
      name: "voila_reject_intake",
      label: "Reject Intake",
      description:
        "Reject an intake. The preserved source and drafts stay on disk for the record; no project truth changes.",
      promptSnippet: "Reject a Voila intake",
      parameters: Type.Object(
        { intakeId: Type.String(), reason: Type.Optional(Type.String()) },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { intakeId: string; reason?: string };
        const record = await rejectIntake(ctx.cwd, p.intakeId, p.reason);
        return text(`Rejected ${record.id}. Source and drafts are retained.`, { intake: record });
      },
    },

    {
      name: "voila_record_orientation",
      label: "Record Orientation",
      description:
        "Store a bounded repository-orientation snapshot and make it current. Paths must be repository-relative; secrets, env values, and absolute paths are rejected. Include provenance for what you actually inspected. Commands carry an explicit basis (declared_in_documentation | observed_in_session | candidate); observedResult is only allowed for commands you actually ran. Voila does not verify commands — do not describe them as verified.",
      promptSnippet: "Record a bounded Voila repository-orientation snapshot",
      promptGuidelines: [
        "Use voila_record_orientation after a narrow inspection; cite the files you read in provenance, give each command an honest basis, and do not include secrets or absolute paths.",
      ],
      parameters: Type.Object(
        {
          purpose: Type.String({
            description: "What this repository is for, in one or two sentences",
          }),
          branch: Type.Optional(Type.String()),
          head: Type.Optional(Type.String()),
          dirty: Type.Optional(Type.Boolean()),
          dirtySummary: Type.Optional(Type.String()),
          instructionFiles: Type.Array(InstructionFileSchema),
          keyDocuments: Type.Optional(Type.Array(Type.String())),
          implementationAreas: Type.Optional(Type.Array(Type.String())),
          commands: Type.Optional(Type.Array(CommandFindingSchema)),
          relevantWork: Type.Optional(Type.Array(Type.String())),
          risks: Type.Optional(Type.Array(Type.String())),
          unknowns: Type.Optional(Type.Array(Type.String())),
          provenance: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const result = await recordOrientation(ctx.cwd, params);
        return text(
          `Recorded orientation ${result.record.id} (current). ${result.artifact.commands.length} command finding(s) (not verified by Voila), ${result.artifact.instructionFiles.length} instruction file(s).`,
          { orientation: result.record },
        );
      },
    },

    {
      name: "voila_set_next_action",
      label: "Set Next Action",
      description:
        "Set the next justified action, an optional rationale explaining why it is next, and optionally the focus work item. Rejects an empty action and an invalid, completed, or cancelled focus item.",
      promptSnippet: "Set the Voila next justified action and its rationale",
      promptGuidelines: [
        "Use voila_set_next_action to keep the next action and its rationale current; the Steward owns this choice.",
      ],
      parameters: Type.Object(
        {
          nextAction: Type.String(),
          rationale: Type.Optional(Type.String()),
          focusWorkItemId: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { nextAction: string; rationale?: string; focusWorkItemId?: string };
        const state = await updateState(
          ctx.cwd,
          (cur) => {
            let next = setNextAction(cur, p.nextAction);
            if (p.rationale !== undefined) next = setNextActionRationale(next, p.rationale);
            if (p.focusWorkItemId !== undefined) next = setFocusWorkItem(next, p.focusWorkItemId);
            return next;
          },
          { type: "next_action_set", ...(p.focusWorkItemId ? { focus: p.focusWorkItemId } : {}) },
        );
        await writeProjectBrief(ctx.cwd, state);
        return text(
          `Next action set${p.focusWorkItemId ? ` with focus ${p.focusWorkItemId}` : ""}.`,
          { nextAction: state.nextAction, focusWorkItemId: state.focusWorkItemId },
        );
      },
    },

    {
      name: "voila_get_project_context",
      label: "Get Project Context",
      description:
        "Return compact structured Voila project context: identity, phase, health, focus, next action and rationale, brief reference, pending intake, orientation status, key decisions, assumptions, risks, and a work summary. Never returns source documents or raw event history.",
      promptSnippet: "Read compact Voila project context before acting",
      promptGuidelines: [
        "Use voila_get_project_context at the start of project work to read canonical state instead of guessing.",
      ],
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_id, _params, _signal, _onUpdate, ctx) {
        const state = await loadState(ctx.cwd);
        const s = backlogSummary(state);
        const pending = state.intakes.find((i) => i.status === "review_required") ?? null;
        const orientation = await currentOrientationStatus(ctx.cwd, state);
        const context = {
          project: {
            displayName: state.displayName,
            phase: state.phase,
            health: state.health,
            revision: state.revision,
          },
          focus: s.focus ? { id: s.focus.id, title: s.focus.title, status: s.focus.status } : null,
          nextAction: state.nextAction,
          nextActionRationale: state.nextActionRationale ?? null,
          briefRef: ".voila/briefs/PROJECT_BRIEF.md",
          pendingIntake: pending
            ? { id: pending.id, title: pending.title, draftRevision: pending.draftRevision }
            : null,
          orientation: orientation.record
            ? {
                id: orientation.record.id,
                stale: orientation.staleness.stale,
                reasons: orientation.staleness.reasons,
              }
            : null,
          decisions: state.decisions
            .filter((d) => d.status === "accepted")
            .slice(0, 8)
            .map((d) => ({ id: d.id, decision: d.decision })),
          assumptions: state.assumptions
            .filter((a) => a.status === "open")
            .slice(0, 8)
            .map((a) => ({ id: a.id, statement: a.statement, confidence: a.confidence })),
          risks: state.risks
            .filter((r) => r.status === "open")
            .slice(0, 8)
            .map((r) => ({
              id: r.id,
              statement: r.statement,
              likelihood: r.likelihood,
              impact: r.impact,
            })),
          work: {
            open: s.openCount,
            inProgress: s.inProgress.map((w) => w.id),
            blocked: s.blocked.map((w) => w.id),
            ready: s.readyByPriority.slice(0, 5).map((w) => w.id),
          },
        };
        const summaryLine = `${state.displayName} · ${state.phase}/${state.health} · focus ${context.focus?.id ?? "none"} · ${context.pendingIntake ? `intake ${context.pendingIntake.id} awaiting review` : "no pending intake"}`;
        return text(summaryLine, context);
      },
    },

    {
      name: "voila_get_intake_draft",
      label: "Get Intake Draft",
      description:
        "Read the staged structured draft and Understanding Check status for an intake, to review or revise it.",
      promptSnippet: "Read a staged Voila intake draft",
      parameters: Type.Object({ intakeId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { intakeId: string };
        const state = await loadState(ctx.cwd);
        const record = findIntake(state, p.intakeId);
        const draft = await readDraft(ctx.cwd, p.intakeId);
        if (!draft) {
          return text(`${record.id} has no staged draft yet (status ${record.status}).`, {
            intake: record,
          });
        }
        return text(
          `${record.id} draft revision ${draft.draftRevision}: ${draft.findings.length} findings, ${draft.conflicts.length} conflicts, ${draft.proposedWorkItems.length} proposed work items.`,
          { intake: record, draft },
        );
      },
    },
  ];
}
