// One-way `.newfang/` -> `.voila/` state-directory migration.
//
// This is a *filesystem* migration, deliberately separate from the domain schema migration in
// `migration.ts`. A directory rename changes no serialized state shape, so it does not bump
// SCHEMA_VERSION (see docs/migrations/NEWFANG_TO_VOILA.md).
//
// Safety properties, in order:
//   1. The complete source tree is hashed and structurally validated BEFORE anything moves.
//   2. The destination must not exist.
//   3. The move is a single atomic `rename` of siblings in the same directory — never a recursive
//      copy followed by a delete, and never a per-file loop that can half-finish.
//   4. The moved tree is re-hashed and re-validated; ANY difference rolls back to `.newfang/`.
//   5. Only then is one honest event appended and the generated view regenerated.
//
// Immutable artifacts (intakes, orientations, receipts) are never opened for writing. Their bytes
// are read for hashing and compared; the migration has no code path that edits them.

import { existsSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { join } from "node:path";
import type { ProjectState } from "../domain/types.ts";
import { SCHEMA_VERSION } from "../domain/types.ts";
import {
  LEGACY_STATE_DIR,
  LegacyMigrationFailedError,
  StateDirectoryConflictError,
  digestDifferences,
  hashStateTree,
  stateDirectoryStatus,
  type TreeDigest,
} from "./legacy.ts";
import { VOILA_DIR, statePaths } from "./paths.ts";
import { StateValidationError } from "./errors.ts";
import { writeProjectBrief } from "./intake-store.ts";
import { readRawState, updateState, validateProjectState } from "./store.ts";

export type LegacyMigrationStatus = "noop" | "inspectable" | "migrated";

export interface LegacyMigrationReport {
  status: LegacyMigrationStatus;
  /** Directory name being migrated from, e.g. `.newfang`. */
  from: string;
  /** Directory name being migrated to, e.g. `.voila`. */
  to: string;
  /** Total regular files in the state tree. */
  fileCount: number;
  /** Files under intakes/, orientations/, and receipts/ whose bytes must not change. */
  immutableCount: number;
  /** Schema version found in the source state. */
  schemaVersion: number;
  /** Whether a schema migration is still required after the directory move. */
  schemaMigrationPending: boolean;
  /** Canonical metadata fields rebranded, e.g. `displayName`. Empty when none named the old brand. */
  metadataUpdates: string[];
  detail: string;
}

/** Bounded, current-truth-only rebrand. Never applied to evidence or historical records. */
function rebrandText(value: string): string {
  return value
    .replace(/\.newfang\b/g, ".voila")
    .replace(/newfang_/g, "voila_")
    .replace(/\/newfang\b/g, "/voila")
    .replace(/NewFang/g, "Voila")
    .replace(/Newfang/g, "Voila")
    .replace(/NEWFANG/g, "VOILA")
    .replace(/\bnewfang\b/g, "voila");
}

/**
 * Fields the migration may rewrite. These are mutable current-guidance fields the product
 * regenerates constantly.
 *
 * Deliberately EXCLUDED, because rewriting them would falsify a record:
 *   - claim statements, covered criteria, and known limitations (bound to receipt evidence),
 *   - work-item titles/descriptions/acceptance criteria (covered by those claims),
 *   - decisions, assumptions, and risks (dated records; change them through their own operations),
 *   - events.jsonl (append-only history).
 */
const REBRANDABLE_FIELDS = ["displayName", "nextAction", "nextActionRationale"] as const;

function rebrandMetadata(state: ProjectState): { next: ProjectState; changed: string[] } {
  const next = { ...state };
  const changed: string[] = [];
  for (const field of REBRANDABLE_FIELDS) {
    const value = state[field];
    if (typeof value !== "string") continue;
    const rebranded = rebrandText(value);
    if (rebranded !== value) {
      (next as Record<string, unknown>)[field] = rebranded;
      changed.push(field);
    }
  }
  return { next, changed };
}

/**
 * Structurally validate a state directory without demanding the current schema version. A legacy
 * project may legitimately be one or more schema versions behind; the directory move must not
 * depend on the schema migration having happened first.
 */
async function validateStateTree(root: string): Promise<{ schemaVersion: number }> {
  const { version, raw } = await readRawState(root);
  if (typeof version !== "number") {
    throw new StateValidationError(
      `project.json has no numeric 'schemaVersion' (found ${String(version)}).`,
    );
  }
  // Only a current-version state can be fully validated by this build; older versions are checked
  // structurally here and fully validated by the schema migration.
  if (version === SCHEMA_VERSION) validateProjectState(raw);
  return { schemaVersion: version };
}

/**
 * Read a legacy state tree and describe the transition. Writes nothing: `/voila migrate` without
 * `--apply` is read-only, and re-running it is always safe.
 */
export async function inspectLegacyMigration(root: string): Promise<LegacyMigrationReport> {
  const status = stateDirectoryStatus(root);
  if (status.kind === "conflict") {
    throw new StateDirectoryConflictError(status.currentDir, status.legacyDir);
  }
  if (status.kind !== "legacy") {
    return {
      status: "noop",
      from: LEGACY_STATE_DIR,
      to: VOILA_DIR,
      fileCount: 0,
      immutableCount: 0,
      schemaVersion: SCHEMA_VERSION,
      schemaMigrationPending: false,
      metadataUpdates: [],
      detail: `No ${LEGACY_STATE_DIR}/ directory here; nothing to migrate.`,
    };
  }

  const digest = await hashStateTree(status.legacyDir);
  const { schemaVersion } = await validateLegacySource(status.legacyDir);
  const preview = await previewMetadataUpdates(status.legacyDir, schemaVersion);

  return {
    status: "inspectable",
    from: LEGACY_STATE_DIR,
    to: VOILA_DIR,
    fileCount: digest.files.size,
    immutableCount: digest.immutableCount,
    schemaVersion,
    schemaMigrationPending: schemaVersion !== SCHEMA_VERSION,
    metadataUpdates: preview,
    detail:
      `${digest.files.size} file(s) move from ${LEGACY_STATE_DIR}/ to ${VOILA_DIR}/, ` +
      `including ${digest.immutableCount} immutable artifact file(s) that must keep identical bytes.`,
  };
}

/**
 * Move `.newfang/` to `.voila/`, verify byte-for-byte, then record the transition.
 * Rolls back to `.newfang/` if post-move validation fails for any reason.
 */
export async function applyLegacyMigration(root: string): Promise<LegacyMigrationReport> {
  const status = stateDirectoryStatus(root);
  if (status.kind === "conflict") {
    throw new StateDirectoryConflictError(status.currentDir, status.legacyDir);
  }
  if (status.kind !== "legacy") return inspectLegacyMigration(root);

  // 1. Validate the complete source tree before mutating anything.
  const before = await hashStateTree(status.legacyDir);
  const { schemaVersion } = await validateLegacySource(status.legacyDir);

  // 2. Never overwrite an existing destination (re-checked immediately before the move).
  if (existsSync(status.currentDir)) {
    throw new StateDirectoryConflictError(status.currentDir, status.legacyDir);
  }

  // 3. Atomic same-directory rename. Siblings share a filesystem, so EXDEV cannot apply here.
  await rename(status.legacyDir, status.currentDir);

  // 4. Post-move validation, with rollback on any failure.
  try {
    await verifyMigratedTree(root, status.currentDir, before);
  } catch (error) {
    await rollbackMigration(status.currentDir, status.legacyDir, error);
    throw error instanceof LegacyMigrationFailedError
      ? error
      : new LegacyMigrationFailedError(
          `Post-move validation failed and the state was rolled back to ${LEGACY_STATE_DIR}/: ` +
            `${(error as Error).message}`,
        );
  }

  // 5. Record the transition. An older-schema state is left for the schema migration to finish,
  //    which owns its own event and view regeneration.
  let metadataUpdates: string[] = [];
  if (schemaVersion === SCHEMA_VERSION) {
    const migrated = await updateState(
      root,
      (current) => {
        const { next, changed } = rebrandMetadata(current);
        metadataUpdates = changed;
        return next;
      },
      {
        type: "state_directory_migrated",
        from: LEGACY_STATE_DIR,
        to: VOILA_DIR,
        fileCount: before.files.size,
        immutableFileCount: before.immutableCount,
      },
    );
    // `updateState` regenerates PROJECT_STATUS.md. The project brief is only written on demand,
    // so a migrated project would otherwise keep a brief generated under the old name.
    if (existsSync(statePaths(root).projectBrief)) {
      await writeProjectBrief(root, migrated);
    }
  }

  return {
    status: "migrated",
    from: LEGACY_STATE_DIR,
    to: VOILA_DIR,
    fileCount: before.files.size,
    immutableCount: before.immutableCount,
    schemaVersion,
    schemaMigrationPending: schemaVersion !== SCHEMA_VERSION,
    metadataUpdates,
    detail:
      `Moved ${before.files.size} file(s) to ${VOILA_DIR}/ and verified every file hash, ` +
      `including ${before.immutableCount} immutable artifact file(s).`,
  };
}

/**
 * Post-move gate: the destination must hash identically to the source, and its canonical state must
 * still read. Exported so the rollback contract can be exercised against the real implementation
 * rather than a re-implementation in a test.
 */
export async function verifyMigratedTree(
  root: string,
  currentDir: string,
  before: TreeDigest,
): Promise<void> {
  const after: TreeDigest = await hashStateTree(currentDir);
  const differences = digestDifferences(before, after);
  if (differences.length > 0) {
    throw new LegacyMigrationFailedError(
      `State tree changed during the move: ${differences.slice(0, 5).join("; ")}`,
    );
  }
  await validateStateTree(root);
}

/** Restore the legacy directory after a failed migration. A failed rollback is reported loudly. */
export async function rollbackMigration(
  currentDir: string,
  legacyDir: string,
  cause: unknown,
): Promise<void> {
  try {
    await rename(currentDir, legacyDir);
  } catch (rollbackError) {
    throw new LegacyMigrationFailedError(
      `Migration failed (${(cause as Error).message}) AND the rollback failed ` +
        `(${(rollbackError as Error).message}). The state tree is at ${currentDir}; ` +
        `move it back to ${legacyDir} manually before running any Voila command.`,
    );
  }
}

/**
 * Validate a legacy tree in place by reading its project.json directly. `readRawState` resolves
 * `.voila/`, which does not exist yet, so the legacy source is checked against its own path.
 */
async function validateLegacySource(legacyDir: string): Promise<{ schemaVersion: number }> {
  const projectJson = join(legacyDir, "project.json");
  if (!existsSync(projectJson)) {
    throw new StateValidationError(
      `${LEGACY_STATE_DIR}/ exists but has no project.json. There is no canonical state to migrate; ` +
        `move the directory aside and run /voila init.`,
    );
  }
  const raw = await readLegacyProjectJson(projectJson);
  const version = (raw as Record<string, unknown>).schemaVersion;
  if (typeof version !== "number") {
    throw new StateValidationError(
      `${LEGACY_STATE_DIR}/project.json has no numeric 'schemaVersion' (found ${String(version)}).`,
    );
  }
  if (version === SCHEMA_VERSION) validateProjectState(raw);
  return { schemaVersion: version };
}

async function readLegacyProjectJson(path: string): Promise<unknown> {
  let bytes: string;
  try {
    bytes = await readFile(path, "utf8");
  } catch (error) {
    throw new StateValidationError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  try {
    return JSON.parse(bytes);
  } catch {
    throw new StateValidationError(`Malformed JSON in ${path}. Fix it before migrating.`);
  }
}

/** What `rebrandMetadata` would change, without writing. */
async function previewMetadataUpdates(legacyDir: string, schemaVersion: number): Promise<string[]> {
  if (schemaVersion !== SCHEMA_VERSION) return [];
  const raw = await readLegacyProjectJson(join(legacyDir, "project.json"));
  const { changed } = rebrandMetadata(validateProjectState(raw));
  return changed;
}
