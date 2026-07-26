import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Loads the pinned Pi package at runtime (proves it resolves/executes).
import * as pi from "@earendil-works/pi-coding-agent";
// Loads the thin adapter (which type-imports Pi and imports src/).
import voilaExtension from "../.pi/extensions/voila.ts";
import { loadState } from "../src/state/store.ts";

interface CapturedCommand {
  description?: string;
  getArgumentCompletions?: (prefix: string) => Array<{ value: string; label: string }> | null;
  handler: (args: string, ctx: FakeCtx) => unknown | Promise<unknown>;
}
interface CapturedTool {
  name: string;
  parameters: unknown;
  execute: (
    id: string,
    params: Record<string, unknown>,
    s: unknown,
    u: unknown,
    ctx: { cwd: string },
  ) => Promise<unknown>;
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
  const tools = new Map<string, CapturedTool>();
  const events = new Map<string, (event: unknown, ctx: FakeCtx) => unknown | Promise<unknown>>();
  const notifications: Array<{ message: string; level?: string }> = [];
  const widgets: Array<{ key: string; lines: string[] | undefined }> = [];
  const host = {
    registerCommand(name: string, opts: CapturedCommand) {
      commands.set(name, opts);
    },
    registerTool(tool: CapturedTool) {
      tools.set(tool.name, tool);
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
  return { host, ctx, commands, tools, events, notifications, widgets };
}

test("pinned Pi package loads at runtime and reports 0.82.0", async () => {
  assert.equal(typeof pi, "object");
  const pkg = JSON.parse(
    await readFile(
      join(process.cwd(), "node_modules/@earendil-works/pi-coding-agent/package.json"),
      "utf8",
    ),
  );
  assert.equal(pkg.version, "0.82.0");
});

test("extension registers the voila command, tools, and session_start", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-int-"));
  const h = makeHarness(root);
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);

  assert.ok(h.commands.has("voila"));
  assert.ok(h.events.has("session_start"));
  assert.equal(h.tools.size, 30);
  assert.ok(h.tools.has("voila_create_work_item"));
  assert.ok(h.tools.has("voila_request_intake_revision"));
  assert.ok(h.tools.has("voila_complete_work_item"));
});

test("session_start shows init hint when uninitialized", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-int-"));
  const h = makeHarness(root);
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);
  await h.events.get("session_start")!(undefined, h.ctx);
  const last = h.widgets.at(-1);
  assert.match((last?.lines ?? []).join(" "), /run \/voila init/);
});

test("init command then create-work-item tool run end to end through Pi wiring", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-int-"));
  const h = makeHarness(root);
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);

  await h.commands.get("voila")!.handler("init", h.ctx);
  assert.ok(existsSync(join(root, ".voila/project.json")));

  await h.tools
    .get("voila_create_work_item")!
    .execute("c1", { kind: "task", title: "wire test", status: "ready" }, undefined, undefined, {
      cwd: root,
    });
  const state = await loadState(root);
  assert.equal(state.workItems[0]?.title, "wire test");

  await h.commands.get("voila")!.handler("backlog", h.ctx);
  assert.match(h.notifications.map((n) => n.message).join("\n"), /NF-1/);
});
