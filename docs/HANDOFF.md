# Voila — handoff

Self-contained context for picking this project up cold. Read canonical focus and next action from
`.voila/`; revision numbers deliberately are not pinned here because every supported state transition
increments them.

**Repo:** `git@github.com:jenksed/voila.git`
**Branch:** `docs/operational-roadmap-v2`
**Branch point:** `627a2d8` (`Complete bounded R2 operation visibility (#13)`)
**Focus:** NF-23 — Commit accepted delivery boundaries through a guarded local transaction
**Direction:** DEC-34 makes PR review the routine owner gate; DEC-30 through DEC-32 remain proposed
**Current gate:** bounded G0 implementation; Git writes only in disposable acceptance repositories

---

## 1. Product and authority

Voila is a **project-aware agentic development environment** built on Pi. Its Project Steward keeps
models, agents, tools, terminals, and handoffs aligned with durable project intent, coordinates their
work, preserves continuity, and quietly assembles the evidence needed to justify delivery.

> **Delegate work, retain the thread.**

The developer provides intent, consequential judgment, credentials, and final authority. The Steward
provides coordination, continuity, execution leverage, recovery, and forward motion. Every capability
must pass the **No Managing the Manager gate**.

The model interprets fallibly; Voila owns preservation, schema, review, canonical transitions,
provenance, and protected completion. Never edit `.voila/` by hand.

### Current Git authority

Operational Roadmap v2 describes future guarded capability. It does **not** grant the current Steward
permission to:

- stage or commit;
- push;
- create or mutate pull requests;
- approve or merge;
- create or push tags; or
- publish packages or releases.

G0, G1, and L0.2 may supersede only their named clauses after deterministic executors and acceptance
gates pass. Voila never merges the prerequisite implementation PR.

---

## 2. Active roadmap

Read in this order:

1. [`docs/plans/VOILA_OPERATIONAL_ROADMAP_V2.md`](plans/VOILA_OPERATIONAL_ROADMAP_V2.md) — active
   L0/G0/G1 insertion and refined sequence.
2. [`docs/product/PROJECT_STEWARD_DOCTRINE.md`](product/PROJECT_STEWARD_DOCTRINE.md) — product and
   operating doctrine.
3. [`docs/plans/PROJECT_REALIGNMENT_PLAN.md`](plans/PROJECT_REALIGNMENT_PLAN.md) — retained doctrine
   foundation, completed R1/R2 history, and underlying R3–R7 program.
4. [`docs/decisions/0010-local-distribution-and-safe-publication-sequence.md`](decisions/0010-local-distribution-and-safe-publication-sequence.md)
   — scope of the sequencing supersession and current authority boundary.
5. [`docs/plans/G0_GUARDED_LOCAL_COMMIT.md`](plans/G0_GUARDED_LOCAL_COMMIT.md) — active NF-23
   implementation/acceptance boundary revised under DEC-34.
6. [`docs/plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md`](plans/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md) —
   completed NF-22 packet and accepted evidence boundary.

Sequence:

```text
L0.1  global local-path Pi package
G0    guarded local commits
G1    guarded GitHub publication + bounded publisher proposals
L0.2  separately owner-authorized v0.1.0-alpha.1 Git installation tag
R3-0  delegation suitability and assignment compiler
R3A   read-only Pi child worker
R3B   steering, cancellation, checkpoints, partial-result salvage
R3C   isolated-write worker with parent-controlled integration
R4A–R4C  projection, evaluation/integration, drift/failure recovery
R5    fresh-session continuity
R6    quiet proof reconciliation
R7    uncoached dogfood
```

The milestone remains **Project Steward Operational Loop v1**.

---

## 3. What is built

The durable foundation is real and retained:

- canonical per-project `.voila/` state with explicit migrations (schema v6);
- work items, decisions, assumptions, risks, focus, and next action;
- planning intake with immutable source and human-reviewed application;
- repository orientation with content-based freshness;
- claims, receipts, derived freshness, and protected completion;
- read-only Delivery Engine and commit-boundary suggestions;
- Steward Console, ambient widget, and Project Steward skill;
- R1 focus capsule, action-oriented `Continue.`, quiet development staleness, honest held labels,
  and the verification-grouping seam;
- R2's one per-project supervisor with exactly two fixed operations:
  `r2a.state-store-tests` and `r2b.repository-checks`;
- runtime-backed operation visibility and exactly-once next-turn settlement.

R1 and bounded R2A/R2B are accepted, protected-complete, and merged to `main`. Evidence:

- [`docs/verification/R1_AMBIENT_CONTINUITY.md`](verification/R1_AMBIENT_CONTINUITY.md)
- [`docs/verification/R2A_FINITE_OPERATION.md`](verification/R2A_FINITE_OPERATION.md)
- [`docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md`](verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md)

There is no general terminal, watcher, service, PTY, arbitrary command facility, list/wait/poll tool,
child worker, cross-process adoption, automatic integration, or Git-effect executor.

---

## 4. Current package implementation

The accepted repository layout is now implemented:

| Path | Current role |
| --- | --- |
| `pi-package/extensions/voila.ts` | thin Pi package adapter |
| `pi-package/skills/project-steward/` | package-owned Project Steward skill |
| `src/` | modular domain/state/tools/UI implementation |

`package.json` is the explicit Pi manifest for `0.1.0-alpha.1`; the old `.pi/` auto-discovery paths
are removed. `scripts/install-global.mjs` is legacy-shim cleanup only and refuses installation. The
runtime implementation adds exact compatibility refusal, `/voila version`, package Doctor identity,
a process-global duplicate-registration lease, and one Git-worktree-aware root resolver. Repository,
isolated-package, real user-global, and context-matrix tiers pass; NF-22 completed through the
protected transition. Current observations and limitations are in
[`docs/verification/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md`](verification/L0_1_GLOBAL_LOCAL_PATH_PACKAGE.md).

### Verified Pi 0.82.0 facts

Complete pinned documentation and installed source were inspected on 2026-07-27:

- local-path packages are settings references and are not copied;
- explicit manifest resource paths are package-root-relative;
- package identity deduplication does not equate an independent project-local extension with the
  global package;
- resources deduplicate by canonical path, with project resources taking precedence;
- package skills use ordinary recursive `SKILL.md` discovery;
- Pi/typebox runtime imports belong in peer dependencies, while exact versions stay in development
  dependencies for this repository;
- Git package installs use production dependencies by default;
- Pi package resolution carries canonical source/scope/origin provenance, but Pi 0.82.0 does not
  pass it into the extension factory; acceptance verifies it externally through the resolver.

Canonical ASM-5 is validated against `docs/packages.md`, `docs/extensions.md`, `docs/skills.md`, the
Pi README, examples, and installed package-manager source.

### Material L0 design boundaries

- one canonical package entry point; no project-local duplicate loader;
- startup in an uninitialized project is read-only and shows `/voila init`;
- exact Pi support is `0.82.0`; proposed Node support is `>=22.19.0 <23`;
- unsupported hosts get a minimal truthful compatibility command and no normal tools/events;
- every callback resolves one Git worktree root, including subdirectory startup;
- non-Git directories remain uninitialized/read-only until deliberate init;
- supervisors, subscriptions, capsules, and state are root-bound;
- a reload-safe process-global lease rejects duplicate live registration before partial effects;
- package provenance is visible without persisting private absolute paths.

---

## 5. Acceptance and external effect

The L0.1 packet defines four tiers:

1. **Repository gate:** manifest, one-loader, compatibility, root, isolation, no-startup-write, and
   full verification tests.
2. **Isolated Pi package manager:** install under a temporary `PI_CODING_AGENT_DIR`, prove one
   extension/skill and package provenance, and leave real user settings untouched.
3. **Six-context matrix:** uninitialized Git repo, two initialized repos with different state,
   non-Git directory, malformed/unsupported state, and the Voila repository; include nested cwd and
   a second worktree.
4. **Real user-global install and dogfood:** PASS after explicit owner authorization.

The owner authorized and the Steward executed:

```bash
node scripts/install-global.mjs --remove
mise exec -- npm run pi -- install "$(pwd)"
```

The first removed the detected marker-owned legacy shim; the second installed this checkout as one
user/package source. Real Pi RPC then passed the matrix without `-e`. The settings mutation is listed
separately and excluded from repository-only claims.

---

## 6. Canonical work

Relevant work items:

```text
NF-22 completed    L0.1 global local-path Pi package
NF-23 in_progress  G0 guarded local commits (focus)
NF-24 backlog      G1 guarded GitHub publication
NF-25 backlog      bounded North Mini Code publication proposals
NF-26 backlog      L0.2 owner-authorized v0.1.0-alpha.1 tag
NF-27 backlog      R3-0 assignment compiler
NF-11..NF-15       retained R3–R7 outcomes
```

NF-2 remains honestly held for its authenticated human acceptance tier. Do not select it merely
because its implementation exists.

Canonical risks added by INT-10:

- RSK-10 — package duplicate load / cross-project leakage;
- RSK-11 — partial G0 commit transaction;
- RSK-12 — stale or overbroad G1 external authority;
- RSK-13 — untrusted/single-provider publisher output.

---

## 7. Exact next action

1. Implement the pure PublicationPlan types/compiler/currentness/store and static effect descriptor.
2. Add the closed temporary-index transaction and hook state machine, with real Git effects confined
   to disposable acceptance repositories.
3. Add the plan/apply tools; apply accepts only a plan ID and derives authority from protected
   completion plus accepted publication policy.
4. Run all four G0 acceptance tiers, then request one final capability acceptance for DEC-30/NF-23.

The owner retains the current development-repository commit/push/PR/merge boundary. Do not start G1,
L0.2, or R3 while NF-23 is active.

---

## 8. Gotchas

- Never edit `.voila/` directly; intake INT-10 artifacts and state changes came through supported
  tools.
- Evidence staleness during active development is expected; reconcile at the boundary.
- A passing supervised operation is not a receipt. Only `voila_run_verification` records evidence.
- Only `voila_complete_work_item` completes work.
- `HELD` records an owed tier; do not argue it away with a broader claim.
- The rename guard scans source, docs, manifests, and canonical state but excludes direct captured
  receipt/operation stdout and stderr.
- `.git` may be a file in a secondary worktree; literal-directory checks are insufficient.
- Pi `/reload` emits shutdown before loading a replacement extension instance; duplicate guards must
  release only their own token during shutdown.
- Local-path package installation mutates Pi user settings even though it does not copy this checkout.
- The real user package list now contains this checkout as the accepted L0.1 local-path package; user
  settings remain outside repository evidence and must be re-observed before another settings effect.

---

## 9. Toolchain

- Node `22.23.1` via `mise.toml`;
- Pi `@earendil-works/pi-coding-agent@0.82.0` as an exact development dependency;
- TypeScript `7.0.2`, `@types/node` `22.20.1`, Prettier `3.9.6`, typebox `1.1.38`;
- complete repository gate: `mise exec -- npm run verify`;
- no global software installation as an incidental side effect.
