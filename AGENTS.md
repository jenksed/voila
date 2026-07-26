# AGENTS.md

Harness-neutral operating instructions for the Voila repository. Any coding agent (Claude Code,
Pi, or other) working here follows this file. Harness-specific notes may live in sibling files such
as `CLAUDE.md`, but must not duplicate or contradict this one.

## Repository purpose and current phase

Voila is a personal development operating system built on the Pi coding-agent harness. See
[docs/product/PRODUCT_DIRECTION.md](docs/product/PRODUCT_DIRECTION.md) for the canonical product
statement.

Phase 0 (research/architecture) is complete. Through **Packet 3** the repository has a runnable Pi
extension (`.pi/extensions/voila.ts` + modular `src/`) with canonical `.voila/` state (schema v3),
a compact project-operations layer, a Steward Console, and the first daily-use workflow: planning
intake with preserved sources and provenance, repository orientation, a Project Steward skill, and
automatic context injection. Build only what the accepted plan phase calls for; do not add features
outside the current packet's scope. The next phase is **claims, verification receipts, and the
protected completion transition** — Voila cannot yet mark work complete.

## Core doctrine

These four principles govern how work is done, both on Voila and by Voila once it exists.

1. **Delegate work, never ownership.** A primary steward retains accountability for intent,
   accepted decisions, current state, delegation, integration, evidence, risks, completion claims,
   and the next justified action. Specialists and models may change; accountability does not move.
2. **Evidence before completion.** Changing files does not prove work is done. Meaningful work
   normally requires tests, behavior demonstrations, relevant docs, explicit risks and limits,
   reproducible verification receipts, and appropriate Git delivery boundaries.
3. **Quiet autonomy, visible decisions.** Proceed without interruption on low-risk, reversible,
   in-plan actions with sufficient context. Surface material decisions, meaningful failures,
   direction changes, unresolved disagreements, scope growth, destructive actions, external
   effects, and approval boundaries.
4. **Progressive rigor.** Match ceremony to the work. Rigor levels: Research, Sketch, Build,
   Harden, Release. A quick personal utility must not carry release-grade overhead.

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
- Do not create remote repositories, push, or publish packages without explicit approval.
- Local Git initialization and local commits are fine. Pushing is a separate, approval-gated action.
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

## Toolchain (pinned)

- Runtime is managed by **mise** (`mise.toml` pins Node `22.23.1`). Run project commands through it,
  e.g. `mise exec -- npm run verify`.
- Pi is installed **project-locally** at `@earendil-works/pi-coding-agent@0.82.0` (a devDependency),
  not globally. Dev tools: TypeScript `7.0.2`, `@types/node` `22.20.1`, prettier `3.9.6`,
  typebox `1.1.38`. Exact versions are locked in `package-lock.json`.
