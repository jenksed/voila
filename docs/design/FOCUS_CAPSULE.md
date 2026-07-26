# Focus capsule — ambient continuity

Design record for the deterministic continuation capsule injected before every Project Steward turn.
Implemented in R1 (NF-9). Source: [`src/context/inject.ts`](../../src/context/inject.ts) (pure
builder), [`src/context/assemble.ts`](../../src/context/assemble.ts) (assembler),
[`src/context/continuation.ts`](../../src/context/continuation.ts) (intent),
[`src/context/observe.ts`](../../src/context/observe.ts) (bounded git observation).

## The problem it solves

Before R1, Voila injected a project-context block on `before_agent_start`: identity, focus, next
action, five accepted decisions regardless of relevance, claim counts, and a paragraph of proof rules.
Two defects followed from that shape.

1. **It described state; it never asked for work.** A fresh session that received `Continue.` had
   everything it needed to write a status report and no instruction to act. That is the
   *No Managing the Manager* failure named in
   [PROJECT_STEWARD_DOCTRINE.md](../product/PROJECT_STEWARD_DOCTRINE.md): the developer ends up
   repeating "continue".
2. **It overflowed and tail-truncated.** Measured on this repository at `4d66c24`, the block was
   exactly 2,400 characters — the hard cap — and ended mid-sentence with `…(context truncated)`,
   having spent its budget on an unfiltered decision list and a rationale paragraph.

## Shape

Three classes of content, always labelled, in this order:

| Class                     | Contains                                                                                                              | Source                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| **Canonical truth**       | project, objective, focus, current slice, next action, why now, blocker, held work, relevant accepted decisions        | `.voila/project.json` via supported writes |
| **Repository observation** | branch, HEAD, changed-file count, evidence counts, orientation status                                                  | read-only git + derived proof, at injection |
| **Steward directive**     | what to do; the two evidence rules; the authority boundary                                                             | Voila's own instruction                    |

The labels are load-bearing. A model that cannot tell an observation from accepted truth will present
one as the other, and the whole point of canonical state is that it is not guesswork.

### Required and optional

Required — never dropped, never tail-truncated: **project, objective, focus, blocker, next action,
directive, authority boundary**. A runaway value is abbreviated field by field (per-field caps in
`CAP`), so meaning survives at the edges instead of the end of the block being cut off.

Optional — bounded and dropped in reverse relevance order when the budget is tight:

| Priority | Entry                                   | Bound       |
| -------: | --------------------------------------- | ----------- |
|        1 | held work, pending intake               | 2 entries   |
|        2 | repository observation                  | 2 lines     |
|        3 | current slice                           | 1 line      |
|        4 | relevant accepted decisions             | 3 entries   |
|        5 | why now                                 | 1 line      |

Selection adds optional entries in ascending priority while the total stays inside the target. An
entry that does not fit is skipped rather than ending the pass, so leftover budget can still carry a
smaller entry — but nothing more relevant is ever dropped *because of* something less relevant, since
relevance fixes the order of consideration.

### Budget

```text
Default target:  1,800 characters   (bounds what optional content is added)
Hard maximum:    2,400 characters   (asserted in tests; never reached in practice)
```

Measured on this repository during R1: **1,751 characters** for a continuation turn with held work and
repository observation present, against 2,400 truncated before R1.

### Relevance policy

A decision is injected only when its title or text **names the focused item or a held item by ID** —
an exact token match, not a topical guess. When relevance cannot be established deterministically the
entry is omitted. The ledger is never dumped: on this repository the pre-R1 block carried five
decisions unrelated to the active work, and the capsule carries the one (DEC-17) that names the held
item.

### Fields that do not exist

- **Objective.** Canonical state has no objective field. The capsule reports the latest accepted
  decision and names it (`Objective: DEC-18 …`), so the reader can verify the selection rather than
  trust it. The known weakness is that a later narrow decision becomes the newest accepted one; the
  line stays true (it is the latest accepted direction) but gets less useful. A dedicated canonical
  objective would need a schema migration and is deliberately not R1 work.
- **Current slice.** Derived from the canonical next action's first sentence, and only when that
  sentence is short and complete — a truncated prefix of the line below it is noise. R1 adds no slice
  lifecycle; inventing one would be fiction.
- **Active workers and terminals.** They do not exist (R2/R3). The capsule carries **no**
  active-operation field, not even a zero: a zero implies idle machinery that is real. The
  [Project Steward skill](../../.pi/skills/project-steward/SKILL.md) states the limit in prose.

## Continuation intent

`src/context/continuation.ts` recognizes a closed set of phrases whose only plausible meaning is
"recover the thread and keep working": `continue`, `keep going`, `resume`, `carry on`, `proceed`,
`go ahead`, `pick up where you left off`, and `<verb> [with|on] [the] [current] work|plan|slice|task|packet`.
Normalization trims whitespace, case, trailing sentence punctuation, and a leading or trailing
"please".

It is deliberately **not** a natural-language intent engine. A longer message that merely contains the
word — "continue the migration to v5 and explain the tradeoffs", "should we continue with NF-2?" —
carries its own instruction, and hijacking it would override what the developer actually asked for.

The prompt is read at the single host boundary (`before_agent_start` in
[`src/extension/register.ts`](../../src/extension/register.ts)), which is where Pi already hands the
turn's text to extensions. No new seam.

When intent is detected, the directive becomes: continue the named focus inside the accepted scope, do
not ask for a recap or a status report or state maintenance, spend at most four lines, then make the
first useful repository action **in this same turn**, and keep going without asking permission for
reversible in-plan work. Without it, the directive is the quieter "work the accepted focus; prefer a
justified action over a status report".

## What R1 does not make true

The capsule makes *invocation* immediately useful. It does not make Voila autonomous. Nothing runs
between turns: there is no background execution, no automatic settlement, no persistent worker, and no
self-running project management. `Continue.` means this turn does real work, and then the turn ends.

## Alternatives considered

- **A second, parallel capsule alongside the existing context block.** Rejected: two surfaces means
  duplicated facts, a bigger prompt, and drift between them. The block *is* the injected context, so
  it was rewritten in place.
- **A generalized intent classifier over the prompt.** Rejected: unbounded behavior change for a
  problem a five-line deterministic rule solves, and it would silently reinterpret real requests.
- **Skipping the observation section to protect the budget.** Rejected: branch and changed-file count
  are exactly the "thread of prior progress" a fresh session cannot otherwise recover. The orientation
  note was cut instead — Doctor and `/voila orient` carry it, and it is explicitly not a blocker.

## Tests

- [`test/continuation.test.ts`](../../test/continuation.test.ts) — the behavioral contract: intent
  recognition, what a continuation turn receives, what it must never receive, budget and relevance.
- [`test/context.test.ts`](../../test/context.test.ts) — assembler guarantees: no source leakage, no
  state mutation, honest degradation, continuation threading.
- [`test/proof.ui.test.ts`](../../test/proof.ui.test.ts) — how evidence appears in a capsule.

Automated tests establish what the capsule *contains*. Whether a model acts on it is the interactive
tier, recorded in
[`docs/verification/R1_AMBIENT_CONTINUITY.md`](../verification/R1_AMBIENT_CONTINUITY.md).
