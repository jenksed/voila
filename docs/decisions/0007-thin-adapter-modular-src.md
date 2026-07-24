# ADR 0007: Thin Pi adapter, modular package-ready `src/`

- **Status**: Accepted
- **Date**: 2026-07-24
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

ADR-0002 locked an extensions-first architecture. Packet 1 clarifies how the extension is organized
so that Pi coupling stays thin and production logic stays testable without Pi and package-ready.

## Decision

Pi loading is project-local through a **thin adapter**; implementation is modular and package-ready.

```text
.pi/
└── extensions/
    └── newfang.ts      # thin adapter: Pi-specific loading + composition only

src/
├── extension/          # composition/registration wiring (Pi-aware, thin)
├── state/              # canonical state store (pure, no Pi)
├── domain/             # types, defaults, status derivation (pure, no Pi)
├── commands/           # command logic (pure/extractable; handlers adapt to Pi)
└── ui/                 # home-view projection (pure string building where possible)

test/
```

Rules (locked):

- `.pi/extensions/newfang.ts` contains only Pi-specific loading and composition. No state
  persistence or domain logic lives in this file.
- Domain and persistence modules under `src/` are testable **without Pi running**.
- Command logic is extracted so handlers can be tested without a live model or terminal.
- Avoid framework-heavy state machines and Effect-style abstractions unless a concrete problem proves
  they are necessary.

The exact internal directory names may vary if a simpler structure is demonstrably better, but the
rule — thin Pi adapter, modular package-ready implementation — is fixed.

## Consequences

- Migrating from project-local extensions to an `@newfang` pi package (ADR-0002 second step) requires
  moving the thin adapter and adding a manifest; `src/` is already package-ready.
- Unit tests cover pure modules directly; only the integration test needs the Pi package.
- Pi version churn is contained to the adapter and `src/extension/`.

## Evidence

- [../architecture/RECOMMENDED_ARCHITECTURE.md](../architecture/RECOMMENDED_ARCHITECTURE.md).
- Packet 1 Parts A2, C1, C7.
