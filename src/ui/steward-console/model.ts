// Immutable view model for the Steward Console. Pure: domain state + runtime context -> view model.
// UI components read only this model, never canonical state directly.

import type {
  Assumption,
  Decision,
  ProjectState,
  Risk,
  VerificationReceiptRecord,
  WorkItem,
} from "../../domain/types.ts";
import type {
  ClaimEvaluationStatus,
  CompletionAssessment,
  ProofSummary,
} from "../../domain/proof.ts";
import type { Readiness } from "../../domain/readiness.ts";

export interface RuntimeContext {
  branch?: string;
  dirty?: boolean;
  piVersion?: string;
  nodeVersion?: string;
}

export type ConsoleStatus = "ok" | "uninitialized" | "migration" | "error";

export interface PendingIntakeView {
  id: string;
  title: string;
  draftRevision: number;
  sourceType: string;
  sourceRef: string;
  sourceSha256: string;
  blocked: boolean;
  /** Pre-rendered Understanding Check lines (generated artifact), if available. */
  understanding: string[];
}

export interface OrientationView {
  id: string;
  stale: boolean;
  reasons: string[];
}

/** One claim as the console shows it: the claim plus its derived status and visible limitations. */
export interface ClaimView {
  id: string;
  workItemId: string;
  workItemTitle: string;
  statement: string;
  confidence: string;
  status: ClaimEvaluationStatus;
  reason: string;
  required: boolean;
  coveredAcceptanceCriteria: string[];
  knownLimitations: string[];
  latestReceiptId: string | null;
  latestResult: string | null;
  receiptCount: number;
}

/** Curated receipt row. The console never renders full command output in a primary view. */
export interface ReceiptView {
  id: string;
  claimId: string;
  result: string;
  command: string;
  cwdRef: string;
  finishedAt: string;
  matchesCurrent: boolean;
  outputTruncated: boolean;
  artifactRef: string;
  exitCode?: number;
}

export interface ProofView {
  fingerprintAvailable: boolean;
  summary: ProofSummary;
  claims: ClaimView[];
  receipts: ReceiptView[];
  /** Completion readiness of the focused item, when one is focused. */
  focusReadiness: CompletionAssessment | null;
  /**
   * Derived hold on the focused item: every gate passes, but a required claim still records what its
   * evidence does not establish. Null when there is no hold. Passing gates alone must never render as
   * "ready to complete" (R1 / NF-9).
   */
  focusHold: Readiness | null;
}

export interface ConsoleInput {
  status: ConsoleStatus;
  state?: ProjectState;
  message?: string;
  pendingIntake?: PendingIntakeView | null;
  orientation?: OrientationView | null;
  proof?: ProofView | null;
}

export type ConsoleView = "focus" | "work" | "proof" | "truth" | "understanding";
/**
 * Views reachable by Tab, in navigation order. The Understanding Check is opened contextually rather
 * than cycled into.
 */
export const CONSOLE_VIEWS: ConsoleView[] = ["focus", "work", "proof", "truth"];

export type AttentionSeverity = "high" | "medium" | "info";
export interface AttentionItem {
  severity: AttentionSeverity;
  label: string;
  ref?: EntityRef;
}

export type EntityKind =
  | "work"
  | "decision"
  | "assumption"
  | "risk"
  | "claim"
  | "receipt"
  /** A completion-gate detail for a work item (id is the work-item ID). */
  | "gate";
export interface EntityRef {
  kind: EntityKind;
  id: string;
}

export interface WorkGroup {
  title: string;
  items: WorkItem[];
}

export interface ConsoleModel {
  status: ConsoleStatus;
  message?: string;
  identity?: { displayName: string; phase: string; health: string; projectId: string };
  runtime: RuntimeContext;
  nextAction?: { text: string; rationale?: string; focusId: string | null };
  focus?: WorkItem | null;
  attention: AttentionItem[];
  work: {
    counts: { ready: number; inProgress: number; blocked: number; backlog: number; open: number };
    groups: WorkGroup[];
  };
  truth: { decisions: Decision[]; assumptions: Assumption[]; risks: Risk[] };
  /** Intake awaiting review, with its generated Understanding Check. */
  pendingIntake: PendingIntakeView | null;
  orientation: OrientationView | null;
  /** Claims, receipts, and completion readiness for the Proof view. */
  proof: ProofView | null;
}

const EMPTY_PROOF_SUMMARY: ProofSummary = {
  total: 0,
  pending: 0,
  supported: 0,
  unsupported: 0,
  stale: 0,
  fingerprintAvailable: false,
};

/** An empty Proof view, for uninitialized/error screens and for projects with no claims yet. */
export function emptyProofView(): ProofView {
  return {
    fingerprintAvailable: false,
    summary: EMPTY_PROOF_SUMMARY,
    claims: [],
    receipts: [],
    focusReadiness: null,
    focusHold: null,
  };
}

/** Curated receipt row from a canonical receipt record. */
export function toReceiptView(
  receipt: VerificationReceiptRecord,
  currentFingerprint: string | null,
): ReceiptView {
  return {
    id: receipt.id,
    claimId: receipt.claimId,
    result: receipt.result,
    command: [receipt.executable, ...receipt.args].join(" "),
    cwdRef: receipt.cwdRef,
    finishedAt: receipt.finishedAt,
    matchesCurrent:
      currentFingerprint !== null && currentFingerprint === receipt.repositoryFingerprint,
    outputTruncated: receipt.outputTruncated,
    artifactRef: receipt.artifactRef,
    ...(receipt.exitCode !== undefined ? { exitCode: receipt.exitCode } : {}),
  };
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function byPriority(items: WorkItem[]): WorkItem[] {
  return [...items].sort(
    (a, b) => (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9),
  );
}

/** Derive a concise attention list from existing state (no notification subsystem). */
export function deriveAttention(
  state: ProjectState,
  extra: {
    pendingIntake?: PendingIntakeView | null;
    orientation?: OrientationView | null;
    proof?: ProofView | null;
  } = {},
): AttentionItem[] {
  const attention: AttentionItem[] = [];
  // Evidence problems on required claims outrank everything else: they block completion.
  for (const c of extra.proof?.claims ?? []) {
    if (!c.required) continue;
    if (c.status === "unsupported") {
      attention.push({
        severity: "high",
        label: `Required claim ${c.id} is UNSUPPORTED: ${c.reason}`,
        ref: { kind: "claim", id: c.id },
      });
    } else if (c.status === "stale") {
      attention.push({
        severity: "medium",
        label: `Required claim ${c.id} evidence is stale: ${c.reason}`,
        ref: { kind: "claim", id: c.id },
      });
    }
  }
  if (extra.pendingIntake) {
    attention.push({
      severity: extra.pendingIntake.blocked ? "high" : "medium",
      label: extra.pendingIntake.blocked
        ? `Intake ${extra.pendingIntake.id} has conflicts needing your resolution`
        : `Intake ${extra.pendingIntake.id} awaits review (revision ${extra.pendingIntake.draftRevision})`,
    });
  }
  if (extra.orientation?.stale) {
    attention.push({
      severity: "medium",
      label: `Orientation ${extra.orientation.id} is stale: ${extra.orientation.reasons.join("; ")}`,
    });
  }
  const focus = state.workItems.find((w) => w.id === state.focusWorkItemId);
  if (focus && focus.status === "blocked") {
    attention.push({
      severity: "high",
      label: `Focus ${focus.id} is blocked${focus.blockedReason ? `: ${focus.blockedReason}` : ""}`,
      ref: { kind: "work", id: focus.id },
    });
  }
  for (const r of state.risks) {
    if (r.status === "open" && r.impact === "high") {
      attention.push({
        severity: "high",
        label: `High-impact open risk ${r.id}: ${r.statement}`,
        ref: { kind: "risk", id: r.id },
      });
    }
  }
  for (const a of state.assumptions) {
    if (a.status === "invalidated") {
      attention.push({
        severity: "medium",
        label: `Invalidated assumption ${a.id}: ${a.statement}`,
        ref: { kind: "assumption", id: a.id },
      });
    }
  }
  for (const d of state.decisions) {
    if (d.status === "proposed") {
      attention.push({
        severity: "info",
        label: `Proposed decision ${d.id}: ${d.title}`,
        ref: { kind: "decision", id: d.id },
      });
    }
  }
  return attention;
}

function workGroups(state: ProjectState): WorkGroup[] {
  const focus = state.workItems.find((w) => w.id === state.focusWorkItemId);
  const groups: WorkGroup[] = [];
  if (focus) groups.push({ title: "Focus", items: [focus] });
  const inProgress = state.workItems.filter(
    (w) => w.status === "in_progress" && w.id !== focus?.id,
  );
  if (inProgress.length) groups.push({ title: "In progress", items: inProgress });
  const blocked = state.workItems.filter((w) => w.status === "blocked" && w.id !== focus?.id);
  if (blocked.length) groups.push({ title: "Blocked", items: blocked });
  const ready = byPriority(
    state.workItems.filter((w) => w.status === "ready" && w.id !== focus?.id),
  );
  if (ready.length) groups.push({ title: "Ready", items: ready });
  const backlog = state.workItems.filter((w) => w.status === "backlog" && w.id !== focus?.id);
  if (backlog.length) groups.push({ title: "Backlog", items: backlog });
  return groups;
}

export function buildConsoleModel(input: ConsoleInput, runtime: RuntimeContext): ConsoleModel {
  if (input.status !== "ok" || !input.state) {
    return {
      status: input.status,
      message: input.message,
      runtime,
      attention: [],
      work: { counts: { ready: 0, inProgress: 0, blocked: 0, backlog: 0, open: 0 }, groups: [] },
      truth: { decisions: [], assumptions: [], risks: [] },
      pendingIntake: null,
      orientation: null,
      proof: null,
    };
  }
  const s = input.state;
  const count = (status: string) => s.workItems.filter((w) => w.status === status).length;
  const focus = s.workItems.find((w) => w.id === s.focusWorkItemId) ?? null;
  return {
    status: "ok",
    identity: {
      displayName: s.displayName,
      phase: s.phase,
      health: s.health,
      projectId: s.projectId,
    },
    runtime,
    nextAction: {
      text: s.nextAction,
      ...(s.nextActionRationale ? { rationale: s.nextActionRationale } : {}),
      focusId: s.focusWorkItemId,
    },
    focus,
    attention: deriveAttention(s, {
      pendingIntake: input.pendingIntake ?? null,
      orientation: input.orientation ?? null,
      proof: input.proof ?? null,
    }),
    work: {
      counts: {
        ready: count("ready"),
        inProgress: count("in_progress"),
        blocked: count("blocked"),
        backlog: count("backlog"),
        open: s.workItems.filter((w) => w.status !== "completed" && w.status !== "cancelled")
          .length,
      },
      groups: workGroups(s),
    },
    truth: {
      decisions: s.decisions,
      assumptions: s.assumptions.filter((a) => a.status === "open" || a.status === "invalidated"),
      risks: s.risks.filter((r) => r.status === "open" || r.status === "mitigated"),
    },
    pendingIntake: input.pendingIntake ?? null,
    orientation: input.orientation ?? null,
    proof: input.proof ?? null,
  };
}

/** Ordered selectable entities for a view (used by keyboard selection + detail). */
export function selectableRefs(model: ConsoleModel, view: ConsoleView): EntityRef[] {
  if (model.status !== "ok") return [];
  if (view === "focus") {
    const refs: EntityRef[] = [];
    if (model.focus) refs.push({ kind: "work", id: model.focus.id });
    for (const a of model.attention) if (a.ref) refs.push(a.ref);
    return refs;
  }
  if (view === "work") {
    return model.work.groups.flatMap((g) =>
      g.items.map((w) => ({ kind: "work" as const, id: w.id })),
    );
  }
  if (view === "proof") {
    const proof = model.proof;
    if (!proof) return [];
    return [
      ...proof.claims.map((c) => ({ kind: "claim" as const, id: c.id })),
      ...proof.receipts.map((r) => ({ kind: "receipt" as const, id: r.id })),
      ...(proof.focusReadiness
        ? [{ kind: "gate" as const, id: proof.focusReadiness.workItemId }]
        : []),
    ];
  }
  return [
    ...model.truth.decisions.map((d) => ({ kind: "decision" as const, id: d.id })),
    ...model.truth.assumptions.map((a) => ({ kind: "assumption" as const, id: a.id })),
    ...model.truth.risks.map((r) => ({ kind: "risk" as const, id: r.id })),
  ];
}
