# ADR 0003: Canonical project state lives in `.newfang/`

- **Status**: Accepted (amended in Packet 1; supersedes the Packet 0 "Markdown + JSONL + session
  mirror" formulation)
- **Date**: 2026-07-24 (amended 2026-07-24)
- **Deciders**: Joshua Jenks (bootstrap, Claude-driven)

## Context

Product principle 5.5 requires that important project state not live only in model context or opaque
internal storage. The Phase 0 audit found Pi session entries are Pi's *private* append-only JSONL
tree, with `pi.appendEntry` and tool-result `details` for reconstruction — none a human-facing
artifact. The original Packet 0 wording ("Markdown + JSONL mirror + session-entry mirror") left the
authority and write ordering ambiguous. Packet 1 locks the structure and semantics.

## Decision

Canonical NewFang project state lives in a repository-visible `.newfang/` directory with distinct,
locked responsibilities:

```text
.newfang/
├── project.json              # authoritative current-state snapshot
├── events.jsonl              # append-only historical activity
├── receipts/                 # (later) immutable verification evidence
└── views/
    └── PROJECT_STATUS.md      # generated, human-readable projection (clearly marked generated)
```

Locked semantics:

- `project.json` is the **authoritative current-state snapshot**.
- `events.jsonl` is **append-only** historical activity; it is never treated as authoritative current
  state.
- `receipts/` will hold immutable verification evidence (not implemented until a later packet).
- `views/PROJECT_STATUS.md` is a **generated** human-readable projection of `project.json`, clearly
  marked as generated; editing it by hand has no effect on state.
- Pi session entries are a **non-authoritative cache and activity record**. Session state must never
  automatically overwrite canonical repository state.
- On resume, NewFang **loads and validates canonical state first**. A session/canonical mismatch
  produces a warning and an event — never a bidirectional merge.
- State mutations are **atomic**: a temp-file write followed by atomic replacement where supported;
  no partial canonical state after a failed write.
- A successful **canonical write must occur before** any corresponding session-cache or UI update.
- Schema is explicitly versioned; incompatible schema versions are not silently rewritten.

The exact file names may evolve through a documented migration, but these distinct responsibilities
are now locked.

## Consequences

- Project truth survives Pi upgrades, session loss, and context compaction, and is inspectable.
- NewFang must implement atomic writes, schema validation, monotonic revisions, and a generated view.
- Reconciliation is one-directional (canonical is authoritative); no merge engine is needed.
- Session-entry caching is optional and may be omitted where it adds complexity without user value.

## Evidence

- [../research/PI_CAPABILITY_AUDIT.md](../research/PI_CAPABILITY_AUDIT.md) (State persistence,
  Session entries).
- Product direction §5.5, §13.
- Packet 1 Part A1 (this amendment).

## Rename note

This ADR is preserved as written. The product was later renamed from NewFang to Voila
(Packet 4.5): the canonical state directory is now `.voila/`, the Pi adapter is
`.pi/extensions/voila.ts`, the command is `/voila`, and the package scope under consideration is
`@voila`. The decision recorded above is unchanged; only the names are. See
[../migrations/NEWFANG_TO_VOILA.md](../migrations/NEWFANG_TO_VOILA.md).
