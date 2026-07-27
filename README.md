# Voila

Voila is a **project-aware agentic development environment** built on the
[Pi coding-agent harness](https://github.com/earendil-works/pi). Its **Project Steward** keeps
models, agents, tools, terminals, and handoffs aligned with durable project intent, coordinates their
work, preserves continuity, and quietly assembles the evidence needed to justify delivery.

**Delegate work, retain the thread.** The developer provides intent, consequential judgment,
credentials, and final authority. The Steward provides coordination, continuity, execution leverage,
recovery, and forward motion — without becoming another system the developer has to manage.

The authoritative product statement is
[docs/product/PROJECT_STEWARD_DOCTRINE.md](docs/product/PROJECT_STEWARD_DOCTRINE.md).

> **Rename note.** Voila was developed under the working name NewFang through the Proof Engine
> milestone. Historical verification records retain that name intentionally. Existing `NF-n`,
> `DEC-n`, `ASM-n`, `RSK-n`, `INT-n`, `ORI-n`, `CLM-n`, and `RCP-n` identifiers are unchanged.
> See [docs/migrations/NEWFANG_TO_VOILA.md](docs/migrations/NEWFANG_TO_VOILA.md) for the transition
> and the `.newfang/` -> `.voila/` migration path.

## Picking this up cold

[`docs/HANDOFF.md`](docs/HANDOFF.md) is a self-contained brief. It records the current direction, the
active focus, open human-required work, the exact next justified action, and the gotchas that will
bite you. Read it before making changes after a break, or hand it to another assistant.

## Using Voila on other projects

**L0.1 package acceptance passes.** The checkout exposes one explicit Pi package manifest with the
extension and Project Steward skill under `pi-package/`; the old `.pi/` auto-discovery entries are
gone. The retired `scripts/install-global.mjs` supports legacy-shim status/removal only and refuses
installation.

After reviewing the external user-settings effect, install this checkout with:

```bash
mise exec -- npm run pi -- install "$(pwd)"
```

On the dogfood machine this command was separately authorized and completed on 2026-07-27. Canonical
state remains **per-project** in `.voila/`; real-package acceptance proves startup in an uninitialized
project shows `/voila init` without creating state.

See [the L0.1 packet](docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md).

## Status

**Operational Roadmap v2 accepted 2026-07-27 — L0.1 is protected-complete; bounded G0 implementation is active.**
[ADR-0010](docs/decisions/0010-local-distribution-and-safe-publication-sequence.md) and
[the v2 roadmap](docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md) insert L0 local availability, G0 guarded
local commits, and G1 guarded GitHub publication before the refined R3–R7 program. They preserve the
Project Steward doctrine and completed R1/R2 history. **Project Steward Operational Loop v1** remains
the milestone.

L0.1's repository, isolated-package, real global-install, and dogfood tiers pass; NF-22 completed
through the protected transition. R1 and bounded R2A/R2B are also accepted, protected-complete, and
merged. R2 provides exactly two fixed
operations through one shared per-project supervisor: `r2a.state-store-tests` and
`r2b.repository-checks`. Exact evidence is recorded in
[docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md](docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md).

**Not built yet:** G0 staging/commit execution, G1 push/PR execution, L0.2 tags, general background
terminals, child workers, multi-operation concurrency,
watchers, dev servers, `list`/`wait` tools, cross-process coordination, or automatic integration.
DEC-30 through DEC-32 are proposed future authority only. The current Steward still does not stage,
commit, push, mutate PRs, merge, or create/push tags.

**What is built — Phase 0 + Packets 1–4 + Phase 6 + R1/R2 + L0.1.** Voila has a thin package adapter (`pi-package/extensions/voila.ts`), canonical `.voila/` state with
**explicit schema versioning/migration** (now v6), a compact **project-operations layer** (work items, decisions,
assumptions, risks), a keyboard-first **Steward Console** (`/voila home`), **planning intake +
repository orientation**, and the **proof engine**: claims tied to exact acceptance criteria,
executable verification recorded as immutable receipts, evidence freshness derived from a repository
fingerprint, a **protected completion transition**, and a **delivery engine** that proposes
commit boundaries and an evidence-backed delivery summary (`/voila deliver`, `/voila commit`) without
ever committing, staging, or pushing. 35 LLM-callable tools, a real **Project
Steward** Pi skill, and a **focus capsule** injected before every Steward turn: canonical truth,
bounded repository observation, and a directive that turns `Continue.` into work instead of a status
report ([docs/design/FOCUS_CAPSULE.md](docs/design/FOCUS_CAPSULE.md)). Evidence freshness is
**content-addressed** ([ADR-0008](docs/decisions/0008-fingerprint-v2-content-addressed.md)), so
committing receipts no longer invalidates them; orientation freshness follows the content it inspected,
not git HEAD. Doctor separates structural health from expected development drift. Pinned to
`@earendil-works/pi-coding-agent@0.82.0` on Node `22.23.1` (via mise). Real global-package dogfood
passes with one user/package extension and Project Steward skill while canonical `.voila/` state
remains project-local.

**The boundary is explicit**: the model interprets (fallibly), Voila enforces (preservation,
schemas, provenance, gating, persistence, idempotency), and *you* accept. Nothing enters canonical
truth without your confirmation.

**What the completion gate does and does not guarantee.** Canonical state will not mark a work item
`completed` unless every acceptance criterion is covered by a required claim and every required claim
is supported by a current passing receipt. That guarantees Voila's *state transition* — it does
**not** stop a model from writing unsupported prose in conversation, and a `completed` status typed
by hand into `project.json` is still schema-valid (`/voila doctor` reports when such a record no
longer revalidates). Verification runs a real command with a bounded timeout and no shell; it is
**not a sandbox**. See [docs/design/PROOF_ENGINE.md](docs/design/PROOF_ENGINE.md).

This is **not** the full product. There is no delegation or general background-terminal runtime;
R2A and R2B are bounded fixed operations, not workers or arbitrary commands. There is no accepted
package distribution, Git-effect executor, automatic integration, approval/merge authority,
sandboxing, remote execution, broad model routing, cost tracking, or general release automation.
NF-2 remains open honestly: its authenticated Project-Steward acceptance run is still pending. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md),
[docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md](docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md), and
[docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md](docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md).

## What Voila is (and is not)

Voila takes a natural-language request, planning document, existing repository, or interrupted project
and moves it toward an evidence-backed delivery state — with the **Project Steward** acting as a
persistent technical lead that coordinates the work rather than a ledger the developer maintains. It
retains accountability for intent, decisions, state, delegation, evidence, and completion claims, and
it retains the thread across models, workers, and sessions.

Voila is **not** a Pi theme, a loose collection of extensions, a subagent demo, a chat interface,
an OpenCode replacement, or a project-management system that happens to sit near a coding agent.

The authoritative product statement is
[docs/product/PROJECT_STEWARD_DOCTRINE.md](docs/product/PROJECT_STEWARD_DOCTRINE.md).
[docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md) is the preserved v0.1 authored
source; where the two disagree, the doctrine wins.

## Document map

**Authority chain.** These documents govern, in order:

```text
VOILA_OPERATIONAL_ROADMAP_V2  controls L0/G0/G1 insertions and current sequencing
PROJECT_REALIGNMENT_PLAN      controls the retained doctrine foundation and R3–R7 program
PROJECT_STEWARD_DOCTRINE      controls Steward behavior and product tests
PRODUCT_DIRECTION             remains authoritative where not superseded
```

The v2 roadmap wins only for its explicit sequencing/publication changes. The doctrine wins over the
v0.1 product direction on how the Steward behaves and what Voila is for.

| Area | Document | Purpose |
|------|----------|---------|
| Product | [docs/product/PROJECT_STEWARD_DOCTRINE.md](docs/product/PROJECT_STEWARD_DOCTRINE.md) | **Authoritative** product statement, doctrine, No Managing the Manager gate |
| Plans | [docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md](docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md) | **Active roadmap** — L0/G0/G1 insertions, refined R3–R7 |
| Plans | [docs/plans/G0_GUARDED_LOCAL_COMMIT.md](docs/plans/G0_GUARDED_LOCAL_COMMIT.md) | Active bounded G0 implementation and acceptance packet |
| Plans | [docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md](docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md) | Completed L0.1 implementation and acceptance packet |
| Plans | [docs/plans/PROJECT_REALIGNMENT_PLAN.md](docs/plans/PROJECT_REALIGNMENT_PLAN.md) | Retained doctrine foundation and R0–R7 source program |
| Product | [docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md) | Preserved v0.1 authored source; superseded as the operational statement |
| Research | [docs/research/PI_CAPABILITY_AUDIT.md](docs/research/PI_CAPABILITY_AUDIT.md) | What current Pi natively provides |
| Research | [docs/research/BEN_SETUP_AUDIT.md](docs/research/BEN_SETUP_AUDIT.md) | Audit of `davis7dotsh/my-pi-setup` |
| Research | [docs/research/VOILA_CAPABILITY_MATRIX.md](docs/research/VOILA_CAPABILITY_MATRIX.md) | Requirement-by-requirement matrix |
| Architecture | [docs/architecture/ARCHITECTURE_OPTIONS.md](docs/architecture/ARCHITECTURE_OPTIONS.md) | Five architecture options compared |
| Architecture | [docs/architecture/RECOMMENDED_ARCHITECTURE.md](docs/architecture/RECOMMENDED_ARCHITECTURE.md) | The recommendation |
| Plans | [docs/plans/MVP_VERTICAL_SLICE.md](docs/plans/MVP_VERTICAL_SLICE.md) | Smallest proof slice |
| Plans | [docs/plans/MVP_IMPLEMENTATION_PLAN.md](docs/plans/MVP_IMPLEMENTATION_PLAN.md) | Phases 0–8. Phases 5–8 superseded; retained as history |
| Plans | [docs/plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md](docs/plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md) | `voila-approval-bundles` self-hosting project |
| Project | [docs/project/PROJECT_LEDGER.md](docs/project/PROJECT_LEDGER.md) | Manual project ledger during bootstrap |
| Decisions | [docs/decisions/](docs/decisions/) | Architecture Decision Records (0001–0010) |
| Setup | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, pinned versions, commands, smoke test |
| Verification | [docs/verification/PACKET_1_FOUNDATION.md](docs/verification/PACKET_1_FOUNDATION.md) | Packet 1 foundation verification record |
| Verification | [docs/verification/PACKET_2_PROJECT_OPERATIONS.md](docs/verification/PACKET_2_PROJECT_OPERATIONS.md) | Packet 2 project-operations verification record |
| Verification | [docs/verification/R1_AMBIENT_CONTINUITY.md](docs/verification/R1_AMBIENT_CONTINUITY.md) | R1 ambient continuity: both evidence tiers, and what they do not establish |
| Design | [docs/design/STEWARD_CONSOLE.md](docs/design/STEWARD_CONSOLE.md) | Steward Console design and alternatives |
| Design | [docs/design/PLANNING_INTAKE.md](docs/design/PLANNING_INTAKE.md) | Intake lifecycle, provenance, and apply semantics |
| Design | [docs/design/REPOSITORY_ORIENTATION.md](docs/design/REPOSITORY_ORIENTATION.md) | Bounded orientation and content-based freshness |
| Design | [docs/design/FOCUS_CAPSULE.md](docs/design/FOCUS_CAPSULE.md) | The injected continuation capsule and `Continue.` semantics |
| Design | [docs/design/PROOF_ENGINE.md](docs/design/PROOF_ENGINE.md) | Claims, receipts, freshness, protected completion |
| Design | [docs/design/DELIVERY_INSPECTOR.md](docs/design/DELIVERY_INSPECTOR.md) | Read-only inspection: what changed, scope, attention |
| Design | [docs/design/DELIVERY_ENGINE.md](docs/design/DELIVERY_ENGINE.md) | Delivery summary, commit suggestion, and the delivery boundary |
| Verification | [docs/verification/PACKET_4_PROOF_ENGINE.md](docs/verification/PACKET_4_PROOF_ENGINE.md) | Packet 4 proof-engine verification record |
| Verification | [docs/verification/PACKET_2_5_STEWARD_CONSOLE.md](docs/verification/PACKET_2_5_STEWARD_CONSOLE.md) | Packet 2.5 console verification record |
| Verification | [docs/verification/PACKET_3_INTAKE_ORIENTATION.md](docs/verification/PACKET_3_INTAKE_ORIENTATION.md) | Packet 3 intake/orientation verification record |

## Operating instructions

Repository operating instructions are harness-neutral and live in [AGENTS.md](AGENTS.md).
Claude-specific guidance is in [CLAUDE.md](CLAUDE.md).

## Foundation and license notes

- **Pi** (`@earendil-works/pi-coding-agent`) is the harness foundation. It is not vendored here.
- The reference setup `davis7dotsh/my-pi-setup` is studied for ideas only. It ships **no license**
  and its author explicitly discourages copying; Voila reimplements ideas independently rather
  than reusing its code. See [AGENTS.md](AGENTS.md#reference-handling) and
  [docs/decisions/0004-no-vendoring-of-reference-repositories.md](docs/decisions/0004-no-vendoring-of-reference-repositories.md).
