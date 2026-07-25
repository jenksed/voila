// Git layer: the read-only guard, the porcelain v2 and numstat parsers, and partial-failure behavior.
//
// The parser tests use payloads shaped exactly like real `-z` output, which was captured from git 2.50
// before this module was written. The guard tests are the primary evidence that the inspector cannot
// mutate a repository even if a caller hands the runner a mutating argument vector.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rm } from "node:fs/promises";

import {
  collectGitState,
  createGitRunner,
  parseNumstatZ,
  parseStatusPorcelainV2,
  primaryStatus,
  READ_ONLY_GIT_SUBCOMMANDS,
} from "../../src/delivery-inspector/git.ts";
import { DEFAULT_INSPECTION_LIMITS } from "../../src/delivery-inspector/types.ts";
import {
  fakeGit,
  MUTATING_GIT_SUBCOMMANDS,
  numstatPayload,
  statusPayload,
  tempDirectory,
  tempRepository,
} from "./support.ts";

test("the read-only allowlist contains no mutating subcommand", () => {
  for (const subcommand of MUTATING_GIT_SUBCOMMANDS) {
    assert.ok(
      !READ_ONLY_GIT_SUBCOMMANDS.includes(subcommand),
      `"${subcommand}" must never be on the read-only allowlist`,
    );
  }
});

test("the git runner refuses every mutating subcommand", async () => {
  const root = await tempRepository();
  try {
    const runGit = createGitRunner(root, DEFAULT_INSPECTION_LIMITS);
    for (const subcommand of MUTATING_GIT_SUBCOMMANDS) {
      const result = await runGit([subcommand, "--dry-run"]);
      assert.equal(result.ok, false, `git ${subcommand} must be refused`);
      assert.match(result.stderr, /not read-only/);
      assert.equal(result.stdout, "");
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the git runner refuses arguments that could redirect git elsewhere", async () => {
  const root = await tempRepository();
  try {
    const runGit = createGitRunner(root, DEFAULT_INSPECTION_LIMITS);
    for (const args of [
      ["-c", "core.hooksPath=/tmp/evil", "status"],
      ["status", "--git-dir=/tmp/other"],
      ["diff", "--exec-path=/tmp/bin"],
    ]) {
      const result = await runGit(args);
      assert.equal(result.ok, false, `${args.join(" ")} must be refused`);
      assert.match(result.stderr, /Refused/);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the git runner runs allowed read-only inspections", async () => {
  const root = await tempRepository();
  try {
    const runGit = createGitRunner(root, DEFAULT_INSPECTION_LIMITS);
    const inside = await runGit(["rev-parse", "--is-inside-work-tree"]);
    assert.equal(inside.ok, true);
    assert.equal(inside.stdout.trim(), "true");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("porcelain v2 parses branch facts, ordinary entries, renames, and untracked files", () => {
  const payload = statusPayload({
    head: "abc123",
    branch: "feat/x",
    upstream: "origin/feat/x",
    ahead: 2,
    behind: 1,
    entries: [
      { kind: "ordinary", path: "src/a.ts", x: "M", y: "." },
      { kind: "ordinary", path: "src/b.ts", x: ".", y: "M" },
      { kind: "ordinary", path: "gone.ts", x: "D", y: "." },
      { kind: "rename", path: "src/new.ts", previousPath: "src/old.ts", x: "R", y: "M" },
      { kind: "untracked", path: "notes.txt" },
      { kind: "unmerged", path: "conflict.ts" },
    ],
  });

  const parsed = parseStatusPorcelainV2(payload);
  assert.equal(parsed.head, "abc123");
  assert.equal(parsed.branch, "feat/x");
  assert.equal(parsed.detachedHead, false);
  assert.equal(parsed.upstream, "origin/feat/x");
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.behind, 1);
  assert.equal(parsed.unrecognizedRecords, 0);
  assert.deepEqual(
    parsed.entries.map((entry) => entry.path),
    ["src/a.ts", "src/b.ts", "gone.ts", "src/new.ts", "notes.txt", "conflict.ts"],
  );

  const rename = parsed.entries.find((entry) => entry.path === "src/new.ts");
  assert.equal(rename?.previousPath, "src/old.ts");
  const untracked = parsed.entries.find((entry) => entry.path === "notes.txt");
  assert.equal(untracked?.untracked, true);
});

test("porcelain v2 handles an initial commit and a detached HEAD", () => {
  const initial = parseStatusPorcelainV2(
    statusPayload({ head: "(initial)", entries: [{ kind: "untracked", path: "a.ts" }] }),
  );
  assert.equal(initial.head, undefined, "(initial) must not be reported as a commit id");
  assert.equal(initial.entries.length, 1);

  const detached = parseStatusPorcelainV2(statusPayload({ detached: true }));
  assert.equal(detached.detachedHead, true);
  assert.equal(detached.branch, undefined);
});

test("porcelain v2 parses paths containing spaces, because -z output is never quoted", () => {
  const parsed = parseStatusPorcelainV2(
    statusPayload({
      entries: [
        { kind: "ordinary", path: "docs/a file with spaces.md" },
        { kind: "untracked", path: "another odd name.txt" },
      ],
    }),
  );
  assert.deepEqual(
    parsed.entries.map((entry) => entry.path),
    ["docs/a file with spaces.md", "another odd name.txt"],
  );
});

test("numstat parses counts, renames, and binary markers", () => {
  const parsed = parseNumstatZ(
    numstatPayload([
      { path: "src/a.ts", insertions: 12, deletions: 3 },
      { path: "src/new.ts", previousPath: "src/old.ts", insertions: 2, deletions: 0 },
      { path: "assets/blob.bin", insertions: null, deletions: null },
    ]),
  );
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed[0], { path: "src/a.ts", insertions: 12, deletions: 3, binary: false });
  assert.equal(parsed[1]?.path, "src/new.ts");
  assert.equal(parsed[1]?.previousPath, "src/old.ts");
  assert.equal(parsed[2]?.binary, true);
  assert.equal(parsed[2]?.insertions, undefined, "a binary file must not report a line count");
});

test("collectGitState reports a non-repository as an actionable limitation, not a crash", async () => {
  const { runGit, calls } = fakeGit({ insideWorkTree: false });
  const collection = await collectGitState(runGit);
  assert.equal(collection.isGitRepository, false);
  assert.equal(collection.entries.length, 0);
  assert.equal(collection.limitations.length, 1);
  assert.match(collection.limitations[0] ?? "", /not inside a git worktree/);
  // It must stop after the cheap probe rather than issuing further calls.
  assert.deepEqual(calls, [["rev-parse", "--is-inside-work-tree"]]);
});

test("collectGitState sums staged and unstaged line counts for the same path", async () => {
  const { runGit } = fakeGit({
    status: statusPayload({ entries: [{ kind: "ordinary", path: "src/a.ts", x: "M", y: "M" }] }),
    stagedNumstat: numstatPayload([{ path: "src/a.ts", insertions: 5, deletions: 1 }]),
    unstagedNumstat: numstatPayload([{ path: "src/a.ts", insertions: 2, deletions: 3 }]),
  });
  const collection = await collectGitState(runGit);
  assert.deepEqual(collection.diffStats.get("src/a.ts"), {
    insertions: 7,
    deletions: 4,
    binary: false,
  });
});

test("a failed numstat degrades to a limitation while the change set survives", async () => {
  const { runGit } = fakeGit({
    status: statusPayload({ entries: [{ kind: "ordinary", path: "src/a.ts" }] }),
    failUnstagedNumstat: true,
  });
  const collection = await collectGitState(runGit);
  assert.equal(collection.entries.length, 1, "the change set must still be reported");
  assert.ok(
    collection.limitations.some((limitation) =>
      /unstaged changes are unavailable/.test(limitation),
    ),
    `expected a line-count limitation, got: ${collection.limitations.join(" | ")}`,
  );
});

test("a failed git status yields no invented changes", async () => {
  const { runGit } = fakeGit({ failStatus: true });
  const collection = await collectGitState(runGit);
  assert.equal(collection.isGitRepository, true);
  assert.deepEqual(collection.entries, []);
  assert.match(collection.limitations[0] ?? "", /git status failed/);
});

test("primaryStatus picks the most significant of the staged and worktree codes", () => {
  assert.equal(primaryStatus("?", "?"), "untracked");
  assert.equal(primaryStatus("U", "U"), "unmerged");
  assert.equal(primaryStatus("R", "M"), "renamed");
  assert.equal(primaryStatus("C", "."), "copied");
  assert.equal(primaryStatus("A", "."), "added");
  assert.equal(primaryStatus("D", "."), "deleted");
  assert.equal(primaryStatus(".", "D"), "deleted");
  assert.equal(primaryStatus("T", "."), "type_changed");
  assert.equal(primaryStatus("M", "."), "modified");
  assert.equal(primaryStatus(".", "M"), "modified");
});

test("a temporary directory that is not a repository is handled by the real runner too", async () => {
  const root = await tempDirectory();
  try {
    const runGit = createGitRunner(root, DEFAULT_INSPECTION_LIMITS);
    const collection = await collectGitState(runGit);
    assert.equal(collection.isGitRepository, false);
    assert.match(collection.limitations[0] ?? "", /not inside a git worktree/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
