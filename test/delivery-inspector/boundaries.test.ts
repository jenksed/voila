// Commit-boundary suggestions. The load-bearing assertions are disjointness (no path may appear in
// two boundaries), visibility (no path may silently disappear), and the collapse rules that stop the
// inspector recommending a pile of one-file commits.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  assertDisjoint,
  moduleKey,
  suggestCommitBoundaries,
} from "../../src/delivery-inspector/boundaries.ts";
import { classifyPath, topLevelArea } from "../../src/delivery-inspector/classify.ts";
import { InspectionInvariantError } from "../../src/delivery-inspector/errors.ts";
import type { ChangedFile, SuggestedCommitBoundary } from "../../src/delivery-inspector/types.ts";

function file(path: string): ChangedFile {
  const classification = classifyPath(path);
  return {
    path,
    status: "modified",
    staged: false,
    unstaged: true,
    untracked: false,
    category: classification.category,
    confidence: classification.confidence,
    categoryReason: classification.reason,
    binary: false,
    area: topLevelArea(path),
  };
}

function suggest(paths: string[]): ReturnType<typeof suggestCommitBoundaries> {
  return suggestCommitBoundaries(paths.map(file));
}

/** Every changed path must appear exactly once across boundaries plus the unassigned list. */
function assertTotalCoverage(
  paths: string[],
  result: ReturnType<typeof suggestCommitBoundaries>,
): void {
  const covered = [
    ...result.boundaries.flatMap((boundary) => boundary.paths),
    ...result.unassignedPaths,
  ].sort();
  assert.deepEqual(covered, [...paths].sort(), "no changed path may be lost or duplicated");
}

test("moduleKey keeps a module at two path segments", () => {
  assert.equal(moduleKey("src/domain/orientation.ts"), "src/domain");
  assert.equal(moduleKey("src/index.ts"), "src");
  assert.equal(moduleKey("build.js"), ".");
  assert.equal(moduleKey("src/ui/steward-console/navigation.ts"), "src/ui");
});

test("source groups with its directly related test", () => {
  const paths = ["src/domain/orientation.ts", "test/orientation.test.ts"];
  const result = suggest(paths);
  assert.equal(result.boundaries.length, 1);
  const boundary = result.boundaries[0] as SuggestedCommitBoundary;
  assert.equal(boundary.kind, "module_with_tests");
  assert.deepEqual(boundary.paths, ["src/domain/orientation.ts", "test/orientation.test.ts"]);
  assertTotalCoverage(paths, result);
});

test("a test that matches no changed source forms its own group", () => {
  const paths = [
    "src/domain/a.ts",
    "src/domain/b.ts",
    "test/a.test.ts",
    "test/unrelated-thing.test.ts",
    "docs/x.md",
    "tsconfig.json",
  ];
  const result = suggest(paths);
  const module = result.boundaries.find((boundary) => boundary.paths.includes("src/domain/a.ts"));
  assert.ok(module !== undefined);
  assert.ok(module.paths.includes("test/a.test.ts"), "a.test.ts must join the module it covers");
  const tests = result.boundaries.find((boundary) =>
    boundary.paths.includes("test/unrelated-thing.test.ts"),
  );
  assert.ok(tests !== undefined);
  assert.ok(
    !tests.paths.includes("src/domain/a.ts"),
    "an unmatched test must not be attached to an arbitrary module",
  );
  assertTotalCoverage(paths, result);
});

test("documentation-only changes become a single documentation boundary", () => {
  const paths = ["docs/design/A.md", "docs/design/B.md", "docs/architecture/C.md", "README.md"];
  const result = suggest(paths);
  assert.equal(result.boundaries.length, 1);
  const boundary = result.boundaries[0] as SuggestedCommitBoundary;
  assert.equal(boundary.kind, "documentation");
  assert.equal(boundary.suggestedType, "docs");
  assert.deepEqual(boundary.paths, [...paths].sort());
});

test("migrations travel with their tests and their documentation", () => {
  const paths = [
    "src/state/migration.ts",
    "test/migrate.test.ts",
    "docs/design/MIGRATION_NOTES.md",
    "src/domain/unrelated.ts",
    "src/domain/other.ts",
  ];
  const result = suggest(paths);
  const migration = result.boundaries.find((boundary) => boundary.kind === "migration");
  assert.ok(migration !== undefined);
  assert.deepEqual(migration.paths, [
    "docs/design/MIGRATION_NOTES.md",
    "src/state/migration.ts",
    "test/migrate.test.ts",
  ]);
  assert.ok(
    !migration.paths.includes("src/domain/unrelated.ts"),
    "unrelated source must not be pulled into the migration boundary",
  );
  assertTotalCoverage(paths, result);
});

test("unrelated top-level areas are suggested as separate boundaries", () => {
  const paths = [
    "src/domain/a.ts",
    "src/domain/b.ts",
    "test/a.test.ts",
    "docs/design/A.md",
    ".github/workflows/ci.yml",
    "package.json",
    "package-lock.json",
  ];
  const result = suggest(paths);
  assert.ok(result.boundaries.length >= 4, "distinct concerns must be split");
  const kinds = result.boundaries.map((boundary) => boundary.kind);
  assert.ok(kinds.includes("module_with_tests"));
  assert.ok(kinds.includes("documentation"));
  assert.ok(kinds.includes("ci"));
  assert.ok(kinds.includes("dependencies"));
  const dependencies = result.boundaries.find((boundary) => boundary.kind === "dependencies");
  assert.deepEqual(dependencies?.paths, ["package-lock.json", "package.json"]);
  assertTotalCoverage(paths, result);
});

test("suggested boundaries never overlap", () => {
  const paths = [
    ".github/workflows/ci.yml",
    ".newfang/project.json",
    ".newfang/status/STATUS.md",
    "Procfile",
    "dist/bundle.js",
    "docs/design/A.md",
    "docs/verification/PACKET_1.md",
    "package-lock.json",
    "package.json",
    "src/domain/a.ts",
    "src/state/migration.ts",
    "src/ui/view.ts",
    "test/a.test.ts",
    "test/migrate.test.ts",
    "tsconfig.json",
  ];
  const result = suggest(paths);
  const seen = new Map<string, string>();
  for (const boundary of result.boundaries) {
    for (const path of boundary.paths) {
      assert.ok(
        !seen.has(path),
        `"${path}" appears in both ${seen.get(path)} and ${boundary.id} — boundaries must be disjoint`,
      );
      seen.set(path, boundary.id);
    }
  }
  assertTotalCoverage(paths, result);
  // Ids are stable and sequential in emitted order.
  assert.deepEqual(
    result.boundaries.map((boundary) => boundary.id),
    result.boundaries.map((_, index) => `B${index + 1}`),
  );
});

test("unassigned paths stay visible instead of being forced into a group", () => {
  const paths = [
    "Procfile",
    "src/domain/a.ts",
    "src/domain/b.ts",
    "test/a.test.ts",
    "docs/design/A.md",
    "tsconfig.json",
  ];
  const result = suggest(paths);
  assert.deepEqual(result.unassignedPaths, ["Procfile"]);
  assert.ok(
    result.boundaries.every((boundary) => !boundary.paths.includes("Procfile")),
    "an unclassifiable path must not be silently grouped",
  );
  assert.ok(
    result.notes.some((note) => /not assigned to a suggested boundary/.test(note)),
    "the reason a path was left out must be stated",
  );
  assertTotalCoverage(paths, result);
});

test("one coherent commit is recommended for a small change set", () => {
  const paths = ["src/domain/a.ts", "docs/design/A.md", "tsconfig.json"];
  const result = suggest(paths);
  assert.equal(result.boundaries.length, 1);
  const boundary = result.boundaries[0] as SuggestedCommitBoundary;
  assert.equal(boundary.kind, "coherent_single_commit");
  assert.deepEqual(boundary.paths, [...paths].sort());
  assert.ok(result.notes.some((note) => /collapsed into one commit/.test(note)));
});

test("many one-file groups collapse rather than becoming many tiny commits", () => {
  const paths = [
    "src/domain/a.ts",
    "docs/design/A.md",
    "tsconfig.json",
    ".github/workflows/ci.yml",
    ".newfang/project.json",
  ];
  const result = suggest(paths);
  assert.equal(
    result.boundaries.length,
    1,
    "five single-file groups must not become five suggested commits",
  );
  assert.equal((result.boundaries[0] as SuggestedCommitBoundary).kind, "coherent_single_commit");
  assert.ok(result.notes.some((note) => /single file/.test(note)));
});

test("when boundaries are split, the advisory nature is stated explicitly", () => {
  const paths = [
    "src/domain/a.ts",
    "src/domain/b.ts",
    "src/domain/c.ts",
    "test/a.test.ts",
    "docs/design/A.md",
    "docs/design/B.md",
  ];
  const result = suggest(paths);
  assert.ok(result.boundaries.length > 1);
  assert.ok(
    result.notes.some((note) => /advisory/.test(note) && /no commit was created/.test(note)),
    "a split suggestion must say it is advisory and that nothing was committed",
  );
});

test("an empty change set produces no boundaries and no unassigned paths", () => {
  const result = suggestCommitBoundaries([]);
  assert.deepEqual(result.boundaries, []);
  assert.deepEqual(result.unassignedPaths, []);
});

test("boundary suggestion is deterministic", () => {
  const paths = [
    "src/domain/a.ts",
    "src/ui/view.ts",
    "test/a.test.ts",
    "docs/design/A.md",
    "docs/design/B.md",
    "package.json",
  ];
  const first = suggest(paths);
  const second = suggest([...paths].reverse());
  assert.deepEqual(second, first, "input order must not change the suggestion");
});

test("assertDisjoint throws when an overlap is constructed directly", () => {
  const overlapping: SuggestedCommitBoundary[] = [
    {
      id: "B1",
      kind: "documentation",
      paths: ["docs/a.md"],
      rationale: "docs",
      suggestedType: "docs",
    },
    {
      id: "B2",
      kind: "configuration",
      paths: ["docs/a.md"],
      rationale: "config",
      suggestedType: "chore",
    },
  ];
  assert.throws(() => assertDisjoint(overlapping), InspectionInvariantError);
  assert.throws(() => assertDisjoint(overlapping), /must be disjoint/);
});
