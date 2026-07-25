// Pure intake application: draft + canonical state -> new canonical state + an exact change summary.
// No I/O. The same function computes the pre-apply preview and performs the apply, so the
// confirmation the user sees is derived from the same code path that mutates state.
//
// Rules enforced here:
//   - blocking conflicts refuse the apply,
//   - only explicit proposedWorkItems become work items (requirements do NOT auto-convert),
//   - exact normalized duplicates are never recreated,
//   - applying the same accepted revision twice creates nothing new (idempotent).

import { ProjectOperationError } from "./errors.ts";
import type { IntakeDraft } from "./intake.ts";
import { blockingConflicts, findingsByCategory, normalizeForMatch } from "./intake.ts";
import {
  createWorkItem,
  recordAssumption,
  recordDecision,
  recordRisk,
  setNextAction,
  setNextActionRationale,
} from "./operations.ts";
import type { ProjectState } from "./types.ts";

export interface ApplyPlanEntry {
  kind: "decision" | "assumption" | "risk" | "work_item";
  action: "create" | "skip_duplicate";
  label: string;
  /** Existing canonical ID when skipped as a duplicate. */
  existingId?: string;
  draftRef: string;
}

export interface ApplySummary {
  intakeId: string;
  draftRevision: number;
  entries: ApplyPlanEntry[];
  createdCounts: { decisions: number; assumptions: number; risks: number; workItems: number };
  skippedDuplicates: number;
  nextActionChange?: { action: string; rationale?: string };
}

export interface ApplyResult {
  state: ProjectState;
  summary: ApplySummary;
}

/**
 * Compute (and, on the returned state, effect) the application of a reviewed draft.
 * Deterministic: same inputs produce the same summary, so it doubles as the confirmation preview.
 */
export function applyDraft(
  state: Readonly<ProjectState>,
  draft: IntakeDraft,
  now: string,
): ApplyResult {
  const blocking = blockingConflicts(draft);
  if (blocking.length > 0) {
    throw new ProjectOperationError(
      `Cannot apply intake ${draft.intakeId}: ${blocking.length} conflict(s) require user resolution (${blocking
        .map((c) => c.id)
        .join(", ")}).`,
    );
  }

  const entries: ApplyPlanEntry[] = [];
  let next: ProjectState = { ...state };

  // Existing normalized indexes for conservative exact-duplicate detection.
  const decisionIndex = new Map(state.decisions.map((d) => [normalizeForMatch(d.decision), d.id]));
  const decisionTitleIndex = new Map(
    state.decisions.map((d) => [normalizeForMatch(d.title), d.id]),
  );
  const assumptionIndex = new Map(
    state.assumptions.map((a) => [normalizeForMatch(a.statement), a.id]),
  );
  const riskIndex = new Map(state.risks.map((r) => [normalizeForMatch(r.statement), r.id]));
  const workTitleIndex = new Map(state.workItems.map((w) => [normalizeForMatch(w.title), w.id]));

  // 1. Locked decisions -> accepted decisions; proposed decisions -> proposed.
  for (const [category, status] of [
    ["locked_decision", "accepted"],
    ["proposed_decision", "proposed"],
  ] as const) {
    for (const f of findingsByCategory(draft, category)) {
      const key = normalizeForMatch(f.statement);
      const existing = decisionIndex.get(key) ?? decisionTitleIndex.get(key);
      if (existing) {
        entries.push({
          kind: "decision",
          action: "skip_duplicate",
          label: f.statement,
          existingId: existing,
          draftRef: f.id,
        });
        continue;
      }
      const title = f.statement.length > 80 ? `${f.statement.slice(0, 77)}...` : f.statement;
      next = recordDecision(
        next,
        {
          title,
          decision: f.statement,
          rationale: `From intake ${draft.intakeId} finding ${f.id}.`,
          status,
        },
        now,
      );
      const created = next.decisions[next.decisions.length - 1];
      decisionIndex.set(key, created?.id ?? "");
      entries.push({
        kind: "decision",
        action: "create",
        label: `${created?.id} (${status}) ${title}`,
        draftRef: f.id,
      });
    }
  }

  // 2. Assumptions -> open assumptions.
  for (const f of findingsByCategory(draft, "assumption")) {
    const key = normalizeForMatch(f.statement);
    const existing = assumptionIndex.get(key);
    if (existing) {
      entries.push({
        kind: "assumption",
        action: "skip_duplicate",
        label: f.statement,
        existingId: existing,
        draftRef: f.id,
      });
      continue;
    }
    next = recordAssumption(
      next,
      { statement: f.statement, confidence: f.confidence ?? "medium" },
      now,
    );
    const created = next.assumptions[next.assumptions.length - 1];
    assumptionIndex.set(key, created?.id ?? "");
    entries.push({
      kind: "assumption",
      action: "create",
      label: `${created?.id} ${f.statement}`,
      draftRef: f.id,
    });
  }

  // 3. Risks -> open risks.
  for (const f of findingsByCategory(draft, "risk")) {
    const key = normalizeForMatch(f.statement);
    const existing = riskIndex.get(key);
    if (existing) {
      entries.push({
        kind: "risk",
        action: "skip_duplicate",
        label: f.statement,
        existingId: existing,
        draftRef: f.id,
      });
      continue;
    }
    next = recordRisk(
      next,
      { statement: f.statement, likelihood: "medium", impact: "medium" },
      now,
    );
    const created = next.risks[next.risks.length - 1];
    riskIndex.set(key, created?.id ?? "");
    entries.push({
      kind: "risk",
      action: "create",
      label: `${created?.id} ${f.statement}`,
      draftRef: f.id,
    });
  }

  // 4. Explicit proposed work items only.
  for (const w of draft.proposedWorkItems) {
    const key = normalizeForMatch(w.title);
    const existing = workTitleIndex.get(key);
    if (existing) {
      entries.push({
        kind: "work_item",
        action: "skip_duplicate",
        label: w.title,
        existingId: existing,
        draftRef: w.id,
      });
      continue;
    }
    next = createWorkItem(
      next,
      {
        kind: w.kind,
        title: w.title,
        ...(w.description ? { description: w.description } : {}),
        ...(w.priority ? { priority: w.priority } : {}),
        ...(w.acceptanceCriteria ? { acceptanceCriteria: w.acceptanceCriteria } : {}),
      },
      now,
    );
    const created = next.workItems[next.workItems.length - 1];
    workTitleIndex.set(key, created?.id ?? "");
    entries.push({
      kind: "work_item",
      action: "create",
      label: `${created?.id} (${w.kind}) ${w.title}`,
      draftRef: w.id,
    });
  }

  // 5. Optional next action from the accepted draft (Steward-authored, reviewed).
  let nextActionChange: ApplySummary["nextActionChange"];
  if (draft.proposedNextAction) {
    next = setNextAction(next, draft.proposedNextAction);
    if (draft.proposedNextActionRationale) {
      next = setNextActionRationale(next, draft.proposedNextActionRationale);
    }
    nextActionChange = {
      action: draft.proposedNextAction,
      ...(draft.proposedNextActionRationale
        ? { rationale: draft.proposedNextActionRationale }
        : {}),
    };
  }

  const createdCounts = {
    decisions: entries.filter((e) => e.kind === "decision" && e.action === "create").length,
    assumptions: entries.filter((e) => e.kind === "assumption" && e.action === "create").length,
    risks: entries.filter((e) => e.kind === "risk" && e.action === "create").length,
    workItems: entries.filter((e) => e.kind === "work_item" && e.action === "create").length,
  };

  return {
    state: next,
    summary: {
      intakeId: draft.intakeId,
      draftRevision: draft.draftRevision,
      entries,
      createdCounts,
      skippedDuplicates: entries.filter((e) => e.action === "skip_duplicate").length,
      ...(nextActionChange ? { nextActionChange } : {}),
    },
  };
}

/** Human-readable lines for the apply confirmation / understanding view. */
export function applySummaryLines(summary: ApplySummary): string[] {
  const c = summary.createdCounts;
  const lines = [
    `Applying ${summary.intakeId} (draft revision ${summary.draftRevision}) will:`,
    `  create ${c.decisions} decision(s), ${c.assumptions} assumption(s), ${c.risks} risk(s), ${c.workItems} work item(s)`,
  ];
  if (summary.skippedDuplicates > 0) {
    lines.push(`  skip ${summary.skippedDuplicates} exact duplicate(s) already in canonical state`);
  }
  if (summary.nextActionChange) {
    lines.push(`  set next action: ${summary.nextActionChange.action}`);
  }
  for (const e of summary.entries) {
    lines.push(
      e.action === "create"
        ? `    + ${e.kind}: ${e.label}`
        : `    = ${e.kind} duplicate of ${e.existingId}: ${e.label}`,
    );
  }
  return lines;
}
