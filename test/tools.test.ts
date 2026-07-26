import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { voilaTools, type VoilaTool } from "../src/tools/index.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";

async function initedRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-tools-"));
  await initState(root, { displayName: "demo" });
  return root;
}

function toolByName(name: string): VoilaTool {
  const t = voilaTools().find((x) => x.name === name);
  assert.ok(t, `tool ${name} exists`);
  return t;
}

async function run(tool: VoilaTool, params: Record<string, unknown>, cwd: string) {
  return tool.execute("call-1", params, undefined, undefined, { cwd });
}

test("expected tool surface is registered with schemas", () => {
  const names = voilaTools()
    .map((t) => t.name)
    .sort();
  assert.deepEqual(names, [
    "voila_apply_intake",
    "voila_cancel_operation",
    "voila_complete_work_item",
    "voila_create_claim",
    "voila_create_intake",
    "voila_create_work_item",
    "voila_get_delivery_summary",
    "voila_get_intake_draft",
    "voila_get_operation",
    "voila_get_project_context",
    "voila_get_proof",
    "voila_get_receipt",
    "voila_list_claims",
    "voila_list_project_operations",
    "voila_list_work_items",
    "voila_read_operation_output",
    "voila_record_assumption",
    "voila_record_decision",
    "voila_record_orientation",
    "voila_record_risk",
    "voila_reject_intake",
    "voila_repair_state_counters",
    "voila_request_intake_revision",
    "voila_require_claim",
    "voila_run_verification",
    "voila_set_focus",
    "voila_set_next_action",
    "voila_stage_intake_draft",
    "voila_start_operation",
    "voila_suggest_commit",
    "voila_update_assumption",
    "voila_update_claim",
    "voila_update_decision",
    "voila_update_risk",
    "voila_update_work_item",
  ]);
  for (const t of voilaTools()) {
    assert.equal(typeof t.execute, "function");
    assert.ok(t.parameters && typeof t.parameters === "object");
  }
});

test("create/update/list work-item tools mutate canonical state", async () => {
  const root = await initedRoot();
  const create = toolByName("voila_create_work_item");
  const res = await run(create, { kind: "task", title: "Do the thing", priority: "high" }, root);
  assert.match(res.content[0]?.text ?? "", /Created NF-1/);

  const state = await loadState(root);
  assert.equal(state.workItems.length, 1);
  assert.equal(state.workItems[0]?.title, "Do the thing");
  assert.ok((state.revision ?? 0) > 1, "revision advanced by the mutation");

  const update = toolByName("voila_update_work_item");
  await run(update, { id: "NF-1", status: "ready" }, root);
  assert.equal((await loadState(root)).workItems[0]?.status, "ready");

  const list = toolByName("voila_list_work_items");
  const listed = await run(list, { status: "ready" }, root);
  assert.match(listed.content[0]?.text ?? "", /NF-1/);
});

test("counter repair advances drift through an explicit canonical transition", async () => {
  const root = await initedRoot();
  await run(
    toolByName("voila_record_decision"),
    { title: "d", decision: "x", rationale: "y", status: "accepted" },
    root,
  );
  await updateState(root, (cur) => ({
    ...cur,
    sequences: { ...cur.sequences, decision: 1 },
  }));
  assert.equal((await loadState(root)).sequences.decision, 1);

  const result = await run(toolByName("voila_repair_state_counters"), {}, root);
  assert.match(result.content[0]?.text ?? "", /decision 1->2/);
  assert.equal((await loadState(root)).sequences.decision, 2);
});

test("tools cannot mark a work item completed", async () => {
  const root = await initedRoot();
  const create = toolByName("voila_create_work_item");
  await assert.rejects(() => run(create, { kind: "task", title: "x", status: "completed" }, root));
  await run(create, { kind: "task", title: "x" }, root);
  const update = toolByName("voila_update_work_item");
  await assert.rejects(() => run(update, { id: "NF-1", status: "completed" }, root));
});

test("record decision/assumption/risk tools persist entities", async () => {
  const root = await initedRoot();
  await run(
    toolByName("voila_record_decision"),
    { title: "d", decision: "x", rationale: "y" },
    root,
  );
  await run(toolByName("voila_record_assumption"), { statement: "a", confidence: "high" }, root);
  await run(
    toolByName("voila_record_risk"),
    { statement: "r", likelihood: "low", impact: "high" },
    root,
  );
  const state = await loadState(root);
  assert.equal(state.decisions[0]?.id, "DEC-1");
  assert.equal(state.assumptions[0]?.id, "ASM-1");
  assert.equal(state.risks[0]?.id, "RSK-1");

  const ops = await run(toolByName("voila_list_project_operations"), {}, root);
  assert.match(ops.content[0]?.text ?? "", /DEC-1/);
});

test("tool errors propagate (actionable) for unknown work item", async () => {
  const root = await initedRoot();
  await assert.rejects(() => run(toolByName("voila_update_work_item"), { id: "NF-42" }, root));
});
