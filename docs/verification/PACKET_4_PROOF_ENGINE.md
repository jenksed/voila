# Packet 4 — Proof Engine verification record

What was verified, how, and — explicitly — what was **not**. Tiers are separated so a passing test
suite is never mistaken for an interactive or authenticated check.

- **Date**: 2026-07-25
- **Branch**: `feat/proof-engine`, based on `20effff` ("fix: preserve intake review history and
  command evidence")
- **Toolchain**: mise-managed Node `22.23.1`, `@earendil-works/pi-coding-agent@0.82.0`, TypeScript
  `7.0.2`, prettier `3.9.6`, typebox `1.1.38`. No dependencies were added.

## Summary of tiers

| Tier | Status | Evidence |
|------|--------|----------|
| 1. Automated tests | **PASS** | 360/360 via `mise exec -- npm run verify` |
| 2. Pi integration (non-model) | **PASS** | tool surface + registration asserted by tests through the real adapter |
| 3. Command-execution smoke tests | **PASS** | real `spawn` against temp git repos; real `mise exec -- npm run verify` recorded as RCP-1/RCP-2 |
| 4. Stale-evidence demonstration | **PASS** | performed on this repository; see below |
| 5. Protected-completion demonstration | **PASS** | temporary acceptance fixture + real NF-3 rejection |
| 6. Interactive Proof view (TUI) | **PENDING** | requires a terminal; the agent had no TTY |
| 7. Authenticated model use | **PENDING** | requires `/login`; the agent must not authenticate |

Tiers 6 and 7 are **not claimed**. They are the same two human gates that were already outstanding
from Packets 2.5 and 3.

## Tier 1 — Automated tests

```text
mise exec -- npm run verify
  → tsc --noEmit          clean
  → prettier --check      clean
  → node --test           tests 360 · pass 360 · fail 0
```

Baseline before this packet was 191/191; Packet 4 adds 169 tests across seven new files plus updates
to existing suites for the schema bump and the new console view.

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

## Tier 2 — Pi integration (non-model)

Exercised through the real `.pi/extensions/newfang.ts` adapter and a structural fake host:

- 27 tools register (19 previously + 8 proof tools), each with a strict typebox schema and
  `additionalProperties: false`.
- `/newfang` gains `claims`, `proof`, `verify`, `complete` in `SUBCOMMANDS` and argument completion.
- No proof tool accepts a filesystem root, and none exposes a support flag or completion bypass.
- `test/extension.integration.test.ts` asserts the tool count and command registration.

Not exercised: a live Pi TUI session (tier 6) and any model-driven tool call (tier 7).

## Tier 3 — Command-execution smoke tests

Real subprocesses, not mocks:

- `spawn` with `shell: false` against temporary git repositories, covering exit 0, non-zero exit,
  missing executable (`error`), and a real 1-second timeout (`timed_out`).
- Shell syntax passed as an argument is verified to arrive **literally** (`$HOME && echo pwned` is not
  expanded or chained), confirming no shell is involved.
- Eight shell-string forms are refused before execution.
- Working-directory safety: `..`, absolute paths, `~`, a symlink escaping the repository, and a
  regular file are each rejected; a legitimate `sub` directory is confirmed to be the process cwd.

On this repository, the real project gate was executed through `newfang_run_verification` with a
structured command — `executable: "mise"`, `args: ["exec", "--", "npm", "run", "verify"]` — producing
two receipts:

| Receipt | Result | Meaning |
|---------|--------|---------|
| `RCP-1` | `failed` (exit 1) | Recorded honestly. `test/dogfood.test.ts` asserts a receipt exists, and at the moment of that first run none did — a genuine bootstrap ordering failure, captured as evidence rather than hidden. |
| `RCP-2` | `passed` (exit 0) | Recorded once `RCP-1` existed. This is what supports `CLM-1`. |

Both share fingerprint `c09042efe7bc…`, which independently confirms the designed property that
**creating a receipt does not invalidate its own fingerprint**.

### Pre-commit artifact cleanup (disclosed)

An earlier pair of receipts was recorded before path normalization existed; one embedded an absolute
home path. Because they had never been committed — working-tree scratch, not history — they were
deleted and re-recorded with the fixed code rather than shipped with a leak. This was a deliberate
one-off by the author before the first commit; **NewFang itself never deletes a receipt at runtime**,
and an event (`receipts_reset_pre_commit`) records that it happened.

## Tier 4 — Stale-evidence demonstration

Performed against this repository's real canonical state, editing a tracked file
(`test/fixtures/console.ts`) and restoring it byte-for-byte:

```text
pristine tree:         fingerprint c09042efe7bc  CLM-1 supported   claims_supported pass
tracked file edited:   fingerprint c8c9f51ade2e  CLM-1 stale       claims_supported FAIL
fixture restored:      fingerprint c09042efe7bc  CLM-1 supported   claims_supported pass
```

The fingerprint returns to its exact prior value on restoration, and the completion gate follows the
evidence in both directions. `git status` confirmed the fixture was left unmodified.

## Tier 5 — Protected-completion demonstration

### On real state: NF-3 is correctly refused

`NF-3` ("Build claims, receipts, and completion gates") has genuinely satisfied every **proof** gate —
its criterion is covered by `CLM-1`, which is supported by the passing `RCP-2`. It is nevertheless
refused:

```text
/newfang complete NF-3 -> warning
Cannot complete NF-3: 1 gate(s) fail.
  - dependencies completed: not completed: NF-2

NF-3 status unchanged: backlog | completed items: 0
```

This is the honest outcome. `NF-2` cannot be completed because the authenticated Project Steward
intake acceptance (tier 7) has never been performed. **No work item in this repository is marked
completed.**

### In a temporary acceptance fixture: the full path

A throwaway git repository was driven through every stage:

```text
1. criteria only:                  ready=false failing=required_claims_present,criteria_covered,claims_supported
2. claim created (not required):   ready=false failing=required_claims_present,criteria_covered,claims_supported
3. claim required (pending):       ready=false failing=claims_supported
4. verification FAILED:            ready=false failing=claims_supported
5. verification passed:            ready=true  failing=(none)

/newfang complete NF-1 -> info
Completed NF-1 — Acceptance fixture outcome.
Focus was cleared. Choose the next focus deliberately with /newfang focus <ID>.

fixture NF-1 status: completed
fixture focus after completion: null
```

Then a tracked file was changed to confirm post-completion behavior:

```text
after a tracked change, revalidation gates failing: claims_supported
but the recorded status is still: completed
```

Completed work is **never** silently reverted; `/newfang doctor` reports this as a WARNING that
current evidence no longer supports revalidation.

## Tier 6 — Interactive Proof view — **PENDING**

Not performed. The agent had no TTY, and Pi's `ctx.ui.custom()` is TUI-only. Rendering is verified at
the string level (all four evaluation states, compact/standard/wide widths, no line overflow, detail
views), but nobody has looked at it.

Checklist for Joshua, in a real terminal (`npm run pi`, then `/newfang home`):

1. `Tab` cycles **Focus → Work → Proof → Project Truth** and wraps; `Shift-Tab` reverses.
2. The Proof view lists `CLM-1` as `supported` (or `stale`, if the tree has moved since RCP-2) with
   its four limitations visible.
3. `RCP-1 [failed]` and `RCP-2 [passed]` both appear, each marked `current` or `stale`.
4. `j`/`k` move the selection across claims, then receipts, then the completion-gate row.
5. `Enter` on a claim shows coverage and limitations; on a receipt shows metadata and an artifact
   pointer but **no command output**; on the gate row lists every gate.
6. The Focus view shows the proof-readiness block.
7. `?` help lists the four-view order.
8. Resize the terminal below 80 columns and confirm nothing overflows or is clipped mid-word.
9. The ambient widget shows at most one proof warning and stays at two lines.

## Tier 7 — Authenticated model use — **PENDING**

Not performed and deliberately not attempted: the agent must not run `/login` or handle credentials.

Checklist for Joshua, after authenticating:

1. Ask the Steward to state a claim about a real work item; confirm it copies criterion text exactly
   and records honest limitations.
2. Ask it to verify the claim; confirm it uses `newfang_run_verification` with structured
   `executable` + `args` rather than narrating a shell command it ran itself.
3. Ask it to complete an unproven item; confirm it reports the failing gates instead of asserting
   completion in prose.
4. Confirm it does not invent narrow claims solely to satisfy the gate.

## Dogfooded state after this packet

- Canonical state migrated `v3 → v4` through the real path: inspected first, then `--apply`, with
  backup `.newfang/backups/project.json.v3.2026-07-25T16-37-27-229Z`, exactly one `schema_migrated`
  event, and a refreshed generated view.
- All eight pre-existing work items received `requiredClaimIds: []`, so none of them became
  completable as a side effect of migration.
- `CLM-1` on `NF-3`, required, covering NF-3's single acceptance criterion, with four recorded
  limitations, supported by `RCP-2`.
- `RCP-1` (failed) and `RCP-2` (passed) artifacts committed under `.newfang/receipts/`.
- **0 work items completed.**

### Receipt artifact audit (performed before commit)

- No credentials, tokens, or secrets.
- No environment-variable names or values; `manifest.json` records `"capturedEnvironment": "none"`.
- No absolute repository or home paths in `manifest.json`, `stdout.txt`, or `stderr.txt` (asserted by
  `test/dogfood.test.ts`, which checks every receipt against `homedir()` and `process.cwd()`).
- No git diffs.
- Both streams within the 64 KiB cap; `outputTruncated` false for both receipts.
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
