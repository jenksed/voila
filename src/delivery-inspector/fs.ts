// Bounded, read-only filesystem access for the delivery inspector.
//
// Two guarantees matter here:
// 1. **Read-only.** Nothing in this module opens a file for writing, creates, renames, or removes
//    anything. There is no write path to omit — there is no write path at all.
// 2. **Bounded and path-safe.** Every read takes an explicit byte cap, and a repository-relative
//    path that would escape the root is refused (returns `null`) rather than followed. Absolute
//    paths, home-relative paths, and `..` traversal are all refused.
//
// The interface is injectable so pure tests can drive classification, attention, and command
// discovery from in-memory fixtures without touching a real disk.

import { open, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface InspectionFileSystem {
  /**
   * Read at most `maxBytes` bytes of a repository-relative file.
   * Returns `null` when the path is unsafe, missing, or unreadable. Never throws.
   */
  readBytes(relPath: string, maxBytes: number): Promise<Uint8Array | null>;
  /**
   * Read at most `maxBytes` bytes of a repository-relative file and decode as UTF-8.
   * Returns `null` when the path is unsafe, missing, or unreadable. Never throws.
   */
  readText(relPath: string, maxBytes: number): Promise<string | null>;
  /** Size in bytes of a repository-relative regular file, or `null`. Never throws. */
  fileSize(relPath: string): Promise<number | null>;
  /** True when a repository-relative directory exists. Never throws. */
  directoryExists(relPath: string): Promise<boolean>;
}

/** True when `candidate` is inside `root` (or equal to it). */
function isInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

/**
 * Resolve a repository-relative path inside `root`, or `null` when it is unsafe.
 * Refuses absolute paths, home-relative paths, and any `..` segment.
 */
export function safeResolve(root: string, relPath: string): string | null {
  if (typeof relPath !== "string" || relPath.trim().length === 0) return null;
  if (isAbsolute(relPath) || /^[A-Za-z]:[\\/]/.test(relPath)) return null;
  if (relPath.startsWith("~")) return null;
  if (relPath.split(/[\\/]/).includes("..")) return null;
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, relPath);
  return isInside(absoluteRoot, target) ? target : null;
}

/** Normalize a path to repository-relative POSIX form, for output. */
export function toPosix(path: string): string {
  return path.split(sep).join("/");
}

/**
 * A read-only, bounded filesystem rooted at `root`.
 * Symlinks are not followed outside the root: the resolved path is checked before opening, and
 * `open` failures are swallowed into `null`, so an escaping symlink yields no data either way.
 */
export function createNodeFileSystem(root: string): InspectionFileSystem {
  return {
    async readBytes(relPath, maxBytes) {
      const absolute = safeResolve(root, relPath);
      if (absolute === null || maxBytes <= 0) return null;
      let handle;
      try {
        handle = await open(absolute, "r");
      } catch {
        return null;
      }
      try {
        const info = await handle.stat();
        if (!info.isFile()) return null;
        const size = Math.min(Number(info.size), maxBytes);
        if (size === 0) return new Uint8Array(0);
        const buffer = Buffer.allocUnsafe(size);
        const { bytesRead } = await handle.read(buffer, 0, size, 0);
        return new Uint8Array(buffer.subarray(0, bytesRead));
      } catch {
        return null;
      } finally {
        await handle.close().catch(() => undefined);
      }
    },

    async readText(relPath, maxBytes) {
      const bytes = await this.readBytes(relPath, maxBytes);
      if (bytes === null) return null;
      return Buffer.from(bytes).toString("utf8");
    },

    async fileSize(relPath) {
      const absolute = safeResolve(root, relPath);
      if (absolute === null) return null;
      try {
        const info = await stat(absolute);
        return info.isFile() ? Number(info.size) : null;
      } catch {
        return null;
      }
    },

    async directoryExists(relPath) {
      const absolute = safeResolve(root, relPath);
      if (absolute === null) return false;
      try {
        return (await stat(absolute)).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

/**
 * An in-memory filesystem for pure tests. Keys are repository-relative POSIX paths.
 * Directory existence is derived from the keys, so no directory bookkeeping is needed.
 */
export function createMemoryFileSystem(
  files: Readonly<Record<string, string>>,
): InspectionFileSystem {
  const clip = (text: string, maxBytes: number): string => {
    const bytes = Buffer.from(text, "utf8");
    return bytes.subarray(0, Math.max(0, maxBytes)).toString("utf8");
  };
  return {
    async readBytes(relPath, maxBytes) {
      const text = files[relPath];
      if (text === undefined) return null;
      return new Uint8Array(Buffer.from(clip(text, maxBytes), "utf8"));
    },
    async readText(relPath, maxBytes) {
      const text = files[relPath];
      return text === undefined ? null : clip(text, maxBytes);
    },
    async fileSize(relPath) {
      const text = files[relPath];
      return text === undefined ? null : Buffer.byteLength(text, "utf8");
    },
    async directoryExists(relPath) {
      const prefix = relPath.endsWith("/") ? relPath : `${relPath}/`;
      return Object.keys(files).some((key) => key.startsWith(prefix));
    },
  };
}
