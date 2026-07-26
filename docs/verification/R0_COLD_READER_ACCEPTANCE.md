# R0 — Cold-reader acceptance test

- **Date:** 2026-07-26
- **Packet:** R0 — direction lock and roadmap reset
- **Branch:** `docs/project-steward-realignment`
- **Verdict:** **PASS** — the current sources communicate one clear direction
- **Confidence:** High (reader's own assessment)
- **Repository changes made by the test:** none; read-only evaluation

## Purpose

[The realignment plan §6](../plans/PROJECT_REALIGNMENT_PLAN.md#6-r0--direction-lock-and-roadmap-reset)
defines R0's acceptance gate as a property of the documents, not of any code:

> A new agent reading only the current product direction, doctrine, plan, handoff, and canonical
> state must reach the same conclusion: Build the operational AI-teammate loop next; do not expand
> proof ceremony or approval infrastructure.

That gate cannot be checked by a test suite and cannot be honestly self-assessed by the author of the
documents, who knows the intended answer. It requires a reader with no conversational context
deriving the direction from the files alone. This record exists so the result is auditable and the
test is reproducible.

## Method

### Permitted source set

Exactly six files. No other repository content, no git history, no conversation.

```text
README.md
docs/HANDOFF.md
docs/product/PRODUCT_DIRECTION.md
docs/product/PROJECT_STEWARD_DOCTRINE.md
docs/plans/PROJECT_REALIGNMENT_PLAN.md
.voila/briefs/PROJECT_BRIEF.md
```

### Isolation requirement

The reader received no prior conversational context, no description of the intended answer, and no
access to the realignment discussion. Every conclusion had to cite a permitted source. The reader was
required to separate documented fact from its own inference, and to state where sources were
ambiguous rather than resolving ambiguity silently.

### Repository state at time of reading

Canonical revision 186. The brief reported test count 587 (stale — see finding 8).

## Principal conclusions reached

The reader answered fifteen questions. It reached the intended direction on every one:

1. **What Voila is becoming** — a project-aware agentic development environment built on Pi, whose
   Project Steward keeps models, agents, tools, terminals, and handoffs aligned with durable project
   intent. Identified all four sources stating this identically, and noted the v0.1
   "personal development operating system" framing is demoted by its own status banner.
2. **The Steward's primary responsibility** — retain the thread, running
   `Understand → Decide → Delegate → Observe → Correct → Integrate → Continue`.
3. **What to build next** — R1, tracked as NF-9, with its five scope items enumerated correctly.
4. **Why** — DEC-18 makes the operational loop the active priority; R0 is documentation-only; every
   later R-packet depends on R1.
5. **Promoted capabilities** — child workers, background terminals, worker inspection and takeover,
   automatic settlement; ambient UI expanded to a cockpit; work items elevated to the navigation
   spine.
6. **Paused** — approval bundles, explicitly not cancelled.
7. **Deferred** — arbitrary workflow scripting, multi-harness at scale, remote execution; correctly
   separated the **rejected** general policy engine as a distinct category.
8. **Preserved** — the full retained set plus the non-negotiable invariants, and correctly flagged
   that the manual proof-refresh workflow and HEAD-based orientation freshness are marked for removal
   and replacement rather than preservation.
9. **Role of proof and delivery** — a quiet boundary service, not a daily surface; quoted the
   controlling constraint that automating the *operation* of evidence is the goal while weakening
   what evidence *means* is not.
10. **What must not be claimed implemented** — all of R1–R7, plus delegation, background processes,
    approval bundles, sandboxing, remote execution, model routing, cost tracking, release automation.
11. **What the developer manages** — intent, consequential judgment, credentials, final authority.
12. **What the developer must not manage** — the nine No Managing the Manager failure conditions.
13. **Canonical focus** — NF-9.
14. **Next justified action** — open the R0 PR first, then branch for R1.
15. **Coherence** — sufficient for a new agent to continue correctly without prior context.

The reader also independently reproduced the built / accepted-but-unimplemented / paused / deferred /
rejected capability boundary, and produced a developer-burden ownership table matching the doctrine's
division of labor — while noting on its own initiative that most of the Steward column is currently
doctrine rather than implementation.

**Most likely wrong conclusion identified by the reader:** that NF-2 is the next work item, because
the brief lists it first under "Work in flight" as `ready`/`high` and the README calls it "open",
when it is held behind an owner-performed authenticated acceptance run.

## Findings

Eight material findings. Numbering 1–7 follows the reader's own report; finding 8 was surfaced by the
closeout verification that followed it.

| # | Finding | Wrong-action risk | Disposition |
| --- | --- | --- | --- |
| 1 | NF-2 presented as `ready` while held by DEC-17; only the handoff says HELD | Possible — an agent reading the brief alone could select NF-2 over NF-9 | **Assigned to R1** |
| 2 | The R0 pull request is in canonical state but absent from the handoff, which jumps to R1 | Mild — an agent could start R1 on an unmerged R0 | **Corrected** |
| 3 | README described the handoff as covering "the two open decisions"; the handoff has one | None | **Corrected** |
| 4 | Phase numbering diverges: README/handoff call delivery "Phase 6", `PRODUCT_DIRECTION.md` §27 calls Phase 6 verification | None — the whole phase sequence is superseded | **Accepted as-is** |
| 5 | Authority chain stated in only two of six files; README labelled only the doctrine "Authoritative" | None — plan and doctrine do not substantively conflict | **Corrected** |
| 6 | Handoff header state older than its body (`0d07e1b`, pre-realignment) | None, but weakens the handoff as a freshness signal | **Corrected** |
| 7 | Doctrine lists focus capsule as *Partial*; README listed context injection as built without the qualifier | None | **Corrected** |
| 8 | Test count stated as 587 in README and handoff; actual count is 588 | None | **Corrected** |

### Corrections performed in this closeout

- **Finding 2** — `docs/HANDOFF.md` §3 now separates the immediate delivery action (open and merge
  the R0 PR, with draft PR #9 named as open and unmerged) from the subsequent implementation action
  (branch for NF-9 after the merge), and states explicitly that R1 must not begin on this branch.
- **Finding 3** — the README pointer now describes the handoff by its durable purpose rather than by
  a count that goes stale.
- **Finding 5** — the README document map now states the three-level authority chain explicitly, and
  records that `PRODUCT_DIRECTION.md` is superseded only where the doctrine supersedes it, not
  wholesale.
- **Finding 6** — the handoff header now carries verified values read from the repository: branch,
  HEAD, canonical revision, test count, and working-tree cleanliness. Receipt and decision counts in
  §3 were corrected the same way.
- **Finding 7** — the README now marks automatic context injection **partial**, matching the
  doctrine's capability table.
- **Finding 8** — README and handoff corrected to 588. ADR-0009 retains 587 with the clarification
  that it was the count when the decision was taken; R0's own regression test moved it to 588.
  Historical packet records in `PROJECT_LEDGER.md` (360/360) were **not** rewritten — they are
  truthful for the packets they describe.

### Deliberately not corrected

- **Finding 1 (NF-2 readiness)** stays open and is R1 work. NF-9's canonical acceptance criterion 4
  already requires it, testably: *"A work item does not display READY to complete while a known
  required human or authenticated activity remains pending."* That matches
  [realignment plan §7](../plans/PROJECT_REALIGNMENT_PLAN.md#7-r1--friction-containment-and-ambient-continuity)
  "Readiness labels" and needed no strengthening. R0 introduced no status-model change, did not mark
  NF-2 complete, and did not perform or simulate the authenticated intake — which remains owner work.
- **Finding 4 (phase numbering)** is a labelling artifact of a superseded sequence. Renumbering
  history to match a roadmap that replaced it would damage the record it preserves.

## Known limitation of this test

The reader evaluated coherence, not correctness of direction. A PASS means the six sources agree and
lead a cold reader to the intended next action; it does not establish that the direction itself is
right. It also read canonical state through the generated brief rather than `project.json`, which is
exactly the surface finding 1 concerns.

## Acceptance gate result

**The R0 acceptance gate is satisfied.** A reader given only the current documents concluded, without
prompting: build the operational AI-teammate loop next, and do not expand proof ceremony or approval
infrastructure. The residual defects were stale pointer sentences and one status-label inconsistency
that is itself a documented R1 work item — not a directional conflict.

Doctor still reports one warning: ORI-5 orientation is stale because HEAD moved and `AGENTS.md` and
`CLAUDE.md` changed materially. That warning is honest and was preserved deliberately. No cosmetic
orientation was recorded to clear it; replacing HEAD-based freshness with relevant-content freshness
is NF-9 criterion 2.
