# Project Steward Doctrine

- **Status:** authoritative as of 2026-07-27
- **Established by:** [ADR-0009](../decisions/0009-project-steward-operational-realignment.md) / DEC-18
- **Active sequencing:** [ADR-0010](../decisions/0010-local-distribution-and-safe-publication-sequence.md) / DEC-24 through DEC-29
- **Source plans:** [PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md) and [VOILA_OPERATIONAL_ROADMAP_V2.md](../plans/VOILA_OPERATIONAL_ROADMAP_V2.md)

This document states what Voila is for and how its Project Steward is supposed to behave. It is the
operational product statement. Where it conflicts with the v0.1
[PRODUCT_DIRECTION.md](PRODUCT_DIRECTION.md), this document wins. The original realignment plan
remains the source for the doctrine and R3–R7 program; Operational Roadmap v2 wins only for the L0/G0/G1
insertions and the affected sequencing/publication restrictions.

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
- The current Voila runtime still never commits, stages, pushes, mutates pull requests, merges, or
  creates/pushes tags. G0, G1, and L0.2 may supersede only their named clauses after their
  deterministic executors and acceptance gates pass; roadmap acceptance alone grants no effect
  authority.
- Canonical state remains per-project and human-readable.
- Pi remains the host harness; the package adapter stays thin.
- The parent Steward remains the integrator.
- Models interpret, fallibly. Deterministic systems establish what actually executed.
- The developer retains consequential authority.

Automating the *operation* of evidence is the goal. Weakening what evidence means is not. A quiet
gate is still a gate.

## Honest capability status

As of 2026-07-27, most of the operational loop this document describes is **doctrine, not
implementation**. R1 and bounded R2A/R2B are implemented, accepted, protected-complete, and merged.
L0.1 implementation and all four acceptance tiers pass under DEC-33; NF-22 is protected-complete.
Bounded G0 / NF-23 implementation is active under DEC-34; DEC-30 and every development-repository
commit effect remain proposed until acceptance.

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
| One finite supervised operation         | Built and accepted (bounded R2A)                             |
| Repository-check operation + visibility | Built, accepted, and protected-complete (bounded R2B)      |
| Global local-path Pi package             | Built, accepted, and protected-complete (L0.1 / NF-22) |
| Guarded local commit executor            | Bounded implementation active (G0 / NF-23); DEC-30 proposed |
| Guarded GitHub publication executor      | Not built (G1); DEC-31 is proposed only                      |
| Guarded initial-alpha tag executor       | Not built (L0.2); DEC-32 is proposed only                    |
| General background terminals            | Not built                                                     |
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

R2A's evidence and capability boundary are recorded in
[docs/verification/R2A_FINITE_OPERATION.md](../verification/R2A_FINITE_OPERATION.md). It accepted
`r2a.state-store-tests`, deterministic admission, the finite-operation supervisor, canonical
operation-run lifecycle, four model-callable operation tools, structured-file protection for
canonical state, bounded capsule settlement, and exactly-once next-turn delivery.

R2B reuses that same supervisor and shared one-run capacity for exactly
`r2b.repository-checks`. Model input is only the operation ID; a valid focused work item is captured
immutably during atomic reservation. One shared projection calls a starting or running operation
active only when the current runtime owns the reservation or live process. The widget, Console, and
capsule consume bounded variants of that projection; stale canonical active state requires
reconciliation and blocks a second start without clear or adoption. Current evidence and the four
passing acceptance tiers are recorded in
[docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md](../verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md).

Neither R2 slice introduces services, watchers, PTYs, child workers, concurrent operations,
operation discovery, list/wait/poll tools, cross-process coordination, or persistent execution
across Pi or OS restart. R2 does not make arbitrary commands runnable; operations are explicit and
registered. The Steward skill still instructs the model **not** to spawn subagents because R3
child-worker delegation does not exist. The operation supervisor is child-process supervision, not
subagent delegation.

## What to build next

Build in the accepted Operational Roadmap v2 sequence:

```text
L0.1  Global local-path Pi package and multi-project dogfood
G0    Guarded local commits from current publication plans
G1    Guarded GitHub publication and bounded publisher proposals
L0.2  One separately owner-authorized v0.1.0-alpha.1 Git installation tag
R3-0  Delegation suitability and assignment compiler
R3A–R3C  Read-only worker, steering/recovery, isolated-write worker
R4A–R4C  Projection, evaluation/integration, drift/failure recovery
R5    Fresh-session continuity
R6    Quiet boundary reconciliation
R7    Uncoached dogfood acceptance
```

The milestone remains **Project Steward Operational Loop v1**.

Do **not** expand proof ceremony, approval or merge authority, broad model routing, arbitrary workflow
scripting, remote execution, general tag/release automation, or package-registry publication. The
only pre-R7 tag exception is L0.2's separately owner-authorized `v0.1.0-alpha.1` Git installation
tag. The approval-bundles self-hosting project is paused, not cancelled.

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
