# Phase 3 Intake Brief — Planning Intake, Repository Orientation, and Steward Context

This is the source document for Packet 3, written to be ingested by NewFang's own intake flow.

## Objective

Deliver NewFang's first daily-use workflow: a source request or planning document becomes repository
orientation, a structured intake draft, an understanding check, accepted project truth, a next
justified action, and durable resume.

## Scope

- Schema version 3 with an explicit `2 → 3` migration (inspect, `--apply`, backup, atomic replace).
- Exact source preservation with SHA-256 provenance and repository-relative path safety.
- A structured intake draft: classified findings with source references, conflicts, and proposed work.
- An understanding check generated from the draft, reviewed by the user before anything is applied.
- Idempotent intake application that does not duplicate existing project truth.
- A generated, concise project brief.
- Bounded repository orientation with staleness detection.
- A real Project Steward Pi skill and compact automatic context injection.
- The Understanding Check integrated into the Steward Console.

## Non-goals

Claims, runtime verification receipts, protected completion, delegation, approval bundles, background
processes, sandboxing, remote execution, model-routing policy, cost tracking, and release automation
are all out of scope for this phase.

## Constraints

- The language model performs interpretation; NewFang owns preservation, schemas, lifecycle, review,
  application, persistence, provenance, and resumability.
- Model-generated interpretations must never be applied to canonical project truth silently.
- Locked decisions, proposals, examples, assumptions, and open questions must remain distinguishable.
- Source terminology is preserved rather than silently corrected.
- A planning document must not be treated as authoritative in every sentence.
- Orientation uses repository-local information only unless the user explicitly requests research.
- Orientation artifacts must not contain secrets, environment values, or absolute private paths.

## Acceptance criteria

- An explicit `2 → 3` migration succeeds with a backup and leaves canonical bytes intact on failure.
- Intake sources are preserved byte-for-byte with a verified SHA-256.
- Absolute paths, `..` traversal, and symlink escapes are rejected.
- Model inferences are distinguishable from source-derived findings.
- Blocking conflicts prevent application.
- Applying the same reviewed revision twice creates nothing new.
- Exact duplicates of existing decisions, risks, and work items are not recreated.
- Repository orientation records provenance and detects staleness on HEAD or instruction-file change.
- Automatic context injection is compact and deterministic.
- Restart restores intake, brief, orientation, focus, and next action.

## Stopping condition

Stop when the intake-to-next-action workflow passes. Do not begin claims, verification receipts,
protected completion, delegation, or approval bundles.
