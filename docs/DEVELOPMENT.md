# NewFang Development

Local setup, pinned versions, commands, and the smoke-test procedure for the NewFang extension
foundation (Packet 1). This is the runnable foundation only — not the full MVP.

## Pinned runtime and dependencies

| Component | Pinned version | Notes |
|-----------|----------------|-------|
| Node | `22.23.1` | project-local via [`mise.toml`](../mise.toml); satisfies Pi engines and enables flag-free TS type stripping |
| Pi | `@earendil-works/pi-coding-agent@0.82.0` | devDependency; engines `node >=22.19.0`; provides the `pi` CLI |
| TypeScript | `7.0.2` | `tsc --noEmit` only (no build; jiti/Node strip types) |
| @types/node | `22.20.1` | matches the Node 22 runtime |
| prettier | `3.9.6` | formatting |

Exact versions are recorded in [`package.json`](../package.json) and locked in `package-lock.json`.

## First-time setup

```bash
# 1. Select the pinned Node runtime.
#    With mise:            mise install
#    Without mise:         ensure Node 22.23.1 is on PATH (e.g. via nvm: nvm use 22.23.1)

# 2. Install project-local dependencies (Pi + dev tools). No global installs.
npm install --ignore-scripts

# 3. Confirm the project-local Pi CLI.
npm exec pi -- --version      # -> 0.82.0
```

> mise is optional. `mise.toml` pins Node `22.23.1`; if mise is not installed, provide that Node
> version by any means (nvm, direct install). Nothing here modifies global shell configuration.

## Scripts

```bash
npm test           # unit + integration tests (node --test, strips TS types)
npm run typecheck  # tsc --noEmit
npm run format     # prettier --write
npm run format:check
npm run verify     # the full local gate: typecheck && format:check && test
npm run pi         # run the pinned project-local Pi CLI
```

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
| `/newfang init` | Creates canonical `.newfang/` state for the project. Derives the display name from the repo directory. Refuses to overwrite existing state (no force option in this packet). |
| `/newfang status` | Prints project identity, phase, health, revision, last update, and next justified action from canonical state. Warns if uninitialized; errors on malformed/incompatible state. |
| `/newfang doctor` | Read-only diagnostics: pinned Pi version, Node version, git repo, Pi trust visibility, state presence, schema validity, writable state dir, generated-view consistency. Classifies each as PASS / WARN / FAIL. Makes no repairs. |

A quiet persistent home-view widget shows `NewFang · phase · health` and an abbreviated next action
(or a single init hint when uninitialized).

## Canonical state responsibilities (ADR-0003)

```text
.newfang/
├── project.json            # authoritative current-state snapshot (the source of truth)
├── events.jsonl            # append-only history; never authoritative current state
├── receipts/               # (reserved) immutable verification evidence — unused in Packet 1
└── views/
    └── PROJECT_STATUS.md    # GENERATED projection of project.json — do not edit by hand
```

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

The recorded run and results are in
[verification/PACKET_1_FOUNDATION.md](verification/PACKET_1_FOUNDATION.md).

## Current limitations (Packet 1)

- Only `init`, `status`, `doctor` exist. No backlog, claims, receipts, verification gates, delegation,
  approval bundles, background terminals, sandboxing, remote execution, model routing, or theming.
- The home view is intentionally minimal.
- `doctor` never repairs; it only reports.
- `receipts/` is created but unused.
- No session-entry caching is implemented (canonical state is loaded directly on resume).
- The foundation has been exercised via RPC mode; the interactive TUI path is documented for manual
  verification but not automated.
