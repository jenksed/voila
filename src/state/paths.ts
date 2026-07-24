// Filesystem layout for canonical `.newfang/` state. Pure path construction.

import { join } from "node:path";

export const NEWFANG_DIR = ".newfang";

export interface StatePaths {
  dir: string;
  projectJson: string;
  eventsJsonl: string;
  receiptsDir: string;
  viewsDir: string;
  statusView: string;
}

export function statePaths(root: string): StatePaths {
  const dir = join(root, NEWFANG_DIR);
  return {
    dir,
    projectJson: join(dir, "project.json"),
    eventsJsonl: join(dir, "events.jsonl"),
    receiptsDir: join(dir, "receipts"),
    viewsDir: join(dir, "views"),
    statusView: join(dir, "views", "PROJECT_STATUS.md"),
  };
}
