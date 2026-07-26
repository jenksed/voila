// `/voila migrate` logic. Inspect by default; apply only with { apply: true }.
//
// Two distinct transitions live behind this one command, and they are reported separately:
//   1. Legacy state directory: `.newfang/` -> `.voila/` (a filesystem move; no schema change).
//   2. Domain schema: an older `schemaVersion` -> the current one.
// A legacy project may need both. The directory move runs first, because the schema migration
// reads and writes through `.voila/`.

import { runMigration } from "../state/migration.ts";
import {
  applyLegacyMigration,
  inspectLegacyMigration,
  type LegacyMigrationReport,
} from "../state/legacy-migration.ts";
import {
  LegacyMigrationFailedError,
  StateDirectoryConflictError,
  stateDirectoryStatus,
} from "../state/legacy.ts";
import {
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "../state/errors.ts";
import type { CommandResult } from "./types.ts";

export async function runMigrate(root: string, apply: boolean): Promise<CommandResult> {
  const status = stateDirectoryStatus(root);

  // Both directories present: never choose one. This is a hard failure, not a warning.
  if (status.kind === "conflict") {
    return {
      level: "error",
      lines: [
        "Refusing to migrate: both state directories exist.",
        `  legacy:  ${status.legacyDir}`,
        `  current: ${status.currentDir}`,
        "Voila will not choose between them, because either one may hold the real project history.",
        "Resolve this manually: keep the directory with the real history, move the other aside,",
        "then run /voila doctor.",
      ],
    };
  }

  if (status.kind === "legacy") {
    try {
      const report = apply ? await applyLegacyMigration(root) : await inspectLegacyMigration(root);
      return legacyResult(report, apply);
    } catch (error) {
      if (
        error instanceof StateDirectoryConflictError ||
        error instanceof LegacyMigrationFailedError
      ) {
        return { level: "error", lines: error.message.split("\n") };
      }
      if (error instanceof StateValidationError) {
        return { level: "error", lines: [`Cannot migrate legacy state: ${error.message}`] };
      }
      throw error;
    }
  }

  try {
    const report = await runMigration(root, { apply });

    if (report.status === "noop") {
      return {
        level: "info",
        lines: [`Schema is already v${report.toVersion}. Nothing to migrate.`],
      };
    }

    const header = apply
      ? `Migrated schema v${report.fromVersion} -> v${report.toVersion}.`
      : `Migration available: v${report.fromVersion} -> v${report.toVersion}.`;
    const lines = [
      header,
      "Adds:",
      ...report.additions.map((a) => `  - ${a.name}: ${a.detail}`),
      `Backup location: ${report.backupLocation}`,
      `Safe and supported: ${report.safe ? "yes" : "no"}`,
    ];
    if (!apply) lines.push("Run /voila migrate --apply to apply the migration.");
    return { level: "info", lines };
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      return { level: "warning", lines: ["No Voila project here. Run /voila init."] };
    }
    if (error instanceof UnknownSchemaVersionError || error instanceof StateValidationError) {
      return { level: "error", lines: [`Cannot migrate: ${(error as Error).message}`] };
    }
    throw error;
  }
}

/** Render a legacy state-directory migration report. */
function legacyResult(report: LegacyMigrationReport, apply: boolean): CommandResult {
  if (report.status === "noop") {
    return { level: "info", lines: [report.detail] };
  }

  const lines = apply
    ? [`Migrated legacy state: ${report.from}/ -> ${report.to}/.`]
    : [`Legacy state migration available: ${report.from}/ -> ${report.to}/.`];

  lines.push(
    `  Files: ${report.fileCount} (${report.immutableCount} immutable artifact file(s))`,
    `  Schema version found: v${report.schemaVersion}`,
    "  Preserved byte-for-byte: intakes/, orientations/, receipts/, events.jsonl",
  );

  if (report.metadataUpdates.length > 0) {
    lines.push(
      `  Current metadata rebranded: ${report.metadataUpdates.join(", ")}`,
      "  Decisions, assumptions, risks, claims, and work items are NOT rewritten — they are records.",
    );
  }

  if (apply) {
    lines.push("  Every file hash was re-verified after the move.");
    if (report.schemaMigrationPending) {
      lines.push(
        "",
        `Schema is still v${report.schemaVersion}. Run /voila migrate again to inspect the schema migration.`,
      );
    }
  } else {
    lines.push(
      "",
      "This inspection wrote nothing. Run /voila migrate --apply to perform the migration.",
    );
  }

  return { level: "info", lines };
}
