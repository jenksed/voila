# Project Ledger

Manual project ledger for the Voila bootstrap period. This is a **precursor** to Voila-managed
state; its format is intentionally provisional and must not be treated as the permanent runtime
schema (that is a Phase 2 prototype decision). Update this file by hand until Voila manages it.

- **Maintained by**: bootstrap (Claude-driven) until the self-hosting gate.
- **Last updated**: 2026-07-26.

## Objective

Build Voila: a **project-aware agentic development environment** on the Pi coding-agent harness,
whose **Project Steward** keeps models, agents, tools, terminals, and handoffs aligned with durable
project intent, coordinates their work, preserves continuity, and quietly assembles the evidence
needed to justify delivery. Authoritative direction:
[../product/PROJECT_STEWARD_DOCTRINE.md](../product/PROJECT_STEWARD_DOCTRINE.md); active roadmap:
[../plans/PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md).

> **Objective restated 2026-07-26** by
> [ADR-0009](../decisions/0009-project-steward-operational-realignment.md) / DEC-18. It previously
> read "a personal development operating system... that maintains ownership from intent through
> implementation, verification, and delivery," pointing at the v0.1
> [PRODUCT_DIRECTION.md](../product/PRODUCT_DIRECTION.md). Ownership was never the wrong idea; the
> gap was coordination. The phases recorded below are the accurate history of how the foundation was
> built and are not restated.

## Current phase

**R0 complete (2026-07-26); R1 next.** The roadmap below is superseded from Phase 5 onward — see
[../plans/PROJECT_REALIGNMENT_PLAN.md](../plans/PROJECT_REALIGNMENT_PLAN.md). Canonical state now
carries R1–R7 as NF-9..NF-15, focused on NF-9. The packet history that follows is retained as an
accurate record of how the foundation was built.

Phase 0 and Packets 1, 2, 2.5, 3 complete. **Packet 4 (claims, verification receipts, protected
completion) — complete** as of 2026-07-25 on `feat/proof-engine` (not pushed): schema v4 with an
explicit `3 → 4` migration; claims bound to exact acceptance-criterion text with no support flag;
executable verification with no shell, recorded as immutable receipts with atomic promotion; a
deterministic repository fingerprint driving evidence freshness; and `voila_complete_work_item` as
the only path to `completed`, reporting every failing gate. 360/360 tests pass.

**Voila can now mark work complete — and refuses to.** On this repository NF-3's proof gates all
pass (CLM-1 supported by RCP-2), yet completion is correctly refused because NF-2 is not complete.
**Zero work items are marked completed.**

**Packet 3 (planning intake, repository orientation, Steward context) — complete** as of 2026-07-25:
schema v3 with an explicit `2 → 3` migration; exact source preservation with SHA-256 and path-safety;
structured drafts with mandatory provenance and explicit model-inference marking; an Understanding
Check reviewed before anything is applied; idempotent, duplicate-safe apply; a generated project
brief; bounded orientation with staleness detection; a real Project Steward Pi skill; and compact
automatic context injection. 173/173 tests pass.

**Packet 3 closure corrections applied** (2026-07-25): command evidence is described honestly
(`CommandFinding` with an explicit basis; nothing is called "verified"), and intake draft/review history
is durable (numbered revisions that are never overwritten, plus an append-only `reviews.jsonl`).
191/191 tests pass.

**Three gates remain, all requiring Joshua**: (1) the interactive Steward Console check, (2) the
authenticated Project Steward acceptance run, and (3) GitHub CI — `origin/main` is still at Packet 1
and nothing has been pushed. Daily-use readiness is **not** claimed until all three pass and Packet 3
is integrated over `main`.

### State-of-record note (dual state during transition)

`.voila/` is now Voila's **runtime operational state** (authoritative `project.json`: backlog,
decisions, assumptions, risks). This hand-maintained Markdown ledger remains the **bootstrap and
narrative record** — packet history, evidence, and durable rationale — until a later consolidation
decision reconciles the two. Neither silently overwrites the other.

## Accepted decisions

| ID | Decision | ADR |
|----|----------|-----|
| D1 | Foundation is Pi (`@earendil-works/pi-coding-agent`); do not fork or vendor it. | [0001](../decisions/0001-adopt-pi-as-harness-foundation.md) |
| D2 | Start as project-local Pi extensions; package second; SDK/RPC held in reserve. | [0002](../decisions/0002-extensions-first-architecture.md) |
| D3 | Authoritative project state is a repo-visible human-readable ledger; repo wins over session on conflict. | [0003](../decisions/0003-authoritative-state-is-human-readable-ledger.md) |
| D4 | Do not vendor or reuse reference-repo code; reimplement independently (Ben's setup has no license). | [0004](../decisions/0004-no-vendoring-of-reference-repositories.md) |
| D5 | Roles are product concepts / skills / prompt templates in the MVP, not runtime agents. | [0005](../decisions/0005-roles-as-skills-not-runtime-agents.md) |
| D6 | Sandboxing is optional and off by default; not an MVP prerequisite. | [0006](../decisions/0006-sandboxing-optional-not-mvp-prerequisite.md) |
| D7 | Canonical state lives in `.voila/` (project.json authoritative, events.jsonl append-only, receipts/, generated views/PROJECT_STATUS.md); session entries are a non-authoritative cache; canonical loads first on resume; writes atomic. | [0003 (amended)](../decisions/0003-authoritative-state-is-human-readable-ledger.md) |
| D8 | Thin Pi adapter (`.pi/extensions/voila.ts`); production logic in modular, package-ready `src/`. | [0007](../decisions/0007-thin-adapter-modular-src.md) |
| D9 | Pinned foundation: `@earendil-works/pi-coding-agent@0.82.0` (engines node >=22.19.0), Node `22.23.1`. | [0001 (amended)](../decisions/0001-adopt-pi-as-harness-foundation.md) |
| D10 | Completion gate = rejecting the explicit `voila_complete_work_item` state transition unless a required receipt passes; Voila guarantees `project.json`, not model prose. | Packet 1 A3 |
| D11 | Approval bundles use a proactive execution contract (declare phase + operation classes up front; enforce by interception; expire at boundary). Delegation is NOT required for the first self-hosting transition. | [self-hosting plan](../plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md), Packet 1 A4/A5 |
| D12 | Focus is a pointer, not a status: `focusWorkItemId` names the item receiving attention and is independent of `in_progress`. Schema v2 was amended in place (not v3) because v2 was unmerged. | Packet 2.5 A1 |
| D13 | Steward Console = focus-first Delivery Desk hybrid (Focus Board primacy, Delivery Desk organization, Radar ideas folded into Attention/Work). Proof/Delivery rail is a reserved, unimplemented insertion point. | [design](../design/STEWARD_CONSOLE.md) |
| D14 | The model interprets; Voila enforces; the user accepts. Interpretation is never applied to canonical truth without explicit review and confirmation. | [intake design](../design/PLANNING_INTAKE.md), DEC-7/DEC-8 |
| D15 | Intake sources are preserved byte-for-byte with SHA-256 in `.voila/intakes/<id>/source.md`, written once; a revised interpretation is a new draft revision, never a source edit. | [intake design](../design/PLANNING_INTAKE.md) |
| D16 | Only explicit `proposedWorkItems` become work items; requirements do not auto-convert. Exact duplicates are skipped, likely duplicates are surfaced, never merged. | [intake design](../design/PLANNING_INTAKE.md) |
| D17 | Orientation is a bounded, provenance-backed snapshot; staleness fires on HEAD movement, instruction-file change, or explicit refresh — never on a dirty worktree. | [orientation design](../design/REPOSITORY_ORIENTATION.md) |
| D18 | Commands are recorded as findings with an explicit basis (`declared_in_documentation` / `observed_in_session` / `candidate`); `observedResult` requires actual execution, and nothing is labeled "verified" until Phase 4 receipts exist. | [orientation design](../design/REPOSITORY_ORIENTATION.md) |
| D19 | Every intake draft revision and Understanding Check is retained (numbered, never overwritten), and review decisions live in an append-only `reviews.jsonl` holding only narrow user-visible fields. | [intake design](../design/PLANNING_INTAKE.md) |
| D20 | Claim support is **derived, never stored**: there is no `supported` flag on the record and no tool parameter that sets one. Status is recomputed on every read from receipts plus the current repository fingerprint. | [proof design](../design/PROOF_ENGINE.md) |
| D21 | A claim's `coveredAcceptanceCriteria` must match the work item's criterion text **exactly**; paraphrases are refused. A claim cannot invent a criterion. | [proof design](../design/PROOF_ENGINE.md) |
| D22 | Verification takes a structured `executable` + `args` and runs with `shell: false`. A single arbitrary shell string is refused. **Tool success means the receipt was recorded, not that verification passed.** Execution is bounded but **not sandboxed**. | [proof design](../design/PROOF_ENGINE.md) |
| D23 | The repository fingerprint **excludes everything under `.voila/`**, so creating a receipt cannot invalidate its own fingerprint. Accepted cost: a change confined to `.voila/` does not invalidate evidence. | [proof design](../design/PROOF_ENGINE.md) |
| D24 | Receipt artifacts are written to a Voila-owned staging directory and **atomically promoted**, then linked canonically — so a failed canonical update never leaves a linked partial receipt. Artifacts are immutable and never overwritten. | [proof design](../design/PROOF_ENGINE.md) |
| D25 | Captured output has machine-specific prefixes normalized (`repository root → <repo>`, `home → ~`) before hashing, so committed receipts leak no username and stay portable. Recorded in the manifest as `pathsNormalized`. | Packet 4 A3 (defect found by dogfooding) |
| D26 | `voila_complete_work_item` is the only path to `completed` and reports **every** failing gate, not the first. A rejection leaves canonical bytes byte-identical with no event appended. The guarantee covers Voila's state transition only — not model prose, and not a hand-edited `project.json`. | [proof design](../design/PROOF_ENGINE.md) |
| D27 | Completed work whose current evidence no longer revalidates is reported by doctor as a **WARNING**, never reverted. Silently un-completing work would be worse than a stale record. | [proof design](../design/PROOF_ENGINE.md) |

## Assumptions (reversible unless noted)

- A1: Pi will be installed before Phase 1; it is **not** installed at Phase 0. (See "Blockers/notes".)
- A2: Pi surfaces Voila uses are documented for `0.80.3` and must be verified against the pinned
  `0.82.0`; no claim of stability across arbitrary versions (version-sensitive). (Corrected, Packet 1
  A6.)
- A3: Initial target is a single macOS/Apple Silicon machine; remote execution deferred.
- A4: A model provider is configured manually by Joshua via `/login`; Voila never does this. Not
  required for Packet 1's non-model paths.
- A5: `docs/project/PROJECT_LEDGER.md` is the hand-maintained bootstrap ledger; the runtime canonical
  store is `.voila/` (locked, ADR-0003 amended). (Resolves former Q1.)

## Open questions (not decisions)

- Q1: RESOLVED (Packet 1 A1/ADR-0003): canonical state is `.voila/` with locked responsibilities.
- Q2: Is subprocess subagent delegation reliable enough for one task? Prototype in Phase 5. Note:
  delegation is NOT required for the first self-hosting transition (Packet 1 A5); direct execution is
  a first-class path.
- Q3: Minimal home-view composition (which modules, what density). Resolve in Phase 1–3 prototype.
- Q4: Whether Voila needs a custom question tool or the native `ask_question` suffices. Resolve
  after checking the installed `ask_question` shape.
- Q5: Model-routing table and cost-visibility module design. Deferred (post-MVP).

## Risks

- R1: Pi churn during the `0.8x` series. Mitigation: pin peers, adapter boundaries, repo-authoritative
  state.
- R2: State-reconciliation complexity (repo vs session). Mitigation: repo authoritative + deterministic
  reconciliation tests.
- R3: Terminal UI overload. Mitigation: minimal home view first, progressive modules.
- R4: Delegation unreliability. Mitigation: start with one bounded task; fall back to direct execution.
- R5: Scope creep into project-management ceremony. Mitigation: progressive rigor + MVP non-goals.
- R6: Single-writer assumption for `.voila/` — concurrent writers could race. Mitigation: atomic
  temp+rename writes now; add locking before any multi-writer/background execution.
- R7: Pi loads extensions via jiti, where `require.resolve`/`import.meta` behavior differs from plain
  Node. Mitigation: filesystem-walk version resolution (fixed in W4); prefer fs-based resolution over
  `require.resolve` in the adapter.

## Evidence (Phase 0)

- E1: Pi capability audit against local `0.80.3` docs/examples —
  [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md).
- E2: Ben setup audit at commit `21f40f4` (no license present) —
  [../research/BEN_SETUP_AUDIT.md](../research/BEN_SETUP_AUDIT.md).
- E3: Latest Pi version `0.82.0` (npm `latest`), `legacy-node20 = 0.74.2` — checked 2026-07-24.
- E4: Environment inventory (Node/npm/pnpm/bun/deno/TS/git) — recorded in Packet 0 final report.
- E5: Packet 1 foundation verification record (versions, 31/31 tests, headless smoke through real Pi
  0.82.0, restart persistence) — [../verification/PACKET_1_FOUNDATION.md](../verification/PACKET_1_FOUNDATION.md).
- E6: Packet 3 record (173/173 tests, v3 migration cases, dogfooded INT-1/ORI-1 with no duplication,
  non-model Pi integration; interactive + authenticated tiers pending) —
  [../verification/PACKET_3_INTAKE_ORIENTATION.md](../verification/PACKET_3_INTAKE_ORIENTATION.md).
- E7: Packet 4 record (360/360 tests, v4 migration cases, real command execution against temp git
  repos, `mise exec -- npm run verify` recorded as RCP-1/RCP-2, staleness demonstrated and reversed on
  real state, protected completion demonstrated in a fixture and correctly refused on NF-3; interactive
  Proof view + authenticated tiers pending) —
  [../verification/PACKET_4_PROOF_ENGINE.md](../verification/PACKET_4_PROOF_ENGINE.md).

## Work completed

- W9 (2026-07-25): Packet 4 — the **proof engine**. Added schema v4 (`claims`, `receipts`,
  `sequences.claim`/`sequences.receipt`, `workItems[].requiredClaimIds`) with an explicit `3 → 4`
  migration chaining `1 → 2 → 3 → 4`, a read-only `schema-v3.ts` source validator, and
  `requiredClaimIds: []` defaults so migration invents no proof. Built the pure proof domain (claims
  with exact criterion matching, derived four-state evaluation, criterion coverage, and an eleven-gate
  completion assessment that reports every failure); the repository fingerprint (git HEAD + tracked
  diff + staged diff + sorted untracked hashes, excluding `.voila/`); receipt execution and
  immutable artifacts (`shell: false`, bounded timeout, ANSI stripping, path normalization, 64 KiB
  per-stream caps, sha256 manifests, staging + atomic promotion, link only after the artifact exists);
  8 Pi tools (27 total); `/voila claims|proof|verify|complete`; the Proof console view as the third
  principal view with claim/receipt/gate detail views; one compact widget warning; proof-aware context
  injection and Steward skill; and 14 new read-only doctor diagnostics. 360/360 tests pass (169 new).
  Two real defects were caught by the new tests and fixed: the receipt counter never advanced, and
  captured output leaked an absolute home path (found by the dogfooding guard, fixed by path
  normalization — D25). Dogfooded honestly: state migrated to v4 with a backup and one event; CLM-1
  recorded on NF-3 with four limitations and supported by RCP-2 (RCP-1 preserved as genuine evidence
  of a failing run); staleness demonstrated and reversed on real state; protected completion
  demonstrated end-to-end in a temporary fixture. **NF-3 is correctly refused because NF-2 is not
  complete, and nothing in this repository is marked completed.**
  ([record](../verification/PACKET_4_PROOF_ENGINE.md))
- W1 (2026-07-24): Removed two third-party agent tools per user request — `omp`
  (`can1357/tap`, Homebrew) and `openclaw` (npm global + LaunchAgent `ai.openclaw.gateway`). Service
  stopped and disabled; packages uninstalled; data dirs (`~/.omp`, `~/.openclaw`, `~/.cache/omp`)
  moved to Trash (reversible, not hard-deleted). `libomp` left intact. Leftovers (harmless): empty
  `can1357/tap` Homebrew tap; a 24 MB regenerable bun cache of Pi packages.
- W2 (2026-07-24): Phase 0 bootstrap — repository initialized; product direction preserved; Pi and
  Ben audits, capability matrix, architecture options + recommendation, MVP vertical slice,
  self-hosting project, phased plan, this ledger, and ADRs 0001–0006 authored.
- W3 (2026-07-24): Packet 1 Part A — locked canonical `.voila/` state model (ADR-0003 amended);
  added ADR-0007 (thin adapter + modular `src/`); pinned foundation (ADR-0001 amended, D9); corrected
  completion-gate to a state-transition rejection (A3); corrected approval bundles to a proactive
  execution contract and made delegation non-blocking for self-hosting (A4/A5); replaced
  broad-stability version language with version-sensitive language (A6); added an external-effects
  policy to AGENTS.md (A7). Committed as `docs: establish Voila product and architecture baseline`.
- W4 (2026-07-24): Packet 1 Part B–E — pinned Node `22.23.1` (`mise.toml`) and installed
  `@earendil-works/pi-coding-agent@0.82.0` project-locally; built the thin adapter
  (`.pi/extensions/voila.ts`) + modular `src/` (domain, state store, commands, ui, extension) +
  `/voila init|status|doctor` + minimal home view; 31 unit/integration tests pass; smoke-verified
  through real Pi RPC (init/status/doctor + restart persistence); wrote `docs/DEVELOPMENT.md` and the
  verification record. Fixed a doctor Pi-version resolver that failed under Pi's jiti loader.
- W8 (2026-07-25): Packet 3 closure — replaced `verifiedCommands`/`candidateCommands` with
  `CommandFinding {command, basis, observedResult?, evidenceNote?}` across types, validation, tools,
  generated orientation, skill, playbook, docs, and the dogfooded ORI-1 artifact; `observedResult` is
  rejected unless the command was actually executed, documented commands require provenance, and no
  surface calls a command "verified". Moved intake artifacts to `drafts/NNNN.json` +
  `understandings/NNNN.md` + append-only `reviews.jsonl`, added `manifest.currentDraftRevision` and
  canonical `acceptedDraftRevision`, and extended doctor with revision/review integrity checks.
  Migrated INT-1 into the new layout with the one accepted review record that actually occurred (no
  fabricated revision request). 191/191 tests pass.
- W7 (2026-07-25): Packet 3 — added schema v3 (`intakes`, `orientations`, current pointers, INT/ORI
  sequences) with an explicit `2 → 3` migration (chaining `1 → 2 → 3` when needed); built source
  preservation with SHA-256 and path-safety (absolute/traversal/symlink-escape rejection); the intake
  draft model (12 categories, mandatory provenance, explicit model inferences, conflicts, proposed
  work); review-gated, idempotent, duplicate-safe apply; generated `UNDERSTANDING.md` and
  `PROJECT_BRIEF.md`; bounded orientation with staleness; 8 new Pi tools (19 total); `/voila intake
  |orient|brief`; the Understanding Check in the Steward Console; a real Project Steward skill with an
  orientation playbook; `before_agent_start` context injection; doctor v3 checks. Dogfooded INT-1 from
  `docs/plans/PHASE_3_INTAKE_BRIEF.md` → DEC-7/8/9, ASM-3, RSK-5, NF-8 with **no duplication** of
  existing truth, plus ORI-1. 173/173 tests pass; three real bugs were caught by tests (v2 load
  reporting the wrong error, a context-clamp off-by-one, a doctor version label).
  ([record](../verification/PACKET_3_INTAKE_ORIENTATION.md))
- W6 (2026-07-24): Packet 2.5 — renamed `activeWorkItemId` -> `focusWorkItemId` with focus/status
  separation; added canonical `nextActionRationale`; added `voila_set_focus` + `/voila focus`;
  added typed lifecycle update tools (`voila_update_decision|assumption|risk`) with transition
  matrices, supersession-cycle rejection, and close-requires-resolution; designed and built the
  Steward Console (`/voila home`) with pure model/layout/render/navigation layers, three views,
  detail views, help, reload, and wide/standard/compact layouts using Pi theme tokens; reshaped the
  ambient widget; reseeded dogfooded state honestly (NF-1 stays `in_progress`; nothing completed).
  95/95 tests pass; two real rendering defects were caught by tests and fixed. Interactive TUI check
  is pending ([record](../verification/PACKET_2_5_STEWARD_CONSOLE.md)).
- W5 (2026-07-24): Packet 2 — refactored `updateState` to an immutable reducer contract; added schema
  v2 + explicit 1→2 migration (backup, atomic replace, `/voila migrate [--apply]`); added the
  compact project-operations model (work items, decisions, assumptions, risks) with `NF/DEC/ASM/RSK`
  IDs, dependency/cycle validation, and completion protection; added 7 Pi tools and
  `/voila backlog|decisions|assumptions|risks|migrate`; extended doctor with integrity checks;
  added minimal GitHub CI (`.github/workflows/ci.yml`); added `typebox@1.1.38`; dogfooded the repo's
  own `.voila/` state (7 items, 5 decisions, 4 risks, 2 assumptions). 59/59 tests pass; smoke +
  verification record ([../verification/PACKET_2_PROJECT_OPERATIONS.md](../verification/PACKET_2_PROJECT_OPERATIONS.md)).

## Blockers / notes

- B1: **Pi is not installed.** The only Pi copies on the machine were bundled inside `omp`/`openclaw`,
  which were removed at the user's request (W1). Phase 1 must install Pi
  (`@earendil-works/pi-coding-agent`) before any runtime work. Not a Phase 0 blocker (Phase 0 is
  docs only).
- B2: Several authenticated MCP servers and connectors are unauthenticated in this environment;
  irrelevant to Phase 0.

## Next justified action

Packet 4 is committed on `feat/proof-engine` (not pushed). Because a commit moves `HEAD`, the
receipts committed with it read `stale` immediately afterwards — by design. The first action is
therefore to **re-run `/voila verify CLM-1 -- mise exec -- npm run verify`** on the committed tree
so CLM-1 has current evidence again.

The rest of the queue is unchanged and still gated on Joshua — Packet 4 did not remove any of it:

1. **Joshua — interactive Steward Console check** on `feat/project-operations` (12-item checklist in
   [../verification/PACKET_2_5_STEWARD_CONSOLE.md](../verification/PACKET_2_5_STEWARD_CONSOLE.md) and
   the Packet 3 record). Report the observed result so it can be recorded honestly.
2. **Push and integrate Packet 2/2.5**: `git push -u origin feat/project-operations`, open a PR to
   `main`, wait for **GitHub CI** (its first ever run), then merge with a **merge commit** (not squash —
   `feat/intake-orientation` is stacked on that history).
3. **Rebase Packet 3** onto the updated `main` and re-run `mise exec -- npm run verify`.
4. **Joshua — authenticated Project Steward acceptance** (`/login`, then the 14-step checklist). This
   run produces the first real draft revision 2 and `revision_requested` review record.
5. Only then may the bounded daily-use claim be made.

Additionally, from Packet 4: the **interactive Proof view check** (tier 6 checklist in the
[Packet 4 record](../verification/PACKET_4_PROOF_ENGINE.md)) and the **authenticated Steward proof
behavior check** (tier 7). Both need a real terminal and, for tier 7, `/login`.

**NF-3 cannot be completed until NF-2 is**, and NF-2 waits on the authenticated intake acceptance
above. This is the intended behavior of the gate, observed on real state rather than asserted.
