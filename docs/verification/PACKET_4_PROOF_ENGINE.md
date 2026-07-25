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

| Tier | Status | Evidence |
|------|--------|----------|
| 0. Rebase and reconciliation | **PASS** | `866e0d6` → `d397dfc` onto `3169878`; 6 conflicts resolved field-by-field |
| 1. Automated tests | **PASS** | 382/382 via `mise exec -- npm run verify` (main baseline 206) |
| 1b. Migration against the integrated v3 state | **PASS** | 7 tests over the real schema-v3 `project.json` from `3169878` |
| 2. Pi registration (non-model) | **PASS** | 28 tools registered; asserted by tests and observed over RPC |
| 3. Structured execution | **PASS** | `/newfang verify CLM-2 -- mise exec -- npm run verify`, no shell, explicit argv |
| 4. Passing receipt | **PASS** | RCP-3 and RCP-4, manifest agreement and output hashes revalidated |
| 5. Failing receipt | **PASS** | honest `failed` receipt (exit 3) in a bounded fixture repository |
| 6. Stale-evidence demonstration | **PASS** | performed on this repository; fingerprint returns exactly |
| 7. Protected-completion fixture | **PASS** | rejection preserves canonical bytes; success is fully gated |
| 8. Interactive Proof view (TUI) | **PENDING** | requires a terminal; the agent had no TTY |
| 9. Authenticated model use | **PENDING** | requires `/login`; the agent must not authenticate |
| 10. GitHub CI | **PASS** | run 30177880494 on PR #4 — `verify` job green |
| 11. Doctor | **PASS** | 22 PASS, 2 WARN (both honest), 0 FAIL; no Packet 3 check removed |

Tiers 8 and 9 are **not claimed** — the same two human gates already outstanding from Packets 2.5
and 3. **Packet 4R is therefore not fully accepted**: acceptance requires the interactive Proof view
to pass, and only Joshua can perform it.

## Tier 0 — Rebase and reconciliation

`feat/proof-engine` was created from `20effff`, which predates the Packet 3 closure commits
(`a844ca5` supported revision path, `b41911a` authenticated acceptance) and the `main` merge
`3169878`. The rebase therefore had to apply Packet 4's schema-v4 additions **onto** the newer
canonical state rather than replace it.

Six conflicts, each resolved at the field/operation level:

| File | Conflict | Resolution |
|------|----------|------------|
| `src/ui/steward-console/render.ts` | help keys | kept Packet 3's `a / v / x` revision affordance **and** Packet 4's `Focus → Work → Proof → Project Truth` cycle |
| `test/extension.integration.test.ts` | tool count 20 vs 27 | 28 = 11 core + 9 intake + 8 proof; added explicit assertions for `newfang_request_intake_revision` and `newfang_complete_work_item` |
| `test/tools.test.ts` | sorted tool list | union of both sides; `newfang_request_intake_revision` retained alongside `newfang_require_claim` / `newfang_run_verification` |
| `.newfang/project.json` | next action, sequences, tail | Packet 3 base (INT-8, ORI-2, `intake: 9`, `orientation: 3`, revision 48) **plus** schema-v4 additions and `claim`/`receipt` counters |
| `.newfang/events.jsonl` | revisions 30–48 vs 30–36 | main's 48 events kept byte-identical; four Packet 4 transitions appended as 49–52 |
| `.newfang/views/PROJECT_STATUS.md` | generated output | not spliced; regenerated through the supported operation afterwards |

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
  → node --test           tests 382 · pass 382 · fail 0
```

Counts across the reconciliation:

| Point | Tests |
|-------|-------|
| integrated `main` (`3169878`) baseline | 206 |
| `feat/proof-engine` before rebase (`866e0d6`, base `20effff`) | 360 |
| after rebase (`d397dfc`) | 375 |
| after reconciliation (`1e39b17`) | 382 |

No Packet 3 regression test was removed to make the rebase pass. The 375 → 382 gain is the seven new
migration tests over the real integrated v3 state; the 360 → 375 gain is main's intake-revision
suite arriving through the rebase.

New test files:

| File | Covers |
|------|--------|
| `test/migrate-v4.test.ts` | v3 inspection, 3→4 apply, defaults, backup, single event, view refresh, no-op rerun, byte-identical failure, v3 validator |
| `test/proof.claims.test.ts` | ID sequence, references, exact criterion matching, updates, limitations, requirement linking, derived evaluation, coverage |
| `test/proof.receipts.test.ts` | pass/fail/timeout/error, ANSI stripping, path normalization, truncation, cwd safety, immutability, manifest/hash consistency, link-only-after-artifact, staging cleanup |
| `test/proof.fingerprint.test.ts` | determinism, HEAD/tracked/staged/untracked sensitivity, path independence, `.newfang/` exclusion, receipt self-invalidation, no diff retention |
| `test/proof.completion.test.ts` | 16-case table-driven gate matrix, all-gates reporting, byte-identical rejection, focus clearing, one event, no alternative path |
| `test/proof.ui.test.ts` | Proof view at all widths, four evaluation states, detail views, attention, widget contract, context injection |
| `test/proof.tools.test.ts` | tool registration/schemas, each tool's behavior, all four commands, 14 doctor diagnostics |

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

| Receipt | Result | Recorded via | Fingerprint |
|---------|--------|--------------|-------------|
| `RCP-3` | `passed` (exit 0, 14.7 s) | `/newfang verify` command | `95ff7ef7006d…` |
| `RCP-4` | `passed` (exit 0) | `newfang_run_verification` tool | `95ff7ef7006d…` |

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
had both been rewritten — carries the *same* fingerprint `95ff7ef7006d…`. Recording evidence does not
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

The tool returning success means *a receipt was recorded*, not that verification passed — the
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

## Tier 8 — Interactive Proof view — **PENDING**

Not performed. The agent had no TTY (`process.stdin.isTTY === false`; `/newfang home` correctly
refuses with "needs an interactive terminal"), and Pi's `ctx.ui.custom()` is TUI-only. Rendering is
verified at the string level (all four evaluation states, compact/standard/wide widths, no line
overflow, detail views), but nobody has looked at it. **Terminal width, Pi version, and per-item
pass/fail are therefore unrecorded and are not claimed.**

Checklist for Joshua, in a real terminal (`mise exec -- npm run pi`, then `/newfang home`).
Record terminal width, Pi version, and pass/fail per item:

1. The ambient widget still renders (two lines, at most one proof warning).
2. `/newfang home` opens.
3. `Tab` cycles **Focus → Work → Proof → Project Truth** and wraps; `Shift-Tab` reverses.
4. Claim status is readable, and `pending` / `supported` / `unsupported` / `stale` are visually
   distinguishable. Expect `CLM-1 stale` and `CLM-2 stale` (both receipts predate the final commit).
5. `RCP-1`…`RCP-4` appear, each marked `current` or `stale`.
6. `j`/`k` move the selection across claims, then receipts, then the completion-gate row.
7. `Enter` opens claim detail (coverage + limitations) and closes with `Esc`.
8. Receipt detail is bounded: metadata and an artifact pointer, **no complete stdout dump**.
9. Completion-gate failures are readable in the gate detail.
10. Resize below 80 columns; confirm nothing overflows or is clipped mid-word.
11. The Packet 3 intake review UI still works: `u` opens the Understanding Check, and `a` / `v` / `x`
    are offered (accept+apply / request revision / reject).
12. `?` help lists the four-view order and the `a / v / x` keys; `r` reloads.
13. `q` exits cleanly.

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
