// Canonical `.newfang/` state store: init, load, validate, atomic update,
// append-only events, and generated view. Pure Node I/O — no Pi.
//
// Invariants (ADR-0003):
// - project.json is the authoritative snapshot; writes are atomic (temp + rename).
// - A successful canonical write happens BEFORE the generated view / UI.
// - events.jsonl is append-only history and never authoritative current state.
// - Incompatible schema versions are surfaced, never silently rewritten.

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import type { ProjectState } from "../domain/types.ts";
import { HEALTHS, PHASES, SCHEMA_VERSION } from "../domain/types.ts";
import { createInitialState } from "../domain/defaults.ts";
import { renderStatusView } from "../domain/status.ts";
import { statePaths } from "./paths.ts";
import {
  SchemaVersionError,
  StateExistsError,
  StateNotFoundError,
  StateValidationError,
} from "./errors.ts";

export interface NewfangEvent {
  type: string;
  ts?: string;
  [key: string]: unknown;
}

function serializeState(state: ProjectState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

/** Write `contents` to `path` atomically: temp file, then rename over the target. */
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

/** Validate an untrusted parsed value into a ProjectState, or throw an actionable error. */
export function validateProjectState(raw: unknown): ProjectState {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new StateValidationError("project.json must be a JSON object.");
  }
  const o = raw as Record<string, unknown>;

  if (typeof o.schemaVersion !== "number") {
    throw new StateValidationError("project.json is missing a numeric 'schemaVersion'.");
  }
  if (o.schemaVersion !== SCHEMA_VERSION) {
    throw new SchemaVersionError(o.schemaVersion, SCHEMA_VERSION);
  }

  const problems: string[] = [];
  for (const key of ["projectId", "displayName", "nextAction", "createdAt", "updatedAt"]) {
    if (typeof o[key] !== "string" || (o[key] as string).length === 0) problems.push(key);
  }
  if (typeof o.phase !== "string" || !(PHASES as readonly string[]).includes(o.phase)) {
    problems.push("phase");
  }
  if (typeof o.health !== "string" || !(HEALTHS as readonly string[]).includes(o.health)) {
    problems.push("health");
  }
  if (typeof o.revision !== "number" || !Number.isInteger(o.revision) || o.revision < 1) {
    problems.push("revision");
  }
  if (problems.length > 0) {
    throw new StateValidationError(
      `Invalid or missing fields in project.json: ${problems.join(", ")}.`,
    );
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    projectId: o.projectId as string,
    displayName: o.displayName as string,
    phase: o.phase as ProjectState["phase"],
    health: o.health as ProjectState["health"],
    nextAction: o.nextAction as string,
    createdAt: o.createdAt as string,
    updatedAt: o.updatedAt as string,
    revision: o.revision as number,
  };
}

/** Append one JSON line to the append-only event history. */
export async function appendEvent(root: string, event: NewfangEvent): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.dir, { recursive: true });
  const line = `${JSON.stringify({ ...event, ts: event.ts ?? new Date().toISOString() })}\n`;
  await appendFile(paths.eventsJsonl, line, "utf8");
}

/** Regenerate the human-readable status view from canonical state. */
export async function writeStatusView(root: string, state: ProjectState): Promise<void> {
  const paths = statePaths(root);
  await mkdir(paths.viewsDir, { recursive: true });
  await atomicWriteFile(paths.statusView, renderStatusView(state));
}

/** Load and validate canonical state, or throw a typed error. */
export async function loadState(root: string): Promise<ProjectState> {
  const paths = statePaths(root);
  if (!existsSync(paths.projectJson)) {
    throw new StateNotFoundError(
      `No NewFang state at ${paths.projectJson}. Run /newfang init to create it.`,
    );
  }
  let text: string;
  try {
    text = await readFile(paths.projectJson, "utf8");
  } catch (error) {
    throw new StateValidationError(`Cannot read ${paths.projectJson}: ${(error as Error).message}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new StateValidationError(
      `Malformed JSON in ${paths.projectJson}. Fix it or reinitialize the project.`,
    );
  }
  return validateProjectState(parsed);
}

export interface InitStateInput {
  displayName: string;
  now?: string;
  projectId?: string;
}

/** Create fresh canonical state. Refuses to overwrite existing state. */
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

  // Canonical write first, then history, then the generated projection.
  await atomicWriteFile(paths.projectJson, serializeState(state));
  await appendEvent(root, {
    type: "project_initialized",
    projectId: state.projectId,
    revision: state.revision,
  });
  await writeStatusView(root, state);
  return state;
}

/**
 * Apply a mutation atomically: load current, mutate a copy, bump revision monotonically,
 * refresh `updatedAt`, validate, write canonical state, then append an event and regenerate
 * the view. Identity fields (schemaVersion, projectId, createdAt) are preserved.
 */
export async function updateState(
  root: string,
  mutate: (draft: ProjectState) => void,
  event?: NewfangEvent,
): Promise<ProjectState> {
  const current = await loadState(root);
  const next: ProjectState = { ...current };
  mutate(next);

  next.schemaVersion = SCHEMA_VERSION;
  next.projectId = current.projectId;
  next.createdAt = current.createdAt;
  next.revision = current.revision + 1;
  next.updatedAt = new Date().toISOString();

  const validated = validateProjectState(next);

  // Canonical write first; only then history + view (ADR-0003 ordering).
  await atomicWriteFile(statePaths(root).projectJson, serializeState(validated));
  if (event) {
    await appendEvent(root, { ...event, revision: validated.revision });
  }
  await writeStatusView(root, validated);
  return validated;
}
