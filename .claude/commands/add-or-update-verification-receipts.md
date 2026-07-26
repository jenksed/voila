---
name: add-or-update-verification-receipts
description: Workflow command scaffold for add-or-update-verification-receipts in voila.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /add-or-update-verification-receipts

Use this workflow when working on **add-or-update-verification-receipts** in `voila`.

## Goal

Records verification runs and their outputs as receipts for acceptance or test coverage.

## Common Files

- `.voila/receipts/RCP-*/manifest.json`
- `.voila/receipts/RCP-*/stdout.txt`
- `.voila/receipts/RCP-*/stderr.txt`
- `.voila/events.jsonl`
- `.voila/project.json`
- `.voila/views/PROJECT_STATUS.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Create or update .voila/receipts/RCP-XX/manifest.json with metadata.
- Add or update .voila/receipts/RCP-XX/stdout.txt and stderr.txt with output.
- Update .voila/events.jsonl and .voila/project.json to reflect the verification event.
- Update .voila/views/PROJECT_STATUS.md to show verification status.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.