// `/voila claims`, `/voila proof`, `/voila verify`, `/voila complete` logic. Pure of Pi.
//
// Display discipline: these commands never dump unbounded command output or raw JSON. A receipt shows
// curated metadata and points at its artifact directory; reading stdout is a deliberate act.

import { loadState } from "../state/store.ts";
import { loadProofOverview } from "../state/proof-store.ts";
import { readReceiptManifest, runVerification } from "../state/receipt-store.ts";
import { FingerprintUnavailableError } from "../state/fingerprint.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { VoilaStateError } from "../state/errors.ts";
import { updateState } from "../state/store.ts";
import {
  assessCompletion,
  completeWorkItem,
  CompletionRejectedError,
  criterionCoverage,
  verificationContractGroups,
  type ClaimEvaluationStatus,
} from "../domain/proof.ts";
import { deriveReadiness, readinessLine } from "../domain/readiness.ts";
import { abbreviate } from "../domain/status.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import { loadErrorResult } from "./loaderror.ts";
import type { CommandResult } from "./types.ts";

function operationError(error: unknown): CommandResult | null {
  if (error instanceof CompletionRejectedError) {
    return { level: "warning", lines: error.message.split("\n") };
  }
  if (
    error instanceof FingerprintUnavailableError ||
    error instanceof ProjectOperationError ||
    error instanceof VoilaStateError
  ) {
    return { level: "warning", lines: [error.message] };
  }
  return null;
}

const STATUS_MARK: Record<ClaimEvaluationStatus, string> = {
  supported: "supported",
  unsupported: "UNSUPPORTED",
  stale: "STALE",
  pending: "pending",
};

/** `/voila claims [CLM-n|NF-n]` — claims with derived evidence status. */
export async function runClaims(root: string, target?: string): Promise<CommandResult> {
  let overview;
  try {
    overview = await loadProofOverview(root);
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }

  if (target) {
    const row = overview.claims.find((r) => r.claim.id === target);
    if (row) {
      const c = row.claim;
      const lines = [
        `${c.id} — ${c.statement}`,
        `  work item:  ${c.workItemId}${row.workItem ? ` (${row.workItem.status}) ${row.workItem.title}` : " (missing!)"}`,
        `  evidence:   ${STATUS_MARK[row.evaluation.status]} — ${row.evaluation.reason}`,
        `  confidence: ${c.confidence}`,
        `  required:   ${row.required ? "yes (completion depends on it)" : "no"}`,
        "  covers:",
        ...c.coveredAcceptanceCriteria.map((x) => `    - ${x}`),
      ];
      if (c.knownLimitations.length > 0) {
        lines.push("  limitations:", ...c.knownLimitations.map((x) => `    - ${x}`));
      } else {
        lines.push("  limitations: (none recorded)");
      }
      lines.push(
        `  receipts:   ${c.receiptIds.length > 0 ? c.receiptIds.join(", ") : "none"}`,
        "",
        `Inspect a receipt with /voila proof <RCP-n>.`,
      );
      return { level: "info", lines, state: overview.state };
    }
    // Fall back to work-item scoping.
    const forItem = overview.claims.filter((r) => r.claim.workItemId === target);
    if (forItem.length === 0) {
      return { level: "warning", lines: [`No claim or claimed work item ${target}.`] };
    }
    return {
      level: "info",
      lines: [
        `Claims for ${target}:`,
        ...forItem.map(
          (r) =>
            `  ${r.claim.id} [${STATUS_MARK[r.evaluation.status]}]${r.required ? " (required)" : ""} ${r.claim.statement}`,
        ),
      ],
      state: overview.state,
    };
  }

  if (overview.claims.length === 0) {
    return {
      level: "info",
      lines: [
        "No claims yet. A work item cannot be completed until claims cover its acceptance criteria",
        "and are supported by passing verification receipts.",
      ],
      state: overview.state,
    };
  }

  const s = overview.summary;
  const lines = [
    `Claims — ${s.total} (supported ${s.supported} · unsupported ${s.unsupported} · stale ${s.stale} · pending ${s.pending})`,
  ];
  if (!s.fingerprintAvailable) {
    lines.push("git is unavailable, so no receipt can be shown as current evidence.");
  }
  for (const r of overview.claims) {
    lines.push(
      `  ${r.claim.id} [${STATUS_MARK[r.evaluation.status]}]${r.required ? " (required)" : ""} ${r.claim.workItemId}: ${r.claim.statement}`,
    );
    if (r.claim.knownLimitations.length > 0) {
      lines.push(`      limitations: ${r.claim.knownLimitations.join("; ")}`);
    }
  }
  return {
    level: s.unsupported > 0 || s.stale > 0 ? "warning" : "info",
    lines,
    state: overview.state,
  };
}

/** `/voila proof [NF-n|CLM-n|RCP-n]` — curated proof status. Never dumps stdout or raw JSON. */
export async function runProof(root: string, target?: string): Promise<CommandResult> {
  let overview;
  try {
    overview = await loadProofOverview(root);
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }
  const state = overview.state;

  if (target?.startsWith("RCP-")) {
    const receipt = state.receipts.find((r) => r.id === target);
    if (!receipt) return { level: "warning", lines: [`No receipt ${target}.`] };
    const current =
      overview.fingerprint !== null && overview.fingerprint === receipt.repositoryFingerprint;
    const lines = [
      `${receipt.id} — ${receipt.result}${receipt.exitCode !== undefined ? ` (exit ${receipt.exitCode})` : ""}`,
      `  claim:    ${receipt.claimId}`,
      `  command:  ${receipt.executable} ${receipt.args.join(" ")}`,
      `  cwd:      ${receipt.cwdRef} (no shell; structured argv)`,
      `  ran:      ${receipt.startedAt} → ${receipt.finishedAt}`,
      `  head:     ${receipt.gitHead ? receipt.gitHead.slice(0, 12) : "(none)"}`,
      `  evidence: ${current ? "matches the current repository state" : "does NOT match the current repository state (stale)"}`,
      `  output:   ${receipt.outputTruncated ? "TRUNCATED at the per-stream cap" : "stored in full (within cap)"}`,
      `  artifact: .voila/${receipt.artifactRef}/`,
    ];
    try {
      const manifest = await readReceiptManifest(root, receipt.id);
      lines.push(
        `  hashes:   stdout ${manifest.stdoutSha256.slice(0, 12)}… · stderr ${manifest.stderrSha256.slice(0, 12)}…`,
        `  duration: ${manifest.durationMs} ms (timeout ${manifest.timeoutMs} ms)`,
      );
    } catch {
      lines.push("  hashes:   manifest missing — run /voila doctor");
    }
    lines.push(
      "",
      `Full output is not shown here. Read .voila/${receipt.artifactRef}/stdout.txt deliberately if you need it.`,
    );
    return { level: current ? "info" : "warning", lines, state };
  }

  if (target?.startsWith("CLM-")) return runClaims(root, target);

  if (target?.startsWith("NF-")) {
    const item = state.workItems.find((w) => w.id === target);
    if (!item) return { level: "warning", lines: [`No work item ${target}.`] };
    const assessment = assessCompletion(state, item.id, overview.fingerprint);
    const readiness = deriveReadiness(state, item, overview.fingerprint);
    const coverage = criterionCoverage(state, item);
    const lines = [
      `Proof for ${item.id} [${item.status}] — ${item.title}`,
      `  completion: ${readiness.label}`,
      `              ${readiness.detail}`,
      // A held item's outstanding acceptance is shown in full: this is the surface with room for it.
      ...(readiness.kind === "held"
        ? [
            "  outstanding acceptance:",
            ...readiness.outstanding.map((o) => `    - ${o.claimId}: ${o.limitation}`),
          ]
        : []),
      "  acceptance criteria:",
      ...(coverage.length > 0
        ? coverage.map(
            (c) =>
              `    [${c.covered ? "covered" : "UNCOVERED"}] ${c.criterion}${c.claimIds.length ? ` (${c.claimIds.join(", ")})` : ""}`,
          )
        : ["    (none recorded)"]),
      "  gates:",
      ...assessment.gates.map((g) => `    [${g.passed ? "pass" : "FAIL"}] ${g.label}: ${g.detail}`),
    ];
    return { level: readiness.kind === "ready" ? "info" : "warning", lines, state };
  }

  const s = overview.summary;
  const lines = [
    `Proof — ${s.total} claim(s): supported ${s.supported} · unsupported ${s.unsupported} · stale ${s.stale} · pending ${s.pending}`,
    `Receipts: ${state.receipts.length}`,
  ];
  if (!s.fingerprintAvailable) {
    lines.push("git is unavailable, so no receipt can be shown as current evidence.");
  }
  const attention = overview.claims.filter((r) => r.evaluation.status !== "supported");
  if (attention.length > 0) {
    lines.push("Needs evidence:");
    for (const r of attention) {
      lines.push(`  ${r.claim.id} [${STATUS_MARK[r.evaluation.status]}] ${r.evaluation.reason}`);
    }
  }
  const gated = state.workItems.filter(
    (w) => w.requiredClaimIds.length > 0 && w.status !== "completed" && w.status !== "cancelled",
  );
  if (gated.length > 0) {
    lines.push("Work items with proof requirements:");
    for (const w of gated) {
      lines.push(`  ${readinessLine(w, deriveReadiness(state, w, overview.fingerprint))}`);
    }
  }
  // Verification-contract grouping: the seam R6 will use to run each unique command once. Voila still
  // executes one command per verification run today; this only reports what the grouping is.
  const contracts = verificationContractGroups(state);
  if (contracts.length > 0) {
    lines.push(
      `Verification contracts: ${contracts.length} unique across ${state.receipts.length} recorded execution(s)`,
    );
    for (const group of contracts.slice(0, 5)) {
      const command = abbreviate(`${group.executable} ${group.args.join(" ")}`, 80);
      lines.push(
        `  ${command} (cwd ${group.cwdRef}) — ${group.receiptIds.length} execution(s), serves ${group.claimIds.length} claim(s): ${group.claimIds.join(", ")}`,
      );
    }
    if (contracts.length > 5) lines.push(`  …and ${contracts.length - 5} more`);
  }
  lines.push("", "Detail: /voila proof <NF-n|CLM-n|RCP-n> · /voila claims · /voila complete NF-n");
  return { level: s.unsupported > 0 ? "warning" : "info", lines, state };
}

export interface ParsedVerify {
  claimId: string;
  executable: string;
  args: string[];
}

/**
 * Parse `verify CLM-n -- executable [args...]`. Only the FIRST `--` is the separator, so a command
 * containing its own `--` (e.g. `mise exec -- npm run verify`) survives intact.
 */
export function parseVerifyArgs(tokens: string[]): ParsedVerify | string {
  const claimId = tokens[0];
  if (!claimId) {
    return "Usage: /voila verify CLM-n -- executable [args...]";
  }
  const sep = tokens.indexOf("--", 1);
  if (sep < 0) {
    return `Usage: /voila verify ${claimId} -- executable [args...]  (the -- separator is required; Voila runs a program with an argument array, never a shell string)`;
  }
  const command = tokens.slice(sep + 1);
  const executable = command[0];
  if (!executable) {
    return "No executable given after --. Usage: /voila verify CLM-n -- executable [args...]";
  }
  return { claimId, executable, args: command.slice(1) };
}

/** `/voila verify CLM-n -- executable [args...]` — echo the exact structured command, then run it. */
export async function runVerify(root: string, tokens: string[]): Promise<CommandResult> {
  const parsed = parseVerifyArgs(tokens);
  if (typeof parsed === "string") return { level: "warning", lines: [parsed] };

  // Echo the exact structured command before execution: no shell, one program, explicit argv.
  const echo = [
    "Running verification (no shell, structured argv):",
    `  claim:      ${parsed.claimId}`,
    `  executable: ${parsed.executable}`,
    `  args:       ${parsed.args.length > 0 ? parsed.args.map((a) => JSON.stringify(a)).join(" ") : "(none)"}`,
    `  cwd:        . (repository root)`,
    "  note:       the command may have side effects; this is not a sandbox",
    "",
  ];

  try {
    const result = await runVerification(root, {
      claimId: parsed.claimId,
      executable: parsed.executable,
      args: parsed.args,
    });
    const r = result.receipt;
    const lines = [
      ...echo,
      `Recorded ${r.id}: ${r.result}${r.exitCode !== undefined ? ` (exit ${r.exitCode})` : ""}.`,
      `  artifact:    .voila/${r.artifactRef}/`,
      `  fingerprint: ${r.repositoryFingerprint.slice(0, 12)}…`,
      ...(r.outputTruncated ? ["  output:      TRUNCATED at the per-stream cap"] : []),
      "",
      result.passed
        ? `${parsed.claimId} is supported while the repository fingerprint matches. Recording a receipt is not the same as passing — this one passed.`
        : `${parsed.claimId} is NOT supported: the command did not pass. The receipt is valid evidence of that failure.`,
    ];
    return { level: result.passed ? "info" : "warning", lines };
  } catch (error) {
    const mapped = operationError(error);
    if (mapped) return { level: mapped.level, lines: [...echo, ...mapped.lines] };
    return loadErrorResult(error);
  }
}

/** `/voila complete NF-n` — the protected transition. Lists every failing gate on rejection. */
export async function runComplete(root: string, id?: string): Promise<CommandResult> {
  if (!id) {
    return { level: "warning", lines: ["Usage: /voila complete NF-n"] };
  }
  let fingerprint: string | null;
  try {
    await loadState(root);
    fingerprint = await tryRepositoryFingerprint(root);
  } catch (error) {
    return loadErrorResult(error);
  }

  try {
    const state = await updateState(
      root,
      (cur) => completeWorkItem(cur, id, fingerprint, new Date().toISOString()).state,
      { type: "work_item_completed", id },
    );
    const item = state.workItems.find((w) => w.id === id);
    const lines = [
      `Completed ${id} — ${item?.title}.`,
      "Every completion gate passed; the transition is recorded in canonical state and history.",
    ];
    if (state.focusWorkItemId === null) {
      lines.push("Focus was cleared. Choose the next focus deliberately with /voila focus <ID>.");
    }
    return { level: "info", lines, state };
  } catch (error) {
    return operationError(error) ?? loadErrorResult(error);
  }
}
