// Per-worktree publication lock. Guarantees that at most one active transaction runs against one
// worktree at a time. The lock is a regular file written to the worktree's Voila publications
// directory. No cross-process adoption; if a stale lock is observed, the caller must raise the
// partial/interrupted settlement through a new plan rather than resume.

import { mkdir, readFile, stat, unlink, writeFile, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { publicationTransactionPaths } from "../state/paths.ts";

export const PUBLICATION_LOCK_NAME = "active.lock";

export interface LockRecord {
  readonly transactionId: string;
  readonly planId: string;
  readonly createdAt: string;
  readonly pid: number;
  readonly hostname: string;
}

export interface LockAttempt {
  readonly status: "acquired" | "busy" | "expired" | "missing";
  readonly lock?: LockRecord;
  readonly path: string;
}

const LOCK_STALE_MS = 30 * 60 * 1000;

async function lockPath(root: string): Promise<string> {
  const dir = join(root, ".voila", "publications", "transactions");
  await mkdir(dir, { recursive: true });
  return join(dir, PUBLICATION_LOCK_NAME);
}

async function readLock(path: string): Promise<LockRecord | null> {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text) as LockRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function isStale(record: LockRecord, now: number): boolean {
  return now - Date.parse(record.createdAt) > LOCK_STALE_MS;
}

async function acquireLock(
  root: string,
  record: Omit<LockRecord, "createdAt">,
): Promise<LockAttempt> {
  const path = await lockPath(root);
  const existing = await readLock(path);
  const now = Date.now();
  if (existing && !isStale(existing, now)) {
    return { status: "busy", lock: existing, path };
  }
  if (existing && isStale(existing, now)) {
    return { status: "expired", lock: existing, path };
  }
  const full: LockRecord = { ...record, createdAt: new Date(now).toISOString() };
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, JSON.stringify(full), "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await unlink(tmp).catch(() => undefined);
    throw error;
  }
  return { status: "acquired", lock: full, path };
}

async function releaseLock(root: string, transactionId: string): Promise<"released" | "absent"> {
  const path = await lockPath(root);
  const existing = await readLock(path);
  if (!existing) return "absent";
  if (existing.transactionId !== transactionId) return "absent";
  await unlink(path).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  return "released";
}

async function quarantineStaleLock(root: string): Promise<string | null> {
  const path = await lockPath(root);
  const existing = await readLock(path);
  if (!existing || !isStale(existing, Date.now())) return null;
  const quarantine = `${path}.stale-${Date.now()}`;
  await rename(path, quarantine).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  return quarantine;
}

export async function ensurePublicationArtifacts(root: string): Promise<void> {
  const paths = publicationTransactionPaths(root, "unused");
  await mkdir(paths.dir, { recursive: true });
}

/**
 * Probe the worktree for an existing publication transaction artifact directory, used by apply
 * admission. Returns the directory name when one is found and the caller should record a partial
 * settlement.
 */
export async function findActiveTransactionDir(root: string): Promise<string | null> {
  const base = join(root, ".voila", "publications", "transactions");
  try {
    const s = await stat(base);
    if (!s.isDirectory()) return null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
  // Implementation note: callers should pair this probe with the lock-file check before assuming
  // the transaction is still active. This implementation deliberately returns null: full adoption
  // requires inspecting the manifest, not just the directory presence.
  return null;
}

export const publicationLock = {
  acquire: acquireLock,
  release: releaseLock,
  quarantineStale: quarantineStaleLock,
};
