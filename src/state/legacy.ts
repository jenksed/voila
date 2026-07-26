// Legacy `.newfang/` state-directory detection and byte-exact tree hashing.
//
// This module is the ONE place in active code where the legacy brand survives, and it is
// deliberately scoped to the *state directory*. No legacy command (`/newfang`), tool (`newfang_*`),
// or API alias exists anywhere: Packet 4.5 left exactly one supported product API.
//
// Pure detection + hashing only. The migration that moves the directory lives in
// `legacy-migration.ts`, so this module can be imported by the store without an import cycle.

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { VOILA_DIR } from "./paths.ts";
import { VoilaStateError } from "./errors.ts";
import { sha256Bytes } from "./source.ts";

/** The pre-rename canonical state directory. Detected and migrated; never created. */
export const LEGACY_STATE_DIR = ".newfang";

/**
 * Which state directories exist in a project root.
 * - `none`     — uninitialized; `/voila init` creates `.voila/`.
 * - `current`  — normal operation.
 * - `legacy`   — pre-rename project; requires an explicit `/voila migrate --apply`.
 * - `conflict` — both exist; never guessed, always resolved by a human.
 */
export type StateDirectoryKind = "none" | "current" | "legacy" | "conflict";

export interface StateDirectoryStatus {
  kind: StateDirectoryKind;
  /** Absolute path to `.voila/`. */
  currentDir: string;
  /** Absolute path to `.newfang/`. */
  legacyDir: string;
}

export function stateDirectoryStatus(root: string): StateDirectoryStatus {
  const currentDir = join(root, VOILA_DIR);
  const legacyDir = join(root, LEGACY_STATE_DIR);
  const hasCurrent = existsSync(currentDir);
  const hasLegacy = existsSync(legacyDir);
  const kind: StateDirectoryKind =
    hasCurrent && hasLegacy ? "conflict" : hasCurrent ? "current" : hasLegacy ? "legacy" : "none";
  return { kind, currentDir, legacyDir };
}

/** Only `.newfang/` exists. Nothing operates on legacy state implicitly. */
export class LegacyStateMigrationRequiredError extends VoilaStateError {
  constructor() {
    super(
      `Legacy ${LEGACY_STATE_DIR}/ state found and no ${VOILA_DIR}/ directory. ` +
        "Run /voila migrate to inspect the transition and /voila migrate --apply to migrate.",
    );
    this.name = "LegacyStateMigrationRequiredError";
  }
}

/** Both directories exist. Choosing one could silently discard real project history. */
export class StateDirectoryConflictError extends VoilaStateError {
  constructor(currentDir: string, legacyDir: string) {
    super(
      `Both state directories exist:\n  ${legacyDir}\n  ${currentDir}\n` +
        "Voila will not choose between them. Resolve this manually: keep the directory that holds " +
        "the real project history, move the other aside, then re-run /voila doctor.",
    );
    this.name = "StateDirectoryConflictError";
  }
}

/** A migration was attempted but could not be completed; the report says what state the tree is in. */
export class LegacyMigrationFailedError extends VoilaStateError {
  constructor(message: string) {
    super(message);
    this.name = "LegacyMigrationFailedError";
  }
}

/**
 * Throw when `root` must not be operated on as a normal project.
 * Called from the single state-read chokepoint so every command inherits the behavior.
 */
export function assertUsableStateDirectory(root: string): void {
  const status = stateDirectoryStatus(root);
  if (status.kind === "conflict") {
    throw new StateDirectoryConflictError(status.currentDir, status.legacyDir);
  }
  if (status.kind === "legacy") throw new LegacyStateMigrationRequiredError();
}

/** Artifact groups whose bytes must survive migration unchanged. */
export const IMMUTABLE_GROUPS = ["intakes", "orientations", "receipts"] as const;

export interface TreeDigest {
  /** Repository-relative-to-the-state-dir path -> sha256 of the file bytes. */
  files: Map<string, string>;
  /** Count of files under `intakes/`, `orientations/`, and `receipts/`. */
  immutableCount: number;
}

function isImmutablePath(relPath: string): boolean {
  return IMMUTABLE_GROUPS.some((g) => relPath === g || relPath.startsWith(`${g}/`));
}

/**
 * Hash every regular file in a state directory. Paths are normalized to forward slashes and sorted,
 * so two digests compare exactly across the move. Symbolic links are recorded as their own kind so a
 * link can never masquerade as preserved content.
 */
export async function hashStateTree(dir: string): Promise<TreeDigest> {
  const files = new Map<string, string>();
  let immutableCount = 0;

  async function walk(current: string, prefix: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = join(current, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(abs, rel);
      } else if (entry.isFile()) {
        files.set(rel, sha256Bytes(await readFile(abs)));
        if (isImmutablePath(rel)) immutableCount++;
      } else {
        // Sockets, FIFOs, symlinks: recorded distinctly so validation notices any change in kind.
        files.set(rel, `non-regular-file`);
      }
    }
  }

  await walk(dir, "");
  return { files, immutableCount };
}

/** Paths whose digest differs between two trees, in sorted order. Empty means byte-identical. */
export function digestDifferences(before: TreeDigest, after: TreeDigest): string[] {
  const problems: string[] = [];
  for (const [path, hash] of before.files) {
    const found = after.files.get(path);
    if (found === undefined) problems.push(`missing after move: ${path}`);
    else if (found !== hash) problems.push(`content changed: ${path}`);
  }
  for (const path of after.files.keys()) {
    if (!before.files.has(path)) problems.push(`unexpected new file: ${path}`);
  }
  return problems.sort();
}
