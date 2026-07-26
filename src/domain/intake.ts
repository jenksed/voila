// Intake draft model: classification categories, provenance, conflicts, and proposed work.
// Pure — no Pi, no I/O. Drafts live as artifacts (`draft.json`), never inside project.json.
//
// Boundary this file enforces:
//   - "source-derived" findings must cite the preserved source.
//   - "model inference" findings must say so explicitly (`origin: "model_inference"`).
// Voila validates the structure; it never decides that an interpretation is correct.

import { ProjectOperationError } from "./errors.ts";
import type { ProjectState, WorkItemKind, WorkItemPriority } from "./types.ts";
import { WORK_ITEM_KINDS, WORK_ITEM_PRIORITIES } from "./types.ts";

export const FINDING_CATEGORIES = [
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
] as const;
export type FindingCategory = (typeof FINDING_CATEGORIES)[number];

export const FINDING_ORIGINS = ["source", "model_inference"] as const;
export type FindingOrigin = (typeof FINDING_ORIGINS)[number];

export const CONFIDENCES_DRAFT = ["low", "medium", "high"] as const;
export type DraftConfidence = (typeof CONFIDENCES_DRAFT)[number];

/** Provenance for a finding. File sources use line ranges; text sources use a marker/excerpt. */
export interface SourceReference {
  /** The intake ID the reference points into (e.g. "INT-1"). */
  intakeId: string;
  /** 1-based inclusive line range, for file-backed sources. */
  startLine?: number;
  endLine?: number;
  /** Section marker or short excerpt, for pasted/conversational sources. */
  marker?: string;
  excerpt?: string;
}

export interface Finding {
  /** Draft-local stable ID, e.g. "F1". */
  id: string;
  category: FindingCategory;
  statement: string;
  origin: FindingOrigin;
  /** Required for `origin: "source"`; must be empty/absent for pure model inference. */
  sourceRefs: SourceReference[];
  relatedFindingIds?: string[];
  confidence?: DraftConfidence;
  note?: string;
}

export const CONFLICT_SEVERITIES = ["blocking", "warning", "info"] as const;
export type ConflictSeverity = (typeof CONFLICT_SEVERITIES)[number];

export interface Conflict {
  id: string;
  findingIds: string[];
  explanation: string;
  severity: ConflictSeverity;
  /** When true, apply is refused until the user resolves it. */
  requiresUserResolution: boolean;
}

export interface ProposedWorkItem {
  /** Draft-local ID, e.g. "W1". */
  id: string;
  kind: WorkItemKind;
  title: string;
  description?: string;
  priority?: WorkItemPriority;
  acceptanceCriteria?: string[];
  sourceFindingIds: string[];
  /** Existing canonical work-item ID this proposal relates to (never a parent/child hierarchy). */
  relatesToWorkItemId?: string;
}

/** A likely-but-inexact duplicate, surfaced during review and never merged automatically. */
export interface PossibleDuplicate {
  kind: "decision" | "risk" | "assumption" | "work_item";
  draftRef: string;
  existingId: string;
  reason: string;
}

export interface IntakeDraft {
  intakeId: string;
  draftRevision: number;
  objective: string;
  findings: Finding[];
  conflicts: Conflict[];
  proposedWorkItems: ProposedWorkItem[];
  possibleDuplicates?: PossibleDuplicate[];
  /** Optional Steward-proposed next action; applied only on acceptance. */
  proposedNextAction?: string;
  proposedNextActionRationale?: string;
  /** Free-text notes for the reviewer; never applied to canonical state. */
  reviewNotes?: string;
  createdAt: string;
}

export interface ValidateDraftOptions {
  /** Total line count of the preserved source, when the source is file-backed. */
  sourceLineCount?: number;
  /** Current canonical state, for validating references to existing entity IDs. */
  state: Readonly<ProjectState>;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProjectOperationError(`${field} is required and must be a non-empty string.`);
  }
  return value;
}

function requireEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new ProjectOperationError(
      `Invalid ${field}: ${String(value)}. Allowed: ${values.join(", ")}.`,
    );
  }
  return value as T;
}

/**
 * Validate an untrusted structured draft. Throws ProjectOperationError with an actionable message.
 * Returns the normalized draft. Does not mutate canonical state.
 */
export function validateIntakeDraft(raw: unknown, opts: ValidateDraftOptions): IntakeDraft {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ProjectOperationError("Draft must be an object.");
  }
  const d = raw as Record<string, unknown>;
  const intakeId = requireNonEmpty(d.intakeId, "intakeId");
  const objective = requireNonEmpty(d.objective, "objective");

  if (!Array.isArray(d.findings) || d.findings.length === 0) {
    throw new ProjectOperationError("Draft must contain at least one finding.");
  }

  const seenFindingIds = new Set<string>();
  const findings: Finding[] = d.findings.map((rawF, i) => {
    if (typeof rawF !== "object" || rawF === null) {
      throw new ProjectOperationError(`findings[${i}] must be an object.`);
    }
    const f = rawF as Record<string, unknown>;
    const id = requireNonEmpty(f.id, `findings[${i}].id`);
    if (seenFindingIds.has(id)) {
      throw new ProjectOperationError(`Duplicate finding id: ${id}.`);
    }
    seenFindingIds.add(id);
    const category = requireEnum(f.category, FINDING_CATEGORIES, `findings[${i}].category`);
    const statement = requireNonEmpty(f.statement, `findings[${i}].statement`);
    const origin = requireEnum(f.origin, FINDING_ORIGINS, `findings[${i}].origin`);

    const refsRaw = f.sourceRefs;
    if (refsRaw !== undefined && !Array.isArray(refsRaw)) {
      throw new ProjectOperationError(`findings[${i}].sourceRefs must be an array.`);
    }
    const refs = (refsRaw ?? []) as unknown[];
    if (origin === "source" && refs.length === 0) {
      throw new ProjectOperationError(
        `findings[${i}] (${id}) has origin "source" but no sourceRefs. Source-derived findings require provenance; mark model inferences with origin "model_inference".`,
      );
    }
    const sourceRefs: SourceReference[] = refs.map((rawR, j) => {
      if (typeof rawR !== "object" || rawR === null) {
        throw new ProjectOperationError(`findings[${i}].sourceRefs[${j}] must be an object.`);
      }
      const r = rawR as Record<string, unknown>;
      if (r.intakeId !== intakeId) {
        throw new ProjectOperationError(
          `findings[${i}].sourceRefs[${j}].intakeId must be ${intakeId}.`,
        );
      }
      const ref: SourceReference = { intakeId };
      if (r.startLine !== undefined || r.endLine !== undefined) {
        const start = r.startLine;
        const end = r.endLine ?? r.startLine;
        if (typeof start !== "number" || !Number.isInteger(start) || start < 1) {
          throw new ProjectOperationError(`findings[${i}].sourceRefs[${j}].startLine is invalid.`);
        }
        if (typeof end !== "number" || !Number.isInteger(end) || end < start) {
          throw new ProjectOperationError(`findings[${i}].sourceRefs[${j}].endLine is invalid.`);
        }
        if (opts.sourceLineCount !== undefined && end > opts.sourceLineCount) {
          throw new ProjectOperationError(
            `findings[${i}].sourceRefs[${j}] references line ${end} beyond the source (${opts.sourceLineCount} lines).`,
          );
        }
        ref.startLine = start;
        ref.endLine = end;
      }
      if (typeof r.marker === "string" && r.marker.length > 0) ref.marker = r.marker;
      if (typeof r.excerpt === "string" && r.excerpt.length > 0) ref.excerpt = r.excerpt;
      if (ref.startLine === undefined && ref.marker === undefined && ref.excerpt === undefined) {
        throw new ProjectOperationError(
          `findings[${i}].sourceRefs[${j}] needs a line range, marker, or excerpt.`,
        );
      }
      return ref;
    });

    const finding: Finding = { id, category, statement, origin, sourceRefs };
    if (f.relatedFindingIds !== undefined) {
      if (
        !Array.isArray(f.relatedFindingIds) ||
        f.relatedFindingIds.some((x) => typeof x !== "string")
      ) {
        throw new ProjectOperationError(`findings[${i}].relatedFindingIds must be strings.`);
      }
      finding.relatedFindingIds = f.relatedFindingIds as string[];
    }
    if (f.confidence !== undefined) {
      finding.confidence = requireEnum(
        f.confidence,
        CONFIDENCES_DRAFT,
        `findings[${i}].confidence`,
      );
    }
    if (f.note !== undefined) {
      if (typeof f.note !== "string") {
        throw new ProjectOperationError(`findings[${i}].note must be a string.`);
      }
      finding.note = f.note;
    }
    return finding;
  });

  // Related finding IDs must resolve within the draft.
  for (const f of findings) {
    for (const rel of f.relatedFindingIds ?? []) {
      if (!seenFindingIds.has(rel)) {
        throw new ProjectOperationError(`Finding ${f.id} relates to unknown finding ${rel}.`);
      }
    }
  }

  // Conflicts.
  const conflictsRaw = d.conflicts;
  if (conflictsRaw !== undefined && !Array.isArray(conflictsRaw)) {
    throw new ProjectOperationError("conflicts must be an array.");
  }
  const seenConflictIds = new Set<string>();
  const conflicts: Conflict[] = ((conflictsRaw ?? []) as unknown[]).map((rawC, i) => {
    if (typeof rawC !== "object" || rawC === null) {
      throw new ProjectOperationError(`conflicts[${i}] must be an object.`);
    }
    const c = rawC as Record<string, unknown>;
    const id = requireNonEmpty(c.id, `conflicts[${i}].id`);
    if (seenConflictIds.has(id)) throw new ProjectOperationError(`Duplicate conflict id: ${id}.`);
    seenConflictIds.add(id);
    if (!Array.isArray(c.findingIds) || c.findingIds.length === 0) {
      throw new ProjectOperationError(`conflicts[${i}].findingIds must be a non-empty array.`);
    }
    for (const fid of c.findingIds) {
      if (typeof fid !== "string" || !seenFindingIds.has(fid)) {
        throw new ProjectOperationError(
          `conflicts[${i}] references unknown finding ${String(fid)}.`,
        );
      }
    }
    const severity = requireEnum(c.severity, CONFLICT_SEVERITIES, `conflicts[${i}].severity`);
    const requiresUserResolution =
      c.requiresUserResolution === undefined
        ? severity === "blocking"
        : c.requiresUserResolution === true;
    return {
      id,
      findingIds: c.findingIds as string[],
      explanation: requireNonEmpty(c.explanation, `conflicts[${i}].explanation`),
      severity,
      requiresUserResolution,
    };
  });

  // Proposed work items.
  const workRaw = d.proposedWorkItems;
  if (workRaw !== undefined && !Array.isArray(workRaw)) {
    throw new ProjectOperationError("proposedWorkItems must be an array.");
  }
  const existingWorkIds = new Set(opts.state.workItems.map((w) => w.id));
  const seenWorkIds = new Set<string>();
  const proposedWorkItems: ProposedWorkItem[] = ((workRaw ?? []) as unknown[]).map((rawW, i) => {
    if (typeof rawW !== "object" || rawW === null) {
      throw new ProjectOperationError(`proposedWorkItems[${i}] must be an object.`);
    }
    const w = rawW as Record<string, unknown>;
    const id = requireNonEmpty(w.id, `proposedWorkItems[${i}].id`);
    if (seenWorkIds.has(id)) {
      throw new ProjectOperationError(`Duplicate proposed work id: ${id}.`);
    }
    seenWorkIds.add(id);
    const item: ProposedWorkItem = {
      id,
      kind: requireEnum(w.kind, WORK_ITEM_KINDS, `proposedWorkItems[${i}].kind`),
      title: requireNonEmpty(w.title, `proposedWorkItems[${i}].title`),
      sourceFindingIds: [],
    };
    if (w.description !== undefined) {
      if (typeof w.description !== "string") {
        throw new ProjectOperationError(`proposedWorkItems[${i}].description must be a string.`);
      }
      item.description = w.description;
    }
    if (w.priority !== undefined) {
      item.priority = requireEnum(
        w.priority,
        WORK_ITEM_PRIORITIES,
        `proposedWorkItems[${i}].priority`,
      );
    }
    if (w.acceptanceCriteria !== undefined) {
      if (
        !Array.isArray(w.acceptanceCriteria) ||
        w.acceptanceCriteria.some((x) => typeof x !== "string")
      ) {
        throw new ProjectOperationError(
          `proposedWorkItems[${i}].acceptanceCriteria must be strings.`,
        );
      }
      item.acceptanceCriteria = w.acceptanceCriteria as string[];
    }
    if (!Array.isArray(w.sourceFindingIds) || w.sourceFindingIds.length === 0) {
      throw new ProjectOperationError(
        `proposedWorkItems[${i}].sourceFindingIds must cite at least one finding.`,
      );
    }
    for (const fid of w.sourceFindingIds) {
      if (typeof fid !== "string" || !seenFindingIds.has(fid)) {
        throw new ProjectOperationError(
          `proposedWorkItems[${i}] cites unknown finding ${String(fid)}.`,
        );
      }
    }
    item.sourceFindingIds = w.sourceFindingIds as string[];
    if (w.relatesToWorkItemId !== undefined) {
      const rel = w.relatesToWorkItemId;
      if (typeof rel !== "string" || !existingWorkIds.has(rel)) {
        throw new ProjectOperationError(
          `proposedWorkItems[${i}].relatesToWorkItemId references unknown work item ${String(rel)}.`,
        );
      }
      item.relatesToWorkItemId = rel;
    }
    return item;
  });

  // Possible duplicates (advisory only).
  const dupRaw = d.possibleDuplicates;
  if (dupRaw !== undefined && !Array.isArray(dupRaw)) {
    throw new ProjectOperationError("possibleDuplicates must be an array.");
  }
  const possibleDuplicates = ((dupRaw ?? []) as unknown[]).map((rawD, i) => {
    const x = rawD as Record<string, unknown>;
    return {
      kind: requireEnum(
        x.kind,
        ["decision", "risk", "assumption", "work_item"] as const,
        `possibleDuplicates[${i}].kind`,
      ),
      draftRef: requireNonEmpty(x.draftRef, `possibleDuplicates[${i}].draftRef`),
      existingId: requireNonEmpty(x.existingId, `possibleDuplicates[${i}].existingId`),
      reason: requireNonEmpty(x.reason, `possibleDuplicates[${i}].reason`),
    };
  });

  const draft: IntakeDraft = {
    intakeId,
    draftRevision: typeof d.draftRevision === "number" ? d.draftRevision : 0,
    objective,
    findings,
    conflicts,
    proposedWorkItems,
    createdAt: typeof d.createdAt === "string" ? d.createdAt : new Date().toISOString(),
  };
  if (possibleDuplicates.length) draft.possibleDuplicates = possibleDuplicates;
  if (d.proposedNextAction !== undefined) {
    draft.proposedNextAction = requireNonEmpty(d.proposedNextAction, "proposedNextAction");
  }
  if (d.proposedNextActionRationale !== undefined) {
    draft.proposedNextActionRationale = requireNonEmpty(
      d.proposedNextActionRationale,
      "proposedNextActionRationale",
    );
  }
  if (d.reviewNotes !== undefined) {
    if (typeof d.reviewNotes !== "string") {
      throw new ProjectOperationError("reviewNotes must be a string.");
    }
    draft.reviewNotes = d.reviewNotes;
  }
  return draft;
}

/** Conflicts that must be resolved by the user before an intake can be applied. */
export function blockingConflicts(draft: IntakeDraft): Conflict[] {
  return draft.conflicts.filter((c) => c.requiresUserResolution || c.severity === "blocking");
}

export function findingsByCategory(draft: IntakeDraft, category: FindingCategory): Finding[] {
  return draft.findings.filter((f) => f.category === category);
}

export function modelInferences(draft: IntakeDraft): Finding[] {
  return draft.findings.filter((f) => f.origin === "model_inference");
}

/** Normalize a statement for conservative exact-duplicate matching (never semantic). */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .replace(/[.;:,!?]+$/g, "")
    .trim();
}
