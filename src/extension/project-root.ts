// One adapter-boundary project-root resolver for commands, tools, events, capsules, and operations.

import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type ProjectRootKind = "git-worktree" | "directory";

export interface ProjectRootResolution {
  root: string;
  kind: ProjectRootKind;
}

export class ProjectRootResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectRootResolutionError";
  }
}

interface ExecFailure extends Error {
  code?: number | string;
  stderr?: string;
}

/**
 * Resolve a canonical Git worktree root. Exit 128 means the canonical cwd is an ordinary non-Git
 * directory; other Git failures are not silently treated as success.
 */
export async function resolveProjectRoot(cwd: string): Promise<ProjectRootResolution> {
  let canonicalCwd: string;
  try {
    canonicalCwd = await realpath(cwd);
  } catch (error) {
    throw new ProjectRootResolutionError(
      `Cannot resolve the current directory: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: canonicalCwd,
      encoding: "utf8",
      maxBuffer: 64 * 1024,
    });
    const reported = stdout.trim();
    if (!reported) {
      throw new ProjectRootResolutionError("Git reported an empty worktree root");
    }
    return { root: await realpath(reported), kind: "git-worktree" };
  } catch (error) {
    if (error instanceof ProjectRootResolutionError) throw error;
    const failure = error as ExecFailure;
    if (failure.code === 128 && /not a git repository/i.test(failure.stderr ?? failure.message)) {
      return { root: canonicalCwd, kind: "directory" };
    }
    throw new ProjectRootResolutionError(
      `Cannot determine the project root: ${failure.message || String(error)}`,
    );
  }
}
