// R1 behavioral contract: what a Project Steward turn must receive when the developer says
// "Continue." — and what it must never receive.
//
// These tests are the deterministic half of R1's acceptance. They cannot establish that a real
// model acts on the capsule; that is the interactive tier recorded in
// docs/verification/R1_AMBIENT_CONTINUITY.md. They DO establish that the injected content names the
// right project, the right focus, a justified next action, an instruction to act, and no capability
// that does not exist.

import { test } from "node:test";
import assert from "node:assert/strict";

import { isContinuationRequest } from "../src/context/continuation.ts";
import {
  buildFocusCapsule,
  CAPSULE_HARD_MAX,
  CAPSULE_TARGET_CHARS,
} from "../src/context/inject.ts";
import { createInitialState } from "../src/domain/defaults.ts";
import {
  createWorkItem,
  recordDecision,
  setFocusWorkItem,
  setNextAction,
  setNextActionRationale,
  updateWorkItem,
} from "../src/domain/operations.ts";
import { createClaim, requireClaim } from "../src/domain/proof.ts";
import type { ProjectState } from "../src/domain/types.ts";

const T = "2026-07-26T00:00:00.000Z";

/**
 * A project shaped like the real one at the start of R1: an accepted direction, NF-9 focused with a
 * justified next action, and a held item (NF-2) whose required claim admits that acceptance needs an
 * authenticated human run.
 */
function r1LikeState(): ProjectState {
  let s = createInitialState({ displayName: "voila", now: T, projectId: "pid" });
  s = { ...s, phase: "build", health: "green" };
  s = createWorkItem(
    s,
    {
      kind: "outcome",
      title: "Build planning-document intake and repository orientation",
      status: "ready",
      acceptanceCriteria: ["preserve the original plan/document"],
    },
    T,
  );
  s = createWorkItem(
    s,
    {
      kind: "outcome",
      title: "R1: contain existing friction and make continuation ambient",
      status: "ready",
      acceptanceCriteria: ["Continue. leads to useful action"],
    },
    T,
  );
  s = createClaim(
    s,
    {
      workItemId: "NF-1",
      statement: "Intake preserves the source and produces a reviewable draft.",
      confidence: "high",
      coveredAcceptanceCriteria: ["preserve the original plan/document"],
      knownLimitations: [
        "The suite exercises the intake machinery with test inputs. It does not demonstrate an authenticated Project Steward run against a real planning document, which is what acceptance requires.",
      ],
    },
    T,
  );
  s = requireClaim(s, { workItemId: "NF-1", claimId: "CLM-1" }, T);
  s = recordDecision(
    s,
    {
      title: "Realign around the Project Steward operational loop",
      decision:
        "The Project Steward Operational Loop is the active product priority. Delegation and background execution are product-critical; approval-bundle self-hosting is paused.",
      rationale: "Owner direction.",
      status: "accepted",
    },
    T,
  );
  s = setFocusWorkItem(s, "NF-2");
  s = setNextAction(
    s,
    "Implement the focus capsule and content-based orientation freshness for R1, with focused tests first.",
  );
  s = setNextActionRationale(s, "Ambient continuation is the first slice R2 depends on.");
  return s;
}

// --- Continuation intent -------------------------------------------------------------------------

test("explicit continuation intent is recognized without a natural-language engine", () => {
  for (const prompt of [
    "Continue.",
    "continue",
    "  Continue!  ",
    "Keep going.",
    "keep going",
    "Resume",
    "resume.",
    "Carry on",
    "Proceed",
    "Proceed with the current work.",
    "continue the current work",
    "Go ahead",
    "please continue",
    "Continue please.",
  ]) {
    assert.equal(isContinuationRequest(prompt), true, `expected continuation: ${prompt}`);
  }
});

test("unrelated messages are never reinterpreted as continuation commands", () => {
  for (const prompt of [
    "",
    "   ",
    "Continue the migration to schema v5 and then explain the tradeoffs",
    "Should we continue with NF-2 or stop?",
    "Why did the proof engine mark CLM-4 stale?",
    "keep going on the delegation runtime by spawning a worker",
    "resume the background terminal",
    "status",
    "What is the next action?",
  ]) {
    assert.equal(isContinuationRequest(prompt), false, `expected NOT continuation: ${prompt}`);
  }
  assert.equal(isContinuationRequest(undefined), false);
});

// --- The capsule a continuation turn receives ----------------------------------------------------

test("a continuation turn receives project, objective, focus, next action, and an instruction to act", () => {
  const state = r1LikeState();
  const capsule = buildFocusCapsule({ status: "ok", state, continuation: true });

  // The correct project and the accepted objective are recoverable.
  assert.match(capsule, /Project: voila/);
  assert.match(capsule, /Objective:/);
  assert.match(capsule, /DEC-1/, "the objective cites the accepted decision it comes from");

  // The active focus is the focused work item, by ID and title.
  assert.match(capsule, /Focus: NF-2 \(ready\) — R1: contain existing friction/);

  // A well-supported next action is present.
  assert.match(capsule, /Next action: Implement the focus capsule/);

  // The instruction tells the Steward to act, in this turn, without a recap.
  assert.match(capsule, /Continue NF-2/);
  assert.match(capsule, /do not ask for a recap/i);
  assert.match(capsule, /first useful repository action in this same turn/i);

  // Canonical truth and repository observation are labelled distinctly.
  assert.match(capsule, /Canonical truth/);
  assert.match(capsule, /Authority boundary:/);
});

test("the capsule never encourages a status report, a recap, or state maintenance", () => {
  const capsule = buildFocusCapsule({
    status: "ok",
    state: r1LikeState(),
    continuation: true,
    proof: {
      total: 5,
      pending: 0,
      supported: 0,
      unsupported: 0,
      stale: 5,
      fingerprintAvailable: true,
    },
    orientation: { id: "ORI-5", stale: true, reasons: ["AGENTS.md changed"] },
  });

  assert.doesNotMatch(capsule, /refresh (the )?claims/i);
  assert.doesNotMatch(capsule, /re-run verification/i);
  assert.doesNotMatch(capsule, /run \/voila (proof|status|doctor)/i);
  assert.match(capsule, /reconcile.*at the boundary/i, "staleness is deferred, not assigned");
  assert.match(capsule, /not a blocker/i, "a stale orientation does not gate the work");
});

test("no R2–R7 capability is implied: no active-operation fields, no worker or terminal language", () => {
  for (const continuation of [true, false]) {
    const capsule = buildFocusCapsule({ status: "ok", state: r1LikeState(), continuation });

    // R1 has no worker or terminal runtime, so the capsule carries no such field at all — not even
    // an honest-looking zero, which would imply the machinery exists and is idle.
    assert.doesNotMatch(capsule, /active (workers?|terminals?|operations?|agents?)/i);
    assert.doesNotMatch(capsule, /\d+ (workers?|terminals?|agents?) (active|running)/i);
    assert.doesNotMatch(capsule, /background terminal/i);

    // Voila's own scaffolding (everything the capsule authors rather than quotes from canonical
    // state) must not describe delegation, settlement, or spawning as available.
    const authored = capsule.slice(capsule.indexOf("Steward directive:"));
    for (const forbidden of [/\bdelegat/i, /settle/i, /\bspawn/i, /\bworker/i, /\bterminal/i]) {
      assert.doesNotMatch(authored, forbidden);
    }
  }
});

test("held human-required work is visible and is never presented as the next action", () => {
  let state = r1LikeState();
  // NF-1 is gate-clean apart from its claim's outstanding limitation, and it is not the focus.
  state = updateWorkItem(state, { id: "NF-1", status: "ready" }, T);
  const capsule = buildFocusCapsule({ status: "ok", state, continuation: true });

  assert.match(capsule, /Held \(do not start\): NF-1/);
  assert.match(capsule, /CLM-1 still records 1 outstanding limitation/);
  // The next action still belongs to the focus, not to the held item.
  assert.match(capsule, /Next action: Implement the focus capsule/);
  assert.doesNotMatch(capsule, /Next action:.*NF-1/);
});

test("canonical fact and repository observation are separated, and inference is never asserted", () => {
  const capsule = buildFocusCapsule({
    status: "ok",
    state: r1LikeState(),
    continuation: true,
    repository: {
      isGitRepository: true,
      branch: "feat/r1-ambient-continuity",
      head: "4d66c24bbf0a5d599315e42c521a8e70c1aef10d",
      changedFileCount: 7,
    },
  });

  const canonicalAt = capsule.indexOf("Canonical truth");
  const observedAt = capsule.indexOf("Repository observation");
  assert.ok(canonicalAt >= 0 && observedAt > canonicalAt, "canonical section precedes observation");
  assert.match(capsule, /Repository observation \(observed now, not canonical truth\)/);
  assert.match(capsule, /branch feat\/r1-ambient-continuity/);
  assert.match(capsule, /7 changed file\(s\)/);
  // HEAD is provenance only: it appears in the observation section, never as canonical truth.
  assert.ok(
    capsule.slice(observedAt).includes("4d66c24"),
    "HEAD is reported as an observation, not as canonical state",
  );
});

// --- Budget and relevance -------------------------------------------------------------------------

test("required content survives an oversized project; optional content is dropped first", () => {
  let s = r1LikeState();
  for (let i = 0; i < 40; i++) {
    s = recordDecision(
      s,
      {
        title: `Decision ${i} about NF-2 `.repeat(3),
        decision: `A long accepted decision statement number ${i} that mentions NF-2 `.repeat(6),
        rationale: "r",
        status: "accepted",
      },
      T,
    );
  }
  const capsule = buildFocusCapsule({
    status: "ok",
    state: s,
    continuation: true,
    repository: { isGitRepository: true, branch: "b", head: "abc1234", changedFileCount: 3 },
    proof: {
      total: 5,
      pending: 0,
      supported: 0,
      unsupported: 0,
      stale: 5,
      fingerprintAvailable: true,
    },
    orientation: { id: "ORI-5", stale: false, reasons: [] },
  });

  assert.ok(capsule.length <= CAPSULE_HARD_MAX, `capsule was ${capsule.length} chars`);
  // Required information is never removed.
  for (const required of [
    /Project: voila/,
    /Objective:/,
    /Focus: NF-2/,
    /Next action:/,
    /Blocker:/,
    /Authority boundary:/,
  ]) {
    assert.match(capsule, required);
  }
  // Optional lists stay bounded.
  const decisionLines = capsule.split("\n").filter((l) => /^ {2}- DEC-/.test(l));
  assert.ok(decisionLines.length <= 3, `listed ${decisionLines.length} decisions`);
  assert.doesNotMatch(capsule, /truncated/, "no raw tail truncation of the block");
});

test("a lean project stays inside the default target and is deterministic", () => {
  const state = r1LikeState();
  const first = buildFocusCapsule({ status: "ok", state, continuation: true });
  const second = buildFocusCapsule({ status: "ok", state, continuation: true });
  assert.equal(first, second, "deterministic for identical input");
  assert.ok(first.length <= CAPSULE_TARGET_CHARS, `capsule was ${first.length} chars`);
});

test("only decisions explicitly connected to the active work are injected", () => {
  let s = r1LikeState();
  s = recordDecision(
    s,
    {
      title: "Unrelated storage choice",
      decision: "Use atomic writes for the receipt manifest.",
      rationale: "r",
      status: "accepted",
    },
    T,
  );
  s = recordDecision(
    s,
    {
      title: "NF-2 scope",
      decision: "NF-2 corrects the readiness label narrowly and builds no gate-policy system.",
      rationale: "r",
      status: "accepted",
    },
    T,
  );
  const capsule = buildFocusCapsule({ status: "ok", state: s, continuation: true });
  assert.match(capsule, /NF-2 corrects the readiness label narrowly/);
  assert.doesNotMatch(capsule, /atomic writes for the receipt manifest/);
});

test("a non-continuation turn still gets the capsule, with a directive that does not fake a command", () => {
  const capsule = buildFocusCapsule({ status: "ok", state: r1LikeState(), continuation: false });
  assert.match(capsule, /Focus: NF-2/);
  assert.doesNotMatch(capsule, /Continue NF-2/, "the continuation directive is intent-gated");
  assert.match(capsule, /Authority boundary:/);
});

test("degraded states inject one honest line and no invented project detail", () => {
  const uninit = buildFocusCapsule({ status: "uninitialized" });
  assert.equal(uninit.split("\n").length, 1);
  assert.match(uninit, /\/voila init/);

  const migration = buildFocusCapsule({ status: "migration" });
  assert.equal(migration.split("\n").length, 1);
  assert.doesNotMatch(migration, /Focus:/);

  const error = buildFocusCapsule({ status: "error", message: "malformed project.json" });
  assert.match(error, /malformed project\.json/);
  assert.doesNotMatch(error, /Focus:/);
});
