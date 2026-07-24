# ADR 0006: Sandboxing is optional and not an MVP prerequisite

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

The product direction treats sandboxing as an optional execution profile that must not create
excessive setup complexity or become a prerequisite for ordinary use. The Phase 0 audit confirmed Pi
has **no built-in sandbox** (by design) and documents three external isolation patterns: a Gondolin
local micro-VM (requires Node >= 23.6.0 and QEMU), plain Docker (whole process), and NVIDIA OpenShell
(requires a gateway). On macOS/Apple Silicon these carry real setup friction.

## Decision

Sandboxing is optional and **off by default**. It is not part of the MVP vertical slice or the
self-hosting acceptance project. When sandboxing is investigated (a deferred phase), evaluate
lowest-friction options first — Git worktrees and project-isolated directories — before containers,
and treat micro-VM/OpenShell as advanced options. Ordinary local development must work with no
sandbox configured.

## Consequences

- The MVP avoids QEMU/Docker/gateway setup burden and macOS friction.
- Untrusted or unattended work still has a documented path (run Pi in a container/VM) when needed.
- The sandbox technology decision remains deferred pending a comparison prototype.

## Evidence

- [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md) (Sandboxing).
- Pi `docs/security.md` "No Built-in Sandbox"; `docs/containerization.md` (access 2026-07-24).
- Product direction §18.3, §26, §29.7.
