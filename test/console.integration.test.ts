import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Loads the pinned Pi package and the thin adapter, proving /voila home registers and opens
// through the pinned API shape without provider authentication.
import voilaExtension from "../.pi/extensions/voila.ts";
import { SUBCOMMANDS } from "../src/extension/register.ts";
import { buildModelForRoot, themeStyler } from "../src/ui/steward-console/open.ts";
import { initState } from "../src/state/store.ts";
import { createWorkItem, setNextActionRationale } from "../src/domain/operations.ts";
import { updateState } from "../src/state/store.ts";

interface Captured {
  handler: (args: string, ctx: FakeCtx) => unknown | Promise<unknown>;
  getArgumentCompletions?: (p: string) => Array<{ value: string; label: string }> | null;
}
interface FakeCtx {
  cwd: string;
  mode?: string;
  ui: {
    notify(message: string, level?: string): void;
    setWidget(key: string, lines: string[] | undefined): void;
    custom?<T>(
      factory: (tui: unknown, theme: unknown, kb: unknown, done: (r: T) => void) => unknown,
    ): Promise<T>;
  };
}

function harness(cwd: string, opts: { withCustom: boolean; mode?: string }) {
  const commands = new Map<string, Captured>();
  const tools = new Map<string, unknown>();
  const notifications: string[] = [];
  const widgets: Array<string[] | undefined> = [];
  let component: { render(w: number): string[]; handleInput(d: string): void } | undefined;
  let renderRequests = 0;

  const host = {
    registerCommand: (name: string, o: Captured) => commands.set(name, o),
    registerTool: (t: { name: string }) => tools.set(t.name, t),
    on: () => {},
  };

  const theme = { fg: (_c: string, s: string) => s, bold: (s: string) => s };
  const tui = {
    requestRender: () => {
      renderRequests++;
    },
  };

  // Resolves when the TUI factory has been invoked. Lets tests wait deterministically for the
  // console to be mounted instead of guessing with setTimeout.
  const ctx: FakeCtx = {
    cwd,
    ...(opts.mode ? { mode: opts.mode } : {}),
    ui: {
      notify: (m) => notifications.push(m),
      setWidget: (_k, l) => widgets.push(l),
      ...(opts.withCustom
        ? {
            custom: async <T>(
              factory: (tui: unknown, theme: unknown, kb: unknown, done: (r: T) => void) => unknown,
            ): Promise<T> => {
              return await new Promise<T>((resolve) => {
                component = factory(
                  tui,
                  theme,
                  undefined,
                  resolve as (r: T) => void,
                ) as typeof component;
              });
            },
          }
        : {}),
    },
  };

  return {
    host,
    ctx,
    commands,
    tools,
    notifications,
    widgets,
    getComponent: () => component,
    getRenderRequests: () => renderRequests,
  };
}

async function seededRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-console-"));
  await initState(root, { displayName: "console-demo" });
  await updateState(root, (s) =>
    createWorkItem(s, { kind: "task", title: "First item", status: "ready" }, "T"),
  );
  await updateState(root, (s) => setNextActionRationale(s, "Because it unblocks the slice."));
  return root;
}

test("/voila home is registered and offered in completions", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-console-"));
  const h = harness(root, { withCustom: true, mode: "tui" });
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);
  const cmd = h.commands.get("voila");
  assert.ok(cmd);
  assert.ok(SUBCOMMANDS.includes("home"));
  assert.deepEqual(cmd.getArgumentCompletions?.("ho"), [{ value: "home", label: "home" }]);
});

test("canonical state is transformed into the console view model", async () => {
  const root = await seededRoot();
  const model = await buildModelForRoot(root, "0.82.0");
  assert.equal(model.status, "ok");
  assert.equal(model.identity?.displayName, "console-demo");
  assert.equal(model.nextAction?.rationale, "Because it unblocks the slice.");
  assert.equal(model.work.counts.ready, 1);
  assert.equal(model.runtime.piVersion, "0.82.0");
  assert.ok(model.runtime.nodeVersion);
  // The Proof view is present but empty: a project with no claims implies no proof.
  assert.ok(model.proof, "proof view is built");
  assert.deepEqual(model.proof?.claims, []);
  assert.deepEqual(model.proof?.receipts, []);
  assert.equal(model.proof?.summary.total, 0);
});

test("missing state produces an initialization view rather than a crash", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-console-"));
  const model = await buildModelForRoot(root);
  assert.equal(model.status, "uninitialized");
});

test("/voila home opens the custom component and closing returns control", async () => {
  const root = await seededRoot();
  const h = harness(root, { withCustom: true, mode: "tui" });
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);

  const pending = h.commands.get("voila")!.handler("home", h.ctx);
  // Wait deterministically for the TUI factory to mount the component. The factory runs
  // synchronously inside `custom()`, but only after buildModelForRoot's I/O resolves. Polling the
  // shared component reference is bounded and removes the 20ms sleep that was the flake's surface.
  const deadline = Date.now() + 5000;
  while (!h.getComponent() && Date.now() < deadline) {
    await new Promise((r) => setImmediate(r));
  }
  const component = h.getComponent();
  assert.ok(component, "custom component was created");

  const lines = component.render(100);
  assert.ok(lines.length > 5);
  assert.match(lines.join("\n"), /VOILA · console-demo/);

  // Close with q; the handler resolves and the ambient widget is restored.
  component.handleInput("q");
  await pending;
  assert.ok(h.widgets.length > 0, "ambient widget refreshed after console close");
});

test("non-TUI mode falls back to status output instead of failing", async () => {
  const root = await seededRoot();
  const h = harness(root, { withCustom: false, mode: "rpc" });
  (voilaExtension as unknown as (pi: unknown) => void)(h.host);
  await h.commands.get("voila")!.handler("home", h.ctx);
  const text = h.notifications.join("\n");
  assert.match(text, /interactive terminal/);
  assert.match(text, /Voila — console-demo/);
});

test("themeStyler maps tokens through the Pi theme and survives failures", () => {
  const calls: string[] = [];
  const styler = themeStyler({
    fg: (color, text) => {
      calls.push(color);
      return `<${color}>${text}`;
    },
    bold: (t) => `*${t}`,
  });
  assert.equal(styler.fg("accent", "x"), "<accent>x");
  assert.equal(styler.fg("border", "x"), "<borderMuted>x", "border maps to a real Pi token");
  assert.equal(styler.bold("x"), "*x");

  const broken = themeStyler({
    fg: () => {
      throw new Error("bad token");
    },
    bold: () => {
      throw new Error("bad");
    },
  });
  assert.equal(broken.fg("accent", "x"), "x", "styling failures degrade to plain text");
  assert.equal(broken.bold("x"), "x");
});
