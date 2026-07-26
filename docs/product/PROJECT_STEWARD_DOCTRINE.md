# Project Steward Doctrine

- **Status:** authoritative as of 2026-07-26
- **Established by:** [ADR-0009](../decisions/0009-project-steward-operational-realignment.md) / DEC-18
- **Source plan:** [PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md)

This document states what Voila is for and how its Project Steward is supposed to behave. It is the
operational product statement. Where it conflicts with the v0.1
[PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md), this document wins; where it conflicts with the source
realignment plan, the plan wins.

## Product statement

> **Voila is a project-aware agentic development environment built on Pi. Its Project Steward keeps
> models, agents, tools, terminals, and handoffs aligned with durable project intent, coordinates
> their work, preserves continuity, and quietly assembles the evidence needed to justify delivery.**

Voila is not a project-management system that happens to sit near a coding agent. Durable state,
claims, receipts, gates, and delivery records are infrastructure **in service of** AI execution. They
are not the daily experience.

## The doctrine

> **Delegate work, retain the thread.**

This replaces "delegate work, never ownership" as the operative phrasing. Ownership was never the
problem — the earlier phrasing was correct about accountability and silent about coordination. The
Steward is accountable *and* it is the thing that keeps the thread when work is spread across
models, child sessions, and background processes.

The Steward retains:

- why the work exists;
- what is currently being attempted;
- which worker or process owns each task;
- what has actually happened;
- what results returned;
- whether those results advance the goal;
- what should happen next.

## The operating loop

```text
Understand → Decide → Delegate → Observe → Correct → Integrate → Continue
```

The division of labor is fixed:

| The developer provides | The Steward provides   |
| ---------------------- | ---------------------- |
| Intent                 | Coordination           |
| Consequential judgment | Continuity             |
| Credentials            | Execution leverage     |
| Final authority        | Recovery               |
|                        | Forward motion         |

The developer is not the scheduler, the message bus, or the state repair mechanism.

## The No Managing the Manager gate

Every capability must answer:

> Does this capability help the Project Steward use AI to complete accepted work with less developer
> coordination?

A capability **fails** the gate when it requires the developer to:

- manage routine state freshness;
- understand internal schemas;
- manually route every task;
- check whether workers settled;
- carry results between models;
- repeatedly say "continue";
- repair normal execution state;
- approve reversible work inside the plan;
- operate evidence infrastructure during ordinary development.

This gate applies to Voila itself, and it applies retroactively. A shipped capability that fails it
is a defect, not a feature to defend. Several already do — see
[the realignment plan §1](../plans/PROJECT_REALIGNMENT_PLAN.md#what-became-over-central).

## What this changes about existing subsystems

The full reclassification table is
[realignment plan §4](../plans/PROJECT_REALIGNMENT_PLAN.md#4-reclassify-the-existing-system). The
four consequences that most change day-to-day behavior:

1. **The Proof Engine becomes a boundary service.** It runs when a slice finishes, when completion is
   requested, when delivery is requested, or when the developer asks. It does not run as a
   maintenance obligation after every source edit. Stale evidence during active development is
   expected and is not a failure state.
2. **Claims and receipts are hidden by default.** They stay inspectable and stay immutable. They stop
   being something the developer operates.
3. **Doctor answers one question:** is Voila structurally healthy and internally consistent?
   Readiness is not Doctor's job; it belongs to home, proof detail, completion, and delivery.
4. **Delegation and background execution are no longer optional.** They were deferred prototypes.
   They are now the product-critical path.

## What is preserved, and is not up for renegotiation

- Evidence still gates canonical completion. The protected transition still rejects.
- Historical evidence is still immutable. Decisions are superseded, never rewritten.
- Voila still never commits, stages, pushes, or opens a pull request.
- Canonical state remains per-project and human-readable.
- Pi remains the host harness; the project-local extension stays thin.
- The parent Steward remains the integrator.
- Models interpret, fallibly. Deterministic systems establish what actually executed.
- The developer retains consequential authority.

Automating the *operation* of evidence is the goal. Weakening what evidence means is not. A quiet
gate is still a gate.

## Honest capability status

As of 2026-07-26, most of the operational loop this document describes is **doctrine, not
implementation**. R1 is the exception: it is implemented and its acceptance behavior was observed.

| Capability                              | Status                                                       |
| --------------------------------------- | ------------------------------------------------------------ |
| Durable per-project state               | Built                                                        |
| Planning intake, orientation            | Built                                                        |
| Claims, receipts, completion gate       | Built                                                        |
| Delivery summary, commit suggestion     | Built                                                        |
| Steward Console, ambient widget         | Built                                                        |
| Focus capsule / context injection       | Built (R1)                                                   |
| Action-oriented `Continue.`             | Built (R1) — observed in a fresh Pi session                  |
| Content-based orientation freshness     | Built (R1)                                                   |
| Quiet development staleness             | Built (R1) — Doctor separates structure from readiness drift  |
| Honest held readiness                   | Built (R1) — presentation only; no new gate                  |
| Verification grouping                   | Seam only (R1) — identity and grouping; execution is R6       |
| Background terminals                    | Not built (R2)                                               |
| Pi child workers                        | Not built (R3)                                               |
| Automatic settlement and integration    | Not built (R4)                                               |
| Fresh-session continuity                | Not built (R5)                                               |
| Quiet boundary reconciliation           | Not built (R6)                                               |
| Uncoached dogfood acceptance            | Not attempted (R7)                                           |

R1's evidence is recorded in
[docs/verification/R1_AMBIENT_CONTINUITY.md](../verification/R1_AMBIENT_CONTINUITY.md), including what
it does **not** establish. R1 was completed through the protected transition on `4d108fc`: criterion 5
was aligned with R1 capability honesty under DEC-20, the canonical-event concurrency defect was
fixed, and the five NF-9 required claims are supported by current receipts. Honest limitations remain
visible on each claim.

What R1 makes true is narrow: **invocation is immediately useful**. Nothing runs between turns. R1 is
not background autonomy, automatic settlement, persistent execution, worker orchestration, or
self-running project management, and no document may describe it as any of those.

No document, skill, README, or canonical record may describe R2–R7 capabilities as present. The
Steward skill currently instructs the model **not** to spawn subagents, because there is no runtime
delegation to spawn them with. That instruction is a statement of current fact and gets revised when
R3 lands — not before.

## What to build next

Build the operational AI-teammate loop, in the R-sequence order:

```text
R1  Friction containment and ambient continuity
R2  One background terminal
R3  One bounded Pi child worker
R4  Operational integration and automatic settlement
R5  Fresh-session continuity
R6  Quiet boundary reconciliation
R7  Uncoached dogfood acceptance
```

The milestone is **Project Steward Operational Loop v1**.

Do **not** expand proof ceremony, approval infrastructure, model-routing breadth, arbitrary workflow
scripting, remote execution, or release automation before R7 passes. The approval-bundles
self-hosting project is paused, not cancelled.

## Anti-goals for this realignment

- Copying the reference setup's implementation.
- Adopting Effect because the reference uses it.
- Creating a universal workflow language.
- Building three agent backends before one works well.
- Flooding every worker with full project context.
- Collapsing all operational state into one giant schema.
- Treating agent count as progress.
- Exposing internal receipts as routine UX.
- Turning every implementation choice into an approval event.
- Replacing useful autonomy with a general policy engine.

## The final question

> Did the Project Steward feel like an additional capable teammate, or like a project-management
> process that required supervision?

Only the first answer passes.
