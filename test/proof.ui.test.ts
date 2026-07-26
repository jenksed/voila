// Proof view rendering at every layout width, all four evaluation states, curated detail views,
// the ambient widget's single warning, and context injection.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderConsole, plainStyler } from "../src/ui/steward-console/render.ts";
import { INITIAL_UI, type ConsoleUiState } from "../src/ui/steward-console/navigation.ts";
import {
  buildConsoleModel,
  CONSOLE_VIEWS,
  emptyProofView,
  selectableRefs,
  toReceiptView,
  type ConsoleModel,
  type ProofView,
} from "../src/ui/steward-console/model.ts";
import { homeViewLines, proofWarning } from "../src/ui/homeview.ts";
import { buildContextBlock, CONTEXT_CHAR_LIMIT } from "../src/context/inject.ts";
import { buildProofOverview } from "../src/state/proof-store.ts";
import { assessCompletion, createClaim, linkReceipt, requireClaim } from "../src/domain/proof.ts";
import { createInitialState } from "../src/domain/defaults.ts";
import { createWorkItem, setFocusWorkItem } from "../src/domain/operations.ts";
import type { ProjectState, VerificationReceiptRecord } from "../src/domain/types.ts";
import { RUNTIME, WIDTHS } from "./fixtures/console.ts";

const T = "2026-07-25T00:00:00.000Z";
const FP = "a".repeat(64);
const OTHER_FP = "b".repeat(64);

const C_SUPPORTED = "supported criterion";
const C_UNSUPPORTED = "unsupported criterion";
const C_STALE = "stale criterion";
const C_PENDING = "pending criterion";

function ui(over: Partial<ConsoleUiState> = {}): ConsoleUiState {
  return { ...INITIAL_UI, ...over };
}
function render(model: ConsoleModel, state: ConsoleUiState, width: number): string[] {
  return renderConsole(model, state, width, plainStyler);
}
function maxWidth(lines: string[]): number {
  return lines.reduce((m, l) => Math.max(m, Array.from(l).length), 0);
}

function receipt(
  id: string,
  claimId: string,
  result: VerificationReceiptRecord["result"],
  fingerprint: string,
): VerificationReceiptRecord {
  return {
    id,
    claimId,
    result,
    artifactRef: `receipts/${id}`,
    executable: "mise",
    args: ["exec", "--", "npm", "run", "verify"],
    cwdRef: ".",
    exitCode: result === "passed" ? 0 : 1,
    startedAt: T,
    finishedAt: T,
    repositoryFingerprint: fingerprint,
    gitHead: "c".repeat(40),
    outputTruncated: result === "failed",
  };
}

/**
 * A project exercising all four evaluation states at once:
 *   CLM-1 supported, CLM-2 unsupported, CLM-3 stale, CLM-4 pending.
 */
function fourStateProject(): ProjectState {
  let s = createInitialState({ displayName: "proof-ui", now: T, projectId: "pid" });
  s = createWorkItem(
    s,
    {
      kind: "outcome",
      title: "Proof engine",
      status: "in_progress",
      acceptanceCriteria: [C_SUPPORTED, C_UNSUPPORTED, C_STALE, C_PENDING],
    },
    T,
  );
  const specs: Array<[string, string]> = [
    [C_SUPPORTED, "the suite passes"],
    [C_UNSUPPORTED, "the failing check passes"],
    [C_STALE, "the older check passed"],
    [C_PENDING, "nothing has been run yet"],
  ];
  for (const [criterion, statement] of specs) {
    s = createClaim(
      s,
      {
        workItemId: "NF-1",
        statement,
        confidence: "medium",
        coveredAcceptanceCriteria: [criterion],
        knownLimitations: ["automated coverage only; no interactive check"],
      },
      T,
    );
  }
  for (const id of ["CLM-1", "CLM-2", "CLM-3", "CLM-4"]) {
    s = requireClaim(s, { workItemId: "NF-1", claimId: id }, T);
  }
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP), T);
  s = linkReceipt(s, receipt("RCP-2", "CLM-2", "failed", FP), T);
  s = linkReceipt(s, receipt("RCP-3", "CLM-3", "passed", OTHER_FP), T);
  s = setFocusWorkItem(s, "NF-1");
  return s;
}

function proofViewOf(state: ProjectState, fingerprint: string | null = FP): ProofView {
  const overview = buildProofOverview(state, fingerprint);
  return {
    fingerprintAvailable: fingerprint !== null,
    summary: overview.summary,
    claims: overview.claims.map((r) => ({
      id: r.claim.id,
      workItemId: r.claim.workItemId,
      workItemTitle: r.workItem?.title ?? "(missing work item)",
      statement: r.claim.statement,
      confidence: r.claim.confidence,
      status: r.evaluation.status,
      reason: r.evaluation.reason,
      required: r.required,
      coveredAcceptanceCriteria: r.claim.coveredAcceptanceCriteria,
      knownLimitations: r.claim.knownLimitations,
      latestReceiptId: r.evaluation.latestReceiptId ?? null,
      latestResult: r.evaluation.latestResult ?? null,
      receiptCount: r.evaluation.receiptCount,
    })),
    receipts: state.receipts
      .slice(-5)
      .reverse()
      .map((r) => toReceiptView(r, fingerprint)),
    focusReadiness: state.focusWorkItemId
      ? assessCompletion(state, state.focusWorkItemId, fingerprint)
      : null,
  };
}

function modelWithProof(state: ProjectState, fingerprint: string | null = FP): ConsoleModel {
  return buildConsoleModel(
    { status: "ok", state, proof: proofViewOf(state, fingerprint) },
    RUNTIME,
  );
}

// --- Navigation order ---

test("Proof is the third principal view, between Work and Project Truth", () => {
  assert.deepEqual(CONSOLE_VIEWS, ["focus", "work", "proof", "truth"]);
});

test("the tab line lists Proof and marks the active view", () => {
  const model = modelWithProof(fourStateProject());
  const lines = render(model, ui({ view: "proof" }), 120).join("\n");
  assert.match(lines, /\[Proof\]/, "Proof is the active tab");
  assert.match(lines, / Work /);
  assert.match(lines, / Project Truth /);
});

// --- All four evaluation states ---

test("the Proof view shows all four evaluation states with counts", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "proof" }), 120).join("\n");
  assert.match(text, /CLM-1 \[supported\]/);
  assert.match(text, /CLM-2 \[unsupported\]/);
  assert.match(text, /CLM-3 \[stale\]/);
  assert.match(text, /CLM-4 \[pending\]/);
  assert.match(text, /supported 1 · unsupported 1 · stale 1 · pending 1/);
});

test("required claims are marked and limitations stay visible in the list", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "proof" }), 160).join("\n");
  assert.match(text, /CLM-1 \[supported\] \*/, "required claims are marked");
  assert.match(text, /limitations: automated coverage only/);
  assert.match(text, /\* required for completion/);
});

test("the Proof view shows curated receipt rows and never full command output", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "proof" }), 160).join("\n");
  assert.match(text, /RCP-1 \[passed\] CLM-1 current/);
  assert.match(text, /RCP-3 \[passed\] CLM-3 stale/);
  assert.match(text, /LATEST RECEIPTS \(3\)/, "section headings are uppercased");
  assert.match(text, /full output requires deliberate inspection/);
  assert.equal(/stdout\.txt contents|all good/.test(text), false, "no output is rendered");
});

test("the completion gate row appears for the focused item", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "proof" }), 120).join("\n");
  assert.match(text, /COMPLETION GATE/);
  assert.match(text, /NF-1: \d+ gate\(s\) failing/);
  assert.match(text, /Enter for the full gate list/);
});

test("an empty proof view explains that nothing can be completed", () => {
  const empty = createInitialState({ displayName: "empty", now: T, projectId: "p" });
  const model = buildConsoleModel({ status: "ok", state: empty, proof: emptyProofView() }, RUNTIME);
  const text = render(model, ui({ view: "proof" }), 100).join("\n");
  assert.match(text, /No claims yet/);
  assert.match(text, /Nothing can be completed without proof/);
  assert.match(text, /newfang_create_claim/);
});

test("a missing proof view renders the empty state rather than crashing", () => {
  const state = fourStateProject();
  const model = buildConsoleModel({ status: "ok", state }, RUNTIME);
  assert.equal(model.proof, null);
  const text = render(model, ui({ view: "proof" }), 100).join("\n");
  assert.match(text, /No claims yet/);
  assert.deepEqual(selectableRefs(model, "proof"), []);
});

test("git unavailability is stated rather than implied as freshness", () => {
  const model = modelWithProof(fourStateProject(), null);
  const proofText = render(model, ui({ view: "proof" }), 120).join("\n");
  assert.match(proofText, /git unavailable/);
  // With no fingerprint nothing is current, so every claim with receipts reads stale.
  assert.equal(model.proof?.summary.supported, 0);
  assert.equal(model.proof?.summary.stale, 3);
  assert.equal(model.proof?.summary.pending, 1);
});

// --- Widths ---

test("no Proof line overflows at compact, standard, or wide widths", () => {
  const models = [
    modelWithProof(fourStateProject()),
    modelWithProof(fourStateProject(), null),
    buildConsoleModel(
      {
        status: "ok",
        state: createInitialState({ displayName: "e", now: T, projectId: "p" }),
        proof: emptyProofView(),
      },
      RUNTIME,
    ),
  ];
  for (const model of models) {
    for (const width of WIDTHS) {
      for (const detailOpen of [false, true]) {
        for (let selection = 0; selection < 8; selection++) {
          const lines = render(model, ui({ view: "proof", detailOpen, selection }), width);
          assert.ok(
            maxWidth(lines) <= width,
            `overflow at width ${width} detail ${detailOpen} selection ${selection}: ${maxWidth(lines)}`,
          );
        }
      }
    }
  }
});

// D6: the suite above only ever exercised widths >= 60, so a fixed label that overflowed at the
// 20-column floor survived four packets. `covers acceptance criteria:` is 27 characters and was
// pushed untruncated, overflowing every width from the 20-column floor through 26. This walks the
// narrow band explicitly, every view, both detail states, at the exact content shape that failed.
test("no console line overflows at narrow widths, including the 20-column floor", () => {
  const model = modelWithProof(fourStateProject());
  for (const width of [20, 21, 26, 27, 30, 40, 50, 55, 59, 60, 70, 80]) {
    for (const view of CONSOLE_VIEWS) {
      for (const detailOpen of [false, true]) {
        for (const helpOpen of [false, true]) {
          for (let selection = 0; selection < 8; selection++) {
            const lines = render(model, ui({ view, detailOpen, helpOpen, selection }), width);
            const over = lines.filter((l) => Array.from(l).length > width);
            assert.deepEqual(
              over,
              [],
              `overflow at width ${width} view ${view} detail ${detailOpen} help ${helpOpen} selection ${selection}`,
            );
          }
        }
      }
    }
  }
});

test("the claim-detail label is truncated rather than overflowing the floor width", () => {
  const model = modelWithProof(fourStateProject());
  // Selection 0 is the first claim; detail open renders the covered-criteria block.
  const lines = render(model, ui({ view: "proof", detailOpen: true, selection: 0 }), 20);
  const label = lines.find((l) => l.startsWith("covers"));
  assert.ok(label, "the covered-criteria label is rendered");
  assert.equal(Array.from(label).length <= 20, true, `label is ${label} (${label.length} chars)`);
  assert.match(label, /…$/, "it is truncated with an ellipsis, not clipped silently");
});

test("the Proof view renders content at every layout class", () => {
  const model = modelWithProof(fourStateProject());
  for (const width of [60, 80, 120, 160]) {
    const text = render(model, ui({ view: "proof" }), width).join("\n");
    assert.match(text, /CLM-1/, `claims render at width ${width}`);
    assert.match(text, /RCP-1/, `receipts render at width ${width}`);
  }
});

// --- Selection and detail ---

test("selectable refs in Proof are claims, then receipts, then the completion gate", () => {
  const model = modelWithProof(fourStateProject());
  const refs = selectableRefs(model, "proof");
  assert.deepEqual(refs.slice(0, 4), [
    { kind: "claim", id: "CLM-1" },
    { kind: "claim", id: "CLM-2" },
    { kind: "claim", id: "CLM-3" },
    { kind: "claim", id: "CLM-4" },
  ]);
  assert.deepEqual(
    refs.slice(4, 7).map((r) => r.kind),
    ["receipt", "receipt", "receipt"],
  );
  assert.deepEqual(refs[refs.length - 1], { kind: "gate", id: "NF-1" });
});

test("claim detail is curated: evidence, coverage, and limitations; no raw JSON", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "proof", detailOpen: true, selection: 0 }), 120).join("\n");
  assert.match(text, /CLM-1 — NF-1 Proof engine/);
  assert.match(text, /evidence:.*supported/);
  assert.match(text, /required:.*yes/);
  assert.match(text, /confidence:.*medium/);
  assert.match(text, /receipts:.*1 \(latest RCP-1 passed\)/);
  assert.match(text, /covers acceptance criteria:/);
  assert.match(text, /known limitations:/);
  assert.match(text, /automated coverage only/);
  assert.equal(text.includes('{"'), false, "no raw JSON is dumped");
});

test("a claim with no recorded limitations says so explicitly", () => {
  let s = createInitialState({ displayName: "d", now: T, projectId: "p" });
  s = createWorkItem(s, { kind: "task", title: "X", acceptanceCriteria: ["c"] }, T);
  s = createClaim(
    s,
    { workItemId: "NF-1", statement: "y", confidence: "low", coveredAcceptanceCriteria: ["c"] },
    T,
  );
  const model = modelWithProof(s);
  const text = render(model, ui({ view: "proof", detailOpen: true, selection: 0 }), 100).join("\n");
  assert.match(text, /known limitations:/);
  assert.match(text, /\(none recorded\)/);
});

test("receipt detail shows curated metadata, truncation, and an artifact pointer only", () => {
  const model = modelWithProof(fourStateProject());
  const refs = selectableRefs(model, "proof");
  const index = refs.findIndex((r) => r.kind === "receipt");
  const text = render(model, ui({ view: "proof", detailOpen: true, selection: index }), 140).join(
    "\n",
  );
  assert.match(text, /RCP-3 — passed/);
  assert.match(text, /claim:.*CLM-3/);
  assert.match(text, /evidence:.*stale \(repository changed\)/);
  assert.match(text, /command: mise exec -- npm run verify/);
  assert.match(text, /artifact: \.newfang\/receipts\/RCP-3\//);
  assert.match(text, /Command output is not shown here/);
});

test("receipt detail reports truncation honestly", () => {
  const model = modelWithProof(fourStateProject());
  const refs = selectableRefs(model, "proof");
  // RCP-2 is the failed receipt, created with outputTruncated: true.
  const index = refs.findIndex((r) => r.kind === "receipt" && r.id === "RCP-2");
  const text = render(model, ui({ view: "proof", detailOpen: true, selection: index }), 140).join(
    "\n",
  );
  assert.match(text, /output:.*TRUNCATED at cap/);
});

test("completion-gate detail lists every gate with its pass/fail state", () => {
  const model = modelWithProof(fourStateProject());
  const refs = selectableRefs(model, "proof");
  const index = refs.findIndex((r) => r.kind === "gate");
  const text = render(model, ui({ view: "proof", detailOpen: true, selection: index }), 140).join(
    "\n",
  );
  assert.match(text, /NF-1 completion gate/);
  assert.match(text, /gate\(s\) failing/);
  assert.match(text, /\[pass\] acceptance criteria recorded/);
  assert.match(text, /\[FAIL\] every required claim supported by current passing evidence/);
});

// --- Focus view integration ---

test("the Focus view reports proof readiness for the focused item", () => {
  const model = modelWithProof(fourStateProject());
  const text = render(model, ui({ view: "focus" }), 120).join("\n");
  assert.match(text, /PROOF/);
  assert.match(text, /Claims 4 · supported 1 · unsupported 1 · stale 1 · pending 1/);
  assert.match(text, /NF-1 is not completable: \d+ gate\(s\) failing/);
});

test("a ready item is announced as completable in the Focus view", () => {
  let s = createInitialState({ displayName: "d", now: T, projectId: "p" });
  s = createWorkItem(
    s,
    { kind: "outcome", title: "Done thing", status: "in_progress", acceptanceCriteria: ["c"] },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "c holds",
      confidence: "high",
      coveredAcceptanceCriteria: ["c"],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "passed", FP), T);
  s = setFocusWorkItem(s, "NF-1");
  const text = render(modelWithProof(s), ui({ view: "focus" }), 120).join("\n");
  assert.match(text, /NF-1 passes every completion gate/);
  assert.match(text, /newfang complete NF-1/);
});

test("with no focus, the Focus view says there is no gate to report", () => {
  const s = fourStateProject();
  const unfocused = setFocusWorkItem(s, null);
  const text = render(modelWithProof(unfocused), ui({ view: "focus" }), 120).join("\n");
  assert.match(text, /No focused work item, so no completion gate to report/);
});

// --- Attention ---

test("unsupported and stale REQUIRED claims surface in attention with severity", () => {
  const model = modelWithProof(fourStateProject());
  const labels = model.attention.map((a) => a.label);
  assert.ok(labels.some((l) => /Required claim CLM-2 is UNSUPPORTED/.test(l)));
  assert.ok(labels.some((l) => /Required claim CLM-3 evidence is stale/.test(l)));
  const unsupported = model.attention.find((a) => /CLM-2/.test(a.label));
  assert.equal(unsupported?.severity, "high");
  const stale = model.attention.find((a) => /CLM-3/.test(a.label));
  assert.equal(stale?.severity, "medium");
  // A pending claim is not an alarm; it is simply unproven.
  assert.equal(
    labels.some((l) => /CLM-4/.test(l)),
    false,
  );
});

test("a non-required claim with bad evidence does not raise attention", () => {
  let s = createInitialState({ displayName: "d", now: T, projectId: "p" });
  s = createWorkItem(s, { kind: "task", title: "X", acceptanceCriteria: ["c"] }, T);
  s = createClaim(
    s,
    { workItemId: "NF-1", statement: "y", confidence: "low", coveredAcceptanceCriteria: ["c"] },
    T,
  );
  s = linkReceipt(s, receipt("RCP-1", "CLM-1", "failed", FP), T);
  const model = modelWithProof(s);
  assert.equal(
    model.attention.some((a) => /CLM-1/.test(a.label)),
    false,
    "only required claims gate completion, so only they raise attention",
  );
});

// --- Ambient widget ---

test("the widget adds at most ONE proof warning and stays within two lines", () => {
  const state = fourStateProject();
  const summaries = [
    { total: 4, pending: 1, supported: 1, unsupported: 1, stale: 1, fingerprintAvailable: true },
    { total: 4, pending: 1, supported: 2, unsupported: 0, stale: 1, fingerprintAvailable: true },
    { total: 4, pending: 1, supported: 3, unsupported: 0, stale: 0, fingerprintAvailable: true },
    { total: 4, pending: 0, supported: 4, unsupported: 0, stale: 0, fingerprintAvailable: true },
    null,
  ];
  for (const summary of summaries) {
    const lines = homeViewLines(state, 80, summary);
    assert.ok(lines.length <= 2, `two-line contract held: got ${lines.length}`);
    for (const line of lines) assert.ok(Array.from(line).length <= 80);
    const warnings = ["unsupported", "stale", "unproven"].filter((w) =>
      lines.join(" ").includes(w),
    );
    assert.ok(warnings.length <= 1, `at most one warning, got ${warnings.join(", ")}`);
  }
});

test("the widget warning names the most severe proof problem first", () => {
  assert.equal(
    proofWarning({
      total: 3,
      pending: 1,
      supported: 0,
      unsupported: 1,
      stale: 1,
      fingerprintAvailable: true,
    }),
    "1 unsupported",
  );
  assert.equal(
    proofWarning({
      total: 3,
      pending: 1,
      supported: 1,
      unsupported: 0,
      stale: 1,
      fingerprintAvailable: true,
    }),
    "1 stale",
  );
  assert.equal(
    proofWarning({
      total: 2,
      pending: 2,
      supported: 0,
      unsupported: 0,
      stale: 0,
      fingerprintAvailable: true,
    }),
    "2 unproven",
  );
  assert.equal(
    proofWarning({
      total: 1,
      pending: 0,
      supported: 1,
      unsupported: 0,
      stale: 0,
      fingerprintAvailable: true,
    }),
    null,
    "a fully supported project is quiet",
  );
  assert.equal(proofWarning(null), null);
  assert.equal(
    proofWarning({
      total: 0,
      pending: 0,
      supported: 0,
      unsupported: 0,
      stale: 0,
      fingerprintAvailable: true,
    }),
    null,
    "no claims means no warning",
  );
});

test("the widget still degrades at narrow widths with a proof warning present", () => {
  const summary = {
    total: 4,
    pending: 1,
    supported: 1,
    unsupported: 1,
    stale: 1,
    fingerprintAvailable: true,
  };
  for (const width of [20, 40, 60, 80]) {
    const lines = homeViewLines(fourStateProject(), width, summary);
    assert.ok(lines.length <= 2);
    for (const line of lines) {
      assert.ok(Array.from(line).length <= Math.max(20, width), `width ${width}: "${line}"`);
    }
  }
});

// --- Context injection ---

test("injected context states claim counts and the proof rules", () => {
  const state = fourStateProject();
  const summary = buildProofOverview(state, FP).summary;
  const block = buildContextBlock({ status: "ok", state, proof: summary });
  assert.match(block, /Claims: 4 — 1 supported, 1 unsupported, 1 stale, 1 pending/);
  assert.match(block, /claims cite exact acceptance criteria/);
  assert.match(block, /newfang_run_verification/);
  assert.match(block, /evidence only for the claim it ran for/);
  assert.match(block, /stale or failed evidence cannot complete work/);
  assert.match(block, /only newfang_complete_work_item may mark work completed/);
  assert.ok(block.length <= CONTEXT_CHAR_LIMIT, `block was ${block.length} chars`);
});

test("injected context is deterministic and does not encourage weak claims", () => {
  const state = fourStateProject();
  const summary = buildProofOverview(state, FP).summary;
  const first = buildContextBlock({ status: "ok", state, proof: summary });
  const second = buildContextBlock({ status: "ok", state, proof: summary });
  assert.equal(first, second, "deterministic for identical input");
  // No language that would nudge the model toward satisfying the gate cheaply.
  for (const phrase of ["to pass the gate", "satisfy the gate", "in order to complete", "easier"]) {
    assert.equal(first.toLowerCase().includes(phrase), false, `avoids "${phrase}"`);
  }
});

test("a project with no claims says so, and unavailable git is stated", () => {
  const empty = createInitialState({ displayName: "e", now: T, projectId: "p" });
  const noClaims = buildContextBlock({
    status: "ok",
    state: empty,
    proof: buildProofOverview(empty, null).summary,
  });
  assert.match(noClaims, /Claims: none recorded — no work item can be completed yet/);

  const state = fourStateProject();
  const noGit = buildContextBlock({
    status: "ok",
    state,
    proof: buildProofOverview(state, null).summary,
  });
  assert.match(noGit, /git unavailable: nothing counts as current/);
});

test("injected context stays under the cap with many claims", () => {
  let s = createInitialState({ displayName: "big", now: T, projectId: "p" });
  const criteria = Array.from({ length: 40 }, (_, i) => `criterion number ${i} `.repeat(3));
  s = createWorkItem(s, { kind: "outcome", title: "Big", acceptanceCriteria: criteria }, T);
  for (const criterion of criteria) {
    s = createClaim(
      s,
      {
        workItemId: "NF-1",
        statement: `a long claim statement about ${criterion}`.repeat(2),
        confidence: "low",
        coveredAcceptanceCriteria: [criterion],
        knownLimitations: ["a fairly long limitation sentence to bulk this out"],
      },
      T,
    );
  }
  const block = buildContextBlock({
    status: "ok",
    state: s,
    proof: buildProofOverview(s, FP).summary,
  });
  assert.ok(block.length <= CONTEXT_CHAR_LIMIT, `block was ${block.length} chars`);
  // Individual claim statements are never enumerated; only counts and rules.
  assert.equal(block.includes("a long claim statement about"), false);
});
