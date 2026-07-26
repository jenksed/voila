// Pure project-operations domain. Each function takes readonly current state + inputs and returns a
// new ProjectState, or throws ProjectOperationError. No Pi, no I/O. The store's updateState wraps
// these to persist atomically.

import type {
  Assumption,
  AssumptionStatus,
  Confidence,
  Decision,
  DecisionStatus,
  Health,
  Impact,
  Likelihood,
  Phase,
  ProjectState,
  Risk,
  RiskStatus,
  WorkItem,
  WorkItemKind,
  WorkItemPriority,
  WorkItemStatus,
} from "./types.ts";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCES,
  DECISION_STATUSES,
  HEALTHS,
  IMPACTS,
  LIKELIHOODS,
  PHASES,
  RISK_STATUSES,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
} from "./types.ts";
import { allocateId } from "./ids.ts";
import { ProjectOperationError } from "./errors.ts";

const PRIORITY_RANK: Record<WorkItemPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function requireEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw new ProjectOperationError(
      `Invalid ${field}: ${String(value)}. Allowed: ${values.join(", ")}.`,
    );
  }
  return value as T;
}

function requireNonEmpty(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ProjectOperationError(`${field} is required and must be a non-empty string.`);
  }
  return value;
}

function workItemIds(state: Readonly<ProjectState>): Set<string> {
  return new Set(state.workItems.map((w) => w.id));
}

function requireExistingWorkItems(ids: string[], existing: Set<string>): void {
  for (const id of ids) {
    if (!existing.has(id)) {
      throw new ProjectOperationError(`Referenced work item does not exist: ${id}.`);
    }
  }
}

/** Detect a dependency cycle. Returns the cycle path if any, else null. */
export function detectCycle(items: readonly WorkItem[]): string[] | null {
  const byId = new Map(items.map((i) => [i.id, i]));
  const stateMap = new Map<string, number>(); // 0 unvisited, 1 in-stack, 2 done
  const path: string[] = [];

  function dfs(id: string): string[] | null {
    const st = stateMap.get(id) ?? 0;
    if (st === 1) {
      const idx = path.indexOf(id);
      return [...path.slice(idx), id];
    }
    if (st === 2) return null;
    stateMap.set(id, 1);
    path.push(id);
    const item = byId.get(id);
    if (item) {
      for (const dep of item.dependsOn) {
        if (!byId.has(dep)) continue;
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }
    }
    path.pop();
    stateMap.set(id, 2);
    return null;
  }

  for (const item of items) {
    const cycle = dfs(item.id);
    if (cycle) return cycle;
  }
  return null;
}

// --- Work items ---

export interface CreateWorkItemInput {
  kind: WorkItemKind;
  title: string;
  description?: string;
  priority?: WorkItemPriority;
  status?: WorkItemStatus;
  acceptanceCriteria?: string[];
  dependsOn?: string[];
}

export function createWorkItem(
  state: Readonly<ProjectState>,
  input: CreateWorkItemInput,
  now: string,
): ProjectState {
  const kind = requireEnum<WorkItemKind>(input.kind, WORK_ITEM_KINDS, "kind");
  const title = requireNonEmpty(input.title, "title");
  const priority = input.priority
    ? requireEnum<WorkItemPriority>(input.priority, WORK_ITEM_PRIORITIES, "priority")
    : "normal";
  const status = input.status
    ? requireEnum<WorkItemStatus>(input.status, WORK_ITEM_STATUSES, "status")
    : "backlog";
  if (status === "completed") {
    throw new ProjectOperationError(
      "Work items cannot be created as completed; completion is reserved for voila_complete_work_item.",
    );
  }
  const dependsOn = input.dependsOn ?? [];
  requireExistingWorkItems(dependsOn, workItemIds(state));

  const { id, sequences } = allocateId(state.sequences, "workItem");
  const item: WorkItem = {
    id,
    kind,
    title,
    ...(input.description ? { description: input.description } : {}),
    status,
    priority,
    acceptanceCriteria: input.acceptanceCriteria ?? [],
    dependsOn: [...new Set(dependsOn)],
    // Proof requirements are attached deliberately (see domain/proof.ts), never at creation time.
    requiredClaimIds: [],
    createdAt: now,
    updatedAt: now,
  };

  return { ...state, sequences, workItems: [...state.workItems, item] };
}

export interface UpdateWorkItemInput {
  id: string;
  title?: string;
  description?: string;
  priority?: WorkItemPriority;
  status?: WorkItemStatus;
  blockedReason?: string;
  acceptanceCriteria?: string[];
  addDependsOn?: string[];
  removeDependsOn?: string[];
}

export function updateWorkItem(
  state: Readonly<ProjectState>,
  input: UpdateWorkItemInput,
  now: string,
): ProjectState {
  const index = state.workItems.findIndex((w) => w.id === input.id);
  if (index < 0) throw new ProjectOperationError(`Work item not found: ${input.id}.`);
  const current = state.workItems[index] as WorkItem;

  const next: WorkItem = {
    ...current,
    dependsOn: [...current.dependsOn],
    requiredClaimIds: [...current.requiredClaimIds],
    updatedAt: now,
  };

  if (input.title !== undefined) next.title = requireNonEmpty(input.title, "title");
  if (input.description !== undefined) next.description = input.description;
  if (input.priority !== undefined) {
    next.priority = requireEnum<WorkItemPriority>(input.priority, WORK_ITEM_PRIORITIES, "priority");
  }
  if (input.acceptanceCriteria !== undefined)
    next.acceptanceCriteria = [...input.acceptanceCriteria];

  if (input.status !== undefined) {
    const status = requireEnum<WorkItemStatus>(input.status, WORK_ITEM_STATUSES, "status");
    if (status === "completed") {
      throw new ProjectOperationError(
        "Generic updates cannot mark a work item completed; that transition is reserved for voila_complete_work_item.",
      );
    }
    next.status = status;
  }
  if (input.blockedReason !== undefined) next.blockedReason = input.blockedReason;
  // blockedReason only applies while blocked.
  if (next.status !== "blocked") delete next.blockedReason;

  // Dependencies.
  const existing = workItemIds(state);
  let deps = next.dependsOn;
  if (input.removeDependsOn?.length) {
    const remove = new Set(input.removeDependsOn);
    deps = deps.filter((d) => !remove.has(d));
  }
  if (input.addDependsOn?.length) {
    requireExistingWorkItems(input.addDependsOn, existing);
    for (const dep of input.addDependsOn) {
      if (dep === next.id) throw new ProjectOperationError("A work item cannot depend on itself.");
      if (!deps.includes(dep)) deps.push(dep);
    }
  }
  next.dependsOn = deps;

  const nextItems = [...state.workItems];
  nextItems[index] = next;

  const cycle = detectCycle(nextItems);
  if (cycle) {
    throw new ProjectOperationError(`Dependency cycle rejected: ${cycle.join(" -> ")}.`);
  }

  return { ...state, workItems: nextItems };
}

/**
 * Set or clear the focus pointer (the work item currently receiving attention). Focus is distinct
 * from lifecycle status: an item may be focused while still `ready`, and an `in_progress` item need
 * not be focused. Completed/cancelled items cannot be focused.
 */
export function setFocusWorkItem(state: Readonly<ProjectState>, id: string | null): ProjectState {
  if (id === null) return { ...state, focusWorkItemId: null };
  const item = state.workItems.find((w) => w.id === id);
  if (!item) throw new ProjectOperationError(`Work item not found: ${id}.`);
  if (item.status === "completed" || item.status === "cancelled") {
    throw new ProjectOperationError(`Cannot focus a ${item.status} work item.`);
  }
  return { ...state, focusWorkItemId: id };
}

// --- Steward-owned scalar setters ---

export function setNextAction(state: Readonly<ProjectState>, nextAction: string): ProjectState {
  return { ...state, nextAction: requireNonEmpty(nextAction, "nextAction") };
}

/** Set or clear the Steward's rationale for the current next action. */
export function setNextActionRationale(
  state: Readonly<ProjectState>,
  rationale: string | null,
): ProjectState {
  if (rationale === null) {
    const next = { ...state };
    delete next.nextActionRationale;
    return next;
  }
  return { ...state, nextActionRationale: requireNonEmpty(rationale, "nextActionRationale") };
}

export function setPhase(state: Readonly<ProjectState>, phase: Phase): ProjectState {
  return { ...state, phase: requireEnum<Phase>(phase, PHASES, "phase") };
}

export function setHealth(state: Readonly<ProjectState>, health: Health): ProjectState {
  return { ...state, health: requireEnum<Health>(health, HEALTHS, "health") };
}

// --- Lifecycle transitions (same-status allowed for field-only updates) ---

const DECISION_TRANSITIONS: Record<DecisionStatus, DecisionStatus[]> = {
  proposed: ["proposed", "accepted", "superseded"],
  accepted: ["accepted", "superseded"],
  superseded: ["superseded"],
};
const ASSUMPTION_TRANSITIONS: Record<AssumptionStatus, AssumptionStatus[]> = {
  open: ["open", "validated", "invalidated"],
  validated: ["validated"],
  invalidated: ["invalidated"],
};
const RISK_TRANSITIONS: Record<RiskStatus, RiskStatus[]> = {
  open: ["open", "mitigated", "accepted", "closed"],
  mitigated: ["mitigated", "closed"],
  accepted: ["accepted", "closed"],
  closed: ["closed"],
};

function assertTransition<T extends string>(
  allowed: Record<string, readonly T[]>,
  from: T,
  to: T,
  entity: string,
): void {
  if (from === to) return;
  if (!allowed[from]?.includes(to)) {
    throw new ProjectOperationError(`Unsupported ${entity} transition: ${from} -> ${to}.`);
  }
}

/** True if following supersededBy from `target` reaches `id` (a supersession cycle). */
function supersessionCycle(decisions: readonly Decision[], id: string, target: string): boolean {
  const byId = new Map(decisions.map((d) => [d.id, d]));
  const seen = new Set<string>();
  let cur: string | undefined = target;
  while (cur) {
    if (cur === id) return true;
    if (seen.has(cur)) break;
    seen.add(cur);
    cur = byId.get(cur)?.supersededBy;
  }
  return false;
}

// --- Decisions ---

export interface RecordDecisionInput {
  title: string;
  decision: string;
  rationale: string;
  status?: DecisionStatus;
}

export function recordDecision(
  state: Readonly<ProjectState>,
  input: RecordDecisionInput,
  now: string,
): ProjectState {
  const decision: Decision = {
    id: "",
    title: requireNonEmpty(input.title, "title"),
    decision: requireNonEmpty(input.decision, "decision"),
    rationale: requireNonEmpty(input.rationale, "rationale"),
    status: input.status
      ? requireEnum<DecisionStatus>(input.status, DECISION_STATUSES, "status")
      : "proposed",
    createdAt: now,
    updatedAt: now,
  };
  const { id, sequences } = allocateId(state.sequences, "decision");
  decision.id = id;
  return { ...state, sequences, decisions: [...state.decisions, decision] };
}

export interface UpdateDecisionInput {
  id: string;
  title?: string;
  decision?: string;
  rationale?: string;
  status?: DecisionStatus;
  supersededById?: string;
}

export function updateDecision(
  state: Readonly<ProjectState>,
  input: UpdateDecisionInput,
  now: string,
): ProjectState {
  const index = state.decisions.findIndex((d) => d.id === input.id);
  if (index < 0) throw new ProjectOperationError(`Decision not found: ${input.id}.`);
  const current = state.decisions[index] as Decision;
  const next: Decision = { ...current, updatedAt: now };
  if (input.title !== undefined) next.title = requireNonEmpty(input.title, "title");
  if (input.decision !== undefined) next.decision = requireNonEmpty(input.decision, "decision");
  if (input.rationale !== undefined) next.rationale = requireNonEmpty(input.rationale, "rationale");

  const target =
    input.status !== undefined
      ? requireEnum<DecisionStatus>(input.status, DECISION_STATUSES, "status")
      : current.status;
  assertTransition(DECISION_TRANSITIONS, current.status, target, "decision");
  next.status = target;

  if (target === "superseded") {
    const ref = input.supersededById ?? current.supersededBy;
    if (!ref) throw new ProjectOperationError("Superseding a decision requires supersededById.");
    if (ref === current.id) throw new ProjectOperationError("A decision cannot supersede itself.");
    if (!state.decisions.some((d) => d.id === ref)) {
      throw new ProjectOperationError(`supersededById references unknown decision: ${ref}.`);
    }
    if (supersessionCycle(state.decisions, current.id, ref)) {
      throw new ProjectOperationError(`Supersession cycle rejected: ${current.id} <-> ${ref}.`);
    }
    next.supersededBy = ref;
  } else if (input.supersededById !== undefined) {
    throw new ProjectOperationError("supersededById only applies when status is superseded.");
  }

  const nextDecisions = [...state.decisions];
  nextDecisions[index] = next;
  return { ...state, decisions: nextDecisions };
}

// --- Assumptions ---

export interface RecordAssumptionInput {
  statement: string;
  confidence: Confidence;
  status?: AssumptionStatus;
  note?: string;
}

export function recordAssumption(
  state: Readonly<ProjectState>,
  input: RecordAssumptionInput,
  now: string,
): ProjectState {
  const assumption: Assumption = {
    id: "",
    statement: requireNonEmpty(input.statement, "statement"),
    confidence: requireEnum<Confidence>(input.confidence, CONFIDENCES, "confidence"),
    status: input.status
      ? requireEnum<AssumptionStatus>(input.status, ASSUMPTION_STATUSES, "status")
      : "open",
    ...(input.note ? { note: input.note } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const { id, sequences } = allocateId(state.sequences, "assumption");
  assumption.id = id;
  return { ...state, sequences, assumptions: [...state.assumptions, assumption] };
}

export interface UpdateAssumptionInput {
  id: string;
  statement?: string;
  confidence?: Confidence;
  status?: AssumptionStatus;
  note?: string;
}

export function updateAssumption(
  state: Readonly<ProjectState>,
  input: UpdateAssumptionInput,
  now: string,
): ProjectState {
  const index = state.assumptions.findIndex((a) => a.id === input.id);
  if (index < 0) throw new ProjectOperationError(`Assumption not found: ${input.id}.`);
  const current = state.assumptions[index] as Assumption;
  const next: Assumption = { ...current, updatedAt: now };
  if (input.statement !== undefined) next.statement = requireNonEmpty(input.statement, "statement");
  if (input.confidence !== undefined) {
    next.confidence = requireEnum<Confidence>(input.confidence, CONFIDENCES, "confidence");
  }
  if (input.status !== undefined) {
    const target = requireEnum<AssumptionStatus>(input.status, ASSUMPTION_STATUSES, "status");
    assertTransition(ASSUMPTION_TRANSITIONS, current.status, target, "assumption");
    next.status = target;
  }
  if (input.note !== undefined) next.note = input.note;
  const nextAssumptions = [...state.assumptions];
  nextAssumptions[index] = next;
  return { ...state, assumptions: nextAssumptions };
}

// --- Risks ---

export interface RecordRiskInput {
  statement: string;
  likelihood: Likelihood;
  impact: Impact;
  status?: RiskStatus;
  mitigation?: string;
  linkedWorkItems?: string[];
}

export function recordRisk(
  state: Readonly<ProjectState>,
  input: RecordRiskInput,
  now: string,
): ProjectState {
  const linked = input.linkedWorkItems ?? [];
  requireExistingWorkItems(linked, workItemIds(state));
  const risk: Risk = {
    id: "",
    statement: requireNonEmpty(input.statement, "statement"),
    likelihood: requireEnum<Likelihood>(input.likelihood, LIKELIHOODS, "likelihood"),
    impact: requireEnum<Impact>(input.impact, IMPACTS, "impact"),
    status: input.status ? requireEnum<RiskStatus>(input.status, RISK_STATUSES, "status") : "open",
    ...(input.mitigation ? { mitigation: input.mitigation } : {}),
    ...(linked.length ? { linkedWorkItems: [...new Set(linked)] } : {}),
    createdAt: now,
    updatedAt: now,
  };
  const { id, sequences } = allocateId(state.sequences, "risk");
  risk.id = id;
  return { ...state, sequences, risks: [...state.risks, risk] };
}

export interface UpdateRiskInput {
  id: string;
  statement?: string;
  likelihood?: Likelihood;
  impact?: Impact;
  status?: RiskStatus;
  mitigation?: string;
  linkedWorkItems?: string[];
}

export function updateRisk(
  state: Readonly<ProjectState>,
  input: UpdateRiskInput,
  now: string,
): ProjectState {
  const index = state.risks.findIndex((r) => r.id === input.id);
  if (index < 0) throw new ProjectOperationError(`Risk not found: ${input.id}.`);
  const current = state.risks[index] as Risk;
  const next: Risk = { ...current, updatedAt: now };
  if (input.statement !== undefined) next.statement = requireNonEmpty(input.statement, "statement");
  if (input.likelihood !== undefined) {
    next.likelihood = requireEnum<Likelihood>(input.likelihood, LIKELIHOODS, "likelihood");
  }
  if (input.impact !== undefined)
    next.impact = requireEnum<Impact>(input.impact, IMPACTS, "impact");
  if (input.mitigation !== undefined) next.mitigation = input.mitigation;
  if (input.linkedWorkItems !== undefined) {
    requireExistingWorkItems(input.linkedWorkItems, workItemIds(state));
    next.linkedWorkItems = [...new Set(input.linkedWorkItems)];
  }

  const target =
    input.status !== undefined
      ? requireEnum<RiskStatus>(input.status, RISK_STATUSES, "status")
      : current.status;
  assertTransition(RISK_TRANSITIONS, current.status, target, "risk");
  if (target === "closed") {
    const resolution = next.mitigation ?? current.mitigation;
    if (!resolution || resolution.trim().length === 0) {
      throw new ProjectOperationError("Closing a risk requires a mitigation or resolution.");
    }
  }
  next.status = target;

  const nextRisks = [...state.risks];
  nextRisks[index] = next;
  return { ...state, risks: nextRisks };
}

// --- Queries ---

export interface WorkItemFilter {
  status?: WorkItemStatus;
  kind?: WorkItemKind;
  priority?: WorkItemPriority;
}

export function listWorkItems(
  state: Readonly<ProjectState>,
  filter: WorkItemFilter = {},
): WorkItem[] {
  return state.workItems.filter(
    (w) =>
      (filter.status === undefined || w.status === filter.status) &&
      (filter.kind === undefined || w.kind === filter.kind) &&
      (filter.priority === undefined || w.priority === filter.priority),
  );
}

export function sortByPriority(items: readonly WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]);
}

export interface BacklogSummary {
  total: number;
  countsByStatus: Record<WorkItemStatus, number>;
  openCount: number;
  inProgress: WorkItem[];
  blocked: WorkItem[];
  readyByPriority: WorkItem[];
  focus: WorkItem | null;
  openRiskCount: number;
  acceptedDecisionCount: number;
  nextAction: string;
}

export function backlogSummary(state: Readonly<ProjectState>): BacklogSummary {
  const countsByStatus = {} as Record<WorkItemStatus, number>;
  for (const s of WORK_ITEM_STATUSES) countsByStatus[s] = 0;
  for (const w of state.workItems) countsByStatus[w.status] += 1;

  const openCount = state.workItems.filter(
    (w) => w.status !== "completed" && w.status !== "cancelled",
  ).length;

  return {
    total: state.workItems.length,
    countsByStatus,
    openCount,
    inProgress: state.workItems.filter((w) => w.status === "in_progress"),
    blocked: state.workItems.filter((w) => w.status === "blocked"),
    readyByPriority: sortByPriority(state.workItems.filter((w) => w.status === "ready")),
    focus: state.workItems.find((w) => w.id === state.focusWorkItemId) ?? null,
    openRiskCount: state.risks.filter((r) => r.status === "open").length,
    acceptedDecisionCount: state.decisions.filter((d) => d.status === "accepted").length,
    nextAction: state.nextAction,
  };
}
