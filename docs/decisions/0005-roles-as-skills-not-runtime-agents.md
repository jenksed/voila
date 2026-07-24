# ADR 0005: Roles are skills/prompts in the MVP, not runtime agents

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

The product direction defines permanent roles (Project Steward, Explorer, Librarian, Builder, Fixer,
Verifier, Designer, Release Keeper). The Phase 0 audit found that Pi delegation is subprocess-based
(the `subagent` example spawns child `pi` processes in JSON mode, with agents defined as Markdown
frontmatter files), and that skills and prompt templates are native, low-cost primitives. A full
runtime multi-agent system is not required to prove the product thesis and carries reliability and
complexity cost (as seen in the reference setup's Effect-heavy, multi-backend subagent runtime).

## Decision

In the MVP, roles are **product concepts expressed as skills and prompt templates** (role playbooks),
with role definitions also available as agent frontmatter for the single bounded delegation the MVP
exercises. Runtime multi-agent delegation is introduced narrowly (one bounded task, concurrency = 1)
and only after the durable ledger and verification gate work. Roles remain model-independent; model
selection is a separate routing concern.

## Consequences

- The MVP proves ownership and delegation without building a multi-agent scheduler.
- Roles are cheap to define and revise (skills/prompts), and portable across models.
- Broader runtime roles, parallelism, and takeover UI are deferred until reliability is proven.

## Evidence

- [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md) (Subagents, Skills).
- [../research/BEN_SETUP_AUDIT.md](../research/BEN_SETUP_AUDIT.md) (subagents complexity).
- Product direction §10, §17.1.
