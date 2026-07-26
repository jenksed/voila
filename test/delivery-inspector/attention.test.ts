// Attention heuristics. Each test asserts both that the item fires and that its language stays honest:
// a heuristic may say "possible" or "potentially missing", never "confirmed".

import { test } from "node:test";
import assert from "node:assert/strict";

import { detectAttention } from "../../src/delivery-inspector/attention.ts";
import { classifyPath, topLevelArea } from "../../src/delivery-inspector/classify.ts";
import type { ContentScanFinding } from "../../src/delivery-inspector/scan.ts";
import type {
  AttentionKind,
  ChangedFile,
  DeliveryAttentionItem,
} from "../../src/delivery-inspector/types.ts";
import { DEFAULT_INSPECTION_LIMITS } from "../../src/delivery-inspector/types.ts";

/** Build a ChangedFile using the real classifier, so tests exercise production categories. */
function file(path: string, over: Partial<ChangedFile> = {}): ChangedFile {
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
    ...over,
  };
}

function detect(
  changes: ChangedFile[],
  options: { contentFindings?: ContentScanFinding[]; docsDirectoryPresent?: boolean } = {},
): DeliveryAttentionItem[] {
  return detectAttention({
    changes,
    contentFindings: options.contentFindings ?? [],
    docsDirectoryPresent: options.docsDirectoryPresent ?? false,
    limits: DEFAULT_INSPECTION_LIMITS,
  });
}

function kinds(items: DeliveryAttentionItem[]): AttentionKind[] {
  return items.map((item) => item.kind);
}

function find(items: DeliveryAttentionItem[], kind: AttentionKind): DeliveryAttentionItem {
  const item = items.find((candidate) => candidate.kind === kind);
  assert.ok(item !== undefined, `expected an attention item of kind "${kind}"`);
  return item;
}

test("a clean, well-formed change set raises nothing", () => {
  const items = detect([file("src/a.ts"), file("test/a.test.ts"), file("docs/design/A.md")]);
  assert.deepEqual(items, []);
});

test("credential-shaped filenames, stores, keys, and env files are all flagged", () => {
  const items = detect([
    file("config/secrets.yml"),
    file(".npmrc"),
    file("certs/server.pem"),
    file(".env.production"),
  ]);
  assert.equal(find(items, "possible_secret_filename").severity, "inspect_before_delivery");
  assert.equal(find(items, "possible_credential_store").severity, "inspect_before_delivery");
  assert.equal(find(items, "possible_private_key_file").severity, "inspect_before_delivery");
  assert.equal(find(items, "environment_file_changed").severity, "inspect_before_delivery");
});

test("a checked-in environment template is not treated as a real environment file", () => {
  const items = detect([file(".env.example")]);
  assert.ok(!kinds(items).includes("environment_file_changed"));
  assert.ok(!kinds(items).includes("possible_secret_filename"));
});

test("a credential-shaped name in a fixture path is downgraded, not dropped", () => {
  const items = detect([file("test/fixtures/api_key.txt")]);
  const item = find(items, "possible_secret_filename");
  assert.equal(item.severity, "worth_reviewing");
  assert.equal(item.confidence, "low");
  assert.match(item.reason, /test, fixture, or documentation path/);
});

test("attention language never claims a confirmed secret or a confirmed defect", () => {
  const items = detect(
    [
      file("config/secrets.yml"),
      file(".env"),
      file("certs/key.pem"),
      file("src/a.ts"),
      file("src/state/migration.ts"),
      file("package-lock.json"),
    ],
    { contentFindings: [{ path: "src/a.ts", matchedRules: ["aws_access_key_id"] }] },
  );
  assert.ok(items.length > 0);
  // A positive confirmation claim is forbidden. Denials such as "not a confirmed secret" are the
  // point of the vocabulary, so the assertion targets the assertive grammatical form only.
  const positiveClaim =
    /\b(?:is|are|was|were|has been|have been)\s+(?:a\s+)?(?:confirmed|verified|proven)\b/i;
  const hedge =
    /\b(?:possible|possibly|may|might|appears?|suggests?|cannot tell|potentially|probably|likely|worth|prompt to look)\b/i;
  for (const item of items) {
    const prose = `${item.reason} ${item.suggestion}`;
    assert.ok(
      !positiveClaim.test(prose),
      `"${item.kind}" must not assert a confirmed or verified fact: ${prose}`,
    );
    assert.ok(item.reason.length > 0 && item.suggestion.length > 0);
    if (item.kind.startsWith("possible_") || item.kind.startsWith("potentially_")) {
      assert.ok(hedge.test(prose), `"${item.kind}" must hedge explicitly: ${prose}`);
    }
  }
});

test("a content match reports rule names only and states that it is not a confirmed secret", () => {
  const items = detect([file("src/config.ts")], {
    contentFindings: [{ path: "src/config.ts", matchedRules: ["aws_access_key_id"] }],
  });
  const item = find(items, "possible_secret_content_pattern");
  assert.deepEqual(item.paths, ["src/config.ts"]);
  assert.match(item.reason, /aws_access_key_id/);
  assert.match(item.reason, /not a confirmed secret/);
  assert.match(item.reason, /does not return, log, or hash the matched value/);
});

test("large files and binary changes are surfaced with their thresholds explained", () => {
  const items = detect([
    file("assets/blob.bin", { binary: true }),
    file("docs/huge.md", { sizeBytes: DEFAULT_INSPECTION_LIMITS.largeFileBytes + 1 }),
    file("src/big.ts", { insertions: DEFAULT_INSPECTION_LIMITS.largeDiffLines, deletions: 5 }),
  ]);
  const large = find(items, "unexpectedly_large_change");
  assert.deepEqual(large.paths, ["docs/huge.md", "src/big.ts"]);
  assert.match(large.reason, /bytes|changed lines/);
  assert.deepEqual(find(items, "binary_change").paths, ["assets/blob.bin"]);
});

test("generated artifacts mixed with source are called out", () => {
  const items = detect([file("dist/bundle.js"), file("src/a.ts")]);
  const item = find(items, "generated_mixed_with_source");
  assert.deepEqual(item.paths, ["dist/bundle.js", "src/a.ts"]);
});

test("a lock change without its manifest is flagged, and the converse too", () => {
  const lockOnly = detect([file("package-lock.json")]);
  assert.match(
    find(lockOnly, "dependency_lock_without_manifest").reason,
    /npm lock file changed but no npm manifest changed/,
  );

  const manifestOnly = detect([file("package.json")]);
  assert.match(
    find(manifestOnly, "dependency_manifest_without_lock").reason,
    /potentially missing/,
  );

  const both = detect([file("package.json"), file("package-lock.json")]);
  assert.ok(!kinds(both).includes("dependency_lock_without_manifest"));
  assert.ok(!kinds(both).includes("dependency_manifest_without_lock"));
});

test("source without any test change raises a question, not an accusation", () => {
  const items = detect([file("src/a.ts"), file("src/b.ts")]);
  const item = find(items, "source_without_test");
  assert.equal(item.severity, "worth_reviewing");
  assert.match(item.reason, /cannot tell whether behavior changed/);
  assert.match(item.suggestion, /pure refactor/);

  const withTest = detect([file("src/a.ts"), file("test/a.test.ts")]);
  assert.ok(!kinds(withTest).includes("source_without_test"));
});

test("missing documentation only fires when the repository maintains a docs tree", () => {
  const withoutDocs = detect([file("src/a.ts")], { docsDirectoryPresent: false });
  assert.ok(!kinds(withoutDocs).includes("potentially_missing_documentation"));

  const withDocs = detect([file("src/a.ts")], { docsDirectoryPresent: true });
  const item = find(withDocs, "potentially_missing_documentation");
  assert.equal(item.severity, "informational");
  assert.equal(item.confidence, "low");
});

test("a migration without a related test is the strongest severity available", () => {
  const items = detect([file("src/state/migration.ts")]);
  const item = find(items, "migration_without_test");
  assert.equal(item.severity, "inspect_before_delivery");
  assert.match(item.reason, /hard to reverse/);

  const withTest = detect([file("src/state/migration.ts"), file("test/migrate.test.ts")]);
  assert.ok(!kinds(withTest).includes("migration_without_test"));
});

test("changes spread across three or more structural areas are noted", () => {
  const items = detect([
    file("src/a.ts"),
    file("test/a.test.ts"),
    file("scripts/tool.ts"),
    file("tsconfig.json"),
  ]);
  const item = find(items, "unrelated_areas_touched");
  assert.equal(item.severity, "informational");
  assert.match(item.reason, /top-level areas/);
});

test("deleted verification evidence is flagged as weakening a completion claim", () => {
  const items = detect([file("docs/verification/PACKET_1_FOUNDATION.md", { status: "deleted" })]);
  const item = find(items, "deleted_verification_evidence");
  assert.equal(item.severity, "inspect_before_delivery");
  assert.match(item.reason, /weakens any completion claim/);
});

test("a generated Voila view changing without canonical state is flagged", () => {
  const drifted = detect([file(".voila/status/STATUS.md")]);
  const item = find(drifted, "generated_view_without_state_change");
  assert.match(item.reason, /derived output/);

  const consistent = detect([file(".voila/status/STATUS.md"), file(".voila/project.json")]);
  assert.ok(!kinds(consistent).includes("generated_view_without_state_change"));
});

test("dirty files outside the staged areas are reported as probably unrelated", () => {
  const items = detect([
    file("src/a.ts", { staged: true, unstaged: false }),
    file("scripts/other.ts", { staged: false, unstaged: true }),
    file("notes.txt", { staged: false, unstaged: false, untracked: true, status: "untracked" }),
  ]);
  const item = find(items, "dirty_outside_apparent_scope");
  assert.deepEqual(item.paths, ["notes.txt", "scripts/other.ts"]);
  assert.match(item.suggestion, /never stages or unstages/);
});

test("attention items are sorted by severity, then kind, then path", () => {
  const items = detect(
    [
      file("src/a.ts"),
      file(".env"),
      file("assets/blob.bin", { binary: true }),
      file("certs/a.pem"),
    ],
    { docsDirectoryPresent: true },
  );
  const severities = items.map((item) => item.severity);
  const rank = { inspect_before_delivery: 0, worth_reviewing: 1, informational: 2 } as const;
  const ranks = severities.map((severity) => rank[severity]);
  assert.deepEqual(
    [...ranks].sort((a, b) => a - b),
    ranks,
    "severity order must be non-decreasing",
  );

  // Same input must always give the same array.
  const again = detect(
    [
      file("src/a.ts"),
      file(".env"),
      file("assets/blob.bin", { binary: true }),
      file("certs/a.pem"),
    ],
    { docsDirectoryPresent: true },
  );
  assert.deepEqual(again, items);
});

test("paths inside an attention item are sorted and de-duplicated", () => {
  const items = detect([file("src/z.ts"), file("src/a.ts"), file("src/m.ts")]);
  const item = find(items, "source_without_test");
  assert.deepEqual(item.paths, ["src/a.ts", "src/m.ts", "src/z.ts"]);
});

test("a generated view changing without canonical state is flagged in a legacy repository too", () => {
  const items = detect([file(".newfang/views/PROJECT_STATUS.md")]);
  assert.ok(
    items.some((item) => item.kind === "generated_view_without_state_change"),
    "legacy generated-view drift is the same signal as current drift",
  );

  const withState = detect([
    file(".newfang/views/PROJECT_STATUS.md"),
    file(".newfang/project.json"),
  ]);
  assert.ok(
    !withState.some((item) => item.kind === "generated_view_without_state_change"),
    "a matching legacy canonical change clears the item",
  );
});
