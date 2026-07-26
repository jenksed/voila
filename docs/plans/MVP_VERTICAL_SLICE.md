# MVP Vertical Slice

## Summary

The smallest slice that proves Voila is more than cosmetic Pi customization is a single
**intake → ledger → next action → one bounded work item → one claim → one verification receipt →
resume** loop, run as project-local Pi extensions with a repo-visible ledger. It exercises project
orientation, planning-document intake, durable state, a visible next action, one delegated-or-direct
work item, one tracked claim, one reproducible receipt, and resumability — without requiring the full
multi-agent system. Evidence for feasibility:
[../research/VOILA_CAPABILITY_MATRIX.md](../research/VOILA_CAPABILITY_MATRIX.md).

## What the slice must prove

> Voila can take a planning document (or request) into a repository, form durable project truth,
> show the next justified action, complete one bounded work item, make one important claim, verify it
> with a reproducible receipt, and resume all of that from disk after a restart — while the Project
> Steward keeps ownership.

If a reviewer can restart Pi mid-project and Voila reconstructs intent, decisions, the open work
item, the claim, and the receipt from repo-visible files, the slice succeeds.

## In scope (the eight capabilities)

1. **Project orientation** — on entry to a repo, produce a focused orientation (purpose, structure,
   branch/worktree, likely build/test commands, existing plans) as a skill-driven step.
2. **Planning-document intake** — given a plan/request, preserve the original, classify contents
   (locked decision, constraint, requirement, acceptance criterion, open question, assumption, risk,
   non-goal), and produce a short understanding check.
3. **Durable project state** — write canonical `.voila/` state (authoritative `project.json`,
   append-only `events.jsonl`, generated `views/PROJECT_STATUS.md`) per ADR-0003; backlog is added
   to this store. Optional session caching never overwrites canonical state.
4. **Visible next action** — a home-view module (`setWidget`/`setFooter`) and a `/voila status`
   command answering "where is this project, and what is the next justified action?"
5. **One bounded work item** — a single backlog item with acceptance criteria, executed either
   directly by the Steward or via one bounded delegated specialist (subprocess subagent, JSON mode).
6. **One important claim** — a tracked claim (statement, status, confidence, evidence link, environment,
   known limits, verification date).
7. **One verification receipt** — a reproducible receipt (command, environment, versions, result,
   output path) written to disk and linked to the claim; an acceptance gate that **rejects the
   explicit "mark work complete" state transition** (a future `voila_complete_work_item`) unless the
   linked claim's required receipt passes. The gate governs Voila's authoritative state transition,
   not the model's prose — Voila cannot prevent an LLM from writing "done", but it guarantees
   `project.json` does not record the item complete unless the gate passes.
8. **Resumability** — after restart, load and validate canonical `.voila/` state first (session
   entries never overwrite it; mismatch warns + emits an event) and restore the home view, backlog,
   claim, and receipt.

## Explicitly out of scope for the slice

- Multi-agent orchestration, parallel specialists, takeover UI.
- Background terminals, sandboxing, remote/long-running execution.
- Model-routing policy engine, cost/budget accounting.
- PR creation (a delivery *summary* is enough; a commit *suggestion* is enough).
- Approval bundles as a subsystem (a single confirm gate is enough here; the full approval system is
  the self-hosting project).
- Theme, packaging, distribution.

## Concrete acceptance walk-through

A reviewer should be able to run this end to end:

1. Start `pi` in a small target repository with a short `PLAN.md`.
2. Voila orients, ingests `PLAN.md`, and writes `docs/project/` (or `.voila/`) ledger + backlog;
   `/voila status` shows identity, phase, health, and the next action.
3. Voila (or one delegated specialist) completes one backlog item with acceptance criteria.
4. Voila records a claim (e.g., "the added function returns X for input Y") and runs a test as its
   verification receipt; the receipt file is written and linked; the "mark complete" transition
   succeeds only because the test passed.
5. Deliberately break the code so the test fails; re-run — the "mark complete" state transition is
   **rejected** and `project.json` still shows the item incomplete with the claim marked unsupported.
   Restore; the transition succeeds.
6. Quit Pi. Restart. Voila reconstructs the ledger, backlog, claim, and receipt from disk and shows
   the same next action.

## Why this is not cosmetic

- It writes and **loads/validates durable, human-readable canonical state** — the core of the product
  thesis.
- It **rejects an unsupported "mark complete" state transition** — evidence-before-completion made
  real at the level Voila can actually guarantee (authoritative state), not model prose.
- It **survives a restart from disk** — ownership across interruption.
- It uses **native Pi primitives** end to end, proving the extensions-first architecture.

## Feasibility and confidence

- Capabilities 1–4, 6–8 rest on High-confidence primitives (tools, events, atomic file writes,
  `setWidget`, `pi.exec`, canonical-state load on `session_start`).
- Capability 5's *delegated* variant depends on subprocess subagents (Medium confidence). **Mitigation:**
  the slice is acceptable with the work item done *directly* by the Steward; delegation is a
  stretch goal within the slice, not a gate.

## Exit criteria

The slice is done when the acceptance walk-through passes, each Voila tool has unit tests, the
the transition-rejected-on-failing-receipt behavior has a test, and the resume path has a
canonical-load/validation test — and those tests pass (receipts recorded in `.voila/`).
