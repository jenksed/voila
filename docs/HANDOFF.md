# Voila — handoff

Self-contained context for picking this project up cold. Written to be harness-neutral: paste it
into any assistant, or read it yourself after a break.

**Repo:** `git@github.com:jenksed/voila.git` · **Checkout:** `/Users/jenksed/Projects/voila`
**Head at writing:** `0d07e1b` (main) · **Gate:** 587 tests passing

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

**Next: R1 — friction containment and ambient continuity.** Its acceptance gate is behavioral: in a
fresh Pi session the user says `Continue.` and the Steward identifies the correct work and begins
useful action without asking for a recap. If `Continue` still produces a status report, R1 failed.

**What is built** (and is not being walked back): durable per-project state, planning intake with
preserved provenance, repository orientation, work items and dependencies, claims and deterministic
receipts, the protected completion transition, the delivery engine, the Steward Console, the ambient
widget, 30 tools. Phase 7's gate returned GO on capability, HOLD on backlog closure.

**What is not built:** everything in R1–R7. No delegation, no background processes, no automatic
settlement, no fresh-session continuity, no quiet boundary reconciliation. The doctrine document
carries an explicit built/not-built table. Do not describe any of it as present.

Backlog:

```text
NF-1 completed     project-operations layer        (released by DEC-17)
NF-2 ready         intake + orientation           HELD: needs authenticated intake (§5A)
NF-3 backlog       claims/receipts/completion gate (shipped as Packet 4, dependency-blocked)
NF-4 backlog       delivery behavior               (shipped as Phase 6, dependency-blocked)
NF-5..NF-8 backlog
NF-9  ready        R1 friction containment          <- FOCUS
NF-10..NF-15       R2..R7, sequenced by dependency
```

**NF-2..NF-4 are code-complete but deliberately not marked complete.** They were completed through
the gate during the walk-through and then reverted — see §5. The realignment does **not** release
them; NF-2's authenticated intake is still owed.

5 claims (CLM-1..CLM-5), 68 receipts, 18 decisions.

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
8. **Never claim capability that does not exist.** R1–R7 are not built. The Steward skill's "do not
   spawn subagents" instruction is current fact, not permanent doctrine.

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
| [`docs/design/PROOF_ENGINE.md`](design/PROOF_ENGINE.md) | Claims, receipts, freshness, protected completion |
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
