import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  isProtectedVoilaPath,
  protectedMutationTarget,
  resolveRepositoryPath,
} from "../src/state/path-boundary.ts";
import { UnsafeSourcePathError } from "../src/state/source.ts";
import { enforceProtectedPathMutation } from "../src/extension/register.ts";
import {
  R2_TOOL_ENFORCEMENT,
  assertR2ToolEnforcementDescriptors,
  r2ToolEnforcementDescriptor,
} from "../src/domain/tool-enforcement.ts";
import { operationTools } from "../src/tools/operation-tools.ts";
import { initState, loadState, updateState } from "../src/state/store.ts";

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voila-path-boundary-"));
  await mkdir(join(root, ".git"));
  await mkdir(join(root, ".voila", "views"), { recursive: true });
  await writeFile(join(root, "README.md"), "# fixture\n", "utf8");
  return root;
}

test("shared repository path boundary resolves existing and future inside paths", async () => {
  const root = await repository();
  const existing = await resolveRepositoryPath(root, "README.md", {
    mustExist: "file",
  });
  assert.equal(existing.relativePath, "README.md");
  assert.equal(existing.exists, true);

  const absolute = await resolveRepositoryPath(root, join(root, "README.md"), {
    allowAbsolute: true,
    mustExist: "file",
  });
  assert.equal(absolute.relativePath, "README.md");

  const future = await resolveRepositoryPath(root, "src/new-file.ts");
  assert.equal(future.relativePath, "src/new-file.ts");
  assert.equal(future.exists, false);
});

test("shared repository path boundary rejects traversal and symlink escape", async () => {
  const root = await repository();
  await assert.rejects(
    () => resolveRepositoryPath(root, "../outside", { rejectTraversal: true }),
    UnsafeSourcePathError,
  );

  const outside = await mkdtemp(join(tmpdir(), "voila-path-outside-"));
  await writeFile(join(outside, "secret.txt"), "secret\n", "utf8");
  await symlink(join(outside, "secret.txt"), join(root, "escape.txt"));
  await assert.rejects(
    () => resolveRepositoryPath(root, "escape.txt", { mustExist: "file" }),
    UnsafeSourcePathError,
  );
});

test("the canonical .voila tree is a protected structured-mutation boundary", async () => {
  const root = await repository();
  for (const path of [
    ".voila/project.json",
    ".voila/events.jsonl",
    ".voila/views/PROJECT_STATUS.md",
    join(root, ".voila", "receipts", "RCP-1", "manifest.json"),
  ]) {
    const target = await protectedMutationTarget(root, path);
    assert.ok(target, path);
    assert.equal(isProtectedVoilaPath(target!.relativePath), true);
  }
  assert.equal(await protectedMutationTarget(root, "src/domain/types.ts"), null);
});

test("write and edit are blocked before protected mutation; reads, bash, and Voila tools are not", async () => {
  const root = await repository();
  for (const toolName of ["write", "edit"]) {
    const result = await enforceProtectedPathMutation(
      { toolName, input: { path: ".voila/project.json" } },
      root,
    );
    assert.equal(result?.block, true);
    assert.match(result?.reason ?? "", /supported voila_\* state transition/);
  }
  assert.equal(
    await enforceProtectedPathMutation(
      { toolName: "write", input: { path: "src/domain/types.ts" } },
      root,
    ),
    undefined,
  );
  assert.equal(
    await enforceProtectedPathMutation(
      { toolName: "read", input: { path: ".voila/project.json" } },
      root,
    ),
    undefined,
  );
  assert.equal(
    await enforceProtectedPathMutation(
      { toolName: "bash", input: { command: "printf harmless" } },
      root,
    ),
    undefined,
  );
  assert.equal(
    await enforceProtectedPathMutation(
      { toolName: "voila_update_work_item", input: { id: "NF-1" } },
      root,
    ),
    undefined,
  );
});

test("supported internal Voila state mutation remains allowed", async () => {
  const root = await repository();
  await initState(root, { displayName: "path-fixture" });
  await updateState(root, (cur) => ({ ...cur, nextAction: "Supported transition succeeded." }));
  assert.equal((await loadState(root)).nextAction, "Supported transition succeeded.");
});

test("every R2A operation tool has one static enforcement descriptor", () => {
  const tools = operationTools();
  const names = tools.map((tool) => tool.name);
  assert.deepEqual(names.sort(), R2_TOOL_ENFORCEMENT.map((descriptor) => descriptor.tool).sort());
  assert.doesNotThrow(() => assertR2ToolEnforcementDescriptors(names));
  assert.equal(r2ToolEnforcementDescriptor("voila_start_operation")?.consequential, true);
  assert.equal(
    r2ToolEnforcementDescriptor("voila_cancel_operation")?.enforcementOwner,
    "operation_ownership",
  );
  assert.throws(
    () => assertR2ToolEnforcementDescriptors([...names, "voila_unclassified_operation_tool"]),
    /lack enforcement descriptors/,
  );

  const start = tools.find((tool) => tool.name === "voila_start_operation")!;
  const schema = start.parameters as { properties?: Record<string, unknown> };
  assert.deepEqual(Object.keys(schema.properties ?? {}), ["operationId"]);
  assert.equal(schema.properties?.definitionId, undefined);
  assert.equal(schema.properties?.owner, undefined);
  assert.equal(schema.properties?.workItemId, undefined);
});
