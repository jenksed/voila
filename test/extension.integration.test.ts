import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// Loads the pinned Pi package at runtime (proves it resolves/executes).
import * as pi from "@earendil-works/pi-coding-agent";
// Loads the thin adapter (which type-imports Pi and imports src/).
import voilaExtension from "../.pi/extensions/voila.ts";
import { loadState, updateState } from "../src/state/store.ts";
import { ensureR2ARegistry } from "../src/state/operations-registry.ts";

const execFileAsync = promisify(execFile);

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
  assert.equal(h.tools.size, 35);
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

test("a delivered settlement is injected and acknowledged exactly once", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-int-"));
  const h = makeHarness(root);
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);
  await h.commands.get("voila")!.handler("init", h.ctx);

  await updateState(
    root,
    (cur) => ({
      ...cur,
      sequences: { ...cur.sequences, operationRun: 2 },
      operationRuns: [
        {
          id: "RUN-1",
          definitionId: "r2a.state-store-tests",
          definitionVersion: 1,
          definitionFingerprint: "f".repeat(64),
          projectId: cur.projectId,
          repositoryRoot: root,
          worktreeIdentity: root,
          ownership: { requester: "test", owner: "project-steward" },
          startingFingerprint: "a".repeat(64),
          endingFingerprint: "a".repeat(64),
          changedDuringRun: false,
          lifecycleState: "passed",
          createdAt: "2026-07-26T22:30:00.000Z",
          startedAt: "2026-07-26T22:30:00.100Z",
          settledAt: "2026-07-26T22:30:00.200Z",
          exitCode: 0,
          settlementReason: "passed",
          outputSummary: {
            truncated: false,
            droppedBytes: 0,
            redactionCount: 0,
            redactedSecrets: false,
          },
          deliveryState: "delivered",
          admission: {
            result: "allow",
            ruleId: "ADMIT.OPERATIONS.ALLOW_NEW",
            policyVersion: 1,
            authorityReference: { kind: "decision", id: "DEC-22" },
            decidedAt: "2026-07-26T22:30:00.000Z",
          },
        },
      ],
    }),
    { type: "operation_run_fixture" },
  );

  const before = h.events.get("before_agent_start")!;
  const first = (await before({ prompt: "Continue." }, h.ctx)) as {
    message: { content: string };
  };
  assert.match(first.message.content, /Settled operation: r2a\.state-store-tests · passed/);
  assert.equal((await loadState(root)).operationRuns[0]?.deliveryState, "acknowledged");

  const second = (await before({ prompt: "Continue." }, h.ctx)) as {
    message: { content: string };
  };
  assert.doesNotMatch(second.message.content, /Settled operation:/);
  const events = await readFile(join(root, ".voila/events.jsonl"), "utf8");
  assert.equal(events.match(/operation_run_acknowledged/g)?.length, 1);
});

test("operation lifecycle requests bounded widget refreshes without polling", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-int-"));
  await execFileAsync("git", ["init", "-q", root]);
  const h = makeHarness(root);
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);
  await h.commands.get("voila")!.handler("init", h.ctx);
  await updateState(
    root,
    (cur) => ({
      ...cur,
      phase: "build",
      health: "green",
      focusWorkItemId: "NF-20",
      sequences: { ...cur.sequences, workItem: 21, decision: 24 },
      workItems: [
        {
          id: "NF-20",
          kind: "outcome",
          title: "R2B fixture",
          status: "in_progress",
          priority: "high",
          acceptanceCriteria: ["visible"],
          requiredClaimIds: [],
          dependsOn: [],
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:00:00.000Z",
        },
      ],
      decisions: [
        {
          id: "DEC-23",
          title: "R2 operational direction",
          decision: "One supervised background operation, not a terminal emulator.",
          rationale: "R2B acceptance fixture.",
          status: "accepted",
          createdAt: "2026-07-27T00:00:00.000Z",
          updatedAt: "2026-07-27T00:00:00.000Z",
        },
      ],
    }),
    { type: "r2b_ui_refresh_fixture" },
  );

  await h.events.get("session_start")!(undefined, h.ctx);
  await ensureR2ARegistry(root);
  // The registry contract is tested separately. Use a controlled Node fixture here so lifecycle UI
  // coverage does not depend on the project-local `mise` binary being installed in bare CI.
  await updateState(
    root,
    (cur) => ({
      ...cur,
      operationDefinitions: cur.operationDefinitions.map((definition) =>
        definition.id === "r2b.repository-checks"
          ? {
              ...definition,
              executable: process.execPath,
              args: ["-e", "setTimeout(()=>{}, 1200)"],
            }
          : definition,
      ),
    }),
    { type: "r2b_ui_refresh_fixture_definition" },
  );
  const before = h.widgets.length;
  const startedAt = Date.now();
  await h.tools
    .get("voila_start_operation")!
    .execute("r2b-start", { operationId: "r2b.repository-checks" }, undefined, undefined, {
      cwd: root,
    });
  const startElapsed = Date.now() - startedAt;
  assert.ok(startElapsed < 1_200, `start blocked for ${startElapsed}ms`);
  assert.ok(
    ["starting", "running"].includes((await loadState(root)).operationRuns[0]!.lifecycleState),
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    h.widgets.length - before >= 2,
    "reservation and running boundaries refresh the widget",
  );

  await new Promise((resolve) => setTimeout(resolve, 2_000));
  const afterSettlement = h.widgets.length;
  assert.equal((await loadState(root)).operationRuns[0]!.lifecycleState, "passed");
  assert.ok(afterSettlement - before <= 3, "one refresh per natural lifecycle boundary");
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(h.widgets.length, afterSettlement, "no timer-driven refresh storm");
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
