// Bounded repository observation for the focus capsule.
//
// Reuses the delivery inspector's read-only git seam: the runner refuses any argument vector that is
// not a read-only inspection, runs without a shell, and cannot take the index lock. Only branch,
// HEAD, and a changed-file count are collected — no diffs, no file contents — because this runs
// before every agent turn.

import {
  createGitRunner,
  parseStatusPorcelainV2,
  DEFAULT_INSPECTION_LIMITS,
} from "../delivery-inspector/index.ts";
import type { RepositoryObservation } from "./inject.ts";

/** Observe the repository. Never throws: an unavailable git degrades to `isGitRepository: false`. */
export async function observeRepository(root: string): Promise<RepositoryObservation> {
  const runGit = createGitRunner(root, DEFAULT_INSPECTION_LIMITS);
  const inside = await runGit(["rev-parse", "--is-inside-work-tree"]);
  if (!inside.ok || inside.stdout.trim() !== "true") return { isGitRepository: false };

  const status = await runGit([
    "status",
    "--porcelain=v2",
    "--branch",
    "--untracked-files=all",
    "-z",
  ]);
  if (!status.ok) return { isGitRepository: true };

  const parsed = parseStatusPorcelainV2(status.stdout);
  return {
    isGitRepository: true,
    ...(parsed.branch ? { branch: parsed.branch } : {}),
    ...(parsed.head ? { head: parsed.head } : {}),
    changedFileCount: parsed.entries.length,
  };
}
