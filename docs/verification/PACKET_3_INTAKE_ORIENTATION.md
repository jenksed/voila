# Packet 3 Intake & Orientation — Verification Record

Planning intake, repository orientation, Steward context, and schema v3. Date: 2026-07-25.

**Verification tiers are separate claims.** Automated tests and non-model Pi integration were verified
here. The **authenticated Project Steward tier is PENDING** — it needs `/login` and a real terminal,
neither of which Claude may or can do. Daily-use readiness is therefore **not** claimed.

## Unmet preconditions found at the start (reported, not worked around)

The packet asked me to confirm three things before starting. All three were **false**:

1. **Packet 2.5 was not merged to `main`.** `main` was at `6865ff6` (Packet 1); Packet 2 (`cb55865`)
   and 2.5 (`89ec638`) existed only on `feat/project-operations`. I branched
   `feat/intake-orientation` from `89ec638` — content-identical to branching from a merged `main`,
   since `main` is a strict ancestor.
2. **GitHub CI has never run.** `origin/main` = `6865ff6`, which predates the CI workflow itself (added
   in the unpushed `cb55865`). No CI pass is claimed anywhere in this record.
3. **Interactive Steward Console verification (Packet 2.5 Tier 3) is still PENDING.**

## Environment and exact versions

| Field | Value |
|-------|-------|
| mise | `2026.7.13 macos-arm64` |
| Node (via mise) | `v22.23.1` |
| Pi CLI (project-local) | `@earendil-works/pi-coding-agent@0.82.0` |
| TypeScript / @types/node / prettier / typebox | `7.0.2` / `22.20.1` / `3.9.6` / `1.1.38` |
| Starting commit | `89ec638` (`feat: add the NewFang Steward Console`) |

No new dependencies were added.

## Baseline (before changes)

`mise exec -- npm run verify`: **95/95 tests pass**; dogfooded schema-v2 state loaded; working tree
clean.

## Schema v3 and migration

v3 adds `intakes`, `orientations`, `currentIntakeId`, `currentOrientationId`, and
`sequences.intake`/`sequences.orientation`. v2 is not redefined; `src/domain/schema-v2.ts` keeps it
readable as a migration source only.

Verified by `test/migrate-v3.test.ts` (10 tests):

- valid v2 inspection reports the `2 → 3` plan and **writes nothing**;
- loading v2 raises **migration required**, never "unknown";
- apply preserves identity (`projectId`, `createdAt`, `displayName`), carries existing work items,
  decisions, focus, and rationale across, and initializes the new collections empty with counters at 1;
- a **timestamped backup** of the original bytes is written before replacement;
- exactly **one** `schema_migrated` event; the status view is refreshed;
- re-running on v3 is a **safe no-op**;
- a v1 state migrates through the **full chain** (`1 → 2 → 3`);
- unknown versions are rejected;
- malformed v2 (bad enum **and** bad entity content) is refused, canonical bytes are unchanged, and
  **no backup** is written.

A real bug was found and fixed here: `loadState` reported `UnknownSchemaVersionError` for v2 instead of
`MigrationRequiredError`.

## Automated test results

`mise exec -- npm run verify` (typecheck + prettier + tests): **173/173 pass, 0 fail** (was 95).

New suites:

| Suite | Covers |
|-------|--------|
| `migrate-v3` (10) | every v2→v3 and chained-migration case above |
| `intake.source` (11) | exact byte preservation, hash correctness, repo-relative ref, absolute/traversal/**symlink-escape** rejection, missing file, honest text typing, no-overwrite, stable manifest, monotonic INT-n |
| `intake.draft` (9) | all 12 categories, unique IDs, provenance required for `origin: "source"`, explicit inference, line-range validation against real source length, proposed-work citation + existing-ID checks, conflict validation, blocking detection, revision increment, **immutable source** |
| `intake.apply` (10) | review-gated apply, confirmation required, exact-revision required, correct entity creation, **requirements do not auto-convert**, blocking-conflict refusal, **idempotent re-apply**, exact-duplicate skipping, brief generation, single apply event, no partial state on failure, reject behavior, reload parity |
| `orientation` (12) | validated artifact, absolute/home/secret rejection, sha256 required, HEAD staleness, instruction-file staleness, **dirty-only is not stale**, refresh request, live detection, graceful git failure, previous-marked-stale, deterministic view free of absolute paths, reload persistence |
| `context` (9) | initialized/uninitialized/migration/error blocks, determinism, pending-intake and stale-orientation lines, bounded slicing, hard clamp, **no source content or event history**, **no state mutation** |
| `intake.ui` (16) | all 7 commands, unsafe-path messages, preview-then-confirm, conflict refusal, Attention integration, Understanding Check sections/hash/revision at widths 60–160, scrolling, blocked-state emphasis, key mapping, safe empty state |

Two more real bugs were caught by these tests: an off-by-one in the context-injection clamp (2401 chars
against a 2400 cap) and a doctor label reporting the wrong schema version.

## Non-model Pi integration (VERIFIED)

Through the real pinned Pi `0.82.0` in RPC mode (no provider auth), with the extension loaded via `-e`:

```text
/newfang intake status → Intakes (1): INT-1 [accepted] rev 1 (current) — docs/plans/PHASE_3_INTAKE_BRIEF.md (file)
/newfang orient        → Orientation ORI-1 — current, head 89ec6387aded, artifact .newfang/orientations/ORI-1/orientation.json
/newfang brief         → generated PROJECT_BRIEF.md with phase/health, focus NF-2, and the next action
/newfang home          → "needs an interactive terminal; showing status instead" (correct non-TUI fallback)
ambient widget         → ["NewFang · BUILD · GREEN · Focus NF-2", "Next: Build claims, verification receipts… · 4 risks"]
```

Registration is asserted in tests: 19 tools registered, `/newfang` command with the new subcommands,
`session_start` and `before_agent_start` handlers.

## Non-model TUI acceptance (PARTIAL — string-level only)

Intake preservation, the Understanding Check (deterministic fixtures at widths 60/80/100/120/160),
apply confirmation, Console Attention integration, the project brief, orientation detail, and reload
parity are all verified **at the string/model level by tests**, and the commands are verified through
RPC. The **interactive terminal rendering** of these views was not observed by Claude (no TTY —
`process.stdin.isTTY === false`). Use the Packet 2.5 checklist plus `u` / `a` / `x` in the console to
confirm interactively.

## Authenticated Project Steward acceptance (PENDING)

Not performed. It requires `/login` (which NewFang and Claude must never do on the user's behalf) and a
real terminal.

### Checklist for Joshua

```bash
mise exec -- npm run pi     # then run /login yourself and pick a provider
```

1. Open the NewFang repository in Pi.
2. Ask for repository orientation (or `/newfang orient` then ask the Steward to re-orient).
3. Ingest the brief: `/newfang intake docs/plans/PHASE_3_INTAKE_BRIEF.md`.
4. Ask the Project Steward to analyze the preserved intake (it should read
   `.newfang/intakes/INT-2/source.md` and call `newfang_stage_intake_draft`).
5. Inspect the Understanding Check: `/newfang intake review`, or `/newfang home` then `u`.
6. Give **one revision request** (e.g. "reclassify X as a proposal, not a locked decision").
7. Confirm `draftRevision` increments to 2.
8. Accept and apply (`a` in the console, or `/newfang intake apply confirm`).
9. Quit and restart Pi.
10. Confirm the brief, focus, orientation, and next action persist.

Record: provider and model name, Pi version, intake ID, final draft revision, what required
correction, the final result, and limitations. **Do not record tokens, credentials, or hidden
reasoning.**

## Dogfooding result

`docs/plans/PHASE_3_INTAKE_BRIEF.md` was preserved as **INT-1**
(sha `d47fb7640215…`), a 13-finding draft was staged (2 explicitly marked model inferences, 0
conflicts, 1 proposed work item), reviewed, and applied.

Applied exactly: **DEC-7, DEC-8, DEC-9** (accepted), **ASM-3**, **RSK-5**, **NF-8**. Re-apply reported
"already applied; nothing changed".

**No duplication of existing project truth**: decisions 6 → 9, risks 4 → 5, work items 7 → 8. Existing
DEC-1…DEC-6, RSK-1…RSK-4, and NF-1…NF-7 were untouched — the draft deliberately did not re-propose
them, which is recorded in its `reviewNotes`.

Orientation **ORI-1** was recorded (4 verified commands, 2 instruction files with hashes, honest
unknowns including "GitHub Actions has never run" and "interactive console verification pending").
Focus stayed **NF-2**; the next action is now the claims/receipts/protected-completion phase (NF-3)
with a rationale explaining that NF-1 cannot be completed until that transition exists.

Doctor on the dogfooded repository: **all checks PASS** (schema at v3, intake artifacts consistent,
intake apply events recorded, orientation current, project brief present, generated view consistent).

## Known limitations

- Interpretation quality is nondeterministic; NewFang guarantees structure, provenance, gating, and
  persistence — not correctness.
- Duplicate detection is exact-match only, by design.
- Review feedback produces a new draft revision but is not itself stored durably (NF-8).
- `verifiedCommands` are trusted as recorded; NewFang does not execute them.
- Interactive TUI rendering unverified by Claude; authenticated Steward tier pending.
- Single-writer assumption for `.newfang/` unchanged.
- CI has still never run (branch unpushed).

## What this packet does NOT prove

- No claims, runtime verification receipts, protected completion, delegation, approval bundles,
  background processes, sandboxing, remote execution, model routing, or release automation.
- NewFang **cannot mark work complete**; NF-1 remains `in_progress` for exactly that reason.
- It does not prove that the model interprets documents correctly — only that its interpretation is
  structured, attributed, reviewable, and inert until accepted.
- Daily-use readiness is **not** claimed: the authenticated tier is pending.
