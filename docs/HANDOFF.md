# Voila — handoff

Self-contained context for picking this project up cold. Written to be harness-neutral: paste it
into any assistant, or read it yourself after a break.

**Repo:** `git@github.com:jenksed/voila.git` · **Checkout:** `/Users/jenksed/Projects/voila`
**Head at writing:** `a3ed25f` · **Canonical revision:** 123 · **Gate:** 580 tests passing, CI green

---

## 1. What Voila is

A personal development operating system built on the **Pi** coding-agent harness. It owns the path
from intent to verified, delivered result: preserve the planning source, hold durable project truth,
require evidence before completion, propose a delivery a human approves.

The boundary that defines it: **the model interprets (fallibly); Voila enforces** (preservation,
schemas, provenance, gating, persistence). Nothing enters canonical truth without the user accepting
it.

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

**Phase 7 self-hosting gate: GO on capability, HOLD on backlog closure.**
Full record: [`docs/verification/PHASE_7_SELF_HOSTING_GATE.md`](verification/PHASE_7_SELF_HOSTING_GATE.md).

All eight gate capabilities are implemented and evidenced: planning intake, durable state, visible
next action, claims and evidence, reproducible verification, state-transition blocking, delivery
summary, commit suggestion. (Delegation is explicitly *not* a gate capability.)

Backlog:

```text
NF-1 in_progress   project-operations layer        (shipped as Packet 2)
NF-2 ready         intake + orientation            (shipped as Packet 3)  <- FOCUS
NF-3 backlog       claims/receipts/completion gate (shipped as Packet 4)
NF-4 backlog       delivery behavior               (shipped as Phase 6)
NF-5..NF-8 backlog
```

**NF-1..NF-4 are code-complete but deliberately not marked complete.** They were completed through
the gate during the walk-through and then reverted — see §5.

5 claims (CLM-1..CLM-5), 28 receipts, 16 decisions.

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

---

## 5. The two open items

### A. Interactive tier (blocks NF-1 and NF-2) — needs a human at a terminal

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

### B. Fingerprint design decision — needs the owner's call

**Problem.** The repository fingerprint is `(gitHead, tracked diff, staged diff, untracked hashes)`.
Commit your work and `gitHead` moves while the diffs empty — a *different* fingerprint for
*identical file content*. So evidence goes stale on every commit, including the commit that records
the receipts. Claims are almost never green at a pushed branch tip.

**Proposal.** Make the fingerprint content-addressed: hash the working-tree content of tracked plus
untracked-non-ignored files, and drop `gitHead`. Evidence then survives a commit that changes no
content, which is the correct semantics — evidence is about the code, not which commit it sits on.

**Cost.** All 28 existing receipts carry old-format fingerprints, so every claim goes stale once
until re-verified (one command). It changes what "evidence is current" means, so it wants an ADR.

**Status:** undecided. Not implemented. Do not implement without the owner's sign-off.

---

## 6. Gotchas that will bite you

**Uncommitted receipts right now.** The tree intentionally has ~9 untracked `.voila/receipts/RCP-2x/`
plus modified `.voila/project.json`, `events.jsonl`, `views/PROJECT_STATUS.md`. They are uncommitted
so Proof shows `5 supported`. Committing them stales all 5 (see §5B). Either is fine — just know why.

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
| [`docs/plans/MVP_IMPLEMENTATION_PLAN.md`](plans/MVP_IMPLEMENTATION_PLAN.md) | Phases 0–8 and their gates |
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
