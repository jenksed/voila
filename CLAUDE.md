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

- **Phase gate.** This repository is at Phase 0 (research and architecture). Do not begin building
  the Voila runtime or production Pi extensions. Producing or editing documents under `docs/` is
  the expected work until a plan phase is explicitly approved.
- **Product direction is canonical and preserved verbatim.** `docs/product/PRODUCT_DIRECTION.md`
  is the authored v0.1 source. Do not silently rewrite it; propose edits explicitly.
- **CodeGraph.** There is no `.codegraph/` index here yet; use ordinary Read/Grep/Glob. Indexing is
  the user's decision.
- **Memory.** Durable facts about this project belong in your file-based memory and in the
  appropriate `docs/` file — not only in conversation context.
- **Evidence discipline.** When asserting Pi capabilities, cite the audited source. The Phase 0
  audit was based on Pi `0.80.3` local docs; the current published `latest` is `0.82.0`. Re-verify
  version-sensitive claims against the installed version before relying on them.
