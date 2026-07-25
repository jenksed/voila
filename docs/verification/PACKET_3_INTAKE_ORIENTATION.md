# Packet 3 Intake & Orientation — Verification Record

Planning intake, repository orientation, Steward context, and schema v3. Date: 2026-07-25
(closure corrections applied 2026-07-25).

## Verification tiers — status at a glance

| Tier | Status |
|------|--------|
| 1. Automated acceptance (`npm run verify`) | **PASS** — 191/191 |
| 2. Non-model Pi integration (RPC, no auth) | **PASS** |
| 3. Interactive Steward Console acceptance (Packet 2.5 Tier 3) | **PENDING** — needs a real terminal |
| 4. Authenticated Project Steward acceptance | **PENDING** — needs `/login` by Joshua |
| 5. GitHub CI | **NOT RUN** — nothing pushed; `origin/main` predates the workflow |

**No pending tier is claimed as passed.** Daily-use readiness requires tiers 3, 4, and 5, so it is
**not** claimed.

## Closure corrections (post-implementation)

Two semantic durability issues were corrected before integration. Because schema v3 is unmerged, both
were made by **amending v3 in place** — no v4 was introduced.

### Command evidence is no longer overstated

`verifiedCommands` / `candidateCommands` are replaced by a single `commands: CommandFinding[]`:

```ts
{ command, basis: "declared_in_documentation" | "observed_in_session" | "candidate",
  observedResult?: "passed" | "failed", evidenceNote?: string }
```

- `declared_in_documentation` **requires** an `evidenceNote` naming the document/manifest (provenance).
- `observedResult` is **rejected** on any basis other than `observed_in_session` — a command that was
  not executed has no result.
- Nothing in the model, the generated orientation, the tools, the skill, or the interface calls a
  command "verified"; the rendered heading states "recorded, not verified by NewFang" and explains that
  an observation is not a verification receipt. Formal verification waits for Phase 4 receipts.
- Injected context reports orientation status only — never command text or command confidence.
- The dogfooded **ORI-1** artifact was migrated: 4 `declared_in_documentation` findings (each citing
  `package.json` scripts) and 1 `candidate`. No command was relabeled as observed, because none was
  executed during that orientation.

### Intake draft and review history are durable

Artifacts moved to numbered, never-overwritten revisions plus an append-only review log:

```text
.newfang/intakes/INT-n/{manifest.json, source.md, drafts/NNNN.json, understandings/NNNN.md, reviews.jsonl}
```

- `manifest.json` carries `currentDraftRevision`; canonical `IntakeRecord` gained
  `acceptedDraftRevision` so the **exact applied revision** is recorded.
- Staging writes new numbered artifacts atomically and **refuses to overwrite** an existing revision.
- `reviews.jsonl` is append-only with exactly six fields (intake ID, reviewed revision, action,
  optional concise feedback, timestamp, resulting status) — **no hidden reasoning, no transcripts**.
- Doctor now verifies: current revision artifact exists and agrees with canonical metadata; revisions
  are monotonic `1..N`; each revision has an understanding artifact; the manifest pointer agrees; an
  accepted intake has an accepted review record; and the applied revision matches that record.
- The existing dogfooded **INT-1** was migrated into the new layout: `drafts/0001.json`,
  `understandings/0001.md`, and a `reviews.jsonl` containing the single **accepted** record for
  revision 1 that actually occurred. **No `revision_requested` record was fabricated** — none happened.
  The authenticated run (tier 4) will create the first real revision request.

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

## Tier 1 — Automated acceptance (PASS)

`mise exec -- npm run verify` (typecheck + prettier + tests): **191/191 pass, 0 fail**
(95 before Packet 3; 173 at Packet 3 implementation; 191 after closure corrections).

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
| `orientation` command-evidence (5, closure) | candidate/documented commands cannot carry a result, documented commands preserve their source, observed commands record pass/fail, no output describes commands as verified, context injection does not overstate command confidence |
| `intake.history` (13, closure) | two staged revisions, prior draft preserved verbatim, prior Understanding Check preserved, revision-request record, accepted record with exact revision, rejection record, idempotent re-apply writes one accepted record, accepted-revision mismatch detected, missing/non-monotonic revision artifacts detected, accepted intake without a review record detected, append-only log integrity with only the declared fields, restart restoration, staging never overwrites a revision |

Two more real bugs were caught by these tests: an off-by-one in the context-injection clamp (2401 chars
against a 2400 cap) and a doctor label reporting the wrong schema version.

## Tier 2 — Non-model Pi integration (PASS)

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

## Tier 3 — Interactive Steward Console acceptance (PENDING)

Intake preservation, the Understanding Check (deterministic fixtures at widths 60/80/100/120/160),
apply confirmation, Console Attention integration, the project brief, orientation detail, and reload
parity are all verified **at the string/model level by tests**, and the commands are verified through
RPC. The **interactive terminal rendering** was not observed by Claude (no TTY —
`process.stdin.isTTY === false`).

### Checklist for Joshua (record pass/fail per item, plus terminal width and Pi version)

```bash
mise exec -- npm run pi
```

1. Ambient widget renders.
2. `/newfang home` opens the console.
3. Switch among Focus, Work, and Project Truth.
4. Navigate with `j` and `k`.
5. Open and close a detail view.
6. Open and dismiss help (`?`).
7. Reload (`r`) — confirm the state revision is unchanged.
8. Resize below 80 columns.
9. Borders and content remain usable.
10. Theme emphasis remains readable.
11. Exit cleanly (`q`).
12. Packet 3 additions: `u` opens the Understanding Check, `j`/`k` scroll it, `Esc` returns.

## Tier 4 — Authenticated Project Steward acceptance (PENDING)

Not performed. It requires `/login` (which NewFang and Claude must never do on the user's behalf) and a
real terminal.

### Checklist for Joshua

```bash
mise exec -- npm run pi
```

1. Run `/login`; select the intended Claude subscription provider and model.
2. `/newfang doctor`.
3. `/newfang home`.
4. Ask: *"Use the Project Steward skill to orient this repository. Preserve project ownership, inspect
   only what is necessary, and record the orientation through NewFang."*
5. `/newfang intake docs/plans/PHASE_3_INTAKE_BRIEF.md`.
6. Ask: *"Use the Project Steward skill to analyze the current preserved intake. Stage a complete
   intake draft with source-line provenance, explicit model inferences, conflicts, and proposed
   canonical changes. Do not apply it."*
7. `/newfang intake review` — inspect the Understanding Check.
8. Give **one real revision request** (correct an overstatement, reclassify a decision, or change a
   proposed work item).
9. Ask the Steward to stage a revised draft.
10. Confirm: the revision increments; `drafts/0001.json` **and** `drafts/0002.json` both exist;
    revision 1's Understanding Check is unchanged; and `reviews.jsonl` contains the
    `revision_requested` record.
11. Review revision 2, then accept and apply (`a` in the console, or `/newfang intake apply confirm`).
12. Confirm: no duplicates created; `acceptedDraftRevision` is 2; the brief updated; orientation still
    available; focus correct; next action + rationale visible.
13. Exit Pi, restart, and confirm the brief, intake, orientation, focus, and next action restore.
14. `/newfang doctor`.

Record: provider, model, Pi version, intake ID, original and accepted draft revisions, the requested
correction, apply result, restart result, doctor result, and limitations. **Do not record credentials,
authentication files, raw hidden reasoning, or private conversation history.**

## Dogfooding result

`docs/plans/PHASE_3_INTAKE_BRIEF.md` was preserved as **INT-1**
(sha `d47fb7640215…`), a 13-finding draft was staged (2 explicitly marked model inferences, 0
conflicts, 1 proposed work item), reviewed, and applied.

Applied exactly: **DEC-7, DEC-8, DEC-9** (accepted), **ASM-3**, **RSK-5**, **NF-8**. Re-apply reported
"already applied; nothing changed".

**No duplication of existing project truth**: decisions 6 → 9, risks 4 → 5, work items 7 → 8. Existing
DEC-1…DEC-6, RSK-1…RSK-4, and NF-1…NF-7 were untouched — the draft deliberately did not re-propose
them, which is recorded in its `reviewNotes`.

Orientation **ORI-1** was recorded (2 instruction files with hashes and, after the closure correction,
5 command findings: 4 `declared_in_documentation` citing `package.json` scripts and 1 `candidate` —
none `observed_in_session`, because none was executed during that orientation). Its honest unknowns
include "GitHub Actions has never run" and "interactive console verification pending".
Focus stayed **NF-2**; the next action is now the claims/receipts/protected-completion phase (NF-3)
with a rationale explaining that NF-1 cannot be completed until that transition exists.

Doctor on the dogfooded repository: **all checks PASS** (schema at v3, intake artifacts consistent,
intake apply events recorded, orientation current, project brief present, generated view consistent).

## Known limitations

- Interpretation quality is nondeterministic; NewFang guarantees structure, provenance, gating, and
  persistence — not correctness.
- Duplicate detection is exact-match only, by design.
- Review feedback is now stored durably in `reviews.jsonl` (this was NF-8's concern; the record is
  intentionally narrow — action, revision, concise feedback, timestamp, status).
- Command findings are trusted as recorded; NewFang does not execute or verify them (which is why
  nothing is labeled "verified").
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
