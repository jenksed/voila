// Safe source resolution and hashing for intake. Security-critical: a model-supplied path must never
// escape the repository, and the source bytes must be read from disk (never reproduced by a model).

import { createHash } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { NewfangStateError } from "./errors.ts";

export class UnsafeSourcePathError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeSourcePathError";
  }
}

export class SourceNotFoundError extends NewfangStateError {
  constructor(message: string) {
    super(message);
    this.name = "SourceNotFoundError";
  }
}

export function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function sha256Bytes(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** True when `candidate` is inside `root` (or equal to it). */
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Resolve a repository-relative source path safely.
 * Rejects absolute paths, `..` traversal, and symlinks that escape the repository (checked via
 * realpath on both the repo root and the resolved target).
 */
export async function resolveRepoRelativeSource(
  root: string,
  relPath: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  if (typeof relPath !== "string" || relPath.trim().length === 0) {
    throw new UnsafeSourcePathError("A repository-relative source path is required.");
  }
  if (isAbsolute(relPath) || /^[A-Za-z]:[\\/]/.test(relPath)) {
    throw new UnsafeSourcePathError(
      `Absolute paths are not accepted: "${relPath}". Use a repository-relative path.`,
    );
  }
  if (relPath.startsWith("~")) {
    throw new UnsafeSourcePathError(`Home-relative paths are not accepted: "${relPath}".`);
  }
  const segments = relPath.split(/[\\/]/);
  if (segments.includes("..")) {
    throw new UnsafeSourcePathError(`Path traversal is not accepted: "${relPath}".`);
  }

  const joined = resolve(root, relPath);
  if (!isInside(resolve(root), joined)) {
    throw new UnsafeSourcePathError(`Path escapes the repository: "${relPath}".`);
  }

  // Existence.
  try {
    const st = await stat(joined);
    if (!st.isFile()) {
      throw new UnsafeSourcePathError(`Source is not a regular file: "${relPath}".`);
    }
  } catch (error) {
    if (error instanceof UnsafeSourcePathError) throw error;
    throw new SourceNotFoundError(`Source file not found: "${relPath}".`);
  }

  // Symlink escape: compare canonical paths.
  const realRoot = await realpath(resolve(root));
  const realTarget = await realpath(joined);
  if (!isInside(realRoot, realTarget)) {
    throw new UnsafeSourcePathError(
      `Source resolves outside the repository (symlink escape): "${relPath}".`,
    );
  }

  return {
    absolutePath: realTarget,
    relativePath: relative(realRoot, realTarget).split(sep).join("/"),
  };
}

/**
 * Resolve a repository-relative **directory** safely, for use as a command working directory.
 * Same rejections as `resolveRepoRelativeSource` (absolute, home-relative, `..` traversal, escape,
 * symlink escape); `"."` and `""` mean the repository root.
 */
export async function resolveRepoRelativeDir(
  root: string,
  relPath?: string,
): Promise<{ absolutePath: string; relativePath: string }> {
  const raw = relPath === undefined || relPath.trim().length === 0 ? "." : relPath;
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) {
    throw new UnsafeSourcePathError(
      `Absolute working directories are not accepted: "${raw}". Use a repository-relative path.`,
    );
  }
  if (raw.startsWith("~")) {
    throw new UnsafeSourcePathError(`Home-relative paths are not accepted: "${raw}".`);
  }
  if (raw.split(/[\\/]/).includes("..")) {
    throw new UnsafeSourcePathError(`Path traversal is not accepted: "${raw}".`);
  }

  const joined = resolve(root, raw);
  if (!isInside(resolve(root), joined)) {
    throw new UnsafeSourcePathError(`Working directory escapes the repository: "${raw}".`);
  }

  let realTarget: string;
  try {
    const st = await stat(joined);
    if (!st.isDirectory()) {
      throw new UnsafeSourcePathError(`Working directory is not a directory: "${raw}".`);
    }
    realTarget = await realpath(joined);
  } catch (error) {
    if (error instanceof UnsafeSourcePathError) throw error;
    throw new SourceNotFoundError(`Working directory not found: "${raw}".`);
  }

  const realRoot = await realpath(resolve(root));
  if (!isInside(realRoot, realTarget)) {
    throw new UnsafeSourcePathError(
      `Working directory resolves outside the repository (symlink escape): "${raw}".`,
    );
  }

  const rel = relative(realRoot, realTarget).split(sep).join("/");
  return { absolutePath: realTarget, relativePath: rel === "" ? "." : rel };
}

/** Repository-relative path of a file inside the repo, for recording provenance. */
export function repoRelative(root: string, absolutePath: string): string {
  return relative(resolve(root), absolutePath).split(sep).join("/");
}

export { join as joinPath };
