import { requestRevision } from "./helpers.ts";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState } from "../src/state/store.ts";
import {
  appendReview,
  applyIntake,
  createIntake,
  listDraftRevisions,
  readDraft,
  readManifest,
  readReviews,
  readUnderstanding,
  rejectIntake,
  requestIntakeRevision,
  stageIntakeDraft,
} from "../src/state/intake-store.ts";
import { intakePaths, revisionPaths } from "../src/state/paths.ts";
import { runDoctor, type DoctorInput } from "../src/commands/doctor.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";

const SOURCE = ["# Brief", "", "Use SQLite.", "No web UI.", "Latency risk."].join("\n");

function draftFor(intakeId: string, over: Record<string, unknown> = {}) {
  const ref = (l: number) => [{ intakeId, startLine: l }];
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
    ],
    proposedWorkItems: [{ id: "W1", kind: "task", title: "Add storage", sourceFindingIds: ["F1"] }],
    ...over,
  };
}

async function repoWithSource() {
  const root = await mkdtemp(join(tmpdir(), "newfang-hist-"));
  await initState(root, { displayName: "hist-demo" });
  await writeFile(join(root, "brief.md"), SOURCE, "utf8");
  const created = await createIntake(root, { path: "brief.md" });
  return { root, intakeId: created.intake.id };
}

function doctorInput(root: string, over: Partial<DoctorInput> = {}): DoctorInput {
  return {
    root,
    piVersion: "0.82.0",
    expectedPiVersion: "0.82.0",
    nodeVersion: "v22.23.1",
    minNode: "22.19.0",
    ...over,
  };
}
function check(checks: Awaited<ReturnType<typeof runDoctor>>, name: string) {
  const c = checks.find((x) => x.name === name);
  assert.ok(c, `check "${name}" present`);
  return c;
}

test("two staged revisions produce two numbered artifacts", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await requestRevision(root, intakeId);
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Revised objective." }));

  assert.deepEqual(await listDraftRevisions(root, intakeId), [1, 2]);
  const paths = intakePaths(root, intakeId);
  assert.ok(existsSync(revisionPaths(root, intakeId, 1).draft));
  assert.ok(existsSync(revisionPaths(root, intakeId, 2).draft));
  // The manifest identifies the current revision.
  assert.equal((await readManifest(root, intakeId)).currentDraftRevision, 2);
  assert.equal((await loadState(root)).intakes[0]?.draftRevision, 2);
  // The flat legacy artifacts are not used.
  assert.ok(!existsSync(join(paths.dir, "draft.json")));
});

test("a prior draft revision is preserved verbatim", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  const firstBytes = await readFile(revisionPaths(root, intakeId, 1).draft, "utf8");

  await requestRevision(root, intakeId);
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Revised objective." }));

  assert.equal(
    await readFile(revisionPaths(root, intakeId, 1).draft, "utf8"),
    firstBytes,
    "revision 1 is untouched",
  );
  const rev1 = await readDraft(root, intakeId, 1);
  const rev2 = await readDraft(root, intakeId, 2);
  assert.equal(rev1?.objective, "Ship a local-first tool.");
  assert.equal(rev2?.objective, "Revised objective.");
  assert.equal(rev1?.draftRevision, 1);
  assert.equal(rev2?.draftRevision, 2);
});

test("a prior Understanding Check is preserved", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  const first = await readUnderstanding(root, intakeId, 1);
  assert.ok(first && first.includes("Ship a local-first tool."));

  await requestRevision(root, intakeId);
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Revised objective." }));
  assert.equal(await readUnderstanding(root, intakeId, 1), first, "revision 1 view unchanged");
  const second = await readUnderstanding(root, intakeId, 2);
  assert.ok(second && second.includes("Revised objective."));
  // Default read follows the manifest pointer.
  assert.equal(await readUnderstanding(root, intakeId), second);
});

test("a revision-request review event is recorded", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await requestIntakeRevision(root, intakeId, {
    reviewedDraftRevision: 1,
    feedback: "Reclassify the storage decision as a proposal.",
  });
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Revised objective." }));

  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.length, 1);
  assert.equal(reviews[0]?.action, "revision_requested");
  assert.equal(reviews[0]?.reviewedRevision, 1);
  assert.match(reviews[0]?.feedback ?? "", /Reclassify/);
});

test("accepting appends an accepted review record and records the exact revision", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await requestRevision(root, intakeId);
  const staged = await stageIntakeDraft(
    root,
    intakeId,
    draftFor(intakeId, { objective: "Rev 2." }),
  );
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  const reviews = await readReviews(root, intakeId);
  const accepted = reviews.filter((r) => r.action === "accepted");
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0]?.reviewedRevision, 2);
  assert.equal(accepted[0]?.resultingStatus, "accepted");

  const record = (await loadState(root)).intakes[0];
  assert.equal(record?.acceptedDraftRevision, 2, "exact accepted revision recorded");
  assert.equal(record?.draftRevision, 2);
});

test("rejecting appends a rejection record with feedback", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await rejectIntake(root, intakeId, "out of scope for now");
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.at(-1)?.action, "rejected");
  assert.equal(reviews.at(-1)?.feedback, "out of scope for now");
  assert.equal(reviews.at(-1)?.resultingStatus, "rejected");
});

test("re-applying the accepted revision stays idempotent", async () => {
  const { root, intakeId } = await repoWithSource();
  const staged = await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await applyIntake(root, intakeId, { reviewedDraftRevision: 1, confirmed: true });
  const afterFirst = await loadState(root);

  const again = await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });
  assert.equal(again.alreadyApplied, true);
  const afterSecond = await loadState(root);
  assert.equal(afterSecond.workItems.length, afterFirst.workItems.length);
  // Only one accepted review record, not one per attempt.
  assert.equal(
    (await readReviews(root, intakeId)).filter((r) => r.action === "accepted").length,
    1,
  );
});

test("doctor detects an accepted-revision mismatch", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await applyIntake(root, intakeId, { reviewedDraftRevision: 1, confirmed: true });
  assert.equal(check(await runDoctor(doctorInput(root)), "intake artifacts").level, "pass");

  // Corrupt the review log so the accepted record names a different revision.
  const paths = intakePaths(root, intakeId);
  const reviews = await readReviews(root, intakeId);
  const tampered = reviews.map((r) =>
    r.action === "accepted" ? { ...r, reviewedRevision: 99 } : r,
  );
  await writeFile(paths.reviews, tampered.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "intake artifacts").level, "fail");
  assert.match(
    check(checks, "intake artifacts").detail,
    /does not match any accepted review record/,
  );
});

test("doctor detects a missing revision artifact and non-monotonic revisions", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await requestRevision(root, intakeId);
  await stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 2." }));
  assert.equal(check(await runDoctor(doctorInput(root)), "intake artifacts").level, "pass");

  // Delete revision 1: the sequence is no longer monotonic 1..2.
  await rm(revisionPaths(root, intakeId, 1).draft, { force: true });
  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "intake artifacts").level, "fail");
  assert.match(check(checks, "intake artifacts").detail, /not monotonic/);

  // Delete the current revision too: that is reported as a missing current artifact.
  await rm(revisionPaths(root, intakeId, 2).draft, { force: true });
  const checks2 = await runDoctor(doctorInput(root));
  assert.match(
    check(checks2, "intake artifacts").detail,
    /draft artifact missing for current revision/,
  );
});

test("doctor detects an accepted intake with no accepted review record", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await applyIntake(root, intakeId, { reviewedDraftRevision: 1, confirmed: true });
  // Truncate the append-only log (simulating loss/tampering).
  await writeFile(intakePaths(root, intakeId).reviews, "", "utf8");
  const checks = await runDoctor(doctorInput(root));
  assert.equal(check(checks, "intake artifacts").level, "fail");
  assert.match(check(checks, "intake artifacts").detail, /no accepted review record/);
});

test("the review log is append-only across the lifecycle", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await appendReview(root, {
    intakeId,
    reviewedRevision: 1,
    action: "revision_requested",
    feedback: "tighten the objective",
    timestamp: "2026-07-25T00:00:00.000Z",
    resultingStatus: "review_required",
  });
  const staged = await stageIntakeDraft(
    root,
    intakeId,
    draftFor(intakeId, { objective: "Rev 2." }),
  );
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  const reviews = await readReviews(root, intakeId);
  assert.deepEqual(
    reviews.map((r) => `${r.action}@${r.reviewedRevision}`),
    ["revision_requested@1", "accepted@2"],
    "earlier records are retained in order",
  );
  // No hidden reasoning or transcripts are stored.
  const raw = await readFile(intakePaths(root, intakeId).reviews, "utf8");
  const keys = new Set(reviews.flatMap((r) => Object.keys(r)));
  assert.deepEqual(
    [...keys].sort(),
    ["action", "feedback", "intakeId", "resultingStatus", "reviewedRevision", "timestamp"],
    "review records carry only the narrow declared fields",
  );
  assert.ok(!/thinking|chain[- ]of[- ]thought|transcript/i.test(raw));
});

test("revision history and review log survive a restart", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  await requestRevision(root, intakeId);
  const staged = await stageIntakeDraft(
    root,
    intakeId,
    draftFor(intakeId, { objective: "Rev 2." }),
  );
  await applyIntake(root, intakeId, {
    reviewedDraftRevision: staged.draft.draftRevision,
    confirmed: true,
  });

  // Simulate restart: re-read everything from disk.
  const state = await loadState(root);
  assert.equal(state.intakes[0]?.acceptedDraftRevision, 2);
  assert.deepEqual(await listDraftRevisions(root, intakeId), [1, 2]);
  assert.ok((await readDraft(root, intakeId, 1))?.objective === "Ship a local-first tool.");
  assert.ok((await readDraft(root, intakeId, 2))?.objective === "Rev 2.");

  // The full review history survives, in order: the request that caused revision 2 precedes the
  // acceptance of it.
  const reviews = await readReviews(root, intakeId);
  assert.equal(reviews.length, 2);
  assert.deepEqual(
    reviews.map((r) => [r.action, r.reviewedRevision]),
    [
      ["revision_requested", 1],
      ["accepted", 2],
    ],
  );
  assert.ok(
    Date.parse(reviews[0]!.timestamp) <= Date.parse(reviews[1]!.timestamp),
    "review log is chronological",
  );
  assert.equal(check(await runDoctor(doctorInput(root)), "intake artifacts").level, "pass");
});

test("staging never overwrites an existing revision artifact", async () => {
  const { root, intakeId } = await repoWithSource();
  await stageIntakeDraft(root, intakeId, draftFor(intakeId));
  // Pass the revision-request gate so this exercises overwrite protection, not the gate.
  await requestRevision(root, intakeId);
  // Force a collision by pre-creating the next revision's artifact.
  await writeFile(revisionPaths(root, intakeId, 2).draft, "{}", "utf8");
  await assert.rejects(
    () => stageIntakeDraft(root, intakeId, draftFor(intakeId, { objective: "Rev 2." })),
    ProjectOperationError,
  );
  assert.equal(
    await readFile(revisionPaths(root, intakeId, 2).draft, "utf8"),
    "{}",
    "not overwritten",
  );
});
