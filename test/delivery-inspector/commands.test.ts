// Verification-command discovery. The point of these tests is honesty: every command carries a basis,
// nothing is ever marked executed or verified, and a command that embeds a credential is withheld.

import { test } from "node:test";
import assert from "node:assert/strict";

import { discoverVerificationCommands } from "../../src/delivery-inspector/commands.ts";
import { createMemoryFileSystem } from "../../src/delivery-inspector/fs.ts";
import { DEFAULT_INSPECTION_LIMITS } from "../../src/delivery-inspector/types.ts";

function discover(files: Record<string, string>, limits = DEFAULT_INSPECTION_LIMITS) {
  return discoverVerificationCommands(createMemoryFileSystem(files), limits);
}

test("package.json scripts are discovered as manifest declarations", async () => {
  const { commands } = await discover({
    "package.json": JSON.stringify({
      scripts: { test: "node --test", verify: "npm run typecheck && npm test", build: "tsc" },
    }),
  });
  const byCommand = new Map(commands.map((command) => [command.command, command]));
  assert.equal(byCommand.get("npm test")?.basis, "declared_in_manifest");
  assert.equal(byCommand.get("npm test")?.source, "package.json");
  assert.equal(byCommand.get("npm run verify")?.basis, "declared_in_manifest");
  assert.match(byCommand.get("npm run verify")?.note ?? "", /suggests a verification command/);
  assert.match(byCommand.get("npm run build")?.note ?? "", /declared as the "build" script/);
});

test("no discovered command is ever marked executed", async () => {
  const { commands } = await discover({
    "package.json": JSON.stringify({ scripts: { test: "node --test", verify: "tsc" } }),
    Makefile: "check:\n\techo hi\n",
    "mise.toml": '[tasks.verify]\nrun = "npm run verify"\n',
    "Cargo.toml": '[package]\nname = "x"\n',
    "go.mod": "module x\n",
    "README.md": "Run `npm run lint` to lint.\n",
  });
  assert.ok(commands.length > 0);
  for (const command of commands) {
    assert.equal(command.executed, false, `${command.command} must never be marked executed`);
    assert.ok(
      ["declared_in_manifest", "declared_in_documentation", "candidate"].includes(command.basis),
      `${command.command} must carry an explicit basis`,
    );
    assert.ok(command.source.length > 0, `${command.command} must name its declaring file`);
  }
});

test("Makefile targets and mise tasks are discovered", async () => {
  const { commands } = await discover({
    Makefile: [
      ".PHONY: test lint",
      "test:",
      "\tnode --test",
      "lint:",
      "\teslint .",
      "VARIABLE := value",
      "",
    ].join("\n"),
    "mise.toml":
      '[tools]\nnode = "22"\n\n[tasks.verify]\nrun = "npm run verify"\n\n[tasks."check:all"]\nrun = "x"\n',
  });
  const names = commands.map((command) => command.command);
  assert.ok(names.includes("make test"));
  assert.ok(names.includes("make lint"));
  assert.ok(!names.includes("make VARIABLE"), "a make variable assignment is not a target");
  assert.ok(!names.some((name) => name.startsWith("make .")), "special targets are excluded");
  assert.ok(names.includes("mise run verify"));
  assert.ok(names.includes("mise run check:all"));
});

test("ecosystem conventions are recorded as candidates, never as declarations", async () => {
  const { commands } = await discover({
    "Cargo.toml": '[package]\nname = "x"\n',
    "go.mod": "module example.com/x\n",
    "pyproject.toml": '[tool.pytest.ini_options]\naddopts = "-q"\n',
  });
  const byCommand = new Map(commands.map((command) => [command.command, command]));
  assert.equal(byCommand.get("cargo test")?.basis, "candidate");
  assert.match(byCommand.get("cargo test")?.note ?? "", /not declared anywhere/);
  assert.equal(byCommand.get("go test ./...")?.basis, "candidate");
  assert.equal(byCommand.get("pytest")?.basis, "candidate");
});

test("a language manifest without a pytest mention yields no pytest candidate", async () => {
  const { commands } = await discover({ "pyproject.toml": '[project]\nname = "x"\n' });
  assert.ok(!commands.some((command) => command.command === "pytest"));
});

test("documented commands are discovered with the declaring document as provenance", async () => {
  const { commands } = await discover({
    "docs/DEVELOPMENT.md": [
      "# Development",
      "",
      "Run the full check:",
      "",
      "```bash",
      "mise exec -- npm run verify",
      "```",
      "",
      "Type-check only with `mise exec -- npx tsc --noEmit`.",
      "",
      "Then read the output.",
      "",
    ].join("\n"),
  });
  const verify = commands.find((command) => command.command === "mise exec -- npm run verify");
  assert.ok(verify !== undefined, "a fenced command should be discovered");
  assert.equal(verify.basis, "declared_in_documentation");
  assert.equal(verify.source, "docs/DEVELOPMENT.md");
  assert.match(verify.note ?? "", /documented in docs\/DEVELOPMENT\.md/);
  assert.ok(
    commands.some((command) => command.command === "mise exec -- npx tsc --noEmit"),
    "an inline-code command should be discovered too",
  );
});

test("prose that is not a runner command is not discovered", async () => {
  const { commands } = await discover({
    "README.md": [
      "Read `docs/DESIGN.md` first.",
      "",
      "```",
      "# a comment about tests",
      "some prose about verify",
      "rm -rf /",
      "```",
      "",
    ].join("\n"),
  });
  assert.deepEqual(commands, [], "only recognized runner commands may be discovered");
});

test("a manifest declaration outranks the same command found in documentation", async () => {
  const { commands } = await discover({
    "package.json": JSON.stringify({ scripts: { verify: "tsc" } }),
    "README.md": "Run `npm run verify` before pushing.\n",
  });
  const matches = commands.filter((command) => command.command === "npm run verify");
  assert.equal(matches.length, 1, "the command must be de-duplicated");
  assert.equal(matches[0]?.basis, "declared_in_manifest");
  assert.equal(matches[0]?.source, "package.json");
});

test("a documented command embedding a credential is withheld, not returned", async () => {
  const leaked = "s3cr3t-value-should-never-appear";
  const { commands, limitations } = await discover({
    "README.md": `Run \`API_KEY=${leaked} npm test\` to check.\n`,
  });
  const serialized = JSON.stringify({ commands, limitations });
  assert.ok(
    !serialized.includes(leaked),
    "a credential embedded in a documented command must never be returned",
  );
  assert.ok(!commands.some((command) => command.command.includes(leaked)));
  assert.ok(
    limitations.some((limitation) => /embedded a credential-shaped assignment/.test(limitation)),
    "the skip must be reported without echoing the command",
  );
});

test("commands are sorted by basis, then command, for deterministic output", async () => {
  const files = {
    "package.json": JSON.stringify({ scripts: { verify: "x", test: "y", lint: "z" } }),
    "Cargo.toml": '[package]\nname = "x"\n',
    "README.md": "Use `make check` for a quick pass.\n",
    Makefile: "check:\n\techo hi\n",
  };
  const first = await discover(files);
  const second = await discover(files);
  assert.deepEqual(second.commands, first.commands);

  const rank = { declared_in_manifest: 0, declared_in_documentation: 1, candidate: 2 } as const;
  const ranks = first.commands.map((command) => rank[command.basis]);
  assert.deepEqual(
    [...ranks].sort((a, b) => a - b),
    ranks,
    "basis order must be non-decreasing",
  );
});

test("a malformed package.json is reported as a limitation, not a throw", async () => {
  const { commands, limitations } = await discover({ "package.json": "{ not json" });
  assert.deepEqual(commands, []);
  assert.ok(limitations.some((limitation) => /could not be parsed as JSON/.test(limitation)));
});

test("the discovery cap is reported honestly when it bites", async () => {
  const scripts: Record<string, string> = {};
  for (let index = 0; index < 30; index += 1) scripts[`check-${index}`] = "true";
  const { commands, limitations } = await discover(
    { "package.json": JSON.stringify({ scripts }) },
    { ...DEFAULT_INSPECTION_LIMITS, maxCommandsDiscovered: 5 },
  );
  assert.equal(commands.length, 5);
  assert.ok(limitations.some((limitation) => /capped at 5/.test(limitation)));
});

test("an empty repository yields no commands and no invented candidates", async () => {
  const { commands, limitations } = await discover({});
  assert.deepEqual(commands, []);
  assert.deepEqual(limitations, []);
});
