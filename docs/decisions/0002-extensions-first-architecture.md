# ADR 0002: Extensions-first architecture

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

Five architectures can deliver NewFang on Pi: project-local extensions, a shareable package, a
standalone SDK app, an RPC-controlled app, and a hybrid. They were compared in
[../architecture/ARCHITECTURE_OPTIONS.md](../architecture/ARCHITECTURE_OPTIONS.md). The product
direction prioritizes personal utility first and NewFang's ability to build itself quickly.

## Decision

Start NewFang as **project-local Pi extensions** (with skills, prompt templates, and a theme).
Package as an `@newfang` pi package as the second step when sharing matters. Hold the SDK (in-process)
and RPC (subprocess) controller options in reserve for a later hybrid, added only when background/
remote/fan-out execution is proven necessary.

## Consequences

- Fastest path to real value on native primitives; highest self-hosting potential now.
- Custom UI is bounded by Pi's TUI API; background/remote execution is DIY (deferred).
- Migration `extensions → package` is low-cost (add a `pi` manifest, move core deps to
  `peerDependencies`). A deeper pivot to an SDK app remains possible but is deliberately deferred.

## Rejected alternatives

- Standalone SDK app or RPC app as the *starting* architecture — highest cost, lowest self-hosting
  now.
- Package-first before the extensions exist — premature distribution overhead.

## Evidence

- [../architecture/ARCHITECTURE_OPTIONS.md](../architecture/ARCHITECTURE_OPTIONS.md),
  [../architecture/RECOMMENDED_ARCHITECTURE.md](../architecture/RECOMMENDED_ARCHITECTURE.md).
