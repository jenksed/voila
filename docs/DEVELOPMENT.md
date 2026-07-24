# NewFang Development

Local setup, pinned versions, commands, tools, schema/migration, and the smoke procedure. Through
Packet 2 NewFang has a project-operations layer (backlog, decisions, assumptions, risks) on canonical
`.newfang/` state. This is not the full MVP: there is no planning intake, claims, verification
receipts, completion gate, delegation, or approvals.

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
| `/newfang status` | Identity, phase, health, revision, update time, a compact operations summary, active item, and next action. Warns if uninitialized or migration-required; errors on malformed state. |
| `/newfang backlog [ID]` | Concise backlog: counts by status, active item, in-progress, blocked (with reasons), highest-priority ready items, and next action. With an `ID`, shows that item's detail. |
| `/newfang decisions` | Compact list of decisions (id, status, title, decision). |
| `/newfang assumptions` | Compact list of assumptions (id, status, confidence, statement). |
| `/newfang risks` | Compact list of risks (id, status, likelihood/impact, mitigation, links). |
| `/newfang migrate [--apply]` | Inspects the schema migration (current/target version, additions, backup location, safety). `--apply` performs the migration with a timestamped backup. |
| `/newfang doctor` | Read-only diagnostics (see below). Makes no repairs or migrations. |

A quiet persistent home-view widget shows `NewFang · phase · health`, plus the active work-item ID
(when set) and a blocked count (when nonzero), and an abbreviated next action — or a single init hint
when uninitialized, or a migration hint when the state is v1.

`/newfang doctor` checks (PASS / WARN / FAIL): pinned Pi version, Node version, git repo, Pi trust
visibility, writable state dir, state presence, **schema migration requirement**, canonical state
validity, **ID counter consistency**, **missing work-item references**, **dependency cycles**,
**active work-item reference**, and generated-view consistency.

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

## Schema versioning and migration

Canonical state is explicitly versioned (`schemaVersion`). Packet 1 wrote **v1**; Packet 2 introduces
**v2** (adds `activeWorkItemId`, `sequences`, `workItems`, `decisions`, `assumptions`, `risks`). v1 is
never redefined in place and never migrated silently:

- Loading a v1 state reports **migration required** (it is not usable as current state).
- `/newfang migrate` inspects; `/newfang migrate --apply` migrates 1→2. It validates the source and
  the complete v2 candidate, writes a **timestamped backup** to `.newfang/backups/` before an atomic
  replace, appends one `schema_migrated` event only after success, and regenerates the view.
- A failed migration leaves the v1 canonical bytes intact. Re-running on v2 is a safe no-op. Unknown
  versions are rejected.

## Project-operations model (compact)

- **Work items**: kind (`outcome`/`task`/`defect`), priority (`urgent`/`high`/`normal`/`low`), status
  (`backlog`/`ready`/`in_progress`/`blocked`/`completed`/`cancelled`), title, optional description,
  acceptance criteria, dependency IDs, optional blocked reason, timestamps. Human-readable IDs
  `NF-1…` from canonical monotonic counters. Dependencies must reference existing items, cannot be
  self, and cannot form cycles. Items are never deleted; cancellation preserves history.
- **Decisions** (`DEC-n`), **Assumptions** (`ASM-n`), **Risks** (`RSK-n`) as specified in the plan.
- Deliberately excluded: estimates, story points, sprints, labels, teams, assignees, comments, custom
  statuses, or arbitrary metadata.

### No completion gate yet (important)

Generic create/update operations **cannot** set a work item to `completed`. That transition is
reserved for a future `newfang_complete_work_item` tool which will enforce claims and verification.
`completed` items can only enter state via a valid canonical source (e.g., migrated or hand-authored
files). NewFang does not yet control completion, verify claims, or understand planning documents.

## Canonical state responsibilities (ADR-0003)

```text
.newfang/
├── project.json            # authoritative current-state snapshot (the source of truth)
├── events.jsonl            # append-only history; never authoritative current state
├── receipts/               # (reserved) immutable verification evidence — unused so far
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

## Current limitations (through Packet 2)

- No planning-document intake, repository orientation, claims, evidence links, runtime verification
  receipts, completion gate, approval bundles, delegation, background processes, sandboxing, remote
  execution, model routing, cost tracking, packaging, or release/PR automation.
- Generic tools cannot mark work `completed` (reserved for a future completion tool).
- Decision/assumption/risk **update** exists in the domain (tested) but only `record_*` is exposed as
  a Pi tool so far.
- Single-writer assumption for `.newfang/` (atomic writes, but no lock).
- `doctor` reports only; it never repairs or migrates.
- Exercised via RPC + direct handlers; the interactive TUI path is documented but not automated.
