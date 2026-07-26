# Phase 7 — Self-hosting gate

The gate is **eight capabilities**. Delegation is deliberately not among them: direct Steward
execution satisfies the gate (see `docs/plans/MVP_IMPLEMENTATION_PLAN.md`, Phase 5 and Phase 7).

**Verdict: GO for headless self-hosting. The interactive TUI tier is unverified and is the one thing
still owed.**

Walk-through performed at `main` = `321b90f59990c09a02a0a370a6e978dd277fa161`, canonical revision 84.

## The eight capabilities

| # | Capability | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Planning intake | **PASS** | 8 intakes (INT-1..INT-8), sources preserved under recorded sha256, INT-8 carrying 3 append-only review records |
| 2 | Durable state | **PASS** | `.voila/project.json` schema v4, revision 84, atomic writes, append-only `events.jsonl` |
| 3 | Visible next action | **PASS** | `nextAction` + rationale set through `voila_set_next_action`; rendered in status, brief, and delivery summary |
| 4 | Claims and evidence | **PASS** | 5 claims, **5 of 5 supported** at the current fingerprint |
| 5 | Reproducible verification | **PASS** | 9 receipts; RCP-5..RCP-9 produced this session by `voila_run_verification` |
| 6 | State-transition blocking | **PASS** | Gate refused NF-3 and NF-4 with every failing reason enumerated, then accepted all four once evidence was real |
| 7 | Delivery summary | **PASS** | `/voila deliver` renders change set, claims at real status, risks, limitations, commands, next action |
| 8 | Commit suggestion | **PASS** | `/voila commit` proposes disjoint boundaries with readiness verdicts and paste-ready messages |

## How capability 6 was demonstrated

Both directions matter. A gate that only ever says yes is not a gate.

**Refusal**, before evidence existed:

```text
NF-3 REFUSED: Cannot complete NF-3: 1 gate(s) fail.
  - dependencies completed: not completed: NF-2

NF-4 REFUSED: Cannot complete NF-4: 5 gate(s) fail.
  - dependencies completed: not completed: NF-3
  - acceptance criteria recorded: no acceptance criteria; completion is undefined without them
  - required claims attached: no required claims; attach one with voila_require_claim
  - every acceptance criterion covered by a required claim: no criteria to cover
  - every required claim supported by current passing evidence: no required claims to support
```

Every failing gate is reported, not just the first.

**Acceptance**, after criteria, claims, and passing receipts were in place:

```text
OK NF-1 -> Completed NF-1: Complete the minimal project-operations layer.
OK NF-2 -> Completed NF-2: Build planning-document intake and repository orientation.
OK NF-3 -> Completed NF-3: Build claims, receipts, and completion gates.
OK NF-4 -> Completed NF-4: Add delivery behavior: commit suggestions and delivery summary.
```

## Backlog reconciliation

The backlog had drifted from reality: NF-1 through NF-4 shipped as Packets 2, 3, 4, and 6, but were
still `in_progress`, `ready`, or `backlog`. They were **not** marked complete by hand. Each was
reconciled through the product's own path:

1. acceptance criteria recorded (`voila_update_work_item`),
2. a claim written covering those criteria exactly (`voila_create_claim`),
3. a real verification run producing a receipt (`voila_run_verification`),
4. the claim attached as a completion requirement (`voila_require_claim`),
5. completion attempted through the protected gate (`voila_complete_work_item`).

Two corrections were made honestly rather than worked around:

- **NF-3's acceptance criterion named a tool that no longer exists.** After the Packet 4.5 rename it
  read `newfang_complete_work_item rejects unsupported completion`. The criterion and the two claims
  covering it were updated to name `voila_complete_work_item`. `updateClaim` preserves receipt links
  by design, and fresh receipts (RCP-5, RCP-6) were recorded at the current fingerprint regardless,
  so the corrected text is backed by new evidence rather than inherited evidence.
- **NF-1 carried a hold-marker as an acceptance criterion**: "awaits the future protected completion
  mechanism before it can be marked complete". That was a scheduling note, not a criterion, and the
  mechanism it waited for now exists. It was replaced with a substantive, testable criterion: "the
  protected completion transition exists and refuses unsupported completion".

## Doctor

23 checks after the walk-through: **22 PASS, 1 WARN, 0 FAIL** (the warning was orientation
staleness, cleared by recording ORI-3).

```text
[PASS] evidence freshness: 5 claim(s): none stale or unsupported
[PASS] receipt artifacts: 9 receipt(s) present and consistent with canonical metadata
[PASS] receipt output hashes: stored output matches its manifest hashes
[PASS] completed work revalidation: completed items would still pass their gates
[PASS] claim criterion agreement: covered criteria match work items
[PASS] acceptance criterion coverage: every gated item's criteria are covered
[PASS] generated view: PROJECT_STATUS.md matches state
```

`completed work revalidation` is the one that matters most here: every item completed during this
walk-through would still pass its gates if re-assessed right now.

## Automated gate

`mise exec -- npm run verify` — **573 tests, 573 passing, 0 failing.**

## What is NOT proven

**The interactive TUI has never been observed in this environment.** `process.stdin.isTTY` is
`undefined` and `mise exec -- npm run pi` exits immediately with status 0. Every claim about the
running TUI — the Steward Console rendering, Pi loading the Project Steward skill, the ambient
widget, narrow-width behavior, reload, clean exit — is unverified. Headless checks confirm the
adapter registers correctly and the skill's frontmatter parses, which is not the same thing.

**Voila is project-local.** `.pi/extensions/voila.ts` loads only in this repository. Using Voila on
another project requires either copying the extension into that project or packaging it (ADR-0002's
second step). This is the practical blocker for daily use elsewhere, and it is not a Phase 7 gate
item.

**Phase 5 delegation was not built.** That is by design: the plan states delegation is not a
self-hosting prerequisite and direct Steward execution is a first-class path.

## Verdict

**GO for headless self-hosting.** All eight capabilities are implemented and evidenced. Voila can
take a planning document, hold durable truth, name the next action, require claims, produce
reproducible receipts, refuse an unsupported completion, summarize a delivery against real evidence,
and propose commit boundaries — all demonstrated on itself in this walk-through.

Two items gate *daily-driver* use, and neither is a capability gap:

1. Run the interactive tier once in a real terminal.
2. Decide how Voila reaches other repositories (copy or package).
