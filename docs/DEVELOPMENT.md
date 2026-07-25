# NewFang Development

Local setup, pinned versions, commands, tools, schema/migration, the Steward Console, and the smoke
procedure. Through Packet 4 NewFang has a project-operations layer (backlog, decisions, assumptions,
risks) on canonical `.newfang/` state, a Pi-native Steward Console, planning intake and repository
orientation, and the **proof engine**: claims, executable verification receipts, evidence freshness,
and a protected completion transition. This is not the full MVP: there are no approval bundles,
delegation, background processes, sandboxing, or remote execution.

## Pinned runtime and dependencies

| Component | Pinned version | Notes |
|-----------|----------------|-------|
| mise | `2026.7.13` | project runtime manager; pins Node via [`mise.toml`](../mise.toml) |
| Node | `22.23.1` | satisfies Pi engines (`>=22.19.0`); flag-free TS type stripping |
| Pi | `@earendil-works/pi-coding-agent@0.82.0` | devDependency; provides the `pi` CLI |
| TypeScript | `7.0.2` | `tsc --noEmit` only (no build; jiti/Node strip types) |
| @types/node | `22.20.1` | matches the Node 22 runtime |
| prettier | `3.9.6` | formatting |
| typebox | `1.1.38` | schema library used by Pi `registerTool` (matches Pi's bundled version) |

Exact versions are in [`package.json`](../package.json) and locked in `package-lock.json`.

## First-time setup (mise)

```bash
mise install                              # provides Node 22.23.1 per mise.toml
mise exec -- npm install --ignore-scripts # project-local deps (Pi + dev tools); no global installs
mise exec -- npm exec pi -- --version     # -> 0.82.0
```

> If mise is unavailable, provide Node `22.23.1` by any means (nvm, direct install); nothing here
> modifies global shell configuration.

## Scripts

Run each through mise, e.g. `mise exec -- npm run verify`:

```bash
npm test           # unit + integration tests (node --test, strips TS types)
npm run typecheck  # tsc --noEmit
npm run format     # prettier --write
npm run format:check
npm run verify     # the full local gate: typecheck && format:check && test
npm run pi         # run the pinned project-local Pi CLI
```

The GitHub CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs the same
`npm run verify` on Node `22.23.1` for pull requests and pushes to `main`.

## Manual provider authentication (done by Joshua, not by NewFang)

NewFang never runs `/login` or touches credential files. To authenticate a model provider:

1. Start the pinned project-local Pi: `npm run pi` (or `npm exec pi`).
2. Run `/login`.
3. Select the desired subscription provider (Claude where available).
4. Complete the provider's flow personally.

Credentials are stored by Pi under `~/.pi/agent/` and are never read, printed, copied, or modified by
NewFang. Provider auth is **not** required for `/newfang init | status | doctor` — those paths run
without a model.

## Loading the extension

- **Project-local (normal):** with `.pi/extensions/newfang.ts` present, start Pi in the project;
  after the project is trusted, the extension auto-loads.
- **Explicit (any directory / testing):** `npm exec pi -- -e ./.pi/extensions/newfang.ts`.

The file `.pi/extensions/newfang.ts` is a thin adapter (ADR-0007); all logic lives in `src/`.

## Commands

| Command | Behavior |
|---------|----------|
| `/newfang init` | Creates canonical `.newfang/` state. Derives the display name from the repo directory. Refuses to overwrite (no force option). |
| `/newfang home` | Opens the **Steward Console** (interactive TUI). Falls back to `/newfang status` outside a terminal. |
| `/newfang status` | Identity, phase, health, revision, update time, a compact operations summary, focus, next action, and the rationale when present. Warns if uninitialized or migration-required; errors on malformed state. |
| `/newfang focus [ID\|clear]` | Shows, sets, or clears the focus pointer. Rejects unknown, completed, or cancelled items. |
| `/newfang backlog [ID]` | Concise backlog: counts by status, focus item, in-progress, blocked (with reasons), highest-priority ready items, and next action. With an `ID`, shows that item's detail. |
| `/newfang decisions` | Compact list of decisions (id, status, title, decision). |
| `/newfang assumptions` | Compact list of assumptions (id, status, confidence, statement). |
| `/newfang risks` | Compact list of risks (id, status, likelihood/impact, mitigation, links). |
| `/newfang migrate [--apply]` | Inspects the schema migration (current/target version, additions, backup location, safety). `--apply` performs the migration with a timestamped backup. |
| `/newfang intake <path>` | Preserves a repository-relative source byte-for-byte with a SHA-256, makes it current, and recommends Steward analysis. Rejects absolute paths, traversal, and symlink escapes. |
| `/newfang intake status` | Lists intakes with status and draft revision. |
| `/newfang intake review` | Shows the generated Understanding Check (source statements vs. model inferences, conflicts, exact apply summary). |
| `/newfang intake apply [confirm]` | Without `confirm`, previews exactly what will change. With `confirm`, applies the reviewed revision. Refuses blocking conflicts. |
| `/newfang intake reject [reason]` | Rejects an intake; source and drafts are retained. |
| `/newfang claims [CLM-n\|NF-n]` | Claims with derived evidence status (pending/supported/unsupported/stale). Detail shows covered criteria, known limitations, and linked receipts. |
| `/newfang proof [NF-n\|CLM-n\|RCP-n]` | Proof overview; per-work-item criterion coverage and every completion gate; or curated receipt metadata. Never dumps command output or raw JSON. |
| `/newfang verify CLM-n -- executable [args...]` | Echoes the exact structured command (no shell) and then runs it, recording an immutable receipt. Only the **first** `--` separates, so `-- mise exec -- npm run verify` works. Recording a receipt is not the same as passing. |
| `/newfang complete NF-n` | The only path to `completed`. Lists **every** failing gate on rejection and changes nothing. |
| `/newfang orient` | Reports current orientation and staleness; recommends the Steward orientation workflow. |
| `/newfang brief` | Displays the generated project brief. |
| `/newfang doctor` | Read-only diagnostics (see below). Makes no repairs or migrations. |

A quiet persistent ambient widget shows at most two lines — e.g.
`NewFang · BUILD · GREEN · Focus NF-2` and `Next: … · 3 risks · 1 blocked` — omitting empty counts and
degrading at narrow widths. It shows a single init hint when uninitialized, or a migration hint when
the state is older than the current schema.

`/newfang doctor` checks (PASS / WARN / FAIL): pinned Pi version, Node version, git repo, Pi trust
visibility, writable state dir, state presence, **schema migration requirement**, canonical state
validity, **ID counter consistency**, **missing work-item references**, **dependency cycles**,
**focus work-item reference**, generated-view consistency, and (v3) **intake metadata/artifact and
source-hash consistency**, missing draft or understanding view, accepted intakes without an apply
event, invalid current-intake or orientation references, **orientation staleness**, and project-brief
presence.

## Pi tools (LLM-callable)

Registered via the pinned Pi `registerTool` API with strict typebox schemas. They accept no
filesystem paths (the project root comes from the session), update canonical state atomically before
reporting success, and return concise results with structured details.

| Tool | Purpose |
|------|---------|
| `newfang_create_work_item` | Create an outcome/task/defect (cannot create `completed`). |
| `newfang_update_work_item` | Update fields, status (not `completed`), priority, blocked reason, or dependencies. |
| `newfang_list_work_items` | List work items, filtered by status/kind/priority. |
| `newfang_record_decision` | Record a decision (proposed/accepted/superseded). |
| `newfang_record_assumption` | Record an assumption with a confidence level. |
| `newfang_record_risk` | Record a risk with likelihood and impact. |
| `newfang_list_project_operations` | Summarize decisions, assumptions, and risks. |
| `newfang_set_focus` | Set or clear the focus pointer (rejects completed/cancelled items). |
| `newfang_update_decision` | Accept or supersede a decision (`supersededById` required when superseding). |
| `newfang_update_assumption` | Validate or invalidate an assumption; update notes. |
| `newfang_update_risk` | Mitigate, accept, or close a risk (closing requires a resolution). |
| `newfang_create_intake` | Preserve a source (repo-relative path read from disk, or exact text). Interprets nothing. |
| `newfang_stage_intake_draft` | Submit a structured interpretation for review. Changes no project truth. |
| `newfang_apply_intake` | Apply a reviewed draft. Requires the exact revision, no blocking conflicts, and `userConfirmed`. |
| `newfang_reject_intake` | Reject an intake. |
| `newfang_get_intake_draft` | Read a staged draft for review or revision. |
| `newfang_record_orientation` | Store a bounded, validated orientation snapshot. |
| `newfang_set_next_action` | Set the next action, rationale, and optional focus. |
| `newfang_get_project_context` | Read compact structured project context. |
| `newfang_create_claim` | State a claim about a work item and the exact acceptance criteria it covers. Proves nothing by itself. |
| `newfang_update_claim` | Revise a claim's statement, confidence, coverage, or limitations. Never rewrites receipts. |
| `newfang_require_claim` | Make a claim a completion requirement of its work item. |
| `newfang_list_claims` | List claims with derived evidence status (computed on read, never stored). |
| `newfang_run_verification` | Execute one command (structured `executable` + `args`, no shell) and record an immutable receipt. |
| `newfang_get_receipt` | Read a receipt's metadata and manifest; a bounded output excerpt only on request. |
| `newfang_complete_work_item` | The only path to `completed`; reports all failing gates. |
| `newfang_get_proof` | Read proof counts, per-claim evidence, criterion coverage, and completion gates. |

## Steward Console (`/newfang home`)

A Pi-native, keyboard-first console that answers: what am I responsible for now, what is the next
justified action, why is it next, what needs attention, and which decisions and risks matter now.
Design and alternatives considered: [design/STEWARD_CONSOLE.md](design/STEWARD_CONSOLE.md).

- **Views** (navigation order): **Focus** (next action + rationale + focus item + attention + proof
  readiness), **Work** (items grouped by operational relevance), **Proof** (claims by derived status
  with limitations visible, curated receipt rows, and the focused item's completion gate), **Project
  Truth** (decisions, open assumptions, risks).
- **Detail view**: opens for a selected work item, decision, assumption, risk, claim, receipt, or
  completion gate — curated fields only, never raw JSON and never full command output.
- **Keys**: `Tab`/`Shift-Tab` or `h`/`l` switch view · `j`/`k` move selection · `Enter` detail ·
  `Esc` back/close · `r` reload canonical state · `?` help · `q` close. Shortcuts are scoped to the
  custom component, so Pi-global keys are untouched.
- **Responsive**: wide (≥120) two-column panels; standard (80–119) stacked; compact (<80) one-column,
  focus-first with condensed counts.
- **Theme**: Pi theme tokens only (no hardcoded ANSI); no custom NewFang theme required.
- **Runtime context**: the header may show git branch, dirty/clean, Pi and Node versions. This is
  read-only display data — it is **never** written to canonical state and degrades gracefully.
- The console is **read-mostly** in this packet; mutations go through tools and commands.

### Focus vs. status

`focusWorkItemId` is a *focus pointer* — the item currently receiving attention — and is **not** a
lifecycle status. An item may be focused while still `ready`; an `in_progress` item need not be
focused; an outcome may be focused while child tasks carry implementation. Completed or cancelled
items cannot be focused. `nextActionRationale` is an optional Steward-authored explanation of why the
next action is justified; it is never generated automatically.

## Planning intake and orientation (Packet 3)

The daily-use workflow: source → orientation → structured draft → understanding check → accepted truth
→ next action → durable resume. Design docs:
[design/PLANNING_INTAKE.md](design/PLANNING_INTAKE.md) and
[design/REPOSITORY_ORIENTATION.md](design/REPOSITORY_ORIENTATION.md).

### Who owns what

- **The model interprets** (under the Project Steward skill) and its interpretation is fallible.
- **NewFang enforces**: exact source preservation + SHA-256, structured schemas with mandatory
  provenance, lifecycle transitions, review gating, atomic persistence, idempotency, and duplicate
  suppression.
- **You accept.** Nothing enters canonical project truth until you confirm at the review step.

### Artifacts

```text
.newfang/
├── intakes/INT-n/{manifest.json, source.md, drafts/NNNN.json, understandings/NNNN.md, reviews.jsonl}
├── orientations/ORI-n/{orientation.json, ORIENTATION.md}
└── briefs/PROJECT_BRIEF.md
```

`source.md` is written once and never rewritten — a revised interpretation is a new **numbered**
`draftRevision`, and prior drafts plus their Understanding Checks are kept forever. `reviews.jsonl` is
an append-only log of review decisions (`revision_requested` / `accepted` / `rejected`) with concise
feedback only — no hidden reasoning, no transcripts. Canonical state stores only compact metadata
(including `acceptedDraftRevision`), never document text or command output.

Orientation records **command findings** with an explicit basis
(`declared_in_documentation` | `observed_in_session` | `candidate`); `observedResult` is only valid for
commands actually executed in that session. NewFang does not run or verify commands, so nothing is
labeled "verified" — formal verification waits for Phase 4 receipts.

### Provenance

Findings with `origin: "source"` must cite `sourceRefs` (line ranges for files, marker/excerpt for
text), validated against the source's real length. Model additions use `origin: "model_inference"` and
render in their own section of the Understanding Check.

### Apply semantics

Locked decisions → accepted decisions; proposed decisions → proposed; assumptions → open; risks → open;
**only explicit `proposedWorkItems`** become work items (requirements do not auto-convert). Blocking
conflicts refuse the apply. Exact normalized duplicates are skipped and reported. Re-applying the same
accepted revision creates nothing. The preview you confirm is computed by the same function that
applies.

### Project Steward skill

A real Pi skill at [`.pi/skills/project-steward/SKILL.md`](../.pi/skills/project-steward/SKILL.md),
with an ordered [orientation playbook](../.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md).
It instructs the model to read canonical context first, preserve before interpreting, separate source
from inference, respect locked decisions, surface conflicts, orient narrowly, use `newfang_*` tools
instead of writing `.newfang/` by hand, and keep ownership. Project skills load after the project is
trusted; `/skill:project-steward` forces it.

### Automatic context injection

A `before_agent_start` hook injects a compact, deterministic block (≤2400 chars): identity, phase,
health, focus, next action + rationale, pending intake, orientation status, top accepted decisions,
open high-impact risks, a work summary, and pointers to the brief and tools. It contains no source
documents, no raw event history, and no credentials, and it never mutates state. Uninitialized or
migration-required projects get exactly one hint line.

## Schema versioning and migration

Canonical state is explicitly versioned (`schemaVersion`). Packet 1 wrote **v1**; Packet 2 introduced
**v2** (operations); Packet 3 introduced **v3** (`intakes`, `orientations`, `currentIntakeId`,
`currentOrientationId`, `sequences.intake`/`sequences.orientation`); Packet 4 introduces **v4** (adds
`claims`, `receipts`, `sequences.claim`/`sequences.receipt`, and `workItems[].requiredClaimIds`).
Older versions are never redefined in place and never migrated silently:

- Loading any older state reports **migration required** (it is not usable as current state).
- `/newfang migrate` inspects; `/newfang migrate --apply` migrates to the current version (chaining
  1→2→3→4 when needed). It validates each source step and the complete candidate, writes a
  **timestamped backup** to `.newfang/backups/` before an atomic replace, appends one
  `schema_migrated` event only after success, and regenerates the view.
- A failed migration leaves the original canonical bytes byte-identical, writes **no backup**, and
  appends **no event**. Re-running on v4 is a safe no-op. Unknown versions are rejected.
- Migrated work items default to `requiredClaimIds: []`, so they cannot be completed until claims are
  attached deliberately. The migration invents no proof.

## Project-operations model (compact)

- **Work items**: kind (`outcome`/`task`/`defect`), priority (`urgent`/`high`/`normal`/`low`), status
  (`backlog`/`ready`/`in_progress`/`blocked`/`completed`/`cancelled`), title, optional description,
  acceptance criteria, dependency IDs, optional blocked reason, timestamps. Human-readable IDs
  `NF-1…` from canonical monotonic counters. Dependencies must reference existing items, cannot be
  self, and cannot form cycles. Items are never deleted; cancellation preserves history.
- **Decisions** (`DEC-n`), **Assumptions** (`ASM-n`), **Risks** (`RSK-n`) as specified in the plan.
- Deliberately excluded: estimates, story points, sprints, labels, teams, assignees, comments, custom
  statuses, or arbitrary metadata.

## Proof engine (Packet 4)

Full design: [design/PROOF_ENGINE.md](design/PROOF_ENGINE.md).

The chain is **claim → executable verification → immutable receipt → freshness → protected
completion**.

- **Claims** (`CLM-n`) cite acceptance-criterion text **exactly**; near-miss text is refused. There is
  **no support flag** — support is derived on read. `knownLimitations` stays visible everywhere.
- **Receipts** (`RCP-n`) live in `.newfang/receipts/RCP-n/{manifest.json, stdout.txt, stderr.txt}`,
  written to a NewFang-owned staging directory and **atomically promoted**, then linked canonically.
  Immutable; never overwritten. Output is ANSI-stripped, hashed, and capped at 64 KiB per stream with
  `outputTruncated` recorded honestly. No environment values, no absolute paths, no diffs.
- **Execution** takes `{claimId, executable, args, cwdRef?, timeoutMs?}` and runs with `shell: false`.
  A single shell string is refused. `cwdRef` must be repository-relative (traversal and symlink
  escape rejected). Timeouts are bounded and reported as `timed_out`, never as a failure.
  **Recording a receipt is not the same as passing** — a failing command yields a valid `failed`
  receipt.
- **Fingerprint**: a deterministic digest of git HEAD, the tracked and staged diffs, and untracked
  repository files by sorted path + content hash. Everything under `.newfang/` is excluded so that
  creating a receipt does not invalidate its own fingerprint; the tradeoff is that a change confined
  to `.newfang/` does not invalidate evidence. Raw diffs are never stored.
- **Evidence status**: `pending` (no receipt), `supported` (newest current receipt passed),
  `unsupported` (newest current receipt failed/errored/timed out), `stale` (receipts exist but none
  matches the current fingerprint). Without git, nothing is current, so evidence reads `stale`.

### The completion gate (important)

`newfang_complete_work_item` / `/newfang complete NF-n` is the **only** canonical path to `completed`;
generic create and update still reject it. Completion is refused when the item is missing, cancelled,
blocked, or carries a blocked reason; when any dependency is not completed; when acceptance criteria
or required claims are absent; when a required claim is missing; when any acceptance criterion is
uncovered; when any required claim is not `supported`; or when an open **high-impact** risk is linked.
**All** failing gates are reported, and a rejection leaves canonical bytes byte-identical with no
event appended.

**What this guarantees:** NewFang's own state transition. **What it does not:** that a model never
writes unsupported prose, or that a hand-edited `project.json` is rejected. Verification is bounded
but is **not a sandbox** — commands may have side effects.

Because a commit moves `HEAD`, evidence recorded before a commit becomes `stale` after it. That is by
design; re-run verification when you need current evidence.

## Canonical state responsibilities (ADR-0003)

```text
.newfang/
├── project.json            # authoritative current-state snapshot (the source of truth)
├── events.jsonl            # append-only history; never authoritative current state
├── receipts/
│   ├── .tmp/               # NewFang-owned staging, atomically promoted — NOT tracked in git
│   └── RCP-n/              # immutable verification evidence (manifest.json, stdout.txt, stderr.txt)
├── backups/                # local pre-migration backups — NOT tracked in git
└── views/
    └── PROJECT_STATUS.md    # GENERATED projection of project.json — do not edit by hand
```

The NewFang repository **dogfoods its own** `.newfang/` state (backlog, decisions, risks); it is
committed and loaded by the `dogfood` test. `.newfang/backups/` is git-ignored.

- `project.json` is written atomically (temp file + rename); a successful canonical write happens
  before the generated view or any UI update.
- Incompatible `schemaVersion` values are surfaced as errors and never silently rewritten.
- On session start, NewFang loads and validates canonical state first and restores the home view. Pi
  session entries are a non-authoritative cache and never overwrite `.newfang/`. Starting a session
  records no event.

### Generated files

`.newfang/views/PROJECT_STATUS.md` is generated and begins with a generated-marker comment. Edit
state through NewFang (which regenerates the view), not the file directly.

## Smoke-test procedure

Pi's interactive TUI needs a real terminal. The command and UI paths are exercised headless through
Pi's RPC mode (no provider auth required):

```bash
# In a temporary git-initialized fixture directory, with the extension loaded via -e:
pi --mode rpc --no-session -e /abs/path/to/.pi/extensions/newfang.ts
# then send JSONL commands on stdin, e.g.:
{"type":"prompt","message":"/newfang init"}
{"type":"prompt","message":"/newfang status"}
{"type":"prompt","message":"/newfang doctor"}
# restart the process and send /newfang status to confirm state restores from disk.
```

Manual TUI equivalent for Joshua: start `npm run pi` in a fixture repo, trust it, run `/newfang init`,
`/newfang status`, quit, restart, confirm the home view and status restore, then `/newfang doctor`.

Recorded runs and results:
[verification/PACKET_1_FOUNDATION.md](verification/PACKET_1_FOUNDATION.md) and
[verification/PACKET_2_PROJECT_OPERATIONS.md](verification/PACKET_2_PROJECT_OPERATIONS.md).

## Current limitations (through Packet 4)

- No approval bundles, delegation, background processes, sandboxing, remote execution, model routing,
  cost tracking, packaging, or release/PR automation.
- **Command verification only.** No manual evidence attestation, browser screenshots, or other
  verification types.
- The completion gate defends NewFang's state transition, not model prose and not a hand-edited
  `project.json`.
- Verification is **not sandboxed**: a verification command runs with the caller's privileges and may
  have side effects.
- Evidence is scoped to one repository fingerprint. A commit moves `HEAD`, so receipts recorded before
  a commit read `stale` afterwards until verification is re-run.
- A change confined entirely to `.newfang/` does not invalidate evidence (a deliberate consequence of
  excluding NewFang's own bookkeeping from the fingerprint).
- Without git, no evidence can be shown as current, so nothing can be completed.
- Single-writer assumption still applies: a receipt whose reserved ID no longer matches the canonical
  counter is refused rather than linked.
- Interpretation is nondeterministic: NewFang guarantees structure, provenance, gating, and
  persistence — not that the model read the document correctly.
- Duplicate detection is exact-match only; likely-but-inexact duplicates are surfaced for review.
- Review feedback produces a new draft revision but is not itself stored durably (work item NF-8).
- The authenticated Project Steward acceptance tier is **pending**; daily-use readiness is not claimed.
- Generic tools cannot mark work `completed` (reserved for a future completion tool). The dogfooded
  state reflects this honestly: nothing is marked complete.
- The Steward Console is **read-mostly** — no editing forms; selection resets when switching views.
- Console interactive rendering (resize, theme appearance) is verified by tests at the string level;
  see the Packet 2.5 record for what was and was not observed interactively.
- Single-writer assumption for `.newfang/` (atomic writes, but no lock).
- `doctor` reports only; it never repairs or migrates.

Recorded runs and results:
[verification/PACKET_1_FOUNDATION.md](verification/PACKET_1_FOUNDATION.md),
[verification/PACKET_2_PROJECT_OPERATIONS.md](verification/PACKET_2_PROJECT_OPERATIONS.md),
[verification/PACKET_2_5_STEWARD_CONSOLE.md](verification/PACKET_2_5_STEWARD_CONSOLE.md),
[verification/PACKET_3_INTAKE_ORIENTATION.md](verification/PACKET_3_INTAKE_ORIENTATION.md).
