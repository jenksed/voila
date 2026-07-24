import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Loads the pinned Pi package at runtime (proves it resolves/executes).
import * as pi from "@earendil-works/pi-coding-agent";
// Loads the thin adapter (which type-imports Pi and imports src/).
import newfangExtension from "../.pi/extensions/newfang.ts";
import { statePaths } from "../src/state/paths.ts";

interface CapturedCommand {
  description?: string;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
  handler: (args: string, ctx: FakeCtx) => unknown | Promise<unknown>;
}

interface FakeCtx {
  cwd: string;
  ui: {
    notify(message: string, level?: string): void;
    setWidget(key: string, lines: string[] | undefined): void;
  };
}

function makeHarness(cwd: string) {
  const commands = new Map<string, CapturedCommand>();
  const events = new Map<string, (event: unknown, ctx: FakeCtx) => unknown | Promise<unknown>>();
  const notifications: Array<{ message: string; level?: string }> = [];
  const widgets: Array<{ key: string; lines: string[] | undefined }> = [];

  const host = {
    registerCommand(name: string, opts: CapturedCommand) {
      commands.set(name, opts);
    },
    on(event: string, handler: (event: unknown, ctx: FakeCtx) => unknown) {
      events.set(event, handler);
    },
  };

  const ctx: FakeCtx = {
    cwd,
    ui: {
      notify: (message, level) => notifications.push({ message, level }),
      setWidget: (key, lines) => widgets.push({ key, lines }),
    },
  };

  return { host, ctx, commands, events, notifications, widgets };
}

test("pinned Pi package loads at runtime and reports version 0.82.0", async () => {
  assert.equal(typeof pi, "object");
  const pkg = JSON.parse(
    await readFile(
      join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent/package.json"),
      "utf8",
    ),
  );
  assert.equal(pkg.name, "@earendil-works/pi-coding-agent");
  assert.equal(pkg.version, "0.82.0");
});

test("extension registers the newfang command and a session_start handler", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-int-"));
  const h = makeHarness(root);

  // Bridge our fake host into the adapter's ExtensionAPI parameter.
  (newfangExtension as unknown as (pi: unknown) => void)(h.host);

  assert.ok(h.commands.has("newfang"), "newfang command registered");
  assert.ok(h.events.has("session_start"), "session_start handler registered");

  const cmd = h.commands.get("newfang");
  assert.ok(cmd);
  assert.deepEqual(cmd.getArgumentCompletions?.("i"), [{ value: "init", label: "init" }]);
  assert.equal(cmd.getArgumentCompletions?.("zz"), null);
});

test("session_start restoration wiring does not crash and shows the init hint", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-int-"));
  const h = makeHarness(root);
  (newfangExtension as unknown as (pi: unknown) => void)(h.host);

  const onStart = h.events.get("session_start");
  assert.ok(onStart);
  await onStart(undefined, h.ctx);

  const lastWidget = h.widgets.at(-1);
  assert.ok(lastWidget);
  assert.equal(lastWidget.key, "newfang-home");
  assert.match((lastWidget.lines ?? []).join(" "), /run \/newfang init/);
});

test("newfang init then status runs end to end through the registered command", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-int-"));
  const h = makeHarness(root);
  (newfangExtension as unknown as (pi: unknown) => void)(h.host);
  const cmd = h.commands.get("newfang");
  assert.ok(cmd);

  await cmd.handler("init", h.ctx);
  assert.ok(existsSync(statePaths(root).projectJson), "init created canonical state");

  await cmd.handler("status", h.ctx);
  const combined = h.notifications.map((n) => n.message).join("\n");
  assert.match(combined, /phase:\s+research/);
});
