// `/voila deliver` and `/voila commit` logic.
//
// Both are read-only. `deliver` renders the full delivery summary; `commit` renders just the
// proposed commit boundaries and their messages. Neither writes canonical state, stages a file,
// creates a commit, pushes, or opens a pull request — the delivery boundary is a proposal a human
// approves, and Phase 6's acceptance gate says so explicitly.

import { inspectDelivery } from "../delivery-inspector/index.ts";
import { DeliveryInspectionError } from "../delivery-inspector/errors.ts";
import {
  buildDeliverySummary,
  renderCommitMessage,
  renderCommitProposal,
  renderDeliverySummary,
} from "../delivery/index.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { loadState } from "../state/store.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

/** Shared front half: canonical state + inspection + fingerprint. */
async function prepare(root: string) {
  const state = await loadState(root);
  const inspection = await inspectDelivery(root);
  const fingerprint = await tryRepositoryFingerprint(root);
  return buildDeliverySummary({ state, inspection, fingerprint });
}

/**
 * `/voila deliver` — the delivery summary: what changed, claims and evidence at their real status,
 * risks, limitations, discovered verification commands, proposed commits, and the next action.
 */
export async function runDeliver(root: string): Promise<CommandResult> {
  let summary;
  try {
    summary = await prepare(root);
  } catch (error) {
    if (error instanceof DeliveryInspectionError) {
      return { level: "error", lines: [`Cannot inspect this repository: ${error.message}`] };
    }
    return loadErrorResult(error);
  }

  const lines = renderDeliverySummary(summary);

  // The summary is advisory; its level reflects whether anything wants a human's eyes first.
  const blocked = summary.commits.some((commit) => commit.readiness === "blocked");
  const level = blocked ? "warning" : "info";
  return { level, lines };
}

/**
 * `/voila commit` — just the proposed commit boundaries, with a paste-ready message per boundary.
 * Voila never runs `git commit`; the author reviews, rewrites the subject, and commits.
 */
export async function runCommitSuggestion(root: string): Promise<CommandResult> {
  let summary;
  try {
    summary = await prepare(root);
  } catch (error) {
    if (error instanceof DeliveryInspectionError) {
      return { level: "error", lines: [`Cannot inspect this repository: ${error.message}`] };
    }
    return loadErrorResult(error);
  }

  if (summary.clean) {
    return { level: "info", lines: ["Nothing changed. There is no commit to suggest."] };
  }
  if (summary.commits.length === 0) {
    return {
      level: "warning",
      lines: [
        "Changes are present but no commit boundary was suggested.",
        ...(summary.inspection.unassignedPaths.length > 0
          ? [
              `Ungrouped paths (${summary.inspection.unassignedPaths.length}): ${summary.inspection.unassignedPaths
                .slice(0, 20)
                .join(", ")}`,
            ]
          : []),
      ],
    };
  }

  const lines = [
    `${summary.commits.length} proposed commit boundary(ies). Voila does not commit; review and run git yourself.`,
    "",
  ];
  for (const commit of summary.commits) {
    lines.push(...renderCommitProposal(commit));
    lines.push("      message:");
    for (const messageLine of renderCommitMessage(commit).split("\n")) {
      lines.push(`        ${messageLine}`);
    }
    lines.push("");
  }
  if (summary.inspection.unassignedPaths.length > 0) {
    lines.push(
      `Ungrouped (${summary.inspection.unassignedPaths.length}): ${summary.inspection.unassignedPaths
        .slice(0, 20)
        .join(", ")}`,
    );
  }

  const blocked = summary.commits.some((commit) => commit.readiness === "blocked");
  return { level: blocked ? "warning" : "info", lines };
}
