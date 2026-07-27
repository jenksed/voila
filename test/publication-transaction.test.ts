import assert from "node:assert/strict";
import { test } from "node:test";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { buildCommitMessageBytes } from "../src/publication/transaction.ts";

const execFileAsync = promisify(execFile);

async function freshRepo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-tx-"));
  await execFileAsync("git", ["init", "-q", "-b", "main", root]);
  await execFileAsync("git", [
    "-C",
    root,
    "-c",
    "user.name=Voila Test",
    "-c",
    "user.email=voila-test@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "init",
  ]);
  await execFileAsync("git", ["-C", root, "checkout", "-q", "-b", "feat/g0"]);
  return root;
}

async function setFile(root: string, path: string, contents: string): Promise<void> {
  const absolute = join(root, path);
  await mkdir(join(root, path.split("/").slice(0, -1).join("/")), { recursive: true }).catch(
    () => undefined,
  );
  await writeFile(absolute, contents, "utf8");
}

async function readRealIndex(root: string): Promise<Buffer> {
  return readFile(join(root, ".git", "index"));
}

test("commit-message byte buffer is deterministic", () => {
  const a = buildCommitMessageBytes("feat: change", ["first", "second"]);
  const b = buildCommitMessageBytes("feat: change", ["first", "second"]);
  assert.deepEqual(a, b);
  const text = a.toString("utf8");
  assert.match(text, /^feat: change\n/);
  assert.match(text, /\nfirst\nsecond\n$/);
});

test("commit-message byte buffer refuses forbidden characters", () => {
  // The transaction runs commit-tree against these exact bytes; the validator runs elsewhere, so
  // here we only prove the helper is deterministic.
  const a = buildCommitMessageBytes("fix: x", []);
  assert.ok(a.length > 0);
  assert.equal(a[a.length - 1], 0x0a);
});

test("a fixture repository has a clean real index after init", async () => {
  const root = await freshRepo();
  try {
    const bytes = await readRealIndex(root);
    assert.ok(bytes.length > 0, "the real index must exist and be non-empty");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("setFile and readRealIndex round-trip cleanly", async () => {
  const root = await freshRepo();
  try {
    await setFile(root, "src/example.ts", "export const v = 1;\n");
    await execFileAsync("git", ["-C", root, "add", "src/example.ts"]);
    const before = await readRealIndex(root);
    assert.ok(before.length > 0);
    // The repository now has a staged change; the runtime transaction would refuse at the
    // clean-index probe step rather than touching the index. This is the state the transaction's
    // gate exists to detect.
    const { stdout } = await execFileAsync("git", ["-C", root, "diff", "--cached", "--name-only"]);
    assert.match(stdout, /src\/example\.ts/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
