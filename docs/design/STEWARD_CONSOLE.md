# Steward Console — Design

The Steward Console is Voila's first distinctive Pi-native interface. It answers, in order: what am
I responsible for now, what is the next justified action, why is that next, what needs attention, and
which decisions and risks matter now. ("What has not yet been proven" becomes real once claims and
verification exist — this packet reserves space for it but invents no proof data.)

## Goals

- Feel like a **Steward's console**, not a task manager or an agent-activity dashboard.
- Linear-like clarity and speed; selected Jira-like durability (decisions, risks, relationships);
  Nolte-inspired end-to-end ownership; Voila's verification-first direction.
- Keyboard-first; usable at ordinary terminal sizes; theme-token styling (no hardcoded ANSI).
- Read-mostly in this packet. State and rendering strictly separated (one immutable view model).

## Concepts evaluated

### Concept 1 — Focus Board
Dominated by the next justified action, its rationale, the focus item, blockers, and immediate
controls. Everything else is secondary.

- **Clarity**: highest for "what now / why". **Workflow fit**: excellent for heads-down execution.
- **Density**: low (deliberately). **Navigation**: trivial. **Complexity**: low.
- **Claims/receipts future**: a Proof line sits naturally under the action. **Agents/processes
  future**: limited room. **Narrow widths**: excellent (already single-focus).
- Weakness: weak at whole-project awareness (decisions/risks/work spread).

### Concept 2 — Delivery Desk
Organized around the current commitment, work state, attention required, decisions, risks, and an
eventual proof/delivery progression — an end-to-end ownership surface.

- **Clarity**: high across the delivery path. **Workflow fit**: excellent for owning intent→delivery.
- **Density**: medium. **Navigation**: a few grouped views. **Complexity**: medium.
- **Claims/receipts future**: a first-class Proof/Delivery rail is the natural extension.
  **Agents/processes future**: an activity/attention region can absorb them. **Narrow widths**: good
  if panels stack.
- Weakness: slightly more to render/maintain than a pure Focus Board.

### Concept 3 — Project Radar
Organized around project pulse, dependencies, risk concentration, current focus, and upcoming
boundaries — a bird's-eye view.

- **Clarity**: high for structure/risk; lower for "the single next action". **Workflow fit**: better
  for periodic review than daily execution. **Density**: high. **Navigation**: moderate.
  **Complexity**: highest (dependency/relationship visualization). **Claims/receipts future**: risk/
  proof concentration fits. **Narrow widths**: hardest (relationship views degrade badly).
- Weakness: risks becoming an "agent dashboard"; over-serves overview, under-serves execution.

## Selected design — hybrid: Focus-first Delivery Desk

Selected: **Delivery Desk organization with a Focus-Board-first primary screen**, with Radar ideas
(dependency awareness, risk concentration) folded into the Work and Attention derivations rather than
a separate map.

Rationale: Joshua's daily workflow needs "what now / why now" to dominate (Focus Board's strength),
but Voila's identity is end-to-end ownership and verification (Delivery Desk). The Delivery Desk
gives a first-class insertion point for the future **Proof / Delivery rail** without pretending it
exists today. Radar's full relationship visualization is deferred — its value (dependency/risk
awareness) is delivered through the Attention list and Work grouping at far lower complexity and much
better narrow-width behavior.

## Information hierarchy (first screen)

1. Project identity, phase, health, branch state (header).
2. Next justified action.
3. Why it is next (rationale, when present).
4. Current focus (item + link).
5. Attention required (derived).
6. Work-state summary (counts + grouped items).
7. Important decisions and risks.

## Views

- **Focus** — next action, rationale, focus item (acceptance criteria, dependencies, blocked reason),
  and the attention list.
- **Work** — work items grouped by operational relevance (Focus, In progress, Blocked, Ready by
  priority, Backlog), with priority/status/dependencies/blocked reasons. Not a generic Kanban.
- **Project Truth** — accepted/proposed decisions, open assumptions, open/mitigated risks, in plain
  language with stable IDs.

A **detail view** opens for a selected work item, decision, assumption, or risk, showing only
meaningful fields (never raw JSON).

### Understanding Check (Packet 3)

When an intake awaits review, the console surfaces it in three places: an **Attention** entry, an
**INTAKE** status block in Focus, and a dedicated **Understanding Check** view opened with `u`. The
view is contextual — it is not part of the `Tab` cycle — and returns to wherever you opened it from.

It shows the source title/type/hash abbreviation and draft revision, then the generated review
artifact: objective, locked and proposed decisions, constraints and non-goals, requirements and
acceptance criteria, proposed work items, open questions, risks and assumptions, conflicts, **model
inferences in their own section**, and the exact apply summary. Long content scrolls with `j`/`k` and
reports its position.

Review actions: `a` accepts and applies (this keypress *is* the explicit user confirmation the apply
path requires), `x` rejects, `Esc` returns. When blocking conflicts exist, the view says apply is
blocked and **does not offer accept** — only reject or back. There is no document editor: a revision
request goes to the Project Steward, which stages a new draft revision.

## Keyboard navigation

`Tab`/`Shift-Tab` (and `h`/`l`) switch view · `j`/`k` move selection · `Enter` open detail ·
`Esc` back/close · `q` close · `?` toggle help · `r` reload canonical state. Shortcuts are scoped to
the custom component (Pi's `ctx.ui.custom`), so Pi-global keys are not stolen.

## Responsive behavior

- **Wide (≥120 cols)**: two-column Work/Attention supporting panels; full rationale; richer detail.
- **Standard (80–119)**: stacked panels; abbreviated secondary text.
- **Compact (<80)**: one-column, focus-first; condensed counts; safe wrap/truncate; no broken borders.

## Runtime-only information

The header may show read-only runtime context — git branch, dirty/clean worktree, Pi version, Node
version, terminal size. This is **never** written into canonical state; failures to resolve it degrade
gracefully (fields simply omitted).

## Theme

Uses Pi theme tokens (`accent`, `success`, `warning`, `error`, `muted`, `dim`, `borderMuted`, `text`)
via a small `Styler` seam. The pure renderer computes layout on plain text and applies tokens only to
pre-sized segments, so no ANSI palette is hardcoded and no custom theme is required.

## Where Proof and Delivery appear later (reserved, not implemented)

When claims, receipts, gates, and delivery readiness exist, a **Proof / Delivery rail** will be added
as a fourth view (and a one-line proof summary under the Next Justified Action). The view model has a
reserved, currently-empty insertion point (`proof`) so adding it will not disturb the existing views.
This packet renders no proof data and implies no such capability.
