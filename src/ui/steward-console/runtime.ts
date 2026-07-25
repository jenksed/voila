// Read-only runtime context for the console header. Never written to canonical state; failures
// degrade gracefully (fields omitted).

import { execFileSync } from "node:child_process";
import type { RuntimeContext } from "./model.ts";

function git(cwd: string, args: string[]): string | undefined {
  try {
    return execFileSync("git", args, {
      cwd,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

export function getRuntimeContext(cwd: string, piVersion?: string): RuntimeContext {
  const ctx: RuntimeContext = { nodeVersion: process.version };
  if (piVersion && piVersion !== "unknown") ctx.piVersion = piVersion;

  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  if (branch) ctx.branch = branch;

  const status = git(cwd, ["status", "--porcelain"]);
  if (status !== undefined) ctx.dirty = status.length > 0;

  return ctx;
}
