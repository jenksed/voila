# Voila

Voila is a personal development operating system for Joshua Jenks, built on top of the
[Pi coding-agent harness](https://github.com/earendil-works/pi). Its central responsibility is
maintaining ownership of work from intent through implementation, verification, and delivery —
not merely generating code.

> **Rename note.** Voila was developed under the working name NewFang through the Proof Engine
> milestone. Historical verification records retain that name intentionally. Existing `NF-n`,
> `DEC-n`, `ASM-n`, `RSK-n`, `INT-n`, `ORI-n`, `CLM-n`, and `RCP-n` identifiers are unchanged.
> See [docs/migrations/NEWFANG_TO_VOILA.md](docs/migrations/NEWFANG_TO_VOILA.md) for the transition
> and the `.newfang/` -> `.voila/` migration path.

## Picking this up cold

[`docs/HANDOFF.md`](docs/HANDOFF.md) is a self-contained brief: where the project stands, the
doctrine that is enforced by tests, the two open decisions, and the gotchas that will bite you. Read
it before making changes after a break, or hand it to another assistant.

## Using Voila on other projects

Voila lives in this repository as a project-local Pi extension, so out of the box it only loads
here. Pi also loads `~/.pi/agent/extensions/` in **every** session, so one command makes Voila
available everywhere:

```bash
node scripts/install-global.mjs           # install
node scripts/install-global.mjs --status  # what is installed, and where it points
node scripts/install-global.mjs --remove  # uninstall
```

This writes a single shim that re-exports this checkout's adapter. It does **not** copy the code, so
there is one source of truth and `git pull` here updates every project. It is reversible: `--remove`
deletes the one file.

Canonical state stays **per-project** in `.voila/`. A global install changes only where the code is
loaded from. In a project with no `.voila/`, the ambient widget shows the `/voila init` hint and
nothing is created until you ask for it.

## Status

**Phase 0 + Packets 1–4 complete — evidence-gated completion.** Voila is a runnable Pi extension:
a thin adapter (`.pi/extensions/voila.ts`), canonical `.voila/` state with **explicit schema
versioning/migration** (now v4), a compact **project-operations layer** (work items, decisions,
assumptions, risks), a keyboard-first **Steward Console** (`/voila home`), **planning intake +
repository orientation**, and the **proof engine**: claims tied to exact acceptance criteria,
executable verification recorded as immutable receipts, evidence freshness derived from a repository
fingerprint, a **protected completion transition**, and a **delivery engine** that proposes
commit boundaries and an evidence-backed delivery summary (`/voila deliver`, `/voila commit`) without
ever committing, staging, or pushing. 30 LLM-callable tools, a real **Project
Steward** Pi skill, and compact automatic context injection. Pinned to
`@earendil-works/pi-coding-agent@0.82.0` on Node `22.23.1` (via mise), tested (**355 tests**). The
repo **dogfoods its own** `.voila/` state.

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

This is **not** the full MVP. There are no approval bundles, delegation, background processes,
sandboxing, remote execution, model routing, cost tracking, or release automation. NF-1 and NF-2
remain open honestly: the interactive Steward Console check and the authenticated Project-Steward
acceptance run are still **pending**, so daily-use readiness is not yet claimed. See
[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) to run it and
[docs/plans/MVP_IMPLEMENTATION_PLAN.md](docs/plans/MVP_IMPLEMENTATION_PLAN.md) for what comes next.

## What Voila is (and is not)

Voila is intended to become a personal development operating system: it takes a natural-language
request, planning document, existing repository, or interrupted project and moves it toward an
evidence-backed delivery state, while a primary agent (the **Project Steward**) retains
accountability for intent, decisions, state, delegation, evidence, and completion claims.

Voila is **not** a Pi theme, a loose collection of extensions, a subagent demo, a chat interface,
or an OpenCode replacement.

The authoritative product statement is [docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md).

## Document map

| Area | Document | Purpose |
|------|----------|---------|
| Product | [docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md) | Canonical product direction (v0.1) |
| Research | [docs/research/PI_CAPABILITY_AUDIT.md](docs/research/PI_CAPABILITY_AUDIT.md) | What current Pi natively provides |
| Research | [docs/research/BEN_SETUP_AUDIT.md](docs/research/BEN_SETUP_AUDIT.md) | Audit of `davis7dotsh/my-pi-setup` |
| Research | [docs/research/VOILA_CAPABILITY_MATRIX.md](docs/research/VOILA_CAPABILITY_MATRIX.md) | Requirement-by-requirement matrix |
| Architecture | [docs/architecture/ARCHITECTURE_OPTIONS.md](docs/architecture/ARCHITECTURE_OPTIONS.md) | Five architecture options compared |
| Architecture | [docs/architecture/RECOMMENDED_ARCHITECTURE.md](docs/architecture/RECOMMENDED_ARCHITECTURE.md) | The recommendation |
| Plans | [docs/plans/MVP_VERTICAL_SLICE.md](docs/plans/MVP_VERTICAL_SLICE.md) | Smallest proof slice |
| Plans | [docs/plans/MVP_IMPLEMENTATION_PLAN.md](docs/plans/MVP_IMPLEMENTATION_PLAN.md) | Phased plan with gates |
| Plans | [docs/plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md](docs/plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md) | `voila-approval-bundles` self-hosting project |
| Project | [docs/project/PROJECT_LEDGER.md](docs/project/PROJECT_LEDGER.md) | Manual project ledger during bootstrap |
| Decisions | [docs/decisions/](docs/decisions/) | Architecture Decision Records (0001–0007) |
| Setup | [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | Local setup, pinned versions, commands, smoke test |
| Verification | [docs/verification/PACKET_1_FOUNDATION.md](docs/verification/PACKET_1_FOUNDATION.md) | Packet 1 foundation verification record |
| Verification | [docs/verification/PACKET_2_PROJECT_OPERATIONS.md](docs/verification/PACKET_2_PROJECT_OPERATIONS.md) | Packet 2 project-operations verification record |
| Design | [docs/design/STEWARD_CONSOLE.md](docs/design/STEWARD_CONSOLE.md) | Steward Console design and alternatives |
| Design | [docs/design/PLANNING_INTAKE.md](docs/design/PLANNING_INTAKE.md) | Intake lifecycle, provenance, and apply semantics |
| Design | [docs/design/REPOSITORY_ORIENTATION.md](docs/design/REPOSITORY_ORIENTATION.md) | Bounded orientation and staleness |
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
