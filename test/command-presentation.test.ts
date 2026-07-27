// User-run command recommendations must survive copying from Pi's TUI into a shell.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const ROOT = process.cwd();

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  assert.notEqual(start, -1, `missing ${heading}`);
  const rest = markdown.slice(start + heading.length);
  const nextHeading = rest.search(/^#{1,6} /m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

async function instructionSurfaces(): Promise<{ agents: string; skill: string }> {
  const agents = await readFile(join(ROOT, "AGENTS.md"), "utf8");
  const skill = await readFile(join(ROOT, ".pi/skills/project-steward/SKILL.md"), "utf8");
  return { agents, skill };
}

test("active Steward instructions require paste-safe user commands", async () => {
  const { agents, skill } = await instructionSurfaces();
  const surfaces = [
    section(agents, "## User-run command presentation"),
    section(skill, "### Paste-safe user commands"),
  ];

  for (const instructions of surfaces) {
    assert.match(instructions, /fenced `bash`/i, "commands belong in fenced bash blocks");
    assert.match(
      instructions,
      /one physical source line/i,
      "each executable command stays on one physical line",
    );
    assert.match(
      instructions,
      /backslash-newline/i,
      "fragile shell continuations are prohibited explicitly",
    );
    assert.match(
      instructions,
      /one complete command per line/i,
      "multi-step sequences remain independently pasteable",
    );
    assert.match(
      instructions,
      /self-contained paste-safe script block/i,
      "unavoidable multi-line input has a robust fallback",
    );
    assert.match(
      instructions,
      /outside (?:the block|those blocks|it)/i,
      "explanation stays outside executable content",
    );
    assert.match(
      instructions,
      /exactly what (?:the script|it) changes|exactly what it will change/i,
      "multi-line fallback states its effects",
    );
  }
});

test("pull-request handoffs include an actionable host-aware command", async () => {
  const { agents, skill } = await instructionSurfaces();
  const surfaces = [
    section(agents, "## User-run command presentation"),
    section(skill, "### Actionable pull-request handoff"),
  ];

  for (const instructions of surfaces) {
    assert.match(instructions, /opening a pull request/i, "the rule activates at the PR boundary");
    assert.match(instructions, /remote host/i, "the Steward inspects the repository host");
    assert.match(instructions, /CLI\s+availability/i, "the Steward checks the host CLI");
    assert.match(instructions, /one physical-line/i, "the PR command stays on one source line");
    assert.match(instructions, /`gh pr create/i, "GitHub gets an explicit paste-safe command");
    for (const flag of ["--base", "--head", "--title", "--body"]) {
      assert.ok(instructions.includes(flag), `the PR command includes ${flag}`);
    }
    assert.match(instructions, /never (?:execute|run)/i, "the Steward does not cross the boundary");
    assert.match(
      instructions,
      /assume[\s\S]{0,100}authentication/i,
      "authentication is not presumed",
    );
    assert.match(instructions, /compare\/new-PR URL/i, "missing CLI has an actionable fallback");
  }
});
