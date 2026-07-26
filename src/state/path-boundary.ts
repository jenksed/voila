// Shared repository/worktree path boundary for operation admission, verification cwd resolution,
// and protected-path interception. This is not a filesystem sandbox.

import { lstat, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { UnsafeSourcePathError, SourceNotFoundError } from "./source-errors.ts";

export type RequiredPathKind = "file" | "directory" | "any";

export interface RepositoryPathOptions {
  allowAbsolute?: boolean;
  rejectTraversal?: boolean;
  mustExist?: RequiredPathKind;
  label?: string;
}

export interface RepositoryPathResolution {
  /** Lexically resolved active repository root. */
  repositoryRoot: string;
  /** Canonical realpath of the active repository root. */
  worktreeIdentity: string;
  /** Resolved target path; canonical realpath when it already exists. */
  absolutePath: string;
  /** Stable repository-relative slash-separated path (`.` for root). */
  relativePath: string;
  exists: boolean;
}

function inside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function slashPath(value: string): string {
  return value.split(sep).join("/");
}

async function nearestExistingAncestor(path: string): Promise<string> {
  let cursor = path;
  for (;;) {
    try {
      await lstat(cursor);
      return cursor;
    } catch {
      const parent = dirname(cursor);
      if (parent === cursor) throw new SourceNotFoundError(`No existing ancestor for "${path}".`);
      cursor = parent;
    }
  }
}

/**
 * Resolve a path against one repository and prove lexical plus symlink containment. Existing
 * targets resolve through their own realpath; new targets prove their nearest existing ancestor.
 */
export async function resolveRepositoryPath(
  root: string,
  target: string,
  options: RepositoryPathOptions = {},
): Promise<RepositoryPathResolution> {
  const label = options.label ?? "Repository path";
  if (typeof target !== "string" || target.trim().length === 0) {
    throw new UnsafeSourcePathError(`${label} is required.`);
  }
  if (target.startsWith("~")) {
    throw new UnsafeSourcePathError(`Home-relative paths are not accepted: "${target}".`);
  }
  const absoluteInput = isAbsolute(target) || /^[A-Za-z]:[\\/]/.test(target);
  if (absoluteInput && options.allowAbsolute !== true) {
    throw new UnsafeSourcePathError(
      `Absolute paths are not accepted: "${target}". Use a repository-relative path.`,
    );
  }
  if (options.rejectTraversal === true && target.split(/[\\/]/).includes("..")) {
    throw new UnsafeSourcePathError(`Path traversal is not accepted: "${target}".`);
  }

  const repositoryRoot = resolve(root);
  let worktreeIdentity: string;
  try {
    worktreeIdentity = await realpath(repositoryRoot);
  } catch {
    throw new SourceNotFoundError(`Repository root not found: "${root}".`);
  }

  const lexicalTarget = absoluteInput ? resolve(target) : resolve(repositoryRoot, target);
  if (!inside(repositoryRoot, lexicalTarget)) {
    throw new UnsafeSourcePathError(`Path escapes the repository: "${target}".`);
  }

  let exists = true;
  let absolutePath = lexicalTarget;
  try {
    const stat = await lstat(lexicalTarget);
    if (options.mustExist === "file" && !stat.isFile()) {
      throw new UnsafeSourcePathError(`${label} is not a regular file: "${target}".`);
    }
    if (options.mustExist === "directory" && !stat.isDirectory()) {
      throw new UnsafeSourcePathError(`${label} is not a directory: "${target}".`);
    }
    absolutePath = await realpath(lexicalTarget);
    if (!inside(worktreeIdentity, absolutePath)) {
      throw new UnsafeSourcePathError(
        `${label} resolves outside the repository (symlink escape): "${target}".`,
      );
    }
  } catch (error) {
    if (error instanceof UnsafeSourcePathError) throw error;
    exists = false;
    if (options.mustExist) {
      throw new SourceNotFoundError(`${label} not found: "${target}".`);
    }
    const ancestor = await nearestExistingAncestor(lexicalTarget);
    const realAncestor = await realpath(ancestor);
    if (!inside(worktreeIdentity, realAncestor)) {
      throw new UnsafeSourcePathError(
        `${label} would traverse a symlink outside the repository: "${target}".`,
      );
    }
  }

  const rel = slashPath(relative(repositoryRoot, lexicalTarget));
  return {
    repositoryRoot,
    worktreeIdentity,
    absolutePath,
    relativePath: rel === "" ? "." : rel,
    exists,
  };
}

/** Direct model file mutation is forbidden anywhere under canonical `.voila/` state. */
export function isProtectedVoilaPath(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/").replace(/^\.\//, "");
  return normalized === ".voila" || normalized.startsWith(".voila/");
}

/** Resolve a structured file-tool target and report whether it crosses the canonical boundary. */
export async function protectedMutationTarget(
  root: string,
  target: string,
): Promise<RepositoryPathResolution | null> {
  const resolved = await resolveRepositoryPath(root, target, {
    allowAbsolute: true,
    label: "Mutation target",
  });
  return isProtectedVoilaPath(resolved.relativePath) ? resolved : null;
}
