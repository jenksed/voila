// The focus capsule: one deterministic continuation block injected before a Project Steward turn.
// Pure builder + (in assemble.ts) a thin async assembler. Injection never mutates canonical state.
//
// R1's purpose is ambient continuity: a fresh session that receives "Continue." must be able to
// recover the accepted objective, the active work item, the thread of prior progress, and a justified
// next action — and then act, without asking the developer for a recap.
//
// Hard rules:
//   - three classes of content, always labelled: canonical truth, repository observation, directive;
//   - required information is never dropped and never tail-truncated (long values are abbreviated
//     field by field, so meaning survives);
//   - optional content is relevance-filtered and bounded, and is dropped when the budget is tight;
//   - deterministic for a given input: no clock reads, no randomness, no iteration-order surprises;
//   - no source documents, no raw event history, no credentials, no model inference presented as
//     fact, and no capability that does not exist (R1 has no workers and no background terminals, so
//     active-operation fields are omitted rather than reported as zero).

import type { ProjectState } from "../domain/types.ts";
import type { ProofSummary } from "../domain/proof.ts";
import { abbreviate } from "../domain/status.ts";
import { heldWork, holdSummary, outstandingLimitations } from "../domain/readiness.ts";
import {
  activeRun,
  latestSettlement,
  summarizeRun,
  isFinalState,
} from "../domain/operations-runtime.ts";
import type { OperationSummary } from "../domain/operations-runtime.ts";

/** Default budget: the capsule aims to stay this small so it never crowds the real conversation. */
export const CAPSULE_TARGET_CHARS = 1800;
/** Hard ceiling. Required content is abbreviated to fit; it is never removed to fit. */
export const CAPSULE_HARD_MAX = 2400;

/**
 * Per-field abbreviation caps. Required fields shrink rather than disappear, so a runaway value can
 * never push a required field out of the capsule or truncate the tail of the block.
 */
const CAP = {
  objective: 120,
  focus: 120,
  slice: 120,
  nextAction: 200,
  whyNow: 120,
  blocker: 120,
  held: 120,
  decision: 110,
  intake: 90,
  orientationReasons: 45,
} as const;

const MAX_HELD = 2;
const MAX_DECISIONS = 3;
/**
 * Observation lines kept, in the order `observationLines` produces them: the git line first (genuine
 * continuity), then the single most severe evidence note. A third line pushed the block past the
 * budget and cost the capsule its whole observation section, which is a worse trade than dropping the
 * orientation note — Doctor and /voila orient carry that, and it is explicitly not a blocker.
 */
const MAX_OBSERVATIONS = 2;

export type ContextStatus = "ok" | "uninitialized" | "migration" | "error";

/** Bounded, read-only repository facts. Observation, never canonical truth. */
export interface RepositoryObservation {
  isGitRepository: boolean;
  branch?: string;
  /** Provenance only. HEAD movement is not a reason to re-orient or re-verify. */
  head?: string;
  changedFileCount?: number;
}

export interface CapsuleInput {
  status: ContextStatus;
  state?: ProjectState;
  message?: string;
  /** True when the developer's prompt was an explicit request to continue the accepted work. */
  continuation?: boolean;
  /** Pending intake awaiting review, if any. */
  pendingIntake?: { id: string; title: string; draftRevision: number } | null;
  /** Current orientation status, if any. */
  orientation?: { id: string; stale: boolean; reasons: string[] } | null;
  /** Derived proof counts. Never persisted; recomputed on every injection. */
  proof?: ProofSummary | null;
  /** Bounded git observation, when available. */
  repository?: RepositoryObservation | null;
  /** Authoritative active or recently settled operation summary, when one exists. */
  operation?: OperationSummary | null;
}

/**
 * One capsule entry. `required: true` entries are always emitted; optional entries are added in
 * ascending `priority` while the budget allows. `order` fixes the position in the rendered document
 * so selection never reshuffles the capsule.
 */
interface Entry {
  order: number;
  priority: number;
  required: boolean;
  lines: string[];
}

function entryLength(entry: Entry): number {
  // +1 per line for the newline that joins it.
  return entry.lines.reduce((n, line) => n + line.length + 1, 0);
}

/**
 * The accepted objective, as canonical state records it.
 *
 * Voila has no dedicated objective field: the accepted direction is carried by accepted decisions,
 * the most recent of which is the standing direction. The line names the decision it comes from, so
 * the reader can verify it rather than trust the selection rule. When no decision is accepted, the
 * capsule says so instead of inventing an objective.
 */
function objectiveLine(state: ProjectState): string {
  const accepted = state.decisions.filter((d) => d.status === "accepted");
  const latest = accepted[accepted.length - 1];
  if (!latest) {
    return "Objective: not recorded in canonical state — no accepted decision sets the direction yet";
  }
  return `Objective: ${latest.id} ${abbreviate(`${latest.title} — ${latest.decision}`, CAP.objective)}`;
}

/** The meaningful blocker, from canonical truth only. Required: stated even when there is none. */
function blockerLine(state: ProjectState): string {
  const focus = state.workItems.find((w) => w.id === state.focusWorkItemId);
  if (focus) {
    if (focus.status === "blocked") {
      return `Blocker: ${focus.id} is blocked${focus.blockedReason ? ` — ${abbreviate(focus.blockedReason, CAP.blocker)}` : " (no reason recorded)"}`;
    }
    const byId = new Map(state.workItems.map((w) => [w.id, w] as const));
    const open = focus.dependsOn.filter((d) => byId.get(d)?.status !== "completed");
    if (open.length > 0) {
      return `Blocker: ${focus.id} depends on ${open.join(", ")}, not yet completed`;
    }
  }
  return "Blocker: none recorded — no canonical condition blocks the accepted work";
}

/**
 * The current slice, derived from the canonical next action rather than from a new planning
 * subsystem (R1 records no slice of its own, and inventing one would be fiction).
 *
 * The only period we trust as a sentence boundary is one followed by whitespace **and a capital
 * letter that opens the next sentence**. That single structural signal rejects the cases a naive
 * `.`-split mangles, with no natural-language parser:
 *
 *   - an inline literal like `Continue.` — the next word ("acceptance") is lowercase, so no boundary;
 *   - a filename like `app.py` — no whitespace after the dot;
 *   - a version like `22.23.1` — dots are followed by digits, not a space.
 *
 * When no trustworthy boundary exists the slice is omitted, and the full (abbreviated) next action on
 * the line below carries the meaning. A malformed prefix would be worse than no slice: the controlling
 * rule is to prefer the complete canonical next action over a damaged summary.
 */
function sliceLine(nextAction: string): string | null {
  const text = nextAction.trim();
  // {15,} and the internal-space check keep a bare token — "1.", an initial "J." — from ever
  // becoming a "slice"; the non-greedy quantifier stops at the first *trusted* boundary.
  const first = /^(.{15,}?[.!?])\s+[A-Z]/.exec(text)?.[1];
  if (!first || first.length > CAP.slice || !first.includes(" ")) return null;
  return `Current slice: ${first} (the canonical next action's first step)`;
}

/**
 * Accepted decisions explicitly connected to the active work: the decision text or title names the
 * focused item or a held item. Exact ID match only — no guessing at topical relevance, and never the
 * whole ledger.
 */
function relevantDecisions(state: ProjectState, ids: string[]): string[] {
  if (ids.length === 0) return [];
  return state.decisions
    .filter((d) => d.status === "accepted")
    .filter((d) => ids.some((id) => d.decision.includes(id) || d.title.includes(id)))
    .slice(0, MAX_DECISIONS)
    .map((d) => `  - ${d.id}: ${abbreviate(d.decision, CAP.decision)}`);
}

/** Bounded repository observation lines, in decreasing usefulness. */
function observationLines(input: CapsuleInput): string[] {
  const lines: string[] = [];
  const repo = input.repository;
  if (repo && repo.isGitRepository) {
    const parts: string[] = [];
    if (repo.branch) parts.push(`branch ${repo.branch}`);
    if (repo.head) parts.push(`HEAD ${repo.head.slice(0, 7)}`);
    if (repo.changedFileCount !== undefined) {
      parts.push(
        repo.changedFileCount === 0
          ? "worktree clean"
          : `${repo.changedFileCount} changed file(s), development in progress`,
      );
    }
    if (parts.length > 0) lines.push(`  ${parts.join(" · ")}`);
  }

  const proof = input.proof;
  if (proof && proof.total > 0) {
    if (!proof.fingerprintAvailable) {
      lines.push(`  evidence: ${proof.total} claim(s); git unavailable, so none reads as current`);
    } else if (proof.unsupported > 0) {
      lines.push(
        `  evidence: ${proof.unsupported} claim(s) contradicted by current evidence — a real failure, read it`,
      );
    } else if (proof.stale > 0) {
      lines.push(
        `  evidence: ${proof.stale}/${proof.total} claim(s) affected by current changes — expected; reconcile once at the boundary, not now`,
      );
    } else {
      lines.push(`  evidence: ${proof.supported} of ${proof.total} claim(s) supported right now`);
    }
  }

  const orientation = input.orientation;
  if (orientation) {
    lines.push(
      orientation.stale
        ? `  orientation: ${orientation.id} describes changed inputs (${abbreviate(orientation.reasons.join("; "), CAP.orientationReasons)}) — your call, not a blocker`
        : `  orientation: ${orientation.id} current`,
    );
  }
  return lines.slice(0, MAX_OBSERVATIONS);
}

/** Build the bounded operation-summary line(s). */
function operationLines(input: CapsuleInput): string[] {
  const op = input.operation;
  if (!op) return [];
  const secs = op.durationMs === null ? "" : ` · ${(op.durationMs / 1000).toFixed(1)}s`;
  const truncated = op.outputSummary.truncated ? " · output truncated" : "";
  const redacted = op.outputSummary.redactedSecrets ? " · secrets redacted" : "";
  if (op.pendingAcknowledgement) {
    return [
      `  Settled operation: ${op.definitionId} · ${op.settlementReason ?? "settled"}${secs}${truncated}${redacted} — acknowledge on this turn`,
    ];
  }
  if (!isFinalState(op.lifecycleState)) {
    return [`  Active operation: ${op.definitionId} · ${op.lifecycleState}${secs}`];
  }
  return [];
}

function directiveLines(input: CapsuleInput, focusId: string | null): string[] {
  if (input.continuation) {
    const target = focusId ? ` ${focusId}` : " the accepted focus";
    return [
      "Steward directive:",
      `  Continue${target} inside the accepted scope — the thread is above, so do not ask for a recap, a status report, or state maintenance.`,
      "  At most four lines, then make the first useful repository action in this same turn; keep going without asking permission for reversible in-plan work.",
    ];
  }
  return [
    "Steward directive:",
    "  Work the accepted focus above. Prefer a justified action over a status report, and do not ask",
    "  for context this capsule already gives you.",
  ];
}

/**
 * The two load-bearing evidence facts, compressed to one line.
 *
 * Packet 4 injected the full proof rules on every turn. R1 subordinates the Proof Engine to a quiet
 * boundary service, so the ceremony is gone — but these two facts are what stop a model from
 * narrating completion, and they stay.
 */
const EVIDENCE_LINE =
  "  Evidence: only voila_complete_work_item completes work, and only a voila_run_verification receipt is evidence.";

const AUTHORITY_LINES = [
  "Authority boundary:",
  "  Escalate only a material decision, an irreversible or external action, credentials or authenticated human activity, or final owner acceptance.",
  "  Canonical state changes only through voila_* tools (never edit .voila/ by hand); Voila never commits, stages, pushes, or opens a PR.",
];

/**
 * Build the injected capsule. Deterministic for a given input.
 */
export function buildFocusCapsule(input: CapsuleInput): string {
  if (input.status === "uninitialized") {
    return "[Voila] No canonical project state here. Run /voila init to create it.";
  }
  if (input.status === "migration") {
    return "[Voila] Canonical state needs migration. Run /voila migrate to inspect and /voila migrate --apply to migrate. Do not modify .voila/ by hand.";
  }
  if (input.status === "error" || !input.state) {
    return `[Voila] Canonical state problem: ${input.message ?? "unreadable state"}. Run /voila doctor.`;
  }

  const s = input.state;
  const focus = s.workItems.find((w) => w.id === s.focusWorkItemId) ?? null;
  const entries: Entry[] = [];
  const add = (order: number, priority: number, required: boolean, lines: string[]): void => {
    if (lines.length > 0) entries.push({ order, priority, required, lines });
  };

  // --- Canonical truth (accepted state, reached through supported operations) ---
  add(0, 0, true, [
    "[Voila continuation capsule]",
    "Canonical truth (accepted project state):",
    `  Project: ${s.displayName} · phase ${s.phase} · health ${s.health} · revision ${s.revision}`,
  ]);
  add(1, 0, true, [`  ${objectiveLine(s)}`]);
  add(2, 0, true, [
    focus
      ? `  Focus: ${focus.id} (${focus.status}) — ${abbreviate(focus.title, CAP.focus)}`
      : "  Focus: none selected — choose one deliberately before claiming progress",
  ]);

  const slice = sliceLine(s.nextAction);
  if (slice) add(3, 3, false, [`  ${slice}`]);
  add(4, 0, true, [`  Next action: ${abbreviate(s.nextAction, CAP.nextAction)}`]);
  if (s.nextActionRationale) {
    add(5, 5, false, [`  Why now: ${abbreviate(s.nextActionRationale, CAP.whyNow)}`]);
  }
  add(6, 0, true, [`  ${blockerLine(s)}`]);

  // A hold is a property of the recorded evidence, so it is reported without a fingerprint: it must
  // not appear and disappear as verification goes stale during ordinary development.
  const held = heldWork(s).filter((w) => w.id !== s.focusWorkItemId);
  const heldLines = held.slice(0, MAX_HELD).map((item) => {
    const summary = holdSummary(outstandingLimitations(s, item));
    return `  Held (do not start): ${item.id} — ${abbreviate(summary, CAP.held)}`;
  });
  add(7, 1, false, heldLines);

  if (input.pendingIntake) {
    add(8, 1, false, [
      `  Pending intake: ${input.pendingIntake.id} "${abbreviate(input.pendingIntake.title, CAP.intake)}" awaits review — never apply it without explicit user confirmation`,
    ]);
  }

  const decisionLines = relevantDecisions(s, [
    ...(s.focusWorkItemId ? [s.focusWorkItemId] : []),
    ...held.map((w) => w.id),
  ]);
  // A group header is only ever emitted with a body.
  if (decisionLines.length > 0)
    add(9, 4, false, ["  Relevant accepted decisions:", ...decisionLines]);

  // --- Repository observation (observed now, not canonical truth) ---
  const observations = observationLines(input);
  if (observations.length > 0) {
    add(10, 2, false, [
      "Repository observation (observed now, not canonical truth):",
      ...observations,
    ]);
  }

  // Operation state (authoritative; from canonical state, not from logs). Always inside the
  // repository observation block to keep the three-class separation intact.
  const opLines = operationLines(input);
  if (opLines.length > 0) {
    add(10, 1, false, opLines);
  }

  // --- Steward directive ---
  add(11, 0, true, directiveLines(input, focus?.id ?? null));
  add(12, 0, true, [EVIDENCE_LINE]);
  add(13, 0, true, AUTHORITY_LINES);

  // Selection: every required entry, then optional entries in ascending priority while inside the
  // target. An entry that does not fit is skipped rather than ending the pass, so leftover budget can
  // still carry a smaller entry — but nothing more relevant is ever dropped to make room for
  // something less relevant, because relevance decides the order of consideration.
  const selected = entries.filter((e) => e.required);
  let used = selected.reduce((n, e) => n + entryLength(e), 0);
  const optional = entries
    .filter((e) => !e.required)
    .sort((a, b) => a.priority - b.priority || a.order - b.order);
  for (const entry of optional) {
    const cost = entryLength(entry);
    if (used + cost > CAPSULE_TARGET_CHARS) continue;
    selected.push(entry);
    used += cost;
  }

  return selected
    .sort((a, b) => a.order - b.order)
    .flatMap((e) => e.lines)
    .join("\n");
}
