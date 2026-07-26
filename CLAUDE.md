# CLAUDE.md

Claude-specific notes for this repository. **Read [AGENTS.md](AGENTS.md) first** — it holds the
harness-neutral operating instructions (phase, doctrine, reference handling, safety, Git norms).
This file adds only what is specific to Claude and does not repeat AGENTS.md.

## Precedence

1. Direct user instructions in chat.
2. `AGENTS.md` (repository operating instructions).
3. This file (Claude-specific refinements).
4. The user's global `~/.claude/CLAUDE.md`.

If this file ever conflicts with `AGENTS.md`, follow `AGENTS.md` and flag the conflict.

## Claude-specific guidance

- **Phase gate.** The runtime exists and is under active development. As of 2026-07-26 the active
  roadmap is `docs/plans/PROJECT_REALIGNMENT_PLAN.md` (R0 merged, **R1 implemented on
  `feat/r1-ambient-continuity` and not yet complete as NF-9**, R2 next), governed by
  `docs/product/PROJECT_STEWARD_DOCTRINE.md` and ADR-0009. Build only what the accepted R-packet
  calls for. Do **not** start approval bundles, broad model routing, arbitrary workflow scripting,
  remote execution, or release automation before R7 passes.
  (This entry previously said "Phase 0, docs only" — that was stale by six packets.)
- **Doctrine is authoritative; the v0.1 direction is preserved.**
  `docs/product/PROJECT_STEWARD_DOCTRINE.md` is the operational product statement.
  `docs/product/PRODUCT_DIRECTION.md` is the authored v0.1 source: its body stays verbatim, and only
  the status banner recording ADR-0009 was added. Do not silently rewrite the body; propose edits
  explicitly.
- **Never claim capability that does not exist.** R2–R7 are unbuilt. R1's ambient continuity is built
  and its acceptance is recorded in `docs/verification/R1_AMBIENT_CONTINUITY.md`, limitations included.
  No document, skill, README, or canonical record may describe delegation, background terminals, or
  automatic settlement as present.
- **CodeGraph.** There is no `.codegraph/` index here yet; use ordinary Read/Grep/Glob. Indexing is
  the user's decision.
- **Memory.** Durable facts about this project belong in your file-based memory and in the
  appropriate `docs/` file — not only in conversation context.
- **Evidence discipline.** When asserting Pi capabilities, cite the audited source. The Phase 0
  audit was based on Pi `0.80.3` local docs; the current published `latest` is `0.82.0`. Re-verify
  version-sensitive claims against the installed version before relying on them.
