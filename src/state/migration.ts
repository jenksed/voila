// Migration orchestration (I/O): inspect and apply the explicit v1 -> v2 migration.
// No migration ever happens silently; callers must opt in with { apply: true }.

import { statePaths } from "./paths.ts";
import {
  appendEvent,
  backupProjectJson,
  readRawState,
  validateProjectState,
  writeCanonical,
  writeStatusView,
} from "./store.ts";
import { StateValidationError, UnknownSchemaVersionError } from "./errors.ts";
import { validateProjectStateV1 } from "../domain/schema-v1.ts";
import { migrateV1ToV2, migrationAdditions, type MigrationAddition } from "../domain/migrate.ts";
import { SCHEMA_VERSION } from "../domain/types.ts";

export type MigrationStatus = "noop" | "inspectable" | "migrated";

export interface MigrationReport {
  status: MigrationStatus;
  fromVersion: number;
  toVersion: number;
  additions: MigrationAddition[];
  backupLocation: string | null;
  safe: boolean;
  detail: string;
}

/**
 * Inspect (apply=false) or apply (apply=true) the v1 -> v2 migration.
 * - v2 source: safe no-op.
 * - v1 source: validated, then either reported (inspect) or migrated with a timestamped backup.
 * - other versions: rejected.
 * A failed migration leaves the canonical v1 bytes intact (validation precedes any write).
 */
export async function runMigration(
  root: string,
  opts: { apply: boolean },
): Promise<MigrationReport> {
  const toVersion = SCHEMA_VERSION;
  const { version, raw, bytes } = await readRawState(root);

  if (version === toVersion) {
    return {
      status: "noop",
      fromVersion: toVersion,
      toVersion,
      additions: [],
      backupLocation: null,
      safe: true,
      detail: "Already at the current schema version; nothing to migrate.",
    };
  }
  if (version !== 1) {
    throw new UnknownSchemaVersionError(version);
  }

  // Validate the source (throws on malformed v1 before any write).
  let v1;
  try {
    v1 = validateProjectStateV1(raw);
  } catch (error) {
    throw new StateValidationError(`Source v1 state is invalid: ${(error as Error).message}`);
  }

  // Build and validate the complete v2 candidate.
  const nowIso = new Date().toISOString();
  const candidate = { ...migrateV1ToV2(v1), updatedAt: nowIso, revision: v1.revision + 1 };
  const validated = validateProjectState(candidate);

  const additions = migrationAdditions();

  if (!opts.apply) {
    return {
      status: "inspectable",
      fromVersion: 1,
      toVersion,
      additions,
      backupLocation: `${statePaths(root).backupsDir}/project.json.v1.<timestamp>`,
      safe: true,
      detail: "Migration 1 -> 2 is supported. Re-run with --apply to migrate.",
    };
  }

  // Apply: backup original bytes, atomic canonical replace, then event + view.
  const backup = await backupProjectJson(root, bytes, 1, nowIso);
  await writeCanonical(root, validated);
  await appendEvent(root, {
    type: "schema_migrated",
    from: 1,
    to: toVersion,
    revision: validated.revision,
  });
  await writeStatusView(root, validated);

  return {
    status: "migrated",
    fromVersion: 1,
    toVersion,
    additions,
    backupLocation: backup,
    safe: true,
    detail: `Migrated 1 -> ${toVersion}. Backup written to ${backup}.`,
  };
}
