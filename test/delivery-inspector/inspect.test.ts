// `inspectDelivery` end to end, driven entirely by the injectable seams: a fake git runner replaying
// recorded `-z` payloads and an in-memory filesystem. No real repository is involved, so these tests
// are fast, deterministic, and independent of the developer's git version and configuration.

import { test } from "node:test";
import assert from "node:assert/strict";

import { createMemoryFileSystem } from "../../src/delivery-inspector/fs.ts";
import { InspectionRootError } from "../../src/delivery-inspector/errors.ts";
import { inspectDelivery } from "../../src/delivery-inspector/inspect.ts";
import type { DeliveryInspection } from "../../src/delivery-inspector/types.ts";
import { DEFAULT_INSPECTION_LIMITS } from "../../src/delivery-inspector/types.ts";
import { fakeGit, numstatPayload, statusPayload } from "./support.ts";
import type { FakeGitSpec, StatusEntrySpec } from "./support.ts";

interface InspectFixture {
  entries?: StatusEntrySpec[];
  files?: Record<string, string>;
  branch?: string;
  head?: string;
  upstream?: string;
  ahead?: number;
  behind?: number;
  detached?: boolean;
  staged?: Parameters<typeof numstatPayload>[0];
  unstaged?: Parameters<typeof numstatPayload>[0];
  git?: Partial<FakeGitSpec>;
  limits?: Partial<typeof DEFAULT_INSPECTION_LIMITS>;
}

async function inspect(fixture: InspectFixture = {}): Promise<DeliveryInspection> {
  const { runGit } = fakeGit({
    status: statusPayload({
      ...(fixture.head !== undefined ? { head: fixture.head } : {}),
      ...(fixture.branch !== undefined ? { branch: fixture.branch } : {}),
      ...(fixture.detached !== undefined ? { detached: fixture.detached } : {}),
      ...(fixture.upstream !== undefined ? { upstream: fixture.upstream } : {}),
      ...(fixture.ahead !== undefined ? { ahead: fixture.ahead } : {}),
      ...(fixture.behind !== undefined ? { behind: fixture.behind } : {}),
      entries: fixture.entries ?? [],
    }),
    stagedNumstat: numstatPayload(fixture.staged ?? []),
    unstagedNumstat: numstatPayload(fixture.unstaged ?? []),
    ...fixture.git,
  });
  return inspectDelivery("/virtual/root", {
    runGit,
    fileSystem: createMemoryFileSystem(fixture.files ?? {}),
    ...(fixture.limits !== undefined ? { limits: fixture.limits } : {}),
  });
}

test("a clean repository reports no changes and an empty scope", async () => {
  const result = await inspect({ branch: "main", head: "deadbeef" });
  assert.equal(result.repository.isGitRepository, true);
  assert.equal(result.repository.branch, "main");
  assert.equal(result.repository.head, "deadbeef");
  assert.equal(result.repository.dirty, false);
  assert.deepEqual(result.changes, []);
  assert.equal(result.summary.totalFiles, 0);
  assert.equal(result.summary.scope, "empty");
  assert.deepEqual(result.attention, []);
  assert.deepEqual(result.suggestedBoundaries, []);
});

test("staged, unstaged, and untracked changes are distinguished", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/staged.ts", x: "M", y: "." },
      { kind: "ordinary", path: "src/unstaged.ts", x: ".", y: "M" },
      { kind: "ordinary", path: "src/both.ts", x: "M", y: "M" },
      { kind: "untracked", path: "src/new.ts" },
    ],
  });
  const byPath = new Map(result.changes.map((file) => [file.path, file]));
  assert.deepEqual(
    [byPath.get("src/staged.ts")?.staged, byPath.get("src/staged.ts")?.unstaged],
    [true, false],
  );
  assert.deepEqual(
    [byPath.get("src/unstaged.ts")?.staged, byPath.get("src/unstaged.ts")?.unstaged],
    [false, true],
  );
  assert.deepEqual(
    [byPath.get("src/both.ts")?.staged, byPath.get("src/both.ts")?.unstaged],
    [true, true],
  );
  assert.equal(byPath.get("src/new.ts")?.untracked, true);
  assert.equal(byPath.get("src/new.ts")?.status, "untracked");

  assert.equal(result.summary.stagedFiles, 2);
  assert.equal(result.summary.unstagedFiles, 2);
  assert.equal(result.summary.untrackedFiles, 1);
  assert.equal(result.repository.dirty, true);
});

test("a rename reports both paths and is counted as a rename", async () => {
  const result = await inspect({
    entries: [{ kind: "rename", path: "src/new.ts", previousPath: "src/old.ts", x: "R", y: "." }],
    staged: [{ path: "src/new.ts", previousPath: "src/old.ts", insertions: 0, deletions: 0 }],
  });
  const file = result.changes[0];
  assert.equal(file?.path, "src/new.ts");
  assert.equal(file?.previousPath, "src/old.ts");
  assert.equal(file?.status, "renamed");
  assert.equal(result.summary.renamedFiles, 1);
});

test("a deletion is reported without a size and without reading bytes", async () => {
  const result = await inspect({
    entries: [{ kind: "ordinary", path: "src/gone.ts", x: "D", y: "." }],
    staged: [{ path: "src/gone.ts", insertions: 0, deletions: 12 }],
    // The file is deliberately absent from the filesystem fixture.
  });
  const file = result.changes[0];
  assert.equal(file?.status, "deleted");
  assert.equal(file?.sizeBytes, undefined);
  assert.equal(file?.deletions, 12);
  assert.equal(result.summary.deletedFiles, 1);
});

test("a binary file is detected from numstat and from bytes", async () => {
  const nul = String.fromCharCode(0);
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "assets/tracked.bin", x: "M", y: "." },
      { kind: "untracked", path: "assets/untracked.bin" },
    ],
    staged: [{ path: "assets/tracked.bin", insertions: null, deletions: null }],
    files: { "assets/untracked.bin": `${nul}${nul}not text${nul}` },
  });
  const byPath = new Map(result.changes.map((file) => [file.path, file]));
  assert.equal(byPath.get("assets/tracked.bin")?.binary, true, "numstat '-' means binary");
  assert.equal(
    byPath.get("assets/untracked.bin")?.binary,
    true,
    "an untracked binary must be detected from its bytes",
  );
  assert.equal(result.summary.binaryFiles, 2);
});

test("outside a git repository the result is actionable rather than a crash", async () => {
  const result = await inspect({
    git: { insideWorkTree: false },
    files: { "package.json": JSON.stringify({ scripts: { test: "node --test" } }) },
  });
  assert.equal(result.repository.isGitRepository, false);
  assert.equal(result.repository.dirty, false);
  assert.deepEqual(result.changes, []);
  assert.ok(
    result.limitations.some((limitation) => /not inside a git worktree/.test(limitation)),
    "the reason must be stated",
  );
  assert.ok(
    result.discoveredVerificationCommands.some((command) => command.command === "npm test"),
    "command discovery must still run outside git, so the result remains useful",
  );
});

test("a missing upstream is reported as a limitation, not an invented count", async () => {
  const result = await inspect({ branch: "main" });
  assert.equal(result.repository.upstream, undefined);
  assert.equal(result.repository.ahead, undefined);
  assert.equal(result.repository.behind, undefined);
  assert.ok(result.limitations.some((limitation) => /No upstream is configured/.test(limitation)));
});

test("ahead and behind counts are reported when git resolves them", async () => {
  const result = await inspect({
    branch: "feat/x",
    upstream: "origin/feat/x",
    ahead: 3,
    behind: 2,
  });
  assert.equal(result.repository.upstream, "origin/feat/x");
  assert.equal(result.repository.ahead, 3);
  assert.equal(result.repository.behind, 2);
  assert.ok(!result.limitations.some((limitation) => /No upstream is configured/.test(limitation)));
});

test("a detached HEAD is reported without inventing a branch", async () => {
  const result = await inspect({ detached: true, head: "abc123" });
  assert.equal(result.repository.detachedHead, true);
  assert.equal(result.repository.branch, undefined);
  assert.equal(result.repository.head, "abc123");
});

test("a repository with no commits reports no HEAD and says why", async () => {
  const result = await inspect({
    head: "(initial)",
    entries: [{ kind: "untracked", path: "src/a.ts" }],
  });
  assert.equal(result.repository.head, undefined);
  assert.ok(result.limitations.some((limitation) => /no commits yet/.test(limitation)));
});

test("every changed file carries a category, a confidence, and a stated reason", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/a.ts" },
      { kind: "ordinary", path: "test/a.test.ts" },
      { kind: "ordinary", path: "docs/design/A.md" },
      { kind: "ordinary", path: "package-lock.json" },
      { kind: "ordinary", path: "Procfile" },
    ],
  });
  const byPath = new Map(result.changes.map((file) => [file.path, file]));
  assert.equal(byPath.get("src/a.ts")?.category, "source");
  assert.equal(byPath.get("test/a.test.ts")?.category, "test");
  assert.equal(byPath.get("docs/design/A.md")?.category, "documentation");
  assert.equal(byPath.get("package-lock.json")?.category, "dependency_metadata");
  assert.equal(byPath.get("Procfile")?.category, "unknown");
  for (const file of result.changes) {
    assert.ok(file.categoryReason.length > 0, `${file.path} must explain its category`);
    assert.ok(["high", "medium", "low"].includes(file.confidence));
  }
  assert.equal(result.summary.byCategory.source, 1);
  assert.equal(result.summary.byCategory.unknown, 1);
  // The category map is total and ordered, so serialization is stable.
  assert.equal(Object.keys(result.summary.byCategory).length, 11);
  assert.equal(Object.keys(result.summary.byCategory)[0], "source");
});

test("a suspicious filename is surfaced without asserting the file's content", async () => {
  const result = await inspect({
    entries: [
      { kind: "untracked", path: ".env.production" },
      { kind: "untracked", path: "certs/server.pem" },
    ],
    files: { ".env.production": "HARMLESS=1\n", "certs/server.pem": "not really a key\n" },
  });
  const kinds = result.attention.map((item) => item.kind);
  assert.ok(kinds.includes("environment_file_changed"));
  assert.ok(kinds.includes("possible_private_key_file"));
  for (const item of result.attention) {
    assert.ok(!/HARMLESS/.test(item.reason), "file content must never appear in a reason");
  }
});

test("NO SUSPECTED SECRET VALUE EVER APPEARS IN THE RETURNED STRUCTURE", async () => {
  // Distinctive, obviously fake values, each shaped to trip a different marker rule.
  const awsKey = "AKIAZZZZTESTONLY1234";
  const githubToken = "ghp_ZZZZtestonlyZZZZtestonlyZZZZtestonly";
  const passwordLiteral = "hunter2-unmistakable-literal";
  const keyBody = "MIIBOgIBAAJBAKtestonlyNOTAREALKEYtestonly";

  const files = {
    "src/config.ts": [
      `export const AWS = "${awsKey}";`,
      `export const GITHUB = "${githubToken}";`,
      `export const password = "${passwordLiteral}";`,
      "",
    ].join("\n"),
    "certs/server.key": [
      "-----BEGIN RSA PRIVATE KEY-----",
      keyBody,
      "-----END RSA PRIVATE KEY-----",
      "",
    ].join("\n"),
  };

  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/config.ts", x: "M", y: "." },
      { kind: "untracked", path: "certs/server.key" },
    ],
    files,
  });

  // The whole returned structure is serialized and searched. Nothing sensitive may survive anywhere:
  // not in a reason, not in a suggestion, not in a limitation, not in a boundary rationale.
  const serialized = JSON.stringify(result);
  for (const secret of [awsKey, githubToken, passwordLiteral, keyBody]) {
    assert.ok(
      !serialized.includes(secret),
      `the returned inspection leaked a suspected secret value: ${secret.slice(0, 6)}...`,
    );
  }
  // Substrings long enough to be recognizable must not leak either.
  assert.ok(!serialized.includes("AKIA"), "not even a credential prefix may be echoed");
  assert.ok(!serialized.includes("BEGIN RSA PRIVATE KEY"), "no key header may be echoed");
  assert.ok(!serialized.includes("hunter2"), "no password literal may be echoed");

  // The detection itself must still be reported, by path and rule name only.
  const contentItems = result.attention.filter(
    (item) => item.kind === "possible_secret_content_pattern",
  );
  assert.equal(contentItems.length, 2, "both files must be flagged");
  assert.deepEqual(contentItems.flatMap((item) => item.paths).sort(), [
    "certs/server.key",
    "src/config.ts",
  ]);
  assert.ok(
    contentItems.some((item) => /aws_access_key_id/.test(item.reason)),
    "the rule name is the only detail that may be surfaced",
  );
  assert.ok(contentItems.some((item) => /private_key_block/.test(item.reason)));
});

test("a dependency manifest and lock mismatch is surfaced both ways", async () => {
  const lockOnly = await inspect({
    entries: [{ kind: "ordinary", path: "package-lock.json" }],
  });
  assert.ok(lockOnly.attention.some((item) => item.kind === "dependency_lock_without_manifest"));

  const manifestOnly = await inspect({
    entries: [{ kind: "ordinary", path: "package.json" }],
  });
  assert.ok(
    manifestOnly.attention.some((item) => item.kind === "dependency_manifest_without_lock"),
  );
});

test("source without tests and migrations without tests are both surfaced", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/a.ts" },
      { kind: "ordinary", path: "src/state/migration.ts" },
    ],
  });
  const kinds = result.attention.map((item) => item.kind);
  assert.ok(kinds.includes("source_without_test"));
  assert.ok(kinds.includes("migration_without_test"));
});

test("suggested boundaries never overlap and unassigned paths stay visible", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/domain/a.ts" },
      { kind: "ordinary", path: "src/domain/b.ts" },
      { kind: "ordinary", path: "test/a.test.ts" },
      { kind: "ordinary", path: "docs/design/A.md" },
      { kind: "ordinary", path: ".github/workflows/ci.yml" },
      { kind: "ordinary", path: "package.json" },
      { kind: "ordinary", path: "package-lock.json" },
      { kind: "untracked", path: "Procfile" },
    ],
  });
  const seen = new Set<string>();
  for (const boundary of result.suggestedBoundaries) {
    for (const path of boundary.paths) {
      assert.ok(!seen.has(path), `${path} appears in more than one boundary`);
      seen.add(path);
    }
  }
  assert.deepEqual(result.unassignedPaths, ["Procfile"]);
  assert.ok(!seen.has("Procfile"));
  // Coverage: every change is either in a boundary or explicitly unassigned.
  assert.deepEqual(
    [...seen, ...result.unassignedPaths].sort(),
    result.changes.map((file) => file.path).sort(),
  );
});

test("discovered commands are never presented as verified, and the caveat is recorded", async () => {
  const result = await inspect({
    files: {
      "package.json": JSON.stringify({ scripts: { verify: "tsc", test: "node --test" } }),
    },
  });
  assert.ok(result.discoveredVerificationCommands.length > 0);
  for (const command of result.discoveredVerificationCommands) {
    assert.equal(command.executed, false);
  }
  assert.ok(
    result.limitations.some((limitation) => /NOT executed and are NOT verified/.test(limitation)),
    "the result must state that discovery is not verification",
  );
});

test("the same input produces a byte-identical result", async () => {
  const fixture: InspectFixture = {
    branch: "feat/x",
    upstream: "origin/feat/x",
    ahead: 1,
    behind: 0,
    entries: [
      { kind: "ordinary", path: "src/domain/b.ts", x: "M", y: "." },
      { kind: "ordinary", path: "src/domain/a.ts", x: ".", y: "M" },
      { kind: "rename", path: "src/new.ts", previousPath: "src/old.ts", x: "R", y: "." },
      { kind: "untracked", path: "docs/notes.md" },
    ],
    staged: [{ path: "src/domain/b.ts", insertions: 4, deletions: 1 }],
    unstaged: [{ path: "src/domain/a.ts", insertions: 2, deletions: 2 }],
    files: {
      "package.json": JSON.stringify({ scripts: { verify: "tsc" } }),
      "docs/notes.md": "# notes\n",
      "src/domain/a.ts": "export const a = 1;\n",
      "src/domain/b.ts": "export const b = 2;\n",
    },
  };
  const first = await inspect(fixture);
  const second = await inspect(fixture);
  assert.equal(
    JSON.stringify(first, null, 2),
    JSON.stringify(second, null, 2),
    "the inspection must serialize identically for identical input",
  );
  // No timestamp may leak into the result, or determinism would be impossible.
  assert.ok(!/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(JSON.stringify(first)));
});

test("limitations are sorted and de-duplicated", async () => {
  const result = await inspect({ entries: [{ kind: "ordinary", path: "src/a.ts" }] });
  assert.deepEqual(result.limitations, [...result.limitations].sort());
  assert.equal(new Set(result.limitations).size, result.limitations.length);
});

test("the file cap bounds the inspection and says so", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/a.ts" },
      { kind: "ordinary", path: "src/b.ts" },
      { kind: "ordinary", path: "src/c.ts" },
    ],
    limits: { maxFilesInspected: 2 },
  });
  assert.equal(result.changes.length, 2);
  assert.ok(
    result.limitations.some((limitation) => /capped at 2/.test(limitation)),
    "a truncated change set must be declared incomplete",
  );
});

test("the content-scan cap is reported and marks the files it skipped", async () => {
  const result = await inspect({
    entries: [
      { kind: "ordinary", path: "src/a.ts" },
      { kind: "ordinary", path: "src/b.ts" },
    ],
    files: { "src/a.ts": "const a = 1;\n", "src/b.ts": "const b = 2;\n" },
    limits: { maxFilesContentScanned: 1 },
  });
  const capped = result.changes.filter((file) => file.inspectionCapped === true);
  assert.equal(capped.length, 1);
  assert.equal(capped[0]?.path, "src/b.ts");
  assert.ok(
    result.limitations.some((limitation) => /content-inspection cap of 1 files/.test(limitation)),
  );
});

test("a partial git failure yields a partial result with the failure recorded", async () => {
  const result = await inspect({
    entries: [{ kind: "ordinary", path: "src/a.ts", x: ".", y: "M" }],
    git: { failUnstagedNumstat: true },
  });
  assert.equal(result.changes.length, 1, "the change set must survive a numstat failure");
  assert.equal(result.changes[0]?.insertions, undefined);
  assert.ok(
    result.limitations.some((limitation) => /Line counts for unstaged changes/.test(limitation)),
  );
});

test("the inspector only ever asks git for read-only inspections", async () => {
  const { runGit, calls } = fakeGit({
    status: statusPayload({ entries: [{ kind: "ordinary", path: "src/a.ts" }] }),
  });
  await inspectDelivery("/virtual/root", {
    runGit,
    fileSystem: createMemoryFileSystem({}),
  });
  assert.ok(calls.length > 0);
  for (const args of calls) {
    assert.ok(
      ["rev-parse", "status", "diff"].includes(args[0] ?? ""),
      `the inspector issued a non-read-only subcommand: git ${args.join(" ")}`,
    );
    assert.ok(
      !args.some((arg) => /^(--write|--index|--cached-only)$/.test(arg)),
      `unexpected mutating flag in: git ${args.join(" ")}`,
    );
  }
});

test("an unusable root is rejected with a typed error", async () => {
  await assert.rejects(() => inspectDelivery(""), InspectionRootError);
  await assert.rejects(
    () => inspectDelivery("/definitely/does/not/exist/anywhere-12345"),
    InspectionRootError,
  );
});
