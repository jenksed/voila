# Repository Orientation — Design

Orientation is a **bounded, provenance-backed snapshot** of a repository at a moment in time — not a
permanent claim, and not an exhaustive scan.

## Why bounded

Exhaustive scanning burns context and produces confident-sounding output that is mostly noise. The
Steward stops as soon as it can answer five questions:

1. What is this repository for?
2. What operating instructions govern work here?
3. What is currently in flight?
4. How is it built, tested, and verified?
5. What is the next justified action?

The ordered strategy (and a read budget) lives in the skill:
[`.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md`](../../.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md).

Orientation uses **repository-local information only**. No web access unless the user explicitly asks
for research.

## Artifact

```text
.newfang/orientations/ORI-1/
├── orientation.json    # the validated snapshot
└── ORIENTATION.md      # GENERATED human-readable view
```

Canonical `project.json` holds only an `OrientationRecord`: id, artifact ref, repository head, status
(`current` / `stale`), timestamps.

The snapshot records: purpose; branch, head, dirty flag and summary; instruction files (path +
**sha256**, used for staleness); key documents; likely implementation areas; **command findings** (see
below); relevant current work; risks; unknowns; observed timestamp; and provenance (what was actually
read).

## Command evidence — honest by construction

NewFang does **not** run or formally verify commands, so nothing here may be called "verified". Each
command carries an explicit basis:

| Basis | Meaning | `observedResult` allowed? |
|-------|---------|---------------------------|
| `declared_in_documentation` | A repository document or manifest presents the command. An `evidenceNote` naming that document is **required**. | No |
| `observed_in_session` | The operator or agent actually executed it during this orientation session. | Yes — `passed` or `failed` |
| `candidate` | It looks likely but has not been executed. | No |

Validation rejects `observedResult` on any basis other than `observed_in_session`: a command that was
not executed has no result. The generated view labels these as "declared in documentation", "observed
in this session", or "candidate (not executed)" under a heading that states the limit explicitly.

**An observation is not a verification receipt.** Formal verification begins only when Phase 4 claims
and receipts exist. Injected model context reports orientation status only — never command text or
command confidence.

## Safety rules (enforced by validation)

- Paths must be **repository-relative** — absolute paths, `~`, and drive-letter paths are rejected.
- Content that looks like a secret (`password`, `secret`, `api_key`, `token`, private-key headers) is
  rejected in purpose, risks, unknowns, commands, and provenance.
- No environment-variable values and no full command logs.
- Instruction-file digests must be real sha-256 hex.

## Staleness

An orientation becomes stale when:

- the repository **HEAD** has moved since it was recorded,
- a recorded **instruction file's content hash** has changed, or
- the user **explicitly requests a refresh**.

Deliberately **not** a staleness trigger: a dirty worktree. Editing files is normal, and a dirty flag
must not rewrite canonical state or invalidate orientation.

Staleness is evaluated **read-only** on demand (`/newfang orient`, `/newfang doctor`, the Steward
Console, context injection). NewFang never silently re-runs model orientation on Pi startup; it reports
staleness and lets the Steward re-orient. Recording a newer orientation marks the previous one `stale`.

Git failures degrade gracefully: with no git available, HEAD is simply absent and HEAD-based staleness
never fires.

## Commands and tools

- `/newfang orient` — report current orientation, staleness reasons, purpose, and command counts. It
  does **not** pretend that filesystem enumeration equals orientation; it recommends the Steward
  workflow.
- `newfang_record_orientation` — validate and store a snapshot, making it current.

## Current limitations

- Orientation content quality depends on the model; NewFang validates structure and safety, not
  accuracy.
- Command findings are trusted as recorded — NewFang does not execute them to confirm, which is
  exactly why nothing is labeled "verified".
- Staleness does not inspect non-instruction documents.
