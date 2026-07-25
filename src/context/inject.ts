// Compact, deterministic NewFang context for injection before agent work.
// Pure builder + a thin async assembler. Injection never mutates canonical state.
//
// Hard rules:
//   - strict length cap,
//   - deterministic ordering (no timestamps, no iteration-order surprises),
//   - no source documents, no raw event history, no credentials, no hidden reasoning.

import type { ProjectState } from "../domain/types.ts";
import type { ProofSummary } from "../domain/proof.ts";
import { backlogSummary } from "../domain/operations.ts";

/** Maximum characters of injected context. Kept small so it never crowds the real conversation. */
export const CONTEXT_CHAR_LIMIT = 2400;

/**
 * The proof rules the model must know. Deliberately short, deterministic, and free of encouragement to
 * make weak claims: it says what evidence means, not how to satisfy a gate.
 */
const PROOF_RULES =
  "Proof: claims cite exact acceptance criteria; run commands only via newfang_run_verification (executable + args, no shell); a passing command is evidence only for the claim it ran for; stale or failed evidence cannot complete work; limitations stay visible; only newfang_complete_work_item may mark work completed.";

export type ContextStatus = "ok" | "uninitialized" | "migration" | "error";

export interface ContextInput {
  status: ContextStatus;
  state?: ProjectState;
  message?: string;
  /** Pending intake awaiting review, if any. */
  pendingIntake?: { id: string; title: string; draftRevision: number } | null;
  /** Current orientation status, if any. */
  orientation?: { id: string; stale: boolean; reasons: string[] } | null;
  /** Derived proof counts. Never persisted; recomputed on every injection. */
  proof?: ProofSummary | null;
}

const TRUNCATION_SUFFIX = "\n…(context truncated)";

function clamp(text: string, limit = CONTEXT_CHAR_LIMIT): string {
  if (text.length <= limit) return text;
  const keep = Math.max(0, limit - TRUNCATION_SUFFIX.length);
  return `${text.slice(0, keep)}${TRUNCATION_SUFFIX}`;
}

/**
 * Build the injected context block. Deterministic for a given input: no clock reads, no randomness.
 */
export function buildContextBlock(input: ContextInput): string {
  if (input.status === "uninitialized") {
    return "[NewFang] No canonical project state here. Run /newfang init to create it.";
  }
  if (input.status === "migration") {
    return "[NewFang] Canonical state needs migration. Run /newfang migrate to inspect and /newfang migrate --apply to migrate. Do not modify .newfang/ by hand.";
  }
  if (input.status === "error" || !input.state) {
    return `[NewFang] Canonical state problem: ${input.message ?? "unreadable state"}. Run /newfang doctor.`;
  }

  const s = input.state;
  const summary = backlogSummary(s);
  const lines: string[] = ["[NewFang project context]"];

  lines.push(
    `Project: ${s.displayName} · phase ${s.phase} · health ${s.health} · revision ${s.revision}`,
  );
  lines.push(`Focus: ${summary.focus ? `${summary.focus.id} — ${summary.focus.title}` : "none"}`);
  lines.push(`Next action: ${s.nextAction}`);
  if (s.nextActionRationale) lines.push(`Why now: ${s.nextActionRationale}`);

  if (input.pendingIntake) {
    lines.push(
      `Pending intake: ${input.pendingIntake.id} "${input.pendingIntake.title}" (draft revision ${input.pendingIntake.draftRevision}) awaits review — do not apply it without explicit user confirmation.`,
    );
  } else {
    lines.push("Pending intake: none");
  }

  if (input.orientation) {
    lines.push(
      `Orientation: ${input.orientation.id}${input.orientation.stale ? ` (STALE: ${input.orientation.reasons.join("; ")})` : " (current)"}`,
    );
  } else {
    lines.push("Orientation: none recorded");
  }

  // Deterministic slices: canonical array order, capped.
  const accepted = s.decisions.filter((d) => d.status === "accepted").slice(0, 5);
  if (accepted.length) {
    lines.push("Accepted decisions:");
    for (const d of accepted) lines.push(`- ${d.id}: ${d.decision}`);
  }
  const highRisks = s.risks.filter((r) => r.status === "open" && r.impact === "high").slice(0, 3);
  if (highRisks.length) {
    lines.push("Open high-impact risks:");
    for (const r of highRisks) lines.push(`- ${r.id}: ${r.statement}`);
  }

  lines.push(
    `Work: ${summary.openCount} open (${summary.inProgress.length} in progress, ${summary.blocked.length} blocked, ${summary.readyByPriority.length} ready)`,
  );

  const proof = input.proof;
  if (proof && proof.total > 0) {
    lines.push(
      `Claims: ${proof.total} — ${proof.supported} supported, ${proof.unsupported} unsupported, ${proof.stale} stale, ${proof.pending} pending${proof.fingerprintAvailable ? "" : " (git unavailable: nothing counts as current)"}`,
    );
  } else {
    lines.push("Claims: none recorded — no work item can be completed yet");
  }
  lines.push(PROOF_RULES);

  lines.push(
    "Brief: .newfang/briefs/PROJECT_BRIEF.md · Use NewFang tools (newfang_*) for project truth; never edit .newfang/ by hand.",
  );

  return clamp(lines.join("\n"));
}
