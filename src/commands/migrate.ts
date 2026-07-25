// `/newfang migrate` logic. Inspect by default; apply only with { apply: true }.

import { runMigration } from "../state/migration.ts";
import {
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "../state/errors.ts";
import type { CommandResult } from "./types.ts";

export async function runMigrate(root: string, apply: boolean): Promise<CommandResult> {
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
    if (!apply) lines.push("Run /newfang migrate --apply to apply the migration.");
    return { level: "info", lines };
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      return { level: "warning", lines: ["No NewFang project here. Run /newfang init."] };
    }
    if (error instanceof UnknownSchemaVersionError || error instanceof StateValidationError) {
      return { level: "error", lines: [`Cannot migrate: ${(error as Error).message}`] };
    }
    throw error;
  }
}
