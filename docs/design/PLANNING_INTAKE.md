# Planning Intake — Design

How a request or planning document becomes accepted project truth, and exactly where interpretation
stops and enforcement begins.

## The boundary that matters

| Layer | Owner | Guarantee |
|-------|-------|-----------|
| **Source facts** | the file or text itself | Preserved byte-for-byte with a SHA-256; never rewritten |
| **Model interpretation** | the language model, under the Project Steward skill | Structured, provenance-carrying, and explicitly fallible |
| **User-accepted truth** | Joshua, at the review step | Nothing enters canonical state without explicit confirmation |
| **NewFang-enforced state** | NewFang | Schemas, lifecycle transitions, atomic persistence, idempotency, duplicate suppression |

NewFang makes **no claim** that document interpretation is deterministic. It guarantees the parts that
can be guaranteed: what the source said, where each finding came from, what would change, that nothing
changes before you accept, and that applying twice does not duplicate.

## Artifact layout

```text
.newfang/
├── intakes/
│   └── INT-1/
│       ├── manifest.json      # title, source type/ref, sha256, line count, created
│       ├── source.md          # the preserved source — written once, never rewritten
│       ├── draft.json         # the current structured interpretation (revision N)
│       └── UNDERSTANDING.md   # GENERATED review artifact
└── briefs/
    └── PROJECT_BRIEF.md       # GENERATED, non-authoritative context projection
```

Canonical `project.json` holds only compact metadata (`IntakeRecord`): id, title, source type/ref,
sha256, status, draft revision, timestamps. **No document text, classification output, or command
output is stored in canonical state.**

## Source preservation

- **File intake** accepts only repository-relative paths. Absolute paths, `~`, `..` traversal, and
  symlinks resolving outside the repository are rejected (`realpath` is compared against the
  repository root). NewFang **reads the bytes from disk** — the model never reproduces the source.
- **Conversation / pasted text** preserves the exact supplied string and records the source type
  honestly; `sourceRef` is `text:…`, so nothing claims byte-identity with a file.
- `source.md` is written once. A revised interpretation produces a **new `draftRevision`**, never an
  edit to the source.

## Classification model

Findings carry a draft-local ID, a category, a statement, an origin, provenance, and optional
relations/confidence/note. Categories: `objective`, `locked_decision`, `proposed_decision`,
`constraint`, `requirement`, `acceptance_criterion`, `open_question`, `assumption`, `risk`,
`non_goal`, `evidence`, `example`.

**Provenance is enforced.** `origin: "source"` requires at least one `sourceRef` — a line range for
file intake, or a marker/excerpt for text intake, validated against the source's real line count.
Anything the model added is `origin: "model_inference"` and is rendered in its own section of the
Understanding Check. A document is never treated as authoritative in every sentence: the Steward
distinguishes locked decisions from proposals and examples, and preserves the source's terminology
rather than "correcting" it.

## Conflicts

A conflict names the findings involved, explains the problem, carries a severity
(`blocking` / `warning` / `info`), and states whether user resolution is required. `blocking` implies
`requiresUserResolution`. NewFang **refuses to apply** a draft with any blocking conflict — it does not
resolve material conflicts itself.

## Lifecycle

```text
source_preserved → review_required → accepted
                                   ↘ rejected
```

1. **Preserve** (`newfang_create_intake`, `/newfang intake <path>`) — bytes + hash + metadata.
   Status `source_preserved`. Nothing is interpreted.
2. **Stage** (`newfang_stage_intake_draft`) — validate the draft, verify source references and
   referenced existing IDs, enforce unique finding IDs, store `draft.json`, increment
   `draftRevision`, regenerate `UNDERSTANDING.md`, set `review_required`. **No project truth changes.**
3. **Review** (`/newfang intake review`, or `u` in the Steward Console) — the user sees what the source
   states, what the model inferred, open questions, conflicts, and the exact canonical changes
   proposed. Outcomes: accept, reject, or ask for a revision (which stages a new revision).
4. **Apply** (`/newfang intake apply confirm`, `newfang_apply_intake`) — see below.
5. **Reject** (`/newfang intake reject`) — source and drafts are retained for the record.

## Apply semantics (exact)

Requirements: status `review_required`, the **exact reviewed draft revision**, no blocking conflicts,
and an explicit confirmation flag that the human workflow sets. A tool call alone is not confirmation.

On success:

- `locked_decision` → **accepted** decision
- `proposed_decision` → **proposed** decision
- `assumption` → **open** assumption
- `risk` → **open** risk
- explicit `proposedWorkItems` → work items — **requirements do not auto-convert**
- optional next action + rationale from the reviewed draft
- one `intake_applied` event; the project brief and status view are regenerated
- intake becomes `accepted` with `acceptedAt`

**Duplicate handling** is conservative: exact normalized matching (case/whitespace/trailing
punctuation) against existing decisions, risks, assumptions, and work-item titles. Matches are
**skipped and reported**, never merged. Likely-but-inexact duplicates are surfaced as
`possibleDuplicates` during review and never merged automatically.

**Idempotency**: re-applying the same accepted revision creates nothing. Applying a *different*
revision after acceptance is refused.

The preview shown before applying is computed by the **same function** that performs the apply, so the
confirmation cannot drift from the effect.

## Project brief

`.newfang/briefs/PROJECT_BRIEF.md` is generated from canonical state: phase/health, focus, next action
and rationale, key accepted decisions, open assumptions, open risks, work in flight, and source intake
references (id, type, ref, short hash). It is **non-authoritative** and deliberately compact enough to
inject into model context. It never copies source documents.

## Current limitations

- Review feedback is captured as a new draft revision; the request itself is not yet stored durably
  (tracked as work item NF-8).
- Duplicate detection is exact-match only, by design.
- There is no protected completion transition, no claims, and no runtime verification receipts —
  applying an intake cannot mark work complete.
