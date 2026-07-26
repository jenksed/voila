# ADR 0004: No vendoring or code reuse of reference repositories

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

The reference setup `davis7dotsh/my-pi-setup` (inspected at commit `21f40f4`, 2026-07-23) is a rich
source of interface and orchestration ideas. However, it ships **no license file** — meaning all
rights reserved, no reuse rights granted — and its README explicitly discourages copying. Pi's own
examples are also not guaranteed production-ready.

## Decision

Do not vendor the Pi source or any reference setup into the NewFang repository. Do not reuse
reference-repo code. Treat `davis7dotsh/my-pi-setup` as conceptual inspiration only and reimplement
ideas independently. Research copies of reference repos are cloned outside the tracked tree (or into
an ignored `research/` directory) and are never committed. Check licenses before proposing any code
reuse from any source; classify each borrowed idea (inspiration / API pattern / reusable-with-license
/ reimplement).

## Consequences

- Every element from the reference setup is capped at "reimplement independently"; nothing is reused
  as-is.
- NewFang documents its own contracts explicitly rather than inheriting undocumented ones.
- Pi examples are used as patterns, not lifted wholesale, and are validated before reliance.

## Evidence

- [../research/BEN_SETUP_AUDIT.md](../research/BEN_SETUP_AUDIT.md) (license finding, element
  classification).
- `AGENTS.md` "Reference handling".

## Rename note

This ADR is preserved as written. The product was later renamed from NewFang to Voila
(Packet 4.5): the canonical state directory is now `.voila/`, the Pi adapter is
`.pi/extensions/voila.ts`, the command is `/voila`, and the package scope under consideration is
`@voila`. The decision recorded above is unchanged; only the names are. See
[../migrations/NEWFANG_TO_VOILA.md](../migrations/NEWFANG_TO_VOILA.md).
