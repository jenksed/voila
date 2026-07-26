// Rename guard: no legacy or accented brand may reappear on an active product surface.
//
// The guard scans every tracked text file. A file may contain a legacy-brand occurrence ONLY if it
// is listed by exact path in test/fixtures/legacy-brand-allowlist.json with a reason. The guard
// fails in both directions:
//   - an unlisted file containing the old brand fails (a regression crept in);
//   - a listed file that no longer contains it fails (the allowlist went stale).
//
// The allowlist is exact-path only. Directory prefixes and globs are rejected outright, because an
// entry like ".voila/" or "docs/" would make this guard meaningless.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();
const ALLOWLIST_PATH = "test/fixtures/legacy-brand-allowlist.json";

/** Spellings that must not appear on an active product surface. */
const LEGACY_SPELLINGS = ["NewFang", "Newfang", "newfang", "NEWFANG"];
const ACCENTED_SPELLINGS = ["Voilà", "voilà"];
const FORBIDDEN = [...LEGACY_SPELLINGS, ...ACCENTED_SPELLINGS];

/**
 * The accented spelling is never correct anywhere, so it is confined to the files that exist to
 * prohibit it. Unlike the legacy brand, it has no historical-evidence exemption: it was never the
 * product's name.
 */
const ACCENT_DISCUSSION_ALLOWED = new Set([
  "test/rename-guard.test.ts",
  "test/product-identity.test.ts",
  "test/fixtures/legacy-brand-allowlist.json",
  "docs/migrations/NEWFANG_TO_VOILA.md",
  "docs/migrations/VOILA_RENAME_INVENTORY.md",
  "docs/verification/PACKET_4_5_VOILA_RENAME.md",
]);

interface AllowlistEntry {
  path: string;
  category: string;
  reason: string;
  immutable: boolean;
  removable: boolean;
}

interface Allowlist {
  note: string;
  categories: Record<string, string>;
  entries: AllowlistEntry[];
}

async function loadAllowlist(): Promise<Allowlist> {
  return JSON.parse(await readFile(join(ROOT, ALLOWLIST_PATH), "utf8"));
}

/** Tracked, non-binary files. `git grep -I` semantics are reused via `git ls-files` + a NUL check. */
function trackedFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 })
    .toString()
    .split("\0")
    .filter((p) => p.length > 0);
}

/**
 * Git's own binary heuristic: a file is binary if a NUL appears in the first 8000 bytes. A NUL
 * further in does not make it binary — `src/commands/doctor.ts` legitimately contains `join("\0")`
 * to compare string arrays unambiguously, and it is very much a text file.
 */
const BINARY_SNIFF_BYTES = 8000;

async function readTextOrNull(rel: string): Promise<string | null> {
  const bytes = await readFile(join(ROOT, rel));
  if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return null;
  return bytes.toString("utf8");
}

/**
 * Captured verification output: the literal bytes a command printed, stored under a hash and never
 * editable. These are excluded structurally rather than enumerated one by one.
 *
 * The reason is that scanning them cannot catch a regression. Nobody authors a receipt's stdout —
 * it is whatever the command emitted — and this suite's own legacy-migration tests have `.newfang/`
 * in their names, so *every* future receipt of `npm run verify` contains the legacy brand by
 * construction. Listing each one would grow the allowlist without adding a single guarantee.
 *
 * This is deliberately narrow: only `stdout.txt` and `stderr.txt` directly inside a receipt
 * directory. `manifest.json` is authored metadata and stays scanned, as does everything else under
 * `.voila/`.
 */
const CAPTURED_OUTPUT = /^\.voila\/receipts\/[^/]+\/(stdout|stderr)\.txt$/;

function isCapturedOutput(rel: string): boolean {
  return CAPTURED_OUTPUT.test(rel);
}

async function scan(): Promise<Map<string, string[]>> {
  const hits = new Map<string, string[]>();
  for (const rel of trackedFiles()) {
    if (isCapturedOutput(rel)) continue;
    const text = await readTextOrNull(rel);
    if (text === null) continue;
    const found = FORBIDDEN.filter((s) => text.includes(s));
    if (found.length > 0) hits.set(rel, found);
  }
  return hits;
}

test("captured receipt output is excluded structurally, but nothing else under it is", () => {
  assert.ok(isCapturedOutput(".voila/receipts/RCP-1/stdout.txt"));
  assert.ok(isCapturedOutput(".voila/receipts/RCP-14/stderr.txt"));

  // Authored metadata and every other path stay in scope.
  assert.ok(!isCapturedOutput(".voila/receipts/RCP-1/manifest.json"));
  assert.ok(!isCapturedOutput(".voila/receipts/RCP-1/notes.md"));
  assert.ok(!isCapturedOutput(".voila/receipts/RCP-1/nested/stdout.txt"));
  assert.ok(!isCapturedOutput(".voila/project.json"));
  assert.ok(!isCapturedOutput(".voila/intakes/INT-1/source.md"));
  assert.ok(!isCapturedOutput("src/state/receipt-store.ts"));
});

test("the allowlist is exact-path only and fully explained", async () => {
  const allowlist = await loadAllowlist();
  assert.ok(allowlist.entries.length > 0);

  const seen = new Set<string>();
  for (const entry of allowlist.entries) {
    assert.ok(entry.path.length > 0, "entry has a path");
    assert.ok(
      !entry.path.endsWith("/"),
      `${entry.path}: directory prefixes are not allowed, only exact paths`,
    );
    assert.ok(
      !/[*?[\]]/.test(entry.path),
      `${entry.path}: globs are not allowed, only exact paths`,
    );
    assert.ok(
      entry.reason.length >= 30,
      `${entry.path}: reason must actually explain the exemption`,
    );
    assert.ok(
      Object.hasOwn(allowlist.categories, entry.category),
      `${entry.path}: unknown category "${entry.category}"`,
    );
    assert.equal(typeof entry.immutable, "boolean", `${entry.path}: immutable must be declared`);
    assert.equal(typeof entry.removable, "boolean", `${entry.path}: removable must be declared`);
    assert.ok(!seen.has(entry.path), `${entry.path}: duplicated in the allowlist`);
    seen.add(entry.path);
  }
});

test("no unlisted active surface contains the legacy brand", async () => {
  const allowlist = await loadAllowlist();
  const allowed = new Set(allowlist.entries.map((e) => e.path));
  const hits = await scan();

  const unlisted = [...hits.keys()].filter((p) => !allowed.has(p)).sort();
  assert.deepEqual(
    unlisted,
    [],
    `these files carry a prohibited spelling but are not on the allowlist:\n  ${unlisted.join("\n  ")}`,
  );
});

test("the allowlist has not gone stale", async () => {
  const allowlist = await loadAllowlist();
  const hits = await scan();

  const stale = allowlist.entries
    .map((e) => e.path)
    .filter((p) => !hits.has(p))
    .sort();
  assert.deepEqual(
    stale,
    [],
    `these allowlisted files no longer contain a prohibited spelling and should be removed from the allowlist:\n  ${stale.join("\n  ")}`,
  );
});

test("the accented spelling appears only in files that prohibit it", async () => {
  const hits = await scan();
  const offenders: string[] = [];
  for (const [rel, found] of hits) {
    if (found.some((s) => ACCENTED_SPELLINGS.includes(s)) && !ACCENT_DISCUSSION_ALLOWED.has(rel)) {
      offenders.push(rel);
    }
  }
  assert.deepEqual(
    offenders.sort(),
    [],
    `the accented spelling was never the product's name and has no historical exemption:\n  ${offenders.join("\n  ")}`,
  );
});

test("core active surfaces are clean, and are not on the allowlist", async () => {
  const allowlist = await loadAllowlist();
  const allowed = new Set(allowlist.entries.map((e) => e.path));

  // A representative set of surfaces a user actually touches. If any of these ever needed an
  // allowlist entry, the rename would have failed.
  const mustBeClean = [
    "package.json",
    "package-lock.json",
    "AGENTS.md",
    "CLAUDE.md",
    ".gitignore",
    "mise.toml",
    ".pi/extensions/voila.ts",
    ".pi/skills/project-steward/SKILL.md",
    ".pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md",
    "src/extension/register.ts",
    "src/tools/index.ts",
    "src/tools/intake-tools.ts",
    "src/tools/proof-tools.ts",
    "src/state/paths.ts",
    "src/state/store.ts",
    "src/commands/init.ts",
    "src/commands/doctor.ts",
    "src/ui/homeview.ts",
    "docs/DEVELOPMENT.md",
    "docs/project/PROJECT_LEDGER.md",
    ".voila/views/PROJECT_STATUS.md",
  ];

  for (const rel of mustBeClean) {
    const text = await readTextOrNull(rel);
    assert.notEqual(text, null, `${rel} should be a readable text file`);
    for (const forbidden of FORBIDDEN) {
      assert.ok(!(text as string).includes(forbidden), `${rel} contains "${forbidden}"`);
    }
    assert.ok(!allowed.has(rel), `${rel} must never need an allowlist entry`);
  }
});

test("canonical current-truth fields carry no legacy brand", async () => {
  // .voila/project.json is allowlisted because it quotes dated records. The fields that state
  // CURRENT truth must still be clean, so the exemption cannot hide a real regression.
  const state = JSON.parse(await readFile(join(ROOT, ".voila/project.json"), "utf8"));
  for (const field of ["displayName", "nextAction", "nextActionRationale"]) {
    const value = state[field];
    if (typeof value !== "string") continue;
    for (const forbidden of FORBIDDEN) {
      assert.ok(!value.includes(forbidden), `project.json ${field} contains "${forbidden}"`);
    }
  }
});

test("generated view and brief identify the project as Voila", async () => {
  for (const rel of [".voila/views/PROJECT_STATUS.md", ".voila/briefs/PROJECT_BRIEF.md"]) {
    const text = (await readTextOrNull(rel)) as string;
    // The generated banner, title, and provenance line are the projection's own words.
    const header = text.split("\n").slice(0, 6).join("\n");
    for (const forbidden of FORBIDDEN) {
      assert.ok(!header.includes(forbidden), `${rel} header contains "${forbidden}"`);
    }
    assert.match(header, /Voila/, `${rel} header should name Voila`);
  }
});

test("no tracked path name carries the legacy or accented brand", () => {
  const offenders = trackedFiles().filter((p) => /newfang|voilà/i.test(p));
  assert.deepEqual(
    offenders.sort(),
    [
      // The one intentional exception: the document whose subject is the transition itself.
      "docs/migrations/NEWFANG_TO_VOILA.md",
    ],
    "a tracked file name still carries the old brand",
  );
});
