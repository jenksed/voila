// Shared mapping from state-load errors to command results.

import {
  MigrationRequiredError,
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "../state/errors.ts";
import { LegacyStateMigrationRequiredError, StateDirectoryConflictError } from "../state/legacy.ts";
import type { CommandResult } from "./types.ts";

export function loadErrorResult(error: unknown): CommandResult {
  if (error instanceof StateDirectoryConflictError) {
    return { level: "error", lines: error.message.split("\n") };
  }
  if (error instanceof LegacyStateMigrationRequiredError) {
    return {
      level: "warning",
      lines: [
        "Legacy .newfang/ state found — this project predates the Voila rename.",
        "Run /voila migrate to inspect the transition (read-only),",
        "then /voila migrate --apply to migrate it to .voila/.",
      ],
    };
  }
  if (error instanceof StateNotFoundError) {
    return {
      level: "warning",
      lines: ["No Voila project here. Run /voila init to create one."],
    };
  }
  if (error instanceof MigrationRequiredError) {
    return { level: "warning", lines: [error.message] };
  }
  if (error instanceof UnknownSchemaVersionError || error instanceof StateValidationError) {
    return { level: "error", lines: [`Voila state problem: ${error.message}`] };
  }
  throw error;
}
