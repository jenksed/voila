// LLM-callable Pi tools for project operations. Each tool has a strict typebox schema, delegates to
// the pure domain, updates canonical state atomically before reporting success, throws actionable
// errors, and returns concise content plus details for rendering/receipts. No raw filesystem paths
// are accepted from the model (the project root comes from ctx.cwd).

import { Type } from "typebox";
import type { TSchema } from "typebox";
import { StringEnum } from "./schema.ts";
import { loadState, updateState } from "../state/store.ts";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCES,
  DECISION_STATUSES,
  IMPACTS,
  LIKELIHOODS,
  RISK_STATUSES,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
} from "../domain/types.ts";
import type {
  CreateWorkItemInput,
  RecordAssumptionInput,
  RecordDecisionInput,
  RecordRiskInput,
  UpdateAssumptionInput,
  UpdateDecisionInput,
  UpdateRiskInput,
  UpdateWorkItemInput,
  WorkItemFilter,
} from "../domain/operations.ts";
import {
  createWorkItem,
  listWorkItems,
  recordAssumption,
  recordDecision,
  recordRisk,
  setFocusWorkItem,
  updateAssumption,
  updateDecision,
  updateRisk,
  updateWorkItem,
} from "../domain/operations.ts";
import { workItemLabel } from "../domain/status.ts";
import { intakeTools } from "./intake-tools.ts";
import { proofTools } from "./proof-tools.ts";
import { deliveryTools } from "./delivery-tools.ts";

export interface VoilaToolResult {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
}

export interface VoilaToolCtx {
  cwd: string;
}

export interface VoilaTool {
  name: string;
  label: string;
  description: string;
  parameters: TSchema;
  promptSnippet?: string;
  promptGuidelines?: string[];
  execute: (
    toolCallId: string,
    params: Record<string, unknown>,
    signal: unknown,
    onUpdate: unknown,
    ctx: VoilaToolCtx,
  ) => Promise<VoilaToolResult>;
}

const CREATABLE_STATUSES = WORK_ITEM_STATUSES.filter((s) => s !== "completed");

function text(line: string, details?: unknown): VoilaToolResult {
  return { content: [{ type: "text", text: line }], details };
}

function now(): string {
  return new Date().toISOString();
}

export function voilaTools(): VoilaTool[] {
  return [
    {
      name: "voila_create_work_item",
      label: "Create Work Item",
      description:
        "Create a backlog work item (outcome, task, or defect). Cannot create completed items.",
      promptSnippet: "Create a Voila work item (outcome/task/defect) in the project backlog",
      promptGuidelines: [
        "Use voila_create_work_item to add durable backlog items instead of tracking work only in prose.",
      ],
      parameters: Type.Object(
        {
          kind: StringEnum(WORK_ITEM_KINDS, "outcome | task | defect"),
          title: Type.String({ description: "Short imperative title" }),
          description: Type.Optional(Type.String()),
          priority: Type.Optional(StringEnum(WORK_ITEM_PRIORITIES)),
          status: Type.Optional(StringEnum(CREATABLE_STATUSES, "initial status (not completed)")),
          acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
          dependsOn: Type.Optional(
            Type.Array(Type.String({ description: "Existing work-item IDs this item depends on" })),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as CreateWorkItemInput;
        const state = await updateState(
          ctx.cwd,
          (cur) => createWorkItem(cur, input, now()),
          (next) => {
            const created = next.workItems[next.workItems.length - 1];
            return { type: "work_item_created", id: created?.id, kind: created?.kind };
          },
        );
        const created = state.workItems[state.workItems.length - 1];
        return text(`Created ${created?.id}: ${created?.title}`, { workItem: created });
      },
    },

    {
      name: "voila_update_work_item",
      label: "Update Work Item",
      description:
        "Update fields, status (not completion), priority, blocked reason, or dependencies of a work item.",
      promptSnippet: "Update a Voila work item's fields, status, or dependencies",
      promptGuidelines: [
        "Use voila_update_work_item to change work-item status/priority/dependencies; it cannot mark items completed.",
      ],
      parameters: Type.Object(
        {
          id: Type.String({ description: "Work-item ID, e.g. NF-3" }),
          title: Type.Optional(Type.String()),
          description: Type.Optional(Type.String()),
          priority: Type.Optional(StringEnum(WORK_ITEM_PRIORITIES)),
          status: Type.Optional(StringEnum(CREATABLE_STATUSES, "new status (not completed)")),
          blockedReason: Type.Optional(Type.String()),
          acceptanceCriteria: Type.Optional(Type.Array(Type.String())),
          addDependsOn: Type.Optional(Type.Array(Type.String())),
          removeDependsOn: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as UpdateWorkItemInput;
        const state = await updateState(ctx.cwd, (cur) => updateWorkItem(cur, input, now()), {
          type: "work_item_updated",
          id: input.id,
        });
        const item = state.workItems.find((w) => w.id === input.id);
        return text(`Updated ${input.id}`, { workItem: item });
      },
    },

    {
      name: "voila_list_work_items",
      label: "List Work Items",
      description: "List work items, optionally filtered by status, kind, or priority.",
      promptSnippet: "List Voila work items with optional filters",
      parameters: Type.Object(
        {
          status: Type.Optional(StringEnum(WORK_ITEM_STATUSES)),
          kind: Type.Optional(StringEnum(WORK_ITEM_KINDS)),
          priority: Type.Optional(StringEnum(WORK_ITEM_PRIORITIES)),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const state = await loadState(ctx.cwd);
        const items = listWorkItems(state, params as unknown as WorkItemFilter);
        const lines = items.length > 0 ? items.map(workItemLabel) : ["(no matching work items)"];
        return text(lines.join("\n"), { workItems: items });
      },
    },

    {
      name: "voila_record_decision",
      label: "Record Decision",
      description: "Record a project decision (proposed, accepted, or superseded).",
      promptSnippet: "Record a durable Voila decision",
      parameters: Type.Object(
        {
          title: Type.String(),
          decision: Type.String({ description: "The accepted decision statement" }),
          rationale: Type.String(),
          status: Type.Optional(StringEnum(DECISION_STATUSES)),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as RecordDecisionInput;
        const state = await updateState(
          ctx.cwd,
          (cur) => recordDecision(cur, input, now()),
          (next) => {
            const d = next.decisions[next.decisions.length - 1];
            return { type: "decision_recorded", id: d?.id, status: d?.status };
          },
        );
        const d = state.decisions[state.decisions.length - 1];
        return text(`Recorded ${d?.id}: ${d?.title}`, { decision: d });
      },
    },

    {
      name: "voila_record_assumption",
      label: "Record Assumption",
      description: "Record a project assumption with a confidence level.",
      promptSnippet: "Record a Voila assumption with confidence",
      parameters: Type.Object(
        {
          statement: Type.String(),
          confidence: StringEnum(CONFIDENCES),
          status: Type.Optional(StringEnum(ASSUMPTION_STATUSES)),
          note: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as RecordAssumptionInput;
        const state = await updateState(
          ctx.cwd,
          (cur) => recordAssumption(cur, input, now()),
          (next) => {
            const a = next.assumptions[next.assumptions.length - 1];
            return { type: "assumption_recorded", id: a?.id, confidence: a?.confidence };
          },
        );
        const a = state.assumptions[state.assumptions.length - 1];
        return text(`Recorded ${a?.id} (${a?.confidence})`, { assumption: a });
      },
    },

    {
      name: "voila_record_risk",
      label: "Record Risk",
      description: "Record a project risk with likelihood and impact.",
      promptSnippet: "Record a Voila risk with likelihood and impact",
      parameters: Type.Object(
        {
          statement: Type.String(),
          likelihood: StringEnum(LIKELIHOODS),
          impact: StringEnum(IMPACTS),
          status: Type.Optional(StringEnum(RISK_STATUSES)),
          mitigation: Type.Optional(Type.String()),
          linkedWorkItems: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as RecordRiskInput;
        const state = await updateState(
          ctx.cwd,
          (cur) => recordRisk(cur, input, now()),
          (next) => {
            const r = next.risks[next.risks.length - 1];
            return {
              type: "risk_recorded",
              id: r?.id,
              likelihood: r?.likelihood,
              impact: r?.impact,
            };
          },
        );
        const r = state.risks[state.risks.length - 1];
        return text(`Recorded ${r?.id} (${r?.likelihood}/${r?.impact})`, { risk: r });
      },
    },

    {
      name: "voila_list_project_operations",
      label: "List Project Operations",
      description: "Summarize decisions, assumptions, and risks in the project.",
      promptSnippet: "Summarize Voila decisions, assumptions, and risks",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_id, _params, _signal, _onUpdate, ctx) {
        const state = await loadState(ctx.cwd);
        const lines = [
          `Decisions (${state.decisions.length}): ${state.decisions.map((d) => `${d.id}[${d.status}]`).join(", ") || "none"}`,
          `Assumptions (${state.assumptions.length}): ${state.assumptions.map((a) => `${a.id}[${a.status}]`).join(", ") || "none"}`,
          `Risks (${state.risks.length}): ${state.risks.map((r) => `${r.id}[${r.status}]`).join(", ") || "none"}`,
        ];
        return text(lines.join("\n"), {
          decisions: state.decisions,
          assumptions: state.assumptions,
          risks: state.risks,
        });
      },
    },

    {
      name: "voila_set_focus",
      label: "Set Focus",
      description:
        "Set or clear the focus pointer (the work item currently receiving attention). Focus is not lifecycle status; completed/cancelled items cannot be focused.",
      promptSnippet: "Set or clear the Voila focus work item",
      parameters: Type.Object(
        {
          workItemId: Type.Optional(
            Type.String({ description: "Work-item ID to focus, e.g. NF-2" }),
          ),
          clear: Type.Optional(Type.Boolean({ description: "Clear the focus pointer" })),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { workItemId?: string; clear?: boolean };
        if (!p.clear && !p.workItemId) {
          throw new Error("Provide workItemId to focus, or clear: true to clear focus.");
        }
        const targetId = p.clear ? null : (p.workItemId as string);
        await updateState(ctx.cwd, (cur) => setFocusWorkItem(cur, targetId), {
          type: targetId === null ? "focus_cleared" : "focus_set",
          id: targetId ?? undefined,
        });
        return text(targetId === null ? "Focus cleared." : `Focus set to ${targetId}.`, {
          focusWorkItemId: targetId,
        });
      },
    },

    {
      name: "voila_update_decision",
      label: "Update Decision",
      description:
        "Update a decision along supported transitions: proposed->accepted, proposed->superseded, accepted->superseded (supersededById required).",
      promptSnippet: "Update a Voila decision (accept or supersede)",
      parameters: Type.Object(
        {
          id: Type.String(),
          title: Type.Optional(Type.String()),
          decision: Type.Optional(Type.String()),
          rationale: Type.Optional(Type.String()),
          status: Type.Optional(StringEnum(DECISION_STATUSES)),
          supersededById: Type.Optional(Type.String({ description: "Replacement decision ID" })),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as UpdateDecisionInput;
        const state = await updateState(ctx.cwd, (cur) => updateDecision(cur, input, now()), {
          type: "decision_updated",
          id: input.id,
        });
        return text(`Updated ${input.id}`, {
          decision: state.decisions.find((d) => d.id === input.id),
        });
      },
    },

    {
      name: "voila_update_assumption",
      label: "Update Assumption",
      description:
        "Update an assumption along supported transitions: open->validated, open->invalidated. Terminal states are not reopened. Notes may be updated.",
      promptSnippet: "Update a Voila assumption (validate/invalidate)",
      parameters: Type.Object(
        {
          id: Type.String(),
          statement: Type.Optional(Type.String()),
          confidence: Type.Optional(StringEnum(CONFIDENCES)),
          status: Type.Optional(StringEnum(ASSUMPTION_STATUSES)),
          note: Type.Optional(Type.String()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as UpdateAssumptionInput;
        const state = await updateState(ctx.cwd, (cur) => updateAssumption(cur, input, now()), {
          type: "assumption_updated",
          id: input.id,
        });
        return text(`Updated ${input.id}`, {
          assumption: state.assumptions.find((a) => a.id === input.id),
        });
      },
    },

    {
      name: "voila_update_risk",
      label: "Update Risk",
      description:
        "Update a risk along supported transitions: open->mitigated/accepted/closed, mitigated->closed, accepted->closed. Closing requires a mitigation/resolution. Terminal states are not reopened.",
      promptSnippet: "Update a Voila risk (mitigate/accept/close)",
      parameters: Type.Object(
        {
          id: Type.String(),
          statement: Type.Optional(Type.String()),
          likelihood: Type.Optional(StringEnum(LIKELIHOODS)),
          impact: Type.Optional(StringEnum(IMPACTS)),
          status: Type.Optional(StringEnum(RISK_STATUSES)),
          mitigation: Type.Optional(Type.String()),
          linkedWorkItems: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as UpdateRiskInput;
        const state = await updateState(ctx.cwd, (cur) => updateRisk(cur, input, now()), {
          type: "risk_updated",
          id: input.id,
        });
        return text(`Updated ${input.id}`, { risk: state.risks.find((r) => r.id === input.id) });
      },
    },

    ...intakeTools(),
    ...proofTools(),
    ...deliveryTools(),
  ];
}
