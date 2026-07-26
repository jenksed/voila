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
.voila/orientations/ORI-1/
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

Voila does **not** run or formally verify commands, so nothing here may be called "verified". Each
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

## Freshness (policy 2, R1)

Freshness follows **the inputs that materially informed the orientation**, not commit identity.

An orientation becomes stale when:

- an **inspected instruction file's content hash** has changed,
- an **inspected instruction file no longer exists** (it described something gone),
- a **policy-declared instruction file exists that it never inspected** (`POLICY_INSTRUCTION_PATHS`:
  `AGENTS.md`, `CLAUDE.md`) — incomplete, not merely old,
- the **bounded canonical inputs** it leaned on have changed, or
- the user **explicitly requests a refresh**.

Deliberately **not** staleness triggers: git **HEAD**, the **branch**, **staging state**, the **clone
location**, a **dirty worktree**, or another commit identity over identical content. HEAD is recorded
as provenance and reported, never compared.

### Why policy 1 was replaced

Policy 1 staled an orientation whenever HEAD moved. Every commit — including one touching nothing the
orientation had read — turned into maintenance the developer had to clear, which is precisely the
*No Managing the Manager* failure the [doctrine](../product/PROJECT_STEWARD_DOCTRINE.md) forbids and
the realignment plan names ("Replace HEAD-based orientation freshness with relevant-content
freshness").

### Bounded canonical inputs

`orientationStateFingerprint(state)` digests, in sorted order: the focused item, every work item's ID
and lifecycle status, and the set of accepted decision IDs. Those are what an orientation's "relevant
current work" and constraint summaries are built from.

Excluded on purpose, so ordinary Steward bookkeeping does not stale orientation: next action and its
rationale, revision counters, claims, receipts, intakes, and risk status. It is a digest of identities
and statuses — never of repository contents, and never of the whole repository.

### Recorded provenance, not self-reported

`recordOrientation` stamps `freshnessPolicyVersion` and `stateFingerprint` onto the artifact **after**
validation, from observed facts. `validateOrientationArtifact` builds its result from a fixed
whitelist, so a model cannot supply either field — an orientation cannot declare itself fresh.

### The one-time transition

Artifacts recorded before R1 (ORI-1..ORI-5 in this repository) carry **no** `freshnessPolicyVersion`.
That absence *is* the transition: they stay readable, are judged by the content rules above, and are
**not** re-staled by the policy change — staling every historical orientation to celebrate a freshness
improvement would have created exactly the friction R1 removes. A `policyNote` records that they
predate the policy. An artifact that *declares* a different policy version is stale, explicitly and
with a reason. No artifact is rewritten.

### Reporting

Staleness is evaluated **read-only** on demand (`/voila orient`, `/voila doctor`, the Steward Console,
the focus capsule). Voila never silently re-runs model orientation on Pi startup. Content drift is
reported as `[INFO]` by Doctor and as "your call, not a blocker" in the capsule — re-orienting is the
Steward's judgement, not a chore assigned to the developer. A **missing or invalid** artifact remains a
`FAIL`: that is corruption, not drift. Recording a newer orientation marks the previous one `stale`.

Git failures degrade gracefully: with no git available, HEAD is simply absent, and since HEAD is not a
freshness input, nothing changes.

## Commands and tools

- `/voila orient` — report current orientation, staleness reasons, purpose, and command counts. It
  does **not** pretend that filesystem enumeration equals orientation; it recommends the Steward
  workflow.
- `voila_record_orientation` — validate and store a snapshot, making it current.

## Current limitations

- Orientation content quality depends on the model; Voila validates structure and safety, not
  accuracy.
- Command findings are trusted as recorded — Voila does not execute them to confirm, which is
  exactly why nothing is labeled "verified".
- Staleness does not inspect non-instruction documents.
