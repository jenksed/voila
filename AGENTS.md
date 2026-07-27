# AGENTS.md

Harness-neutral operating instructions for the Voila repository. Any coding agent (Claude Code,
Pi, or other) working here follows this file. Harness-specific notes may live in sibling files such
as `CLAUDE.md`, but must not duplicate or contradict this one.

## Repository purpose and current phase

Voila is a **project-aware agentic development environment** built on the Pi coding-agent harness.
Its Project Steward keeps models, agents, tools, terminals, and handoffs aligned with durable project
intent, coordinates their work, preserves continuity, and quietly assembles the evidence needed to
justify delivery.

The authoritative operational product statement is
[docs/product/PROJECT_STEWARD_DOCTRINE.md](docs/product/PROJECT_STEWARD_DOCTRINE.md).
[docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md) is the preserved v0.1 authored
source; where the two disagree, the doctrine wins.

**Current position.** Phase 0 and Packets 1–4 plus Phase 6 are complete: a modular Pi extension
(`pi-package/extensions/voila.ts` + `src/`), canonical `.voila/` state with explicit schema
migration, a project-operations layer, a Steward Console, planning intake with preserved provenance,
repository orientation, the proof engine (claims, receipts, freshness, protected completion), and a
delivery engine. Phase 7's self-hosting gate returned GO on capability, HOLD on backlog closure.

**Current phase: R0, R1, bounded R2, and L0.1 are protected-complete; bounded G0 / NF-23
implementation is active under DEC-24 through DEC-29 and DEC-34.** [ADR-0010](docs/decisions/0010-local-distribution-and-safe-publication-sequence.md)
and [Voila Operational Roadmap v2](docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md) insert L0 local
availability, G0 guarded local commits, and G1 guarded GitHub publication before the refined R3–R7
program. They supersede only DEC-13's package sequencing and DEC-18 / ADR-0009's affected sequencing
and pre-R7 publication restrictions; the Project Steward doctrine, completed R1/R2 history, and
Operational Loop v1 milestone stand.

NF-22 / L0.1 is governed by the owner-accepted DEC-33 packet,
[docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md](docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md). Its
repository, isolated-package, real global-install, and dogfood tiers pass; the separately authorized
external effect was executed on 2026-07-27, and NF-22 completed through the protected transition.
The bounded G0 implementation packet is
[docs/plans/G0_GUARDED_LOCAL_COMMIT.md](docs/plans/G0_GUARDED_LOCAL_COMMIT.md). DEC-34 removes the
per-commit owner prompt: protected completion and a current guarded plan are the proposed authority.
Implementation and disposable-repository Git acceptance effects may proceed; DEC-30 and every
Voila-development-repository Git effect remain unavailable until final G0 acceptance. G1, L0.2,
general background terminals, and delegation do not exist. DEC-30 through DEC-32 are proposed future
authority, not
permission for the current Steward to stage, commit, push, mutate pull requests, merge, or create or
push tags. Do **not** begin approval, merge, broad model routing, arbitrary workflow scripting,
remote execution, general release/tag automation, or package-registry publication. R2A accepted one
explicit finite operation on 2026-07-26, with evidence in
[docs/verification/R2A_FINITE_OPERATION.md](docs/verification/R2A_FINITE_OPERATION.md). Merged R2B
implements one additional fixed repository-check operation under DEC-23, shared one-operation
capacity, and bounded runtime-backed presentation; automated verification and all four real
acceptance tiers pass, and NF-20 plus NF-10 completed through the protected gate on 2026-07-27.
Neither slice may be described as a
service, watcher, PTY, worker, arbitrary command facility, or cross-process runtime. The accepted R2B
boundary is
[docs/plans/R2B_BACKGROUND_OPERATION_VISIBILITY.md](docs/plans/R2B_BACKGROUND_OPERATION_VISIBILITY.md),
and current evidence is
[docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md](docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md).
R1's ambient continuity **does** exist (focus
capsule, action-oriented `Continue.`, content-based orientation freshness, quiet development
staleness, honest held readiness, verification-grouping seam); its evidence and limitations are in
[docs/verification/R1_AMBIENT_CONTINUITY.md](docs/verification/R1_AMBIENT_CONTINUITY.md).

## Core doctrine

These five principles govern how work is done, both on Voila and by Voila once it exists.

1. **Delegate work, retain the thread.** A primary steward retains accountability for intent,
   accepted decisions, current state, delegation, integration, evidence, risks, completion claims,
   and the next justified action. Specialists and models may change; accountability does not move.
   It also retains the *thread*: what is being attempted, which worker or process owns each task,
   what actually happened, what came back, and what should happen next. The developer is not the
   scheduler, the message bus, or the state repair mechanism.
2. **Evidence before completion.** Changing files does not prove work is done. Meaningful work
   normally requires tests, behavior demonstrations, relevant docs, explicit risks and limits,
   reproducible verification receipts, and appropriate Git delivery boundaries.
3. **Quiet autonomy, visible decisions.** Proceed without interruption on low-risk, reversible,
   in-plan actions with sufficient context. Surface material decisions, meaningful failures,
   direction changes, unresolved disagreements, scope growth, destructive actions, external
   effects, and approval boundaries.
4. **Progressive rigor.** Match ceremony to the work. Rigor levels: Research, Sketch, Build,
   Harden, Release. A quick personal utility must not carry release-grade overhead.
5. **No managing the manager.** Every capability must help the Steward use AI to complete accepted
   work with *less* developer coordination. A capability fails this gate if it makes the developer
   manage routine state freshness, understand internal schemas, route every task by hand, check
   whether workers settled, carry results between models, repeatedly say "continue", repair normal
   execution state, approve reversible in-plan work, or operate evidence infrastructure during
   ordinary development. This applies retroactively: a shipped capability that fails it is a defect,
   not a feature to defend.

## How to work in this repository

- **Docs are the source of truth.** Decisions, risks, claims, and state live in human-readable
  files, not only in model context. Update the relevant `docs/` file when a decision changes.
- **Keep documents internally consistent.** If a change contradicts an existing document, reconcile
  both in the same change or record the disagreement in
  [docs/project/PROJECT_LEDGER.md](docs/project/PROJECT_LEDGER.md).
- **Separate decisions from open questions.** Do not present an unresolved question as a decision,
  or manufacture a decision to fill a template.
- **Cite evidence for factual Pi claims.** When asserting what Pi can or cannot do, cite a source:
  a doc path and Pi version, a source file, or a reproducible command. Distinguish verified facts
  from inference.
- **Convert relative dates to absolute** when recording anything durable.

## Reference handling

- **Do not vendor** the Pi source or any reference setup into this repository.
- Clone research copies **outside** the tracked tree (a scratch directory) or into a clearly
  ignored `research/` directory.
- **Check licenses before proposing any code reuse.** As of the Phase 0 audit,
  `davis7dotsh/my-pi-setup` ships **no license file** (all rights reserved) and its README
  discourages copying. Treat it as conceptual inspiration only and reimplement independently.
- For each borrowed idea, classify it: conceptual inspiration, API-usage pattern, reusable code
  (only with a compatible license), code requiring attribution, or reimplement-independently.
- Do not assume an official Pi example is production-ready merely because it exists.

## Environment and safety

- **Do not install global software** as a side effect of ordinary work. Prefer project-scoped
  tooling. (Installing the Pi CLI is a deliberate, plan-gated step, not incidental setup.)
- Do not access production services. Do not request, create, expose, or move secrets.
- Do not create remote repositories, push, create or mutate pull requests, create or push tags, or
  publish packages without the exact accepted authority for that effect.
- Humans may create local commits. The current Steward still does not stage or commit; G0 may change
  that only after its deterministic executor and acceptance gate are implemented and accepted.
- Make reversible assumptions when reasonable and record them. Ask only when genuinely blocked.
- Destructive or hard-to-reverse actions (deletes, overwrites, external effects) require
  confirmation unless durably authorized.

### External-effects policy

Out-of-repository machine changes (installing/removing global software, package managers, runtimes,
services, LaunchAgents, credentials, or anything outside the repo tree) must be explicitly
authorized, **listed separately** from repository changes (in the ledger and in packet reports), and
**excluded from project completion claims** unless they are an accepted part of the current phase.
Repository completion claims cover only what is in the repository and verified there.

## Verification norms

- State outcomes faithfully. If tests fail, say so with output. If a step was skipped, say so.
- A completion claim must name its evidence. Prefer reproducible receipts (command, environment,
  version, result, output location).
- Do not present passing tests as proving more than they test.

## Git norms

- Work on a branch off `main` for non-trivial changes; do not commit directly to `main` unless the
  change is a small, obviously-correct docs update during Phase 0.
- Suggest commits at coherent checkpoints, not after every edit.
- Commit messages: imperative subject, body explaining why. Co-authorship trailer per harness
  convention.

## User-run command presentation

- Whenever the developer must accept, confirm, revise, reject, authorize, or otherwise cross a
  review boundary, include the exact paste-safe command they should run when such a command exists.
  If the boundary is conversational rather than executable, say so explicitly and provide the exact
  reply text that will express the choice.
- Put commands intended for the developer to copy and run in fenced `bash` blocks; keep explanations,
  prompts, and output outside those blocks.
- Write every executable command on one physical source line. Never use backslash-newline
  continuation in a recommended command; TUI copy can turn wrapped whitespace into shell arguments.
- For multi-step instructions, use one complete command per line in execution order.
- If truly multi-line input is unavoidable, use a complete self-contained paste-safe script block and
  state outside it exactly what the script changes.
- Under the current pre-G1 capability, when opening a pull request is the next owner action, inspect the remote host and relevant CLI availability, then include the host-specific paste-safe command rather than stopping at prose. For GitHub with `gh` available, use one physical-line command with actual values: `gh pr create --base '<base>' --head '<branch>' --title '<intent-based title>' --body '<concise summary and evidence>'`. Never run it or assume authentication; if prerequisites are missing, state them and provide the exact compare/new-PR URL fallback.

## Toolchain (pinned)

- Runtime is managed by **mise** (`mise.toml` pins Node `22.23.1`). Run project commands through it,
  e.g. `mise exec -- npm run verify`.
- Pi is installed **project-locally** at `@earendil-works/pi-coding-agent@0.82.0` (a devDependency),
  not globally. Dev tools: TypeScript `7.0.2`, `@types/node` `22.20.1`, prettier `3.9.6`,
  typebox `1.1.38`. Exact versions are locked in `package-lock.json`.
