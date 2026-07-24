# Recommended Architecture

## Summary

Start NewFang as **project-local Pi extensions** (Option 1), with a **repo-visible Markdown/JSONL
project ledger as the authoritative state owner**, roles delivered as **skills and prompt templates**
(not runtime agents yet), and a single **subprocess-based delegation** using Pi's JSON mode when the
MVP needs it. Package as an `@newfang` pi package (Option 2) once sharing matters. Keep the SDK and a
thin controller (Option 5) in reserve for background/remote/fan-out work. This maximizes speed,
self-hosting, and durability while staying reversible. Evidence:
[../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md),
[ARCHITECTURE_OPTIONS.md](ARCHITECTURE_OPTIONS.md).

## Architecture at a glance

```text
Installed Pi CLL (`pi`)  ─ harness, run loop, TUI, model registry, session tree, events, tools
        │
        ▼  loads
NewFang (project-local extensions in .pi/extensions/, later an @newfang pi package)
        │
        ├─ Intake tools/skills        → build a working brief from request/plan/repo
        ├─ Ledger + Backlog tools     → durable project truth (writes repo files; mirrors to session)
        ├─ Claims + Evidence tools    → statements, receipts, confidence
        ├─ Acceptance-gate tool       → can block completion on unsupported claims (on("tool_call"))
        ├─ Home-view UI               → setWidget/setFooter/custom(): identity, phase, health, next action
        ├─ Delegation tool            → spawn one bounded specialist (pi subprocess, JSON mode)
        ├─ Delivery behaviors         → git checkpoint suggestion + delivery summary (pi.exec)
        └─ Roles (skills/prompts)     → Steward, Explorer, Librarian, Builder, Fixer, Verifier, ...
        │
        ▼  authoritative state (locked: ADR-0003)
.newfang/  project.json (authoritative snapshot) + events.jsonl (append-only) + receipts/ + views/PROJECT_STATUS.md (generated)
        ▲
        └─ Pi session entries are a non-authoritative cache; on resume canonical state loads first,
           mismatch warns + emits an event, never a bidirectional merge
```

## Component boundaries

- **Pi (unchanged, installed):** run loop, TUI primitives, model/provider registry, session tree,
  compaction, events, built-in tools, trust. NewFang does not fork or vendor Pi.
- **NewFang extensions:** the tools/commands/UI/events above. Each extension owns one concern
  (intake, ledger, claims, gates, home-view, delegation, delivery) and is independently testable.
- **NewFang roles:** responsibility definitions expressed as skills/prompt templates and (for
  delegation) agent frontmatter `.md` files. Roles are model-independent; model choice is a routing
  concern layered on top.
- **NewFang state:** the `.newfang/` directory (authoritative `project.json` + append-only
  `events.jsonl` + `receipts/` + generated `views/PROJECT_STATUS.md`). This is the human-readable
  source of truth. Pi session entries are a non-authoritative cache, not the authority. See ADR-0003.
- **Thin adapter rule:** `.pi/extensions/newfang.ts` is a thin Pi adapter; production logic lives in
  modular `src/` (see [ADR-0007](../decisions/0007-thin-adapter-modular-src.md)).

## Authoritative state owner (decisive, locked)

The **`.newfang/` directory is authoritative**, not Pi session entries or model context, per
[ADR-0003](../decisions/0003-authoritative-state-is-human-readable-ledger.md):

- `.newfang/project.json` — authoritative current-state snapshot.
- `.newfang/events.jsonl` — append-only history (never authoritative current state).
- `.newfang/receipts/` — immutable verification evidence (later packets).
- `.newfang/views/PROJECT_STATUS.md` — generated, human-readable projection (marked generated).

Pi session entries are a **non-authoritative cache**. On resume, canonical state loads and validates
**first**; a session/canonical mismatch produces a warning and an event, never a bidirectional merge.
Writes are atomic (temp-file + atomic replace); a successful canonical write precedes any session
cache or UI update.

The `docs/project/PROJECT_LEDGER.md` bootstrap file remains a hand-maintained human ledger during
bootstrap; it is not the runtime canonical store. The runtime canonical store is `.newfang/`.

## Extension / package boundaries

- **MVP:** project-local `.pi/extensions/` in the NewFang repo (and, for dogfooding, installed into a
  target project's `.pi/`). No package manifest yet.
- **Thin adapter:** `.pi/extensions/newfang.ts` contains only Pi loading/composition; all domain and
  persistence logic lives in `src/` and is testable without Pi (ADR-0007).
- **Second step:** add a `pi` manifest to `package.json`, move `@earendil-works/pi-*` (and any TypeBox
  usage) to `peerDependencies` with `"*"`, and publish/point via `pi install git:...` or
  `npm:@newfang/...`.
  Migration cost is low precisely because Option 1 code is package-ready.

## Runtime relationships

- NewFang runs **inside** the Pi process as loaded extensions. No separate NewFang process in the
  MVP.
- **Delegation** spawns child `pi` processes in JSON mode for isolated-context specialist tasks
  (Pi's `subagent` example pattern), reading structured results and delivering them as follow-up
  messages. Concurrency is capped low (start with one at a time).
- A **thin controller** (SDK in-process, or RPC subprocess) is added only when background/remote/
  fan-out execution is proven necessary; it will read/write the same repo ledger.

## Initial dependency choices

- **Pinned foundation (Packet 1):** `@earendil-works/pi-coding-agent@0.82.0` (engines
  `node >=22.19.0`), Node `22.23.1`. Sibling packages `@earendil-works/pi-ai`,
  `@earendil-works/pi-agent-core`, `@earendil-works/pi-tui`, and `typebox@1.1.38` arrive transitively
  via Pi. NewFang currently imports only the coding-agent package (types + SDK for the integration
  test); it is a devDependency at the pinned exact version.
- **Dev (pinned):** `typescript@7.0.2`, `@types/node@22.20.1`, `prettier@3.9.6`, plus Node's built-in
  test runner (no build step; flag-free type stripping on Node >= 22.18). Avoid heavyweight paradigm
  deps (e.g., **not** adopting Effect) unless a concrete need justifies it. TypeBox is not a direct
  dependency yet (state validation is hand-rolled); it is adopted when NewFang registers LLM tool
  schemas.
- **Rejected for MVP:** Firecrawl, auto-downloaded `fd`/`rg` binaries, a model-authored workflow
  engine (see Ben audit).

## Test strategy

- **Unit tests** for every tool's pure logic (ledger mutations, claim/gate evaluation, intake
  classification, reconciliation) using Node's test runner; jiti/TS run without a build step.
- **Extension integration tests** via the SDK (`createAgentSession` with in-memory session/settings)
  to exercise event wiring, tool registration, and blocking behavior without a live model where
  possible.
- **Golden ledger fixtures**: given an input plan/repo, assert the derived ledger/backlog.
- **Reconciliation tests**: repo-vs-session divergence resolves deterministically (repo wins, with
  attribution).
- Meet or exceed the reference setup's test discipline; a completion claim for any NewFang feature
  must cite passing tests.

## Upgrade strategy

- Pin Pi peer versions; treat Pi upgrades as explicit, tested events. On upgrade, re-run the audit's
  version-sensitive checks (events list, RPC commands, trust/approval surface) against the new
  `CHANGELOG.md`.
- Depend on the **stable** surfaces (extension API, session tree, RPC protocol) and avoid coupling to
  internal source paths. Isolate any provider-specific glue behind adapters.
- Keep NewFang's authoritative state in repo files so a Pi upgrade cannot invalidate project truth.

## Rejected alternatives

- **Standalone SDK app (Option 3) as the starting point** — highest cost, lowest self-hosting now;
  reserved as a future pivot.
- **RPC-controlled app (Option 4) for the Node MVP** — SDK is strictly preferable in-process per
  Pi's own guidance.
- **Package-first (Option 2) before the extensions exist** — premature distribution overhead.
- **Adopting Ben's model-authored workflow engine / Effect runtime / paid web tools** — conflicts
  with durability, simplicity, and safety posture.

## Assumptions

- Pi is installed project-locally (Packet 1) at `0.82.0`; it was not installed at Phase 0.
- The extension and SDK surfaces NewFang uses are **documented for and verified against the pinned
  version `0.82.0`**. No claim is made that these surfaces are stable across other versions; any
  version change re-verifies version-sensitive surfaces against that version's `CHANGELOG.md`.
- A single primary machine (macOS/Apple Silicon) is the initial target; remote execution is later.
- The user has, or will configure, at least one working model provider for Pi via `/login` (a manual
  step NewFang never performs on the user's behalf). Not required for Packet 1's non-model paths.

## Risks

- **State reconciliation complexity** (repo vs session) — mitigated by making repo authoritative and
  writing deterministic reconciliation tests.
- **UI overload** in the terminal — mitigated by a minimal home view first, modules added
  progressively.
- **Pi churn** during a fast-moving `0.8x` series — mitigated by pinning the exact version
  (`0.82.0`) + a thin adapter boundary (ADR-0007) + canonical repo state independent of Pi.
- **Delegation reliability** (subprocess subagents) — mitigated by starting with one bounded task and
  strict result contracts before any fan-out.
- **Scope creep into project-management ceremony** — mitigated by progressive rigor and MVP
  non-goals.

## Confidence ratings

| Claim | Confidence |
|-------|------------|
| Extensions-first is the right starting architecture | High |
| `.newfang/` canonical state model is correct (locked, ADR-0003) | High |
| Thin adapter + modular `src/` (locked, ADR-0007) | High |
| Roles are skills/prompts in the MVP, not runtime agents | High |
| Package (Option 2) is the correct second step | High |
| Hybrid (Option 5) is the likely end-state | Medium |
| Subprocess delegation is reliable enough for one MVP task | Medium (needs prototype) |

## Decision status

- **Locked now:** extensions-first start (ADR-0002); `.newfang/` canonical state model (ADR-0003);
  thin adapter + modular `src/` (ADR-0007); roles as skills/prompts in MVP (ADR-0005); no
  vendoring/reuse of reference code (ADR-0004); package as second step; SDK/RPC held in reserve;
  pinned foundation `pi@0.82.0` + Node `22.23.1`.
- **Requires a prototype before locking:** subprocess-delegation result contract and reliability; the
  full home-view composition beyond the minimal footer.
- **Deferred:** background terminals, sandbox technology, remote-execution protocol, model-routing
  table, theme, packaging specifics.
