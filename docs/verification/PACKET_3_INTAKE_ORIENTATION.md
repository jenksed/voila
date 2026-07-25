# Packet 3 Intake & Orientation — Verification Record

Planning intake, repository orientation, Steward context, and schema v3. Date: 2026-07-25
(closure corrections applied 2026-07-25).

## Verification tiers — status at a glance

| Tier                                                          | Status                                                                    |
| ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1. Automated acceptance (`npm run verify`)                    | **PASS** — 206/206 (191 before this closure)                              |
| 2. Non-model Pi integration (RPC, no auth)                    | **PASS**                                                                  |
| 3. Interactive Steward Console acceptance (Packet 2.5 Tier 3) | **PASS** — human-attested by Joshua                                       |
| 4. Authenticated Project Steward acceptance                   | **PASS** — two real revision requests, then accept, on INT-8              |
| 5. GitHub CI                                                  | **NOT RUN** — workflow is not on `main`, so GitHub has registered no runs |

**No tier is claimed beyond its evidence.** Tier 3 rests on Joshua's direct observation, not on any
check Claude performed; the per-item results and terminal width were not separately recorded. Tier 4
rests on an executed path with durable artifacts, not on the existence of the implementation. Tier 5
has still never run, so daily-use readiness is **not** claimed.

**Defects still open after this closure:** D1 (duplicate detection at preserve time) and D4
(unverified repository-state inferences at high confidence) are recorded for later prioritization and
were deliberately not fixed here. D3 and D2 were release-gating and are fixed.

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
  The first real revision requests were created later, during tier 4, on **INT-8** — and only after
  D3 (below) was fixed, since until then no code path could write one.

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

| Field                                         | Value                                               |
| --------------------------------------------- | --------------------------------------------------- |
| mise                                          | `2026.7.13 macos-arm64`                             |
| Node (via mise)                               | `v22.23.1`                                          |
| Pi CLI (project-local)                        | `@earendil-works/pi-coding-agent@0.82.0`            |
| TypeScript / @types/node / prettier / typebox | `7.0.2` / `22.20.1` / `3.9.6` / `1.1.38`            |
| Starting commit                               | `89ec638` (`feat: add the NewFang Steward Console`) |

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

| Suite                                       | Covers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate-v3` (10)                           | every v2→v3 and chained-migration case above                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `intake.source` (11)                        | exact byte preservation, hash correctness, repo-relative ref, absolute/traversal/**symlink-escape** rejection, missing file, honest text typing, no-overwrite, stable manifest, monotonic INT-n                                                                                                                                                                                                                                                                                        |
| `intake.draft` (9)                          | all 12 categories, unique IDs, provenance required for `origin: "source"`, explicit inference, line-range validation against real source length, proposed-work citation + existing-ID checks, conflict validation, blocking detection, revision increment, **immutable source**                                                                                                                                                                                                        |
| `intake.apply` (10)                         | review-gated apply, confirmation required, exact-revision required, correct entity creation, **requirements do not auto-convert**, blocking-conflict refusal, **idempotent re-apply**, exact-duplicate skipping, brief generation, single apply event, no partial state on failure, reject behavior, reload parity                                                                                                                                                                     |
| `orientation` (12)                          | validated artifact, absolute/home/secret rejection, sha256 required, HEAD staleness, instruction-file staleness, **dirty-only is not stale**, refresh request, live detection, graceful git failure, previous-marked-stale, deterministic view free of absolute paths, reload persistence                                                                                                                                                                                              |
| `context` (9)                               | initialized/uninitialized/migration/error blocks, determinism, pending-intake and stale-orientation lines, bounded slicing, hard clamp, **no source content or event history**, **no state mutation**                                                                                                                                                                                                                                                                                  |
| `intake.ui` (16)                            | all 7 commands, unsafe-path messages, preview-then-confirm, conflict refusal, Attention integration, Understanding Check sections/hash/revision at widths 60–160, scrolling, blocked-state emphasis, key mapping, safe empty state                                                                                                                                                                                                                                                     |
| `orientation` command-evidence (5, closure) | candidate/documented commands cannot carry a result, documented commands preserve their source, observed commands record pass/fail, no output describes commands as verified, context injection does not overstate command confidence                                                                                                                                                                                                                                                  |
| `intake.history` (13, closure)              | two staged revisions, prior draft preserved verbatim, prior Understanding Check preserved, revision-request record, accepted record with exact revision, rejection record, idempotent re-apply writes one accepted record, accepted-revision mismatch detected, missing/non-monotonic revision artifacts detected, accepted intake without a review record detected, append-only log integrity with only the declared fields, restart restoration, staging never overwrites a revision |

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

## Tier 3 — Interactive Steward Console acceptance (PASS — human-attested)

**Result: PASS**, attested directly by Joshua after running the console in a real terminal on
2026-07-25. Claude did not observe the interactive TUI and makes no independent claim about it
(`process.stdin.isTTY === false`; `/newfang home` correctly refused with "needs an interactive
terminal; showing status instead", which is itself evidence Claude could not perform this tier).

Scope of the attestation, recorded precisely so the record is not read as more than it is:

- Attested: the console renders and behaves correctly in interactive use.
- Not separately recorded: pass/fail per checklist item, terminal width, and the Pi version used.

The checklist below is retained as the procedure that was exercised.

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

## Tier 4 — Authenticated Project Steward acceptance (PASS)

Joshua performed `/login` himself; Claude never authenticated and never read, copied, or modified any
credential file. The full path then ran headlessly through Pi RPC against the authenticated provider,
including two genuine human revision requests and a real accept.

**Environment:** provider `anthropic` selected explicitly with `--provider` for every draft in this
tier. Pi's resolved default was `minimax` / `MiniMax-M3`, so the provider is stated rather than
assumed. Every draft below came from the same provider, so the tier's evidence is not mixed.

### The revision gate, exercised for real (INT-8)

This is the claim the tier exists to prove: that a human can force a correction **before** model
interpretation reaches canonical truth. It was previously unprovable — see D3 below.

| #   | Event                  | Evidence                                                                                                                                                                                  |
| --- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Draft 0001 staged      | 34 findings; 29 `source` (all with `sourceRefs`), 5 `model_inference`                                                                                                                     |
| 2   | **Revision request 1** | `2026-07-25T20:08:52.546Z` — two inferences asserted current repository state without checking it                                                                                         |
| 3   | Draft 0002 staged      | `createdAt 2026-07-25T20:11:55.288Z`; corrections landed, but it proposed a risk materially equivalent to RSK-5 while calling the match "exact", and silently cut source findings 29 → 10 |
| 4   | **Revision request 2** | `2026-07-25T20:35:44.077Z` — caught by running the apply preview, which showed 1 new risk would be created                                                                                |
| 5   | Draft 0003 staged      | risk finding removed; source coverage restored to 29; delta explaining every restore/removal                                                                                              |
| 6   | **Accepted**           | `2026-07-25T20:59:26.990Z` at revision 3                                                                                                                                                  |

Applying created exactly **1 decision (DEC-10)** and **0 risks**, skipping 4 exact duplicates. RSK-6
was never created. Canonical state ends at revision 48, focus `NF-2`, **0 completed work items**.

Ordering verified in a single clock (UTC epoch ms), not by mixed local/UTC readings: each request
precedes the draft it caused, and the append-only log is chronological. Drafts 0001 and 0002 and
their Understanding Checks retain their original mtimes — nothing was rewritten.

Both corrections were substantive and checkable, not stylistic: an "open question" the repository had
already implemented and shipped, and a claim that focus had moved to NF-3 when `focusWorkItemId` was
`NF-2`. The second round caught an error the first round introduced.

### What ran earlier (steps 1–7, against INT-2)

| Step                                          | Result                                                                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2. `/newfang doctor`                          | all checks PASS                                                                                                                                                      |
| 3. `/newfang home`                            | correctly refused: "needs an interactive terminal; showing status instead"                                                                                           |
| 4. Steward orientation                        | recorded **ORI-2** at head `20effff0`; `/newfang orient` had correctly reported ORI-1 STALE (`HEAD moved 89ec6387 → 20effff0; AGENTS.md changed`)                    |
| 5. `/newfang intake …PHASE_3_INTAKE_BRIEF.md` | preserved **INT-2**, 57 lines, sha256 `d47fb764…`, `status: source_preserved — nothing has been interpreted or applied yet`                                          |
| 6. Steward staged a draft                     | 34 findings across 10 categories: **29 `source` findings, all carrying `sourceRefs` (zero violations)**, 5 explicit `model_inference`, 7 possible duplicates flagged |
| 7. Understanding Check                        | reviewed; `INT-2` sits at `review_required`                                                                                                                          |

Command-evidence semantics held under a real model: ORI-2 renders
`## Commands (recorded, not verified by NewFang)` with "an observation is not a verification receipt."

### Findings requiring a product decision

1. **Orientation mutated project truth — confirmed defect, corrected.** Asked only to orient and
   record, the Steward also moved focus **NF-2 → NF-3** and rewrote the next action. It went through
   tools, so no invariant was broken, but it exceeded a read-oriented request and silently changed
   project truth no human had reviewed.

   This was caught by `test/dogfood.test.ts`, which asserts the dogfooded focus — the honesty guard
   working as designed, not a stale test. **Resolution:** Joshua directed a restore; focus was set
   back to `NF-2` through `/newfang focus NF-2` (revision 35), never by editing `project.json`. The
   gate returned to 191/191.

   The event log deliberately retains both the drift (`next_action_set`, revision 31) and the
   correction (`focus_set`, revision 35), so the record shows what happened rather than hiding it.
   The Steward's revised `nextAction` and rationale were kept: they remain accurate and are
   substantively equivalent to the originals, which already pointed at the NF-3 work.

   **Open follow-up:** the Project Steward skill should state that orientation records an
   observation and must not reassign focus or rewrite the next action unless asked. Until it does,
   this behavior can recur.

2. **An `observed_in_session` claim was unauditable.** ORI-2 records `mise exec -- npm run verify` as
   `basis=observed_in_session, result=passed`, but that run used `--no-session`, so no transcript
   exists to confirm it. Plausible, not proven. Later steps enabled sessions.
3. **The Node pin does not hold at runtime.** Doctor reports Pi running under **v26.3.0**, not the
   pinned **22.23.1**, via `env node` resolution in `node_modules/.bin/pi`. Node 26 satisfies Pi's
   `>=22.19` engine so nothing breaks, but `npm run pi` is affected the same way.

### Defects found by real use

All four were found by using the system, not by reading it. **D3 and D2 were release-gating and are
fixed in this closure. D1 and D4 are recorded for later prioritization and were deliberately left
alone** — fixing them here would have widened a closure into unrelated work.

**D1 — Duplicate source detection runs at apply time but not at preserve time.**
`/newfang intake <path>` mints a new intake for a byte-identical document it has already ingested and
accepted, with no reuse and no warning. Real use produced **eight intakes sharing one
`sourceSha256` (`d47fb764…`)**: INT-1 and INT-2 accepted, and INT-3 through INT-8 left inert at
`source_preserved` with no drafts. The hash is computed and stored at preserve time, and apply-time
detection already works — INT-2's apply reported `skippedDuplicates: 5` and created nothing — so the
check exists on one side of the boundary only. Six inert records now sit in canonical truth.

_Expected:_ re-preserving an identical `sourceSha256` should reuse the existing intake or warn and
require confirmation, rather than silently creating a new one.

**D2 — `/newfang intake reject` cannot target a non-current intake, and misreads an ID as a reason.**
`runIntakeReject(root, reason?, intakeId?)` accepts an intake ID, but the dispatcher
(`src/extension/register.ts:164`) calls it as
`runIntakeReject(ctx.cwd, args.slice(1).join(" ") || undefined)` — the third parameter is never
passed. Consequently `/newfang intake reject INT-4` rejects the **current** intake and records
`"INT-4"` as the rejection reason. There is no supported command path to reject any intake other
than the current one, and the obvious attempt silently mutates the wrong record.

This blocked cleanup of the D1 clutter: rejecting INT-3…INT-7 is not possible through the supported
surface, and canonical state must not be hand-edited to work around it.

_Expected:_ the dispatcher should forward an explicit intake ID and reject an unknown one, rather
than treating it as free text.

**FIXED.** A leading `INT-n` argument now routes to that intake for both `reject` and `revise`, and
the remaining text is the reason. Regression test in `test/intake.revision.test.ts` proves the named
intake is rejected, the current intake is untouched, and the ID is not stored as the reason.

**D3 — `revision_requested` was a defined review action that nothing could write. (release-gating)**
`REVIEW_ACTIONS` declared it, the record type allowed it, the design documented it, and doctor
checked around it — but `appendReview` was called exactly twice in the whole codebase, for
`accepted` and `rejected`. No tool, command, or console action produced a revision request. A
reviewer could accept or reject, but could not record "correct this first", and a second draft could
silently replace the one under review with nothing recording why. This is why INT-2 went straight
from draft 2 to accepted: there was no third option.

_Expected:_ a supported operation, on every surface, that durably records the request before any
corrected draft can be staged.

**FIXED.** `requestIntakeRevision` in `src/state/intake-store.ts`, exposed as
`newfang_request_intake_revision`, `/newfang intake revise "<feedback>"`, and `v` in the Understanding
Check. It requires `review_required`, the exact current draft revision, and non-empty feedback capped
at 2000 characters; it appends one record, leaves the intake in `review_required` (no new lifecycle
status), refuses a duplicate request for the same revision unless `supersedePrevious` is set, and
never touches prior drafts, views, or records. `stageIntakeDraft` now **requires** a recorded request
against revision N before staging N+1. 15 tests in `test/intake.revision.test.ts`.

The console has no text-input primitive and is read-mostly by design, so `v` surfaces the exact
command pre-filled with the intake and revision under review rather than embedding an editor.

**D4 — Repository-state inferences can carry high confidence without being checked. (open)**
Draft 0001 filed an `open_question` asking whether revision requests need a durable record — already
decided, implemented, and shipped — and asserted at high confidence that state had "moved beyond
Packet 3 to NF-3" when `focusWorkItemId` was `NF-2`, having read the `nextAction` text instead of the
focus field. Neither claim came from the source document; both were claims about the repository
itself. Draft 0002 then called a paraphrased risk an "exact existing canonical risk" when the apply
preview proved it was not exact — it would have created a duplicate.

Provenance was never the failure: all three were correctly labeled `model_inference`, and every
`source` finding carried real `sourceRefs`. The gap is that nothing requires an inference asserting
current code or canonical state to have checked the artifact it is describing.

_Expected:_ narrowly scoped validation for repository-state inferences. **Not fixed here.** No
semantic auto-merge and no broadened duplicate detection were built: the exact-match mechanism
surfaced the RSK-5 paraphrase under `possibleDuplicates` exactly as designed, and human review
resolved it, which is the intended division of labor.

### Post-acceptance verification (INT-8)

| Check                                                            | Result                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `reviews.jsonl` = 2 × `revision_requested` then `accepted` rev 3 | PASS — 3 records, chronological, accept tied to revision 3                  |
| DEC-10 created exactly once                                      | PASS — count 1                                                              |
| No new risk, assumption, or work item                            | PASS — risks 5, assumptions 3, work items 8, all unchanged                  |
| Drafts and Understanding Checks 0001–0003 preserved              | PASS — all six artifacts present; 0001/0002 retain original mtimes          |
| Reapplying revision 3 is idempotent                              | PASS — `alreadyApplied: true`, created 0, revision stayed 48, no new record |
| `/newfang doctor`                                                | PASS — 18/18 checks                                                         |
| Full automated gate                                              | PASS — **206/206**, typecheck and prettier clean                            |

The applied result matched the preview shown before acceptance exactly: 1 decision, 0 assumptions,
0 risks, 0 work items, 4 exact duplicates skipped.

### Not recorded, deliberately

`INT-2` carries two staged drafts and a `reviews.jsonl` with a single `accepted` record. Draft 0002
there resulted from a re-run after a tooling timeout, **not** from a revision request, so **no
`revision_requested` record was written** — that revision never happened, and none was fabricated to
make the history look tidier. INT-2 was accepted directly from draft 2. The genuine revision chain
is INT-8's, above.

`INT-3` through `INT-7` are inert `source_preserved` records with no drafts, produced by D1 and left
in place because D2 blocked cleanup through the supported path. See both defects above.

### Provider attribution and what it does not claim

Every draft in this tier (INT-8 revisions 1–3) came from provider `anthropic`. Ongoing Steward
testing switches to Pi's default `minimax` / `MiniMax-M3` by dropping the `--provider` override; each
authenticated run records the provider and model it used.

Two claims are kept separate on purpose:

- **Interpretation quality** observed from a particular model, and
- **Effectiveness of NewFang's review and enforcement gates.**

A weaker or merely different model produces more interpretation errors and therefore exercises the
gate harder. That is evidence about the gate, not about the Project Steward's quality, and it is not
presented as either. Nothing in this record compares models.

### Checklist for Joshua

```bash
mise exec -- npm run pi
```

1. Run `/login`; select the intended Claude subscription provider and model.
2. `/newfang doctor`.
3. `/newfang home`.
4. Ask: _"Use the Project Steward skill to orient this repository. Preserve project ownership, inspect
   only what is necessary, and record the orientation through NewFang."_
5. `/newfang intake docs/plans/PHASE_3_INTAKE_BRIEF.md`.
6. Ask: _"Use the Project Steward skill to analyze the current preserved intake. Stage a complete
   intake draft with source-line provenance, explicit model inferences, conflicts, and proposed
   canonical changes. Do not apply it."_
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
