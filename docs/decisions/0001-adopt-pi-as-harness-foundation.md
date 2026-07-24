# ADR 0001: Adopt Pi as the harness foundation

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

NewFang needs a coding-agent harness. The product direction names Pi as the foundation. The Phase 0
audit examined Pi `0.80.3` locally (docs, examples, source metadata) and found a small, well-documented
extension API, an in-process SDK, an RPC/JSON protocol, a session tree with branching and compaction,
model routing, and project trust. Packet 1 pins the foundation at `0.82.0` (engines
`node >=22.19.0`), the current published `latest`. No claim is made that these surfaces are stable
across arbitrary versions; they are documented for and pinned to `0.82.0`.

## Decision

Build NewFang on Pi (`@earendil-works/pi-coding-agent` and its sibling packages). Do not fork Pi and
do not vendor its source into this repository. Pin Pi as a runtime peer dependency at the installed
version.

## Consequences

- NewFang inherits Pi's run loop, TUI, tools, events, session tree, and model registry for free.
- NewFang is exposed to Pi version churn; mitigated by pinning the exact version (`0.82.0`),
  depending only on surfaces verified against the pinned version, and isolating Pi coupling behind a
  thin adapter (ADR-0007).
- Pi is installed project-locally in Packet 1 (it was not installed at Phase 0).

## Evidence

- [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md) (Pi `0.80.3`, access
  2026-07-24).
- npm `latest = 0.82.0`, `legacy-node20 = 0.74.2` (checked 2026-07-24).
