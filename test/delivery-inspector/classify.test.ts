// Classification is a total, deterministic function of the path string. These tests pin the
// categories, the confidence levels, and the rule ORDER, because order is what makes the classifier
// predictable rather than merely plausible.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  classifyPath,
  dependencyFacts,
  isEnvironmentFile,
  looksLikeCredentialStore,
  looksLikePrivateKeyFile,
  looksLikeSecretFilename,
  pathStem,
  topLevelArea,
} from "../../src/delivery-inspector/classify.ts";
import { CHANGE_CATEGORIES } from "../../src/delivery-inspector/types.ts";

test("every category is reachable and each classification names its evidence", () => {
  const expectations: [string, string][] = [
    ["src/domain/orientation.ts", "source"],
    ["test/orientation.test.ts", "test"],
    ["docs/design/DELIVERY_INSPECTOR.md", "documentation"],
    ["tsconfig.json", "configuration"],
    ["src/state/migration.ts", "migration"],
    ["dist/bundle.js", "generated"],
    ["package-lock.json", "dependency_metadata"],
    ["docs/verification/PACKET_1_FOUNDATION.md", "verification_evidence"],
    [".newfang/project.json", "project_state"],
    [".github/workflows/ci.yml", "ci"],
    ["Procfile", "unknown"],
  ];

  const seen = new Set<string>();
  for (const [path, category] of expectations) {
    const result = classifyPath(path);
    assert.equal(result.category, category, `expected ${path} to classify as ${category}`);
    assert.ok(result.reason.length > 0, `${path} must state why it was classified`);
    assert.ok(["high", "medium", "low"].includes(result.confidence));
    seen.add(category);
  }
  // Fail loudly if a category is added to the vocabulary without a classification example.
  for (const category of CHANGE_CATEGORIES) {
    assert.ok(seen.has(category), `no classification example covers the "${category}" category`);
  }
});

test("classification is deterministic and total", () => {
  const paths = [
    "src/a.ts",
    "weird file with spaces.md",
    "no-extension-file",
    "a/b/c/d/e.rs",
    ".hidden",
  ];
  for (const path of paths) {
    const first = classifyPath(path);
    const second = classifyPath(path);
    assert.deepEqual(first, second, `${path} must classify identically every time`);
    assert.ok(CHANGE_CATEGORIES.includes(first.category));
  }
});

test("rule order resolves the paths that could match more than one rule", () => {
  // Generated NewFang views must not be read as documentation or as canonical state.
  assert.equal(classifyPath(".newfang/status/STATUS.md").category, "generated");
  assert.equal(classifyPath(".newfang/project.json").category, "project_state");
  // A workflow file is CI, not generic YAML configuration.
  assert.equal(classifyPath(".github/workflows/verify.yml").category, "ci");
  // package.json is a dependency manifest, not configuration.
  assert.equal(classifyPath("package.json").category, "dependency_metadata");
  // Verification evidence outranks documentation.
  assert.equal(classifyPath("docs/verification/PACKET_5A.md").category, "verification_evidence");
  // A document about migrations stays documentation.
  assert.equal(classifyPath("docs/design/MIGRATIONS.md").category, "documentation");
  // A migration test is a test, not a migration.
  assert.equal(classifyPath("test/migrate.test.ts").category, "test");
  // But a migration module is a migration.
  assert.equal(classifyPath("src/state/migration.ts").category, "migration");
  // A test directory beats the source extension.
  assert.equal(classifyPath("test/fixtures/console.ts").category, "test");
});

test("low confidence is reserved for genuine guesses", () => {
  assert.equal(classifyPath("Procfile").confidence, "low");
  assert.equal(classifyPath("src/index.ts").confidence, "high");
  assert.equal(classifyPath("assets/logo.png").category, "unknown");
  assert.equal(
    classifyPath("assets/logo.png").confidence,
    "medium",
    "a known binary asset extension is a medium-confidence 'not attributable', not a wild guess",
  );
});

test("topLevelArea reports the first segment, or '.' at the repository root", () => {
  assert.equal(topLevelArea("src/domain/types.ts"), "src");
  assert.equal(topLevelArea("README.md"), ".");
  assert.equal(topLevelArea(".github/workflows/ci.yml"), ".github");
});

test("dependency manifests and locks are paired by ecosystem", () => {
  assert.deepEqual(dependencyFacts("package.json"), { role: "manifest", ecosystem: "npm" });
  assert.deepEqual(dependencyFacts("package-lock.json"), { role: "lock", ecosystem: "npm" });
  assert.deepEqual(dependencyFacts("Cargo.lock"), { role: "lock", ecosystem: "cargo" });
  assert.equal(dependencyFacts("src/index.ts"), undefined);
});

test("credential-shaped names are recognized from the filename alone", () => {
  assert.ok(looksLikeSecretFilename("config/secrets.yml"));
  assert.ok(looksLikeSecretFilename("api_key.txt"));
  // Known, accepted false positive: "tokenizer" contains "token". The heuristic errs toward looking,
  // and the resulting item is phrased as a possibility rather than a finding.
  assert.ok(looksLikeSecretFilename("src/tokenizer.ts"));
  assert.ok(!looksLikeSecretFilename("src/index.ts"));
  assert.ok(looksLikeCredentialStore(".npmrc"));
  assert.ok(looksLikeCredentialStore("release.keystore"));
  assert.ok(looksLikePrivateKeyFile("certs/server.pem"));
  assert.ok(looksLikePrivateKeyFile("id_ed25519"));
  assert.ok(!looksLikePrivateKeyFile("src/keyboard.ts"));
});

test("environment templates are excluded but real environment files are not", () => {
  assert.ok(isEnvironmentFile(".env"));
  assert.ok(isEnvironmentFile(".env.production"));
  assert.ok(!isEnvironmentFile(".env.example"));
  assert.ok(!isEnvironmentFile(".env.sample"));
  assert.ok(!looksLikeSecretFilename(".env.example"));
});

test("pathStem strips extensions and test suffixes so tests can be matched to sources", () => {
  assert.equal(pathStem("test/orientation.test.ts"), "orientation");
  assert.equal(pathStem("src/domain/orientation.ts"), "orientation");
  assert.equal(pathStem("test/console.navigation.test.ts"), "console.navigation");
  assert.equal(pathStem("pkg/thing_test.go"), "thing");
  assert.equal(pathStem("tests/test_thing.py"), "thing");
});
