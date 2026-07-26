// Shared mapping from state-load errors to command results.

import {
  MigrationRequiredError,
  StateNotFoundError,
  StateValidationError,
  UnknownSchemaVersionError,
} from "../state/errors.ts";
import type { CommandResult } from "./types.ts";

export function loadErrorResult(error: unknown): CommandResult {
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
