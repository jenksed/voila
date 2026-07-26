import { requestRevision } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState, updateState } from "../src/state/store.ts";
import {
  applyIntake,
  createIntake,
  rejectIntake,
  stageIntakeDraft,
} from "../src/state/intake-store.ts";
import { statePaths } from "../src/state/paths.ts";
import { recordDecision, recordRisk, createWorkItem } from "../src/domain/operations.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";

const SOURCE = [
  "# Brief", // 1
  "", // 2
  "We will use SQLite.", // 3
  "We must not ship a web UI.", // 4
  "Latency could regress.", // 5
  "Assume one machine.", // 6
].join("\n");

async function repoWithSource(): Promise<{ root: string; intakeId: string }> {
  const root = await mkdtemp(join(tmpdir(), "voila-apply-"));
  await initState(root, { displayName: "apply-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  return { root, intakeId: created.intake.id };
}

function fullDraft(intakeId: string, over: Record<string, unknown> = {}) {
  const ref = (line: number) => [{ intakeId, startLine: line }];
  return {
    intakeId,
    objective: "Ship a local-first tool.",
    findings: [
      {
        id: "F1",
        category: "locked_decision",
        statement: "Use SQLite.",
        origin: "source",
        sourceRefs: ref(3),
      },
      {
        id: "F2",
        category: "proposed_decision",
        statement: "Consider a CLI first.",
        origin: "source",
        sourceRefs: ref(3),
      },
      {
        id: "F3",
        category: "risk",
        statement: "Latency could regress.",
        origin: "source",
        sourceRefs: ref(5),
      },
      {
        id: "F4",
        category: "assumption",
        statement: "Assume one machine.",
        origin: "source",
        sourceRefs: ref(6),
        confidence: "high",
      },
      {
        id: "F5",
        category: "requirement",
        statement: "Must not ship a web UI.",
        origin: "source",
        sourceRefs: ref(4),
      },
    ],
    proposedWorkItems: [
      {
        id: "W1",
        kind: "task",
        title: "Add the storage layer",
        priority: "high",
        sourceFindingIds: ["F1"],
      },
    ],
    proposedNextAction: "Build the storage layer.",
    proposedNextActionRationale: "Everything else depends on it.",
    ...over,
  };
}

test("apply is refused before review and without confirmation", async () => {
  const { root, intakeId } = await repoWithSource();
  // Not staged yet: status is source_preserved.
  await assert.rejects(
    () => applyIntake(root, intakeId, { reviewedDraftRevision: 1, confirmed: true }),
    ProjectOperationError,
  );

  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  // Staged but not confirmed.
  await assert.rejects(
    () =>
      applyIntake(root, intakeId, {
        reviewedDraftRevision: staged.draft.draftRevision,
        confirmed: false,
      }),
    ProjectOperationError,
  );
  // Nothing was created.
  const state = await loadState(root);
  assert.equal(state.decisions.length, 0);
  assert.equal(state.workItems.length, 0);
});

test("apply requires the exact reviewed draft revision", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  await requestRevision(root, intakeId);
  await stageIntakeDraft(root, intakeId, fullDraft(intakeId)); // now revision 2
  await assert.rejects(
    () => applyIntake(root, intakeId, { reviewedDraftRevision: 1, confirmed: true }),
    ProjectOperationError,
  );
});

test("apply creates decisions, assumptions, risks, and only explicit proposed work", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  const result = await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  const state = await loadState(root);
  const accepted = state.decisions.filter((d) => d.status === "accepted");
  const proposed = state.decisions.filter((d) => d.status === "proposed");
  assert.equal(accepted.length, 1, "locked_decision -> accepted decision");
  assert.equal(proposed.length, 1, "proposed_decision -> proposed decision");
  assert.equal(state.assumptions.length, 1);
  assert.equal(state.assumptions[0]?.status, "open");
  assert.equal(state.risks.length, 1);
  assert.equal(state.risks[0]?.status, "open");
  // The requirement (F5) did NOT become a work item; only W1 did.
  assert.equal(state.workItems.length, 1);
  assert.equal(state.workItems[0]?.title, "Add the storage layer");
  // Next action came from the accepted draft.
  assert.equal(state.nextAction, "Build the storage layer.");
  assert.equal(state.nextActionRationale, "Everything else depends on it.");
  assert.equal(result.summary.createdCounts.workItems, 1);
  assert.equal(state.intakes[0]?.status, "accepted");
  assert.ok(state.intakes[0]?.acceptedAt);
});

test("blocking conflicts prevent apply and change nothing", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(
    root,
    intakeId,
    fullDraft(intakeId, {
      conflicts: [
        {
          id: "C1",
          findingIds: ["F1", "F5"],
          explanation: "storage vs no-UI",
          severity: "blocking",
        },
      ],
    }),
  );
  assert.equal(staged.blocked, true);
  await assert.rejects(
    () =>
      applyIntake(root, intakeId, {
        reviewedDraftRevision: staged.draft.draftRevision,
        confirmed: true,
      }),
    ProjectOperationError,
  );
  const state = await loadState(root);
  assert.equal(state.decisions.length, 0);
  assert.equal(state.workItems.length, 0);
  assert.equal(state.intakes[0]?.status, "review_required", "still awaiting resolution");
});

test("repeated apply of the same accepted revision is idempotent", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });
  const afterFirst = await loadState(root);

  const again = await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });
  assert.equal(again.alreadyApplied, true);
  const afterSecond = await loadState(root);
  assert.equal(afterSecond.decisions.length, afterFirst.decisions.length);
  assert.equal(afterSecond.workItems.length, afterFirst.workItems.length);
  assert.equal(afterSecond.risks.length, afterFirst.risks.length);
  assert.equal(afterSecond.assumptions.length, afterFirst.assumptions.length);
});

test("exact duplicates of existing truth are skipped, not recreated", async () => {
  const { root, intakeId } = await repoWithSource();
  // Pre-existing canonical truth that the draft repeats verbatim.
  await updateState(root, (s) =>
    recordDecision(
      s,
      { title: "Storage", decision: "Use SQLite.", rationale: "prior", status: "accepted" },
      "T",
    ),
  );
  await updateState(root, (s) =>
    recordRisk(s, { statement: "Latency could regress.", likelihood: "low", impact: "low" }, "T"),
  );
  await updateState(root, (s) =>
    createWorkItem(s, { kind: "task", title: "Add the storage layer" }, "T"),
  );

  const before = await loadState(root);
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  const result = await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  const after = await loadState(root);
  assert.equal(
    after.decisions.filter((d) => d.decision === "Use SQLite.").length,
    1,
    "no duplicate decision",
  );
  assert.equal(
    after.risks.filter((r) => r.statement === "Latency could regress.").length,
    1,
    "no duplicate risk",
  );
  assert.equal(
    after.workItems.filter((w) => w.title === "Add the storage layer").length,
    1,
    "no duplicate work item",
  );
  assert.ok(result.summary.skippedDuplicates >= 3, "duplicates reported in the summary");
  // Only genuinely new entities were added.
  assert.equal(after.workItems.length, before.workItems.length);
});

test("apply generates the project brief and records one apply event", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  const paths = statePaths(root);
  assert.ok(existsSync(paths.projectBrief), "brief generated");
  const brief = await readFile(paths.projectBrief, "utf8");
  assert.match(brief, /Project Brief/);
  assert.match(brief, /Build the storage layer\./);
  assert.match(brief, /Source intakes/);
  assert.ok(
    !brief.includes("We must not ship a web UI"),
    "brief does not copy the source document",
  );

  const events = (await readFile(paths.eventsJsonl, "utf8"))
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const applies = events.filter((e) => e.type === "intake_applied");
  assert.equal(applies.length, 1, "exactly one apply event");
  assert.equal(applies[0].id, intakeId);
});

test("a failed apply leaves no partial state", async () => {
  const { root, intakeId } = await repoWithSource();
  // Propose work that duplicates nothing, but include a blocking conflict so apply throws mid-flow.
  const staged = await stageIntakeDraft(
    root,
    intakeId,
    fullDraft(intakeId, {
      conflicts: [
        { id: "C1", findingIds: ["F1"], explanation: "unresolved", severity: "blocking" },
      ],
    }),
  );
  const beforeBytes = await readFile(statePaths(root).projectJson, "utf8");
  await assert.rejects(
    () =>
      applyIntake(root, intakeId, {
        reviewedDraftRevision: staged.draft.draftRevision,
        confirmed: true,
      }),
    ProjectOperationError,
  );
  assert.equal(await readFile(statePaths(root).projectJson, "utf8"), beforeBytes);
});

test("rejecting an intake changes no project truth and blocks later apply", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  const rejected = await rejectIntake(root, intakeId, "not now");
  assert.equal(rejected.status, "rejected");
  const state = await loadState(root);
  assert.equal(state.decisions.length, 0);
  await assert.rejects(
    () =>
      applyIntake(root, intakeId, {
        reviewedDraftRevision: staged.draft.draftRevision,
        confirmed: true,
      }),
    ProjectOperationError,
  );
});

test("intake state and artifacts survive a reload (restart parity)", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, fullDraft(intakeId));
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });
  const first = await loadState(root);
  const second = await loadState(root);
  assert.deepEqual(second, first, "state reloads identically");
  assert.equal(second.currentIntakeId, intakeId);
  assert.equal(second.intakes[0]?.status, "accepted");
});
