# Packet 2.5 Steward Console — Verification Record

Operational polish (focus semantics, next-action rationale, lifecycle update tools) and the first
Pi-native Steward Console. Date: 2026-07-24.

**Read the three verification tiers below as separate claims.** Automated rendering and Pi
integration were verified here. Interactive TUI rendering was **not** observed by Claude and is
recorded as PENDING with a checklist. RPC output is never used as evidence for an interactive claim.

## Environment and exact versions

| Field                                         | Value                                    |
| --------------------------------------------- | ---------------------------------------- |
| mise                                          | `2026.7.13 macos-arm64`                  |
| Node (via mise)                               | `v22.23.1`                               |
| npm                                           | `10.9.8`                                 |
| Pi CLI (project-local)                        | `@earendil-works/pi-coding-agent@0.82.0` |
| TypeScript / @types/node / prettier / typebox | `7.0.2` / `22.20.1` / `3.9.6` / `1.1.38` |

No new dependencies were added in this packet.

## Baseline (before UI changes)

`mise exec -- npm test` on the starting `feat/project-operations` commit `cb55865`: **31 → 59/59
tests pass** (the Packet 2 gate held), schema-v2 dogfooded state loaded, branch diff inspected.

## Tier 1 — Automated rendering and navigation verification (VERIFIED)

Pure `render`/`layout`/`navigation`/`model` layers are tested without a terminal, using deterministic
fixtures (empty, normal dogfooded, blocked, many items, long text, uninitialized, migration-required,
malformed) at widths **60, 80, 100, 120, 160**.

Verified by tests:

- **No overflow**: every line fits the width for all fixtures × widths × views × detail/help states.
- **Responsive classes**: compact `<80`, standard `80–119`, wide `≥120`; two columns only when wide;
  in two-column mode panels are built at column width (no spurious truncation).
- **Required sections**: next action, "Why now" rationale, focus, Attention, Work, Project Truth.
- **Ordering**: focus group first; ready items sorted by priority.
- **Selection**: exactly one marker; moves with the selection index.
- **Truncation/wrapping**: long titles and rationale wrap or truncate with an ellipsis.
- **Detail views**: fields only — asserted **no raw JSON** and no internal timestamp dumping.
- **Status screens**: uninitialized → `/newfang init`; migration → `/newfang migrate --apply`;
  malformed → the error message.
- **Navigation**: view cycling (with wrap), selection clamping at both ends, detail open/close, Esc
  precedence (detail → close), help toggle and dismissal, `q` close, `r` reload, unknown keys
  ignored, raw-input → logical-key mapping.
- **Ambient widget**: two lines max, focus shown, empty counts omitted, fits 80 and 40 columns.

Two real rendering defects were found and fixed by these tests before commit: a 2-column-overflow in
the Focus line (prefix budget) and un-truncated detail titles (234 chars at width 60).

## Tier 2 — Pi integration verification (VERIFIED, non-interactive)

Against the pinned Pi `0.82.0` package and the real thin adapter:

- `/newfang home` registers and appears in argument completions.
- Canonical state is transformed into the console view model (identity, rationale, counts, runtime
  context); `model.proof` is empty — **no proof capability is implied**.
- Missing state produces an initialization view rather than a crash.
- The custom component is created through a `custom()` factory of the pinned shape, renders, accepts
  input, and **closing (`q`) resolves the command and restores the ambient widget**.
- Non-TUI mode falls back to `/newfang status` output instead of failing.
- `themeStyler` maps console tokens to Pi theme tokens (`border → borderMuted`) and degrades to plain
  text if the theme throws.

Additionally observed through Pi **RPC** mode (recorded as RPC evidence only, not a TUI claim):

```text
[ambient widget] ["NewFang · BUILD · GREEN · Focus NF-2",
                  "Next: Build planning-document intake and repository orientation (NF-2… · 3 risks"]
[notify:info] The Steward Console needs an interactive terminal; showing status instead.
```

## Tier 3 — Interactive TUI verification (PASS — human-attested)

Claude's shell is not a TTY (`process.stdin.isTTY === false`), so Pi's interactive TUI could not be
launched or observed by Claude. **Joshua ran the console in a real terminal on 2026-07-25 and
attested PASS.** That attestation is the sole basis for this tier; Claude makes no independent claim.
Pass/fail per item, terminal width, and Pi version were not separately recorded.

> **Stale expectations below.** This checklist was written against earlier dogfooded state. As of
> `20effff` the canonical state is 8 work items (1 in progress, 1 ready, 6 backlog, **0 completed**),
> 9 decisions, 3 assumptions, and 5 risks of which **4 are open** (RSK-1 is `mitigated`). The widget
> therefore reads `4 risks`, not the `3 risks` item 1 states. Verify shape and restraint, not these
> literals.

### Checklist for Joshua

```bash
mise exec -- npm run pi
```

Then verify, in order:

1. **Ambient widget** — a quiet 1–2 line widget shows `NewFang · BUILD · GREEN · Focus NF-2` and a
   `Next: …` line with `3 risks`. It should not shout or fill the footer.
2. **`/newfang home`** — the console opens with the header (project, phase/health, branch, pi/node),
   NEXT JUSTIFIED ACTION, "Why now:", and `Focus: NF-2`.
3. **Focus view** — Work counts and Attention are visible; wide terminals show them side by side.
4. **`Tab`** → **Work** view — groups render (Focus, In progress, Backlog) with priorities.
5. **`Tab`** → **Project Truth** — decisions, open assumptions, risks with stable IDs.
6. **`j` / `k`** — the `▸` selection marker moves predictably; it stops at the ends.
7. **`Enter`** — a detail view opens with labelled fields (no JSON); **`Esc`** returns.
8. **`?`** — key help appears; any key dismisses it.
9. **`r`** — reload; the view redraws from canonical state without flicker or error.
10. **Compact** — resize the terminal below 80 columns: one column, condensed counts, no broken
    borders, no line wrapping artifacts.
11. **`q`** — the console closes and control returns to the Pi prompt cleanly; the ambient widget is
    still correct.
12. **Theme** — colors follow the active Pi theme (try `/theme` with a light theme; nothing should be
    unreadable or hardcoded).

Record the result here (pass/fail per item) once run. Provider authentication is **not** required to
open extension UI.

## Dogfooded state (honesty check)

- `focusWorkItemId: "NF-2"`; `nextActionRationale` present and specific.
- **NF-1 remains `in_progress`, not completed.** Its description and acceptance criteria state that it
  awaits the future protected completion transition. **Zero** work items are `completed` — asserted by
  a test, since the completion gate does not exist.
- 7 work items, 6 accepted decisions, 4 risks, 2 assumptions. No absolute paths or machine-sensitive
  data (scanned).

## Final automated results

`mise exec -- npm run verify` (typecheck + prettier check + tests): **95/95 tests pass, 0 fail.**

## CI

`.github/workflows/ci.yml` is unchanged and still valid (Node 22.23.1, `npm ci --ignore-scripts`,
`npm run verify`, least privilege, concurrency cancel). The branch is **not pushed**, so **GitHub
Actions has not run** — no CI pass is claimed.

## Known limitations

- Console is **read-mostly**: no editing forms; mutations still go through tools/commands.
- Focus view's Attention panel is derived, not a notification system; no history or dismissal.
- Detail view shows a curated field set; some fields (timestamps, revision) are intentionally hidden.
- Selection state resets when switching views.
- Interactive rendering, resize behavior, and theme appearance are **unverified by Claude** (Tier 3).
- Single-writer assumption for `.newfang/` is unchanged.

## What this packet does NOT prove

- NewFang still does **not** understand planning documents, orient in a repository, verify
  implementation claims, produce runtime verification receipts, or control completion.
- The Proof/Delivery rail is **designed but not implemented**; `model.proof` is always empty and no
  proof data is rendered.
- No approvals, delegation, background processes, sandboxing, remote execution, model routing, or
  release automation.
