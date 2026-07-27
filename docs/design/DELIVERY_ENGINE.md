# Delivery Engine (Phase 6)

The delivery engine turns a read-only inspection plus canonical project truth into a **proposal**:
what changed, which claims carry evidence right now, what is risky, and how the change could be
split into commits.

It closes the last two of the eight self-hosting capabilities: **delivery summary** and **commit
suggestion**.

## The boundary

The engine **proposes and never acts**.

- It does not create a commit.
- It does not stage a file.
- It does not push or open a pull request.
- It does not execute the verification commands it lists.

This is a product decision, not an implementation gap. The delivery boundary is where a human
approves, and a model with a one-call path across it would defeat the purpose. There is deliberately
no `voila_commit` tool.

The boundary is enforced by a test that drives the whole engine against a real repository and then
asserts `HEAD` did not move, no commit was created, `git status --porcelain` is byte-identical, and
`.git/index` was not rewritten.

The read-only boundary does not justify a vague handoff. When owner action is required to open a pull
request, the Project Steward inspects the host and CLI availability and recommends an explicit
paste-safe command (for GitHub with `gh`, a one-line `gh pr create` command with base, head, title,
and body). The Steward does not execute it or assume authentication. If the CLI is unavailable, it
provides the host's exact compare/new-PR URL as the actionable fallback.

## Layering

```text
delivery-inspector/   read-only observation      (Packet 5A — imports nothing from Voila)
        │
        ▼
delivery/             join + proposal            (this packet — pure, no I/O)
        │
        ▼
commands/deliver.ts   /voila deliver, /voila commit
tools/delivery-tools  voila_get_delivery_summary, voila_suggest_commit
```

`src/delivery/` is pure. It takes a `DeliveryInspection`, a `ProjectState`, and a fingerprint, and
returns a `DeliverySummary`. All I/O lives in the command and tool layer.

## What the summary contains

Fixed order, so two runs are diffable:

| Section | Source |
| --- | --- |
| Identity and position | canonical state + inspection `repository` |
| What changed | inspection `summary` |
| Claims and evidence | `evaluateAllClaims` against the current fingerprint |
| Risks and attention | open `RSK-n` + `inspect_before_delivery` items + ungrouped paths |
| Limitations | inspection limitations + engine limitations |
| Verification commands | inspection discovery — **never executed** |
| Proposed commits | boundaries joined to attention |
| Next justified action | canonical state, read verbatim |

## Honesty rules

A delivery summary is exactly where the temptation to round up appears, so the rules are explicit.

**Claims are reported at their real status.** A stale claim is listed as unsupported with its
reason. It is never quietly counted as support and never omitted — hiding a claim would be as
dishonest as overstating it. The summary leads with `N of M claim(s) currently supported`, which is
a number that can be zero.

**The next action is read, not invented.** The engine has no authority to decide what to do next;
canonical state does.

**Everything unseen is stated.** No fingerprint means no claim can be shown as current evidence, and
the summary says so. No claims at all means the delivery carries no evidence, and the summary says
that too.

**Commit subjects disclose their own provenance.** A generated subject describes change *shape*
(`feat: add 7 files`), never intent, because the engine has no evidence about intent. Every proposal
body says the subject was generated from the change shape and must be rewritten. A vague-but-true
subject the author will replace beats a confident invention.

**No file content reaches a commit message.** Subjects are built from paths and statuses only, so no
changed text — and no credential-shaped string — can leak into a message the engine wrote.

## Commit readiness

| Readiness | Meaning |
| --- | --- |
| `blocked` | An `inspect_before_delivery` attention item touches this boundary. Do not commit blind. |
| `inspect_first` | A `worth_reviewing` or `informational` item touches it. |
| `ready` | Nothing flagged. Still a proposal: the inspector checks shape and naming, not correctness. |

Boundaries come from the inspector and are disjoint by construction, so no path appears in two
proposals. Paths the inspector declined to group are surfaced as a **risk**, not dropped — an
ungrouped path is easy to deliver by accident or forget entirely.

## Command surface

```text
/voila deliver    full delivery summary
/voila commit     proposed commit boundaries with paste-ready messages
```

Both are read-only. `/voila deliver` returns a warning level when any boundary is `blocked`.

## Tools

| Tool | Purpose |
| --- | --- |
| `voila_get_delivery_summary` | The full summary, for grounding a delivery narrative in real evidence |
| `voila_suggest_commit` | Commit boundaries with generated messages |

Both are read-only. Their prompt guidelines instruct the model to report claim statuses exactly as
returned and never to present a `blocked` boundary as safe.

## What this does not do

- No push, PR, or release. Those cross the approval boundary.
- No execution of discovered verification commands. Use `voila_run_verification`, which produces a
  receipt; a discovered command is a candidate, not evidence.
- No commit-message generation from intent. That requires knowing what the change means, which the
  engine does not.
- No rewriting of canonical state. `/voila deliver` is a read.
