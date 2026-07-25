// Pure rendering for the Steward Console. Produces string[] sized to a given width. Styling is
// applied via a Styler seam only to already-sized plain segments, so visible width stays correct and
// no ANSI palette is hardcoded. Tests use `plainStyler` (identity) to assert layout on plain text.

import type { ConsoleModel, ConsoleView, EntityRef } from "./model.ts";
import { selectableRefs } from "./model.ts";
import type { ConsoleUiState } from "./navigation.ts";
import { layoutClass } from "./layout.ts";
import type { WorkItem } from "../../domain/types.ts";

export type StyleToken =
  "accent" | "success" | "warning" | "error" | "muted" | "dim" | "border" | "text";

export interface Styler {
  fg(token: StyleToken, text: string): string;
  bold(text: string): string;
}

export const plainStyler: Styler = { fg: (_t, s) => s, bold: (s) => s };

// --- width-safe plain-text helpers (operate before styling) ---

function len(s: string): number {
  return Array.from(s).length;
}
function truncate(s: string, width: number): string {
  if (width <= 0) return "";
  const chars = Array.from(s);
  if (chars.length <= width) return s;
  if (width === 1) return "…";
  return `${chars.slice(0, width - 1).join("")}…`;
}
function padRight(s: string, width: number): string {
  const t = truncate(s, width);
  return t + " ".repeat(Math.max(0, width - len(t)));
}
function wrapText(text: string, width: number): string[] {
  if (width <= 0) return [text];
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if (len(cur) + 1 + len(w) <= width) cur += ` ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  // Hard-break any single word longer than width.
  return lines.flatMap((l) => (len(l) <= width ? [l] : chunk(l, width)));
}
function chunk(s: string, width: number): string[] {
  const chars = Array.from(s);
  const out: string[] = [];
  for (let i = 0; i < chars.length; i += width) out.push(chars.slice(i, i + width).join(""));
  return out;
}

function healthToken(health: string): StyleToken {
  if (health === "green") return "success";
  if (health === "yellow") return "warning";
  if (health === "red") return "error";
  return "muted";
}
function severityToken(sev: string): StyleToken {
  if (sev === "high") return "error";
  if (sev === "medium") return "warning";
  return "muted";
}

function rule(width: number, st: Styler): string {
  return st.fg("border", "─".repeat(Math.max(0, width)));
}
function heading(text: string, width: number, st: Styler): string {
  return st.fg("muted", padRight(text.toUpperCase(), width));
}

const COLUMN_GAP = 3;

/** Column widths for the two-column (wide) layout. */
export function columnWidths(width: number): { left: number; right: number } {
  const left = Math.floor((width - COLUMN_GAP) / 2);
  return { left, right: width - COLUMN_GAP - left };
}

/**
 * Compose two panels side by side; pads to equal height. Panels must already be built at their
 * column width (see `columnWidths`) so nothing is squeezed or spuriously truncated here.
 */
function columns(left: string[], right: string[], width: number, st: Styler): string[] {
  const { left: leftW, right: rightW } = columnWidths(width);
  const h = Math.max(left.length, right.length);
  const out: string[] = [];
  for (let i = 0; i < h; i++) {
    const l = padRight(left[i] ?? "", leftW);
    const r = padRight(right[i] ?? "", rightW);
    out.push(`${l}${st.fg("border", " │ ")}${r}`);
  }
  return out;
}

function selectionMarker(selected: boolean, st: Styler): string {
  return selected ? st.fg("accent", "▸ ") : "  ";
}

function refEq(a: EntityRef | undefined, b: EntityRef | undefined): boolean {
  return !!a && !!b && a.kind === b.kind && a.id === b.id;
}

function workItemRow(w: WorkItem, width: number, selected: boolean, st: Styler): string {
  const marker = selectionMarker(selected, st);
  const body = padRight(`${w.id} (${w.priority}) ${w.title}`, width - 2);
  return marker + (selected ? st.fg("accent", body) : body);
}

// --- section builders ---

function header(model: ConsoleModel, width: number, st: Styler): string[] {
  const id = model.identity;
  const name = id ? id.displayName : "NewFang";
  const right = id ? `${id.phase} · ${st.fg(healthToken(id.health), id.health)}` : "";
  const rightPlain = id ? `${id.phase} · ${id.health}` : "";
  const leftW = width - len(rightPlain) - 1;
  const left = st.bold(padRight(`NEWFANG · ${name}`, Math.max(0, leftW)));
  const line1 = leftW > 0 ? `${left} ${right}` : truncate(`NEWFANG · ${name}`, width);

  const r = model.runtime;
  const bits: string[] = [];
  if (r.branch) bits.push(r.branch);
  if (r.dirty !== undefined) bits.push(r.dirty ? "dirty" : "clean");
  if (r.piVersion) bits.push(`pi ${r.piVersion}`);
  if (r.nodeVersion) bits.push(`node ${r.nodeVersion}`);
  const line2 = bits.length ? st.fg("muted", truncate(bits.join(" · "), width)) : "";
  return line2 ? [line1, line2] : [line1];
}

function nextActionBlock(model: ConsoleModel, width: number, st: Styler): string[] {
  const out = [heading("Next justified action", width, st)];
  const na = model.nextAction;
  if (!na) return out;
  for (const l of wrapText(na.text, width)) out.push(st.fg("accent", l));
  if (na.rationale) {
    out.push("");
    for (const l of wrapText(`Why now: ${na.rationale}`, width)) out.push(st.fg("muted", l));
  }
  const focus = model.focus;
  if (focus) {
    // Budget the title against the real prefix width: "Focus: " + id + " — ".
    const prefix = `Focus: ${focus.id} — `;
    const titleBudget = Math.max(0, width - len(prefix));
    out.push(`Focus: ${st.fg("accent", focus.id)} — ${truncate(focus.title, titleBudget)}`);
  } else {
    out.push(st.fg("muted", "Focus: none"));
  }
  return out;
}

function tabsLine(view: ConsoleView, width: number, st: Styler): string {
  const labels: Array<[ConsoleView, string]> = [
    ["focus", "Focus"],
    ["work", "Work"],
    ["truth", "Project Truth"],
  ];
  const parts = labels.map(([v, label]) =>
    v === view ? st.fg("accent", st.bold(`[${label}]`)) : st.fg("muted", ` ${label} `),
  );
  return truncate(parts.join(" "), width);
}

function attentionLines(
  model: ConsoleModel,
  width: number,
  selected: EntityRef | undefined,
  st: Styler,
): string[] {
  const out = [heading("Attention", width, st)];
  if (model.attention.length === 0) {
    out.push(st.fg("muted", "  Nothing needs attention."));
    return out;
  }
  for (const a of model.attention) {
    const marker = selectionMarker(refEq(a.ref, selected), st);
    out.push(marker + st.fg(severityToken(a.severity), padRight(a.label, width - 2)));
  }
  return out;
}

function workCountLines(model: ConsoleModel, width: number, st: Styler): string[] {
  const c = model.work.counts;
  return [
    heading("Work", width, st),
    padRight(`Ready ${c.ready} · In progress ${c.inProgress}`, width),
    padRight(`Blocked ${c.blocked} · Backlog ${c.backlog}`, width),
    padRight(`Open total ${c.open}`, width),
  ];
}

function focusView(model: ConsoleModel, ui: ConsoleUiState, width: number, st: Styler): string[] {
  const selected = selectableRefs(model, "focus")[ui.selection];
  const wide = layoutClass(width) === "wide";
  // In two-column mode, build each panel at its own column width so nothing is squeezed.
  const panelWidths = wide ? columnWidths(width) : { left: width, right: width };
  const workPanel = workCountLines(model, panelWidths.left, st);
  const attnPanel = attentionLines(model, panelWidths.right, selected, st);
  const body = wide ? columns(workPanel, attnPanel, width, st) : [...workPanel, "", ...attnPanel];

  const intakeLines: string[] = [];
  if (model.pendingIntake) {
    const pi = model.pendingIntake;
    intakeLines.push(heading("Intake", width, st));
    intakeLines.push(
      st.fg(
        pi.blocked ? "error" : "warning",
        truncate(
          `${pi.id} awaits review (rev ${pi.draftRevision}) — ${pi.title}${pi.blocked ? " [conflicts]" : ""}`,
          width,
        ),
      ),
    );
    intakeLines.push(st.fg("muted", truncate("press u to open the Understanding Check", width)));
    intakeLines.push("");
  }
  if (model.orientation?.stale) {
    intakeLines.push(
      st.fg("warning", truncate(`Orientation ${model.orientation.id} is stale`, width)),
      "",
    );
  }

  const truth: string[] = [heading("Project truth", width, st)];
  const topDecisions = model.truth.decisions.filter((d) => d.status === "accepted").slice(0, 2);
  const topRisks = model.truth.risks.filter((r) => r.status === "open").slice(0, 2);
  for (const d of topDecisions) truth.push(st.fg("muted", truncate(`${d.id}  ${d.title}`, width)));
  for (const r of topRisks) truth.push(st.fg("muted", truncate(`${r.id}  ${r.statement}`, width)));
  if (topDecisions.length + topRisks.length === 0) truth.push(st.fg("muted", "  (none)"));

  return [...body, "", ...intakeLines, ...truth];
}

/** Understanding Check: the generated review artifact, scrollable, with review actions. */
function understandingView(
  model: ConsoleModel,
  ui: ConsoleUiState,
  width: number,
  st: Styler,
): string[] {
  const pi = model.pendingIntake;
  const out = [heading("Understanding check", width, st)];
  if (!pi) {
    out.push(st.fg("muted", "No intake awaits review."));
    return out;
  }
  out.push(
    st.fg("accent", truncate(`${pi.id} — ${pi.title}`, width)),
    st.fg(
      "muted",
      truncate(
        `${pi.sourceType} · ${pi.sourceRef} · sha ${pi.sourceSha256.slice(0, 12)}… · draft revision ${pi.draftRevision}`,
        width,
      ),
    ),
    "",
  );
  if (pi.blocked) {
    out.push(
      st.fg("error", truncate("Apply is blocked: conflicts require your resolution.", width)),
      "",
    );
  }

  // Scrollable body from the generated artifact.
  const bodyLines = pi.understanding.flatMap((l) => wrapText(l.length ? l : " ", width));
  const viewport = 24;
  const maxScroll = Math.max(0, bodyLines.length - viewport);
  const offset = Math.min(ui.scroll, maxScroll);
  const windowed = bodyLines.slice(offset, offset + viewport);
  for (const l of windowed) out.push(l === " " ? "" : l);
  if (bodyLines.length > viewport) {
    out.push(
      "",
      st.fg(
        "muted",
        truncate(
          `lines ${offset + 1}-${offset + windowed.length} of ${bodyLines.length} · j/k scroll`,
          width,
        ),
      ),
    );
  }
  out.push(
    "",
    st.fg(
      "muted",
      truncate(
        pi.blocked ? "x reject · Esc back" : "a accept and apply · x reject · Esc back",
        width,
      ),
    ),
  );
  return out;
}

function workView(model: ConsoleModel, ui: ConsoleUiState, width: number, st: Styler): string[] {
  const selected = selectableRefs(model, "work")[ui.selection];
  const out: string[] = [];
  if (model.work.groups.length === 0) {
    out.push(st.fg("muted", "No work items yet. Create one with newfang_create_work_item."));
    return out;
  }
  for (const g of model.work.groups) {
    out.push(heading(`${g.title} (${g.items.length})`, width, st));
    for (const w of g.items) {
      out.push(workItemRow(w, width, refEq({ kind: "work", id: w.id }, selected), st));
      if (w.status === "blocked" && w.blockedReason) {
        out.push(st.fg("warning", truncate(`      blocked: ${w.blockedReason}`, width)));
      }
    }
    out.push("");
  }
  return out;
}

function truthView(model: ConsoleModel, ui: ConsoleUiState, width: number, st: Styler): string[] {
  const selected = selectableRefs(model, "truth")[ui.selection];
  const out: string[] = [];
  out.push(heading(`Decisions (${model.truth.decisions.length})`, width, st));
  for (const d of model.truth.decisions) {
    const marker = selectionMarker(refEq({ kind: "decision", id: d.id }, selected), st);
    out.push(marker + padRight(`${d.id} [${d.status}] ${d.title}`, width - 2));
  }
  out.push("");
  out.push(heading(`Open assumptions (${model.truth.assumptions.length})`, width, st));
  for (const a of model.truth.assumptions) {
    const marker = selectionMarker(refEq({ kind: "assumption", id: a.id }, selected), st);
    out.push(
      marker + padRight(`${a.id} [${a.status}] (${a.confidence}) ${a.statement}`, width - 2),
    );
  }
  out.push("");
  out.push(heading(`Risks (${model.truth.risks.length})`, width, st));
  for (const r of model.truth.risks) {
    const marker = selectionMarker(refEq({ kind: "risk", id: r.id }, selected), st);
    out.push(
      marker +
        padRight(`${r.id} [${r.status}] (${r.likelihood}/${r.impact}) ${r.statement}`, width - 2),
    );
  }
  return out;
}

function detailView(model: ConsoleModel, ui: ConsoleUiState, width: number, st: Styler): string[] {
  const ref = selectableRefs(model, ui.view)[ui.selection];
  const out = [heading("Detail", width, st)];
  if (!ref) {
    out.push(st.fg("muted", "Nothing selected."));
    return out;
  }
  const field = (k: string, v: string) =>
    `${st.fg("muted", padRight(`${k}:`, 12))}${truncate(v, Math.max(0, width - 12))}`;
  if (ref.kind === "work") {
    const w =
      model.focus?.id === ref.id
        ? model.focus
        : model.work.groups.flatMap((g) => g.items).find((i) => i.id === ref.id);
    if (!w) return [...out, st.fg("muted", "Not found.")];
    out.push(st.fg("accent", truncate(`${w.id} — ${w.title}`, width)));
    out.push(field("kind", w.kind));
    out.push(field("status", w.status));
    out.push(field("priority", w.priority));
    if (w.description) out.push(field("description", w.description));
    if (w.blockedReason) out.push(field("blocked", w.blockedReason));
    if (w.dependsOn.length) out.push(field("depends", w.dependsOn.join(", ")));
    if (w.acceptanceCriteria.length) {
      out.push(st.fg("muted", "acceptance:"));
      for (const c of w.acceptanceCriteria)
        for (const l of wrapText(`  - ${c}`, width)) out.push(l);
    }
  } else if (ref.kind === "decision") {
    const d = model.truth.decisions.find((x) => x.id === ref.id);
    if (!d) return [...out, st.fg("muted", "Not found.")];
    out.push(st.fg("accent", truncate(`${d.id} — ${d.title}`, width)));
    out.push(field("status", d.status));
    for (const l of wrapText(`decision: ${d.decision}`, width)) out.push(l);
    for (const l of wrapText(`rationale: ${d.rationale}`, width)) out.push(st.fg("muted", l));
    if (d.supersededBy) out.push(field("superseded by", d.supersededBy));
  } else if (ref.kind === "assumption") {
    const a = model.truth.assumptions.find((x) => x.id === ref.id);
    if (!a) return [...out, st.fg("muted", "Not found.")];
    out.push(st.fg("accent", truncate(`${a.id}`, width)));
    out.push(field("status", a.status));
    out.push(field("confidence", a.confidence));
    for (const l of wrapText(`statement: ${a.statement}`, width)) out.push(l);
    if (a.note) for (const l of wrapText(`note: ${a.note}`, width)) out.push(st.fg("muted", l));
  } else {
    const r = model.truth.risks.find((x) => x.id === ref.id);
    if (!r) return [...out, st.fg("muted", "Not found.")];
    out.push(st.fg("accent", truncate(`${r.id}`, width)));
    out.push(field("status", r.status));
    out.push(field("likelihood", r.likelihood));
    out.push(field("impact", r.impact));
    for (const l of wrapText(`statement: ${r.statement}`, width)) out.push(l);
    if (r.mitigation)
      for (const l of wrapText(`mitigation: ${r.mitigation}`, width)) out.push(st.fg("muted", l));
    if (r.linkedWorkItems?.length) out.push(field("linked", r.linkedWorkItems.join(", ")));
  }
  out.push("");
  out.push(st.fg("muted", "Esc to go back"));
  return out;
}

const HELP_LINES = [
  "u                          open Understanding Check (pending intake)",
  "a / x                      accept+apply / reject (in Understanding Check)",
  "Tab / Shift-Tab or h / l   switch view",
  "j / k                      move selection",
  "Enter                      open detail",
  "Esc                        back / close",
  "r                          reload canonical state",
  "?                          toggle this help",
  "q                          close console",
];

function helpView(width: number, st: Styler): string[] {
  return [heading("Keys", width, st), ...HELP_LINES.map((l) => truncate(l, width))];
}

function footer(width: number, st: Styler): string {
  return st.fg(
    "muted",
    truncate("? help · j/k move · Enter detail · u intake · Tab view · r reload · q quit", width),
  );
}

function statusScreen(model: ConsoleModel, width: number, st: Styler): string[] {
  const title =
    model.status === "uninitialized"
      ? "NewFang is not initialized here."
      : model.status === "migration"
        ? "NewFang state needs migration."
        : "NewFang state problem.";
  const hint =
    model.status === "uninitialized"
      ? "Run /newfang init to create canonical state."
      : model.status === "migration"
        ? "Run /newfang migrate --apply to migrate to the current schema."
        : (model.message ?? "Run /newfang doctor for details.");
  return [
    st.bold(truncate("NEWFANG · STEWARD CONSOLE", width)),
    rule(width, st),
    st.fg("warning", truncate(title, width)),
    ...wrapText(hint, width).map((l) => st.fg("muted", l)),
    "",
    footer(width, st),
  ];
}

/** Render the whole console to width-correct lines. */
export function renderConsole(
  model: ConsoleModel,
  ui: ConsoleUiState,
  width: number,
  st: Styler = plainStyler,
): string[] {
  const w = Math.max(20, Math.floor(width));
  if (model.status !== "ok") return statusScreen(model, w, st);

  const lines: string[] = [];
  lines.push(...header(model, w, st));
  lines.push(rule(w, st));
  lines.push(...nextActionBlock(model, w, st));
  lines.push(rule(w, st));

  if (ui.helpOpen) {
    lines.push(...helpView(w, st));
  } else if (ui.detailOpen) {
    lines.push(...detailView(model, ui, w, st));
  } else {
    if (ui.view !== "understanding") {
      lines.push(tabsLine(ui.view, w, st));
      lines.push("");
    }
    if (ui.view === "understanding") lines.push(...understandingView(model, ui, w, st));
    else if (ui.view === "focus") lines.push(...focusView(model, ui, w, st));
    else if (ui.view === "work") lines.push(...workView(model, ui, w, st));
    else lines.push(...truthView(model, ui, w, st));
  }

  lines.push(rule(w, st));
  lines.push(footer(w, st));
  return lines;
}
