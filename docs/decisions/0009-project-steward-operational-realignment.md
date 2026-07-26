# ADR-0009 — Realign around the Project Steward operational loop

- **Status:** accepted
- **Date:** 2026-07-26
- **Deciders:** Joshua Jenks (owner direction)
- **Canonical record:** DEC-18
- **Supersedes:** the remaining sequence of
  [MVP_IMPLEMENTATION_PLAN.md](../plans/MVP_IMPLEMENTATION_PLAN.md) (Phases 5–8) and the sequencing
  clause of [ADR-0005](0005-roles-as-skills-not-runtime-agents.md)
- **Does not supersede:** ADR-0001 through ADR-0004, ADR-0006 through ADR-0008, or the
  substance of ADR-0005

## Context

Phase 0 and Packets 1–4 plus Phase 6 delivered a genuinely strong foundation: durable per-project
state, planning intake with preserved provenance, repository orientation, work items and
dependencies, decisions/assumptions/risks, a visible focus and next action, claims tied to exact
acceptance criteria, deterministic verification receipts, a protected completion transition, a
delivery summary and commit suggestion, a keyboard-first console, a Project Steward skill, and 587
passing tests.

It also produced a product that the developer increasingly has to operate. Observed during the
Phase 7 walk-through and the fingerprint-v2 work, the developer was required to refresh claims,
interpret stale evidence, re-run identical verification commands, refresh orientation, understand
internal gates, reconcile disagreement between Proof and Doctor, and repeatedly tell the Steward how
to continue.

The system became excellent at recording whether work was justified and weak at using AI to perform
and coordinate the work. Meanwhile the capabilities that would make the Steward feel like a
teammate — delegated workers, background terminals, active-worker visibility, automatic settlement,
steering and takeover, operational session continuity — were all classified as deferred or optional.

Two specific artifacts show the imbalance concretely. ADR-0008 exists because evidence went stale on
every commit, including the commit that recorded the receipts — a maintenance treadmill created
entirely by internal design. And `MVP_IMPLEMENTATION_PLAN.md` Phase 5 states that delegation is
"NOT a self-hosting prerequisite," placing the product's central execution capability outside the
critical path while an approval-bundles subsystem sat on it.

## Decision

**The Project Steward Operational Loop is the active product priority.** Voila is a project-aware
agentic development environment whose Steward coordinates models, agents, tools, terminals, and
handoffs against durable project intent.

Specifically:

1. **Adopt the doctrine** in [PROJECT_STEWARD_DOCTRINE.md](../product/PROJECT_STEWARD_DOCTRINE.md) as
   the authoritative operational product statement, with
   [PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md) as its source. The operative
   phrasing becomes **"delegate work, retain the thread."**
2. **Adopt the No Managing the Manager gate** as the admission test for every future capability, and
   apply it retroactively: a shipped capability that fails it is a defect.
3. **Promote delegation and background execution to product-critical.** They are no longer optional
   prototypes sequenced after the evidence system.
4. **Retain proof and delivery as subordinate foundations.** Evidence still gates canonical
   completion and historical evidence remains immutable. The Proof Engine becomes a quiet boundary
   service rather than a maintenance obligation. Automating the operation of evidence is in scope;
   weakening what evidence means is not.
5. **Pause approval-bundle self-hosting.** It resumes only after the operational loop passes its
   uncoached acceptance. Paused, not cancelled.
6. **Replace the roadmap** with the R-sequence: R0 direction lock, R1 friction containment, R2 one
   background terminal, R3 one bounded Pi child worker, R4 operational integration and automatic
   settlement, R5 fresh-session continuity, R6 quiet boundary reconciliation, R7 uncoached dogfood
   acceptance. The milestone is **Project Steward Operational Loop v1**.
7. **Reject a general policy engine** for this realignment, to avoid replacing useful autonomy with
   process machinery.

Deferred without prejudice: arbitrary workflow scripting, multi-harness support at scale, remote
execution.

## Relationship to ADR-0005

ADR-0005's substance stands: roles are product concepts expressed as skills and prompt templates,
model-independent, with model selection a separate routing concern. Nothing here reverses that.

What is superseded is ADR-0005's **sequencing** clause. It deferred "broader runtime roles,
parallelism, and takeover UI... until reliability is proven," and conditioned narrow delegation on
"the durable ledger and verification gate work." That work is now complete, and worker inspection,
steering, and takeover are promoted from deferred to required — not as a multi-agent scheduler, but
as the operational visibility a single bounded worker needs. Concurrency still begins at one.

ADR-0005's caution about the reference setup's Effect-heavy multi-backend runtime is retained and
restated as an explicit anti-goal.

## Consequences

### Sequencing

- Phases 5–8 of the MVP implementation plan no longer describe what gets built next. That document is
  retained with a status notice; it is history, not direction.
- No approval bundles, broad model routing, arbitrary workflows, or release automation before R7
  passes.
- R0 is documentation and canonical direction only. No runtime feature work.

### Honesty constraints

- R1–R7 capabilities do not exist yet. No document, skill, README, or canonical record may describe
  them as present.
- The Steward skill's instruction not to spawn subagents remains correct until R3 lands, because
  there is no runtime delegation to spawn them with.
- The doctrine document carries an explicit built/not-built table for exactly this reason.

### Backlog

- NF-1 stays completed. NF-2 stays held pending the authenticated Project Steward intake that DEC-17
  requires; the realignment does not release it.
- NF-3 and NF-4 stay dependency-blocked behind NF-2.
- NF-9 through NF-15 are created for R1 through R7, sequenced by dependency.
- Focus moves to NF-9 (R1). NF-2's outstanding authenticated acceptance is unaffected and still owed.

### Risk accepted

Promoting delegation and background execution introduces subprocess lifecycle, settlement, and
recovery complexity that the project has so far avoided. The stop conditions in the realignment plan
are the mitigation: if delegation adds more elapsed time or coordination than direct work, the
runtime does not expand — assignment quality and settlement get fixed first. R2 and R3 are
deliberately scoped to one process and one worker.

A second, subtler risk: "quiet" evidence can become invisible evidence. The mitigation is that the
completion gate is unchanged and still rejects, and that boundary reconciliation reports real
failures and limitations rather than summarizing only good news.

## Evidence

- [PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md) — the authored source plan.
- [PHASE_7_SELF_HOSTING_GATE.md](../verification/PHASE_7_SELF_HOSTING_GATE.md) — the walk-through
  that surfaced the operational friction, including the completion reversal.
- [ADR-0008](0008-fingerprint-v2-content-addressed.md) — a maintenance treadmill created by internal
  design, and the fix.
- `MVP_IMPLEMENTATION_PLAN.md` Phase 5 — the superseded classification of delegation as not a
  prerequisite.
