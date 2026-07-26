# Voila Rename Inventory

Classification of every path affected by the NewFang -> Voila rename (Packet 4.5, Part 1).

This inventory was captured **before** any edit was made. Each affected path is assigned exactly one
category. A path may not appear in two categories.

## Capture

Commands run against `origin/main` at `1678e0d`:

```bash
git grep -n -I \
  -e 'NewFang' -e 'Newfang' -e 'newfang' -e 'NEWFANG' \
  -e 'Voilà' -e 'voilà' -- . > /tmp/voila-rename-occurrences.txt || true

find . \( -iname '*newfang*' -o -iname '*voilà*' \) -print | sort > /tmp/voila-rename-paths.txt
```

### Counts

| Measure | Count |
| --- | --- |
| Legacy-brand occurrences (tracked, text files) | 1514 |
| Paths whose **name** carries the legacy brand (excluding `node_modules/`) | 8 |
| Accented (`Voilà` / `voilà`) occurrences | 0 |
| Model-callable tools to rename | 28 |
| Files under `.newfang/` tracked in git | 52 |

The accented spelling never entered the repository, so Part 10's accent rule is a forward-looking
regression guard rather than a cleanup.

### Name-carrying paths

| Path | Category |
| --- | --- |
| `.newfang/` (state directory) | 3 — moved byte-identical |
| `.pi/extensions/newfang.ts` | 1 — `git mv` to `voila.ts` |
| `docs/research/NEWFANG_CAPABILITY_MATRIX.md` | 1 — `git mv` to `VOILA_CAPABILITY_MATRIX.md` |
| `.git/worktrees/newfang-accept` | 6 — local Git metadata |
| `.git/worktrees/newfang-delivery-inspector` | 6 — local Git metadata |
| `.git/worktrees/newfang-proof` | 6 — local Git metadata |
| `.git/refs/remotes/origin/ecc-tools/newfang-1784978955989` | 6 — remote branch name, not renamed |
| `.git/logs/refs/remotes/origin/ecc-tools/newfang-1784978955989` | 6 — reflog, never rewritten |

## Category 1 — Active rename required

Current product surfaces. Every legacy-brand occurrence in these paths is replaced.

### Source (`src/`)

All 49 files under `src/` are in scope. Identifier renames:

| Before | After |
| --- | --- |
| `NewfangToolResult` | `VoilaToolResult` |
| `NewfangToolCtx` | `VoilaToolCtx` |
| `NewfangTool` | `VoilaTool` |
| `newfangTools` | `voilaTools` |
| `NewfangUi` | `VoilaUi` |
| `NewfangCtx` | `VoilaCtx` |
| `NewfangHost` | `VoilaHost` |
| `NewfangEvent` | `VoilaEvent` |
| `NewfangStateError` | `VoilaStateError` |
| `registerNewfang` | `registerVoila` |
| `NEWFANG_DIR` | `VOILA_DIR` (value `.newfang` -> `.voila`) |
| `EXCLUDE_NEWFANG` | `EXCLUDE_STATE_DIRS` |
| `HOME_WIDGET_KEY` value `newfang-home` | `voila-home` |
| context `customType` `newfang-context` | `voila-context` |
| `newfangExtension` (default export) | `voilaExtension` |

### Command surface

`/newfang` -> `/voila`. No alias is retained. All 17 subcommands keep their names.

### Tool surface (28 tools)

Every `newfang_*` -> `voila_*`:

```text
newfang_apply_intake             newfang_record_orientation
newfang_complete_work_item       newfang_record_risk
newfang_create_claim             newfang_reject_intake
newfang_create_intake            newfang_request_intake_revision
newfang_create_work_item         newfang_require_claim
newfang_get_intake_draft         newfang_run_verification
newfang_get_project_context      newfang_set_focus
newfang_get_proof                newfang_set_next_action
newfang_get_receipt              newfang_stage_intake_draft
newfang_list_claims              newfang_update_assumption
newfang_list_project_operations  newfang_update_claim
newfang_list_work_items          newfang_update_decision
newfang_record_assumption        newfang_update_risk
newfang_record_decision          newfang_update_work_item
```

### Tests (`test/`)

All 28 test files. Descriptions, fixtures, and assertions that represent **current** behavior are
renamed. `test/fixtures/integrated-v3-project.json` is a current-behavior fixture, not an evidence
artifact, so it is renamed.

### Adapter, skill, packaging, and maintained docs

| Path | Action |
| --- | --- |
| `.pi/extensions/newfang.ts` | `git mv` -> `.pi/extensions/voila.ts` |
| `.pi/skills/project-steward/SKILL.md` | Voila Project Steward |
| `.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md` | rewrite |
| `package.json` | `"name": "voila"`, description |
| `package-lock.json` | `"name": "voila"` (both occurrences) |
| `.gitignore` | `.voila/backups/`, `.voila/receipts/.tmp/` |
| `mise.toml` | comment |
| `README.md` | rewrite + rename note |
| `AGENTS.md` | rewrite |
| `CLAUDE.md` | rewrite |
| `docs/DEVELOPMENT.md` | rewrite (94 occurrences) |
| `docs/architecture/ARCHITECTURE_OPTIONS.md` | rewrite |
| `docs/architecture/RECOMMENDED_ARCHITECTURE.md` | rewrite |
| `docs/design/PLANNING_INTAKE.md` | rewrite |
| `docs/design/PROOF_ENGINE.md` | rewrite |
| `docs/design/REPOSITORY_ORIENTATION.md` | rewrite |
| `docs/design/STEWARD_CONSOLE.md` | rewrite |
| `docs/plans/MVP_IMPLEMENTATION_PLAN.md` | rewrite |
| `docs/plans/MVP_VERTICAL_SLICE.md` | rewrite |
| `docs/project/PROJECT_LEDGER.md` | rewrite |
| `docs/research/NEWFANG_CAPABILITY_MATRIX.md` | `git mv` -> `VOILA_CAPABILITY_MATRIX.md`, rewrite |

`docs/research/NEWFANG_CAPABILITY_MATRIX.md` is renamed because it is maintained current guidance
(a requirement-by-requirement matrix the README links as live reference), not a dated audit.

## Category 2 — Legacy migration compatibility

Narrowly bounded code that must keep naming `.newfang` so existing projects can be detected and
migrated. Nothing here is a product alias for the command or tool API.

| Path | Reason |
| --- | --- |
| `src/state/legacy.ts` (new) | Defines `LEGACY_STATE_DIR = ".newfang"`, four-case detection, inspect/apply migration, rollback |
| `src/state/fingerprint.ts` | Must exclude a legacy `.newfang/` from the fingerprint while it still exists |
| `src/commands/migrate.ts` | Reports and applies the legacy-state transition |
| `src/commands/doctor.ts` | Warns on a leftover `.newfang/`, fails on a `.newfang/` + `.voila/` conflict |
| `src/extension/register.ts` | Widget text for the legacy-migration-required state |
| `test/legacy-migration.test.ts` (new) | Explicit tests of legacy detection and migration |

`/newfang`, `newfang_*`, `NewfangTool`, and `registerNewfang` are **not** retained in any form
(locked decision 3). Legacy compatibility is scoped to the state directory only.

## Category 3 — Historical evidence preserved

Not rewritten. Where these live under `.newfang/`, they move to `.voila/` with **identical bytes**.

| Path | Reason | Immutable |
| --- | --- | --- |
| `.newfang/intakes/**` (INT-1..INT-8) | Preserved sources, draft revisions, understandings, append-only `reviews.jsonl` | yes |
| `.newfang/orientations/**` (ORI-1, ORI-2) | Recorded orientation artifacts | yes |
| `.newfang/receipts/**` (RCP-1..RCP-4) | Verification receipts: manifests, `stdout.txt`, `stderr.txt` under recorded hashes | yes |
| `.newfang/events.jsonl` | Append-only history; migration appends, never edits | append-only |
| `.newfang/backups/**` | Timestamped pre-migration canonical bytes | yes |
| `docs/verification/PACKET_1_FOUNDATION.md` | Closed evidence record describing the product at the time | yes |
| `docs/verification/PACKET_2_PROJECT_OPERATIONS.md` | Closed evidence record | yes |
| `docs/verification/PACKET_2_5_STEWARD_CONSOLE.md` | Closed evidence record | yes |
| `docs/verification/PACKET_3_INTAKE_ORIENTATION.md` | Closed evidence record | yes |
| `docs/verification/PACKET_4_PROOF_ENGINE.md` | Closed evidence record | yes |
| `docs/research/BEN_SETUP_AUDIT.md` | Dated audit of an external setup | yes |
| `docs/research/PI_CAPABILITY_AUDIT.md` | Dated Pi 0.80.3 capability audit; quotes external source material | yes |
| `docs/plans/PHASE_3_INTAKE_BRIEF.md` | The intake source behind all 8 intakes; its preserved snapshots are hash-recorded | yes |
| `docs/plans/SELF_HOSTING_ACCEPTANCE_PROJECT.md` | Describes the `newfang-approval-bundles` target project by its actual name | yes |
| `docs/product/PRODUCT_DIRECTION.md` | Authored v0.1 direction; `CLAUDE.md` forbids silent rewriting | yes |
| `docs/decisions/0001..0007-*.md` | Dated ADRs; original text preserved, additive rename note appended | text preserved |

### Notes on two judgement calls

**`docs/product/PRODUCT_DIRECTION.md`** is left verbatim. It is the authored v0.1 source and
`CLAUDE.md` states it "is the authored v0.1 source. Do not silently rewrite it; propose edits
explicitly." Renaming it inside this packet would be exactly the silent rewrite that instruction
forbids. Re-authoring it as a Voila document is proposed as separate, explicit work.

**`docs/decisions/0001..0007`** keep their decision text unchanged — an ADR records what was decided
on a date. Each ADR whose text names a path this packet actually moves gets a short appended
`## Rename note` pointing at `docs/migrations/NEWFANG_TO_VOILA.md`. The note is additive; no
recorded decision is edited.

## Category 4 — External reference preserved

| Path | Reason |
| --- | --- |
| `.git/refs/remotes/origin/ecc-tools/newfang-1784978955989` | A remote branch name created by external tooling; renaming branches is out of scope |
| `docs/research/PI_CAPABILITY_AUDIT.md` (quoted blocks) | Verbatim quotations of Pi documentation |
| GitHub URLs in closed verification records | Old `jenksed/newfang` PR and run URLs are the real addresses those runs had |

## Category 5 — Generated artifact — regenerate

Never hand-edited. Regenerated through supported code after the state migration.

| Path | Generator |
| --- | --- |
| `.voila/views/PROJECT_STATUS.md` | `renderStatusView` via `writeStatusView` |
| `.voila/briefs/PROJECT_BRIEF.md` | `renderProjectBrief` via `/voila brief` |

Both regenerate from canonical state. Their **banners, headers, and project identity** say Voila.
Their bodies quote decision, assumption, risk, and claim records verbatim, so records authored
before the rename still read "NewFang" inside the quoted text. That is intended: the projection must
not silently contradict the records it projects.

## Category 6 — Requires manual GitHub/local operation

Cannot be done by editing files in this branch.

| Operation | When |
| --- | --- |
| Rename `jenksed/newfang` -> `jenksed/voila` | Only after the code PR merges and push-to-main CI passes |
| `git remote set-url origin git@github.com:jenksed/voila.git` | After the GitHub rename |
| Verify each linked worktree resolves the new origin | After the remote URL change |
| Rename `/Users/jenksed/Projects/newfang` -> `.../voila` | Optional; **not** an acceptance gate; blocked while worktrees are linked |
| `.git/worktrees/newfang-*` metadata directories | Local Git internals; renamed only if the worktrees themselves are recreated |

Destination availability was confirmed before starting: `gh api repos/jenksed/voila` returns 404, so
the target name is free.

## Post-rename expectation

After this packet, the only legacy-brand occurrences that survive are the ones enumerated in
`test/fixtures/legacy-brand-allowlist.json`, each with an exact path and a reason. The rename guard
(`test/rename-guard.test.ts`) fails on any occurrence not on that list.
