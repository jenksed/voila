// `/newfang status` logic. Pure of Pi; testable with a temp directory.

import { loadState } from "../state/store.ts";
import { statusReportLines } from "../domain/status.ts";
import { SchemaVersionError, StateNotFoundError, StateValidationError } from "../state/errors.ts";
import type { CommandResult } from "./types.ts";

/** Read and display canonical state. Distinguishes "not initialized" from "malformed/incompatible". */
export async function runStatus(root: string): Promise<CommandResult> {
  try {
    const state = await loadState(root);
    return { level: "info", lines: statusReportLines(state), state };
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      return {
        level: "warning",
        lines: ["No NewFang project here. Run /newfang init to create one."],
      };
    }
    if (error instanceof SchemaVersionError || error instanceof StateValidationError) {
      return { level: "error", lines: [`NewFang state problem: ${error.message}`] };
    }
    throw error;
  }
}
