# Project Ledger

Manual project ledger for the NewFang bootstrap period. This is a **precursor** to NewFang-managed
state; its format is intentionally provisional and must not be treated as the permanent runtime
schema (that is a Phase 2 prototype decision). Update this file by hand until NewFang manages it.

- **Maintained by**: bootstrap (Claude-driven) until the self-hosting gate.
- **Last updated**: 2026-07-24.

## Objective

Build NewFang: a personal development operating system on the Pi coding-agent harness that maintains
ownership from intent through implementation, verification, and delivery. Canonical direction:
[../product/PRODUCT_DIRECTION.md](../product/PRODUCT_DIRECTION.md).

## Current phase

Phase 0 complete; Packets 1 and 2 complete. **Packet 2.5 (operational polish + Steward Console) —
complete** as of 2026-07-24: focus semantics replace the ambiguous "active item", next-action
rationale is canonical, lifecycle update tools exist for decisions/assumptions/risks, and
`/newfang home` opens a keyboard-first Pi-native Steward Console. 95/95 tests pass. Interactive TUI
verification is **pending Joshua's checklist run** (Claude has no TTY). Next: **Phase 3 —
planning-document intake and repository orientation** (dogfooded backlog item NF-2).

### State-of-record note (dual state during transition)

`.newfang/` is now NewFang's **runtime operational state** (authoritative `project.json`: backlog,
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
| D7 | Canonical state lives in `.newfang/` (project.json authoritative, events.jsonl append-only, receipts/, generated views/PROJECT_STATUS.md); session entries are a non-authoritative cache; canonical loads first on resume; writes atomic. | [0003 (amended)](../decisions/0003-authoritative-state-is-human-readable-ledger.md) |
| D8 | Thin Pi adapter (`.pi/extensions/newfang.ts`); production logic in modular, package-ready `src/`. | [0007](../decisions/0007-thin-adapter-modular-src.md) |
| D9 | Pinned foundation: `@earendil-works/pi-coding-agent@0.82.0` (engines node >=22.19.0), Node `22.23.1`. | [0001 (amended)](../decisions/0001-adopt-pi-as-harness-foundation.md) |
| D10 | Completion gate = rejecting the explicit `newfang_complete_work_item` state transition unless a required receipt passes; NewFang guarantees `project.json`, not model prose. | Packet 1 A3 |
| D11 | Approval bundles use a proactive execution contract (declare phase + operation classes up front; enforce by interception; expire at boundary). Delegation is NOT required for the first self-hosting transition. | [self-hosting plan](../plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md), Packet 1 A4/A5 |
| D12 | Focus is a pointer, not a status: `focusWorkItemId` names the item receiving attention and is independent of `in_progress`. Schema v2 was amended in place (not v3) because v2 was unmerged. | Packet 2.5 A1 |
| D13 | Steward Console = focus-first Delivery Desk hybrid (Focus Board primacy, Delivery Desk organization, Radar ideas folded into Attention/Work). Proof/Delivery rail is a reserved, unimplemented insertion point. | [design](../design/STEWARD_CONSOLE.md) |

## Assumptions (reversible unless noted)

- A1: Pi will be installed before Phase 1; it is **not** installed at Phase 0. (See "Blockers/notes".)
- A2: Pi surfaces NewFang uses are documented for `0.80.3` and must be verified against the pinned
  `0.82.0`; no claim of stability across arbitrary versions (version-sensitive). (Corrected, Packet 1
  A6.)
- A3: Initial target is a single macOS/Apple Silicon machine; remote execution deferred.
- A4: A model provider is configured manually by Joshua via `/login`; NewFang never does this. Not
  required for Packet 1's non-model paths.
- A5: `docs/project/PROJECT_LEDGER.md` is the hand-maintained bootstrap ledger; the runtime canonical
  store is `.newfang/` (locked, ADR-0003 amended). (Resolves former Q1.)

## Open questions (not decisions)

- Q1: RESOLVED (Packet 1 A1/ADR-0003): canonical state is `.newfang/` with locked responsibilities.
- Q2: Is subprocess subagent delegation reliable enough for one task? Prototype in Phase 5. Note:
  delegation is NOT required for the first self-hosting transition (Packet 1 A5); direct execution is
  a first-class path.
- Q3: Minimal home-view composition (which modules, what density). Resolve in Phase 1–3 prototype.
- Q4: Whether NewFang needs a custom question tool or the native `ask_question` suffices. Resolve
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
- R6: Single-writer assumption for `.newfang/` — concurrent writers could race. Mitigation: atomic
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

## Work completed

- W1 (2026-07-24): Removed two third-party agent tools per user request — `omp`
  (`can1357/tap`, Homebrew) and `openclaw` (npm global + LaunchAgent `ai.openclaw.gateway`). Service
  stopped and disabled; packages uninstalled; data dirs (`~/.omp`, `~/.openclaw`, `~/.cache/omp`)
  moved to Trash (reversible, not hard-deleted). `libomp` left intact. Leftovers (harmless): empty
  `can1357/tap` Homebrew tap; a 24 MB regenerable bun cache of Pi packages.
- W2 (2026-07-24): Phase 0 bootstrap — repository initialized; product direction preserved; Pi and
  Ben audits, capability matrix, architecture options + recommendation, MVP vertical slice,
  self-hosting project, phased plan, this ledger, and ADRs 0001–0006 authored.
- W3 (2026-07-24): Packet 1 Part A — locked canonical `.newfang/` state model (ADR-0003 amended);
  added ADR-0007 (thin adapter + modular `src/`); pinned foundation (ADR-0001 amended, D9); corrected
  completion-gate to a state-transition rejection (A3); corrected approval bundles to a proactive
  execution contract and made delegation non-blocking for self-hosting (A4/A5); replaced
  broad-stability version language with version-sensitive language (A6); added an external-effects
  policy to AGENTS.md (A7). Committed as `docs: establish NewFang product and architecture baseline`.
- W4 (2026-07-24): Packet 1 Part B–E — pinned Node `22.23.1` (`mise.toml`) and installed
  `@earendil-works/pi-coding-agent@0.82.0` project-locally; built the thin adapter
  (`.pi/extensions/newfang.ts`) + modular `src/` (domain, state store, commands, ui, extension) +
  `/newfang init|status|doctor` + minimal home view; 31 unit/integration tests pass; smoke-verified
  through real Pi RPC (init/status/doctor + restart persistence); wrote `docs/DEVELOPMENT.md` and the
  verification record. Fixed a doctor Pi-version resolver that failed under Pi's jiti loader.
- W6 (2026-07-24): Packet 2.5 — renamed `activeWorkItemId` -> `focusWorkItemId` with focus/status
  separation; added canonical `nextActionRationale`; added `newfang_set_focus` + `/newfang focus`;
  added typed lifecycle update tools (`newfang_update_decision|assumption|risk`) with transition
  matrices, supersession-cycle rejection, and close-requires-resolution; designed and built the
  Steward Console (`/newfang home`) with pure model/layout/render/navigation layers, three views,
  detail views, help, reload, and wide/standard/compact layouts using Pi theme tokens; reshaped the
  ambient widget; reseeded dogfooded state honestly (NF-1 stays `in_progress`; nothing completed).
  95/95 tests pass; two real rendering defects were caught by tests and fixed. Interactive TUI check
  is pending ([record](../verification/PACKET_2_5_STEWARD_CONSOLE.md)).
- W5 (2026-07-24): Packet 2 — refactored `updateState` to an immutable reducer contract; added schema
  v2 + explicit 1→2 migration (backup, atomic replace, `/newfang migrate [--apply]`); added the
  compact project-operations model (work items, decisions, assumptions, risks) with `NF/DEC/ASM/RSK`
  IDs, dependency/cycle validation, and completion protection; added 7 Pi tools and
  `/newfang backlog|decisions|assumptions|risks|migrate`; extended doctor with integrity checks;
  added minimal GitHub CI (`.github/workflows/ci.yml`); added `typebox@1.1.38`; dogfooded the repo's
  own `.newfang/` state (7 items, 5 decisions, 4 risks, 2 assumptions). 59/59 tests pass; smoke +
  verification record ([../verification/PACKET_2_PROJECT_OPERATIONS.md](../verification/PACKET_2_PROJECT_OPERATIONS.md)).

## Blockers / notes

- B1: **Pi is not installed.** The only Pi copies on the machine were bundled inside `omp`/`openclaw`,
  which were removed at the user's request (W1). Phase 1 must install Pi
  (`@earendil-works/pi-coding-agent`) before any runtime work. Not a Phase 0 blocker (Phase 0 is
  docs only).
- B2: Several authenticated MCP servers and connectors are unauthenticated in this environment;
  irrelevant to Phase 0.

## Next justified action

Packet 2.5 is complete (committed on `feat/project-operations`; not pushed). Two follow-ups, in
order:

1. **Joshua**: run the interactive TUI checklist in
   [../verification/PACKET_2_5_STEWARD_CONSOLE.md](../verification/PACKET_2_5_STEWARD_CONSOLE.md)
   (`mise exec -- npm run pi`, then `/newfang home`) and record the result. This is the only
   outstanding verification for this packet.
2. Begin **Phase 3 — planning-document intake and repository orientation** (dogfooded item **NF-2**):
   preserve a source planning document, classify its contents, produce an understanding check, and
   surface the next action. Do not yet add claims, verification receipts, completion gates,
   delegation, or approvals.
