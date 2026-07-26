// Model-callable delivery tools (Phase 6).
//
// Both tools are strictly read-only. There is deliberately no tool that commits, stages, pushes, or
// opens a pull request: the delivery boundary is a proposal a human approves, and giving a model a
// one-call path across that boundary would defeat the point.

import { Type } from "typebox";
import { inspectDelivery } from "../delivery-inspector/index.ts";
import {
  buildDeliverySummary,
  renderCommitMessage,
  renderDeliverySummary,
} from "../delivery/index.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { loadState } from "../state/store.ts";
import type { VoilaTool, VoilaToolResult } from "./index.ts";

function text(line: string, details?: unknown): VoilaToolResult {
  return { content: [{ type: "text", text: line }], details };
}

export function deliveryTools(): VoilaTool[] {
  return [
    {
      name: "voila_get_delivery_summary",
      label: "Get Delivery Summary",
      description:
        "Read-only delivery summary: what changed in the working tree, which claims are currently supported by evidence and which are not, open risks, limitations, discovered verification commands, proposed commit boundaries, and the canonical next action. Never commits, stages, pushes, or runs anything.",
      promptSnippet: "Summarize what is ready to deliver, with evidence and risks",
      promptGuidelines: [
        "Use voila_get_delivery_summary before proposing a commit or writing a delivery summary, so the report is grounded in the real change set and real evidence.",
        "Report claim statuses exactly as returned. A stale claim is not support; never describe unsupported work as proven.",
      ],
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_id, _params, _signal, _onUpdate, ctx) {
        const state = await loadState(ctx.cwd);
        const inspection = await inspectDelivery(ctx.cwd);
        const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
        const summary = buildDeliverySummary({ state, inspection, fingerprint });
        return text(renderDeliverySummary(summary).join("\n"), { summary });
      },
    },

    {
      name: "voila_suggest_commit",
      label: "Suggest Commit",
      description:
        "Read-only commit proposals for the current change set: disjoint path groupings, a generated subject, a rationale, and a readiness verdict per boundary. Voila never creates the commit; the author reviews and runs git.",
      promptSnippet: "Propose well-scoped commit boundaries for the current changes",
      promptGuidelines: [
        "Use voila_suggest_commit to propose commit boundaries rather than guessing them from a diff.",
        "The generated subject describes change shape, not intent. Rewrite it to say what the change actually does before suggesting the user commit.",
        "Never present a boundary with readiness 'blocked' as safe to commit without inspection.",
      ],
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute(_id, _params, _signal, _onUpdate, ctx) {
        const state = await loadState(ctx.cwd);
        const inspection = await inspectDelivery(ctx.cwd);
        const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
        const summary = buildDeliverySummary({ state, inspection, fingerprint });

        if (summary.commits.length === 0) {
          return text(
            summary.clean
              ? "Nothing changed. There is no commit to suggest."
              : "Changes are present but no commit boundary was suggested.",
            { commits: [], clean: summary.clean },
          );
        }

        const lines = summary.commits.map(
          (commit) =>
            `${commit.boundaryId} [${commit.readiness}] ${commit.subject}\n` +
            `  ${commit.readinessReason}\n` +
            `  files: ${commit.paths.join(", ")}\n` +
            `  message:\n${renderCommitMessage(commit)
              .split("\n")
              .map((l) => `    ${l}`)
              .join("\n")}`,
        );
        return text(lines.join("\n\n"), {
          commits: summary.commits,
          unassignedPaths: summary.inspection.unassignedPaths,
        });
      },
    },
  ];
}
