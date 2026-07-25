# Repository Orientation Playbook

An ordered, bounded inspection strategy. **Stop as soon as you can answer the five questions** below —
exhaustive scanning is a failure mode, not thoroughness.

## The five questions

1. What is this repository for?
2. What operating instructions govern work here?
3. What is currently in flight?
4. How is it built, tested, and verified?
5. What is the next justified action?

## Ordered steps

Read in this order and stop early when the questions are answered.

1. **Instructions** — `AGENTS.md`, then `CLAUDE.md` (or equivalents). These override your defaults.
   Record a sha256 for each; NewFang uses it for staleness detection.
2. **README** — purpose and status.
3. **Canonical NewFang state** — `newfang_get_project_context`, and
   `.newfang/briefs/PROJECT_BRIEF.md` if present. This is usually the fastest route to "what is in
   flight" and "what is next".
4. **Package manifest** — `package.json` (or `pyproject.toml`, `Cargo.toml`, `go.mod`). Extract the
   real script names for build/test/lint/verify. Record these as `commands` with
   `basis: "declared_in_documentation"` and an `evidenceNote` naming the manifest. Anything you infer
   without seeing it declared is `basis: "candidate"`. If you actually ran a command this session, use
   `basis: "observed_in_session"` and record `observedResult`.
5. **Runtime/toolchain pins** — `mise.toml`, `.nvmrc`, `tsconfig.json`, CI workflow. Note the pinned
   versions and the CI gate.
6. **Product/architecture docs** — only the index-level ones (e.g. `docs/` product direction,
   architecture recommendation, ADR list). Do not read every ADR; note them as key documents.
7. **Entrypoints and layout** — list top-level source directories to name likely implementation
   areas. Do not read every file.
8. **Git state** — branch, HEAD, and whether the worktree is dirty. A dirty worktree is context, not
   a problem, and does not by itself invalidate orientation.
9. **Active plans** — planning documents referenced by the docs or the current work item.

## Budget

- Aim for **under ~12 file reads**.
- Prefer listing a directory over reading its files.
- Prefer the brief and canonical context over re-deriving state from documents.
- If a question remains unanswered after the steps above, record it in `unknowns` instead of
  continuing to scan.

## What to record

Use `newfang_record_orientation`:

- `purpose` — one or two sentences.
- `instructionFiles` — path + sha256 (+ short note).
- `keyDocuments`, `implementationAreas` — repository-relative paths.
- `commands` — `{command, basis, observedResult?, evidenceNote?}`. `observedResult` is only valid with
  `basis: "observed_in_session"`. Never describe a command as "verified".
- `relevantWork` — what current work items this touches.
- `risks`, `unknowns` — honest gaps.
- `provenance` — the files you actually read.

## Never

- No web access unless the user explicitly asks for research.
- No secrets, environment-variable values, absolute private paths, or full command logs.
- No claims that a command works unless you saw it declared (cite it) or ran it (record the result).
- No use of the word "verified" for commands; NewFang has no verification receipts yet.
