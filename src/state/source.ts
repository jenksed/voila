// Safe source/cwd resolution and hashing. Repository containment delegates to the shared path
// boundary used by operation admission and protected-path interception.

import { createHash } from "node:crypto";
import { join, relative, resolve, sep } from "node:path";
import { resolveRepositoryPath } from "./path-boundary.ts";

export { SourceNotFoundError, UnsafeSourcePathError } from "./source-errors.ts";

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Resolve an existing repository-relative regular file with symlink-escape protection. */
export async function resolveRepoRelativeSource(
  root: string,
  relPath: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const resolved = await resolveRepositoryPath(root, relPath, {
    allowAbsolute: false,
    rejectTraversal: true,
    mustExist: "file",
    label: "Source file",
  });
  return { absolutePath: resolved.absolutePath, relativePath: resolved.relativePath };
}

/** Resolve an existing repository-relative directory for structured command execution. */
export async function resolveRepoRelativeDir(
  root: string,
  relPath?: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const raw = relPath === undefined || relPath.trim().length === 0 ? "." : relPath;
  const resolved = await resolveRepositoryPath(root, raw, {
    allowAbsolute: false,
    rejectTraversal: true,
    mustExist: "directory",
    label: "Working directory",
  });
  return { absolutePath: resolved.absolutePath, relativePath: resolved.relativePath };
}

/** Repository-relative path of a file inside the repo, for recording provenance. */
export function repoRelative(root: string, absolutePath: string): string {
  return relative(resolve(root), absolutePath).split(sep).join("/");
}

export { join as joinPath };
