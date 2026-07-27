---
name: update-project-state-and-status
description: Workflow command scaffold for update-project-state-and-status in voila.
allowed_tools: ["Bash", "Read", "Write", "Grep", "Glob"]
---

# /update-project-state-and-status

Use this workflow when working on **update-project-state-and-status** in `voila`.

## Goal

Updates the project state, events, and status views to reflect progress, next actions, or acceptance of work items.

## Common Files

- `.voila/project.json`
- `.voila/events.jsonl`
- `.voila/views/PROJECT_STATUS.md`
- `.voila/briefs/PROJECT_BRIEF.md`

## Suggested Sequence

1. Understand the current state and failure mode before editing.
2. Make the smallest coherent change that satisfies the workflow goal.
3. Run the most relevant verification for touched files.
4. Summarize what changed and what still needs review.

## Typical Commit Signals

- Edit .voila/project.json to update the project state or next action.
- Append to .voila/events.jsonl to record the event.
- Update .voila/views/PROJECT_STATUS.md with the new status.
- Optionally update .voila/briefs/PROJECT_BRIEF.md if the project brief changes.

## Notes

- Treat this as a scaffold, not a hard-coded script.
- Update the command if the workflow evolves materially.