// Commit suggestion, and the delivery boundary itself.
//
// Two classes of property are asserted here:
//   1. Proposal quality — boundaries stay disjoint, subjects stay short and honest about their own
//      provenance, readiness reflects real attention items.
//   2. The delivery boundary — the engine proposes and never acts. A test drives the whole engine
//      against a real repository and proves nothing was committed, staged, or otherwise mutated.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  renderCommitMessage,
  suggestCommits,
  SUBJECT_SOFT_LIMIT,
} from "../../src/delivery/commit.ts";
import { inspectDelivery } from "../../src/delivery-inspector/index.ts";
import { runCommitSuggestion, runDeliver } from "../../src/commands/deliver.ts";
import { initState } from "../../src/state/store.ts";
import {
  fakeGit,
  git,
  numstatPayload,
  porcelainFingerprint,
  put,
  statusPayload,
  tempRepository,
} from "../delivery-inspector/support.ts";

async function inspectionOf(
  entries: { path: string; kind?: "ordinary" | "untracked"; x?: string; y?: string }[],
) {
  return inspectDelivery("/fake", {
    runGit: fakeGit({
      status: statusPayload({
        branch: "main",
        entries: entries.map((e) => ({
          kind: e.kind ?? ("ordinary" as const),
          path: e.path,
          x: e.x ?? "M",
          y: e.y ?? ".",
        })),
      }),
      unstagedNumstat: numstatPayload(
        entries.map((e) => ({ path: e.path, insertions: 2, deletions: 1 })),
      ),
    }).runGit,
    skipRootCheck: true,
  });
}

test("every proposed commit is disjoint from every other", async () => {
  const inspection = await inspectionOf([
    { path: "src/a.ts" },
    { path: "src/b.ts" },
    { path: "test/a.test.ts" },
    { path: "docs/guide.md" },
    { path: ".github/workflows/ci.yml" },
  ]);
  const commits = suggestCommits(inspection);

  const seen = new Set<string>();
  for (const commit of commits) {
    for (const path of commit.paths) {
      assert.ok(!seen.has(path), `${path} appears in more than one proposed commit`);
      seen.add(path);
    }
  }
});

test("subjects stay within the soft limit and never claim intent", async () => {
  const inspection = await inspectionOf([
    { path: "src/very/deeply/nested/module/with/a/long/path/component.ts" },
    { path: "src/very/deeply/nested/module/with/a/long/path/other.ts" },
  ]);
  for (const commit of suggestCommits(inspection)) {
    assert.ok(
      commit.subject.length <= SUBJECT_SOFT_LIMIT + 1,
      `subject too long: ${commit.subject}`,
    );
    // The body must say the subject is generated, so nobody mistakes it for an intent statement.
    assert.ok(
      commit.body.some((line) => /generated from the change shape/i.test(line)),
      "the proposal discloses that its subject is generated",
    );
  }
});

test("an added-only boundary says add, a deleted-only boundary says remove", async () => {
  const added = await inspectionOf([
    { path: "src/new-a.ts", kind: "untracked" },
    { path: "src/new-b.ts", kind: "untracked" },
  ]);
  const addedCommits = suggestCommits(added);
  assert.ok(addedCommits.length > 0);
  assert.ok(
    addedCommits.some((c) => /: add \d+ files?/.test(c.subject)),
    `expected an "add" subject, got: ${addedCommits.map((c) => c.subject).join(" | ")}`,
  );

  const deleted = await inspectionOf([
    { path: "src/gone-a.ts", x: "D", y: "." },
    { path: "src/gone-b.ts", x: "D", y: "." },
  ]);
  assert.ok(
    suggestCommits(deleted).some((c) => /: remove \d+ files?/.test(c.subject)),
    "expected a remove subject",
  );
});

test("readiness is ready only when nothing flags the boundary", async () => {
  const inspection = await inspectionOf([{ path: "src/plain.ts" }]);
  const commits = suggestCommits(inspection);
  for (const commit of commits) {
    if (commit.attention.length === 0) {
      assert.equal(commit.readiness, "ready");
      assert.match(commit.readinessReason, /still a proposal/i);
    }
  }
});

test("an inspect-before-delivery item blocks the boundary it touches", async () => {
  // `.env` raises an environment-file item at inspect_before_delivery severity.
  const inspection = await inspectionOf([{ path: ".env", kind: "untracked" }]);
  const commits = suggestCommits(inspection);
  const touching = commits.filter((c) => c.paths.includes(".env"));
  assert.ok(touching.length > 0, "the .env change was grouped somewhere");
  for (const commit of touching) {
    assert.equal(commit.readiness, "blocked");
    assert.match(commit.readinessReason, /inspect/i);
    assert.ok(
      commit.body.some((line) => /unresolved attention items/i.test(line)),
      "a blocked proposal says so in its body",
    );
  }
});

test("a rendered commit message is a subject, a blank line, then body", () => {
  const message = renderCommitMessage({
    boundaryId: "B1",
    type: "feat",
    subject: "feat: add 2 files in src",
    body: ["Grouped because they share a module.", "Second paragraph."],
    paths: ["src/a.ts", "src/b.ts"],
    rationale: "Grouped because they share a module.",
    readiness: "ready",
    readinessReason: "nothing flagged",
    attention: [],
  });
  const lines = message.split("\n");
  assert.equal(lines[0], "feat: add 2 files in src");
  assert.equal(lines[1], "", "a blank line separates subject from body");
  assert.equal(lines[2], "Grouped because they share a module.");
});

// --- The delivery boundary ------------------------------------------------------------------

test("running the delivery engine against a real repository mutates nothing", async () => {
  const root = await tempRepository();
  await initState(root, { displayName: "boundary-demo" });
  await put(root, "src/changed.ts", "export const a = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "seed"]);

  // Create a real change set: one tracked modification and one untracked file.
  await put(root, "src/changed.ts", "export const a = 2;\n");
  await put(root, "src/untracked.ts", "export const b = 3;\n");

  const headBefore = git(root, ["rev-parse", "HEAD"]);
  const logBefore = git(root, ["rev-list", "--count", "HEAD"]);
  const statusBefore = porcelainFingerprint(root);
  const indexBefore = readFileSync(join(root, ".git", "index"));

  const deliver = await runDeliver(root);
  const commit = await runCommitSuggestion(root);

  assert.ok(deliver.lines.length > 0);
  assert.ok(commit.lines.length > 0);

  assert.equal(git(root, ["rev-parse", "HEAD"]), headBefore, "HEAD did not move");
  assert.equal(git(root, ["rev-list", "--count", "HEAD"]), logBefore, "no commit was created");
  assert.equal(porcelainFingerprint(root), statusBefore, "the working tree is byte-identical");
  assert.deepEqual(
    readFileSync(join(root, ".git", "index")),
    indexBefore,
    "the git index was not rewritten, so nothing was staged",
  );
});

test("the delivery summary reports a real change set and names the delivery boundary", async () => {
  const root = await tempRepository();
  await initState(root, { displayName: "boundary-demo" });
  await put(root, "src/changed.ts", "export const a = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "seed"]);
  await put(root, "src/changed.ts", "export const a = 2;\n");

  const result = await runDeliver(root);
  const text = result.lines.join("\n");

  assert.match(text, /Delivery summary — boundary-demo/);
  assert.match(text, /What changed/);
  assert.match(text, /Claims and evidence/);
  assert.match(text, /Next justified action/);
  assert.match(text, /does not commit, stage, push, or open a pull request/i);
});

test("commit suggestion on a clean tree says there is nothing to suggest", async () => {
  const root = await tempRepository();
  await initState(root, { displayName: "clean-demo" });
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "seed"]);

  const result = await runCommitSuggestion(root);
  assert.equal(result.level, "info");
  assert.match(result.lines.join("\n"), /Nothing changed/);
});

test("commit suggestion states plainly that Voila does not commit", async () => {
  const root = await tempRepository();
  await initState(root, { displayName: "boundary-demo" });
  await put(root, "src/a.ts", "export const a = 1;\n");
  git(root, ["add", "-A"]);
  git(root, ["commit", "-q", "-m", "seed"]);
  await put(root, "src/a.ts", "export const a = 2;\n");

  const result = await runCommitSuggestion(root);
  assert.match(result.lines.join("\n"), /Voila does not commit/i);
});

test("delivery on an uninitialized project reports the missing state, not a crash", async () => {
  const root = await tempRepository();
  const result = await runDeliver(root);
  assert.equal(result.level, "warning");
  assert.match(result.lines.join("\n"), /\/voila init/);
});
