# R1 / NF-9 — ambient continuity verification record

Verification record for **NF-9: R1 — contain existing friction and make continuation ambient**.
Written 2026-07-26 on branch `feat/r1-ambient-continuity`.

Two evidence tiers, kept separate on purpose:

- **Automated contract tier** — what the injected capsule contains, and how freshness, Doctor, and
  readiness behave. Deterministic, run by `mise exec -- npm run verify`.
- **Interactive tier** — whether a genuinely fresh Pi session that receives `Continue.` does useful
  work. Automated tests cannot establish this, and an interactive failure cannot be overridden by
  them.

---

## 1. Baseline (measured, not assumed)

Starting SHA `4d66c24` (the R0 merge on `main`), clean worktree.

```text
mise exec -- npm run verify   →  588 tests, 588 pass, 0 fail (exit 0)
```

Measured by checking `4d66c24` out into a scratch worktree and running the pre-R1 code against the
same canonical state:

| Surface                    | Pre-R1 observation                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/voila doctor`            | 3 × `WARN`, worst level `warning`: orientation stale (`HEAD moved (e2835bd7 -> 4d66c24b); AGENTS.md changed; CLAUDE.md changed`), 5 claims stale, completed work no longer revalidating |
| Injected context           | **exactly 2,400 characters — the hard cap — ending mid-sentence in `…(context truncated)`**, having spent the budget on five accepted decisions unrelated to the active work and a full rationale paragraph |
| Injected context: directive | none. It described state and never asked for work                                                                                                        |
| `/voila proof`             | `NF-2 — 1 gate(s) failing` (stale evidence); the misleading `READY to complete` label appears whenever the gate happens to pass                            |
| Orientation freshness      | HEAD movement alone was a staleness reason, as the quoted Doctor line shows                                                                               |
| Verification contracts     | not reported at all                                                                                                                                      |

Pre-R1 `Continue.` behavior in a fresh Pi session: **not observed.** The baseline was established
before that test existed as a procedure, and it is not reconstructed here from the code's appearance.
What *is* recorded is the mechanism: the injected block carried no directive, so a fresh session had
nothing instructing it to act.

Verification-contract baseline, measured at the start of R1 from canonical state:

```text
2 unique verification contracts
93 recorded executions
5 claims
```

This differs from the `1 contract / 18 executions / 5 claims` figure named in the R1 packet brief.
The brief's numbers were an earlier snapshot; 93 receipts have accumulated since. The second contract
is one historical receipt (`RCP-67`) whose argv captured a mistyped command line
(`mise exec -- npm run verify /voila verify CLM-5 -- mise exec -- npm run verify`). It genuinely is a
different command, historical evidence is immutable, and it stays exactly as recorded.

---

## 2. Automated contract tier

```text
mise exec -- npm run verify   →  624 tests, 624 pass, 0 fail (exit 0)
```

`npm run verify` is `tsc --noEmit && prettier --check && node --test`. 36 tests were added.

| Contract                                                        | Where                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------- |
| Continuation intent recognized; unrelated messages never hijacked | `test/continuation.test.ts`                              |
| A continuation turn receives project, objective, focus, next action, and an instruction to act | `test/continuation.test.ts`         |
| No recap, status-report, or state-maintenance language is encouraged | `test/continuation.test.ts`                          |
| No R2–R7 capability implied; no active-operation field at all     | `test/continuation.test.ts`                              |
| Held human-required work is visible and never the next action     | `test/continuation.test.ts`                              |
| Canonical truth and repository observation are separated          | `test/continuation.test.ts`                              |
| Required content survives an oversized project; optional content drops first; hard limit holds | `test/continuation.test.ts`, `test/context.test.ts` |
| Optional context is relevance-filtered by work-item ID            | `test/continuation.test.ts`                              |
| An enormous required field is abbreviated, not tail-truncated away | `test/context.test.ts`                                  |
| Assembly never mutates canonical state; no source or history leaks | `test/context.test.ts`                                  |
| HEAD-only change stays current; unrelated git metadata never stales | `test/orientation.test.ts`                              |
| Instruction change, missing source, and un-inspected policy source stale it | `test/orientation.test.ts`                       |
| Relevant canonical-state change stales it; bookkeeping does not   | `test/orientation.test.ts`                               |
| Legacy orientation stays readable and is not re-staled by the transition | `test/orientation.test.ts`                         |
| A declared policy mismatch is stale, explicitly                   | `test/orientation.test.ts`                               |
| Policy version and state digest cannot be self-reported by a model | `test/orientation.test.ts`                              |
| Development staleness is `INFO`; a failing receipt is still `WARN` | `test/proof.tools.test.ts`                              |
| Completed work stale-only is `INFO`; genuinely unsupported is `WARN` | `test/proof.tools.test.ts`                             |
| Passing gates alone never produce an unqualified ready label       | `test/readiness.test.ts`                                 |
| Held work lists startable items only; derived state changes only with supported state | `test/readiness.test.ts`              |
| Contract identity, stable grouping, purity                        | `test/readiness.test.ts`                                 |

---

## 3. Interactive tier — the real `Continue.` test

### Procedure

A throwaway git worktree was created at `4296387` so the run could not touch the working tree, with
`node_modules` symlinked and the worktree clean. Pi was then invoked with **no prior conversational
history and no session to resume**:

```bash
cd <fresh-worktree> && pi -p --approve --no-session --mode json "Continue."
```

- Session `019f9f62-b533-7177-adf3-569ab039b5b2`, 2026-07-26T17:04:34Z.
- Model **MiniMax-M3** (the machine's configured default provider), thinking level `high`.
- No recap, no coaching, no follow-up prompt. The literal input was `Continue.` and nothing else.
- 18 turns, 23 tool executions, ~26.8k tokens.

**Honest scope:** this was Pi's non-interactive `--print` mode, not the TUI. Capsule injection happens
on `before_agent_start`, which fires identically in both, and the injected message is present in the
recorded transcript. What `--print` does **not** exercise is the TUI-only surface: the ambient widget's
quiet staleness indicator and the Steward Console. Those were verified by their own tests and by
reading their rendered output, not in a live terminal.

### The capsule it actually received

1,715 characters, recorded verbatim from the transcript (`role: custom`, `customType: voila-context`):

```text
[Voila continuation capsule]
Canonical truth (accepted project state):
  Project: voila · phase build · health green · revision 214
  Objective: DEC-18 Realign around the Project Steward operational loop — The Project Steward Operational Loop is the active product priori…
  Focus: NF-9 (ready) — R1: contain existing friction and make continuation ambient
  Current slice: Run the fresh-session Continue. (the canonical next action's first step)
  Next action: Run the fresh-session Continue. acceptance for NF-9 (R1) in a real Pi session with no prior history, record the exact prompt, response, first tool call and verdict in docs/verification/R1_AMBIENT_CON…
  Blocker: none recorded — no canonical condition blocks the accepted work
  Held (do not start): NF-2 — CLM-4 still records 3 outstanding limitation(s), so automated proof alone cannot accept this work
Repository observation (observed now, not canonical truth):
  HEAD 4296387 · worktree clean
  evidence: 5/5 claim(s) affected by current changes — expected; reconcile once at the boundary, not now
Steward directive:
  Continue NF-9 inside the accepted scope — the thread is above, so do not ask for a recap, a status report, or state maintenance.
  At most four lines, then make the first useful repository action in this same turn; keep going without asking permission for reversible in-plan work.
  Evidence: only voila_complete_work_item completes work, and only a voila_run_verification receipt is evidence.
Authority boundary:
  Escalate only a material decision, an irreversible or external action, credentials or authenticated human activity, or final owner acceptance.
  Canonical state changes only through voila_* tools (never edit .voila/ by hand); Voila never commits, stages, pushes, or opens a PR.
```

### What was observed

| Recorded item                        | Observation                                                                                                                  |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Exact prompt                         | `Continue.`                                                                                                                  |
| Exact initial response               | **No prose at all.** The first assistant message contained a single `toolCall` and zero text blocks.                          |
| Lines before the first tool call     | **0** (limit is 4)                                                                                                            |
| First useful tool call               | `read { path: ".pi/skills/project-steward/SKILL.md", offset: 1, limit: 400 }`                                                  |
| First useful repository action       | Loading the governing Steward skill, then `voila_get_project_context`, then locating the acceptance record named by the capsule |
| Selected focus                       | NF-9 — from the capsule, never asked for                                                                                      |
| Work performed                       | Wrote `docs/verification/R1_AMBIENT_CONTINUITY.md`; created `CLM-6` covering NF-9's fresh-session criterion; required it on NF-9; ran `voila_run_verification` (`RCP-94`, passed); re-read proof |
| User questions asked                 | **0.** The entire session emitted 371 characters of prose, in one closing summary, containing no question mark               |
| Requested proof or orientation maintenance | none                                                                                                                    |
| Unsupported capability claim         | none — no worker, terminal, delegation, or settlement language anywhere in the transcript                                     |
| Closing statement                    | "NF-9 remains incomplete because four other acceptance criteria still lack required claims"                                   |

### Interactive pass conditions

| # | Condition                                                | Result |
| - | -------------------------------------------------------- | ------ |
| 1 | Identifies Voila                                          | PASS — `voila_get_project_context`, then acted on Voila's own canonical state |
| 2 | Identifies NF-9                                           | PASS — named it as focus and attached its claim |
| 3 | Identifies a justified remaining R1 action                | PASS — the recorded acceptance run, which is exactly what remained |
| 4 | Does not ask for a recap                                  | PASS |
| 5 | Does not ask the user to refresh proof                    | PASS — it reconciled evidence itself, at a boundary |
| 6 | Does not ask for orientation refresh because HEAD moved   | PASS — orientation never mentioned |
| 7 | Does not begin NF-2                                       | PASS — NF-2 appears nowhere in the transcript |
| 8 | Does not claim workers or terminals exist                 | PASS |
| 9 | No more than four concise lines before acting             | PASS — zero |
| 10 | Makes a useful repository tool call in the same turn      | PASS |
| 11 | Continues useful work without requesting routine permission | PASS — 23 tool executions, no permission request |

**Interactive verdict: PASS.** `Continue.` produced work, not a status report.

### Two honest notes on the run

1. **It self-verified its own acceptance record.** `CLM-6` and `RCP-94` assert that the acceptance
   document contains the required sections — that is evidence about a file's structure, not about model
   behavior. Those writes landed in the throwaway worktree and were discarded with it; they are **not**
   part of this repository's canonical state, and this record does not lean on them. The behavioral
   evidence is the transcript above.
2. **One cosmetic defect surfaced.** The `Current slice` line reads "Run the fresh-session Continue."
   because the first-sentence split stops at the literal period inside the phrase `Continue.`. It is
   truthful and harmless, and fixing it would mean guessing at sentence boundaries; recorded as a known
   limitation instead.

---

## 4. Before and after

| Measure                                       | Before R1                                      | After R1                                        |
| --------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Automated gate                                | 588 tests pass                                 | 624 tests pass                                  |
| Injected context size                         | 2,400 chars, **tail-truncated**                | 1,715–1,787 chars, never truncated              |
| Directive to act                              | none                                           | present, and intent-gated                       |
| Unrelated decisions injected                  | 5                                              | 0 (relevance-filtered by ID)                    |
| Doctor warnings on this repository            | 3                                              | **0** (3 × `INFO`, worst level `info`)          |
| Orientation staled by HEAD movement           | yes                                            | no                                              |
| `READY to complete` while a human tier is owed | yes                                            | no — `HELD`, with the limitations listed         |
| Unique verification contracts identified      | not reported                                   | 2, across 93 executions serving 5 claims        |
| Verification executions performed by R1       | —                                              | 0 new receipts in this repository's state       |
| Developer commands required for `Continue.`   | unbounded (repeat `Continue.`, refresh, re-orient) | 1 — the word `Continue.`                     |
| Manual proof refreshes required               | —                                              | 0                                               |
| Manual orientation refreshes required         | —                                              | 0                                               |
| Context restatements required                 | —                                              | 0                                               |
| Unnecessary questions asked                   | —                                              | 0                                               |
| Lines before first tool call                  | not observed                                   | 0                                               |

"Before" figures are measured where a measurement exists and marked `—` where the pre-R1 procedure was
never run. Nothing here is inferred from code appearance.

---

## 5. Final state inspection

`/voila proof` (via `runProof`), `/voila doctor` (via `runDoctor`), and the capsule were each run
against this repository's real canonical state after implementation:

- Focus remains **NF-9**; it is **not** completed.
- Doctor: 26 checks, **0 failures, 0 warnings**, 3 informational (evidence reconciliation, completed
  work evidence, orientation freshness), structural health `OK`.
- Proof: 5 claims, all `stale` — expected mid-development, reported as reconciliation rather than as a
  chore. NF-2 shows `1 gate(s) failing` at the current fingerprint; when its evidence is current it
  now reads `HELD`, never `READY to complete`.
- NF-2's hold is visible in the capsule, in `/voila proof`, in `voila_get_proof`, and in the console
  gate view.
- No R2–R7 capability is claimed anywhere. Approval bundles remain paused.

## 6. Known limitations

1. **NF-9 is not complete.** Four of its five acceptance criteria have no required claim, and this
   record is the evidence for the fifth. Completing it is a deliberate, separate act through the
   protected transition — not something this document does.
2. **The interactive tier used `--print`, not the TUI.** The ambient widget and Steward Console were
   not exercised in a live terminal.
3. **One model, one run.** MiniMax-M3 at high thinking. Nothing here establishes behavior for other
   models or prompt variants.
4. **A held item is still gate-completable.** R1 corrected the *label*, narrowly, as NF-9's criterion 4
   asks. `voila_complete_work_item` would still accept an item whose gates all pass while a limitation
   stands; turning a hold into an enforced gate is a product decision, not a presentation fix.
5. **Execution deduplication is not implemented.** R1 built the grouping seam only. One
   `voila_run_verification` call still records one receipt for one claim — see §7.
6. **The objective line is selection-based.** It reports the latest accepted decision and names it. A
   later narrow decision would become the newest accepted one; the line stays true but gets less
   useful. A dedicated canonical objective field needs a schema migration.
7. **The `Current slice` cosmetic defect** described in §3.

## 7. Deviation from the packet brief, recorded rather than made silently

NF-9's canonical acceptance criterion 3 reads:

> One identical verification command can serve every applicable claim without being re-executed per
> claim

Read literally, that requires execution deduplication now: one execution whose result applies to
several claims. R1 did **not** build that, and the reason is a conflict with the authored plan, which
`docs/plans/PROJECT_REALIGNMENT_PLAN.md` states wins over any derived document:

- §7 (R1) says: *"**Prepare** verification grouping so one identical command can serve all applicable
  claims. This **may initially be implemented internally** without redesigning the entire receipt
  format."*
- §12 (R6) says the Steward *"groups identical contracts; runs each unique command once; records
  deterministic execution; applies the result to applicable claims"* — the execution and fan-out belong
  to R6.

The canonical criterion, written during R0, states R6's outcome under R1's heading. Building it in R1
would require a shared execution artifact and receipt fan-out, both explicitly listed as R1 non-goals,
and would silently turn NF-9 into R6.

**What was built instead:** the deterministic seam — contract identity, stable grouping, unique count,
reported by `/voila proof`. It executes nothing and rewrites no receipt.

**Smallest options available, if the owner wants criterion 3 satisfied as written:**

| Option | Change | Consequence |
| ------ | ------ | ----------- |
| A | Narrow criterion 3 to "verification grouping is prepared so R6 can run each unique command once", matching plan §7 | Smallest. NF-9 becomes completable on what R1 actually built. Requires a canonical criterion edit through a supported operation. |
| B | Leave criterion 3 as written and leave it uncovered | NF-9 stays incomplete until R6 lands. Honest, but a completed-looking packet blocked on a later packet's work. |
| C | Implement fan-out now: one execution, N receipts sharing an execution artifact | Contradicts R1's stated non-goals, changes the receipt/artifact invariant that `doctor` checks, and makes NF-9 into R6. |

**Recommendation: A.** The plan is authoritative and says "prepare"; the criterion overstates it. The
owner decision required is one sentence: *may criterion 3 of NF-9 be narrowed to the plan's wording?*
Nothing was changed on my own authority.

---

## 8. Final closeout attempt on 2026-07-26

This section supplements rather than replaces the historical results above.

### Completion inventory

| Requirement | Final classification | Evidence |
| --- | --- | --- |
| Focus-capsule generation, limits, filtering, and truth/observation labels | VERIFIED COMPLETE | `test/continuation.test.ts`, `test/context.test.ts` |
| Continuation detection and same-turn action directive | VERIFIED COMPLETE | focused tests plus the final fresh-session run below |
| Content-based freshness and legacy compatibility | VERIFIED COMPLETE | `test/orientation.test.ts` |
| Doctor structural-health/development-drift separation | VERIFIED COMPLETE | automated tests and real-TTY `/voila doctor` |
| NF-2 held presentation | VERIFIED COMPLETE when evidence is current; stale proof shows the evidence gate instead | readiness tests; the TTY run observed the stale state honestly |
| Verification-contract grouping seam | VERIFIED COMPLETE | `test/readiness.test.ts`; `/voila proof` reports 2 unique contracts |
| Project Steward skill | VERIFIED COMPLETE | skill tests and final fresh-session behavior |
| Current-slice correction | VERIFIED COMPLETE | focused tests cover `Continue.`, `app.py`, `22.23.1`, a real sentence boundary, no trustworthy boundary, required fields, and the hard size limit |
| Automated gate | VERIFIED COMPLETE | 625/625 tests passed, exit 0 |
| Real-TTY presentation | VERIFIED COMPLETE | Pi 0.82.0 under an `expect`-managed pseudo-terminal; status, NF-2 proof, NF-9 proof, and Doctor all rendered |
| Final fresh-session `Continue.` | VERIFIED COMPLETE for the behavioral criterion | final run at `37ae7fd`, fingerprint `a4432210661383b8ff07360deeef5b9f435dc02422ccc67e275ef4e6fb5b7a2e` |
| Criterion 3 wording | VERIFIED COMPLETE | amended through `voila_update_work_item`; rationale recorded as DEC-19 |
| Required claim coverage | PARTIALLY COMPLETE | CLM-6..CLM-10 are required and mechanically cover all five criteria, but CLM-10 explicitly records that criterion 5 is not substantively met |
| Final-fingerprint proof | PARTIALLY COMPLETE | RCP-94..RCP-98 passed at the final behavioral fingerprint; five identical executions were performed because R6 deduplication does not exist |
| Protected NF-9 completion | BLOCKED | criterion 5 literally requires active workers and terminals, while R1 intentionally has none and tests require those fields to be absent |

### Current-slice correction

The naive punctuation split treated the period inside the literal `Continue.` as a sentence boundary.
The correction only emits a derived slice when punctuation is followed by whitespace and a capital
letter starting a subsequent sentence. Otherwise the slice is omitted and the complete bounded
canonical next action carries the meaning. This prefers complete canonical meaning over a malformed
summary without adding a general language parser or a `Continue.`-only special case.

Focused command:

```text
mise exec -- node --test test/continuation.test.ts test/context.test.ts
24 tests, 24 pass, 0 fail
```

Complete gate after formatting correction:

```text
mise exec -- npm run verify
625 tests, 625 pass, 0 fail, exit 0
```

### Criterion 3 amendment

Previous wording:

> One identical verification command can serve every applicable claim without being re-executed per
> claim

Final wording:

> Voila deterministically identifies and groups claims with equivalent verification contracts,
> reports the unique contract count, and exposes a stable integration seam for later shared execution.
> R1 does not execute each group once or distribute a shared execution result across claims; execution
> deduplication remains R6 scope.

DEC-19 records the authorized rationale:

> This amendment aligns NF-9 with the accepted Project Realignment Plan. It corrects a sequencing
> mismatch and does not claim execution deduplication that has not been implemented.

### Real-TTY presentation

Command environment: Pi 0.82.0, Node 22.23.1, macOS pseudo-terminal allocated by `/usr/bin/expect`,
branch `feat/r1-ambient-continuity`, HEAD `37ae7fd`.

Observed:

- Voila loaded and the ambient widget rendered `Voila · BUILD · GREEN · Focus NF-9`.
- `/voila status` showed NF-9 as focus and stated that R2-R7 remain unbuilt: no workers, terminals, or
  settlement.
- `/voila proof NF-2` showed its required claim stale at the current fingerprint. This was an honest
  evidence-gate presentation, not the `HELD` label; the authenticated owner-run intake limitation
  remained visible in status/canonical next-action rationale.
- `/voila proof NF-9` showed all five criteria uncovered before claims were created.
- `/voila doctor` reported structural health `OK`; orientation and evidence drift were `INFO`, not
  structural warnings.
- Pi exited cleanly after the checks.

### Final-state fresh-session `Continue.`

Invocation:

```text
mise exec -- npm run pi -- --approve --no-session --mode json -p "Continue."
```

- Behavioral SHA: `37ae7fd6c953719260fc3dce4e455801610ab685`
- Effective content fingerprint: `a4432210661383b8ff07360deeef5b9f435dc02422ccc67e275ef4e6fb5b7a2e`
- Model: MiniMax-M3, thinking `high`; Pi 0.82.0
- Initial response: `I'll read the canonical state and the R1 verification doc to identify the exact remaining gap on NF-9.`
- Prose lines before acting: 1
- First tool call: `voila_get_project_context {}`
- First useful repository action: read canonical NF-9 context, then inspect the R1 verification record
- User questions: 0
- Context restatements requested: 0
- Proof/orientation maintenance requested from the developer: 0
- NF-2 work attempted: no
- Unsupported R2-R7 capability claims: none
- Malformed current slice: absent; the capsule omitted the unreliable slice and retained the complete
  bounded next action
- Useful continuation: the run created CLM-6..CLM-10, required them, and recorded RCP-94..RCP-98
  through supported tools before the harness timeout terminated its extended reasoning

Verdict for the fresh-session behavioral criterion: **PASS**. The run acted in the same turn and did
not wait for routine permission. The harness timeout is a limitation of the long closeout sequence,
not of the first-turn continuation behavior.

### Claim map and reconciliation result

| Claim | Criterion | Honest result |
| --- | --- | --- |
| CLM-7 | Fresh-session `Continue.` | Supported by RCP-95 plus the final transcript above |
| CLM-8 | Orientation freshness | Supported by RCP-96 and the automated suite |
| CLM-6 | Grouping seam | Supported by RCP-94; execution/fan-out explicitly remain R6 |
| CLM-9 | Held readiness presentation | Supported by RCP-97 and readiness tests |
| CLM-10 | Focus capsule | Capsule behavior is supported by RCP-98, but the claim explicitly records that the literal active-workers-and-terminals clause is not met |

Final grouping report: **2 unique verification contracts across 98 recorded executions**. The normal
contract (`mise exec -- npm run verify`) has 97 executions and serves all 10 claims; one historical
mistyped command remains a distinct contract. This closeout performed **5 identical executions** for
5 NF-9 claims and 5 claim evaluations. R1 did not deduplicate execution or fan out a shared result.

### Stop condition and No Managing the Manager verdict

Protected completion was not called. Although the mechanical proof gates report coverage and current
passing receipts, completing NF-9 would assert criterion 5 despite CLM-10's explicit admission that
active workers and terminals do not exist. The authorized criterion-3 correction does not authorize
weakening criterion 5, and implementing those runtimes would begin R2/R3.

**No Managing the Manager verdict: PASS for implemented R1 behavior.** One `Continue.` produced useful
work without recap, routine permission, proof-refresh requests, orientation-refresh requests, or NF-2
drift. **NF-9 acceptance coverage remains FAIL** until criterion 5 is resolved by an owner-authorized
criterion correction or by its correctly sequenced implementation; no completion claim is made here.
