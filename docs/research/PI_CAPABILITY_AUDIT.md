# Pi Capability Audit

## Summary

This audit records what the current Pi coding-agent harness natively provides against NewFang's
requirements. Pi is a small, well-documented TypeScript harness with a deep extension API, an
in-process SDK, an RPC/JSON subprocess protocol, a session tree with branching and compaction, and
mature building blocks for tools, custom UI, project trust, model routing, and delegation. It has
**no built-in sandbox** and **no native background-process manager**; both are intentionally left to
extensions or the OS. Most NewFang requirements map onto an existing Pi primitive; NewFang's novel
value (project ownership, durable ledger, claims/evidence, approval quality) is additive on top of
these primitives rather than a fight against them.

## Provenance

| Field | Value |
|-------|-------|
| Access date | 2026-07-24 |
| Pi version audited (authoritative local source) | `0.80.3` |
| Current published `latest` (npm) | `0.82.0` (checked 2026-07-24) |
| Other npm dist-tags | `legacy-node20 = 0.74.2` |
| Packages | `@earendil-works/pi-coding-agent`, `@earendil-works/pi-agent-core`, `@earendil-works/pi-ai`, `@earendil-works/pi-tui` |
| Canonical repo | `github.com/earendil-works/pi` (mirror: `github.com/badlogic/pi-mono`) |
| Local source path (read-only snapshot) | `@earendil-works/pi-coding-agent@0.80.3` `README.md`, `CHANGELOG.md`, `docs/`, `examples/` |
| CLI binary | `pi` (`bin.pi -> dist/cli.js`) |

### Version caveat

The audit reads Pi `0.80.3` documentation (the version present locally). NewFang pins and installs
`0.82.0` in Packet 1. Facts in this audit are **documented for `0.80.3`**; claims relied upon at
runtime must be **verified against the pinned `0.82.0`**. No assertion is made that these surfaces are
stable across arbitrary versions — treat every capability as version-sensitive and re-verify on any
version change against that version's `CHANGELOG.md`. Where a fact is known to depend on the exact
minor version, it is flagged.

## Confidence and maturity legend

- **Native**: first-class, documented Pi capability.
- **Example**: shipped as an example extension in `examples/`, not part of core; usable as a
  starting point but not guaranteed production-ready.
- **Primitive**: an API building block exists, but the end-to-end feature must be assembled.
- **None**: no meaningful Pi support; NewFang must build it.

## Capability summary table

| Capability | Support | Primary source (Pi 0.80.3) |
|------------|---------|----------------------------|
| Extension discovery and loading | Native | `docs/extensions.md`, `docs/packages.md` |
| Package structure and sharing | Native | `docs/packages.md` |
| Commands (`/command`) | Native | `docs/extensions.md` (`registerCommand`) |
| Custom tools (LLM-callable) | Native | `docs/extensions.md` (`registerTool`) |
| Lifecycle events | Native | `docs/extensions.md` (Events) |
| State persistence | Native | `docs/extensions.md` (`appendEntry`, state-in-details), `docs/session-format.md` |
| Session entries | Native | `docs/session-format.md`, `docs/sessions.md` |
| Custom renderers | Native | `docs/extensions.md` (`renderCall`/`renderResult`, `registerMessageRenderer`) |
| Status and widgets | Native | `docs/extensions.md` (`setStatus`, `setWidget`, `setFooter`) |
| Custom TUI components | Native | `docs/tui.md`, `ctx.ui.custom()` |
| Question and confirmation UI | Native | `docs/extensions.md` (`ui.select/confirm/input/editor`), native `ask_question` tool |
| Tool interception (block/modify) | Native | `docs/extensions.md` (`tool_call`, `tool_result`) |
| Path and command protection | Example | `examples/extensions/protected-paths.ts`, `permission-gate.ts` |
| Git checkpoint | Example | `examples/extensions/git-checkpoint.ts`, `auto-commit-on-exit.ts` |
| Todo / task list | Example | `examples/extensions/todo.ts` |
| Plan mode | Example | `examples/extensions/plan-mode/` |
| Handoff | Example / Primitive | `examples/extensions/handoff.ts`, `send-user-message.ts`, session replacement API |
| Subagents | Example | `examples/extensions/subagent/` (spawns `pi` subprocesses via JSON mode) |
| Background processes | None (Primitive) | no native manager; `interactive-shell.ts`, `file-trigger.ts` show pieces |
| Remote execution | Primitive | tool `operations` interfaces; `examples/extensions/ssh.ts` |
| SSH | Example | `examples/extensions/ssh.ts` |
| Sandbox | Example / External | `docs/containerization.md` (Gondolin, Docker, OpenShell) |
| Project trust | Native | `docs/security.md`, `project_trust` event |
| Model selection / routing | Native | `docs/models.md`, `setModel`, `registerProvider`, `scopedModels` |
| Thinking-level controls | Native | `setThinkingLevel`, `thinking_level_select` |
| Session branching (fork/clone/tree) | Native | `docs/sessions.md`, `SessionManager` |
| Compaction | Native | `docs/compaction.md`, `session_before_compact` |
| SDK | Native | `docs/sdk.md` (`createAgentSession`, `AgentSessionRuntime`) |
| RPC | Native | `docs/rpc.md` (`pi --mode rpc`) |
| JSON event stream | Native | `docs/json.md`, `pi --mode json` |
| Skills | Native | `docs/skills.md` |
| Prompt templates | Native | `docs/prompt-templates.md` |
| Themes | Native | `docs/themes.md` |
| Pi packages | Native | `docs/packages.md` |

## Detailed findings

Each entry records: source, maturity, limitations, relevance to NewFang, likely reuse strategy, and
verification notes.

### Extension model (discovery, loading, packages)

- **Source**: `docs/extensions.md`, `docs/packages.md`.
- **Maturity**: Native.
- **What exists**: Extensions are TypeScript modules exporting a default factory `(pi) => {...}`,
  loaded via [jiti](https://github.com/unjs/jiti) (no build step). Auto-discovered from
  `~/.pi/agent/extensions/` (global) and `.pi/extensions/` (project-local, loaded only after project
  trust). Additional sources declared in `settings.json` under `extensions` and `packages`
  (`npm:`, `git:`, local paths). Hot reload via `/reload`. Packages bundle extensions, skills,
  prompt templates, and themes and ship via npm or git; core packages are `peerDependencies` with
  `"*"`.
- **Limitations**: Extensions run with full user permissions (arbitrary code). Project-local
  extensions require trust. Long-lived resources must be started at `session_start`, not in the
  factory.
- **Relevance**: This is NewFang's primary delivery vehicle. NewFang is a set of extensions
  (later a package).
- **Reuse strategy**: Use directly. NewFang ships as project-local extensions first, then a package.
- **Verification**: Confirmed against `docs/extensions.md` "Extension Locations" and
  `docs/packages.md` "Package Sources".

### Commands, tools, flags, shortcuts

- **Source**: `docs/extensions.md` (`registerCommand`, `registerTool`, `registerFlag`,
  `registerShortcut`).
- **Maturity**: Native.
- **What exists**: `pi.registerCommand("name", {handler, getArgumentCompletions})` adds
  `/name` commands (with argument autocompletion). `pi.registerTool(def)` adds LLM-callable tools
  with TypeBox parameter schemas, streaming `onUpdate`, `promptSnippet`/`promptGuidelines` to opt
  into the system prompt, `prepareArguments` for backward-compatible schema evolution, custom
  `renderCall`/`renderResult`, and `terminate` for early stop. Tools can be registered after
  startup and enabled/disabled with `setActiveTools`. Built-in tools (`read`, `bash`, `edit`,
  `write`, `grep`, `find`, `ls`) can be overridden by name; `ask_question` is also a built-in
  (SDK `excludeTools: ["ask_question"]`).
- **Limitations**: Use `StringEnum` from `@earendil-works/pi-ai` for enums (Google API
  compatibility). Tools must truncate output (50 KB / 2000 lines default). File-mutating tools
  should use `withFileMutationQueue()` because tools run in parallel by default.
- **Relevance**: NewFang's ledger, backlog, claims, evidence, gates, and intake are commands and
  tools.
- **Reuse strategy**: Use directly.
- **Verification**: `docs/extensions.md` "Custom Tools", "ExtensionAPI Methods".

### Lifecycle events and interception

- **Source**: `docs/extensions.md` (Events).
- **Maturity**: Native.
- **What exists**: A rich event bus with lifecycle ordering: `project_trust`, `session_start`,
  `resources_discover`, `input` (transform/handle), `before_agent_start` (inject message, modify
  system prompt), `agent_start/end`, `turn_start/end`, `message_*`, `context` (modify messages
  pre-call), `before_provider_request`/`after_provider_response`, `tool_execution_*`, `tool_call`
  (**can block or mutate input**), `tool_result` (**can modify result**), `user_bash` (**can
  intercept `!` commands**), `model_select`, `thinking_level_select`, `session_before_*`
  (switch/fork/compact/tree, cancelable), `session_shutdown`. Extensions communicate via
  `pi.events`.
- **Limitations**: In default parallel tool mode, `tool_call` is not guaranteed to see sibling tool
  results in the same assistant message. Some hooks are notification-only.
- **Relevance**: Approval gates, path protection, evidence capture, git checkpointing, and steering
  all hang off these events.
- **Reuse strategy**: Use directly. Approval bundles subscribe to `tool_call`.
- **Verification**: `docs/extensions.md` "Lifecycle Overview".

### State persistence and session entries

- **Source**: `docs/extensions.md` (State Management, `appendEntry`), `docs/session-format.md`,
  `docs/sessions.md`.
- **Maturity**: Native.
- **What exists**: Two documented persistence mechanisms: (1) `pi.appendEntry(customType, data)`
  writes a custom entry to the append-only JSONL session (does **not** enter LLM context); restore
  by scanning `ctx.sessionManager.getEntries()` on `session_start`. (2) State-in-tool-result
  `details` for branch-aware reconstruction (reading back the current branch). Sessions are an
  append-only **tree** of entries with stable ids and `parentId` linking. `SessionManager` exposes
  `getEntries`, `getBranch`, `getTree`, `getPath`, `getLeafEntry`, labels, and branching.
- **Limitations**: Session state is per-session-file. It is Pi's storage, not a human-facing
  document. NewFang's requirement for **human-readable** project truth means the durable ledger
  should also exist as inspectable files in the repo, with the session used for fast reconstruction.
- **Relevance**: Central. This is how NewFang survives restarts; but see the durable-state ADR —
  authoritative project truth is a repo-visible artifact, mirrored/indexed by session entries.
- **Reuse strategy**: Use `appendEntry` for fast in-session reconstruction; treat repo files as the
  human-readable source of truth and reconcile on resume.
- **Verification**: `docs/extensions.md` "State Management"; `docs/sdk.md` "Session Management".

### Custom UI: renderers, status, widgets, TUI components, dialogs

- **Source**: `docs/extensions.md` (Custom UI, Custom Rendering), `docs/tui.md`, `docs/rpc.md`
  (Extension UI Protocol).
- **Maturity**: Native.
- **What exists**: Footer `setStatus`, `setWidget` (above/below editor, string arrays or component
  factories), `setFooter`, `setHeader`, `setTitle`, working-indicator customization, custom message
  renderers (`registerMessageRenderer`), full custom components via `ctx.ui.custom()` including
  experimental overlay/modal mode, custom editors (`CustomEditor`), and autocomplete providers.
  Dialogs: `ui.select`, `ui.confirm`, `ui.input`, `ui.editor`, `ui.notify` — with timeouts and
  `AbortSignal`. In RPC mode these dialogs are proxied to the client via an
  `extension_ui_request`/`extension_ui_response` sub-protocol; `custom()` and other TUI-only methods
  degrade to no-ops.
- **Limitations**: `custom()` requires a real terminal (`ctx.mode === "tui"`). Widget component
  factories are ignored in RPC mode (string arrays only).
- **Relevance**: The NewFang "home view" (project identity, phase, health, next action, blockers,
  approvals) is built from `setWidget`/`setFooter`/`custom()`. Approval bundles use dialogs and/or
  `custom()`.
- **Reuse strategy**: Use directly; design views to degrade gracefully across modes.
- **Verification**: `docs/extensions.md` "Widgets, Status, and Footer"; `docs/rpc.md`
  "Extension UI Protocol".

### Question and confirmation UI

- **Source**: `docs/extensions.md` (Dialogs); native `ask_question` tool (referenced in
  `docs/sdk.md`).
- **Maturity**: Native (dialogs; `ask_question` tool). Ben's `ask-user` is an alternative example.
- **What exists**: Extension dialogs (above) plus a built-in `ask_question` tool the model can call.
- **Relevance**: NewFang's "Clarify" phase favors concise multiple-choice questions with
  recommended defaults; the native tool and dialogs cover this.
- **Reuse strategy**: Prefer native `ask_question`/dialogs; only build a custom question tool if the
  native shape is insufficient (e.g., structured multi-option with metadata).
- **Verification**: `docs/sdk.md` Tools section (`excludeTools: ["ask_question"]`).

### Path and command protection; approval gates

- **Source**: `examples/extensions/permission-gate.ts`, `protected-paths.ts`,
  `confirm-destructive.ts`.
- **Maturity**: Example.
- **What exists**: Working examples that block dangerous bash (`rm -rf`, `sudo`) via `tool_call`
  returning `{block:true}`, block writes to protected paths, and confirm destructive session
  changes.
- **Limitations**: These are single-purpose demos, not a policy engine. There is no native concept
  of grouped/phase-scoped approvals, denial reasons, approval history, or policy narrowing — exactly
  the gap `newfang-approval-bundles` fills.
- **Relevance**: Directly relevant; the approval extension is NewFang's first self-hosting project.
- **Reuse strategy**: Reimplement as a first-class approval subsystem inspired by these patterns.
- **Verification**: `docs/extensions.md` "Examples Reference"; example files present in snapshot.

### Git checkpointing and delivery

- **Source**: `examples/extensions/git-checkpoint.ts`, `git-merge-and-resolve.ts`,
  `auto-commit-on-exit.ts`, `dirty-repo-guard.ts`.
- **Maturity**: Example.
- **What exists**: Stash-on-turn checkpointing, restore-on-branch, commit-on-shutdown, dirty-repo
  guards — all built on `pi.exec("git", ...)` and lifecycle events.
- **Limitations**: No native commit-quality auditing, PR preparation, or release workflow.
- **Relevance**: NewFang's Git and delivery behavior (checkpoints, diff audits, PR prep).
- **Reuse strategy**: Reimplement independently as NewFang's Release Keeper behaviors; use example
  patterns for the `exec`/event wiring.
- **Verification**: `docs/extensions.md` "Examples Reference".

### Todo/task, plan mode

- **Source**: `examples/extensions/todo.ts`, `examples/extensions/plan-mode/`.
- **Maturity**: Example.
- **What exists**: `todo.ts` is a stateful tool persisting via `appendEntry` + branch-aware
  `details`, with custom `renderResult` — the canonical pattern for NewFang's backlog. `plan-mode/`
  is a full plan-mode extension exercising every event type, flags, shortcuts, status, widgets, and
  `setActiveTools`.
- **Relevance**: `todo.ts` is the closest existing analog to the NewFang backlog/ledger tool;
  `plan-mode/` is a template for a stateful, mode-changing extension.
- **Reuse strategy**: Reimplement the ledger/backlog independently using the `todo.ts` persistence
  pattern; study `plan-mode/` for structure.
- **Verification**: Example directories present in snapshot; `docs/extensions.md` "Complex
  Extensions".

### Handoff and steering

- **Source**: `examples/extensions/handoff.ts`, `send-user-message.ts`; SDK session-replacement API;
  `pi.sendMessage`/`sendUserMessage` with `deliverAs: steer|followUp|nextTurn`.
- **Maturity**: Example + Native primitives.
- **What exists**: Cross-provider handoff example; steer/follow-up message injection; session
  replacement (`newSession`, `switchSession`, `fork`, `clone`) with `withSession` callbacks. RPC
  exposes `steer`, `follow_up`, `set_steering_mode`, `set_follow_up_mode`.
- **Relevance**: NewFang structured handoffs and active steering.
- **Reuse strategy**: Use native steering/session-replacement primitives; build structured handoff
  artifacts (objective, context, decisions, scope, acceptance) on top.
- **Verification**: `docs/extensions.md` (`sendMessage`, session replacement),
  `docs/rpc.md` (steer/follow_up).

### Subagents / delegation

- **Source**: `examples/extensions/subagent/` (`index.ts`, `agents.ts`, `agents/`, `prompts/`).
- **Maturity**: Example.
- **What exists**: A subagent tool that spawns a **separate `pi` process** per invocation (isolated
  context window), reading structured output via JSON mode. Modes: single, parallel (`tasks`), and
  chain (`chain` with `{previous}` substitution). Agents are defined as Markdown files with
  frontmatter (`name`, `description`, `tools`, `model`, `systemPrompt`) discovered from user and
  project agent directories via `parseFrontmatter`.
- **Limitations**: Subprocess-per-call model; no native scheduler, concurrency cap, or takeover UI
  (Ben's setup adds those). No native "role" concept beyond agent frontmatter files.
- **Relevance**: This is the mechanism for NewFang's specialist roles (Explorer, Builder, Fixer,
  Verifier, etc.). The frontmatter-agent format maps cleanly onto NewFang role definitions.
- **Reuse strategy**: Adopt the agent-frontmatter + JSON-mode subprocess pattern conceptually.
  Roles are prompt/skill/agent definitions in the MVP; runtime multi-agent delegation is deferred
  until the ledger and a single bounded delegation are proven.
- **Verification**: `examples/extensions/subagent/index.ts` header read directly from snapshot.

### Background processes

- **Source**: no native manager; `examples/extensions/interactive-shell.ts` (persistent shell),
  `file-trigger.ts` (file watcher -> message).
- **Maturity**: None (Primitive parts only).
- **What exists**: `pi.exec` runs commands; extensions may spawn and manage their own processes and
  deliver results via `sendMessage`. There is no native list/inspect/stop process registry.
- **Limitations**: Full background-terminal management (list, inspect stdout/stderr, ownership,
  safe stop) must be built. Ben's `background-terminals` extension is the reference implementation
  of exactly this (reimplement-only; see Ben audit).
- **Relevance**: NewFang execution profile 18.2 (local background execution).
- **Reuse strategy**: Build independently, later; not required for the MVP vertical slice.
- **Verification**: `docs/extensions.md` "Long-lived resources and shutdown"; absence of a native
  process API confirmed by reading the ExtensionAPI method list.

### Remote execution and SSH

- **Source**: tool `operations` interfaces (`ReadOperations`, `BashOperations`, etc.),
  `createLocalBashOperations`, bash `spawnHook`; `examples/extensions/ssh.ts`.
- **Maturity**: Primitive + Example.
- **What exists**: Built-in tools accept pluggable `operations`, so file/bash tools can be routed
  over SSH or into containers. `ssh.ts` demonstrates a `--ssh` flag routing execution to a remote.
- **Limitations**: No native remote orchestration, machine registry, or transfer management.
- **Relevance**: NewFang execution profiles 18.4/18.5 (remote, long-running contracts).
- **Reuse strategy**: Deferred; the operations-injection pattern is the correct seam when built.
- **Verification**: `docs/extensions.md` "Remote Execution".

### Sandboxing

- **Source**: `docs/containerization.md`, `docs/security.md`, `examples/extensions/gondolin/`,
  `examples/extensions/sandbox/`.
- **Maturity**: Example / External.
- **What exists**: Pi has **no built-in sandbox** (explicitly, by design). Three documented
  isolation patterns: (1) Gondolin local micro-VM extension routing built-in tools + `!` into a VM
  (needs Node >= 23.6.0 and QEMU); (2) plain Docker running the whole `pi` process; (3) NVIDIA
  OpenShell policy-controlled sandbox (needs a gateway).
- **Limitations**: All add setup complexity; Gondolin needs QEMU; OpenShell needs a gateway. On
  macOS/Apple Silicon these have real friction.
- **Relevance**: NewFang profile 18.3 — sandboxing is explicitly **optional** and must not become a
  prerequisite for ordinary use.
- **Reuse strategy**: Defer. When explored, favor Git worktrees / project-isolated dirs first
  (lowest friction), then Docker; treat micro-VM/OpenShell as advanced options.
- **Verification**: `docs/security.md` "No Built-in Sandbox"; `docs/containerization.md` table.

### Project trust

- **Source**: `docs/security.md`, `project_trust` event.
- **Maturity**: Native.
- **What exists**: Trust controls whether project-local settings/resources/extensions load. Saved
  per canonical directory in `~/.pi/agent/trust.json`; `defaultProjectTrust` default is `"ask"`.
  User/global and CLI extensions can own the decision via `project_trust`. Trust is an
  input-loading guard, **not** a sandbox, and does not restrict tool actions after start.
- **Relevance**: NewFang must respect trust for its own project-local config, and its approval
  system is separate from (and complementary to) trust.
- **Reuse strategy**: Use directly; do not conflate trust with approval policy.
- **Verification**: `docs/security.md` "Project Trust".

### Model selection, routing, thinking levels

- **Source**: `docs/models.md`, `docs/providers.md`, `docs/custom-provider.md`, `docs/extensions.md`
  (`setModel`, `registerProvider`, `scopedModels`, `setThinkingLevel`).
- **Maturity**: Native.
- **What exists**: Multi-provider model registry (`ModelRegistry`), custom models via `models.json`,
  dynamic `registerProvider` (incl. OAuth for `/login`, proxies, base-URL overrides), `setModel`,
  model cycling (`Ctrl+P`, `scopedModels`), thinking levels
  `off|minimal|low|medium|high|xhigh` (`xhigh` OpenAI codex-max only), and `model_select` /
  `thinking_level_select` events. RPC exposes `set_model`, `cycle_model`, `get_available_models`,
  `set_thinking_level`.
- **Limitations**: Providers rarely expose precise remaining credits; Pi tracks per-message
  `usage.cost` and context usage but not subscription balances. This matches NewFang's stance of not
  pretending to know exact balances.
- **Relevance**: NewFang model/harness routing (role/model separation) and the cost/subscription
  interface module.
- **Reuse strategy**: Use directly; build a routing policy layer that selects models per role/task
  and reads `usage`/`contextUsage` for the cost module.
- **Verification**: `docs/extensions.md` (`registerProvider`, `setModel`), `docs/rpc.md` Model/
  Thinking sections.

### Session branching, tree navigation

- **Source**: `docs/sessions.md`, `docs/session-format.md`, SDK `SessionManager` /
  `AgentSessionRuntime`, RPC `fork`/`clone`/`get_tree`/`get_entries`.
- **Maturity**: Native.
- **What exists**: In-place branching (`/fork`, `/clone`, `/tree`), labels/bookmarks, branch
  summaries, and a durable append-only entry tree. `get_entries` supports a `since` cursor for
  incremental sync across client restarts.
- **Relevance**: Enables NewFang "what changed / resume" flows and abandoned-branch summaries.
- **Reuse strategy**: Use directly; the `since` cursor is a good sync primitive for an external UI.
- **Verification**: `docs/rpc.md` `get_entries`/`get_tree`; `docs/sdk.md` "Session Management".

### Compaction

- **Source**: `docs/compaction.md`, `session_before_compact`/`session_compact`, `ctx.compact()`,
  RPC `compact`/`set_auto_compaction`.
- **Maturity**: Native.
- **What exists**: Auto (threshold/overflow) and manual compaction, customizable/cancelable via
  extension, with custom summaries. Overflow recovery retries the aborted turn after compaction.
- **Relevance**: Long/interrupted projects; NewFang can inject project-ledger-aware summaries.
- **Reuse strategy**: Use directly; consider a custom compaction that preserves ledger references.
- **Verification**: `docs/extensions.md` `session_before_compact`; `docs/rpc.md` Compaction.

### SDK (embedding)

- **Source**: `docs/sdk.md`.
- **Maturity**: Native.
- **What exists**: `createAgentSession()` and `createAgentSessionRuntime()` embed Pi in-process:
  choose model, tools, custom tools (`defineTool`), a `ResourceLoader` (extensions/skills/prompts/
  themes/context), settings, and session manager; subscribe to the same event stream as the runner;
  drive `prompt`/`steer`/`followUp`; navigate the tree; compact. Run-mode helpers `InteractiveMode`,
  `runPrintMode`, `runRpcMode` are exported.
- **Limitations**: Same-process, Node/TypeScript only. Full control means NewFang owns more of the
  lifecycle.
- **Relevance**: The path to a standalone NewFang app that embeds Pi (architecture option 3).
- **Reuse strategy**: Keep in reserve; not needed for the extensions-first MVP. Its existence makes
  a later app pivot low-risk.
- **Verification**: `docs/sdk.md` Quick Start, Run Modes, Exports.

### RPC and JSON event stream

- **Source**: `docs/rpc.md`, `docs/json.md`.
- **Maturity**: Native.
- **What exists**: `pi --mode rpc` speaks strict JSONL (LF-delimited) over stdin/stdout: commands
  (`prompt`, `steer`, `follow_up`, `abort`, `new_session`, `get_state`, `get_messages`, `set_model`,
  `compact`, `bash`, `fork`, `clone`, `get_tree`, `get_entries`, `get_commands`, ...) and an event
  stream, plus the extension-UI sub-protocol. `pi --mode json` (print mode) emits a structured event
  stream to stdout with UI methods as no-ops.
- **Limitations**: Process-boundary integration; clients must implement strict JSONL framing (not
  Node `readline`).
- **Relevance**: The path to a language-agnostic or process-isolated NewFang controller
  (architecture option 4).
- **Reuse strategy**: Keep in reserve; the SDK is preferred for in-process Node work.
- **Verification**: `docs/rpc.md` Protocol Overview and Commands; `docs/json.md`.

### Skills, prompt templates, themes

- **Source**: `docs/skills.md`, `docs/prompt-templates.md`, `docs/themes.md`.
- **Maturity**: Native.
- **What exists**: Skills are on-demand `SKILL.md` capabilities discovered from `.pi/skills/`,
  `.agents/skills/` (walking up to repo root), and global skill dirs; invoked as `/skill:name` and
  expanded into content. Prompt templates are `.md` files expanded from `/command`. Themes are JSON
  files. All are bundleable in packages.
- **Relevance**: NewFang roles that are "product concepts / prompt or skill definitions" (rather than
  runtime agents) are delivered as skills and prompt templates. NewFang ships a theme.
- **Reuse strategy**: Use directly. Encode role playbooks (Explorer, Verifier, Release Keeper) as
  skills/prompts in the MVP.
- **Verification**: `docs/index.md` Customization section; `docs/sdk.md` Skills/Slash Commands.

## Cross-cutting observations

- **Everything runs with user permissions.** Trust guards *loading*, not *actions*. NewFang's
  approval system is the action-level control and is a genuine gap Pi expects extensions to fill.
- **Parallel tools by default.** Any NewFang tool that mutates files must use
  `withFileMutationQueue()`; any cross-tool state assumption must account for parallelism.
- **Session is Pi's store, not a human artifact.** NewFang's "human-readable project truth"
  requirement is not satisfied by session entries alone; it needs repo-visible files reconciled with
  session state on resume.
- **Delegation exists but is subprocess-based and role-thin.** NewFang roles map to agent
  frontmatter + JSON-mode subprocesses; a scheduler, concurrency limits, and takeover UI are not
  native.
- **No native background-process manager and no built-in sandbox.** Both are deliberate omissions;
  both are optional for the MVP.

## Open items requiring later verification

- Re-verify the extension/SDK/RPC surface against the exact installed version (audit is `0.80.3`;
  `latest` is `0.82.0`). Check the `0.81.x`/`0.82.x` `CHANGELOG.md` entries for additions to events,
  RPC commands, or the trust/approval surface before locking the approval design.
- Confirm the current shape of the native `ask_question` tool parameters against the installed
  version before deciding whether NewFang needs a custom question tool.
- Confirm `docs/skills.md` and `docs/session-format.md` details (not read in full during this pass)
  against the installed version when the ledger/skill design is implemented.
