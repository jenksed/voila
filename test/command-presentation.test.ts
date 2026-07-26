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
  const nextHeading = rest.search(/^##? /m);
  return nextHeading === -1 ? rest : rest.slice(0, nextHeading);
}

test("active Steward instructions require paste-safe user commands", async () => {
  const agents = await readFile(join(ROOT, "AGENTS.md"), "utf8");
  const skill = await readFile(join(ROOT, ".pi/skills/project-steward/SKILL.md"), "utf8");
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
