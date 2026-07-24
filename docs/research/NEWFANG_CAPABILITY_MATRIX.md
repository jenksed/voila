# NewFang Capability Matrix

## Summary

This matrix maps each NewFang requirement to the usable Pi primitive (if any), an official example,
Ben's reference, external dependencies, the remaining gap, and an MVP decision. It names the
specific primitive rather than asserting vague "support." Sources: Pi `0.80.3` docs/examples
(access 2026-07-24) and `davis7dotsh/my-pi-setup@21f40f4`. Detail and citations live in
[PI_CAPABILITY_AUDIT.md](PI_CAPABILITY_AUDIT.md) and [BEN_SETUP_AUDIT.md](BEN_SETUP_AUDIT.md).

## Legend

- **Native Pi support**: the concrete primitive, or "None".
- **Confidence**: High (verified in docs/source), Medium (inferred), Low (unverified).
- **MVP decision**: In slice / Build (MVP) / Defer / Reject / Use native.

## Matrix

| # | NewFang requirement | Native Pi support | Official example | Ben reference | Other dependency | Gap | MVP decision | Confidence | Evidence source |
|---|---------------------|-------------------|------------------|---------------|------------------|-----|--------------|------------|-----------------|
| 1 | Ship as project-local extensions | `.pi/extensions/*.ts`, jiti load, `/reload` | with-deps/ | whole repo | none | none | In slice | High | `docs/extensions.md` |
| 2 | Register commands (`/newfang ...`) | `pi.registerCommand` + arg completion | commands.ts | many | none | none | In slice | High | `docs/extensions.md` |
| 3 | LLM-callable tools (ledger, backlog, claims) | `pi.registerTool` + TypeBox | todo.ts, hello.ts | subagents, workflows | typebox (bundled) | none | In slice | High | `docs/extensions.md` |
| 4 | Intercept/gate tool calls (approvals) | `on("tool_call")` block/mutate | permission-gate.ts, protected-paths.ts | (in subagents policy) | none | grouping, phase-scope, history, denial reasons | Build (self-hosting project) | High | `docs/extensions.md` |
| 5 | Capture evidence from tool results | `on("tool_result")` modify + `details` | truncated-tool.ts | summaries | none | evidence model/receipts | Build (MVP) | High | `docs/extensions.md` |
| 6 | Durable, human-readable project truth | atomic file writes; session entries = non-auth cache | todo.ts | dashboard-state | `.newfang/` (NewFang) | canonical `.newfang/` store + one-directional load | Build (Packet 1) — `.newfang/` authoritative (ADR-0003) | High | ADR-0003, `docs/extensions.md` |
| 7 | Resume across sessions | `session_start` + `SessionManager.getEntries/getBranch`, `continueRecent` | todo.ts | child-session | none | reconcile ledger vs repo | Build (MVP) | High | `docs/sdk.md`, `docs/extensions.md` |
| 8 | Home view (identity/phase/health/next action) | `setWidget`, `setFooter`, `ctx.ui.custom()` | status-line.ts, custom-footer.ts, plan-mode/ | git-info, model-info, ui-customization, dashboard-state | none | project-framed composition | Build (MVP, minimal) | High | `docs/extensions.md`, `docs/tui.md` |
| 9 | Concise multiple-choice questions | native `ask_question` tool + `ui.select/confirm/input` | question.ts, questionnaire.ts | ask-user | none | none | Use native | High | `docs/sdk.md`, `docs/extensions.md` |
| 10 | Planning-document intake (preserve + classify) | tools + `read` + `before_agent_start` context injection | claude-rules.ts, prompt-customizer.ts | (none direct) | none | classification logic + brief artifact | Build (MVP) | High | `docs/extensions.md` |
| 11 | Repository orientation | built-in `read/grep/find/ls/bash` + `pi.exec` | (built-ins) | git-info | none | orientation playbook | Build (MVP, as skill) | High | `docs/sdk.md` Tools |
| 12 | Backlog (items/tasks/defects/relations) | stateful tool writing canonical `.newfang/` state | todo.ts | (workflows meta) | none | entity model + relations | Build (MVP, minimal) | High | ADR-0003, `docs/extensions.md` |
| 13 | Claims tracking (statement/evidence/confidence) | custom tool + custom entries | todo.ts pattern | (none direct) | none | claim schema + linkage | Build (MVP) | High | `docs/extensions.md` |
| 14 | Completion gate (reject `mark-complete` transition) | NewFang state transition guarded by receipt check | permission-gate.ts (pattern) | (none direct) | none | reject `newfang_complete_work_item` unless receipt passes | Build (MVP, one gate) | High | ADR-0003, `docs/extensions.md` |
| 15 | Verification receipts (reproducible) | `pi.exec` + `details` + file writes | truncated-tool.ts | (none direct) | none | receipt format/storage | Build (MVP, one receipt) | High | `docs/extensions.md` |
| 16 | Delegate one bounded specialist task | subprocess subagent via JSON mode; SDK sessions | subagent/ | subagents | none | role definitions; narrow scheduler | Build (MVP: one delegation) / Defer multi-agent | High | `examples/extensions/subagent/`, `docs/json.md` |
| 17 | Permanent roles (Steward/Explorer/... ) | agent frontmatter `.md`; skills; prompts | subagent/agents/ | subagents/agents | none | role catalog; role↔model routing | Mostly product concepts / skills in MVP | High | `examples/extensions/subagent/agents.ts`, `docs/skills.md` |
| 18 | Structured handoffs | `sendMessage`/`sendUserMessage` steer/followUp; session replacement | handoff.ts, send-user-message.ts | subagents | none | handoff artifact schema | Build (MVP, minimal) | High | `docs/extensions.md` |
| 19 | Active steering of running work | RPC `steer`/`follow_up`; `deliverAs: steer` | input-transform-streaming.ts | subagents takeover | none | takeover UI (later) | Defer (steering primitive available) | High | `docs/rpc.md`, `docs/extensions.md` |
| 20 | Git checkpoints / commit suggestions | `pi.exec` + lifecycle events | git-checkpoint.ts, auto-commit-on-exit.ts | git-info | none | commit-quality audit | Build (MVP, suggest commit) | High | `docs/extensions.md` |
| 21 | PR preparation / delivery summary | `pi.exec` (gh/git) | git-merge-and-resolve.ts | (none direct) | `gh` CLI (optional) | PR-prep flow | Build (MVP: delivery summary; PR optional) | Medium | `docs/extensions.md` |
| 22 | Model routing (role/model separation) | `setModel`, `registerProvider`, `scopedModels` | model-status.ts, preset.ts | model-info, subagents | none | routing policy layer | Build (post-MVP); manual in MVP | High | `docs/extensions.md`, `docs/models.md` |
| 23 | Thinking-level control | `setThinkingLevel`, `thinking_level_select` | preset.ts | model-info | none | none | Use native | High | `docs/extensions.md` |
| 24 | Cost / subscription visibility | `getContextUsage`, RPC `get_session_stats` (`usage`, `cost`) | (built-in) | context-utilization | none | no exact balances (by design) | Build (post-MVP, read-only) | High | `docs/rpc.md`, `docs/extensions.md` |
| 25 | Context-usage visibility | `ctx.getContextUsage()` | (built-in) | context-utilization | none | none | Build (MVP, module) | High | `docs/extensions.md` |
| 26 | Background processes (list/inspect/stop) | None native (`pi.exec`, spawn in ext) | interactive-shell.ts, file-trigger.ts | background-terminals | none | full manager | Defer | High | `docs/extensions.md` |
| 27 | Local sandboxed execution (optional) | None built-in; Gondolin/Docker/OpenShell | gondolin/, sandbox/ | workflows sandbox | QEMU/Docker/OpenShell | worktree-first approach | Defer (optional; investigate worktrees) | High | `docs/security.md`, `docs/containerization.md` |
| 28 | Remote / long-running execution | tool `operations` injection; SSH | ssh.ts | (subagents backends) | SSH/remote host | orchestration/contracts | Defer | High | `docs/extensions.md` |
| 29 | Project trust respected | native trust + `project_trust` | project-trust.ts | (ProjectTrustStore used) | none | none | Use native | High | `docs/security.md` |
| 30 | Session branching / tree / resume points | `/fork`,`/clone`,`/tree`, labels; RPC `get_tree/get_entries` | bookmark.ts | child-session | none | none | Use native | High | `docs/sessions.md`, `docs/rpc.md` |
| 31 | Compaction (ledger-aware) | native + `session_before_compact` custom summary | custom-compaction.ts | summaries | none | ledger-aware summary | Use native (customize later) | High | `docs/compaction.md` |
| 32 | Embed Pi in an app (future) | SDK `createAgentSession(Runtime)` | examples/sdk/ | (n/a) | none | n/a for MVP | Defer (reserve) | High | `docs/sdk.md` |
| 33 | Control Pi from another process (future) | `pi --mode rpc` JSONL | rpc-demo.ts | (n/a) | none | n/a for MVP | Defer (reserve) | High | `docs/rpc.md` |
| 34 | JSON event stream (headless) | `pi --mode json` | (mode) | (subagents use JSON) | none | none | Defer / used by delegation | High | `docs/json.md` |
| 35 | Roles/tools as skills & prompt templates | native skills + prompt templates | (resources) | skills/ | none | role playbooks | Build (MVP) | High | `docs/skills.md`, `docs/prompt-templates.md` |
| 36 | Ship a theme | native themes (JSON) | (themes) | github-dark-default.json | none | author own theme | Build (post-MVP; own JSON) | High | `docs/themes.md` |
| 37 | Package + share NewFang | pi packages (npm/git, `pi` manifest) | with-deps/ | package.json manifest | none | none | Defer (extensions-first) | High | `docs/packages.md` |
| 38 | Approval learning without silent broadening | `on("tool_call")` + own policy store | permission-gate.ts | (none direct) | none | policy model + audit trail | Build (self-hosting project) | High | `docs/extensions.md` |
| 39 | Progressive rigor (Research→Release) | flags/commands/state (NewFang) | plan-mode/ | (workflows phases) | none | rigor model | Build (MVP, minimal) | Medium | product direction §9 |
| 40 | Interruption policy (surface vs proceed) | dialogs + notify + own policy | timed-confirm.ts, notify.ts | (ask-user) | none | policy | Build (MVP, minimal) | Medium | `docs/extensions.md` |

## Reading the matrix

- **In slice / Use native / Build (MVP)** rows (1–3, 5–18, 20–21, 25, 29–31, 35, 39–40) define the
  MVP surface: an extensions-first NewFang that intakes work, keeps a durable ledger/backlog, tracks
  one claim with one verification receipt, delegates one bounded task, and produces a delivery
  summary — all on native Pi primitives.
- **Build (self-hosting project)** rows (4, 38) are the approval subsystem, deliberately the first
  project NewFang builds *on itself* (`newfang-approval-bundles`).
- **Defer** rows (19, 26–28, 32–34, 36–37) are real but non-essential: background terminals, sandbox,
  remote execution, SDK/RPC app pivots, theme, packaging.
- **Reject (MVP)** items live in the Ben audit (fd/rg auto-download, Firecrawl, model-authored
  workflows) — capability exists but conflicts with MVP scope or NewFang's durability/safety posture.

No row asserts bare "supported": each names the primitive or marks the gap.
