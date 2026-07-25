// Filesystem layout for canonical `.newfang/` state. Pure path construction.

import { join } from "node:path";

export const NEWFANG_DIR = ".newfang";

export interface StatePaths {
  dir: string;
  projectJson: string;
  eventsJsonl: string;
  receiptsDir: string;
  /** NewFang-owned staging area for receipts under construction (atomically promoted, then gone). */
  receiptsTempDir: string;
  backupsDir: string;
  viewsDir: string;
  statusView: string;
  intakesDir: string;
  orientationsDir: string;
  briefsDir: string;
  projectBrief: string;
}

/** Artifact directory for one intake, e.g. `.newfang/intakes/INT-1/`. */
export function intakePaths(root: string, intakeId: string) {
  const dir = join(root, NEWFANG_DIR, "intakes", intakeId);
  return {
    dir,
    manifest: join(dir, "manifest.json"),
    source: join(dir, "source.md"),
    draftsDir: join(dir, "drafts"),
    understandingsDir: join(dir, "understandings"),
    reviews: join(dir, "reviews.jsonl"),
  };
}

/** Zero-padded revision file name, e.g. 1 -> "0001". */
export function revisionSlug(revision: number): string {
  return String(revision).padStart(4, "0");
}

/** Artifact paths for one draft revision — never overwritten once written. */
export function revisionPaths(root: string, intakeId: string, revision: number) {
  const base = intakePaths(root, intakeId);
  const slug = revisionSlug(revision);
  return {
    draft: join(base.draftsDir, `${slug}.json`),
    understanding: join(base.understandingsDir, `${slug}.md`),
  };
}

/**
 * Artifact directory for one verification receipt, e.g. `.newfang/receipts/RCP-1/`.
 * Written once and never modified; `.newfang/receipts/.tmp/<token>/` is the staging directory that is
 * atomically renamed into place.
 */
export function receiptPaths(root: string, receiptId: string) {
  const dir = join(root, NEWFANG_DIR, "receipts", receiptId);
  return {
    dir,
    manifest: join(dir, "manifest.json"),
    stdout: join(dir, "stdout.txt"),
    stderr: join(dir, "stderr.txt"),
    /** Repository-relative reference stored in canonical state. */
    artifactRef: `receipts/${receiptId}`,
  };
}

/** Artifact directory for one orientation, e.g. `.newfang/orientations/ORI-1/`. */
export function orientationPaths(root: string, orientationId: string) {
  const dir = join(root, NEWFANG_DIR, "orientations", orientationId);
  return {
    dir,
    orientation: join(dir, "orientation.json"),
    view: join(dir, "ORIENTATION.md"),
  };
}

export function statePaths(root: string): StatePaths {
  const dir = join(root, NEWFANG_DIR);
  return {
    dir,
    projectJson: join(dir, "project.json"),
    eventsJsonl: join(dir, "events.jsonl"),
    receiptsDir: join(dir, "receipts"),
    receiptsTempDir: join(dir, "receipts", ".tmp"),
    backupsDir: join(dir, "backups"),
    viewsDir: join(dir, "views"),
    statusView: join(dir, "views", "PROJECT_STATUS.md"),
    intakesDir: join(dir, "intakes"),
    orientationsDir: join(dir, "orientations"),
    briefsDir: join(dir, "briefs"),
    projectBrief: join(dir, "briefs", "PROJECT_BRIEF.md"),
  };
}
