import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { publicationLock, PUBLICATION_LOCK_NAME } from "../src/publication/lock.ts";
import type { LockRecord } from "../src/publication/lock.ts";

async function freshRoot(): Promise<string> {
  const root = join(tmpdir(), `voila-lock-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(join(root, ".voila", "publications", "transactions"), { recursive: true });
  return root;
}

async function cleanRoot(root: string): Promise<void> {
  await rm(root, { recursive: true, force: true });
}

test("acquire creates an exclusive lock", async () => {
  const root = await freshRoot();
  try {
    const attempt = await publicationLock.acquire(root, {
      transactionId: "PTX-1",
      planId: "PUB-1",
      pid: 1,
      hostname: "host",
    });
    assert.equal(attempt.status, "acquired");
    assert.ok(attempt.lock);
    const file = await readFile(
      join(root, ".voila", "publications", "transactions", PUBLICATION_LOCK_NAME),
      "utf8",
    );
    const parsed = JSON.parse(file) as LockRecord;
    assert.equal(parsed.transactionId, "PTX-1");
  } finally {
    await cleanRoot(root);
  }
});

test("a second acquire on a live lock reports busy", async () => {
  const root = await freshRoot();
  try {
    const first = await publicationLock.acquire(root, {
      transactionId: "PTX-1",
      planId: "PUB-1",
      pid: 1,
      hostname: "host",
    });
    assert.equal(first.status, "acquired");
    const second = await publicationLock.acquire(root, {
      transactionId: "PTX-2",
      planId: "PUB-1",
      pid: 1,
      hostname: "host",
    });
    assert.equal(second.status, "busy");
    assert.equal(second.lock?.transactionId, "PTX-1");
  } finally {
    await cleanRoot(root);
  }
});

test("a stale lock is reported as expired and can be quarantined", async () => {
  const root = await freshRoot();
  try {
    const lockPath = join(root, ".voila", "publications", "transactions", PUBLICATION_LOCK_NAME);
    const stale: LockRecord = {
      transactionId: "PTX-stale",
      planId: "PUB-1",
      createdAt: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
      pid: 1,
      hostname: "host",
    };
    await writeFile(lockPath, JSON.stringify(stale), "utf8");
    const attempt = await publicationLock.acquire(root, {
      transactionId: "PTX-new",
      planId: "PUB-1",
      pid: 1,
      hostname: "host",
    });
    assert.equal(attempt.status, "expired");
    const quarantined = await publicationLock.quarantineStale(root);
    assert.ok(quarantined);
    assert.ok(quarantined?.endsWith(".stale-0") || /stale-\d+/.test(quarantined ?? ""));
  } finally {
    await cleanRoot(root);
  }
});

test("release requires the same transaction ID and is otherwise absent", async () => {
  const root = await freshRoot();
  try {
    await publicationLock.acquire(root, {
      transactionId: "PTX-1",
      planId: "PUB-1",
      pid: 1,
      hostname: "host",
    });
    assert.equal(await publicationLock.release(root, "PTX-other"), "absent");
    assert.equal(await publicationLock.release(root, "PTX-1"), "released");
  } finally {
    await cleanRoot(root);
  }
});
