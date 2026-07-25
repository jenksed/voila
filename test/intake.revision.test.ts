// The revision-request path: the reviewer gate that makes a corrected draft attributable.
//
// Before this existed, `revision_requested` was a defined review action that nothing could write,
// so a second draft could silently replace the one under review with no record of why.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import newfangExtension from "../.pi/extensions/newfang.ts";
import { initState, loadState } from "../src/state/store.ts";
import {
  applyIntake,
  createIntake,
  MAX_REVIEW_FEEDBACK_LENGTH,
  readDraft,
  readReviews,
  readUnderstanding,
  rejectIntake,
  requestIntakeRevision,
  stageIntakeDraft,
} from "../src/state/intake-store.ts";
import { revisionPaths } from "../src/state/paths.ts";
import { runIntakeRevise } from "../src/commands/intake.ts";
import { newfangTools } from "../src/tools/index.ts";
import { handleKey, INITIAL_UI } from "../src/ui/steward-console/navigation.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";

const SOURCE = ["# Brief", "", "Use SQLite.", "No web UI."].join("\n");

function draftFor(intakeId: string, over: Record<string, unknown> = {}) {
  return {
    intakeId,
    objective: "Ship a local-first tool.",
    findings: [
      {
        id: "F1",
        category: "locked_decision",
        statement: "Use SQLite.",
        origin: "source",
        sourceRefs: [{ intakeId, startLine: 3 }],
      },
    ],
    proposedWorkItems: [{ id: "W1", kind: "task", title: "Add storage", sourceFindingIds: ["F1"] }],
    ...over,
  };
}

async function repoWithStagedDraft() {
  const root = await mkdtemp(join(tmpdir(), "newfang-rev-"));
  await initState(root, { displayName: "rev-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  const intakeId = created.intake.id;
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  return { root, intakeId };
}

const FEEDBACK = "The storage decision is a proposal, not a locked decision.";

test("a revision request is recorded before the revised draft, and only then may it be staged", async () => {
  const { root, intakeId } = await repoWithStagedDraft();

  // Staging revision 2 is refused while revision 1 has no recorded request.
  await assert.rejects(
    () => stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Revised." })),
    ProjectOperationError,
    "an unexplained restage is refused",
  );
  assert.equal((await readReviews(root, intakeId)).length, 0);

  const result = await requestIntakeRevision(root, intakeId, {
    reviewedDraftRevision: 1,
    feedback: FEEDBACK,
  });
  assert.equal(result.record.action, "revision_requested");
  assert.equal(result.record.reviewedRevision, 1);
  assert.equal(result.record.feedback, FEEDBACK);
  assert.equal(result.supersededRequests, 0);

  // Requesting changes no project truth and introduces no new lifecycle status.
  assert.equal(result.intake.status, "review_required");
  assert.equal(result.intake.draftRevision, 1);

  const staged = await stageIntakeDraft(
    root,
    intakeId,
    draftFor(intakeId, { objective: "Rev 2." }),
  );
  assert.equal(staged.draft.draftRevision, 2);

  // Ordering: the request precedes the draft it caused.
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.action, "revision_requested");
  const requestedAt = Date.parse(reviews[0]!.timestamp);
  const draftWrittenAt = Date.parse(
    (await readDraft(root, intakeId, 2))!.createdAt ?? new Date().toISOString(),
  );
  assert.ok(Number.isNaN(draftWrittenAt) || requestedAt <= draftWrittenAt);
});

test("the request must name the exact revision under review", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await assert.rejects(
    () => requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 2, feedback: FEEDBACK }),
    /does not match the current draft revision 1/,
  );
  await assert.rejects(
    () => requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 0, feedback: FEEDBACK }),
    ProjectOperationError,
  );
  assert.equal((await readReviews(root, intakeId)).length, 0, "nothing recorded on rejection");
});

test("empty or whitespace feedback is rejected", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  for (const feedback of ["", "   ", "\n\t "]) {
    await assert.rejects(
      () => requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback }),
      /requires concise feedback/,
    );
  }
  await assert.rejects(
    () =>
      requestIntakeRevision(root, intakeId, {
        reviewedDraftRevision: 1,
        feedback: "x".repeat(MAX_REVIEW_FEEDBACK_LENGTH + 1),
      }),
    /keep it under/,
    "the log stores a correction, not a transcript",
  );
  assert.equal((await readReviews(root, intakeId)).length, 0);
});

test("feedback is stored trimmed and verbatim", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await requestIntakeRevision(root, intakeId, {
    reviewedDraftRevision: 1,
    feedback: `  ${FEEDBACK}  `,
  });
  assert.equal((await readReviews(root, intakeId))[0]?.feedback, FEEDBACK);
});

test("an intake with no staged draft cannot receive a revision request", async () => {
  const root = await mkdtemp(join(tmpdir(), "newfang-rev-"));
  await initState(root, { displayName: "rev-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  await assert.rejects(
    () =>
      requestIntakeRevision(root, created.intake.id, {
        reviewedDraftRevision: 1,
        feedback: FEEDBACK,
      }),
    ProjectOperationError,
  );
});

test("an accepted or rejected intake cannot receive a revision request", async () => {
  const accepted = await repoWithStagedDraft();
  await applyIntake(accepted.root, accepted.intakeId, {
    reviewedDraftRevision: 1,
    confirmed: true,
  });
  await assert.rejects(
    () =>
      requestIntakeRevision(accepted.root, accepted.intakeId, {
        reviewedDraftRevision: 1,
        feedback: FEEDBACK,
      }),
    /is accepted/,
  );

  const rejected = await repoWithStagedDraft();
  await rejectIntake(rejected.root, rejected.intakeId, "out of scope");
  await assert.rejects(
    () =>
      requestIntakeRevision(rejected.root, rejected.intakeId, {
        reviewedDraftRevision: 1,
        feedback: FEEDBACK,
      }),
    /is rejected/,
  );
});

test("a duplicate request for the same revision needs explicit justification", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback: FEEDBACK });

  await assert.rejects(
    () =>
      requestIntakeRevision(root, intakeId, {
        reviewedDraftRevision: 1,
        feedback: "Also fix the title.",
      }),
    /already has a revision request/,
  );
  assert.equal((await readReviews(root, intakeId)).length, 1, "no accidental second record");

  const second = await requestIntakeRevision(root, intakeId, {
    reviewedDraftRevision: 1,
    feedback: "Also fix the title.",
    supersedePrevious: true,
  });
  assert.equal(second.supersededRequests, 1);
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.length, 2, "both corrections are kept; neither is overwritten");
  assert.equal(reviews[0]?.feedback, FEEDBACK);
  assert.equal(reviews[1]?.feedback, "Also fix the title.");
});

test("staging revision 3 requires a request against revision 2", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback: FEEDBACK });
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 2." }));

  await assert.rejects(
    () => stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 3." })),
    /revision 2 of .* is awaiting review/,
    "the gate follows the current revision, not just the first",
  );
});

test("a revision request never modifies prior drafts, views, or records", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  const draftBytes = await readFile(revisionPaths(root, intakeId, 1).draft, "utf8");
  const understanding = await readUnderstanding(root, intakeId, 1);

  await requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback: FEEDBACK });
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 2." }));

  assert.equal(await readFile(revisionPaths(root, intakeId, 1).draft, "utf8"), draftBytes);
  assert.equal(await readUnderstanding(root, intakeId, 1), understanding);
  assert.equal((await readDraft(root, intakeId, 1))?.objective, "Ship a local-first tool.");
  assert.equal((await readDraft(root, intakeId, 2))?.objective, "Rev 2.");
});

test("the review log survives a restart in order", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback: FEEDBACK });
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 2." }));
  await applyIntake(root, intakeId, { reviewedDraftRevision: 2, confirmed: true });

  // Re-read everything from disk, as a fresh process would.
  const reviews = await readReviews(root, intakeId);
  assert.deepEqual(
    reviews.map((r) => [r.action, r.reviewedRevision, r.resultingStatus]),
    [
      ["revision_requested", 1, "review_required"],
      ["accepted", 2, "accepted"],
    ],
  );
  const state = await loadState(root);
  assert.equal(state.intakes[0]?.acceptedDraftRevision, 2);
});

test("the review log stores no reasoning or transcript", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  await requestIntakeRevision(root, intakeId, { reviewedDraftRevision: 1, feedback: FEEDBACK });
  const raw = await readFile(join(root, ".newfang/intakes", intakeId, "reviews.jsonl"), "utf8");
  assert.ok(!/thinking|chain[- ]of[- ]thought|transcript/i.test(raw));
  const record = JSON.parse(raw.trim());
  assert.deepEqual(Object.keys(record).sort(), [
    "action",
    "feedback",
    "intakeId",
    "resultingStatus",
    "reviewedRevision",
    "timestamp",
  ]);
});

test("the command path records a request and refuses empty feedback", async () => {
  const { root, intakeId } = await repoWithStagedDraft();

  const empty = await runIntakeRevise(root, "   ");
  assert.equal(empty.level, "warning");
  assert.equal((await readReviews(root, intakeId)).length, 0);

  const ok = await runIntakeRevise(root, FEEDBACK);
  assert.equal(ok.level, "info");
  assert.match(ok.lines.join("\n"), /Revision requested/);
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.feedback, FEEDBACK);

  // A repeat through the command surfaces the duplicate guard rather than silently appending.
  const again = await runIntakeRevise(root, "Another change.");
  assert.notEqual(again.level, "info", "a duplicate request is not reported as success");
  assert.match(again.lines.join("\n"), /already has a revision request/);
  assert.equal((await readReviews(root, intakeId)).length, 1);
});

test("the tool path records a request and cannot bypass the revision check", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  const tool = newfangTools().find((t) => t.name === "newfang_request_intake_revision");
  assert.ok(tool, "newfang_request_intake_revision is registered");

  await assert.rejects(
    () =>
      tool!.execute(
        "1",
        { intakeId, reviewedDraftRevision: 2, feedback: FEEDBACK },
        undefined,
        undefined,
        { cwd: root },
      ) as Promise<unknown>,
    /does not match the current draft revision/,
  );

  await tool!.execute(
    "2",
    { intakeId, reviewedDraftRevision: 1, feedback: FEEDBACK },
    undefined,
    undefined,
    { cwd: root },
  );
  assert.equal((await readReviews(root, intakeId))[0]?.action, "revision_requested");
});

test("the Understanding Check exposes a revision action distinct from accept and reject", () => {
  const ui = {
    ...INITIAL_UI,
    view: "understanding" as const,
    scroll: 0,
    returnView: "focus" as const,
  };
  assert.equal(handleKey(ui, "revise", 0).action, "revise_intake");
  assert.equal(handleKey(ui, "accept", 0).action, "apply_intake");
  assert.equal(handleKey(ui, "reject", 0).action, "reject_intake");
  // Requesting a revision keeps the reviewer on the draft they are correcting.
  assert.equal(handleKey(ui, "revise", 0).ui.view, "understanding");
});

test("D2 regression: an intake ID routes to that intake instead of becoming the reason", async () => {
  const { root, intakeId } = await repoWithStagedDraft();
  // A second intake, which becomes the current one.
  await writeFile(join(root, "other.md"), SOURCE, "utf8");
  const other = await createIntake(root, { path: "other.md" });
  assert.notEqual(other.intake.id, intakeId);
  assert.equal((await loadState(root)).currentIntakeId, other.intake.id);

  const commands = new Map<string, { handler: (args: string, ctx: unknown) => Promise<unknown> }>();
  const host = {
    registerCommand: (
      name: string,
      opts: { handler: (a: string, c: unknown) => Promise<unknown> },
    ) => commands.set(name, opts),
    registerTool: () => {},
    on: () => {},
  };
  const ctx = { cwd: root, ui: { notify: () => {}, setWidget: () => {} } };
  (newfangExtension as unknown as (pi: unknown) => void)(host);

  // Reject the NON-current intake by ID.
  await commands.get("newfang")!.handler(`intake reject ${intakeId} not needed`, ctx);

  const state = await loadState(root);
  assert.equal(
    state.intakes.find((i) => i.id === intakeId)?.status,
    "rejected",
    "the named intake was rejected",
  );
  assert.notEqual(
    state.intakes.find((i) => i.id === other.intake.id)?.status,
    "rejected",
    "the current intake was left alone",
  );
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.at(-1)?.feedback, "not needed", "the ID is not stored as the reason");
});

test.after(async () => {
  await rm(join(tmpdir(), "newfang-rev-"), { recursive: true, force: true });
});
