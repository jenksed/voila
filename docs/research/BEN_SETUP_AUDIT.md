# Ben Davis Setup Audit (`davis7dotsh/my-pi-setup`)

## Summary

`davis7dotsh/my-pi-setup` is a mature, test-heavy personal Pi setup that demonstrates the ceiling of
what Pi extensions can do: a customizable status/dashboard UI, background terminals, multi-backend
subagents (pi / Claude Code / Codex), a model-authored workflow engine with its own sandbox,
structured user questions, first-class `fd`/`rg` tools, conversation summaries, and Firecrawl web
tools. It is an excellent **conceptual** reference for NewFang's interface, delegation, and
background-execution direction. It is **not** a code source: it ships **no license file** (all rights
reserved) and its README explicitly discourages copying. NewFang reimplements ideas independently.

## Provenance

| Field | Value |
|-------|-------|
| Access date | 2026-07-24 |
| Repository | `github.com/davis7dotsh/my-pi-setup` |
| Commit inspected | `21f40f41fb98e088281a6fcd512388d82bddf911` |
| Last commit date | 2026-07-23 (very current) |
| Targets Pi | `@earendil-works/pi-*@^0.82.0` |
| License | **None present** (no `LICENSE`/`license` file) → all rights reserved |
| Author guidance | README: "Changes a ton, don't recommend hard copying it, just a taste of what's possible" |
| Install target | Cloned/copied into `~/.pi/agent`, `npm install` |
| Notable deps | `firecrawl@^4.30`, `acorn@^8.17` (JS parsing for workflows), `typebox`; TypeScript `^7`, `@types/node ^26` |

### License consequence (decisive)

No license file means **no rights are granted** to reuse, modify, or redistribute the code. Combined
with the author's explicit "don't hard copy" guidance, this makes direct code reuse inappropriate
regardless of quality. Every element below is therefore capped at **Reimplement independently** at
best; nothing is "Reuse as-is." This is recorded as
[docs/decisions/0004-no-vendoring-of-reference-repositories.md](../decisions/0004-no-vendoring-of-reference-repositories.md).

## Repository structure

```text
my-pi-setup/
  AGENTS.md, README.md, SETUP.md
  package.json, models.json, tsconfig.json, .env.example
  themes/github-dark-default.json
  skills/{background-terminals,subagents}/SKILL.md
  extensions/
    ask-user/            # multiple-choice question tool
    background-terminals/ # persistent background shells + management UI (heavily tested)
    copy-all/            # copy conversation/output
    file-search/         # fd + rg as first-class model tools (auto-downloads binaries)
    firecrawl-search/    # web search/scrape/crawl (paid API)
    git-info/            # branch/worktree/changed-files status bar module
    model-info/          # model + reasoning status module
    shared/              # activity-status, child-session, context-utilization, dashboard-state,
                         #   tool-call-timeout  (shared library used across extensions)
    subagents/           # multi-backend subagents (pi/claude/codex) via Effect v4; /subagents takeover
    summaries/           # conversation summaries
    ui-customization/    # bottom-bar / UI composition
    workflows/           # model-authored multi-agent orchestration engine + sandbox
```

Observations:

- **Test discipline is high.** Most extensions ship `*.test.ts` / `*.spec.ts` (background-terminals,
  subagents, git-info, summaries, workflows). This is a good signal of design maturity and a model
  for NewFang's own testing bar.
- **A `shared/` library** provides `dashboard-state`, `context-utilization`, `activity-status`,
  `child-session`, and `tool-call-timeout` — the connective tissue behind the UI and subagents.
- **Heavy functional stack.** `subagents/` uses **Effect v4** generators end-to-end and a single
  `ManagedRuntime`; `workflows/` uses `acorn` to parse model-authored scripts and runs them in a
  sandbox (`sandbox.ts` + `sandbox-child.cjs`). These are powerful but opinionated and add
  conceptual weight.

## Element-by-element classification

Classification vocabulary: **Adopt conceptually** (borrow the idea/interaction), **Adapt** (borrow
and rework substantially for NewFang), **Reuse if license and quality permit** (blocked here by
licensing), **Reimplement independently**, **Defer**, **Reject**.

| Element | Classification | Rationale |
|---------|----------------|-----------|
| `git-info` (branch/worktree/changed-files module) | **Adopt conceptually → Reimplement** | Directly serves NewFang's "Git state / changed files" home-view modules. Reimplement with NewFang's project framing. |
| `model-info` (model + reasoning module) | **Adopt conceptually → Reimplement** | Serves the model-routing / cost visibility module. Small, clear. |
| `ui-customization` (bottom bar composition) | **Adapt** | Useful as a pattern for composing the NewFang home view from modules; NewFang's composition needs are broader (phase, health, approvals, next action). |
| `shared/dashboard-state` | **Adopt conceptually** | The idea of a single dashboard-state object feeding multiple UI modules maps onto NewFang's home view. Reimplement around the project ledger. |
| `shared/context-utilization` | **Adopt conceptually** | Context-usage visibility is a NewFang interface module; Pi exposes `getContextUsage`/`get_session_stats` natively, so this is thin to rebuild. |
| `ask-user` (multiple-choice questions) | **Adapt / possibly Reject** | NewFang's Clarify phase wants concise multiple-choice with defaults, but Pi has a **native `ask_question`** tool and dialogs. Prefer native; only reimplement if native shape is insufficient. |
| `background-terminals` | **Reimplement independently (Defer)** | The reference implementation of the background-process manager Pi lacks natively. High value for execution profile 18.2, but **not** MVP-critical. Reimplement later. |
| `subagents` (pi/claude/codex, Effect, takeover) | **Adopt conceptually → Reimplement, narrower** | The multi-backend + spawn/wait/cancel/check/list + follow-up-on-settle + takeover model is exactly NewFang's delegation direction. But Effect v4 and three backends are heavier than the MVP needs. Reimplement narrowly (start with Pi's own subprocess/JSON pattern); avoid adopting Effect unless justified. |
| `workflows` (model-authored JS orchestration + sandbox) | **Defer / partial Reject** | Impressive, but model-authored ephemeral scripts (no resume, artifacts under `~/.pi/agent/workflows`) run counter to NewFang's **durable, human-readable** project truth. NewFang wants structured, inspectable plans and a ledger, not throwaway model-written orchestration. Revisit only after durable state exists. |
| `summaries` | **Adapt** | Overlaps Pi-native compaction/branch summaries; NewFang wants ledger-aware summaries. Reimplement thin on top of native compaction. |
| `file-search` (fd/rg tools, auto-download binaries) | **Reject for MVP / Defer** | Pi has native `grep`/`find`. Auto-downloading binaries adds supply-chain surface. Nice-to-have, not aligned with MVP or safety posture. |
| `firecrawl-search` | **Reject for MVP** | External paid API dependency; not needed for the intake/verify/deliver slice. The Librarian role can use native tools + user-provided sources first. |
| `copy-all` | **Defer** | Convenience; irrelevant to the ownership/evidence core. |
| `themes/github-dark-default.json` | **Adopt conceptually → build own** | NewFang ships its own theme; do not copy the JSON (licensing). A theme is trivial to author. |
| `AGENTS.md` / `SETUP.md` conventions | **Adopt conceptually** | The "if you are an agent, do X" setup guidance and one-question-at-a-time interaction norm are good patterns to echo (already reflected in NewFang's Clarify guidance). |
| High test coverage convention | **Adopt** | Match or exceed it. Evidence-before-completion demands it. |

## Interface architecture takeaways (Adopt conceptually)

- **Compose the status area from independent modules** fed by a shared state object
  (`dashboard-state`), each module owning one concern (git, model, context). NewFang extends this to
  project identity, phase, health, blockers, approvals, and next action.
- **Active-agent / takeover views** (from `subagents`) are the right interaction for "what is running
  and can I steer it," matching product direction 19–20.
- **Background-terminal views** (list, inspect stdout/stderr, ownership, stop) match execution
  profile 18.2 requirements almost exactly — a good spec to reimplement against.

## Risks, coupling, and fragility observed

- **All-rights-reserved licensing** is the dominant constraint: no code path is reusable. (Decisive.)
- **Effect v4 coupling** in `subagents` is a deep architectural commitment. Adopting it would import
  a large paradigm into NewFang; avoid unless a concrete need justifies it.
- **Model-authored `workflows`** trade durability for flexibility (no resume; ephemeral artifacts).
  This conflicts with NewFang's durable-state principle and should not be a template for NewFang's
  project execution model.
- **Auto-downloading release binaries** (`file-search`) is a supply-chain and trust concern that
  clashes with NewFang's "do not install global software / minimize external surface" posture.
- **External paid API** (`firecrawl`) creates a hard dependency and secret-management burden not
  warranted for the MVP.
- **Bleeding-edge toolchain** (TypeScript `^7`, `@types/node ^26`, Pi `^0.82`) signals the setup
  tracks head closely; useful as a currency signal, but NewFang should pin deliberately.
- **Provider-specific behavior** (Codex `app-server` JSON-RPC, Claude Agent SDK) in `subagents`
  demonstrates real multi-harness routing but also shows how much provider-specific glue that
  requires — a reason to keep NewFang's initial harness support intentionally narrow.
- **Undocumented internal contracts.** Much of the sophistication lives in `shared/` and test files
  rather than prose docs; behavior must be inferred from code and tests. NewFang should document its
  own contracts explicitly.

## Net guidance for NewFang

Borrow the **interaction and orchestration ideas** — modular dashboard, active-agent/takeover views,
background-terminal management, structured subagent delegation with settle-time follow-ups — and
reimplement them independently, narrower, and around NewFang's durable ledger. Do **not** adopt the
model-authored ephemeral workflow engine, the Effect-heavy subagent runtime, auto-downloaded
binaries, or the paid web-search dependency for the MVP. Treat the high test-coverage convention as a
standard to meet.
