# Packet 2 Project Operations — Verification Record

Reproducible record for the project-operations layer, schema v2 migration, Pi tools/commands, and
early dogfooding. Date: 2026-07-24.

## Environment and exact versions

| Field | Value |
|-------|-------|
| OS | macOS 26.5.2 (Darwin 25.5.0), arm64 |
| mise | `2026.7.13 macos-arm64` (installed by the user before Packet 2; **not** present during Packet 1) |
| Node (via mise) | `v22.23.1` |
| npm | `10.9.8` |
| Pi CLI (project-local) | `@earendil-works/pi-coding-agent@0.82.0` |
| TypeScript | `7.0.2` |
| @types/node | `22.20.1` |
| prettier | `3.9.6` |
| typebox | `1.1.38` (added this packet — the schema library `registerTool` uses; matches Pi's bundled version) |

### mise activation

```text
$ mise --version            -> 2026.7.13 macos-arm64 (2026-07-24)
$ mise install              -> node@22.23.1 installed
$ mise exec -- node --version  -> v22.23.1
$ mise exec -- npm --version   -> 10.9.8
$ mise exec -- npm exec pi -- --version -> 0.82.0
```

The local verification gate is reproduced with `mise exec -- npm run verify`.

## Baseline verification (before modifications)

`mise exec -- npm run verify` on the starting `feat/project-operations` branch: **31/31 tests pass**
(the Packet 1 gate still passes under mise).

## Migration test result

`test/migrate.test.ts` covers: v1 inspection (no write), successful v1→v2 apply, backup creation +
original-byte fidelity, identity preservation (projectId/createdAt/displayName, revision bumped),
no-op on v2, unknown-version refusal, malformed-v1 refusal leaving canonical bytes intact (no
backup), migration-event creation, and generated-view refresh. **All pass.**

## Complete final test result

`mise exec -- npm run verify` (typecheck + prettier check + tests): **59/59 tests pass, 0 fail.**

Test files: `state.store` (immutable update + v2 + v1/unknown rejection), `migrate`, `operations`
(work items, IDs, cycles, lifecycles, table-driven validation), `commands` (status/backlog/lists/
migrate/doctor incl. dangling-ref, cycle, and bad-counter detection), `domain.status`, `tools`
(registration + mutation path + completion rejection), `extension.integration` (loads against pinned
Pi; registers command + 7 tools + session_start), and `dogfood` (loads the committed repo state).

## Smoke-test procedure and result

Command/UI paths were driven through real Pi RPC (`pi --mode rpc --no-session -e .pi/extensions/newfang.ts`,
no provider auth). Tool paths (which the model would normally invoke) were exercised by calling the
real tool `execute()` handlers directly — headless, no model call.

Temporary fixture (v1 → migrate → tool ops → restart → completion rejection → doctor):

1. Seed v1 `project.json`; start Pi RPC.
2. `/newfang status` → **warning: schema version 1; version 2 required** (session_start widget shows
   "migration required").
3. `/newfang migrate` → inspection: additions listed, backup location shown, safe/supported = yes.
4. `/newfang migrate --apply` → **migrated v1→v2**; backup written to
   `.newfang/backups/project.json.v1.<timestamp>`.
5–7. Tool handlers created NF-1, NF-2 (depends on NF-1), a decision, an assumption, and a risk.
10–11. `newfang_update_work_item {id: NF-1, status: completed}` → **rejected** ("that transition is
   reserved for newfang_complete_work_item").
8–9. Restart Pi → `/newfang status|backlog|decisions|risks` reconstructed identical operations
   (2 items, 1 decision, 1 risk); revision stable across restart (no spurious mutation).
12. `/newfang doctor` → all PASS (pi version, node, schema migration at v2, canonical valid, id
   counter consistency, references, cycles, active item, generated view); trust WARN only (fresh
   fixture).

Real dogfooded repository via Pi RPC: home widget shows `phase: build · health: green · active NF-2`;
`/newfang status` shows 7 open items, 5 accepted decisions, 3 open risks; `/newfang backlog`,
`/newfang decisions`, and `/newfang risks` render compactly. **Result: PASS.**

Note: in the smoke run, the Pi subprocess launched under the ambient Node (`v26.3.0`), which also
satisfies Pi's engine range (`>=22.19.0`); the pinned project runtime used for tests/verify is
`22.23.1`.

## Dogfooding result

`/newfang init` created `.newfang/` in the repository; NewFang's own tool handlers seeded 7 work
items (NF-1…NF-7), 5 accepted decisions (concise references to ADR-0002/0003/0007/0005/0006), 4 risks
(1 mitigated, 3 open), and 2 assumptions. Steward-owned scalars set phase=`build`, health=`green`,
active=`NF-2`, and the next action to the Phase 3 planning-intake/orientation slice. Committed state:
`.newfang/project.json`, `.newfang/events.jsonl`, `.newfang/views/PROJECT_STATUS.md`, and an empty
`.newfang/receipts/.gitkeep`. Scanned: no absolute/home paths, credentials, or machine-sensitive data.

## CI workflow

`.github/workflows/ci.yml` runs on pull requests and pushes to `main`, uses Node `22.23.1`, installs
with `npm ci --ignore-scripts`, caches npm, runs `npm run verify`, grants `contents: read` only, and
cancels superseded runs via concurrency. It uses no provider credentials. **It has not run remotely
yet** (the branch is not pushed); GitHub Actions becomes an external receipt only after a push.

## Known limitations

- Single-writer assumption for `.newfang/` (atomic writes, but no lock); concurrent writers could race.
- No completion transition exists; `completed` items can only enter state via a valid canonical source
  (e.g., a hand-authored or migrated file), never via generic create/update.
- Update tools for decisions/assumptions/risks are implemented in the domain and tested, but only
  `record_*` (create) is exposed as a Pi tool this packet.
- No property-testing dependency; cycle/validation matrices use table-driven tests.
- CI is unproven remotely until pushed.

## What this packet does NOT prove

- NewFang does **not** understand planning documents, perform repository orientation, verify
  implementation claims, produce runtime verification receipts, or control completion.
- No approvals, delegation, background processes, sandboxing, remote execution, model routing, cost
  tracking, packaging, release publishing, or PR creation.
