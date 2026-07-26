import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState } from "../src/state/store.ts";
import { createIntake, readManifest, readSource } from "../src/state/intake-store.ts";
import { intakePaths } from "../src/state/paths.ts";
import { SourceNotFoundError, UnsafeSourcePathError } from "../src/state/source.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";

const CONTENT = "# Plan\n\nLine two with trailing spaces   \n\tTabbed line\nunicode: café ✓\n";

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-src-"));
  await initState(root, { displayName: "src-demo" });
  return root;
}

test("file intake preserves exact bytes and a correct sha-256", async () => {
  const root = await repo();
  await mkdir(join(root, "docs"), { recursive: true });
  await writeFile(join(root, "docs/plan.md"), CONTENT, "utf8");

  const result = await createIntake(root, { path: "docs/plan.md" });
  const preserved = await readSource(root, result.intake.id);
  assert.equal(preserved, CONTENT, "bytes preserved exactly, including tabs and trailing spaces");

  const expected = createHash("sha256").update(CONTENT, "utf8").digest("hex");
  assert.equal(result.intake.sourceSha256, expected);
  assert.equal(result.intake.sourceType, "file");
  assert.equal(result.intake.sourceRef, "docs/plan.md", "repository-relative path recorded");
  assert.equal(result.intake.status, "source_preserved");
  assert.equal(result.intake.draftRevision, 0);
});

test("manifest is stable and agrees with canonical metadata", async () => {
  const root = await repo();
  await writeFile(join(root, "plan.md"), CONTENT, "utf8");
  const result = await createIntake(root, { path: "plan.md" });
  const manifest = await readManifest(root, result.intake.id);
  assert.equal(manifest.intakeId, result.intake.id);
  assert.equal(manifest.sourceSha256, result.intake.sourceSha256);
  assert.equal(manifest.sourceRef, "plan.md");
  assert.equal(manifest.sourceLineCount, CONTENT.split("\n").length);
  // Stable across reads.
  assert.deepEqual(await readManifest(root, result.intake.id), manifest);
});

test("absolute paths are rejected", async () => {
  const root = await repo();
  await writeFile(join(root, "plan.md"), CONTENT, "utf8");
  await assert.rejects(
    () => createIntake(root, { path: join(root, "plan.md") }),
    UnsafeSourcePathError,
  );
  await assert.rejects(() => createIntake(root, { path: "/etc/hosts" }), UnsafeSourcePathError);
  await assert.rejects(() => createIntake(root, { path: "~/secrets.txt" }), UnsafeSourcePathError);
});

test("path traversal is rejected", async () => {
  const root = await repo();
  await assert.rejects(() => createIntake(root, { path: "../outside.md" }), UnsafeSourcePathError);
  await assert.rejects(
    () => createIntake(root, { path: "docs/../../outside.md" }),
    UnsafeSourcePathError,
  );
});

test("symlink escape is rejected", async () => {
  const root = await repo();
  const outside = await mkdtemp(join(tmpdir(), "voila-outside-"));
  await writeFile(join(outside, "secret.md"), "secret\n", "utf8");
  await symlink(join(outside, "secret.md"), join(root, "link.md"));
  await assert.rejects(() => createIntake(root, { path: "link.md" }), UnsafeSourcePathError);
});

test("missing file is reported distinctly", async () => {
  const root = await repo();
  await assert.rejects(() => createIntake(root, { path: "nope.md" }), SourceNotFoundError);
});

test("text intake preserves the exact string and is typed honestly", async () => {
  const root = await repo();
  const text = "raw request  \n\twith odd whitespace\n";
  const result = await createIntake(root, {
    text,
    sourceType: "conversation",
    title: "verbal ask",
  });
  assert.equal(await readSource(root, result.intake.id), text);
  assert.equal(result.intake.sourceType, "conversation", "does not claim to be a file");
  assert.match(result.intake.sourceRef, /^text:/, "no false file reference");
  assert.equal(result.intake.sourceSha256, createHash("sha256").update(text, "utf8").digest("hex"));
});

test("exactly one source must be provided", async () => {
  const root = await repo();
  await writeFile(join(root, "plan.md"), CONTENT, "utf8");
  await assert.rejects(() => createIntake(root, {}), ProjectOperationError);
  await assert.rejects(
    () => createIntake(root, { path: "plan.md", text: "also text" }),
    ProjectOperationError,
  );
});

test("the preserved source is never overwritten by a second intake", async () => {
  const root = await repo();
  await writeFile(join(root, "plan.md"), CONTENT, "utf8");
  const first = await createIntake(root, { path: "plan.md" });

  // A second intake of the same file gets its own ID and its own artifact directory.
  await writeFile(join(root, "plan.md"), "# Changed\n", "utf8");
  const second = await createIntake(root, { path: "plan.md" });
  assert.notEqual(second.intake.id, first.intake.id);
  assert.equal(await readSource(root, first.intake.id), CONTENT, "first source untouched");
  assert.equal(await readSource(root, second.intake.id), "# Changed\n");
});

test("intake IDs are monotonic and canonical metadata tracks them", async () => {
  const root = await repo();
  await writeFile(join(root, "a.md"), "a\n", "utf8");
  await writeFile(join(root, "b.md"), "b\n", "utf8");
  const first = await createIntake(root, { path: "a.md" });
  const second = await createIntake(root, { path: "b.md" });
  assert.equal(first.intake.id, "INT-1");
  assert.equal(second.intake.id, "INT-2");
  const state = await loadState(root);
  assert.equal(state.sequences.intake, 3);
  assert.equal(state.currentIntakeId, "INT-2");
  assert.equal(state.intakes.length, 2);
});

test("source artifact lives under .voila/intakes/<id>/", async () => {
  const root = await repo();
  await writeFile(join(root, "plan.md"), CONTENT, "utf8");
  const result = await createIntake(root, { path: "plan.md" });
  const paths = intakePaths(root, result.intake.id);
  assert.ok(paths.source.includes(`.voila/intakes/${result.intake.id}/source.md`));
  assert.equal(await readFile(paths.source, "utf8"), CONTENT);
});
