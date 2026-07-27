---
name: feature-or-bugfix-with-tests
description: Workflow command scaffold for feature-or-bugfix-with-tests in voila.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /feature-or-bugfix-with-tests

Use this workflow when working on **feature-or-bugfix-with-tests** in `voila`.

## Goal

Implements a new feature or bugfix in the codebase, accompanied by or followed by relevant test updates.

## Common Files

- `src/**/*.ts`
- `test/**/*.test.ts`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Modify or add implementation files in src/.
- Update or add corresponding test files in test/.
- Optionally update related documentation or UI files.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.