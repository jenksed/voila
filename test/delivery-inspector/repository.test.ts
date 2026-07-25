// Integration tests against real temporary git repositories.
//
// These exist because the parser tests can only prove the inspector reads the format it was told
// about. Here git itself produces the output, so a git-version behavior change would surface.
//
// Every repository is created under the OS temp directory with `git init`, is given its identity
// through per-invocation `-c` flags, and is removed afterwards. Nothing touches the project tree, the
// user's global git configuration, or the network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { rm, stat } from "node:fs/promises";
import { join } from "node:path";

import { inspectDelivery } from "../../src/delivery-inspector/inspect.ts";
import { git, porcelainFingerprint, put, tempDirectory, tempRepository } from "./support.ts";

const BASE_FILES: Record<string, string> = {
  "README.md": "# temp\n",
  "package.json": `${JSON.stringify({ name: "temp", scripts: { test: "node --test", verify: "tsc" } }, null, 2)}\n`,
  "src/keep.ts": "export const keep = 1;\n",
  "src/rename-me.ts": "export const renamed = 1;\n",
  "src/delete-me.ts": "export const doomed = 1;\n",
  "docs/design/A.md": "# design\n",
};

/** Run a body against a fresh repository, always cleaning up. */
async function withRepository(
  files: Record<string, string>,
  body: (root: string) => Promise<void>,
): Promise<void> {
  const root = await tempRepository(files);
  try {
    await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("a clean real repository reports clean with a branch and a HEAD", async () => {
  await withRepository(BASE_FILES, async (root) => {
    const result = await inspectDelivery(root);
    assert.equal(result.repository.isGitRepository, true);
    assert.equal(result.repository.branch, "main");
    assert.match(result.repository.head ?? "", /^[0-9a-f]{40}$/);
    assert.equal(result.repository.detachedHead, false);
    assert.equal(result.repository.dirty, false);
    assert.deepEqual(result.changes, []);
    assert.equal(result.summary.scope, "empty");
  });
});

test("staged, unstaged, untracked, renamed, and deleted changes are all observed", async () => {
  await withRepository(BASE_FILES, async (root) => {
    // Staged modification.
    await put(root, "src/keep.ts", "export const keep = 2;\n");
    git(root, ["add", "src/keep.ts"]);
    // Unstaged modification on a different file.
    await put(root, "docs/design/A.md", "# design\n\nmore\n");
    // Untracked file.
    await put(root, "notes.txt", "scratch\n");
    // Rename (staged by git mv).
    git(root, ["mv", "src/rename-me.ts", "src/renamed.ts"]);
    // Deletion.
    git(root, ["rm", "-q", "src/delete-me.ts"]);

    const result = await inspectDelivery(root);
    const byPath = new Map(result.changes.map((file) => [file.path, file]));

    assert.equal(byPath.get("src/keep.ts")?.staged, true);
    assert.equal(byPath.get("src/keep.ts")?.unstaged, false);
    assert.equal(byPath.get("docs/design/A.md")?.unstaged, true);
    assert.equal(byPath.get("docs/design/A.md")?.staged, false);
    assert.equal(byPath.get("notes.txt")?.untracked, true);
    assert.equal(byPath.get("notes.txt")?.status, "untracked");

    const renamed = byPath.get("src/renamed.ts");
    assert.equal(renamed?.status, "renamed");
    assert.equal(renamed?.previousPath, "src/rename-me.ts");

    assert.equal(byPath.get("src/delete-me.ts")?.status, "deleted");
    assert.equal(byPath.get("src/delete-me.ts")?.sizeBytes, undefined);

    assert.equal(result.repository.dirty, true);
    assert.equal(result.summary.renamedFiles, 1);
    assert.equal(result.summary.deletedFiles, 1);
    assert.equal(result.summary.untrackedFiles, 1);

    // Line counts came from real numstat output.
    assert.ok((byPath.get("src/keep.ts")?.insertions ?? 0) >= 1);
    // Every path is repository-relative: no absolute path may leak.
    for (const file of result.changes) {
      assert.ok(!file.path.startsWith("/"), `${file.path} must be repository-relative`);
      assert.ok(!file.path.includes(root), "the absolute root must never appear in a path");
    }
    assert.ok(!JSON.stringify(result).includes(root), "no absolute path may appear anywhere");
  });
});

test("a real binary change is detected", async () => {
  const nul = String.fromCharCode(0);
  await withRepository(
    { ...BASE_FILES, "assets/blob.bin": `${nul}${nul}original${nul}` },
    async (root) => {
      await put(root, "assets/blob.bin", `${nul}${nul}changed${nul}${nul}`);
      const result = await inspectDelivery(root);
      const blob = result.changes.find((file) => file.path === "assets/blob.bin");
      assert.equal(blob?.binary, true, "git reports '-' counts for a binary diff");
      assert.equal(blob?.insertions, undefined);
      assert.ok(result.attention.some((item) => item.kind === "binary_change"));
    },
  );
});

test("a fresh repository has no upstream and says so", async () => {
  await withRepository(BASE_FILES, async (root) => {
    const result = await inspectDelivery(root);
    assert.equal(result.repository.upstream, undefined);
    assert.equal(result.repository.ahead, undefined);
    assert.equal(result.repository.behind, undefined);
    assert.ok(
      result.limitations.some((limitation) => /No upstream is configured/.test(limitation)),
    );
  });
});

test("ahead and behind are reported for a real diverged clone", async () => {
  const origin = await tempRepository(BASE_FILES);
  const clone = await tempDirectory("nf-delivery-clone-");
  try {
    // A local clone: a filesystem path, never the network.
    git(clone, ["clone", "-q", origin, "work"]);
    const work = join(clone, "work");

    // Two commits ahead in the clone.
    await put(work, "src/keep.ts", "export const keep = 2;\n");
    git(work, ["commit", "-qam", "ahead one"]);
    await put(work, "src/keep.ts", "export const keep = 3;\n");
    git(work, ["commit", "-qam", "ahead two"]);

    // One commit behind: land something in origin, then fetch it locally.
    await put(origin, "src/other.ts", "export const other = 1;\n");
    git(origin, ["add", "-A"]);
    git(origin, ["commit", "-qm", "behind one"]);
    git(work, ["fetch", "-q", "origin"]);

    const result = await inspectDelivery(work);
    assert.match(result.repository.upstream ?? "", /^origin\//);
    assert.equal(result.repository.ahead, 2);
    assert.equal(result.repository.behind, 1);
    assert.equal(result.repository.dirty, false);
  } finally {
    await rm(origin, { recursive: true, force: true });
    await rm(clone, { recursive: true, force: true });
  }
});

test("a detached HEAD is reported from a real repository", async () => {
  await withRepository(BASE_FILES, async (root) => {
    git(root, ["checkout", "-q", "--detach", "HEAD"]);
    const result = await inspectDelivery(root);
    assert.equal(result.repository.detachedHead, true);
    assert.equal(result.repository.branch, undefined);
    assert.match(result.repository.head ?? "", /^[0-9a-f]{40}$/);
  });
});

test("a repository with no commits is handled", async () => {
  const root = await tempDirectory();
  try {
    git(root, ["init", "-q", "-b", "main"]);
    await put(root, "src/a.ts", "export const a = 1;\n");
    const result = await inspectDelivery(root);
    assert.equal(result.repository.isGitRepository, true);
    assert.equal(result.repository.head, undefined);
    assert.equal(result.changes.length, 1);
    assert.equal(result.changes[0]?.untracked, true);
    assert.ok(result.limitations.some((limitation) => /no commits yet/.test(limitation)));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a directory that is not a repository yields an actionable result", async () => {
  const root = await tempDirectory();
  try {
    await put(root, "package.json", JSON.stringify({ scripts: { test: "node --test" } }));
    const result = await inspectDelivery(root);
    assert.equal(result.repository.isGitRepository, false);
    assert.deepEqual(result.changes, []);
    assert.ok(
      result.limitations.some((limitation) => /not inside a git worktree/.test(limitation)),
    );
    assert.ok(
      result.discoveredVerificationCommands.some((command) => command.command === "npm test"),
      "the result must still carry something the caller can act on",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("INSPECTION MUTATES NOTHING: porcelain status is byte-identical before and after", async () => {
  await withRepository(BASE_FILES, async (root) => {
    // A representative dirty state: staged, unstaged, untracked, renamed, and deleted.
    await put(root, "src/keep.ts", "export const keep = 2;\n");
    git(root, ["add", "src/keep.ts"]);
    await put(root, "docs/design/A.md", "# design\n\nmore\n");
    await put(root, "notes.txt", "scratch\n");
    git(root, ["mv", "src/rename-me.ts", "src/renamed.ts"]);
    git(root, ["rm", "-q", "src/delete-me.ts"]);

    // Warm the index first, so the baseline is not attributed to the inspector.
    porcelainFingerprint(root);
    const beforeStatus = porcelainFingerprint(root);
    const beforeHead = git(root, ["rev-parse", "HEAD"]);
    const beforeLog = git(root, ["log", "--oneline"]);
    const beforeIndex = await stat(join(root, ".git", "index"));

    await inspectDelivery(root);
    await inspectDelivery(root);

    // Stat the index BEFORE running any further git command, so the measurement attributes index
    // changes to the inspector and to nothing else.
    const afterIndex = await stat(join(root, ".git", "index"));
    const afterStatus = porcelainFingerprint(root);

    assert.equal(
      afterStatus,
      beforeStatus,
      "git status --porcelain must be byte-identical after inspection",
    );
    assert.equal(git(root, ["rev-parse", "HEAD"]), beforeHead, "HEAD must not move");
    assert.equal(git(root, ["log", "--oneline"]), beforeLog, "no commit may be created");
    assert.equal(
      afterIndex.size,
      beforeIndex.size,
      "the git index size must not change — nothing may be staged",
    );
    assert.equal(
      afterIndex.mtimeMs,
      beforeIndex.mtimeMs,
      "the git index must not be rewritten (GIT_OPTIONAL_LOCKS=0 prevents an opportunistic refresh)",
    );
    // No stash was created.
    assert.equal(git(root, ["stash", "list"]), "");
  });
});

test("inspecting a real repository twice yields an identical result", async () => {
  await withRepository(BASE_FILES, async (root) => {
    await put(root, "src/keep.ts", "export const keep = 2;\n");
    git(root, ["add", "src/keep.ts"]);
    await put(root, "notes.txt", "scratch\n");

    const first = await inspectDelivery(root);
    const second = await inspectDelivery(root);
    assert.equal(JSON.stringify(first), JSON.stringify(second));
  });
});

test("real command discovery finds manifest scripts and never marks them verified", async () => {
  await withRepository(
    {
      ...BASE_FILES,
      "docs/DEVELOPMENT.md": "Run `npm run verify` before delivering.\n",
      Makefile: "check:\n\techo hi\n",
    },
    async (root) => {
      const result = await inspectDelivery(root);
      const names = result.discoveredVerificationCommands.map((command) => command.command);
      assert.ok(names.includes("npm test"));
      assert.ok(names.includes("npm run verify"));
      assert.ok(names.includes("make check"));
      for (const command of result.discoveredVerificationCommands) {
        assert.equal(command.executed, false);
        assert.ok(command.source.length > 0);
        assert.ok(!command.source.startsWith("/"), "provenance must be repository-relative");
      }
      const verify = result.discoveredVerificationCommands.find(
        (command) => command.command === "npm run verify",
      );
      assert.equal(
        verify?.basis,
        "declared_in_manifest",
        "the manifest declaration must outrank the documented mention",
      );
    },
  );
});

test("a real untracked environment file is flagged without echoing its contents", async () => {
  await withRepository(BASE_FILES, async (root) => {
    const leaked = "unmistakable-real-looking-value-9271";
    await put(root, ".env", `DATABASE_PASSWORD="${leaked}"\n`);

    const result = await inspectDelivery(root);
    const serialized = JSON.stringify(result);
    assert.ok(!serialized.includes(leaked), "the value inside a real .env must never be returned");

    const kinds = result.attention.map((item) => item.kind);
    assert.ok(kinds.includes("environment_file_changed"));
    assert.ok(
      kinds.includes("possible_secret_content_pattern"),
      "the credential-shaped assignment should be detected by rule name",
    );
    const item = result.attention.find(
      (candidate) => candidate.kind === "possible_secret_content_pattern",
    );
    assert.deepEqual(item?.paths, [".env"]);
    assert.match(item?.reason ?? "", /assigned_credential_literal/);
  });
});

test("a real repository with unrelated areas gets multiple advisory boundaries", async () => {
  await withRepository(BASE_FILES, async (root) => {
    await put(root, "src/keep.ts", "export const keep = 2;\n");
    await put(root, "src/extra.ts", "export const extra = 1;\n");
    await put(root, "test/keep.test.ts", "// test\n");
    await put(root, "docs/design/A.md", "# design\n\nmore\n");
    await put(root, "docs/design/B.md", "# b\n");
    await put(root, ".github/workflows/ci.yml", "name: ci\n");

    const result = await inspectDelivery(root);
    assert.ok(result.suggestedBoundaries.length > 1, "distinct concerns should be split");

    // Disjointness holds against real git output too.
    const seen = new Set<string>();
    for (const boundary of result.suggestedBoundaries) {
      for (const path of boundary.paths) {
        assert.ok(!seen.has(path), `${path} appears in more than one boundary`);
        seen.add(path);
      }
    }
    assert.deepEqual(
      [...seen, ...result.unassignedPaths].sort(),
      result.changes.map((file) => file.path).sort(),
      "every change must be either grouped or explicitly unassigned",
    );
    assert.ok(
      result.limitations.some((limitation) => /advisory/.test(limitation)),
      "the advisory nature must be recorded",
    );
  });
});
