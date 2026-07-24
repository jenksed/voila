// Canonical `.newfang/` state store (schema v2): init, load, validate, immutable update,
// append-only events, generated view, and migration primitives. Pure Node I/O — no Pi.
//
// Invariants (ADR-0003):
// - project.json is the authoritative snapshot; writes are atomic (temp + rename).
// - A successful canonical write happens BEFORE the generated view / UI.
// - events.jsonl is append-only history and never authoritative current state.
// - Version 1 is never a valid current state; it must be migrated explicitly (see state/migration.ts).

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type {
  Assumption,
  Decision,
  ProjectState,
  Risk,
  Sequences,
  WorkItem,
} from "../domain/types.ts";
import {
  ASSUMPTION_STATUSES,
  CONFIDENCES,
  DECISION_STATUSES,
  HEALTHS,
  IMPACTS,
  LIKELIHOODS,
  PHASES,
  RISK_STATUSES,
  SCHEMA_VERSION,
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITIES,
  WORK_ITEM_STATUSES,
} from "../domain/types.ts";
import { createInitialState } from "../domain/defaults.ts";
import { renderStatusView } from "../domain/status.ts";
import { statePaths } from "./paths.ts";
import {
  MigrationRequiredError,
  StateExistsError,
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "./errors.ts";

export interface NewfangEvent {
  type: string;
  ts?: string;
  [key: string]: unknown;
}

function serializeState(state: ProjectState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** Deep-freeze an object so the update reducer cannot mutate its input. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const v of Object.values(value as Record<string, unknown>)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

async function atomicWriteFile(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

export function stateExists(root: string): boolean {
  return existsSync(statePaths(root).projectJson);
}

// --- Validation helpers ---

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.length > 0;
}

function inEnum(v: unknown, values: readonly string[]): boolean {
  return typeof v === "string" && values.includes(v);
}

function isStringArray(v: unknown): boolean {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateTimestamps(o: Record<string, unknown>, prefix: string, problems: string[]): void {
  if (!isNonEmptyString(o.createdAt)) problems.push(`${prefix}.createdAt`);
  if (!isNonEmptyString(o.updatedAt)) problems.push(`${prefix}.updatedAt`);
}

function validateWorkItem(raw: unknown, i: number, problems: string[]): void {
  const p = `workItems[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!inEnum(o.kind, WORK_ITEM_KINDS)) problems.push(`${p}.kind`);
  if (!isNonEmptyString(o.title)) problems.push(`${p}.title`);
  if (o.description !== undefined && typeof o.description !== "string")
    problems.push(`${p}.description`);
  if (!inEnum(o.status, WORK_ITEM_STATUSES)) problems.push(`${p}.status`);
  if (!inEnum(o.priority, WORK_ITEM_PRIORITIES)) problems.push(`${p}.priority`);
  if (!isStringArray(o.acceptanceCriteria)) problems.push(`${p}.acceptanceCriteria`);
  if (!isStringArray(o.dependsOn)) problems.push(`${p}.dependsOn`);
  if (o.blockedReason !== undefined && typeof o.blockedReason !== "string")
    problems.push(`${p}.blockedReason`);
  validateTimestamps(o, p, problems);
}

function validateDecision(raw: unknown, i: number, problems: string[]): void {
  const p = `decisions[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.title)) problems.push(`${p}.title`);
  if (!isNonEmptyString(o.decision)) problems.push(`${p}.decision`);
  if (!isNonEmptyString(o.rationale)) problems.push(`${p}.rationale`);
  if (!inEnum(o.status, DECISION_STATUSES)) problems.push(`${p}.status`);
  if (o.supersededBy !== undefined && typeof o.supersededBy !== "string")
    problems.push(`${p}.supersededBy`);
  validateTimestamps(o, p, problems);
}

function validateAssumption(raw: unknown, i: number, problems: string[]): void {
  const p = `assumptions[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.statement)) problems.push(`${p}.statement`);
  if (!inEnum(o.confidence, CONFIDENCES)) problems.push(`${p}.confidence`);
  if (!inEnum(o.status, ASSUMPTION_STATUSES)) problems.push(`${p}.status`);
  if (o.note !== undefined && typeof o.note !== "string") problems.push(`${p}.note`);
  validateTimestamps(o, p, problems);
}

function validateRisk(raw: unknown, i: number, problems: string[]): void {
  const p = `risks[${i}]`;
  if (typeof raw !== "object" || raw === null) {
    problems.push(p);
    return;
  }
  const o = raw as Record<string, unknown>;
  if (!isNonEmptyString(o.id)) problems.push(`${p}.id`);
  if (!isNonEmptyString(o.statement)) problems.push(`${p}.statement`);
  if (!inEnum(o.likelihood, LIKELIHOODS)) problems.push(`${p}.likelihood`);
  if (!inEnum(o.impact, IMPACTS)) problems.push(`${p}.impact`);
  if (!inEnum(o.status, RISK_STATUSES)) problems.push(`${p}.status`);
  if (o.mitigation !== undefined && typeof o.mitigation !== "string")
    problems.push(`${p}.mitigation`);
  if (o.linkedWorkItems !== undefined && !isStringArray(o.linkedWorkItems))
    problems.push(`${p}.linkedWorkItems`);
  validateTimestamps(o, p, problems);
}

function validateSequences(raw: unknown, problems: string[]): void {
  if (typeof raw !== "object" || raw === null) {
    problems.push("sequences");
    return;
  }
  const o = raw as Record<string, unknown>;
  for (const key of ["workItem", "decision", "assumption", "risk"]) {
    if (typeof o[key] !== "number" || !Number.isInteger(o[key]) || (o[key] as number) < 1) {
      problems.push(`sequences.${key}`);
    }
  }
}

function uniqueIds(items: Array<{ id: string }>, prefix: string, problems: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) problems.push(`${prefix}: duplicate id ${item.id}`);
    seen.add(item.id);
  }
}

/** Validate an untrusted parsed value as v2 ProjectState, or throw an actionable error. */
export function validateProjectState(raw: unknown): ProjectState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StateValidationError("project.json must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.schemaVersion !== "number") {
    throw new StateValidationError("project.json is missing a numeric 'schemaVersion'.");
  }
  if (o.schemaVersion !== SCHEMA_VERSION) {
    throw new StateValidationError(
      `Expected schemaVersion ${SCHEMA_VERSION}, found ${o.schemaVersion}.`,
    );
  }

  const problems: string[] = [];
  for (const key of ["projectId", "displayName", "nextAction", "createdAt", "updatedAt"]) {
    if (!isNonEmptyString(o[key])) problems.push(key);
  }
  if (!inEnum(o.phase, PHASES)) problems.push("phase");
  if (!inEnum(o.health, HEALTHS)) problems.push("health");
  if (typeof o.revision !== "number" || !Number.isInteger(o.revision) || o.revision < 1) {
    problems.push("revision");
  }
  if (o.activeWorkItemId !== null && typeof o.activeWorkItemId !== "string") {
    problems.push("activeWorkItemId");
  }
  validateSequences(o.sequences, problems);

  for (const [key, fn] of [
    ["workItems", validateWorkItem],
    ["decisions", validateDecision],
    ["assumptions", validateAssumption],
    ["risks", validateRisk],
  ] as const) {
    if (!Array.isArray(o[key])) {
      problems.push(key);
      continue;
    }
    (o[key] as unknown[]).forEach((item, i) => fn(item, i, problems));
  }

  if (problems.length > 0) {
    throw new StateValidationError(
      `Invalid or missing fields in project.json: ${problems.join(", ")}.`,
    );
  }

  // Uniqueness (structural integrity, not referential — referential checks live in doctor).
  const state = o as unknown as ProjectState;
  uniqueIds(state.workItems, "workItems", problems);
  uniqueIds(state.decisions, "decisions", problems);
  uniqueIds(state.assumptions, "assumptions", problems);
  uniqueIds(state.risks, "risks", problems);
  if (problems.length > 0) {
    throw new StateValidationError(`Structural problems in project.json: ${problems.join(", ")}.`);
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: state.projectId,
    displayName: state.displayName,
    phase: state.phase,
    health: state.health,
    nextAction: state.nextAction,
    activeWorkItemId: state.activeWorkItemId,
    sequences: state.sequences as Sequences,
    workItems: state.workItems as WorkItem[],
    decisions: state.decisions as Decision[],
    assumptions: state.assumptions as Assumption[],
    risks: state.risks as Risk[],
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    revision: state.revision,
  };
}

// --- Raw read / canonical write ---

export interface RawState {
  version: unknown;
  raw: unknown;
  bytes: string;
}

/** Read and parse project.json without schema validation (for migration and doctor). */
export async function readRawState(root: string): Promise<RawState> {
  const paths = statePaths(root);
  if (!existsSync(paths.projectJson)) {
    throw new StateNotFoundError(`No NewFang state at ${paths.projectJson}. Run /newfang init.`);
  }
  let bytes: string;
  try {
    bytes = await readFile(paths.projectJson, "utf8");
  } catch (error) {
    throw new StateValidationError(`Cannot read ${paths.projectJson}: ${(error as Error).message}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(bytes);
  } catch {
    throw new StateValidationError(`Malformed JSON in ${paths.projectJson}. Fix or reinitialize.`);
  }
  const version =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>).schemaVersion : undefined;
  return { version, raw, bytes };
}

/** Atomically write canonical project.json only (no event, no view). Used by init/update/migration. */
export async function writeCanonical(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  await atomicWriteFile(paths.projectJson, serializeState(state));
}

/** Write a timestamped backup of the current project.json bytes. Returns the backup path. */
export async function backupProjectJson(
  root: string,
  bytes: string,
  fromVersion: number,
  timestamp?: string,
): Promise<string> {
  const paths = statePaths(root);
  await mkdir(paths.backupsDir, { recursive: true });
  const ts = (timestamp ?? new Date().toISOString()).replace(/[:.]/g, "-");
  const dest = `${paths.backupsDir}/project.json.v${fromVersion}.${ts}`;
  await writeFile(dest, bytes, "utf8");
  return dest;
}

export async function appendEvent(root: string, event: NewfangEvent): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  const line = `${JSON.stringify({ ...event, ts: event.ts ?? new Date().toISOString() })}\n`;
  await appendFile(paths.eventsJsonl, line, "utf8");
}

export async function writeStatusView(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.viewsDir, { recursive: true });
  await atomicWriteFile(paths.statusView, renderStatusView(state));
}

// --- Load / init / update ---

/** Load and validate canonical v2 state. v1 -> MigrationRequiredError; other -> UnknownSchemaVersionError. */
export async function loadState(root: string): Promise<ProjectState> {
  const { version, raw } = await readRawState(root);
  if (version === SCHEMA_VERSION) return validateProjectState(raw);
  if (version === 1) throw new MigrationRequiredError(1, SCHEMA_VERSION);
  throw new UnknownSchemaVersionError(version);
}

export interface InitStateInput {
  displayName: string;
  now?: string;
  projectId?: string;
}

export async function initState(root: string, input: InitStateInput): Promise<ProjectState> {
  const paths = statePaths(root);
  if (existsSync(paths.projectJson)) {
    throw new StateExistsError(
      `NewFang is already initialized at ${paths.projectJson}. Refusing to overwrite.`,
    );
  }
  await mkdir(paths.receiptsDir, { recursive: true });
  await mkdir(paths.viewsDir, { recursive: true });

  const state = createInitialState({
    displayName: input.displayName,
    now: input.now,
    projectId: input.projectId,
  });

  await writeCanonical(root, state);
  await appendEvent(root, {
    type: "project_initialized",
    projectId: state.projectId,
    revision: state.revision,
  });
  await writeStatusView(root, state);
  return state;
}

/**
 * Immutable update. The reducer receives a deep-frozen clone of current state (it must not mutate it)
 * and returns a complete candidate. Identity fields (schemaVersion, projectId, createdAt) and
 * store-owned fields (revision, updatedAt) are enforced by the store. Validation happens before the
 * canonical write; a rejected update leaves canonical and prior in-memory state untouched.
 */
export type EventOrBuilder = NewfangEvent | ((next: ProjectState) => NewfangEvent);

export async function updateState(
  root: string,
  reducer: (current: Readonly<ProjectState>) => ProjectState,
  event?: EventOrBuilder,
): Promise<ProjectState> {
  const current = await loadState(root);
  const frozenInput = deepFreeze(structuredClone(current));
  const candidate = reducer(frozenInput);

  const next: ProjectState = {
    ...candidate,
    schemaVersion: SCHEMA_VERSION,
    projectId: current.projectId,
    createdAt: current.createdAt,
    revision: current.revision + 1,
    updatedAt: new Date().toISOString(),
  };

  const validated = validateProjectState(next);

  await writeCanonical(root, validated);
  if (event) {
    const evt = typeof event === "function" ? event(validated) : event;
    await appendEvent(root, { ...evt, revision: validated.revision });
  }
  await writeStatusView(root, validated);
  return validated;
}
