// Shared command-result shape. Command logic returns data; the Pi adapter renders it.

import type { ProjectState } from "../domain/types.ts";

export type ResultLevel = "info" | "warning" | "error";

export interface CommandResult {
  level: ResultLevel;
  lines: string[];
  /** Present when the command produced or read canonical state. */
  state?: ProjectState;
}
