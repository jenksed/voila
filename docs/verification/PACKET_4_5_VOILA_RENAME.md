# Packet 4.5 verification — NewFang to Voila rename

Evidence for the product rename and legacy-state migration.

Tiers are separated by what actually produced them. A tier that could not be run in this environment
says so; it is not claimed.

| | Tier | Result |
| --- | --- | --- |
| 1 | Rename inventory | PASS |
| 2 | Active code/API rename | PASS |
| 3 | Package rename | PASS |
| 4 | Legacy-state migration tests | PASS |
| 5 | Repository dogfood migration | PASS |
| 6 | Immutable artifact hash comparison | PASS |
| 7 | Intake/review preservation | PASS |
| 8 | Proof receipt preservation | PASS |
| 9 | Fingerprint behavior | PASS |
| 10 | Rename guard | PASS |
| 11 | Pi extension registration | PASS (headless) |
| 12 | Project Steward loading | PASS (structural) |
| 13 | Interactive TUI | **PENDING — no TTY in this environment** |
| 14 | Doctor | PASS |
| 15 | Full automated verification | PASS |
| 16 | GitHub CI | PENDING — recorded after the branch is pushed |
| 17 | GitHub repository rename | PENDING — only after merge and green push-to-main CI |
| 18 | Post-rename remote verification | PENDING — follows tier 17 |

Starting `origin/main`: `1678e0d1d6b55758f6c7222f3e6897a1ed0beaed`.

## Tier 1 — Rename inventory

Captured before any edit. Full classification in
[`docs/migrations/VOILA_RENAME_INVENTORY.md`](../migrations/VOILA_RENAME_INVENTORY.md).

| Measure | Count |
| --- | --- |
| Legacy-brand occurrences at start | 1514 |
| Name-carrying paths (excluding `node_modules/`) | 8 |
| Accented occurrences at start | 0 |
| Model-callable tools renamed | 28 |
| Files under the state directory | 53 (52 tracked + 1 ignored backup) |

Every affected path was assigned exactly one of the six categories before editing began.

## Tier 2 — Active code/API rename

Command surface: `/voila` registers exactly once; `/newfang` does not register. All 17 subcommands
survived, argument completion still narrows by prefix and returns `null` on no match.

Tool surface: 28 tools, every one prefixed `voila_`, zero prefixed `newfang_`. Schemas, labels,
descriptions, prompt snippets, and prompt guidelines carry no legacy or accented spelling. Each tool
retains an executor, a schema, a label, and a description.

Identifiers renamed: `NewfangTool`, `NewfangToolCtx`, `NewfangToolResult`, `NewfangUi`, `NewfangCtx`,
`NewfangHost`, `NewfangEvent`, `NewfangStateError` -> `Voila*`; `registerNewfang` -> `registerVoila`;
`newfangTools` -> `voilaTools`; `newfangExtension` -> `voilaExtension`; `NEWFANG_DIR` -> `VOILA_DIR`;
`EXCLUDE_NEWFANG` -> `EXCLUDE_STATE_DIRS`.

Constants: `HOME_WIDGET_KEY` is `voila-home`; context injection uses `customType: "voila-context"`.

Files moved with `git mv`: `.pi/extensions/newfang.ts` -> `.pi/extensions/voila.ts`;
`docs/research/NEWFANG_CAPABILITY_MATRIX.md` -> `docs/research/VOILA_CAPABILITY_MATRIX.md`. No
parallel adapter remains.

Runtime text a user reads was checked headlessly: the non-TUI fallback, the uninitialized widget,
the legacy-migration widget, and the state-directory-conflict widget all say Voila and none contains
a prohibited spelling.

Evidence: `test/product-identity.test.ts` (16 tests).

## Tier 3 — Package rename

`package.json` and `package-lock.json` both name `voila` (lockfile at both the root `name` and
`packages[""].name`). The description names Voila. The version was **not** changed: no existing
versioning rule requires a bump for a rename.

## Tier 4 — Legacy-state migration tests

`test/legacy-migration.test.ts`, 27 tests. Covered:

- all four detection cases (neither / current only / legacy only / both);
- read-only inspection: tree byte-identical afterwards, no destination created, repeatable;
- byte-for-byte preservation of intake, orientation, and receipt artifacts;
- review-log and receipt-output preservation;
- exactly one appended `state_directory_migrated` event, with prior history unchanged and still
  first in the file;
- bounded metadata rebrand (`displayName`, `nextAction`, `nextActionRationale`) with records left
  alone;
- status-view and project-brief regeneration through supported code;
- no leftover legacy or temporary directory;
- safe rerun after success (no-op, no revision bump);
- refusal to overwrite an existing `.voila/` tree;
- refusal of a legacy directory with no `project.json`, and of malformed canonical JSON, **before**
  any move;
- post-move verification rejecting both a changed artifact byte and unreadable canonical state;
- rollback restoring `.newfang/` with an identical digest and no destination left behind;
- a failed rollback reported loudly, naming where the tree actually is;
- a legacy tree on schema v1 migrating its directory first, then its schema, as two reported
  transitions;
- `init` refusing to initialize beside legacy state;
- doctor failing on legacy-only and on conflict, passing after migration.

The rollback path is exercised against the production functions (`verifyMigratedTree`,
`rollbackMigration`) that `applyLegacyMigration` itself calls, not a re-implementation. It cannot be
triggered end-to-end without injecting a filesystem fault, because pre-move and post-move validation
read the same bytes; that is stated rather than papered over.

## Tier 5 — Repository dogfood migration

Performed through `runMigrate`, the same function `/voila migrate` dispatches to. `mv` was not used.

Inspection first:

```text
Legacy state migration available: .newfang/ -> .voila/.
  Files: 53 (48 immutable artifact file(s))
  Schema version found: v4
  Preserved byte-for-byte: intakes/, orientations/, receipts/, events.jsonl
  Current metadata rebranded: displayName, nextActionRationale
```

The full 53-file tree was hashed before and after the inspection and was byte-identical, and no
`.voila/` directory was created. The inspection is read-only in fact, not only by intent.

Then `--apply`. Afterwards no `.newfang/` directory and no temporary directory remain.

## Tier 6 — Immutable artifact hash comparison

```bash
( cd .newfang && find intakes orientations receipts -type f -print0 \
    | sort -z | xargs -0 shasum -a 256 ) > before.sha256
# ... migrate ...
( cd .voila && find intakes orientations receipts -type f -print0 \
    | sort -z | xargs -0 shasum -a 256 ) > after.sha256
diff -u before.sha256 after.sha256
```

**48 artifact files, zero differences.**

Across the whole 53-file tree the file set is unchanged and exactly three files differ:
`project.json`, `events.jsonl`, and `views/PROJECT_STATUS.md` — each through a supported transition
(canonical update, appended event, regenerated view). `briefs/PROJECT_BRIEF.md` was regenerated
separately through `writeProjectBrief`.

## Tier 7 — Intake/review preservation

All 8 intakes present with unchanged statuses: INT-1 accepted, INT-2 accepted, INT-3..INT-7
source_preserved, INT-8 accepted. INT-8's `reviews.jsonl` retains all 3 append-only records. Doctor
reports 8 intakes consistent and 3 accepted intakes with recorded apply events. Both orientations
(ORI-1, ORI-2) present.

## Tier 8 — Proof receipt preservation

All 4 receipts (RCP-1..RCP-4) and both claims (CLM-1, CLM-2) present. Doctor:

- `receipt artifacts`: 4 receipts present and consistent with canonical metadata;
- `receipt output hashes`: stored output matches its manifest hashes;
- `proof references`: claims, receipts, and requirements resolve;
- `claim criterion agreement`: covered criteria match work items.

Claim `knownLimitations` still name `.newfang/` where the original claim said so. That text is bound
to receipt evidence and was deliberately not rewritten.

`DEC-10` appears exactly once. Focus remains `NF-2`. **No work item became completed** — all 8 remain
in their prior statuses. D1 and D4 remain open; no fix was attempted.

`CLM-1` and `CLM-2` are now **stale**, and `ORI-2` is stale. This is correct and expected: the rename
changed tracked source, so the repository fingerprint moved and prior evidence no longer describes
the current tree. Nothing was re-completed or re-attested to hide it.

## Tier 9 — Fingerprint behavior

`test/proof.fingerprint.test.ts`, 15 tests. New coverage:

- untracked and tracked legacy `.newfang/` state does not change the fingerprint;
- migrating `.newfang/` to `.voila/` leaves the fingerprint identical;
- with both directories excluded, untracked source, tracked working-tree modifications, and staged
  changes still change the digest, and a similarly named sibling (`voila-notes.md`) is **not**
  excluded.

Pre-existing guarantees retained: determinism, HEAD sensitivity, path independence, no raw diff or
absolute path in the record, and a receipt not invalidating its own fingerprint.

## Tier 10 — Rename guard

`test/rename-guard.test.ts`, 8 tests, driven by
[`test/fixtures/legacy-brand-allowlist.json`](../../test/fixtures/legacy-brand-allowlist.json).

The guard scans every tracked text file for `NewFang`, `Newfang`, `newfang`, `NEWFANG`, `Voilà`, and
`voilà`, and fails in **both** directions: an unlisted file containing one fails, and a listed file
that no longer contains one fails. The allowlist rejects directory prefixes and globs outright, and
requires a category, a reason of at least 30 characters, and explicit `immutable` / `removable`
flags per entry.

59 entries:

| Category | Entries |
| --- | --- |
| historical-evidence | 44 |
| legacy-migration-compatibility | 10 |
| historical-migration-doc | 4 |
| generated-projection | 1 |

Additional assertions that keep the exemptions from hiding regressions:

- 21 named core active surfaces must be clean **and** must never appear on the allowlist;
- `.voila/project.json` is allowlisted for its quoted records, but its current-truth fields
  (`displayName`, `nextAction`, `nextActionRationale`) are asserted clean separately;
- the generated view and brief must have clean headers naming Voila;
- the accented spelling has **no** historical exemption — it may appear only in the files that exist
  to prohibit it;
- no tracked path name carries the old brand except `docs/migrations/NEWFANG_TO_VOILA.md`.

A binary-file heuristic matching git's own (NUL within the first 8000 bytes) is used, because
`src/commands/doctor.ts` legitimately contains `join("\0")` and is a text file. That NUL predates
this packet and is unrelated to the rename.

## Tier 11 — Pi extension registration (headless)

The real default export of `.pi/extensions/voila.ts` was driven against a recording host. It
registers the `voila` command exactly once, 28 `voila_*` tools, and the `session_start` and
`before_agent_start` handlers. Registering any name twice throws in the test host, so a duplicate
registration would fail rather than pass silently.

This is headless verification of the adapter's contract. It is not a substitute for tier 13.

## Tier 12 — Project Steward loading (structural)

`.pi/skills/project-steward/SKILL.md` frontmatter parses: `name: project-steward`, and a
single-line **quoted** description beginning "Act as the Voila Project Steward" (the quoting fix from
Packet 4R is preserved — an unquoted colon breaks Pi's YAML load). The skill body contains no
prohibited spelling and teaches `voila_*` tools and `.voila/` paths only.

Confirming Pi actually loads the skill at runtime belongs to tier 13.

## Tier 13 — Interactive TUI — PENDING

**Not performed. No TTY is available in this environment.**

```text
process.stdin.isTTY:  undefined
process.stdout.isTTY: undefined
```

`mise exec -- npm run pi` exits immediately with status 0 rather than starting the TUI. This is the
same constraint recorded in Packet 4R.

The following require a real terminal and are **not claimed**: startup listing
`.pi/extensions/voila.ts`, the Project Steward skill loading in Pi, the ambient widget, `/voila home`
opening, Focus/Work/Proof/Project Truth panes rendering, `/voila status`, `/voila doctor`,
`/voila claims`, `/voila proof`, `/voila intake status`, `/voila migrate` reporting post-migration
state, `/newfang` being unavailable in the command palette, narrow-resize behavior, help accuracy,
reload, and clean exit.

Terminal width, Pi version, and per-item results are to be recorded here when the tier is run.

## Tier 14 — Doctor

`/voila doctor` after the dogfood migration: 23 checks, 21 PASS, 2 WARN, 0 FAIL.

```text
[PASS] state directory: .voila/
[PASS] voila state: project.json present
[PASS] schema migration: at v4
[PASS] canonical state valid: schema-valid v4
[PASS] id counter consistency · work-item references · dependency cycles
[PASS] focus work item: NF-2
[PASS] intake reference: INT-8 · intake artifacts: 8 intake(s) consistent
[PASS] intake apply events: 3 accepted intake(s) recorded
[PASS] proof references · claim criterion agreement · acceptance criterion coverage
[PASS] receipt artifacts: 4 receipt(s) consistent · receipt output hashes match
[PASS] project brief present · generated view matches state
[WARN] orientation freshness: ORI-2 is stale (HEAD moved; AGENTS.md, CLAUDE.md changed)
[WARN] evidence freshness: CLM-1 is stale; CLM-2 is stale
```

Both warnings are honest consequences of the rename changing tracked source.

The new `state directory` check fails on a legacy-only tree with `run /voila migrate --apply`, and
fails on a `.newfang/` + `.voila/` conflict; in both cases doctor stops there, because nothing below
can read canonical state until a human resolves it.

## Tier 15 — Full automated verification

```bash
mise exec -- npm run verify   # tsc --noEmit && prettier --check && node --test
```

**443 tests, 443 passing, 0 failing** (the count above was taken with this record in place, which is
what closes the guard's staleness check).

Baseline before this packet was 382. No existing Packet 4 proof test was removed or weakened; the
57 added tests are new files (`legacy-migration`, `product-identity`, `rename-guard`) plus three
appended fingerprint tests.

## Tier 16 — GitHub CI — PENDING

Recorded after the branch is pushed and Actions completes.

## Tier 17 — GitHub repository rename — PENDING

`gh api repos/jenksed/voila` returned 404 before starting, so the destination name is free. The
rename runs only after the code PR merges and push-to-main CI passes. Not claimed here.

Note: `jenksed/newfang-nerve` is a separate, unrelated repository and is not affected.

## Tier 18 — Post-rename remote verification — PENDING

Follows tier 17.

## Decisions recorded during this packet

`DEC-11` (accepted): the product is Voila; `NF-n` and all other ID namespaces remain stable and are
not renumbered; legacy compatibility is scoped to the state directory, with no `/newfang` or
`newfang_*` alias retained.

`ASM-1` and `RSK-2` had their statements updated through the supported assumption/risk operations —
both are **open** records describing the current architecture, so leaving them naming a directory
that no longer exists would have been misleading. Their substance is unchanged.

`NF-7`'s title was updated through `voila_update_work_item` to name `voila-approval-bundles`; that
project does not exist yet and NF-7 is backlog with no required claims, so no evidence was affected.

## Known limitations

- Tier 13 is unperformed, so no claim is made about the running TUI.
- `docs/product/PRODUCT_DIRECTION.md` is preserved verbatim and still reads as a NewFang document.
  `CLAUDE.md` designates it the authored v0.1 source and forbids silent rewriting, so re-authoring it
  under the Voila name is proposed as separate, explicit work.
- Generated projections quote pre-rename decision, assumption, and risk records verbatim, so a brief
  can display "NewFang" inside quoted record text. The projection's own banner, title, and provenance
  line say Voila.
- The dogfood migration made `CLM-1` and `CLM-2` stale. Restoring current evidence requires re-running
  verification, which is Packet 5 work, not a rename fix.
