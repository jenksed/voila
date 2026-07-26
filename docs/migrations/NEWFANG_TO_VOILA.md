# NewFang to Voila

The product formerly developed under the working name **NewFang** is now named **Voila**.

This document exists to explain the transition. It is the one intentional active filename that
contains the old brand, because naming it is its subject.

## The names

| | Before | After |
| --- | --- | --- |
| Product name | NewFang | Voila |
| Lowercase slug | newfang | voila |
| Repository | `jenksed/newfang` | `jenksed/voila` |
| Package name | `newfang` | `voila` |
| Command | `/newfang` | `/voila` |
| Tool prefix | `newfang_` | `voila_` |
| State directory | `.newfang/` | `.voila/` |
| Pi extension | `.pi/extensions/newfang.ts` | `.pi/extensions/voila.ts` |
| Context type | `newfang-context` | `voila-context` |
| Home widget key | `newfang-home` | `voila-home` |

**Voila is plain ASCII.** The accented spellings `Voilà` and `voilà` are never correct, in any
surface, including prose. They never appeared in this repository and a guard now keeps it that way.

## Why historical evidence keeps the old name

Voila's central claim is that completion requires evidence. Evidence that can be silently edited is
not evidence. So the rename stopped at the boundary of the record:

- **Verification receipts** (`RCP-n`) store `stdout.txt` and `stderr.txt` under recorded hashes. The
  captured output of a 2026 test run genuinely said "NewFang". Rewriting it would break the hash and,
  worse, would misrepresent what the command actually printed.
- **Intake sources and drafts** (`INT-n`) are preserved bytes with a recorded `sourceSha256`. The
  whole point of intake is that the source is preserved exactly, not paraphrased.
- **Append-only review logs** (`reviews.jsonl`) record what a reviewer decided and when.
- **Event history** (`events.jsonl`) is append-only. The rename appended one event; it edited none.
- **Verification records** under `docs/verification/` describe what was true at the time, including
  the product's name at the time.
- **Architecture decision records** under `docs/decisions/` record decisions on a date. Their text is
  unchanged; affected ADRs gained an additive `## Rename note` pointing here.
- **Git history, merged PR titles, and old commit messages** are not rewritten.

Where a current document discusses that history, it says so plainly — for example, "Voila, formerly
developed under the name NewFang".

Every remaining legacy-brand occurrence is enumerated by exact path, with a reason, in
[`test/fixtures/legacy-brand-allowlist.json`](../../test/fixtures/legacy-brand-allowlist.json). The
rename guard in [`test/rename-guard.test.ts`](../../test/rename-guard.test.ts) fails on any
occurrence that is not listed, and also fails when a listed file no longer contains one, so the
allowlist cannot quietly rot.

## What changed in the active API

These are **breaking changes**. This is a private pre-1.0 product, and the rename deliberately left
exactly one supported API — no aliases.

### Command

`/newfang` is gone. `/voila` replaces it. All 17 subcommands keep their names:

```text
/voila home        /voila claims       /voila decisions
/voila init        /voila proof        /voila assumptions
/voila status      /voila verify       /voila risks
/voila focus       /voila complete     /voila migrate
/voila intake      /voila orient       /voila doctor
/voila brief       /voila backlog
```

### Tools

All 28 model-callable tools moved from `newfang_*` to `voila_*`. Schemas, parameters, and behavior
are unchanged; only the names differ. `newfang_*` tools do not exist and are not aliased.

### Code identifiers

`NewfangTool`, `NewfangToolCtx`, `NewfangToolResult`, `NewfangUi`, `NewfangCtx`, `NewfangHost`,
`NewfangEvent`, and `NewfangStateError` became `Voila*`. `registerNewfang` became `registerVoila`,
`newfangTools` became `voilaTools`, and `NEWFANG_DIR` became `VOILA_DIR`.

## Migrating an existing `.newfang/` project

Legacy compatibility is scoped to the **state directory only**.

### Detection

Voila distinguishes four cases and never guesses:

| `.newfang/` | `.voila/` | Behavior |
| --- | --- | --- |
| absent | absent | Normal uninitialized project. `/voila init` creates `.voila/`. |
| absent | present | Normal operation. |
| present | absent | Explicit legacy-migration requirement. Nothing reads or writes the legacy tree. |
| present | present | **Hard failure.** Both paths are reported and a human resolves it. |

The ambient widget shows `Voila · legacy state migration required — run /voila migrate`, and
`/voila doctor` reports the state directory as a FAIL until it is resolved.

### Inspect first (read-only)

```text
/voila migrate
```

This writes nothing. It reports the file count, how many of those are immutable artifacts, the
schema version it found, and which current-truth metadata fields would be rebranded. It is safe to
run repeatedly.

### Apply

```text
/voila migrate --apply
```

The migration, in order:

1. hashes the complete `.newfang/` tree and validates its canonical state **before** anything moves;
2. verifies `.voila/` does not exist;
3. moves the tree with a single atomic `rename` of two siblings — never a recursive copy followed by
   a delete, and never a per-file loop that can half-finish;
4. re-hashes the moved tree and compares every file against the pre-move digest;
5. re-validates canonical state;
6. **rolls back to `.newfang/`** if any of that fails, reporting loudly if the rollback itself fails;
7. appends one `state_directory_migrated` event;
8. rebrands current-truth metadata and regenerates the status view and project brief.

Intakes, orientations, receipts, and append-only review logs are never opened for writing. After a
successful migration no `.newfang/` directory and no temporary directory remain, and re-running the
command is a safe no-op.

### What the migration rewrites, and what it will not

**Rewritten** — mutable fields that state current guidance and are regenerated constantly:
`displayName`, `nextAction`, `nextActionRationale`.

**Not rewritten** — records:

- claim statements, covered acceptance criteria, and known limitations (bound to receipt evidence);
- work-item titles, descriptions, and acceptance criteria (covered by those claims);
- decisions, assumptions, and risks (change these through their own supported operations);
- `events.jsonl`.

Generated views quote those records verbatim, so a brief or status view may show a decision that
still reads "NewFang" inside its quoted text. That is intended: the projection must not silently
contradict the record it projects. The projections' own banners, titles, and provenance lines say
Voila, and the rename guard asserts that separately.

## Identifiers are stable

Existing IDs are **not** renumbered:

```text
NF-n   DEC-n   ASM-n   RSK-n   INT-n   ORI-n   CLM-n   RCP-n
```

`NF-n` is now a stable legacy identifier namespace rather than active branding. Allocation continues
in that namespace; there is no `VOI-n` sequence and no mixed numbering.

Renumbering would be a separate domain migration with far greater risk. Receipts, claims, events,
dependency edges, and append-only review records all reference existing IDs, and a claim's
`coveredAcceptanceCriteria` must match its work item's `acceptanceCriteria` exactly. Rewriting IDs
would either break those relationships or falsify recorded evidence.

This is recorded as an accepted project decision (`DEC-11`).

## Schema version

The state directory move does **not** bump `schemaVersion`. A filesystem migration and a domain
schema migration are different concerns: no serialized state shape changed, so there is nothing for
a schema migration to migrate. The next real change to the state shape will introduce the next
explicit schema migration on its own merits.

A legacy project on an older schema needs both transitions. They run and report separately: the
directory move first, then `/voila migrate` again for the schema.

## Repository URLs

The GitHub repository was renamed from `jenksed/newfang` to `jenksed/voila` **after** the code
rename merged and CI passed on `main`.

GitHub redirects the old URL, and existing clones keep working until their remote is updated:

```bash
git remote set-url origin git@github.com:jenksed/voila.git
```

Current documentation points at `jenksed/voila`. Old `jenksed/newfang` URLs inside closed
verification records are left as written — those were the real addresses of those runs.

## Fingerprints

The repository fingerprint that decides evidence freshness excludes `.voila/`, and excludes
`.newfang/` on the same grounds while a legacy directory still exists. Migrating a state directory
therefore does not change the fingerprint and cannot invalidate existing evidence. Nothing outside
those two state directories is excluded: ordinary tracked, staged, and untracked source changes still
move the digest.
