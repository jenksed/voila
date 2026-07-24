// `/newfang backlog` logic. Concise by default; detail for a single ID.

import { loadState } from "../state/store.ts";
import { backlogSummary } from "../domain/operations.ts";
import { workItemLabel } from "../domain/status.ts";
import { WORK_ITEM_STATUSES } from "../domain/types.ts";
import type { WorkItem } from "../domain/types.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

function detailLines(item: WorkItem): string[] {
  const lines = [
    `${item.id} — ${item.title}`,
    `  kind:     ${item.kind}`,
    `  status:   ${item.status}`,
    `  priority: ${item.priority}`,
  ];
  if (item.description) lines.push(`  desc:     ${item.description}`);
  if (item.blockedReason) lines.push(`  blocked:  ${item.blockedReason}`);
  if (item.dependsOn.length) lines.push(`  depends:  ${item.dependsOn.join(", ")}`);
  if (item.acceptanceCriteria.length) {
    lines.push("  acceptance:");
    for (const c of item.acceptanceCriteria) lines.push(`    - ${c}`);
  }
  return lines;
}

export async function runBacklog(root: string, id?: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }

  if (id) {
    const item = state.workItems.find((w) => w.id === id);
    if (!item) return { level: "warning", lines: [`No work item ${id}.`] };
    return { level: "info", lines: detailLines(item), state };
  }

  const s = backlogSummary(state);
  const counts = WORK_ITEM_STATUSES.filter((st) => s.countsByStatus[st] > 0)
    .map((st) => `${st} ${s.countsByStatus[st]}`)
    .join(" · ");
  const lines = [
    `Backlog — ${s.total} items${counts ? ` (${counts})` : ""}`,
    `Active: ${s.active ? workItemLabel(s.active) : "none"}`,
  ];
  if (s.inProgress.length) {
    lines.push("In progress:");
    for (const w of s.inProgress) lines.push(`  ${workItemLabel(w)}`);
  }
  if (s.blocked.length) {
    lines.push("Blocked:");
    for (const w of s.blocked) lines.push(`  ${w.id} — ${w.blockedReason ?? "(no reason)"}`);
  }
  if (s.readyByPriority.length) {
    lines.push("Ready (highest priority first):");
    for (const w of s.readyByPriority.slice(0, 5)) lines.push(`  ${workItemLabel(w)}`);
  }
  lines.push(`Next: ${s.nextAction}`);
  return { level: "info", lines, state };
}
