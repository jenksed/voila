import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState, updateState } from "../src/state/store.ts";
import { createIntake, readSource, stageIntakeDraft } from "../src/state/intake-store.ts";
import { intakePaths } from "../src/state/paths.ts";
import { createWorkItem } from "../src/domain/operations.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";
import {
  FINDING_CATEGORIES,
  blockingConflicts,
  modelInferences,
  validateIntakeDraft,
} from "../src/domain/intake.ts";
import { createInitialState } from "../src/domain/defaults.ts";

const SOURCE = [
  "# Brief",
  "",
  "We will use SQLite.",
  "We will not build a web UI.",
  "Ship by Q3.",
].join("\n");

async function repoWithSource(): Promise<{ root: string; intakeId: string }> {
  const root = await mkdtemp(join(tmpdir(), "newfang-draft-"));
  await initState(root, { displayName: "draft-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  return { root, intakeId: created.intake.id };
}

function baseDraft(intakeId: string, over: Record<string, unknown> = {}) {
  return {
    intakeId,
    objective: "Ship the thing.",
    findings: [
      {
        id: "F1",
        category: "locked_decision",
        statement: "Use SQLite.",
        origin: "source",
        sourceRefs: [{ intakeId, startLine: 3 }],
      },
    ],
    ...over,
  };
}

const emptyState = () => createInitialState({ displayName: "x", now: "T", projectId: "p" });

test("all classification categories are accepted", () => {
  const state = emptyState();
  for (const category of FINDING_CATEGORIES) {
    const draft = validateIntakeDraft(
      {
        intakeId: "INT-1",
        objective: "o",
        findings: [
          {
            id: "F1",
            category,
            statement: "s",
            origin: "model_inference",
          },
        ],
      },
      { state },
    );
    assert.equal(draft.findings[0]?.category, category);
  }
});

test("duplicate finding IDs are rejected", () => {
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          intakeId: "INT-1",
          objective: "o",
          findings: [
            { id: "F1", category: "requirement", statement: "a", origin: "model_inference" },
            { id: "F1", category: "requirement", statement: "b", origin: "model_inference" },
          ],
        },
        { state: emptyState() },
      ),
    ProjectOperationError,
  );
});

test("source-derived findings require provenance; inferences must be explicit", () => {
  // origin "source" with no refs is rejected.
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          intakeId: "INT-1",
          objective: "o",
          findings: [{ id: "F1", category: "requirement", statement: "a", origin: "source" }],
        },
        { state: emptyState() },
      ),
    ProjectOperationError,
  );
  // The same statement is fine when explicitly marked as inference.
  const draft = validateIntakeDraft(
    {
      intakeId: "INT-1",
      objective: "o",
      findings: [{ id: "F1", category: "requirement", statement: "a", origin: "model_inference" }],
    },
    { state: emptyState() },
  );
  assert.equal(modelInferences(draft).length, 1);
});

test("file line references are validated against the source length", async () => {
  const { root, intakeId } = await repoWithSource();
  const lineCount = (await readSource(root, intakeId)).split("\n").length;

  // Beyond the end of the source.
  await assert.rejects(
    () =>
      stageIntakeDraft(
        root,
        intakeId,
        baseDraft(intakeId, {
          findings: [
            {
              id: "F1",
              category: "requirement",
              statement: "x",
              origin: "source",
              sourceRefs: [{ intakeId, startLine: lineCount + 50 }],
            },
          ],
        }),
      ),
    ProjectOperationError,
  );

  // endLine before startLine.
  await assert.rejects(
    () =>
      stageIntakeDraft(
        root,
        intakeId,
        baseDraft(intakeId, {
          findings: [
            {
              id: "F1",
              category: "requirement",
              statement: "x",
              origin: "source",
              sourceRefs: [{ intakeId, startLine: 3, endLine: 2 }],
            },
          ],
        }),
      ),
    ProjectOperationError,
  );
});

test("a source ref needs a line range, marker, or excerpt", () => {
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          intakeId: "INT-1",
          objective: "o",
          findings: [
            {
              id: "F1",
              category: "requirement",
              statement: "a",
              origin: "source",
              sourceRefs: [{ intakeId: "INT-1" }],
            },
          ],
        },
        { state: emptyState() },
      ),
    ProjectOperationError,
  );
});

test("proposed work must cite findings and may only relate to existing work items", () => {
  let state = emptyState();
  state = createWorkItem(state, { kind: "task", title: "Existing" }, "T"); // NF-1

  // Cites nothing.
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          ...baseDraft("INT-1"),
          proposedWorkItems: [{ id: "W1", kind: "task", title: "New", sourceFindingIds: [] }],
        },
        { state },
      ),
    ProjectOperationError,
  );
  // Cites an unknown finding.
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          ...baseDraft("INT-1"),
          proposedWorkItems: [{ id: "W1", kind: "task", title: "New", sourceFindingIds: ["F9"] }],
        },
        { state },
      ),
    ProjectOperationError,
  );
  // Relates to a nonexistent work item.
  assert.throws(
    () =>
      validateIntakeDraft(
        {
          ...baseDraft("INT-1"),
          proposedWorkItems: [
            {
              id: "W1",
              kind: "task",
              title: "New",
              sourceFindingIds: ["F1"],
              relatesToWorkItemId: "NF-99",
            },
          ],
        },
        { state },
      ),
    ProjectOperationError,
  );
  // Valid relation.
  const ok = validateIntakeDraft(
    {
      ...baseDraft("INT-1"),
      proposedWorkItems: [
        {
          id: "W1",
          kind: "task",
          title: "New",
          sourceFindingIds: ["F1"],
          relatesToWorkItemId: "NF-1",
        },
      ],
    },
    { state },
  );
  assert.equal(ok.proposedWorkItems[0]?.relatesToWorkItemId, "NF-1");
});

test("conflicts must reference known findings; blocking conflicts are detected", () => {
  const draft = validateIntakeDraft(
    {
      ...baseDraft("INT-1"),
      findings: [
        {
          id: "F1",
          category: "locked_decision",
          statement: "a",
          origin: "source",
          sourceRefs: [{ intakeId: "INT-1", startLine: 3 }],
        },
        {
          id: "F2",
          category: "locked_decision",
          statement: "not a",
          origin: "source",
          sourceRefs: [{ intakeId: "INT-1", startLine: 4 }],
        },
      ],
      conflicts: [
        { id: "C1", findingIds: ["F1", "F2"], explanation: "contradiction", severity: "blocking" },
      ],
    },
    { state: emptyState() },
  );
  assert.equal(blockingConflicts(draft).length, 1);
  assert.equal(
    draft.conflicts[0]?.requiresUserResolution,
    true,
    "blocking implies user resolution",
  );

  assert.throws(
    () =>
      validateIntakeDraft(
        {
          ...baseDraft("INT-1"),
          conflicts: [{ id: "C1", findingIds: ["F9"], explanation: "x", severity: "warning" }],
        },
        { state: emptyState() },
      ),
    ProjectOperationError,
  );
});

test("staging increments draftRevision, writes artifacts, and changes no project truth", async () => {
  const { root, intakeId } = await repoWithSource();
  const before = await loadState(root);

  const first = await stageIntakeDraft(root, intakeId, baseDraft(intakeId));
  assert.equal(first.draft.draftRevision, 1);
  assert.equal(first.intake.status, "review_required");

  const second = await stageIntakeDraft(root, intakeId, baseDraft(intakeId));
  assert.equal(second.draft.draftRevision, 2, "revision increments per staging");

  const paths = intakePaths(root, intakeId);
  const stored = JSON.parse(await readFile(paths.draft, "utf8"));
  assert.equal(stored.draftRevision, 2);
  assert.match(await readFile(paths.understanding, "utf8"), /Understanding Check/);

  // No project truth changed by staging.
  const after = await loadState(root);
  assert.equal(after.decisions.length, before.decisions.length);
  assert.equal(after.workItems.length, before.workItems.length);
  assert.equal(after.risks.length, before.risks.length);
});

test("the preserved source is immutable across draft revisions", async () => {
  const { root, intakeId } = await repoWithSource();
  const original = await readSource(root, intakeId);
  await stageIntakeDraft(root, intakeId, baseDraft(intakeId));
  await stageIntakeDraft(root, intakeId, baseDraft(intakeId, { objective: "Changed objective." }));
  assert.equal(await readSource(root, intakeId), original, "source.md never rewritten");
});
