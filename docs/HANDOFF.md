# Voila — handoff

Self-contained context for picking this project up cold. Written to be harness-neutral: paste it
into any assistant, or read it yourself after a break.

**Repo:** `git@github.com:jenksed/voila.git` · **Checkout:** `/Users/jenksed/Projects/voila`
**Branch:** `feat/r2b-operation-visibility` · **Starting SHA:** `b5e955e` · **Gate:**
R2B passes 710 automated tests (707 passed, 3 skipped) and all four real acceptance tiers
**Decision:** DEC-23 accepted · **Completion:** NF-20 and NF-10 protected-complete on 2026-07-27

> Canonical revision is deliberately **not** pinned here. It increments on every canonical write,
> including each verification receipt, so any number written into this file is stale before the
> commit lands — and chasing it is exactly the bookkeeping the doctrine says the developer should
> never do. Read it from `.voila/project.json`, `/voila status`, or
> [`.voila/briefs/PROJECT_BRIEF.md`](../.voila/briefs/PROJECT_BRIEF.md), which Voila regenerates.

---

## 1. What Voila is

A **project-aware agentic development environment** built on the **Pi** coding-agent harness. Its
Project Steward keeps models, agents, tools, terminals, and handoffs aligned with durable project
intent, coordinates their work, preserves continuity, and quietly assembles the evidence needed to
justify delivery.

Two boundaries define it:

- **The model interprets (fallibly); Voila enforces** (preservation, schemas, provenance, gating,
  persistence). Nothing enters canonical truth without the user accepting it.
- **The Steward coordinates; the developer does not.** Delegate work, retain the thread. If a
  capability makes the developer manage routine bookkeeping, that is a defect — see the
  **No Managing the Manager gate** in
  [`docs/product/PROJECT_STEWARD_DOCTRINE.md`](product/PROJECT_STEWARD_DOCTRINE.md).

It is a Pi **extension**, not a standalone CLI. There is no `voila` binary.

---

## 2. Orientation in 60 seconds

```bash
cd /Users/jenksed/Projects/voila
mise exec -- npm run verify     # the complete gate: tsc --noEmit && prettier --check && node --test
mise exec -- npm run pi         # launch Pi with Voila loaded (needs a real TTY)
```

| Path | What lives there |
| --- | --- |
| `.pi/extensions/voila.ts` | The single Pi boundary. Thin adapter, delegates to `src/`. |
| `src/domain/` | Pure project truth: work items, proof, schema migrations. No I/O. |
| `src/state/` | Canonical store, receipts, intake, fingerprint, legacy migration. |
| `src/delivery-inspector/` | Read-only observation of the working tree. Imports nothing from Voila. |
| `src/delivery/` | Delivery summary + commit suggestion (Phase 6). Pure. |
| `src/tools/` | 30 model-callable `voila_*` tools. |
| `src/ui/steward-console/` | Keyboard-first TUI. |
| `.voila/` | **Canonical state.** project.json, events.jsonl, intakes, orientations, receipts, views. |
| `.pi/skills/project-steward/` | The Steward skill Pi loads. |

Read [`AGENTS.md`](../AGENTS.md) first — it holds the operating doctrine and takes precedence over
`CLAUDE.md`.

---

## 3. Where the project actually is

**The roadmap was reset on 2026-07-26.** Phases 5–8 of
[`MVP_IMPLEMENTATION_PLAN.md`](plans/MVP_IMPLEMENTATION_PLAN.md) are superseded by
[`ADR-0009`](decisions/0009-project-steward-operational-realignment.md) / DEC-18. Read these three,
in order, before doing anything:

1. [`docs/product/PROJECT_STEWARD_DOCTRINE.md`](product/PROJECT_STEWARD_DOCTRINE.md) — what Voila is
   for and how the Steward must behave. Authoritative.
2. [`docs/plans/PROJECT_REALIGNMENT_PLAN.md`](plans/PROJECT_REALIGNMENT_PLAN.md) — the R0–R7 roadmap.
3. [`ADR-0009`](decisions/0009-project-steward-operational-realignment.md) — what changed and why.

**Why it was reset.** The foundation is strong and the daily experience was wrong: the developer had
become responsible for operating Voila — refreshing claims, interpreting stale evidence, re-running
identical verification, reconciling Proof against Doctor, and repeatedly saying "continue." The
system got excellent at recording whether work was *justified* and stayed weak at using AI to
*perform and coordinate* it. Delegation, background terminals, worker visibility, and automatic
settlement had all been classified as optional. They are now the critical path.

### What happens next, in order

**R0 is merged into `main` (PR [#9](https://github.com/jenksed/voila/pull/9), commit `4d66c24`). R1 is
implemented on `feat/r1-ambient-continuity` and its acceptance behavior was observed.** What R1 built:

- a **focus capsule** injected before every Steward turn — canonical truth, bounded repository
  observation, and a directive, each labelled ([design](design/FOCUS_CAPSULE.md));
- **action-oriented continuation**: `Continue.` (and a small closed set of equivalents) instructs the
  Steward to recover the thread, spend at most four lines, and act in the same turn;
- **content-based orientation freshness** — HEAD movement no longer stales an orientation, and
  historical artifacts stay readable ([design](design/REPOSITORY_ORIENTATION.md));
- **quiet development staleness** — Doctor separates structural health from expected readiness drift,
  and the widget stops nagging;
- **honest held readiness** — an item whose gates pass while a required claim still records an
  unmet human tier reads `HELD`, never `READY to complete`;
- the **verification-contract grouping seam** R6 needs (identity and grouping only; no execution
  change).

The final fresh-session `Continue.` test **passed**: one concise line before the first tool call, no
recap, no questions, no state-maintenance requests, no NF-2 work, and no claimed workers. The ordinary
TTY tier also ran under a real pseudo-terminal. Transcript, scope, and limitations are in
[docs/verification/R1_AMBIENT_CONTINUITY.md](verification/R1_AMBIENT_CONTINUITY.md).

1. **Prepare the bounded R2B branch for owner review.** All four acceptance tiers pass, risks are
   reconciled, current claim receipts support NF-20 and NF-10, and both protected transitions passed.
2. **Keep delivery owner-controlled.** Voila may summarize changes and propose commit boundaries, but
   it never stages, commits, pushes, opens a PR, or merges.
3. **Do not broaden R2B.** There are no workers, services, watchers, PTYs, arbitrary background
   terminals, list/wait tools, cross-process coordination, or accepted R3 runtime changes.

**NF-9 was completed on `4d108fc` and is no longer the focus.** R1's full evidence trail and its
honest limitations are recorded
([docs/verification/R1_AMBIENT_CONTINUITY.md](verification/R1_AMBIENT_CONTINUITY.md)). R1 makes
*invocation* immediately useful. R2A historically accepted one finite operation. This R2B branch
adds one fixed repository-check operation to the same supervisor, still with one shared active-run
capacity; no general background runtime exists.

**What is built** (and is not being walked back): durable per-project state, planning intake with
preserved provenance, repository orientation, work items and dependencies, claims and deterministic
receipts, the protected completion transition, the delivery engine, the Steward Console, the ambient
widget, 35 tools, R1's ambient continuity (focus capsule, action-oriented `Continue.`,
content-based orientation freshness, quiet development staleness, honest held readiness, the
verification-grouping seam), and **bounded R2A** (deterministic admission, one explicit accepted
operation, atomic in-process reservation, the lifecycle supervisor, four operation tools, protected
structured state paths, and automatic next-turn settlement through the bounded focus capsule). R2A
acceptance passed on 2026-07-26. The R2B working tree now implements the second fixed definition,
focus-derived ownership, runtime-backed projection, lifecycle refresh, and bounded widget/Console/
capsule presentation; automated acceptance and all four real acceptance tiers pass. Phase
7's earlier gate returned GO on foundation capability, HOLD on backlog closure.

**What is not built:** concurrent operations, watchers, dev servers, `list` or `wait` tools, R3 Pi
child workers, broader automatic integration, cross-process coordination or adoption, arbitrary
commands, services, PTYs, queues, and approval or release automation. Do not describe any broader
capability as present.

Backlog:

```text
NF-1 completed     project-operations layer        (released by DEC-17)
NF-2 ready         intake + orientation           HELD: needs authenticated intake (§5A)
NF-3 backlog       claims/receipts/completion gate (shipped as Packet 4, dependency-blocked)
NF-4 backlog       delivery behavior               (shipped as Phase 6, dependency-blocked)
NF-5..NF-8 backlog
NF-9  completed    R1 friction containment          (R1, completed 4d108fc)
NF-10 completed    R2 supervised background operation (protected completion passed)
NF-16 completed    R2A finite operation supervision (protected completion passed)
NF-17 completed    repair canonical DEC counter    (protected completion passed)
NF-18 completed    paste-safe command handoff       (protected completion passed)
NF-19 completed    actionable PR command handoff    (protected completion passed)
NF-20 completed    implement bounded R2B visibility (protected completion passed)
NF-11..NF-15       R3..R7, sequenced by dependency
```

**NF-2..NF-4 are code-complete but deliberately not marked complete.** They were completed through
the gate during the walk-through and then reverted — see §5. The realignment does **not** release
them; NF-2's authenticated intake is still owed.

**R2A passed bounded acceptance and merged through PR #12; it did NOT itself complete NF-10.** R2B
then passed real TTY, fresh-Steward, stale-runtime, risk, and proof gates; NF-20 and NF-10 completed
through their protected transitions on 2026-07-27. NF-20's accepted packet is runtime authority only for the bounded
operation-visibility scope. R2A evidence remains in
[docs/verification/R2A_FINITE_OPERATION.md](verification/R2A_FINITE_OPERATION.md); current R2B
status is in
[docs/verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md](verification/R2B_BACKGROUND_OPERATION_VISIBILITY.md).

---

## 4. Doctrine you must not violate

These are enforced by tests. Breaking them is not a style disagreement.

1. **Evidence is not negotiable.** A claim is reported at its real evaluation status. A `stale` claim
   is *not* support. Never write a claim broad enough to clear a gate.
2. **Completion goes through `voila_complete_work_item` only.** Generic updates reject `completed`.
   The gate reports *every* failing condition, not the first.
3. **Voila proposes; it never acts at the delivery boundary.** No commit, staging, push, or PR. No
   tool does this, deliberately. `/voila deliver` and `/voila commit` are read-only.
4. **Historical evidence is never rewritten.** Receipts, intake sources, review logs, and
   `events.jsonl` are immutable or append-only. To restate a decision, **supersede** it.
5. **`NF-n` is a stable legacy ID namespace.** After the NewFang→Voila rename, IDs were *not*
   renumbered. Keep allocating `NF-n`; there is no `VOI-n`.
6. **The product name is plain ASCII `Voila`.** `Voilà`/`voilà` are prohibited everywhere.

Two more are doctrine but **not** test-enforced — they constrain judgment, not syntax:

7. **No managing the manager.** A capability that makes the developer manage routine state freshness,
   route tasks by hand, chase worker status, carry results between models, repeatedly say "continue",
   or operate evidence infrastructure during ordinary development is a **defect**. This applies to
   already-shipped capability.
8. **Never claim capability that does not exist.** R2–R7 are not built (R1 is — see §3). The Steward
   skill's "do not spawn subagents" instruction is current fact, not permanent doctrine.

---

## 5. The one open item

### A. Interactive tier (blocks NF-2) — needs a human at a terminal

Attested so far in a real TTY: extension load, ambient widget, `/voila status`, `/voila doctor`,
`/voila deliver`, and the full Steward Console (`/voila home` — tabs, Work, Attention, Proof,
Project Truth, footer keys).

**Still owed:** an end-to-end *authenticated* Project Steward intake (ingest a real planning
document, review the Understanding Check, accept it), `/voila commit` against a dirty tree,
narrow-width resize, `/reload`, clean exit.

Why it matters: `DEC-12` records that the automated suite exercises the intake **machinery** with
test inputs and does not demonstrate a real Steward run classifying a real document — which is
exactly what NF-2's acceptance criteria require.

This tier has found **three real defects** that no automated check caught. It is not ceremony.

### B. Fingerprint design decision — RESOLVED, shipped

This was open in the previous revision of this handoff. It is now decided and implemented:
[`ADR-0008`](decisions/0008-fingerprint-v2-content-addressed.md) made the fingerprint
content-addressed over effective working-tree content. `gitHead` is retained as non-authoritative
diagnostic metadata and is **not** in the digest.

Verified in practice: two commits moved `gitHead` from `e2835bd` to `30cd164` and the merge to `main`
moved it again, while the digest held at `2bdac21f2540a62f…` throughout — the same value carried by
all five current receipts. Evidence now survives a commit that changes no content, so a branch can
land evidence-backed at its tip. The one-time migration cost was paid: RCP-64..68 are the first v2
receipt set.

Keep this in mind when reading older records: v1 receipts carry no `fingerprintAlgorithm` field and
are recognized as v1 by its absence.

---

## 6. Gotchas that will bite you

**Receipts are committed now, and that is safe.** The old advice here was to leave receipts
uncommitted so Proof would show `5 supported`, because committing staled them. ADR-0008 removed that
trap: `.voila/` is excluded from the digest and `gitHead` is not in it, so recording and committing
evidence no longer invalidates it. Commit receipts normally.

**Orientation no longer stales on HEAD, and that is deliberate.** Since R1, freshness follows the
content an orientation actually inspected plus a bounded digest of the canonical work and accepted
decisions it summarized. A commit that changed nothing it read leaves it current. Historical artifacts
(ORI-1..ORI-5) carry no policy version, and that absence *is* the one-time transition: they stay
readable and are judged by content, not re-staled. Do not "fix" this by comparing HEAD again.

**Doctor's `INFO` items are not warnings.** Stale evidence during development, a completed item that
cannot be revalidated for the same reason, and an un-oriented project are informational and do not
escalate the notification level. If you find yourself reading them as a chore list, that is the defect
R1 removed. A receipt that actually *failed* at the current state is still a `WARN`.

**`HELD` is presentation, not a gate.** An item whose gates all pass while a required claim records an
unmet human tier reads `HELD` everywhere. `voila_complete_work_item` would still accept it — R1
corrected the label narrowly and did not add a gate. Do not read `HELD` as enforcement.

**The rename guard fails in both directions.** `test/rename-guard.test.ts` fails if an unlisted file
contains `NewFang`/`newfang`/etc., **and** if an allowlisted path no longer does. Adding a file that
legitimately mentions the old brand means adding an entry to
`test/fixtures/legacy-brand-allowlist.json` with an exact path and a real reason. No globs, no
directory prefixes.

**`.voila/project.json` is allowlisted wholesale**, so the wide guard cannot see inside it. Targeted
tests cover the parts that state *current* truth: `displayName`/`nextAction`/`nextActionRationale`,
accepted decisions, and open assumptions/risks. Two defects have already hidden in this gap.

**Captured receipt output is excluded structurally.** `.voila/receipts/<id>/stdout.txt|stderr.txt`
are skipped by the guard, because this suite's own legacy-migration tests have `.newfang/` in their
names, so every receipt contains the old brand by construction. `manifest.json` is still scanned.

**The global install must defer.** `scripts/install-global.mjs` writes a shim to
`~/.pi/agent/extensions/voila.ts`. Pi loads both global and project-local extensions, so the shim
**returns without registering** when `<cwd>/.pi/extensions/voila.ts` exists. Without that, running Pi
inside this repo registers all 30 tools twice and Pi refuses to start.

**`test/dogfood.test.ts` encodes deliberate judgments.** It asserts things like "nothing is marked
completed yet" and pins the focus item. If it fails, the default assumption is that *you* over-reached,
not that the test is stale. It caught exactly that during the Phase 7 walk-through.

**No TTY in most agent sessions.** `mise exec -- npm run pi` exits immediately with status 0 when
`process.stdin.isTTY` is undefined. Extension *load errors* still print, so startup can be checked
headlessly — but nothing about the running TUI can be claimed.

---

## 7. Working conventions

- Run `mise exec -- npm run verify` before every commit. It is the whole gate.
- `mise exec -- npm run format` fixes prettier failures.
- Commit messages: imperative subject, then *why*, not *what*. Look at recent history for the register.
- Branch, PR, wait for CI, merge with a **merge commit** (not squash).
- Record direction changes as ADRs in `docs/decisions/`; restate decisions by **superseding**.
- Verification records go in `docs/verification/` and separate evidence tiers, marking anything
  unperformed as PENDING rather than claiming it.

---

## 8. Key documents

| Document | Why |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) | Operating doctrine. Read first. |
| [`docs/product/PROJECT_STEWARD_DOCTRINE.md`](product/PROJECT_STEWARD_DOCTRINE.md) | **Authoritative** product statement and the No Managing the Manager gate |
| [`docs/plans/PROJECT_REALIGNMENT_PLAN.md`](plans/PROJECT_REALIGNMENT_PLAN.md) | **The active roadmap** — R0–R7 |
| [`docs/decisions/0009-project-steward-operational-realignment.md`](decisions/0009-project-steward-operational-realignment.md) | What the realignment changed, and why |
| [`docs/plans/MVP_IMPLEMENTATION_PLAN.md`](plans/MVP_IMPLEMENTATION_PLAN.md) | Phases 0–8. **Phases 5–8 superseded**; retained as history |
| [`docs/verification/PHASE_7_SELF_HOSTING_GATE.md`](verification/PHASE_7_SELF_HOSTING_GATE.md) | Current status, the reversal, all three defects |
| [`docs/design/PROOF_ENGINE.md`](design/PROOF_ENGINE.md) | Claims, receipts, freshness, derived readiness, protected completion |
| [`docs/design/FOCUS_CAPSULE.md`](design/FOCUS_CAPSULE.md) | The injected capsule and `Continue.` semantics (R1) |
| [`docs/verification/R1_AMBIENT_CONTINUITY.md`](verification/R1_AMBIENT_CONTINUITY.md) | R1 evidence: automated + interactive tiers, and the criterion-3 deviation |
| [`docs/design/DELIVERY_ENGINE.md`](design/DELIVERY_ENGINE.md) | Delivery summary, commit suggestion, the boundary |
| [`docs/migrations/NEWFANG_TO_VOILA.md`](migrations/NEWFANG_TO_VOILA.md) | The rename, and why history keeps the old name |
| [`docs/project/PROJECT_LEDGER.md`](project/PROJECT_LEDGER.md) | Running ledger |

---

## 9. Note on using MiniMax for this

`mmx` (MiniMax CLI) is a **text and media generation client**. It has no repository access, no file
editing, no git, and no tool execution. It cannot make changes here.

What it is genuinely good for on this project:

- **Second-opinion review.** Paste a diff and ask for specific problems. Use
  `mmx text chat --messages-file <file.json> --non-interactive --quiet` for anything large; inline
  `--message` with a big diff fails.
- **Drafting** prose, ADR text, commit messages.
- **Web search** via `mmx search query`.

**Verify anything load-bearing against the code.** A worked example from this project: MiniMax
reviewed the rename diff and concluded legacy `.newfang/` paths would be "simply unclassified and
that is correct behavior". Running `classifyPath` showed they were *actively misclassified* —
`project.json` fell through to generic `configuration`. The review read as confident and was wrong on
the one point that mattered. The finding came from executing the code.

To actually change code, use an agent with repository access.
