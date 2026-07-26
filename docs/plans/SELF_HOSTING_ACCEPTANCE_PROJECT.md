# Self-Hosting Acceptance Project: `voila-approval-bundles`

## Summary

Once a minimum Voila core exists (the MVP vertical slice), Voila's first real reference project
is to build an approval subsystem **for itself**, using its own intake, canonical state, claims,
evidence, verification, and delivery process (delegation is **not** required — direct Steward
execution suffices). The approval model is a **proactive execution contract**: the Steward declares a
bounded phase and its intended operation classes up front, the user reviews **one prepared approval
bundle**, and subsequent tool calls are intercepted and checked against that approved scope. This
document specifies the extension and the self-hosting acceptance plan. **It is not implemented in
Phase 0 or Packet 1** — this is a specification and plan.

## Why this project

- It is a **genuine gap** in Pi: approval gating exists only as single-purpose examples
  (`permission-gate.ts`, `protected-paths.ts`); there is no grouping, phase-scoping, denial behavior,
  history, or policy narrowing (see [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md)).
- It is **the right first self-hosting target**: valuable to Voila itself, bounded, testable, and
  it forces every part of the core (intake → canonical state → claims → evidence → completion gate →
  delivery) to be exercised on a real deliverable. Delegation is not exercised here.
- It directly serves product direction §15 (approval experience) and §23 (controlled
  self-modification).

## Approval model: proactive execution contract

The bundle is prepared **before** the work runs from the Steward's declared intent — not assembled
retroactively by hoping intercepted calls can be grouped into something coherent. The flow is:

1. The Project Steward declares the **bounded phase** and the **intended operation classes** (e.g.,
   "edit files under `src/`", "run tests", "git add/commit") for that phase.
2. The user reviews **one prepared approval bundle** describing the phase, its operation classes,
   risks, reversibility, and the consequence of denial.
3. Actual tool calls are intercepted (`on("tool_call")`) and **checked against the approved scope**.
4. Calls **outside** the approved scope are blocked or require another approval bundle.
5. Phase approval **expires at the declared boundary** (end of phase).
6. Approval history and enforcement decisions (allowed / blocked / re-requested) are recorded.
7. Permission is **never broadened implicitly** — an approval covers only its declared operation
   classes for its declared phase.

Explicitly: do not assume individual intercepted calls can always be collected retroactively into one
coherent bundle. The bundle is derived from the declared contract; interception enforces it.

## Capability contract (design intent, to be refined during the project)

Built on `on("tool_call")` (block/allow) plus a Voila policy store and UI:

- Represent a declared phase contract: operation classes, reversibility, declared boundary.
- Present one prepared bundle via `ctx.ui.custom()`/dialogs (TUI) or the RPC extension-UI
  sub-protocol.
- Enforce: allow calls within scope; block or re-request calls outside scope; expire at the boundary.
- Persist decisions, enforcement outcomes, and history to canonical `.voila/` state and
  `receipts/`; never widen scope implicitly.
- Emit a receipt for each approval decision and each enforcement action (what was asked, decided,
  scope, timestamp).

## Minimum Voila capabilities required before self-hosting (the gate)

**Delegation is not required for the first self-hosting transition.** Direct Project Steward
execution is acceptable. Subprocess delegation remains an important prototype and later capability
claim, but it does not block building `voila-approval-bundles`. Voila may start managing this
project itself when the MVP core can:

1. **Planning intake** — ingest a planning document and derive canonical state/backlog.
2. **Durable state** — canonical `.voila/` state that survives restart (loads/validates first).
3. **Visible next action** — surface the next justified action after restart.
4. **Claims and evidence** — track claims with confidence and evidence links.
5. **Reproducible verification** — run at least one independent verification and store a reproducible
   receipt.
6. **State-transition blocking** — reject the `mark-complete` state transition unless the required
   receipt passes (guarantee about `project.json`, not model prose).
7. **Delivery summary** — produce a delivery summary tied to claims/receipts.
8. **Commit suggestion** — suggest a commit at a checkpoint.

Until all eight hold, work proceeds as *bootstrap* (Claude-driven), not self-hosted.

## Project intake artifact

The kickoff artifact Voila ingests is a short `APPROVAL_BUNDLES_BRIEF.md` containing: objective,
the product surface above, non-goals (not a full RBAC/permissions system; not a Pi trust
replacement), constraints (must not silently broaden permissions; must degrade across TUI/RPC modes),
and acceptance criteria. Voila preserves it and derives the backlog.

## Expected backlog items (illustrative)

1. Phase-contract model: declared operation classes + reversibility + boundary.
2. Prepared-bundle renderer (explain phase, operation classes, risks, reversibility, denial
   consequence).
3. Interception + scope enforcement (`on("tool_call")`): allow in-scope, block/re-request
   out-of-scope, expire at boundary — in TUI and RPC modes.
4. Policy/decision store + enforcement history in canonical `.voila/` state; no-implicit-broadening
   invariant.
5. Denial behavior and safe continuation/stop.
6. Receipts for approval decisions and enforcement actions.
7. Tests for every rule and the no-broadening invariant.

## Claims to verify

- "A phase contract is reviewed as one prepared bundle before the work runs" (behavioral demo).
- "Tool calls outside the approved scope are blocked or re-requested" (enforcement tests).
- "Irreversible operation classes are always distinguished from reversible ones" (classification tests).
- "Approving a phase never broadens permission beyond its declared operation classes/boundary"
  (invariant test — the critical claim).
- "Denied actions do not execute and the agent continues or stops safely" (behavioral + unit tests).
- "Approval decisions and enforcement history are recorded and inspectable" (receipt/state check).

## Approval behaviors to test

- One prepared bundle reviewed per declared phase; not N retroactive prompts.
- In-scope calls proceed; out-of-scope calls are blocked or trigger a new bundle.
- Phase approval expires at the declared boundary.
- Denial blocks execution and records a reason.
- No decision silently escalates scope (fuzz/property test over action sequences).

## Failure cases to cover

- A phase declaring mixed reversible/irreversible operation classes (must surface the irreversible
  ones explicitly in the bundle).
- RPC mode where `custom()` is unavailable (must fall back to dialog sub-protocol).
- Timed-out or cancelled approval dialog (treated as denial, not silent allow).
- Conflicting/overlapping declarations (most-restrictive wins; never auto-broaden).
- Resume mid-phase (the active contract + pending decisions restored from canonical state, not lost
  or auto-approved).

## Evidence requirements

- Unit tests for the phase-contract model, scope enforcement, and the no-broadening invariant.
- Behavioral demonstrations (transcripts/receipts) for bundle presentation, out-of-scope blocking,
  denial, and boundary expiry.
- Reproducible verification receipts stored in `.voila/receipts/` and linked to each claim.
- Explicit limitations documented (what the approval system does **not** guarantee).

## Git delivery boundary

A single reviewable PR (or delivery summary) on a feature branch: the approval extension + tests +
docs + receipts, with a clear diff, stated risks/limits, and the no-broadening invariant test
passing. No push/publish without explicit approval.

## Completion criteria

- All claims verified with receipts; the no-broadening invariant test passes.
- Every failure case has a test or a documented, justified exclusion.
- The extension degrades correctly across TUI and RPC modes.
- Limitations are documented.
- Voila itself managed the project from intake to delivery (the self-hosting proof) — recorded in
  the ledger with the phase at which control passed from bootstrap to Voila.

## Work-ownership boundaries (explicit)

- **Bootstrap work performed directly through Claude:** the Phase 0 audit and plans (this repo);
  standing up the MVP core if done before Voila can self-host.
- **Work managed by early Voila:** ingesting `APPROVAL_BUNDLES_BRIEF.md`, maintaining canonical
  state/backlog, tracking claims, running verification, and producing the delivery summary — once the
  eight-capability gate holds (delegation not required).
- **Work performed after Voila reaches the self-hosting gate:** the approval extension
  implementation, verified and delivered under Voila's own process, with control-transfer recorded.
