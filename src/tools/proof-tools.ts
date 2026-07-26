// LLM-callable tools for claims, verification receipts, and protected completion.
//
// Boundaries these tools enforce:
//   - a claim's covered criteria must match the work item's acceptance criteria exactly,
//   - there is NO manual support flag; support is derived from receipts + the repository fingerprint,
//   - verification takes a structured executable + argv, never a shell string,
//   - recording a receipt succeeds even when the command fails (failure is evidence, not an error),
//   - voila_complete_work_item is the only path to `completed`, and it reports every failing gate.

import { Type } from "typebox";
import { StringEnum } from "./schema.ts";
import type { VoilaTool, VoilaToolResult } from "./index.ts";
import { loadState, updateState } from "../state/store.ts";
import { loadProofOverview } from "../state/proof-store.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import {
  readReceiptManifest,
  readReceiptOutput,
  runVerification,
  type VerificationRequest,
} from "../state/receipt-store.ts";
import {
  assessCompletion,
  CLAIM_EVALUATIONS,
  completeWorkItem,
  createClaim,
  criterionCoverage,
  evaluateClaim,
  findClaim,
  findReceipt,
  requireClaim,
  updateClaim,
  type CompletionAssessment,
  type CreateClaimInput,
  type UpdateClaimInput,
} from "../domain/proof.ts";
import { CONFIDENCES } from "../domain/types.ts";

function text(line: string, details?: unknown): VoilaToolResult {
  return { content: [{ type: "text", text: line }], details };
}

function now(): string {
  return new Date().toISOString();
}

/** Bounded excerpt returned to a model. Full output requires deliberate artifact inspection. */
const TOOL_OUTPUT_EXCERPT = 4000;

function excerpt(value: string): { text: string; truncatedForDisplay: boolean } {
  if (value.length <= TOOL_OUTPUT_EXCERPT) return { text: value, truncatedForDisplay: false };
  return { text: value.slice(0, TOOL_OUTPUT_EXCERPT), truncatedForDisplay: true };
}

export function proofTools(): VoilaTool[] {
  return [
    {
      name: "voila_create_claim",
      label: "Create Claim",
      description:
        "State a claim about a work item and which of its acceptance criteria the claim covers. Each covered criterion must match the work item's criterion text EXACTLY. Creating a claim proves nothing: support is derived from verification receipts recorded through voila_run_verification. Record honest knownLimitations.",
      promptSnippet: "State a Voila claim about a work item and the criteria it covers",
      promptGuidelines: [
        "Use voila_create_claim to state what you believe is true and which acceptance criteria it covers; a claim is not evidence, and there is no way to mark it supported by hand.",
      ],
      parameters: Type.Object(
        {
          workItemId: Type.String({ description: "Work-item ID the claim is about, e.g. NF-3" }),
          statement: Type.String({
            description: "What is claimed to be true, specifically and checkably",
          }),
          confidence: StringEnum(CONFIDENCES),
          coveredAcceptanceCriteria: Type.Array(
            Type.String({
              description: "Exact acceptance-criterion text copied from the work item",
            }),
            { minItems: 1 },
          ),
          knownLimitations: Type.Optional(
            Type.Array(
              Type.String({ description: "What this claim does NOT establish. Stays visible." }),
            ),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as CreateClaimInput;
        const state = await updateState(
          ctx.cwd,
          (cur) => createClaim(cur, input, now()),
          (next) => {
            const c = next.claims[next.claims.length - 1];
            return { type: "claim_created", id: c?.id, workItemId: c?.workItemId };
          },
        );
        const claim = state.claims[state.claims.length - 1];
        return text(
          `Created ${claim?.id} for ${claim?.workItemId} covering ${claim?.coveredAcceptanceCriteria.length} criterion(s). Status: pending — no verification receipt exists yet. Run voila_run_verification, then voila_require_claim to make it a completion requirement.`,
          { claim },
        );
      },
    },

    {
      name: "voila_update_claim",
      label: "Update Claim",
      description:
        "Update a claim's statement, confidence, covered acceptance criteria, or known limitations. The work item it refers to cannot change, historical receipts are never rewritten, and there is no support flag to set.",
      promptSnippet: "Update a Voila claim's statement, coverage, or limitations",
      parameters: Type.Object(
        {
          id: Type.String({ description: "Claim ID, e.g. CLM-1" }),
          statement: Type.Optional(Type.String()),
          confidence: Type.Optional(StringEnum(CONFIDENCES)),
          coveredAcceptanceCriteria: Type.Optional(Type.Array(Type.String(), { minItems: 1 })),
          knownLimitations: Type.Optional(Type.Array(Type.String())),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const input = params as unknown as UpdateClaimInput;
        const state = await updateState(ctx.cwd, (cur) => updateClaim(cur, input, now()), {
          type: "claim_updated",
          id: input.id,
        });
        const claim = state.claims.find((c) => c.id === input.id);
        return text(
          `Updated ${input.id}. Existing receipts are unchanged; re-run verification if the repository has moved.`,
          { claim },
        );
      },
    },

    {
      name: "voila_require_claim",
      label: "Require Claim",
      description:
        "Attach a claim to its work item as a completion requirement. A work item cannot be completed unless every acceptance criterion is covered by a required claim and every required claim is supported by current passing evidence. Completed work items cannot have their requirements changed.",
      promptSnippet: "Make a Voila claim a completion requirement of its work item",
      promptGuidelines: [
        "Use voila_require_claim so a work item's completion actually depends on the claim; do not attach weak claims that merely satisfy the gate.",
      ],
      parameters: Type.Object(
        { workItemId: Type.String(), claimId: Type.String() },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { workItemId: string; claimId: string };
        const state = await updateState(ctx.cwd, (cur) => requireClaim(cur, p, now()), {
          type: "claim_required",
          id: p.claimId,
          workItemId: p.workItemId,
        });
        const item = state.workItems.find((w) => w.id === p.workItemId);
        const uncovered = item
          ? criterionCoverage(state, item).filter((c) => !c.covered).length
          : 0;
        return text(
          `${p.claimId} is now required by ${p.workItemId}. Required claims: ${item?.requiredClaimIds.join(", ")}. Uncovered acceptance criteria remaining: ${uncovered}.`,
          { workItem: item, uncoveredCriteria: uncovered },
        );
      },
    },

    {
      name: "voila_list_claims",
      label: "List Claims",
      description:
        "List claims with their DERIVED evidence status: pending (no receipt), supported (newest current receipt passed), unsupported (newest current receipt failed/errored/timed out), or stale (receipts exist but the repository changed since). Status is computed on read and never stored.",
      promptSnippet: "List Voila claims with their derived evidence status",
      parameters: Type.Object(
        {
          workItemId: Type.Optional(Type.String()),
          status: Type.Optional(StringEnum(CLAIM_EVALUATIONS)),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { workItemId?: string; status?: string };
        const overview = await loadProofOverview(ctx.cwd);
        const rows = overview.claims
          .filter((r) => p.workItemId === undefined || r.claim.workItemId === p.workItemId)
          .filter((r) => p.status === undefined || r.evaluation.status === p.status);
        const lines =
          rows.length > 0
            ? rows.map(
                (r) =>
                  `${r.claim.id} [${r.evaluation.status}]${r.required ? " (required)" : ""} ${r.claim.workItemId}: ${r.claim.statement}${
                    r.claim.knownLimitations.length > 0
                      ? ` — limitations: ${r.claim.knownLimitations.join("; ")}`
                      : ""
                  }`,
              )
            : ["(no matching claims)"];
        if (overview.fingerprint === null) {
          lines.push(
            "Note: the repository fingerprint is unavailable (no git), so no receipt can be shown as current evidence.",
          );
        }
        return text(lines.join("\n"), {
          fingerprintAvailable: overview.fingerprint !== null,
          summary: overview.summary,
          claims: rows.map((r) => ({
            claim: r.claim,
            evaluation: r.evaluation,
            required: r.required,
          })),
        });
      },
    },

    {
      name: "voila_run_verification",
      label: "Run Verification",
      description:
        "Execute one command for a claim and record an immutable verification receipt. Provide a structured executable plus an args array — Voila runs it with no shell, so pipes, redirection, chaining, quoting, and variable expansion are unavailable and a single shell string is refused. SUCCESS OF THIS TOOL MEANS THE RECEIPT WAS RECORDED, NOT THAT VERIFICATION PASSED: a failing command produces a valid `failed` receipt. The command may have side effects; this is not a sandbox.",
      promptSnippet: "Run a Voila verification command for a claim and record a receipt",
      promptGuidelines: [
        "Use voila_run_verification with a structured executable and args to produce evidence for a claim; a passing command is evidence only for the claim it was run for.",
      ],
      parameters: Type.Object(
        {
          claimId: Type.String({ description: "Claim this command produces evidence for" }),
          executable: Type.String({
            description: "Program name only, e.g. npm. No shell string, no arguments here.",
          }),
          args: Type.Optional(
            Type.Array(Type.String({ description: "One argument per array entry" })),
          ),
          cwdRef: Type.Optional(
            Type.String({
              description:
                "Repository-relative working directory (default: repository root). Absolute paths, traversal, and symlink escapes are rejected.",
            }),
          ),
          timeoutMs: Type.Optional(
            Type.Integer({ minimum: 1000, description: "Bounded timeout; capped by Voila" }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const request = params as unknown as VerificationRequest;
        const result = await runVerification(ctx.cwd, request);
        const r = result.receipt;
        const lines = [
          `Recorded ${r.id} for ${r.claimId}: ${r.result}${r.exitCode !== undefined ? ` (exit ${r.exitCode})` : ""}.`,
          `Command: ${r.executable} ${r.args.join(" ")} (cwd ${r.cwdRef}, no shell)`,
          `Artifact: .voila/${r.artifactRef}/ · fingerprint ${r.repositoryFingerprint.slice(0, 12)}…`,
        ];
        if (r.outputTruncated) lines.push("Captured output was truncated at the per-stream cap.");
        lines.push(
          result.passed
            ? "This receipt supports the claim only while the repository fingerprint matches."
            : "The command did NOT pass. The receipt is valid evidence of that failure; the claim is not supported.",
        );
        return text(lines.join("\n"), {
          receipt: r,
          manifest: result.manifest,
          passed: result.passed,
        });
      },
    },

    {
      name: "voila_get_receipt",
      label: "Get Receipt",
      description:
        "Read one verification receipt: canonical metadata plus its manifest. Set includeOutput to read a bounded excerpt of the stored stdout/stderr; full output lives in the immutable artifact directory and requires deliberate inspection.",
      promptSnippet: "Read a Voila verification receipt",
      parameters: Type.Object(
        {
          receiptId: Type.String({ description: "Receipt ID, e.g. RCP-1" }),
          includeOutput: Type.Optional(Type.Boolean()),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { receiptId: string; includeOutput?: boolean };
        const state = await loadState(ctx.cwd);
        const receipt = findReceipt(state, p.receiptId);
        const manifest = await readReceiptManifest(ctx.cwd, p.receiptId);
        const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
        const current = fingerprint !== null && fingerprint === receipt.repositoryFingerprint;

        const details: Record<string, unknown> = {
          receipt,
          manifest,
          matchesCurrentRepositoryState: current,
        };
        const lines = [
          `${receipt.id} for ${receipt.claimId}: ${receipt.result}${receipt.exitCode !== undefined ? ` (exit ${receipt.exitCode})` : ""}`,
          `Command: ${receipt.executable} ${receipt.args.join(" ")} (cwd ${receipt.cwdRef})`,
          `Ran ${receipt.startedAt} → ${receipt.finishedAt} · ${current ? "matches the current repository state" : "does NOT match the current repository state (stale evidence)"}`,
          `Artifact: .voila/${receipt.artifactRef}/ (stdout.txt, stderr.txt, manifest.json)`,
        ];
        if (receipt.outputTruncated)
          lines.push("Stored output was truncated at the per-stream cap.");

        if (p.includeOutput === true) {
          const output = await readReceiptOutput(ctx.cwd, p.receiptId);
          const out = excerpt(output.stdout);
          const errText = excerpt(output.stderr);
          details.stdoutExcerpt = out.text;
          details.stderrExcerpt = errText.text;
          details.excerptTruncated = out.truncatedForDisplay || errText.truncatedForDisplay;
          lines.push(
            `stdout excerpt (${out.truncatedForDisplay ? "truncated for display" : "complete"}):`,
            out.text.trimEnd() || "(empty)",
            `stderr excerpt (${errText.truncatedForDisplay ? "truncated for display" : "complete"}):`,
            errText.text.trimEnd() || "(empty)",
          );
        }
        return text(lines.join("\n"), details);
      },
    },

    {
      name: "voila_complete_work_item",
      label: "Complete Work Item",
      description:
        "The ONLY way to mark a work item completed. Every gate must pass: the item is not cancelled/blocked and has no blocked reason, all dependencies are completed, acceptance criteria exist, required claims exist, every acceptance criterion is covered by a required claim, every required claim is supported by a current passing receipt, and no open high-impact risk is linked. A rejection reports ALL failing gates and changes nothing.",
      promptSnippet: "Complete a Voila work item through the protected, evidence-gated transition",
      promptGuidelines: [
        "Use voila_complete_work_item as the only way to complete work; if it rejects, fix the named gates rather than restating completion in prose.",
      ],
      parameters: Type.Object({ workItemId: Type.String() }, { additionalProperties: false }),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { workItemId: string };
        // Best-effort fingerprint: when git is unavailable no evidence can be current, so the
        // supported-claims gate fails with a clear reason instead of an opaque error.
        const fingerprint = await tryRepositoryFingerprint(ctx.cwd);
        let assessment: CompletionAssessment | undefined;
        const state = await updateState(
          ctx.cwd,
          (cur) => {
            const done = completeWorkItem(cur, p.workItemId, fingerprint, now());
            assessment = done.assessment;
            return done.state;
          },
          { type: "work_item_completed", id: p.workItemId },
        );
        const item = state.workItems.find((w) => w.id === p.workItemId);
        const lines = [
          `Completed ${p.workItemId}: ${item?.title}.`,
          `All ${assessment?.gates.length ?? 0} completion gates passed.`,
        ];
        if (state.focusWorkItemId === null) {
          lines.push("Focus was cleared; choose the next focus deliberately.");
        }
        return text(lines.join("\n"), { workItem: item, assessment });
      },
    },

    {
      name: "voila_get_proof",
      label: "Get Proof",
      description:
        "Read the proof picture: claim counts by derived status, per-claim evidence, and — for a work item — acceptance-criterion coverage plus every completion gate with its current pass/fail state. Read-only; returns no command output.",
      promptSnippet: "Read Voila proof status and completion gates",
      promptGuidelines: [
        "Use voila_get_proof before claiming work is done, to see which gates actually pass.",
      ],
      parameters: Type.Object(
        {
          workItemId: Type.Optional(
            Type.String({ description: "Include coverage and completion gates for this item" }),
          ),
        },
        { additionalProperties: false },
      ),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const p = params as { workItemId?: string };
        const overview = await loadProofOverview(ctx.cwd);
        const s = overview.summary;
        const lines = [
          `Claims: ${s.total} — ${s.supported} supported, ${s.unsupported} unsupported, ${s.stale} stale, ${s.pending} pending.`,
        ];
        if (!s.fingerprintAvailable) {
          lines.push(
            "The repository fingerprint is unavailable (no git), so nothing can be shown as current evidence.",
          );
        }
        const details: Record<string, unknown> = {
          summary: s,
          fingerprintAvailable: s.fingerprintAvailable,
          claims: overview.claims.map((r) => ({
            id: r.claim.id,
            workItemId: r.claim.workItemId,
            status: r.evaluation.status,
            required: r.required,
            statement: r.claim.statement,
            knownLimitations: r.claim.knownLimitations,
            latestReceiptId: r.evaluation.latestReceiptId ?? null,
          })),
        };

        if (p.workItemId !== undefined) {
          const item = overview.state.workItems.find((w) => w.id === p.workItemId);
          if (!item) {
            lines.push(`Work item not found: ${p.workItemId}.`);
          } else {
            const assessment = assessCompletion(overview.state, item.id, overview.fingerprint);
            const coverage = criterionCoverage(overview.state, item);
            details.workItem = { id: item.id, status: item.status, title: item.title };
            details.coverage = coverage;
            details.assessment = assessment;
            lines.push(
              `${item.id} [${item.status}] — completion ${assessment.ready ? "READY" : `BLOCKED by ${assessment.failing.length} gate(s)`}:`,
              ...assessment.gates.map(
                (g) => `  [${g.passed ? "pass" : "FAIL"}] ${g.label}: ${g.detail}`,
              ),
            );
          }
        }
        return text(lines.join("\n"), details);
      },
    },
  ];
}

/** Evaluate one claim without loading the whole overview (used by narrow callers and tests). */
export async function claimStatus(root: string, claimId: string) {
  const state = await loadState(root);
  const claim = findClaim(state, claimId);
  const fingerprint = await tryRepositoryFingerprint(root);
  return evaluateClaim(state, claim, fingerprint);
}
