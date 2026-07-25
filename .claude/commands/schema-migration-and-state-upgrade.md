---
name: schema-migration-and-state-upgrade
description: Workflow command scaffold for schema-migration-and-state-upgrade in newfang.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /schema-migration-and-state-upgrade

Use this workflow when working on **schema-migration-and-state-upgrade** in `newfang`.

## Goal

Upgrading the project schema version, migrating canonical state, and ensuring all related artifacts and tests are updated and validated.

## Common Files

- `src/domain/schema-v3.ts`
- `src/domain/migrate.ts`
- `.newfang/project.json`
- `.newfang/events.jsonl`
- `test/migrate-v4.test.ts`
- `test/fixtures/integrated-v3-project.json`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Update schema definitions and migration logic (e.g., src/domain/schema-vX.ts, src/domain/migrate.ts).
- Update or create migration tests and fixtures (e.g., test/migrate-vX.test.ts, test/fixtures/integrated-vX-project.json).
- Update canonical state files to reflect the new schema (e.g., .newfang/project.json, .newfang/events.jsonl).
- Ensure all related test suites pass and cover the migration (e.g., test/migrate-chain.test.ts, test/migrate.test.ts).
- Document the migration and its rationale (e.g., docs/verification/PACKET_X_PROOF_ENGINE.md).

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.