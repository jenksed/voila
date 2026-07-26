// Delivery summary: the join between the read-only inspection and canonical project truth.
//
// The properties that matter most here are honesty properties. A delivery summary is exactly where
// the temptation to round a stale claim up to "proven" would appear, so several tests exist purely
// to make that impossible.

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDeliverySummary } from "../../src/delivery/summary.ts";
import { renderDeliverySummary } from "../../src/delivery/render.ts";
import { inspectDelivery } from "../../src/delivery-inspector/index.ts";
import { initState, loadState, updateState } from "../../src/state/store.ts";
import { createWorkItem } from "../../src/domain/operations.ts";
import { createClaim, requireClaim } from "../../src/domain/proof.ts";
import type { ProjectState } from "../../src/domain/types.ts";
import { fakeGit, numstatPayload, statusPayload } from "../delivery-inspector/support.ts";

const CRITERION = "the suite passes";
const T = "2026-07-26T00:00:00.000Z";

/** An inspection driven entirely by replayed git payloads — no real repository needed. */
async function inspectionOf(paths: string[], options: { untracked?: string[] } = {}) {
  const entries = [
    ...paths.map((path) => ({ kind: "ordinary" as const, path, x: "M", y: "." })),
    ...(options.untracked ?? []).map((path) => ({ kind: "untracked" as const, path })),
  ];
  return inspectDelivery("/fake", {
    runGit: fakeGit({
      status: statusPayload({ branch: "main", entries }),
      unstagedNumstat: numstatPayload(paths.map((path) => ({ path, insertions: 3, deletions: 1 }))),
    }).runGit,
    skipRootCheck: true,
  });
}

async function stateWithClaim(): Promise<{ root: string; state: ProjectState }> {
  const root = await mkdtemp(join(tmpdir(), "voila-delivery-"));
  await initState(root, { displayName: "delivery-demo", now: T });
  await updateState(root, (cur) => {
    let s = createWorkItem(
      cur,
      { kind: "task", title: "Ship the thing", acceptanceCriteria: [CRITERION] },
      T,
    );
    const item = s.workItems[s.workItems.length - 1];
    s = createClaim(
      s,
      {
        workItemId: item?.id as string,
        statement: "The suite passes.",
        confidence: "high",
        coveredAcceptanceCriteria: [CRITERION],
      },
      T,
    );
    const claim = s.claims[s.claims.length - 1];
    return requireClaim(s, { workItemId: item?.id as string, claimId: claim?.id as string }, T);
  });
  return { root, state: await loadState(root) };
}

test("a clean tree reports clean and proposes nothing", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectDelivery("/fake", {
    runGit: fakeGit({ status: statusPayload({ branch: "main", entries: [] }) }).runGit,
    skipRootCheck: true,
  });

  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });
  assert.equal(summary.clean, true);
  assert.deepEqual(summary.commits, []);
  assert.match(renderDeliverySummary(summary).join("\n"), /Nothing changed/);
});

test("the summary carries project identity and the canonical next action verbatim", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  assert.equal(summary.projectName, "delivery-demo");
  assert.equal(summary.phase, state.phase);
  assert.equal(summary.nextAction, state.nextAction, "next action is read, never invented");
  assert.equal(summary.branch, "main");
});

test("a claim with no receipt is reported unsupported, never as evidence", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  assert.equal(summary.claims.length, 1);
  const claim = summary.claims[0];
  assert.notEqual(claim?.status, "supported");
  assert.deepEqual(summary.supportingClaimIds, []);
  assert.deepEqual(summary.unsupportedClaimIds, [claim?.claimId]);

  const rendered = renderDeliverySummary(summary).join("\n");
  assert.match(rendered, /0 of 1 claim\(s\) currently supported/);
});

test("an unsupported claim still appears in the rendered summary with its reason", async () => {
  // Hiding a claim would be as dishonest as marking it supported.
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });
  const rendered = renderDeliverySummary(summary).join("\n");

  const claimId = summary.claims[0]?.claimId as string;
  assert.ok(rendered.includes(claimId), "the claim is listed, not omitted");
  assert.ok(
    rendered.includes(summary.claims[0]?.reason as string),
    "the reason it is not supported is shown",
  );
});

test("a missing fingerprint is reported as a limitation rather than silently ignored", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: null });

  assert.ok(
    summary.limitations.some((l) => /no claim can be shown as current evidence/i.test(l)),
    "a summary without git says so",
  );
});

test("a project with no claims says the delivery carries no evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "voila-delivery-"));
  await initState(root, { displayName: "bare", now: T });
  const state = await loadState(root);
  const inspection = await inspectionOf(["src/a.ts"]);

  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });
  assert.deepEqual(summary.claims, []);
  assert.ok(summary.limitations.some((l) => /carries no evidence/i.test(l)));
});

test("the summary always states that the engine proposes and never acts", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  assert.ok(
    summary.limitations.some((l) =>
      /does not commit, stage, push, or open a pull request/i.test(l),
    ),
    "the delivery boundary is stated in every summary",
  );
});

test("open risks from canonical state appear in the summary", async () => {
  const { root } = await stateWithClaim();
  await updateState(root, (cur) => ({
    ...cur,
    risks: [
      {
        id: "RSK-1",
        statement: "Concurrent writers could race.",
        likelihood: "low" as const,
        impact: "high" as const,
        status: "open" as const,
        createdAt: T,
        updatedAt: T,
      },
    ],
    sequences: { ...cur.sequences, risk: 2 },
  }));
  const state = await loadState(root);
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  assert.ok(summary.risks.some((r) => r.includes("RSK-1")));
});

test("ungrouped paths are surfaced as a risk, not quietly dropped", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  if (inspection.unassignedPaths.length > 0) {
    assert.ok(summary.risks.some((r) => /not grouped into any suggested commit/i.test(r)));
  }
});

test("the summary is deterministic for the same inputs", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts", "test/a.test.ts", "docs/a.md"]);

  const first = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });
  const second = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });
  assert.deepEqual(
    renderDeliverySummary(second),
    renderDeliverySummary(first),
    "two runs over identical inputs render identically, so summaries are diffable",
  );
});

test("discovered verification commands are listed but marked never executed", async () => {
  const { state } = await stateWithClaim();
  const inspection = await inspectionOf(["src/a.ts"]);
  const summary = buildDeliverySummary({ state, inspection, fingerprint: "a".repeat(64) });

  for (const command of summary.verificationCommands) {
    assert.equal(command.executed, false, "the engine never runs a discovered command");
  }
  assert.match(
    renderDeliverySummary(summary).join("\n"),
    /Verification commands \(discovered, never executed\)/,
  );
});
