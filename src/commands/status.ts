// `/newfang status` logic. Pure of Pi; testable with a temp directory.

import { loadState } from "../state/store.ts";
import { statusReportLines } from "../domain/status.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

/** Read and display canonical state. Distinguishes uninitialized, migration-required, and malformed. */
export async function runStatus(root: string): Promise<CommandResult> {
  try {
    const state = await loadState(root);
    return { level: "info", lines: statusReportLines(state), state };
  } catch (error) {
    return loadErrorResult(error);
  }
}
