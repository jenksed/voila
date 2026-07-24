# Packet 1 Foundation — Verification Record

Reproducible record of the checks performed for the runnable NewFang foundation. Date: 2026-07-24.

## Environment

| Field | Value |
|-------|-------|
| OS | macOS 26.5.2 (Darwin 25.5.0), arm64 (Apple Silicon) |
| Node (project runtime, pinned) | `v22.23.1` (via nvm; pinned in `mise.toml`) |
| npm | `10.9.8` |
| mise | not installed on this machine (mise.toml created for the user's workflow) |
| Pi CLI (project-local) | `@earendil-works/pi-coding-agent@0.82.0` |
| TypeScript | `7.0.2` · @types/node `22.20.1` · prettier `3.9.6` |
| Install command | `npm install --ignore-scripts` (137 packages, 0 vulnerabilities) |

## Exact versions (pinned)

- `node@22.23.1` (engines requirement for Pi: `node >=22.19.0`).
- `@earendil-works/pi-coding-agent@0.82.0` (npm `latest` at resolution date 2026-07-24;
  other dist-tags: `legacy-node20@0.74.2`).
- `typescript@7.0.2`, `@types/node@22.20.1`, `prettier@3.9.6`.

Version resolution rationale: `0.82.0` is the current stable `latest`; no incompatibility was found.
Node `22.23.1` is the newest maintained Node 22 already available on the machine and satisfies Pi's
engine range with margin.

## Project-local Pi CLI check

```text
$ npm exec pi -- --version
0.82.0
```

## Automated tests

Command: `npm run verify` (= `tsc --noEmit` && `prettier --check` && `node --test "test/**/*.test.ts"`).

Result: typecheck clean, format check clean, **31 / 31 tests pass, 0 fail** (duration ~0.9 s).

Coverage:
- `test/state.store.test.ts` (11): init files + deterministic defaults; refuse-overwrite;
  load round-trip; not-found; malformed JSON; incompatible schema rejected and not rewritten;
  field validation; monotonic revision + identity preservation; event append; generated-view match;
  no leftover temp files.
- `test/domain.status.test.ts` (6): name derivation; deterministic default; status lines; generated
  view content; home-view lines (empty + populated); abbreviate.
- `test/commands.test.ts` (10): init created; init refuse-overwrite (revision unchanged); status reads
  state; status warn uninitialized; status error on malformed; restart parity; doctor healthy PASS;
  doctor node FAIL below minimum; doctor Pi/state WARN; doctor Pi-version-unknown WARN.
- `test/extension.integration.test.ts` (4): pinned Pi package loads at runtime and reports `0.82.0`;
  command + session_start handler registered; session_start restoration does not crash and shows the
  init hint; init→status runs end to end through the registered command.

## Manual smoke test (headless, via Pi RPC)

Pi's interactive TUI cannot run in a non-interactive shell, so the command and UI paths were exercised
through Pi's RPC mode (no provider authentication) against a temporary git-initialized fixture, with
the extension loaded via `-e`.

Procedure:
```text
pi --mode rpc --no-session -e <repo>/.pi/extensions/newfang.ts   (cwd = temp fixture)
-> session_start emits setWidget "newfang-home" = ["NewFang · not initialized — run /newfang init"]
prompt "/newfang init"    -> notify: Initialized project; created .newfang/ (project.json, events.jsonl, receipts, views); Phase research, Health unknown, Revision 1
prompt "/newfang status"  -> notify: identity/phase/health/revision/updated/next; home-view widget updated
prompt "/newfang doctor"  -> notify (WARN): PASS pi version 0.82.0, PASS node v22.23.1, PASS git, WARN trust (no store yet), PASS state dir writable, PASS state present, PASS schema, PASS generated view
```

Restart (fresh Pi RPC process, same fixture):
```text
session_start -> setWidget restores home view from canonical state (phase/health/next)
prompt "/newfang status" -> SAME projectId and revision as before restart (durable restore)
```

Observed on-disk after init: `.newfang/{project.json, events.jsonl, receipts, views}`;
`project.json` revision `1`, phase `research`. projectId identical across restart; revision stable
(no spurious mutation on session start).

Result: PASS. All acceptance-gate behaviors observed against the real pinned Pi.

## What this packet proves

- Node and Pi versions are pinned exactly; the project-local Pi CLI runs and reports `0.82.0`.
- The NewFang extension loads against the pinned Pi package; `/newfang` registers.
- `/newfang init` creates canonical `.newfang/` state safely (refuses overwrite); `/newfang status`
  reads it; `/newfang doctor` reports useful PASS/WARN/FAIL diagnostics.
- Canonical writes are atomic and schema-validated; incompatible schema is rejected, not rewritten.
- The minimal home view restores after restart from canonical state; session start records no event
  and never overwrites canonical state.
- Unit and integration tests pass; the smoke test is recorded.
- No provider credentials were accessed; no out-of-scope functionality was implemented.

## What this packet does NOT prove

- No planning-document intake, backlog, claims, verification receipts (runtime), completion gates,
  approval bundles, delegation/subagents, model routing, cost accounting, background terminals,
  sandboxing, remote execution, theming, or packaging — all explicitly out of scope.
- The interactive TUI path was not automated (documented for manual verification). Only RPC-mode and
  unit/integration paths were exercised automatically.
- No verification of Pi behavior under provider authentication (intentionally avoided).
- Concurrency/locking of `.newfang/` under simultaneous writers is not addressed (single-writer
  assumption for now).
