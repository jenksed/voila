---
name: recording-and-verifying-proof-artifacts
description: Workflow command scaffold for recording-and-verifying-proof-artifacts in newfang.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /recording-and-verifying-proof-artifacts

Use this workflow when working on **recording-and-verifying-proof-artifacts** in `newfang`.

## Goal

Adding new claims and verification receipts, updating canonical state, and documenting the evidence for project work items.

## Common Files

- `.newfang/receipts/RCP-*/manifest.json`
- `.newfang/receipts/RCP-*/stdout.txt`
- `.newfang/receipts/RCP-*/stderr.txt`
- `.newfang/project.json`
- `.newfang/events.jsonl`
- `.newfang/views/PROJECT_STATUS.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Generate new claim and/or receipt files under .newfang/receipts/ (e.g., manifest.json, stdout.txt, stderr.txt).
- Update .newfang/project.json and .newfang/events.jsonl to register the new claims/receipts and log the event.
- Update related documentation and status views (e.g., .newfang/views/PROJECT_STATUS.md, docs/verification/PACKET_X_PROOF_ENGINE.md).
- Dogfood or demonstrate the new artifacts by running verification commands and ensuring state transitions are correct.
- Ensure all changes are reflected in the canonical state and are byte-identical where required.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.