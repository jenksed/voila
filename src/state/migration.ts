// Migration orchestration (I/O): inspect and apply explicit schema migrations to the current version.
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
import { migrateToCurrent, migrationPlan, type MigrationAddition } from "../domain/migrate.ts";
import { SCHEMA_VERSION } from "../domain/types.ts";

export type MigrationStatus = "noop" | "inspectable" | "migrated";

export interface MigrationReport {
  status: MigrationStatus;
  fromVersion: number;
  toVersion: number;
  steps: Array<{ from: number; to: number }>;
  additions: MigrationAddition[];
  backupLocation: string | null;
  safe: boolean;
  detail: string;
}

/**
 * Inspect (apply=false) or apply (apply=true) the migration chain to the current schema version.
 * - Current version: safe no-op.
 * - Known older version: validated at each step, then reported or migrated with a timestamped backup.
 * - Unknown version: rejected.
 * A failed migration leaves the canonical bytes intact (all validation precedes any write).
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
      steps: [],
      additions: [],
      backupLocation: null,
      safe: true,
      detail: "Already at the current schema version; nothing to migrate.",
    };
  }
  if (typeof version !== "number") throw new UnknownSchemaVersionError(version);
  const plan = migrationPlan(version);
  if (!plan) throw new UnknownSchemaVersionError(version);

  const fromVersion = version;

  // Build and validate the complete candidate before touching anything on disk.
  let validated;
  try {
    const nowIso = new Date().toISOString();
    const candidate = migrateToCurrent(raw, fromVersion);
    validated = validateProjectState({
      ...candidate,
      updatedAt: nowIso,
      revision: candidate.revision + 1,
    });
  } catch (error) {
    throw new StateValidationError(
      `Source v${fromVersion} state is invalid: ${(error as Error).message}`,
    );
  }

  if (!opts.apply) {
    return {
      status: "inspectable",
      fromVersion,
      toVersion,
      steps: plan.steps,
      additions: plan.additions,
      backupLocation: `${statePaths(root).backupsDir}/project.json.v${fromVersion}.<timestamp>`,
      safe: true,
      detail: `Migration v${fromVersion} -> v${toVersion} is supported. Re-run with --apply to migrate.`,
    };
  }

  // Apply: backup original bytes, atomic canonical replace, then event + view.
  const backup = await backupProjectJson(root, bytes, fromVersion);
  await writeCanonical(root, validated);
  await appendEvent(root, {
    type: "schema_migrated",
    from: fromVersion,
    to: toVersion,
    revision: validated.revision,
  });
  await writeStatusView(root, validated);

  return {
    status: "migrated",
    fromVersion,
    toVersion,
    steps: plan.steps,
    additions: plan.additions,
    backupLocation: backup,
    safe: true,
    detail: `Migrated v${fromVersion} -> v${toVersion}. Backup written to ${backup}.`,
  };
}
