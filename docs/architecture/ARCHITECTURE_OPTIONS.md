# Architecture Options

## Summary

Five architectures can deliver Voila on Pi. They are not mutually exclusive over time; the real
decision is the **starting point** and the **migration path**. This document compares them on the
dimensions that matter for Voila. The recommendation is in
[RECOMMENDED_ARCHITECTURE.md](RECOMMENDED_ARCHITECTURE.md). Evidence: Pi `0.80.3` docs (access
2026-07-24), see [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md).

## The options

1. **Project-local Pi extensions** — a set of `.pi/extensions/*.ts` (plus skills, prompts, a theme)
   loaded by an installed `pi` CLI. State in session entries + repo files. No separate app.
2. **Shareable Pi package** — the same extensions/skills/prompts/theme bundled as an
   `@voila/*` pi package (npm or git), installed via `pi install`. Distribution-oriented.
3. **Standalone application embedding Pi via the SDK** — a Node/TypeScript app that calls
   `createAgentSession()` / `createAgentSessionRuntime()`, owns its own UI and process, and uses Pi
   as a library.
4. **Application controlling Pi over RPC** — a separate process (any language) that spawns
   `pi --mode rpc` and drives it over JSONL, owning UI and orchestration outside Pi.
5. **Hybrid** — extensions/package for the in-terminal experience *plus* a thin controller (SDK or
   RPC) for out-of-terminal concerns (delegation fan-out, background/remote execution, external
   dashboards), sharing the repo-visible ledger as the contract.

## Evaluation

Scores are qualitative: **High / Medium / Low**, read in Voila's favor (High = better for
Voila). "Upgrade resilience" = tolerance to Pi version churn. "Self-hosting" = how well Voila can
build Voila under this architecture now.

| Dimension | 1. Extensions | 2. Package | 3. SDK app | 4. RPC app | 5. Hybrid |
|-----------|---------------|-----------|-----------|-----------|-----------|
| Development speed (to first value) | High | Medium | Low | Low | Medium |
| User experience (in terminal) | High | High | High (own UI) | Medium | High |
| State ownership | Medium (Pi session + repo files) | Medium | High (app owns) | High (app owns) | High (repo ledger is contract) |
| Custom UI capability | Medium–High (TUI API) | Medium–High | High (any UI) | High (any UI) | High |
| Testability | High (unit + jiti) | High | Medium (more surface) | Medium | Medium |
| Self-hosting potential (now) | High | High | Low (must build app first) | Low | Medium |
| Upgrade resilience (Pi churn) | Medium (extension API stable) | Medium | Low–Medium (SDK surface larger) | Medium (RPC protocol stable) | Medium |
| Portability (across machines) | Medium (needs pi install) | High (installable) | Medium (ship app) | Medium | Medium |
| Sandboxing fit | Medium (Gondolin/Docker/OpenShell as-is) | Medium | High (app controls process) | High | High |
| Remote / long-running execution fit | Low–Medium (ext operations, ssh) | Low–Medium | High (app owns lifecycle) | High | High |
| Subagent routing fit | Medium (subprocess + JSON mode) | Medium | High (in-process sessions) | Medium–High | High |
| Maintainability | High (small, modular) | High | Medium (own the world) | Medium | Medium |
| Migration cost *into* this option | n/a (start here) | Low (from 1) | High | High | Medium |
| Migration cost *out of* this option | Low → package | Low → app later | High | High | — |

## Notes per option

### 1. Project-local extensions

- **For**: Fastest path to real value on native primitives (extensions, tools, events, custom UI,
  session state). Highest self-hosting potential *now* — Voila can build Voila immediately.
  Small, modular, testable; extension API is the most stable Pi surface. Matches "personal utility
  first."
- **Against**: Requires an installed `pi`. State is split between Pi session entries and repo files
  (mitigated by making repo files authoritative). Custom UI is bounded by the TUI API. Background/
  remote execution is DIY.
- **Verdict**: Best starting point.

### 2. Shareable package

- **For**: Same code as option 1, but installable and shareable (`pi install npm:@voila/...` or
  git), team-shareable via project settings. Trivial migration from option 1 (add a `pi` manifest,
  move core deps to `peerDependencies`).
- **Against**: Distribution is not an MVP concern ("personal utility before public positioning").
  Packaging adds release overhead prematurely.
- **Verdict**: The natural *second* step; not the starting point.

### 3. Standalone SDK app

- **For**: Maximum control — own UI (web/desktop/TUI), own process lifecycle, direct agent state,
  in-process subagent sessions, strong fit for sandbox/remote/delegation. Type-safe.
- **Against**: Highest up-front cost; you rebuild the run loop, UI, and much that Pi gives free.
  Lowest self-hosting potential now (you must build the app before Voila can use itself). Larger
  Pi SDK surface = more exposure to churn. Contradicts fast personal utility.
- **Verdict**: Powerful future pivot; wrong to start here.

### 4. RPC-controlled app

- **For**: Process isolation and language independence; stable JSONL protocol; good for an external
  dashboard or a non-Node controller.
- **Against**: For a Node/TypeScript project the SDK is strictly preferable (Pi's own docs say so);
  RPC adds a process boundary and framing burden without benefit here. Weak self-hosting now.
- **Verdict**: Only justified if a non-Node or strongly isolated controller becomes a requirement.

### 5. Hybrid

- **For**: Lets the in-terminal experience stay extension-based while a thin SDK/RPC controller
  handles what extensions do poorly (fan-out delegation, background/remote execution, external
  views), with the **repo-visible ledger as the shared contract**. This is the likely *mature*
  shape of Voila.
- **Against**: Two moving parts and a contract to maintain; premature before the ledger and single
  delegation are proven. Complexity without payoff at MVP.
- **Verdict**: The probable end-state, reached incrementally — not the starting point.

## Decision framing

- Do **not** choose an option because it is ambitious. Options 3–5 sound more capable but cost the
  one thing this packet's product direction prizes most early: the ability for Voila to **build
  itself** quickly with durable, inspectable state.
- The cheapest reversible path is **1 → 2 → (5)**: start as project-local extensions, package when
  sharing matters, add a thin controller only when background/remote/fan-out needs are proven. The
  SDK's existence (option 3) keeps a deeper pivot low-risk if ever needed.
