// Intake artifact I/O: preserve sources, store drafts, generate the understanding view, and drive
// canonical intake metadata + lifecycle transitions. All canonical writes go through updateState.
//
// Invariants:
//   - source.md is written exactly once and never rewritten (a new interpretation is a new draft).
//   - the source is read from disk for file intake; the model never reproduces it.
//   - canonical state changes only at defined lifecycle points; staging changes no project truth.

import { existsSync } from "node:fs";
import { appendFile, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { intakePaths, revisionPaths, revisionSlug, statePaths } from "./paths.ts";
import { loadState, updateState, writeStatusView } from "./store.ts";
import { NewfangStateError } from "./errors.ts";
import { resolveRepoRelativeSource, sha256, sha256Bytes } from "./source.ts";
import { allocateId } from "../domain/ids.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import type { IntakeDraft } from "../domain/intake.ts";
import { validateIntakeDraft } from "../domain/intake.ts";
import { applyDraft, type ApplySummary } from "../domain/apply.ts";
import { renderUnderstanding } from "../domain/understanding.ts";
import { renderProjectBrief } from "../domain/brief.ts";
import type { IntakeRecord, IntakeSourceType, ProjectState } from "../domain/types.ts";

export class IntakeNotFoundError extends NewfangStateError {
  constructor(id: string) {
    super(`Intake not found: ${id}.`);
    this.name = "IntakeNotFoundError";
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export interface IntakeManifest {
  intakeId: string;
  title: string;
  sourceType: IntakeSourceType;
  sourceRef: string;
  sourceSha256: string;
  sourceLineCount: number;
  createdAt: string;
  /** The current (latest) draft revision; 0 before any draft is staged. */
  currentDraftRevision: number;
}

export const REVIEW_ACTIONS = ["revision_requested", "accepted", "rejected"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

/**
 * One append-only review record. Deliberately narrow: concise user-visible feedback only — never
 * hidden reasoning and never a chat transcript.
 */
export interface ReviewRecord {
  intakeId: string;
  reviewedRevision: number;
  action: ReviewAction;
  feedback?: string;
  timestamp: string;
  resultingStatus: string;
}

/**
 * Maximum stored revision feedback. Reviewer corrections are concise and user-visible; this cap
 * exists so a transcript or hidden reasoning can never be parked in the review log.
 */
export const MAX_REVIEW_FEEDBACK_LENGTH = 2000;

/** Append one review record. The log is append-only and never rewritten. */
export async function appendReview(root: string, record: ReviewRecord): Promise<void> {
  const paths = intakePaths(root, record.intakeId);
  await mkdir(paths.dir, { recursive: true });
  await appendFile(paths.reviews, `${JSON.stringify(record)}\n`, "utf8");
}

/** Read the append-only review log (empty when absent). */
export async function readReviews(root: string, intakeId: string): Promise<ReviewRecord[]> {
  const paths = intakePaths(root, intakeId);
  if (!existsSync(paths.reviews)) return [];
  const text = await readFile(paths.reviews, "utf8");
  return text
    .split("\n")
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ReviewRecord);
}

/** Revision numbers with a stored draft artifact, ascending. */
export async function listDraftRevisions(root: string, intakeId: string): Promise<number[]> {
  const paths = intakePaths(root, intakeId);
  if (!existsSync(paths.draftsDir)) return [];
  const entries = await readdir(paths.draftsDir);
  return entries
    .filter((e) => /^\d+\.json$/.test(e))
    .map((e) => Number(e.replace(/\.json$/, "")))
    .sort((a, b) => a - b);
}

export async function readManifest(root: string, intakeId: string): Promise<IntakeManifest> {
  const paths = intakePaths(root, intakeId);
  if (!existsSync(paths.manifest)) throw new IntakeNotFoundError(intakeId);
  return JSON.parse(await readFile(paths.manifest, "utf8")) as IntakeManifest;
}

export async function readSource(root: string, intakeId: string): Promise<string> {
  const paths = intakePaths(root, intakeId);
  if (!existsSync(paths.source)) throw new IntakeNotFoundError(intakeId);
  return readFile(paths.source, "utf8");
}

/**
 * Read a stored draft revision. Defaults to the manifest's current revision.
 * Prior revisions remain readable forever; nothing is reconstructed if an artifact is missing.
 */
export async function readDraft(
  root: string,
  intakeId: string,
  revision?: number,
): Promise<IntakeDraft | null> {
  let target = revision;
  if (target === undefined) {
    try {
      target = (await readManifest(root, intakeId)).currentDraftRevision;
    } catch {
      return null;
    }
  }
  if (!target || target < 1) return null;
  const paths = revisionPaths(root, intakeId, target);
  if (!existsSync(paths.draft)) return null;
  return JSON.parse(await readFile(paths.draft, "utf8")) as IntakeDraft;
}

/** Read a generated Understanding Check for a revision (default: current). */
export async function readUnderstanding(
  root: string,
  intakeId: string,
  revision?: number,
): Promise<string | null> {
  let target = revision;
  if (target === undefined) {
    try {
      target = (await readManifest(root, intakeId)).currentDraftRevision;
    } catch {
      return null;
    }
  }
  if (!target || target < 1) return null;
  const paths = revisionPaths(root, intakeId, target);
  if (!existsSync(paths.understanding)) return null;
  return readFile(paths.understanding, "utf8");
}

export function findIntake(state: ProjectState, intakeId: string): IntakeRecord {
  const record = state.intakes.find((i) => i.id === intakeId);
  if (!record) throw new IntakeNotFoundError(intakeId);
  return record;
}

export interface CreateIntakeInput {
  /** Repository-relative file path. Mutually exclusive with `text`. */
  path?: string;
  /** Exact text for conversation/pasted-text intake. Mutually exclusive with `path`. */
  text?: string;
  sourceType?: IntakeSourceType;
  title?: string;
}

export interface CreateIntakeResult {
  intake: IntakeRecord;
  lineCount: number;
}

/**
 * Preserve a source exactly, then record compact canonical metadata. The source artifact is written
 * before canonical state is updated, so success always implies the bytes are on disk.
 */
export async function createIntake(
  root: string,
  input: CreateIntakeInput,
): Promise<CreateIntakeResult> {
  const hasPath = typeof input.path === "string" && input.path.length > 0;
  const hasText = typeof input.text === "string" && input.text.length > 0;
  if (hasPath === hasText) {
    throw new ProjectOperationError(
      "Provide exactly one source: a repository-relative path or text.",
    );
  }

  let content: string;
  let sourceRef: string;
  let sourceType: IntakeSourceType;
  let hash: string;
  let title: string;

  if (hasPath) {
    const resolved = await resolveRepoRelativeSource(root, input.path as string);
    const bytes = await readFile(resolved.absolutePath);
    content = bytes.toString("utf8");
    hash = sha256Bytes(bytes);
    sourceRef = resolved.relativePath;
    sourceType = "file";
    title = input.title ?? resolved.relativePath;
  } else {
    content = input.text as string;
    hash = sha256(content);
    sourceType = input.sourceType === "conversation" ? "conversation" : "pasted_text";
    sourceRef = input.title ? `text:${input.title}` : `text:${hash.slice(0, 12)}`;
    title = input.title ?? `Pasted source ${hash.slice(0, 8)}`;
  }

  const state = await loadState(root);
  const { id } = allocateId(state.sequences, "intake");
  const paths = intakePaths(root, id);
  if (existsSync(paths.source)) {
    throw new ProjectOperationError(
      `Intake ${id} already has a preserved source; refusing to overwrite.`,
    );
  }

  const now = new Date().toISOString();
  const lineCount = content.split("\n").length;

  // Artifacts first: source bytes + manifest.
  await mkdir(paths.dir, { recursive: true });
  await atomicWrite(paths.source, content);
  const manifest: IntakeManifest = {
    intakeId: id,
    title,
    sourceType,
    sourceRef,
    sourceSha256: hash,
    sourceLineCount: lineCount,
    createdAt: now,
    currentDraftRevision: 0,
  };
  await atomicWrite(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`);

  // Then canonical metadata.
  const nextState = await updateState(
    root,
    (cur) => {
      const alloc = allocateId(cur.sequences, "intake");
      const record: IntakeRecord = {
        id: alloc.id,
        title,
        sourceType,
        sourceRef,
        sourceSha256: hash,
        status: "source_preserved",
        draftRevision: 0,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...cur,
        sequences: alloc.sequences,
        intakes: [...cur.intakes, record],
        currentIntakeId: alloc.id,
      };
    },
    { type: "intake_source_preserved", id, sourceType, sha256: hash },
  );

  return { intake: findIntake(nextState, id), lineCount };
}

export interface StageDraftResult {
  intake: IntakeRecord;
  draft: IntakeDraft;
  summary: ApplySummary;
  blocked: boolean;
}

/**
 * Validate and store a structured interpretation. Increments draftRevision, regenerates the
 * understanding view, and moves the intake to `review_required`. Changes NO project truth.
 */
export async function stageIntakeDraft(
  root: string,
  intakeId: string,
  rawDraft: unknown,
): Promise<StageDraftResult> {
  const state = await loadState(root);
  const record = findIntake(state, intakeId);
  if (record.status === "accepted" || record.status === "rejected") {
    throw new ProjectOperationError(
      `Intake ${intakeId} is ${record.status}; stage a new intake instead of revising a closed one.`,
    );
  }
  // A draft under review is replaced only because a reviewer asked for a correction. Requiring the
  // request first is what makes revision N+1 attributable instead of an unexplained restage.
  if (record.draftRevision >= 1) {
    const reviews = await readReviews(root, intakeId);
    const requested = reviews.some(
      (r) => r.action === "revision_requested" && r.reviewedRevision === record.draftRevision,
    );
    if (!requested) {
      throw new ProjectOperationError(
        `Draft revision ${record.draftRevision} of ${intakeId} is awaiting review. Record a revision ` +
          `request against it (/newfang intake revise "<feedback>") before staging revision ${
            record.draftRevision + 1
          }.`,
      );
    }
  }
  const manifest = await readManifest(root, intakeId);

  const draft = validateIntakeDraft(
    { ...(rawDraft as object), intakeId },
    { sourceLineCount: manifest.sourceLineCount, state },
  );

  const nextRevision = record.draftRevision + 1;
  const stored: IntakeDraft = { ...draft, draftRevision: nextRevision };

  // Deterministic apply preview from the same code path that will perform the apply.
  let summary: ApplySummary;
  let blocked = false;
  try {
    summary = applyDraft(state, stored, new Date().toISOString()).summary;
  } catch {
    blocked = true;
    summary = {
      intakeId,
      draftRevision: nextRevision,
      entries: [],
      createdCounts: { decisions: 0, assumptions: 0, risks: 0, workItems: 0 },
      skippedDuplicates: 0,
    };
  }

  const paths = intakePaths(root, intakeId);
  const revPaths = revisionPaths(root, intakeId, nextRevision);
  if (existsSync(revPaths.draft)) {
    throw new ProjectOperationError(
      `Draft revision ${nextRevision} already exists for ${intakeId}; prior revisions are never overwritten.`,
    );
  }
  await mkdir(paths.draftsDir, { recursive: true });
  await mkdir(paths.understandingsDir, { recursive: true });
  await atomicWrite(revPaths.draft, `${JSON.stringify(stored, null, 2)}\n`);

  const nextState = await updateState(
    root,
    (cur) => ({
      ...cur,
      intakes: cur.intakes.map((i) =>
        i.id === intakeId
          ? {
              ...i,
              status: "review_required" as const,
              draftRevision: nextRevision,
              updatedAt: new Date().toISOString(),
            }
          : i,
      ),
      currentIntakeId: intakeId,
    }),
    { type: "intake_draft_staged", id: intakeId, draftRevision: nextRevision, blocked },
  );

  const updated = findIntake(nextState, intakeId);
  await atomicWrite(revPaths.understanding, renderUnderstanding(updated, stored, summary));
  // Point the manifest at the new current revision (prior artifacts stay in place).
  await atomicWrite(
    paths.manifest,
    `${JSON.stringify({ ...manifest, currentDraftRevision: nextRevision }, null, 2)}\n`,
  );

  return { intake: updated, draft: stored, summary, blocked };
}

/** Regenerate `.newfang/briefs/PROJECT_BRIEF.md` from canonical state. */
export async function writeProjectBrief(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.briefsDir, { recursive: true });
  await atomicWrite(paths.projectBrief, renderProjectBrief(state));
}

export interface ApplyIntakeResult {
  intake: IntakeRecord;
  summary: ApplySummary;
  alreadyApplied: boolean;
}

/**
 * Apply a reviewed draft. Requires `review_required`, the reviewer's exact draft revision, and an
 * explicit confirmation flag supplied by the intake workflow (never inferred from model intent).
 * Idempotent: re-applying an already-accepted revision creates nothing.
 */
export async function applyIntake(
  root: string,
  intakeId: string,
  opts: { reviewedDraftRevision: number; confirmed: boolean },
): Promise<ApplyIntakeResult> {
  const state = await loadState(root);
  const record = findIntake(state, intakeId);

  if (record.status === "accepted") {
    if ((record.acceptedDraftRevision ?? record.draftRevision) === opts.reviewedDraftRevision) {
      const draft = await readDraft(root, intakeId);
      return {
        intake: record,
        summary: {
          intakeId,
          draftRevision: record.draftRevision,
          entries: [],
          createdCounts: { decisions: 0, assumptions: 0, risks: 0, workItems: 0 },
          skippedDuplicates: draft ? draft.proposedWorkItems.length : 0,
        },
        alreadyApplied: true,
      };
    }
    throw new ProjectOperationError(
      `Intake ${intakeId} is already accepted at revision ${record.draftRevision}.`,
    );
  }
  if (record.status !== "review_required") {
    throw new ProjectOperationError(
      `Intake ${intakeId} is ${record.status}; it must be reviewed (status review_required) before apply.`,
    );
  }
  if (!opts.confirmed) {
    throw new ProjectOperationError(
      "Applying an intake requires explicit user confirmation through the intake workflow.",
    );
  }
  if (record.draftRevision !== opts.reviewedDraftRevision) {
    throw new ProjectOperationError(
      `Reviewed revision ${opts.reviewedDraftRevision} does not match the current draft revision ${record.draftRevision}; re-review before applying.`,
    );
  }

  const draft = await readDraft(root, intakeId);
  if (!draft) throw new ProjectOperationError(`Intake ${intakeId} has no staged draft to apply.`);

  const now = new Date().toISOString();
  // Compute once to fail before any write when blocking conflicts exist.
  const preview = applyDraft(state, draft, now);

  const nextState = await updateState(
    root,
    (cur) => {
      const applied = applyDraft(cur, draft, now).state;
      return {
        ...applied,
        intakes: applied.intakes.map((i) =>
          i.id === intakeId
            ? {
                ...i,
                status: "accepted" as const,
                acceptedDraftRevision: draft.draftRevision,
                acceptedAt: now,
                updatedAt: now,
              }
            : i,
        ),
        currentIntakeId: intakeId,
      };
    },
    {
      type: "intake_applied",
      id: intakeId,
      draftRevision: draft.draftRevision,
      created: preview.summary.createdCounts,
      skippedDuplicates: preview.summary.skippedDuplicates,
    },
  );

  // Append-only review history: record the exact revision that was accepted.
  await appendReview(root, {
    intakeId,
    reviewedRevision: draft.draftRevision,
    action: "accepted",
    timestamp: now,
    resultingStatus: "accepted",
  });
  await writeProjectBrief(root, nextState);
  await writeStatusView(root, nextState);

  return {
    intake: findIntake(nextState, intakeId),
    summary: preview.summary,
    alreadyApplied: false,
  };
}

export interface RequestRevisionInput {
  /** The revision the reviewer actually read. Must equal the intake's current draft revision. */
  reviewedDraftRevision: number;
  /** Concise, user-visible description of what must change. Never reasoning or a transcript. */
  feedback: string;
  /**
   * Explicitly add a further correction to a revision that already has one. Off by default so a
   * repeated request is a deliberate act rather than an accident.
   */
  supersedePrevious?: boolean;
}

export interface RequestRevisionResult {
  intake: IntakeRecord;
  record: ReviewRecord;
  supersededRequests: number;
}

/**
 * Record a reviewer's request for a corrected draft.
 *
 * Appends exactly one `revision_requested` record and changes no project truth. The intake stays in
 * `review_required`: asking for a correction is a reviewer action, not a new lifecycle state. Prior
 * drafts, understanding views, and review records are never touched.
 */
export async function requestIntakeRevision(
  root: string,
  intakeId: string,
  input: RequestRevisionInput,
): Promise<RequestRevisionResult> {
  const state = await loadState(root);
  const record = findIntake(state, intakeId);

  if (record.status !== "review_required") {
    throw new ProjectOperationError(
      `Intake ${intakeId} is ${record.status}; only an intake awaiting review (status review_required) can receive a revision request.`,
    );
  }
  if (record.draftRevision < 1) {
    throw new ProjectOperationError(
      `Intake ${intakeId} has no staged draft; there is nothing to request a revision of.`,
    );
  }
  if (record.draftRevision !== input.reviewedDraftRevision) {
    throw new ProjectOperationError(
      `Reviewed revision ${input.reviewedDraftRevision} does not match the current draft revision ${record.draftRevision}; re-review before requesting a revision.`,
    );
  }

  const feedback = input.feedback.trim();
  if (feedback.length === 0) {
    throw new ProjectOperationError(
      "A revision request requires concise feedback describing what must change.",
    );
  }
  if (feedback.length > MAX_REVIEW_FEEDBACK_LENGTH) {
    throw new ProjectOperationError(
      `Revision feedback is ${feedback.length} characters; keep it under ${MAX_REVIEW_FEEDBACK_LENGTH}. Record the correction, not the discussion.`,
    );
  }

  const reviews = await readReviews(root, intakeId);
  const priorRequests = reviews.filter(
    (r) => r.action === "revision_requested" && r.reviewedRevision === record.draftRevision,
  );
  if (priorRequests.length > 0 && !input.supersedePrevious) {
    throw new ProjectOperationError(
      `Revision ${record.draftRevision} of ${intakeId} already has a revision request. Stage the ` +
        `revised draft, or set supersedePrevious to add a further correction to the same revision.`,
    );
  }

  const now = new Date().toISOString();
  const nextState = await updateState(
    root,
    (cur) => ({
      ...cur,
      intakes: cur.intakes.map((i) => (i.id === intakeId ? { ...i, updatedAt: now } : i)),
      currentIntakeId: intakeId,
    }),
    {
      type: "intake_revision_requested",
      id: intakeId,
      reviewedRevision: record.draftRevision,
      ...(priorRequests.length > 0 ? { supersedes: priorRequests.length } : {}),
    },
  );

  // Appended after the canonical write so a failure here fails closed: with no record on disk,
  // staging the next revision stays blocked rather than silently permitted.
  const reviewRecord: ReviewRecord = {
    intakeId,
    reviewedRevision: record.draftRevision,
    action: "revision_requested",
    feedback,
    timestamp: now,
    resultingStatus: "review_required",
  };
  await appendReview(root, reviewRecord);

  return {
    intake: findIntake(nextState, intakeId),
    record: reviewRecord,
    supersededRequests: priorRequests.length,
  };
}

/** Reject an intake. The preserved source and drafts remain on disk for the record. */
export async function rejectIntake(
  root: string,
  intakeId: string,
  reason?: string,
): Promise<IntakeRecord> {
  const state = await loadState(root);
  const record = findIntake(state, intakeId);
  if (record.status === "accepted") {
    throw new ProjectOperationError(
      `Intake ${intakeId} is already accepted and cannot be rejected.`,
    );
  }
  const now = new Date().toISOString();
  const nextState = await updateState(
    root,
    (cur) => ({
      ...cur,
      intakes: cur.intakes.map((i) =>
        i.id === intakeId ? { ...i, status: "rejected" as const, updatedAt: now } : i,
      ),
    }),
    { type: "intake_rejected", id: intakeId, ...(reason ? { reason } : {}) },
  );
  await appendReview(root, {
    intakeId,
    reviewedRevision: record.draftRevision,
    action: "rejected",
    ...(reason ? { feedback: reason } : {}),
    timestamp: now,
    resultingStatus: "rejected",
  });
  return findIntake(nextState, intakeId);
}
