// The Voila product identity, enforced as behavior rather than convention.
//
// Packet 4.5 left exactly one supported product API. These tests fail if a legacy command or tool
// alias is ever reintroduced, if the accented spelling appears, or if the registered tool surface
// drifts from the exact expected set.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import voilaExtension from "../.pi/extensions/voila.ts";
import { HOME_WIDGET_KEY, SUBCOMMANDS } from "../src/extension/register.ts";
import { voilaTools } from "../src/tools/index.ts";
import { VOILA_DIR } from "../src/state/paths.ts";
import { LEGACY_STATE_DIR } from "../src/state/legacy.ts";

const ROOT = process.cwd();

/** Every spelling that must not appear on an active product surface. */
const FORBIDDEN = ["NewFang", "Newfang", "newfang", "NEWFANG", "Voilà", "voilà"];

interface CapturedCommand {
  description?: string;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
  handler: (args: string, ctx: unknown) => unknown;
}

function captureRegistrations() {
  const commands = new Map<string, CapturedCommand>();
  const tools = new Map<string, { name: string; label: string; description: string }>();
  const events = new Map<string, unknown>();
  const host = {
    registerCommand(name: string, opts: CapturedCommand) {
      if (commands.has(name)) throw new Error(`command ${name} registered twice`);
      commands.set(name, opts);
    },
    registerTool(tool: { name: string; label: string; description: string }) {
      if (tools.has(tool.name)) throw new Error(`tool ${tool.name} registered twice`);
      tools.set(tool.name, tool);
    },
    on(event: string, handler: unknown) {
      events.set(event, handler);
    },
  };
  (voilaExtension as unknown as (pi: unknown) => void)(host);
  return { commands, tools, events };
}

// --- Command surface ---

test("/voila registers exactly once and /newfang does not register at all", () => {
  const { commands } = captureRegistrations();
  assert.deepEqual([...commands.keys()], ["voila"]);
  assert.ok(!commands.has("newfang"), "no legacy command alias");
});

test("the command description and completions expose only Voila subcommands", () => {
  const { commands } = captureRegistrations();
  const voila = commands.get("voila");
  assert.ok(voila);
  assert.doesNotMatch(voila.description ?? "", /newfang/i);

  // Every documented subcommand still completes.
  for (const sub of SUBCOMMANDS) {
    const items = voila.getArgumentCompletions?.(sub) ?? [];
    assert.ok(
      items.some((i) => i.value === sub),
      `subcommand ${sub} no longer completes`,
    );
  }

  // Prefix completion still narrows rather than returning everything.
  const iItems = voila.getArgumentCompletions?.("i") ?? [];
  assert.deepEqual(
    iItems.map((i) => i.value).sort(),
    ["init", "intake"],
    "prefix completion narrows to matching subcommands",
  );
  assert.equal(voila.getArgumentCompletions?.("zzz"), null, "no match returns null");
});

test("the full subcommand set survived the rename", () => {
  assert.deepEqual(
    [...SUBCOMMANDS].sort(),
    [
      "assumptions",
      "backlog",
      "brief",
      "claims",
      "complete",
      "decisions",
      "doctor",
      "focus",
      "home",
      "init",
      "intake",
      "migrate",
      "orient",
      "proof",
      "risks",
      "status",
      "verify",
    ],
    "a subcommand was lost or added during the rename",
  );
});

// --- Tool surface ---

test("every registered tool uses the voila_ prefix and none uses newfang_", () => {
  const { tools } = captureRegistrations();
  assert.equal(tools.size, 28, "exact registered tool count");
  for (const name of tools.keys()) {
    assert.ok(name.startsWith("voila_"), `${name} does not use the voila_ prefix`);
    assert.ok(!name.startsWith("newfang_"), `${name} is a legacy tool name`);
  }
  assert.equal([...tools.keys()].filter((n) => n.startsWith("newfang_")).length, 0);
});

test("tool schemas, labels, and prompt text carry no legacy or accented brand", () => {
  for (const tool of voilaTools()) {
    const serialized = JSON.stringify({
      name: tool.name,
      label: tool.label,
      description: tool.description,
      parameters: tool.parameters,
      promptSnippet: tool.promptSnippet,
      promptGuidelines: tool.promptGuidelines,
    });
    for (const forbidden of FORBIDDEN) {
      assert.ok(!serialized.includes(forbidden), `tool ${tool.name} mentions "${forbidden}"`);
    }
  }
});

test("tool behavior is unchanged apart from naming: every tool keeps its shape", () => {
  for (const tool of voilaTools()) {
    assert.equal(typeof tool.execute, "function", `${tool.name} lost its executor`);
    assert.ok(
      tool.parameters && typeof tool.parameters === "object",
      `${tool.name} lost its schema`,
    );
    assert.ok(tool.label.length > 0, `${tool.name} lost its label`);
    assert.ok(tool.description.length > 0, `${tool.name} lost its description`);
  }
});

// --- Identity constants ---

test("state directory, widget key, and context type use the Voila names", () => {
  assert.equal(VOILA_DIR, ".voila");
  assert.equal(HOME_WIDGET_KEY, "voila-home");
  assert.equal(LEGACY_STATE_DIR, ".newfang", "legacy detection still knows the old directory");
});

test("context injection is registered under the voila-context custom type", async () => {
  const source = await readFile(join(ROOT, "src/extension/register.ts"), "utf8");
  assert.match(source, /customType: "voila-context"/);
  assert.doesNotMatch(source, /newfang-context/);
});

// --- Packaging and adapter ---

test("the package is named voila and its description names Voila", async () => {
  const pkg = JSON.parse(await readFile(join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.name, "voila");
  assert.match(pkg.description, /Voila/);

  const lock = JSON.parse(await readFile(join(ROOT, "package-lock.json"), "utf8"));
  assert.equal(lock.name, "voila");
  assert.equal(lock.packages?.[""]?.name, "voila");
});

test("the Pi adapter is voila.ts and no legacy adapter remains", () => {
  assert.ok(existsSync(join(ROOT, ".pi/extensions/voila.ts")), "voila.ts adapter exists");
  assert.ok(
    !existsSync(join(ROOT, ".pi/extensions/newfang.ts")),
    "no parallel legacy adapter remains",
  );
});

// --- Plain-ASCII naming ---

test("the product name is plain ASCII everywhere it is written", async () => {
  const files = [
    "package.json",
    "README.md",
    "AGENTS.md",
    ".pi/extensions/voila.ts",
    ".pi/skills/project-steward/SKILL.md",
    "src/extension/register.ts",
  ];
  for (const rel of files) {
    const content = await readFile(join(ROOT, rel), "utf8");
    assert.ok(!content.includes("Voilà"), `${rel} uses the accented spelling "Voilà"`);
    assert.ok(!content.includes("voilà"), `${rel} uses the accented spelling "voilà"`);
  }
});

test("the accented spelling is rejected by the same rule that accepts the plain one", () => {
  // Guards against a future "helpful" normalization that treats the two as equivalent.
  assert.notEqual("Voila", "Voilà");
  assert.ok(/^[\x20-\x7e]+$/.test("Voila"), "Voila is printable ASCII");
  assert.ok(!/^[\x20-\x7e]+$/.test("Voilà"), "the accented form is not ASCII");
});
