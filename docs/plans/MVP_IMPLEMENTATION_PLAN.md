# MVP Implementation Plan

## Summary

A phased plan from an installed Pi to a self-hosted approval subsystem. Each phase produces something
runnable, inspectable, or decision-useful — narrow vertical delivery over empty framework layers. The
plan front-loads the [MVP vertical slice](MVP_VERTICAL_SLICE.md) and treats
[`voila-approval-bundles`](SELF_HOSTING_ACCEPTANCE_PROJECT.md) as the first self-hosted project.
Architecture per [../architecture/RECOMMENDED_ARCHITECTURE.md](../architecture/RECOMMENDED_ARCHITECTURE.md).

## Global non-goals (for the whole MVP)

Multi-agent orchestration at scale, background terminals, sandboxing, remote/long-running execution,
model-routing engine, cost/budget accounting, PR automation beyond a delivery summary, theme,
packaging/distribution, and any reuse of reference-repo code. These are deferred or rejected per the
capability matrix.

## Phase 0 — Bootstrap audit and plans (this repository) — DONE

- **Objective**: Establish repository truth and an evidence-backed plan without building the runtime.
- **Output/receipt**: this `docs/` set; git diff of the initial commit.
- **Gate**: documents are internally consistent, Pi claims are sourced, decisions are separated from
  open questions, no production extension code exists.
- **Status**: complete (Phase 0 deliverable).

## Phase 1 — Environment + skeleton extension (runnable)

- **Objective**: Install Pi, prove a Voila extension loads and runs, and lock the extension/test
  scaffolding.
- **Tasks**:
  1. Install Pi (`@earendil-works/pi-coding-agent`, target `0.82.x`), project-scoped where possible;
     record the exact version.
  2. Create `.pi/extensions/voila/` skeleton: one `/voila status` command and a trivial home-view
     widget.
  3. Set up TypeScript + formatter + Node test runner; add a first passing unit test.
- **Dependencies**: none (Phase 0 done).
- **Acceptance gate**: `pi` loads the extension; `/voila status` responds; the widget renders; the
  test passes.
- **Verification/receipt**: terminal transcript of `/voila status`; `test` output saved.
- **Stopping condition**: if Pi's current extension API diverges from the audit, pause and re-verify
  against the installed `CHANGELOG.md` before proceeding.
- **Runnable artifact**: a loadable Voila skeleton.

## Phase 2 — Durable ledger + backlog (inspectable)

- **Objective**: Canonical `.voila/` project state (ADR-0003) that survives restart. (Note: the
  canonical state store itself is delivered in Packet 1; this phase adds backlog entities on top.)
- **Tasks**:
  1. Extend the canonical schema with backlog entities (built on the Packet 1 `project.json` store).
  2. Implement backlog tools (create/update items, decisions, assumptions, risks) writing canonical
     state atomically and appending to `events.jsonl`.
  3. Implement resume load: canonical state loads and validates first; session entries never
     overwrite it; a mismatch warns and emits an event (one-directional, no merge).
- **Dependencies**: Phase 1.
- **Acceptance gate**: create items, restart Pi, reconstruct identically from `.voila/`; the
  load/validation test passes; a deliberate session/canonical divergence warns + emits an event
  without altering canonical state.
- **Verification/receipt**: load/validation test output; before/after `project.json` + `events.jsonl`.
- **Stopping condition**: if canonical load/validation is not deterministic, stop and fix first.
- **Inspectable artifact**: real canonical project state on disk.

## Phase 3 — Intake + orientation + next action (decision-useful)

- **Objective**: Turn a request/plan/repo into a brief, a ledger, and a visible next action.
- **Tasks**:
  1. Repository-orientation skill (purpose, structure, branch/worktree, build/test commands).
  2. Planning-document intake: preserve original, classify contents, produce an understanding check.
  3. Next-action logic surfaced via `/voila status` and the home view.
- **Dependencies**: Phase 2.
- **Acceptance gate**: given a sample `PLAN.md` in a target repo, Voila produces a correct brief +
  backlog and a sensible next action; golden-fixture intake test passes.
- **Verification/receipt**: golden intake fixture + asserted ledger; transcript of the understanding
  check.
- **Runnable artifact**: intake-to-next-action loop.

## Phase 4 — Claims, evidence, verification, completion gate (rejects the state transition)

- **Objective**: Make evidence-before-completion real at the level Voila can guarantee — its
  authoritative state transition, not model prose.
- **Tasks**:
  1. Claim tool (statement, status, confidence, environment, limits, verification date).
  2. Verification receipt (command via `pi.exec`, environment, versions, result, output path) stored
     under `.voila/receipts/` and linked to a claim.
  3. A `voila_complete_work_item` state transition that is **rejected** unless the item's required
     claim has a passing receipt. The guarantee is about `project.json`: an item is not recorded
     complete unless the gate passes. Voila cannot prevent an LLM from writing "done" in prose.
- **Dependencies**: Phase 2 (state), Phase 3 (a real work item to claim about).
- **Acceptance gate**: with a passing receipt the transition succeeds; with a failing/missing receipt
  the transition is rejected and `project.json` still shows the item incomplete; a test asserts the
  rejection.
- **Verification/receipt**: the transition-rejected-on-failing-receipt test output; a stored receipt.
- **Stopping condition**: if the transition gate cannot reliably reject, stop — this is the core
  promise.
- **Runnable artifact**: the full vertical slice minus delegation.

## Phase 5 — One bounded delegation (prototype; NOT a self-hosting prerequisite)

- **Objective**: Prototype delegating one bounded specialist task and integrating the result under
  the Steward. **Delegation is not required for the first self-hosting transition** (see the
  self-hosting gate); direct Steward execution is a first-class path.
- **Tasks**:
  1. Define roles as skills/prompt templates (Steward, Explorer, Librarian, Builder, Fixer,
     Verifier, Designer, Release Keeper) — product concepts + prompts, not runtime agents.
  2. Prototype one delegation via a child `pi` process in JSON mode with a strict result contract
     (Pi's `subagent` pattern, reimplemented, concurrency = 1).
  3. Steward integration: ingest the delegated result, update canonical state, keep accountability.
- **Dependencies**: Phase 4. **This phase may run in parallel with or after Phase 7/8** since it does
  not gate self-hosting.
- **Acceptance gate**: one bounded task completes via delegation and integrates; result-contract test
  passes. **Fallback:** direct Steward execution is acceptable if subprocess delegation proves
  unreliable (record which path was used).
- **Verification/receipt**: delegation transcript + result-contract test; canonical-state update.
- **Stopping condition**: if delegation is unreliable, continue with direct execution and defer
  delegation as a later capability claim.
- **Runnable artifact**: the complete MVP vertical slice (delegation optional).

## Phase 6 — Delivery behaviors (delivery boundary)

- **Objective**: Produce a credible delivery boundary.
- **Tasks**:
  1. Commit-checkpoint suggestion with a diff/secret/generated-file sanity audit (`pi.exec`).
  2. Delivery summary (what changed, claims + evidence, risks/limits, next action).
- **Dependencies**: Phase 5.
- **Acceptance gate**: Voila suggests a well-scoped commit and emits a delivery summary tied to
  claims/receipts. (No push/PR without explicit approval.)
- **Verification/receipt**: sample delivery summary + suggested commit message.
- **Runnable artifact**: intake-to-delivery loop.

## Phase 7 — Self-hosting gate check (decision-useful)

- **Objective**: Verify the self-hosting gate from the self-hosting project. The gate is **eight
  capabilities, delegation NOT among them**: planning intake, durable state, visible next action,
  claims and evidence, reproducible verification, state-transition blocking, delivery summary, and
  commit suggestion. Direct Steward execution satisfies the gate.
- **Tasks**: run the vertical-slice acceptance walk-through end to end; confirm each of the eight
  capabilities; record the result.
- **Dependencies**: Phases 2–4, 6 (Phase 5 delegation is not required).
- **Acceptance gate**: all eight capabilities demonstrated with receipts; if any fail, iterate the
  relevant phase.
- **Verification/receipt**: a checklist with linked receipts in `.voila/` and the ledger.
- **Output**: an explicit go/no-go for self-hosting.

## Phase 8 — Build `voila-approval-bundles` under Voila (self-hosted delivery)

- **Objective**: Use Voila to design, build, verify, and deliver the approval subsystem.
- **Tasks**: per [SELF_HOSTING_ACCEPTANCE_PROJECT.md](SELF_HOSTING_ACCEPTANCE_PROJECT.md) — ingest the
  brief, derive the backlog, implement, verify claims (esp. the no-broadening invariant), deliver.
- **Dependencies**: Phase 7 passed.
- **Acceptance gate**: the project's completion criteria met; control-transfer from bootstrap to
  Voila recorded in the ledger.
- **Verification/receipt**: the approval subsystem's own tests + receipts; delivery summary/PR.
- **Runnable artifact**: Voila built a real extension *for itself*, verified by evidence.

## Cross-phase acceptance gates (apply to every phase)

- Every Voila tool/behavior has unit tests; a completion claim cites passing tests.
- Every phase leaves the repo in a runnable/inspectable state with a recorded receipt.
- No reference-repo code is reused; no global software is installed incidentally; no push/publish
  without approval.
- Decisions that change direction are recorded as ADRs; open questions stay separated from decisions.

## Risks and stopping conditions (plan-level)

- **Pi version drift** → re-verify version-sensitive APIs on install and on each upgrade; pin peers.
- **Non-deterministic canonical load/validation** (Phase 2) → hard stop; correctness precedes features.
- **Gate cannot block** (Phase 4) → hard stop; this is the core promise.
- **Unreliable delegation** (Phase 5) → degrade to direct execution; defer delegation.
- **Scope creep toward PM ceremony** → enforce MVP non-goals; prefer the smallest passing slice.

## What this plan deliberately does not build

Empty framework layers, speculative multi-agent infrastructure, background/remote/sandbox subsystems,
routing/cost engines, packaging, or a theme — until the vertical slice and self-hosting project prove
the core.
