// `/newfang decisions | assumptions | risks` — compact, readable listings.

import { loadState } from "../state/store.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

export async function runDecisions(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  if (state.decisions.length === 0) {
    return { level: "info", lines: ["No decisions recorded."], state };
  }
  const lines = [`Decisions (${state.decisions.length}):`];
  for (const d of state.decisions) {
    lines.push(`  ${d.id} [${d.status}] ${d.title}`);
    lines.push(`     → ${d.decision}`);
    if (d.supersededBy) lines.push(`     superseded by ${d.supersededBy}`);
  }
  return { level: "info", lines, state };
}

export async function runAssumptions(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  if (state.assumptions.length === 0) {
    return { level: "info", lines: ["No assumptions recorded."], state };
  }
  const lines = [`Assumptions (${state.assumptions.length}):`];
  for (const a of state.assumptions) {
    lines.push(`  ${a.id} [${a.status}] (confidence: ${a.confidence}) ${a.statement}`);
    if (a.note) lines.push(`     note: ${a.note}`);
  }
  return { level: "info", lines, state };
}

export async function runRisks(root: string): Promise<CommandResult> {
  let state;
  try {
    state = await loadState(root);
  } catch (error) {
    return loadErrorResult(error);
  }
  if (state.risks.length === 0) {
    return { level: "info", lines: ["No risks recorded."], state };
  }
  const lines = [`Risks (${state.risks.length}):`];
  for (const r of state.risks) {
    lines.push(`  ${r.id} [${r.status}] (${r.likelihood}/${r.impact}) ${r.statement}`);
    if (r.mitigation) lines.push(`     mitigation: ${r.mitigation}`);
    if (r.linkedWorkItems?.length) lines.push(`     linked: ${r.linkedWorkItems.join(", ")}`);
  }
  return { level: "info", lines, state };
}
