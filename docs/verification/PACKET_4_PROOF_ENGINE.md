# Packet 4 — Proof Engine verification record

What was verified, how, and — explicitly — what was **not**. Tiers are separated so a passing test
suite is never mistaken for an interactive or authenticated check.

- **Date**: 2026-07-25
- **Original implementation commit**: `866e0d6` ("feat: add claims, verification receipts, and
  protected completion"), authored on base `20effff`
- **Rebased implementation commit**: `d397dfc` — the same change replayed onto integrated `main`
- **Reconciliation commit**: `1e39b17` ("fix: reconcile the proof engine with Packet 3 closure")
- **Integrated base**: `3169878` (merge of `feat/intake-orientation`; Packet 3 closure)
- **Safety tag**: `packet-4-pre-rebase-866e0d6` (local only, not pushed)
- **Branch**: `feat/proof-engine`
- **Toolchain**: mise-managed Node `26.3.0`, `@earendil-works/pi-coding-agent@0.82.0`, TypeScript
  `7.0.2`, prettier `3.9.6`, typebox `1.1.38`. No dependencies were added.

## Summary of tiers

| Tier                                          | Status      | Evidence                                                                        |
| --------------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| 0. Rebase and reconciliation                  | **PASS**    | `866e0d6` → `d397dfc` onto `3169878`; 6 conflicts resolved field-by-field       |
| 1. Automated tests                            | **PASS**    | 387/387 via `mise exec -- npm run verify` (main baseline 206)                   |
| 1b. Migration against the integrated v3 state | **PASS**    | 7 tests over the real schema-v3 `project.json` from `3169878`                   |
| 2. Pi registration (non-model)                | **PASS**    | 28 tools registered; asserted by tests and observed over RPC                    |
| 3. Structured execution                       | **PASS**    | `/newfang verify CLM-2 -- mise exec -- npm run verify`, no shell, explicit argv |
| 4. Passing receipt                            | **PASS**    | RCP-3 and RCP-4, manifest agreement and output hashes revalidated               |
| 5. Failing receipt                            | **PASS**    | honest `failed` receipt (exit 3) in a bounded fixture repository                |
| 6. Stale-evidence demonstration               | **PASS**    | performed on this repository; fingerprint returns exactly                       |
| 7. Protected-completion fixture               | **PASS**    | rejection preserves canonical bytes; success is fully gated                     |
| 8. Interactive Proof view (TUI)               | **PARTIAL** | 18/19 PASS; D5 and D6 both fixed and machine-verified; D6 awaits re-attestation |
| 9. Authenticated model use                    | **PENDING** | requires `/login`; the agent must not authenticate                              |
| 10. GitHub CI                                 | **PASS**    | run 30177880494 on PR #4 — `verify` job green                                   |
| 11. Doctor                                    | **PASS**    | 22 PASS, 2 WARN (both honest), 0 FAIL; no Packet 3 check removed                |

Tier 8 ran over three human-attested passes and found **two** real defects. **D5** (the Project
Steward skill never loaded) is fixed, regression-tested, and re-attested. **D6** (overflow at
minimized terminal width) is **open**: Joshua corrected an initial pass on that item. A first
reproduction attempt reported "no overflow" — that result was a false negative from a malformed
probe and has been **retracted**; see the correction under D6. The corrected sweep confirms a real
renderer overflow below 27 columns, now fixed. **D6 was then reproduced directly** by driving the
real Pi TUI inside a sized pseudo-terminal: below 20 columns the console clamped its layout up to the
20-column floor and emitted lines wider than the terminal. It is classified as a NewFang content-line
overflow from `renderConsole`, is fixed, and is re-verified in the same PTY harness — but it still
needs Joshua to re-attest at the previously failing width. Eighteen of nineteen items pass; rendered
values were cross-checked against the domain, so what renders is accurate.

Tier 9 (authenticated model use) remains **not claimed**. It is the same human gate outstanding
since Packet 2.5, is not a Packet 4R acceptance gate, and requires credentials Claude must not
handle.

**Sixteen of seventeen acceptance gates are met. Gate 14 is not**: D5 and D6 are both fixed and
machine-verified, but the interactive tier is human-attested by definition and D6's fix has not been
re-attested in Joshua's terminal. Gate 17 (merge) is deliberately not taken.

| #   | Gate                                                  | Result                                                                         |
| --- | ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | Packet 3 closure history intact                       | PASS — 36/36 artifacts and 48 events byte-identical                            |
| 2   | INT-8 revision 3 remains accepted                     | PASS — canonical and `reviews.jsonl`, before and after migration               |
| 3   | D2 and D3 remain fixed                                | PASS                                                                           |
| 4   | D1 and D4 remain open and unchanged                   | PASS                                                                           |
| 5   | Schema v3 migrates correctly to v4                    | PASS — 7 tests over the real integrated v3 state                               |
| 6   | Claims cover exact acceptance criteria                | PASS — exact-match enforced; doctor agrees                                     |
| 7   | Structured verification creates immutable receipts    | PASS — RCP-3, RCP-4                                                            |
| 8   | Passing, failing, timeout, stale represented honestly | PASS                                                                           |
| 9   | Receipt creation does not invalidate itself           | PASS — same fingerprint across RCP-3/RCP-4                                     |
| 10  | Protected completion cannot be bypassed               | PASS — 11 gates; generic paths refuse                                          |
| 11  | Rejected completion preserves canonical bytes         | PASS — byte-identical                                                          |
| 12  | Existing intake and orientation workflows still pass  | PASS — all Packet 3 suites, unchanged counts                                   |
| 13  | Complete automated gate passes                        | PASS — 387/387                                                                 |
| 14  | Interactive Proof view passes                         | **NOT MET** — D6 fixed and PTY-verified; needs Joshua to re-attest at ≤19 cols |
| 15  | Doctor passes                                         | PASS — 22 PASS, 2 honest WARN, 0 FAIL                                          |
| 16  | GitHub CI passes                                      | PASS                                                                           |
| 17  | PR merged with a merge commit                         | **NOT TAKEN** — blocked on gate 14                                             |

## Tier 0 — Rebase and reconciliation

`feat/proof-engine` was created from `20effff`, which predates the Packet 3 closure commits
(`a844ca5` supported revision path, `b41911a` authenticated acceptance) and the `main` merge
`3169878`. The rebase therefore had to apply Packet 4's schema-v4 additions **onto** the newer
canonical state rather than replace it.

Six conflicts, each resolved at the field/operation level:

| File                                 | Conflict                     | Resolution                                                                                                                           |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/ui/steward-console/render.ts`   | help keys                    | kept Packet 3's `a / v / x` revision affordance **and** Packet 4's `Focus → Work → Proof → Project Truth` cycle                      |
| `test/extension.integration.test.ts` | tool count 20 vs 27          | 28 = 11 core + 9 intake + 8 proof; added explicit assertions for `newfang_request_intake_revision` and `newfang_complete_work_item`  |
| `test/tools.test.ts`                 | sorted tool list             | union of both sides; `newfang_request_intake_revision` retained alongside `newfang_require_claim` / `newfang_run_verification`       |
| `.newfang/project.json`              | next action, sequences, tail | Packet 3 base (INT-8, ORI-2, `intake: 9`, `orientation: 3`, revision 48) **plus** schema-v4 additions and `claim`/`receipt` counters |
| `.newfang/events.jsonl`              | revisions 30–48 vs 30–36     | main's 48 events kept byte-identical; four Packet 4 transitions appended as 49–52                                                    |
| `.newfang/views/PROJECT_STATUS.md`   | generated output             | not spliced; regenerated through the supported operation afterwards                                                                  |

Three Packet 4 events were **dropped**: two superseded `verification_recorded` entries and the
`receipts_reset_pre_commit` that discarded them. Their receipt artifacts were deleted before the
original commit, so retaining the events would have shown immutable receipts changing result.
`CLM-1`, `RCP-1`, and `RCP-2` were **retained** because `NF-3.requiredClaimIds` references `CLM-1`,
and their receipts stay pinned to `gitHead 20effff` — which is exactly why `CLM-1` now reads `stale`
rather than falsely current.

### Packet 3 preservation, verified mechanically

```text
36/36 intake, orientation, and brief artifacts    byte-identical to origin/main
INT-8 reviews.jsonl                               byte-identical (rev 1 requested, rev 2 requested, rev 3 accepted)
10 Packet 3 source files                          unchanged by the rebase
12 Packet 3 test files                            present with identical test counts
docs/verification/PACKET_3_*.md, PACKET_2_5_*.md  byte-identical
.github/workflows/ci.yml                          byte-identical
decisions / assumptions / risks / intakes / orientations   nothing lost, nothing changed
workItems                                         only additive: requiredClaimIds (NF-3 -> [CLM-1])
DEC-10 count 1 · focus NF-2 · D1 and D4 still open · D2 and D3 still fixed
```

## Tier 1b — Migration against the real integrated v3 state

The original packet tested `3 → 4` only against a synthetic v3 envelope. The integrated Packet 3
`project.json` at `3169878` is itself schema **v3**, so it was captured verbatim as
`test/fixtures/integrated-v3-project.json` and seven tests were added over it:

```text
the integrated Packet 3 state is genuinely v3 and carries the real history
the integrated v3 state migrates to v4 and keeps every intake and review record
accepted INT-8 revision 3 survives the migration as accepted
migrating the integrated state completes no work item and invents no proof
migrating the integrated state appends exactly one event and refreshes the view
inspecting the integrated v3 state is read-only
migrating the integrated v3 state backs up the original bytes
```

All eight intakes carry through with metadata deep-equal to their pre-migration records, `DEC-10`
appears exactly once, focus stays `NF-2`, every work item gains `requiredClaimIds: []`, and no item
becomes completed. Inspection writes nothing: the reported backup path is a `<timestamp>` plan, and
the backups directory stays empty until `--apply`.

## Tier 1 — Automated tests

```text
mise exec -- npm run verify          (rebased branch)
  → tsc --noEmit          clean
  → prettier --check      clean
  → node --test           tests 387 · pass 387 · fail 0
```

Counts across the reconciliation:

| Point                                                         | Tests |
| ------------------------------------------------------------- | ----- |
| integrated `main` (`3169878`) baseline                        | 206   |
| `feat/proof-engine` before rebase (`866e0d6`, base `20effff`) | 360   |
| after rebase (`d397dfc`)                                      | 375   |
| after reconciliation (`1e39b17`)                              | 382   |
| after the D5 skill-loading fix                                | 383   |

No Packet 3 regression test was removed to make the rebase pass. The 382 → 383 gain is the D5
skill-loading regression test. The 375 → 382 gain is the seven new
migration tests over the real integrated v3 state; the 360 → 375 gain is main's intake-revision
suite arriving through the rebase.

New test files:

| File                             | Covers                                                                                                                                                                  |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/migrate-v4.test.ts`        | v3 inspection, 3→4 apply, defaults, backup, single event, view refresh, no-op rerun, byte-identical failure, v3 validator                                               |
| `test/proof.claims.test.ts`      | ID sequence, references, exact criterion matching, updates, limitations, requirement linking, derived evaluation, coverage                                              |
| `test/proof.receipts.test.ts`    | pass/fail/timeout/error, ANSI stripping, path normalization, truncation, cwd safety, immutability, manifest/hash consistency, link-only-after-artifact, staging cleanup |
| `test/proof.fingerprint.test.ts` | determinism, HEAD/tracked/staged/untracked sensitivity, path independence, `.newfang/` exclusion, receipt self-invalidation, no diff retention                          |
| `test/proof.completion.test.ts`  | 16-case table-driven gate matrix, all-gates reporting, byte-identical rejection, focus clearing, one event, no alternative path                                         |
| `test/proof.ui.test.ts`          | Proof view at all widths, four evaluation states, detail views, attention, widget contract, context injection                                                           |
| `test/proof.tools.test.ts`       | tool registration/schemas, each tool's behavior, all four commands, 14 doctor diagnostics                                                                               |

Two real defects were caught by these tests during development and fixed:

1. **The receipt counter never advanced.** `runVerification` reserved an ID but discarded the
   incremented sequences, so a second run would have re-allocated `RCP-1`. Fixed by making
   `linkReceipt` re-derive the ID from the canonical counter inside the reducer and refuse the link
   if it no longer matches.
2. **Captured output leaked an absolute home path.** The dogfooding guard in `test/dogfood.test.ts`
   caught `/Users/<name>/...` inside a stored `stdout.txt` (from a test-runner stack trace). Fixed by
   normalizing machine-specific prefixes (`repository root → <repo>`, `home → ~`) before capping and
   hashing, recorded in the manifest as `pathsNormalized`.

## Tier 2 — Pi registration (non-model)

Exercised through the real `.pi/extensions/newfang.ts` adapter and a structural fake host:

- **28** tools register — 11 core + 9 intake (including `newfang_request_intake_revision`) + 8 proof —
  each with a strict typebox schema and `additionalProperties: false`.
- `/newfang` gains `claims`, `proof`, `verify`, `complete` in `SUBCOMMANDS` and argument completion,
  while keeping Packet 3's `intake revise`.
- No proof tool accepts a filesystem root, and none exposes a support flag or completion bypass.
- `test/extension.integration.test.ts` asserts the count and the presence of both the Packet 3
  revision tool and the protected completion tool.

Observed non-interactively through real Pi `0.82.0` in RPC mode
(`pi --mode rpc --no-session -e <repo>/.pi/extensions/newfang.ts`):

```text
session_start  → widget ["NewFang · BUILD · GREEN · Focus NF-2",
                         "Next: … · 4 risks · 1 stale"]
/newfang proof → Proof — 1 claim(s): supported 0 · unsupported 0 · stale 1 · pending 0
                 CLM-1 [STALE] the repository changed since RCP-2 was recorded; re-run verification
                 NF-3 — 2 gate(s) failing
/newfang verify CLM-2 -- mise exec -- npm run verify → Recorded RCP-3: passed (exit 0)
/newfang doctor → 22 PASS, 2 WARN (both honest; see Tier 11)
/newfang intake status, /newfang status → unchanged Packet 3 behavior
```

The widget reporting `1 stale` on the very first load is itself the evidence for Part 7: the rebase
did not leave pre-rebase receipt metadata falsely marked current.

Not exercised: a live Pi TUI session (tier 8) and any model-driven tool call (tier 9).

## Tier 3 — Structured execution

Real subprocesses, not mocks:

- `spawn` with `shell: false` against temporary git repositories, covering exit 0, non-zero exit,
  missing executable (`error`), and a real 1-second timeout (`timed_out`).
- Shell syntax passed as an argument is verified to arrive **literally** (`$HOME && echo pwned` is not
  expanded or chained), confirming no shell is involved.
- Eight shell-string forms are refused before execution.
- Working-directory safety: `..`, absolute paths, `~`, a symlink escaping the repository, and a
  regular file are each rejected; a legitimate `sub` directory is confirmed to be the process cwd.

On the **rebased** repository, the real project gate was executed through NewFang using exactly the
contract `{"executable": "mise", "args": ["exec", "--", "npm", "run", "verify"], "cwdRef": "."}`,
once through the command surface and once through the tool surface. The command surface echoes the
structured argv before running anything:

```text
/newfang verify CLM-2 -- mise exec -- npm run verify

Running verification (no shell, structured argv):
  claim:      CLM-2
  executable: mise
  args:       "exec" "--" "npm" "run" "verify"
  cwd:        . (repository root)
  note:       the command may have side effects; this is not a sandbox

Recorded RCP-3: passed (exit 0).
  fingerprint: 95ff7ef7006d…
```

## Tier 4 — Passing receipt

`CLM-2` is a narrowly scoped claim on `NF-3`: that the complete automated gate passes at the recorded
fingerprint. Two passing receipts support it.

| Receipt | Result                    | Recorded via                    | Fingerprint     |
| ------- | ------------------------- | ------------------------------- | --------------- |
| `RCP-3` | `passed` (exit 0, 14.7 s) | `/newfang verify` command       | `95ff7ef7006d…` |
| `RCP-4` | `passed` (exit 0)         | `newfang_run_verification` tool | `95ff7ef7006d…` |

Independently revalidated after recording:

```text
canonical receipt metadata vs manifest.json      ALL AGREE (id, claim, result, executable,
                                                 args, cwdRef, exitCode, timestamps,
                                                 fingerprint, gitHead, outputTruncated)
stdout.txt sha256   4e4034af377d7636…  computed == manifest   (29536 bytes)
stderr.txt sha256   e3b0c44298fc1c14…  computed == manifest   (0 bytes)
machine-specific absolute paths in captured output: 0
capturedEnvironment: "none"
```

**Receipt creation does not stale the receipt.** Immediately after `RCP-3` was written, `CLM-2`
evaluated `supported`, and `RCP-4` — recorded later, after the artifact directory and canonical state
had both been rewritten — carries the _same_ fingerprint `95ff7ef7006d…`. Recording evidence does not
invalidate it, because the fingerprint excludes `.newfang/`.

`RCP-1` and `RCP-2` (from the pre-rebase run at `gitHead 20effff`) are retained and now read
**stale**, which is the correct and honest outcome of the rebase.

### Pre-commit artifact cleanup (disclosed, historical)

Before the original `866e0d6` commit, an earlier pair of receipts was recorded while path
normalization did not yet exist; one embedded an absolute home path. Because they had never been
committed — working-tree scratch, not history — they were deleted and re-recorded with the fixed
code rather than shipped with a leak. This was a deliberate one-off by the author;
**NewFang itself never deletes a receipt at runtime**. The `receipts_reset_pre_commit` event and its
two superseded `verification_recorded` entries were dropped during reconciliation (see Tier 0),
because the artifacts they referred to no longer exist and keeping them would have implied that
immutable receipts changed result.

## Tier 5 — Failing receipt

Produced in a **bounded throwaway fixture repository**, not by breaking a production file:

```text
newfang_run_verification { claimId: CLM-1, executable: "node",
                           args: ["-e", "console.error('bounded fixture failure'); process.exit(3)"] }

Recorded RCP-1 for CLM-1: failed (exit 3).
The command did NOT pass. The receipt is valid evidence of that failure; the claim is not supported.
```

The tool returning success means _a receipt was recorded_, not that verification passed — the
distinction is stated in the tool description and demonstrated here. `timed_out` and truncation are
covered by `test/proof.receipts.test.ts` (a real 1-second timeout, per-stream caps recorded honestly
in both the manifest and canonical metadata).

## Tier 6 — Stale-evidence demonstration

Performed against this repository's real canonical state on the **rebased** tree, editing a tracked
file (`test/fixtures/console.ts`) and restoring it byte-for-byte:

```text
pristine tree:         fingerprint 95ff7ef7006d…  CLM-2 supported   (supported 1 · stale 1)
tracked file edited:   fingerprint changed        CLM-2 stale       (supported 0 · stale 2)
fixture restored:      fingerprint 95ff7ef7006d…  CLM-2 supported   (supported 1 · stale 1)
```

The fingerprint returns to its exact prior value on restoration, so reusing the existing evidence is
correct rather than a false reuse — the digest genuinely matches, verified by recomputing
`repositoryFingerprint()` and comparing it to the value stored on `RCP-3`. `git status` confirmed the
fixture was left unmodified. Re-running verification afterwards produced `RCP-4`, a new current
receipt.

Throughout, `CLM-1` stayed `stale` and `CLM-2` tracked the tree — the two claims moved independently,
which is what per-fingerprint evidence should do.

## Tier 7 — Protected-completion fixture

### On real state: nothing was completed retroactively

`NF-3` remains `backlog`. `CLM-1` is stale after the rebase, and `NF-3` still depends on `NF-2`,
which cannot complete until the authenticated Project Steward acceptance (tier 9) is performed.
Packet 3 work was **not** completed retroactively — its acceptance criteria are not supported by
current receipts, so the gate correctly refuses. **0 work items are marked completed in this
repository.**

### In a bounded fixture repository: the full path, both directions

A throwaway git repository was driven through every stage using the real registered tools and the
real `/newfang complete` command:

```text
1. work item + claim + required claim
2. FAILING verification (exit 3)  → RCP-1 failed

/newfang complete NF-1 -> warning
Cannot complete NF-1: 1 gate(s) fail.
  - every required claim supported by current passing evidence:
    CLM-1 is unsupported (RCP-1 failed against the current repository state)

canonical bytes preserved on rejection: true

3. focus NF-1, then PASSING verification → RCP-2 passed

/newfang complete NF-1 -> info
Completed NF-1 — Bounded protected-completion fixture.
Every completion gate passed; the transition is recorded in canonical state and history.
Focus was cleared. Choose the next focus deliberately with /newfang focus <ID>.

events appended by completion: 1
last event: {"type":"work_item_completed","id":"NF-1","revision":8,...}
NF-1 status: completed
```

A second fixture run confirmed the remaining post-conditions, with focus deliberately pointed at a
**different** item and a bystander item present:

```text
NF-1 status: completed
NF-1 updatedAt advanced (completion metadata):        true
NF-1 acceptanceCriteria preserved:                    true
only the requested item completed (NF-2 byte-identical): true
focus NOT cleared when it pointed elsewhere:          true
no other item silently focused:                       true
claim limitations preserved:                          ["Only proves the bounded fixture command exited zero."]
receipts preserved (immutable):                       true
generated view refreshed to match canonical state:    true
generic update rejects 'completed':                   ProjectOperationError
```

Completion metadata is `status: "completed"` plus an advanced `updatedAt` and the appended
`work_item_completed` event carrying timestamp and revision; there is no separate `completedAt`
field.

### Every rejection reason is gated

The eleven gates in `src/domain/proof.ts` cover the full required list — `not_completed`,
`not_blocked`, `not_cancelled`, `dependencies_completed`, `acceptance_criteria_present`,
`required_claims_present`, `required_claims_resolve`, `criteria_covered`, `claims_supported`,
`no_open_high_impact_risk`, `no_blocked_reason` — plus a missing work item, which throws before any
gate is evaluated. A rejection reports **all** failing gates, not just the first.

Completed work is **never** silently reverted; `/newfang doctor` reports a completed item whose
evidence no longer revalidates as a WARNING rather than mutating it.

## Tier 8 — Interactive Proof view — **PARTIAL** (human-attested)

Run by Joshua in a real terminal. Claude did not observe the TUI (`process.stdin.isTTY === false`;
`/newfang home` correctly refuses with "needs an interactive terminal"), so this tier rests entirely
on his direct observation.

First pass:

| Item                          | Result                                |
| ----------------------------- | ------------------------------------- |
| Proof UI rendering            | **PASS**                              |
| Stale-evidence display        | **PASS**                              |
| Project Steward skill loading | **FAIL** → defect **D5**, fixed below |

Second pass, after the D5 fix: skill loading **PASS**, plus eight further render and navigation
items attested and cross-checked against the domain (see below).

Not recorded in either pass: terminal width, Pi version, and the eight remaining checklist entries
(detail open/close, sub-80-column layout, intake review keys, help, reload, exit). Those are
**not claimed**.

### D5 — the Project Steward skill never loaded (pre-existing, now fixed)

Numbered in the **defect** namespace continued from Packet 3's D1–D4 (found by real use), which is
distinct from the ledger's `D<n>` doctrine rows.

The skill's YAML frontmatter used an **unquoted** `description:` whose text contains a colon-space
(`…NewFang-managed project: reading project context…`). YAML parses that as a nested mapping inside a
compact mapping, so Pi's loader rejected the frontmatter and dropped the skill:

```text
warning | Nested mappings are not allowed in compact mappings at line 2, column 14
        | .pi/skills/project-steward/SKILL.md
SKILLS LOADED: []
```

This is a **silent** failure mode: the file looks correct, nothing else fails, and every other tier
still passes — which is exactly why it survived to a human check.

**Not introduced by Packet 4.** The same defect reproduces against `origin/main`'s copy of the file,
so it shipped with Packet 3 and every packet since. Packet 4 rewrote the description text but not the
quoting.

Fix: the description is now a single-quoted YAML scalar (it contains double quotes but no single
quotes, so single-quoting is safe and the text is unchanged). After the fix:

```text
SKILLS LOADED: [ 'project-steward' ]
description length: 585   (Pi's cap is 1024)
DIAGNOSTICS: 0
```

Regression test added in `test/dogfood.test.ts`, asserting through **Pi's own loader** that the skill
loads with zero diagnostics and that the description survives quoting intact. Verified to be a real
guard: reintroducing the unquoted form fails the test, restoring it passes.

Consequence worth stating plainly: for every packet before this one, the "proof-aware Project
Steward context" was only proof-aware in the injected context and tool descriptions — the **skill
file itself was never loaded by Pi**. Tier 9 (authenticated model use) has therefore never exercised
the skill, and remains unclaimed.

### D5 fix re-attested

Joshua confirmed in a real terminal that the skill now loads. Session start showed no skill warning.

### Second interactive observation (human-attested)

Captured from Joshua's terminal on the reconciled branch at `HEAD = 5069494`:

| Item                                                                        | Result   |
| --------------------------------------------------------------------------- | -------- |
| Project Steward skill loads                                                 | **PASS** |
| Focus view renders (Work / Attention / Proof / Project Truth panels)        | **PASS** |
| View switching `Focus → Proof` via the tab bar                              | **PASS** |
| Claim status readable; `stale` emphasis distinguishable                     | **PASS** |
| Required-claim marker (`*`) distinguishes required from non-required claims | **PASS** |
| Receipt list bounded — no stdout dump in the principal view                 | **PASS** |
| Completion-gate row present with a route to the full list                   | **PASS** |
| Footer key hints present                                                    | **PASS** |

**The rendering was cross-checked against the domain, not just eyeballed.** Every number and label on
screen was reproduced from `proofSummary()` and `assessCompletion()`:

```text
on screen: Claims 2 · supported 0 · unsupported 0 · stale 2 · pending 0
domain:    {"total":2,"supported":0,"unsupported":0,"stale":2,"pending":0}   MATCH

on screen: NF-2 is not completable: 3 gate(s) failing — required claims attached
domain:    NF-2 failing=3
             required_claims_present | required claims attached
             criteria_covered        | every acceptance criterion covered by a required claim
             claims_supported        | every required claim supported by current passing evidence   MATCH

on screen: Required claim CLM-1 evidence is stale: the repository changed since RCP-2 was
           recorded; re-run verification
domain:    CLM-1 stale (the repository changed since RCP-2 was recorded; re-run verification)  MATCH

on screen: RCP-1..RCP-4 all marked stale
domain:    HEAD moved to 5069494; every receipt predates it                                   MATCH
```

The truncated Focus-view line `— required claims attached` is the **first failing gate's label**, not
a rendering fault.

All four receipts and both claims read `stale` because the branch has since been committed. This is
the documented by-design consequence of `HEAD` participating in the fingerprint, not a defect.

### Third pass — remaining checklist, all confirmed

Joshua confirmed the remaining eight items in a real terminal
(`mise exec -- npm run pi`, then `/newfang home`):

| Item                                                                                  | Result                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `j`/`k` move the selection across claims, then receipts, then the completion-gate row | **PASS**                                                     |
| `Enter` opens claim detail (coverage + limitations) and closes with `Esc`             | **PASS**                                                     |
| `Enter` on a receipt shows metadata and an artifact pointer only — no stdout dump     | **PASS**                                                     |
| `Enter` on the completion-gate row lists every failing gate readably                  | **PASS**                                                     |
| Below 80 columns nothing overflows or is clipped mid-word                             | **FAIL** → defect **D6**, now fixed; awaiting re-attestation |
| Packet 3 intake review UI: `u` opens the Understanding Check; `a` / `v` / `x` offered | **PASS**                                                     |
| `?` help lists the four-view order and the `a` / `v` / `x` keys; `r` reloads          | **PASS**                                                     |
| `q` exits cleanly                                                                     | **PASS**                                                     |

**Tier 8 remains PARTIAL**: eighteen of nineteen items attested PASS, with one real defect found and
fixed (**D5**) and one still open (**D6**, narrow-width overflow).

### D6 — overflow at minimized terminal width (OPEN)

Joshua initially reported the sub-80-column item as passing, then corrected it: minimizing the
terminal width produces visible overflow. The correction is taken at face value and the item is
recorded as **FAIL**, not smoothed into a pass.

#### Correction: the first reproduction attempt was invalid

An earlier revision of this section reported "0 overflowing combinations" across widths 20–120 and
concluded the renderer was not at fault. **That result was wrong and is retracted.** The probe built
its view model with `buildConsoleModel({ state, fingerprint })`, but `ConsoleInput` has no
`fingerprint` field and requires `status`. The model therefore fell through to the error path, and
every "clean" width was measuring a six-line _"NewFang state problem"_ screen — not the console. The
finding was a false negative produced by a malformed probe.

The probe now builds the model through `buildModelForRoot()`, the same function the TUI uses, and
asserts `model.status === "ok"` before measuring.

#### Corrected measurements

Over the real canonical state, all four views, every selection index, and every combination of
`detailOpen` and `helpOpen` — **1728 combinations** at widths 20, 30, 40, 50, 55, 59, 60, 70, 80,
100, 120, 160:

```text
combinations: 1728 · exceeding width: 3 · exceptions: 0

overflowing cases (all at width 20, claim detail open, 7 columns over):
  width 20 view=proof selection=0 detail=true   max 27
  width 20 view=proof selection=1 detail=true   max 27
  width 20 view=focus selection=1 detail=true   max 27

the offending line, in every case:
  OVER [27] "covers acceptance criteria:"
```

So there **is** a genuine renderer-side overflow: the detail-view label `covers acceptance criteria:`
is emitted at its natural 27-character length without truncation, and overflows any width below 27.
It is a NewFang **content line** originating from `renderConsole`.

#### Second correction: sub-20-column results were not defects

A wider sweep initially reported the header line overflowing at widths 10–19 as well. That is **not**
a defect and is retracted: `renderConsole` clamps with `Math.max(20, …)`, so it deliberately refuses
to render below a 20-column floor and emits 20-column lines. Measuring those against the _requested_
width counted the floor as overflow. Only one real defect remains.

#### Fix (authorized as a separate narrow item)

The claim-detail block pushed fixed labels without sizing them. `covers acceptance criteria:` (27
chars) overflowed from the 20-column floor through width 26. All three literal labels in that block
are now passed through the same `truncate()` every other line uses — `known limitations:` and
`  - (none recorded)` fit at 20 only by luck and were one character from the same bug.

No layout logic changed: no new width arithmetic, no `-2` allowances, no change to `layoutClass`,
`columnWidths`, or the 20-column floor.

Verification after the fix, over the **real** canonical state, widths 20–200, all four views, every
selection index, every `detailOpen`/`helpOpen` pair:

```text
combinations: 26064 · overflowing: 0
```

Regression coverage added in `test/proof.ui.test.ts` at widths
**20, 21, 26, 27, 30, 40, 50, 55, 59, 60, 70, 80** — the band the existing
`WIDTHS = [60, 80, 100, 120, 160]` never touched — plus a test pinning the exact failing shape (the
label truncated with an ellipsis at the 20-column floor). Confirmed to be a real guard: reverting the
fix fails both tests; restoring it passes them.

Two things this does **not** establish:

1. **It is probably not what Joshua saw.** It only manifests below 27 columns and only with claim
   detail open. A merely "minimized" terminal is unlikely to be that narrow.
2. Lines padded to **exactly** `width` are far more numerous than first reported — **26 to 35 per
   screen** at every width, not 1–2. If Pi's component frame reserves any horizontal space while
   reporting full terminal width, a large fraction of every screen would wrap. That remains an
   unconfirmed hypothesis about the host boundary, not a finding.

Existing coverage does not close this: `test/proof.ui.test.ts` asserts no overflow only at
`WIDTHS = [60, 80, 100, 120, 160]`, so **nothing below 60 columns is tested**, and no test models
Pi's own frame — which is exactly why a sub-27-column defect survived.

#### D6 resolved: reproduced in a real PTY, classified, and fixed

Rather than ask for a third round of terminal observation, the TUI was driven directly: a
pseudo-terminal was allocated with `pty.fork()`, sized exactly with `TIOCSWINSZ`, and the real Pi
`0.82.0` TUI was run inside it with `/newfang home` opened. Captured output was ANSI-stripped and
split on both newline and bare CR (the TUI repaints with `\r`), then every line measured.

Static narrow widths were clean — 0 over-width lines at 111, 60, and 40 columns. The defect only
appears on **resize**, which is exactly what was reported and what a fixed-width run never
exercises. Opening the console at 111 columns and then shrinking the terminal:

```text
resize 111 -> 60 cols   lines wider than terminal: 0
resize 111 -> 21 cols   lines wider than terminal: 0
resize 111 -> 20 cols   lines wider than terminal: 0
resize 111 -> 19 cols   lines wider than terminal: 29   <-- overflow begins
resize 111 -> 15 cols   lines wider than terminal: 52
```

**Cause.** `renderConsole` clamped with `Math.max(20, …)`. Below 20 columns it kept laying out at
20 and emitted 20-wide lines into a narrower terminal, which then wrapped every one of them. The
20-column floor was correct as a _layout_ decision and wrong as an _output_ decision: refusing to
lay out is fine, but emitting lines wider than the terminal is not.

Classification, with every requested field:

| Field                           | Value                                                                                                                                                     |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| terminal width                  | overflow at **≤ 19** columns; clean at 20 and above (reported window was 111×57, so the wrap required shrinking well past it)                             |
| active view                     | all four — `focus`, `work`, `proof`, `truth`                                                                                                              |
| selection                       | any; independent of selection                                                                                                                             |
| detail / help open              | either; independent of both                                                                                                                               |
| exact overflowing line          | e.g. `NEWFA… build · green`, `────────────────────`, `NEXT JUSTIFIED ACTI…`, `gate (382 tests) and` — all exactly 20 chars in a 15- or 19-column terminal |
| classification                  | **2 — NewFang content line** (headings, rules, and body text alike; not Pi chrome)                                                                        |
| originated from `renderConsole` | **yes**, confirmed by PTY capture and by the exact 20-column signature                                                                                    |

**Fix.** Below `MIN_CONSOLE_WIDTH` (20, now a named export) the console renders a notice sized to the
_actual_ width instead of clamping up to the floor:

```text
NewFang
needs 20 cols
widen · q quit
```

Nothing else changed: no host-frame allowance, no scattered `-2` arithmetic, no change to
`layoutClass`, `columnWidths`, or the floor value itself.

**Re-verified in the same PTY harness after the fix:**

```text
resize 111 -> 15 cols   lines wider than terminal: 0
resize 111 -> 19 cols   lines wider than terminal: 0
resize 111 -> 20 cols   lines wider than terminal: 0
resize 111 -> 60 cols   lines wider than terminal: 0
```

Regression coverage in `test/proof.ui.test.ts`: every width from 1 to 19, all four views, both detail
states, asserting no line exceeds the terminal; plus a test that the notice names the requirement,
stays within the width, and that a zero-width terminal renders nothing rather than throwing.

### D5 fix re-attested

Joshua confirmed in a real terminal that the skill now loads. Session start showed no skill warning.

### Second interactive observation (human-attested)

Captured from Joshua's terminal on the reconciled branch at `HEAD = 5069494`:

| Item                                                                        | Result   |
| --------------------------------------------------------------------------- | -------- |
| Project Steward skill loads                                                 | **PASS** |
| Focus view renders (Work / Attention / Proof / Project Truth panels)        | **PASS** |
| View switching `Focus → Proof` via the tab bar                              | **PASS** |
| Claim status readable; `stale` emphasis distinguishable                     | **PASS** |
| Required-claim marker (`*`) distinguishes required from non-required claims | **PASS** |
| Receipt list bounded — no stdout dump in the principal view                 | **PASS** |
| Completion-gate row present with a route to the full list                   | **PASS** |
| Footer key hints present                                                    | **PASS** |

**The rendering was cross-checked against the domain, not just eyeballed.** Every number and label on
screen was reproduced from `proofSummary()` and `assessCompletion()`:

```text
on screen: Claims 2 · supported 0 · unsupported 0 · stale 2 · pending 0
domain:    {"total":2,"supported":0,"unsupported":0,"stale":2,"pending":0}   MATCH

on screen: NF-2 is not completable: 3 gate(s) failing — required claims attached
domain:    NF-2 failing=3
             required_claims_present | required claims attached
             criteria_covered        | every acceptance criterion covered by a required claim
             claims_supported        | every required claim supported by current passing evidence   MATCH

on screen: Required claim CLM-1 evidence is stale: the repository changed since RCP-2 was
           recorded; re-run verification
domain:    CLM-1 stale (the repository changed since RCP-2 was recorded; re-run verification)  MATCH

on screen: RCP-1..RCP-4 all marked stale
domain:    HEAD moved to 5069494; every receipt predates it                                   MATCH
```

The truncated Focus-view line `— required claims attached` is the **first failing gate's label**, not
a rendering fault.

All four receipts and both claims read `stale` because the branch has since been committed. This is
the documented by-design consequence of `HEAD` participating in the fingerprint, not a defect.

### Third pass — remaining checklist, all confirmed

Joshua confirmed the remaining eight items in a real terminal
(`mise exec -- npm run pi`, then `/newfang home`):

| Item                                                                                  | Result                                                       |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `j`/`k` move the selection across claims, then receipts, then the completion-gate row | **PASS**                                                     |
| `Enter` opens claim detail (coverage + limitations) and closes with `Esc`             | **PASS**                                                     |
| `Enter` on a receipt shows metadata and an artifact pointer only — no stdout dump     | **PASS**                                                     |
| `Enter` on the completion-gate row lists every failing gate readably                  | **PASS**                                                     |
| Below 80 columns nothing overflows or is clipped mid-word                             | **FAIL** → defect **D6**, now fixed; awaiting re-attestation |
| Packet 3 intake review UI: `u` opens the Understanding Check; `a` / `v` / `x` offered | **PASS**                                                     |
| `?` help lists the four-view order and the `a` / `v` / `x` keys; `r` reloads          | **PASS**                                                     |
| `q` exits cleanly                                                                     | **PASS**                                                     |

**Tier 8 remains PARTIAL**: eighteen of nineteen items attested PASS, with one real defect found and
fixed (**D5**) and one still open (**D6**, narrow-width overflow).

### D6 — overflow at minimized terminal width (OPEN)

Joshua initially reported the sub-80-column item as passing, then corrected it: minimizing the
terminal width produces visible overflow. The correction is taken at face value and the item is
recorded as **FAIL**, not smoothed into a pass.

#### Correction: the first reproduction attempt was invalid

An earlier revision of this section reported "0 overflowing combinations" across widths 20–120 and
concluded the renderer was not at fault. **That result was wrong and is retracted.** The probe built
its view model with `buildConsoleModel({ state, fingerprint })`, but `ConsoleInput` has no
`fingerprint` field and requires `status`. The model therefore fell through to the error path, and
every "clean" width was measuring a six-line _"NewFang state problem"_ screen — not the console. The
finding was a false negative produced by a malformed probe.

The probe now builds the model through `buildModelForRoot()`, the same function the TUI uses, and
asserts `model.status === "ok"` before measuring.

#### Corrected measurements

Over the real canonical state, all four views, every selection index, and every combination of
`detailOpen` and `helpOpen` — **1728 combinations** at widths 20, 30, 40, 50, 55, 59, 60, 70, 80,
100, 120, 160:

```text
combinations: 1728 · exceeding width: 3 · exceptions: 0

overflowing cases (all at width 20, claim detail open, 7 columns over):
  width 20 view=proof selection=0 detail=true   max 27
  width 20 view=proof selection=1 detail=true   max 27
  width 20 view=focus selection=1 detail=true   max 27

the offending line, in every case:
  OVER [27] "covers acceptance criteria:"
```

So there **is** a genuine renderer-side overflow: the detail-view label `covers acceptance criteria:`
is emitted at its natural 27-character length without truncation, and overflows any width below 27.
It is a NewFang **content line** originating from `renderConsole`.

#### Second correction: sub-20-column results were not defects

A wider sweep initially reported the header line overflowing at widths 10–19 as well. That is **not**
a defect and is retracted: `renderConsole` clamps with `Math.max(20, …)`, so it deliberately refuses
to render below a 20-column floor and emits 20-column lines. Measuring those against the _requested_
width counted the floor as overflow. Only one real defect remains.

#### Fix (authorized as a separate narrow item)

The claim-detail block pushed fixed labels without sizing them. `covers acceptance criteria:` (27
chars) overflowed from the 20-column floor through width 26. All three literal labels in that block
are now passed through the same `truncate()` every other line uses — `known limitations:` and
`  - (none recorded)` fit at 20 only by luck and were one character from the same bug.

No layout logic changed: no new width arithmetic, no `-2` allowances, no change to `layoutClass`,
`columnWidths`, or the 20-column floor.

Verification after the fix, over the **real** canonical state, widths 20–200, all four views, every
selection index, every `detailOpen`/`helpOpen` pair:

```text
combinations: 26064 · overflowing: 0
```

Regression coverage added in `test/proof.ui.test.ts` at widths
**20, 21, 26, 27, 30, 40, 50, 55, 59, 60, 70, 80** — the band the existing
`WIDTHS = [60, 80, 100, 120, 160]` never touched — plus a test pinning the exact failing shape (the
label truncated with an ellipsis at the 20-column floor). Confirmed to be a real guard: reverting the
fix fails both tests; restoring it passes them.

Two things this does **not** establish:

1. **It is probably not what Joshua saw.** It only manifests below 27 columns and only with claim
   detail open. A merely "minimized" terminal is unlikely to be that narrow.
2. Lines padded to **exactly** `width` are far more numerous than first reported — **26 to 35 per
   screen** at every width, not 1–2. If Pi's component frame reserves any horizontal space while
   reporting full terminal width, a large fraction of every screen would wrap. That remains an
   unconfirmed hypothesis about the host boundary, not a finding.

Existing coverage does not close this: `test/proof.ui.test.ts` asserts no overflow only at
`WIDTHS = [60, 80, 100, 120, 160]`, so **nothing below 60 columns is tested**, and no test models
Pi's own frame — which is exactly why a sub-27-column defect survived.

**D6 itself stays open.** The label defect above is fixed, but it is **not** the wrap Joshua
reported: his window was **111x57**, and the renderer is now provably clean from 20 to 200 columns
(and was already clean at 111 before the fix). Whatever wraps at 111 columns does not come from
`renderConsole`, so D6 still needs the classification recorded below.

Outstanding classification, to be supplied from a real TUI observation:

| Field                           | Value                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------- |
| terminal width                  | reported window 111x57; width at the moment of wrap not yet captured                           |
| active view                     | not yet recorded                                                                               |
| selection                       | not yet recorded                                                                               |
| detail / help open              | not yet recorded                                                                               |
| exact overflowing line          | not yet transcribed                                                                            |
| classification                  | **1** separator/heading rule · **2** NewFang content line · **3** Pi/startup/notification text |
| originated from `renderConsole` | **undetermined** — decided by whether the line appears in the probe dump at that width         |

Evidence that narrows it: at 111 columns `renderConsole` emits no over-width line, but **26–35 lines
per screen are padded to exactly the requested width**. Against that, Pi's own components use the
same `render(width): string[]` contract and some accept an explicit `outputPad`, which suggests the
width Pi passes is already the usable width. Classification 3 (Pi chrome, `notify` text, or
scrollback — the long `Why now:` rationale block was observed spilling) is not yet excluded.

Scope of the attestation, recorded precisely so it is not read as more than it is:

- **Attested by Joshua**: every item above, by direct observation in a real terminal.
- **Verified by Claude**: that the rendered values are _accurate_ — the claim summary, gate counts,
  gate labels, staleness wording, and receipt markings were each reproduced from the domain and
  matched the screen exactly.
- **Pi version**: `0.82.0` (pinned, asserted by `test/extension.integration.test.ts`, and reported by
  `/newfang doctor` in the same session).
- **Not recorded**: the terminal width used for the wide-layout passes. The sub-80-column case is
  attested, but the exact wide width is not, so no specific width is claimed.

## Tier 9 — Authenticated model use — **PENDING**

Not performed and deliberately not attempted: the agent must not run `/login` or handle credentials.

Checklist for Joshua, after authenticating:

1. Ask the Steward to state a claim about a real work item; confirm it copies criterion text exactly
   and records honest limitations.
2. Ask it to verify the claim; confirm it uses `newfang_run_verification` with structured
   `executable` + `args` rather than narrating a shell command it ran itself.
3. Ask it to complete an unproven item; confirm it reports the failing gates instead of asserting
   completion in prose.
4. Confirm it does not invent narrow claims solely to satisfy the gate.

## Tier 10 — GitHub CI — **PASS**

Claimed only after the run succeeded on the PR, not on local evidence:

```text
PR:  https://github.com/jenksed/newfang/pull/4  (draft, base main)
run: https://github.com/jenksed/newfang/actions/runs/30177880494
job: verify — pass (29s)
```

The run carries a non-blocking annotation that `actions/checkout@v4` and `actions/setup-node@v4`
target the deprecated Node.js 20 and were forced onto Node.js 24. It did not affect the result and is
recorded here rather than silently ignored.

## Tier 11 — Doctor

`/newfang doctor` over the reconciled state: **22 PASS, 2 WARN, 0 FAIL**. No Packet 3 check
disappeared — the check set is a strict superset of main's 22, with 9 added:

```text
added by Packet 4: proof · proof references · claim criterion agreement ·
                   acceptance criterion coverage · receipt artifacts ·
                   receipt output hashes · receipt staging directories ·
                   evidence freshness · completed work revalidation
removed:           (none)
```

Both warnings are honest, not defects:

```text
[WARN] orientation freshness: ORI-2 is stale: HEAD moved (20effff0 -> 1e39b172)
[WARN] evidence freshness: CLM-1 is stale
```

Packet 3 checks still passing after the rebase include `intake reference: INT-8`,
`intake artifacts: 8 intake(s) consistent`, `intake apply events: 3 accepted intake(s) recorded`,
`focus work item: NF-2`, and `schema migration: at v4`.

## Dogfooded state after this packet

- Canonical state migrated `v3 → v4` through the real path: inspected first, then `--apply`, exactly
  one `schema_migrated` event, and a refreshed generated view.
- All eight pre-existing work items received `requiredClaimIds: []`, so none of them became
  completable as a side effect of migration.
- `CLM-1` on `NF-3`, required, covering NF-3's single acceptance criterion, with four recorded
  limitations. **Stale** after the rebase: its receipts were recorded at `gitHead 20effff`.
- `CLM-2` on `NF-3`, narrowly scoped to the automated gate, supported by `RCP-3`/`RCP-4` at
  fingerprint `95ff7ef7006d…` at the time of recording.
- `RCP-1` (failed) and `RCP-2` (passed) from the pre-rebase run; `RCP-3` and `RCP-4` (both passed)
  from the post-rebase run. All four artifacts committed under `.newfang/receipts/`.
- Event log: main's 48 events byte-identical, plus 49–55.
- **0 work items completed.**

### Receipt artifact audit (performed before commit)

- No credentials, tokens, or secrets.
- No environment-variable names or values; `manifest.json` records `"capturedEnvironment": "none"`.
- No absolute repository or home paths in `manifest.json`, `stdout.txt`, or `stderr.txt` (asserted by
  `test/dogfood.test.ts`, which checks every receipt against `homedir()` and `process.cwd()`, and
  re-checked by hand for `RCP-3`: 0 occurrences of the home or repository path).
- No git diffs.
- All streams within the 64 KiB cap; `outputTruncated` false for every receipt.
- No leftover staging directories under `.newfang/receipts/.tmp/`.

## Known limitations recorded honestly

1. The gate protects NewFang's **state transition**, not model prose. A model can still say "done".
2. A `completed` status hand-written into `project.json` is schema-valid; doctor reports when such a
   record no longer revalidates, but nothing rejects the file.
3. Verification is **not sandboxed**. Commands run with the caller's privileges and may have side
   effects.
4. A commit moves `HEAD`, so **the receipts committed with this packet will read `stale` immediately
   after the commit lands**. This is by design, not a defect; re-run verification for current
   evidence.
5. A change confined entirely to `.newfang/` does not invalidate evidence — the deliberate cost of
   excluding NewFang's own bookkeeping so receipts do not invalidate themselves.
6. Without git, nothing can be current, so nothing can be completed.
7. Command verification only: no manual attestation, screenshots, or other evidence types.
8. Single-writer assumption persists; a receipt whose reserved ID no longer matches the canonical
   counter is refused rather than linked.
9. **Reconciliation-specific.** The rebase rewrote the revision numbers of the four retained Packet 4
   events (30–36 → 49–52) while keeping their original timestamps, so the event log is ordered by
   revision, not by wall clock, across that boundary. Main's 48 events are byte-identical.
10. `CLM-1` is stale and stays stale. It is not re-verified here, because doing so would attach
    post-rebase evidence to a claim whose original receipts belong to the pre-rebase tree; the honest
    representation is a stale claim plus a new claim (`CLM-2`) with its own current evidence.
11. **D5 was invisible to every automated tier.** The repository had no test that Pi can actually
    load its own skill files, so a silent frontmatter failure survived four packets. The new
    regression test closes this specific hole; nothing yet asserts that other `.pi/` resources
    (extensions, future skills) load, beyond the extension integration test.
