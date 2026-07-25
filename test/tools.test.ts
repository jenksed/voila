import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { newfangTools, type NewfangTool } from "../src/tools/index.ts";
import { initState, loadState } from "../src/state/store.ts";

async function initedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "newfang-tools-"));
  await initState(root, { displayName: "demo" });
  return root;
}

function toolByName(name: string): NewfangTool {
  const t = newfangTools().find((x) => x.name === name);
  assert.ok(t, `tool ${name} exists`);
  return t;
}

async function run(tool: NewfangTool, params: Record<string, unknown>, cwd: string) {
  return tool.execute("call-1", params, undefined, undefined, { cwd });
}

test("expected tool surface is registered with schemas", () => {
  const names = newfangTools()
    .map((t) => t.name)
    .sort();
  assert.deepEqual(names, [
    "newfang_apply_intake",
    "newfang_create_intake",
    "newfang_create_work_item",
    "newfang_get_intake_draft",
    "newfang_get_project_context",
    "newfang_list_project_operations",
    "newfang_list_work_items",
    "newfang_record_assumption",
    "newfang_record_decision",
    "newfang_record_orientation",
    "newfang_record_risk",
    "newfang_reject_intake",
    "newfang_set_focus",
    "newfang_set_next_action",
    "newfang_stage_intake_draft",
    "newfang_update_assumption",
    "newfang_update_decision",
    "newfang_update_risk",
    "newfang_update_work_item",
  ]);
  for (const t of newfangTools()) {
    assert.equal(typeof t.execute, "function");
    assert.ok(t.parameters && typeof t.parameters === "object");
  }
});

test("create/update/list work-item tools mutate canonical state", async () => {
  const root = await initedRoot();
  const create = toolByName("newfang_create_work_item");
  const res = await run(create, { kind: "task", title: "Do the thing", priority: "high" }, root);
  assert.match(res.content[0]?.text ?? "", /Created NF-1/);

  const state = await loadState(root);
  assert.equal(state.workItems.length, 1);
  assert.equal(state.workItems[0]?.title, "Do the thing");
  assert.ok((state.revision ?? 0) > 1, "revision advanced by the mutation");

  const update = toolByName("newfang_update_work_item");
  await run(update, { id: "NF-1", status: "ready" }, root);
  assert.equal((await loadState(root)).workItems[0]?.status, "ready");

  const list = toolByName("newfang_list_work_items");
  const listed = await run(list, { status: "ready" }, root);
  assert.match(listed.content[0]?.text ?? "", /NF-1/);
});

test("tools cannot mark a work item completed", async () => {
  const root = await initedRoot();
  const create = toolByName("newfang_create_work_item");
  await assert.rejects(() => run(create, { kind: "task", title: "x", status: "completed" }, root));
  await run(create, { kind: "task", title: "x" }, root);
  const update = toolByName("newfang_update_work_item");
  await assert.rejects(() => run(update, { id: "NF-1", status: "completed" }, root));
});

test("record decision/assumption/risk tools persist entities", async () => {
  const root = await initedRoot();
  await run(
    toolByName("newfang_record_decision"),
    { title: "d", decision: "x", rationale: "y" },
    root,
  );
  await run(toolByName("newfang_record_assumption"), { statement: "a", confidence: "high" }, root);
  await run(
    toolByName("newfang_record_risk"),
    { statement: "r", likelihood: "low", impact: "high" },
    root,
  );
  const state = await loadState(root);
  assert.equal(state.decisions[0]?.id, "DEC-1");
  assert.equal(state.assumptions[0]?.id, "ASM-1");
  assert.equal(state.risks[0]?.id, "RSK-1");

  const ops = await run(toolByName("newfang_list_project_operations"), {}, root);
  assert.match(ops.content[0]?.text ?? "", /DEC-1/);
});

test("tool errors propagate (actionable) for unknown work item", async () => {
  const root = await initedRoot();
  await assert.rejects(() => run(toolByName("newfang_update_work_item"), { id: "NF-42" }, root));
});
