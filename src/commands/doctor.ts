// `/newfang doctor` logic. Read-only diagnostics; makes no repairs or migrations.

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { intakePaths, statePaths } from "../state/paths.ts";
import {
  listDraftRevisions,
  readDraft,
  readManifest,
  readReviews,
  readUnderstanding,
} from "../state/intake-store.ts";
import { currentOrientationStatus } from "../state/orientation-store.ts";
import {
  leftoverReceiptTempDirs,
  readReceiptManifest,
  readReceiptOutput,
} from "../state/receipt-store.ts";
import { receiptPaths } from "../state/paths.ts";
import { tryRepositoryFingerprint } from "../state/fingerprint.ts";
import { assessCompletion, criterionCoverage, evaluateClaim } from "../domain/proof.ts";
import { sha256 } from "../state/source.ts";
import { loadState, readRawState } from "../state/store.ts";
import { StateNotFoundError, StateValidationError } from "../state/errors.ts";
import { renderStatusView } from "../domain/status.ts";
import { detectCycle } from "../domain/operations.ts";
import { migrationPlan } from "../domain/migrate.ts";
import { ID_PREFIXES } from "../domain/ids.ts";
import { SCHEMA_VERSION } from "../domain/types.ts";
import type { ProjectState, Sequences } from "../domain/types.ts";

export type CheckLevel = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  level: CheckLevel;
  detail: string;
}

export interface DoctorInput {
  root: string;
  piVersion: string;
  expectedPiVersion: string;
  nodeVersion: string;
  minNode: string;
}

function parseVersion(v: string): [number, number, number] {
  const m = v.trim().replace(/^v/, "").split(".");
  return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)];
}

function gte(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return true;
}

async function isWritable(dir: string): Promise<boolean> {
  const probe = join(dir, `.newfang-doctor-${randomBytes(4).toString("hex")}.tmp`);
  try {
    await writeFile(probe, "ok", "utf8");
    await rm(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

function idNumber(id: string): number {
  return Number(id.split("-").pop());
}

function maxIdNumber(ids: string[]): number {
  return ids.reduce((m, id) => Math.max(m, idNumber(id) || 0), 0);
}

/** Deeper checks over a validated v2 state. */
function stateIntegrityChecks(state: ProjectState): DoctorCheck[] {
  const checks: DoctorCheck[] = [];
  const workIds = new Set(state.workItems.map((w) => w.id));

  // ID counter consistency: each sequence must exceed the max used number in its collection.
  const seqSpecs: Array<[keyof Sequences, string[]]> = [
    ["workItem", state.workItems.map((w) => w.id)],
    ["decision", state.decisions.map((d) => d.id)],
    ["assumption", state.assumptions.map((a) => a.id)],
    ["risk", state.risks.map((r) => r.id)],
    ["claim", state.claims.map((c) => c.id)],
    ["receipt", state.receipts.map((r) => r.id)],
  ];
  const seqProblems: string[] = [];
  for (const [key, ids] of seqSpecs) {
    const max = maxIdNumber(ids);
    if (state.sequences[key] <= max) {
      seqProblems.push(`${ID_PREFIXES[key]} next=${state.sequences[key]} <= max used ${max}`);
    }
  }
  checks.push(
    seqProblems.length === 0
      ? { name: "id counter consistency", level: "pass", detail: "sequences ahead of all used IDs" }
      : { name: "id counter consistency", level: "fail", detail: seqProblems.join("; ") },
  );

  // References to missing work items (dependencies + risk links).
  const missing: string[] = [];
  for (const w of state.workItems) {
    for (const dep of w.dependsOn) if (!workIds.has(dep)) missing.push(`${w.id}->${dep}`);
  }
  for (const r of state.risks) {
    for (const l of r.linkedWorkItems ?? []) if (!workIds.has(l)) missing.push(`${r.id}->${l}`);
  }
  checks.push(
    missing.length === 0
      ? { name: "work-item references", level: "pass", detail: "all references resolve" }
      : { name: "work-item references", level: "fail", detail: `missing: ${missing.join(", ")}` },
  );

  // Dependency cycles.
  const cycle = detectCycle(state.workItems);
  checks.push(
    cycle === null
      ? { name: "dependency cycles", level: "pass", detail: "none" }
      : { name: "dependency cycles", level: "fail", detail: cycle.join(" -> ") },
  );

  // Active work-item reference.
  if (state.focusWorkItemId === null) {
    checks.push({ name: "focus work item", level: "pass", detail: "none selected" });
  } else {
    const active = state.workItems.find((w) => w.id === state.focusWorkItemId);
    if (!active) {
      checks.push({
        name: "focus work item",
        level: "fail",
        detail: `focusWorkItemId ${state.focusWorkItemId} does not exist`,
      });
    } else if (active.status === "completed" || active.status === "cancelled") {
      checks.push({
        name: "focus work item",
        level: "warn",
        detail: `focus ${active.id} is ${active.status}`,
      });
    } else {
      checks.push({ name: "focus work item", level: "pass", detail: active.id });
    }
  }

  return checks;
}

export async function runDoctor(input: DoctorInput): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const paths = statePaths(input.root);

  // Pinned Pi version.
  if (input.piVersion === "unknown") {
    checks.push({
      name: "pi version",
      level: "warn",
      detail: `could not determine (expected ${input.expectedPiVersion})`,
    });
  } else if (input.piVersion === input.expectedPiVersion) {
    checks.push({ name: "pi version", level: "pass", detail: input.piVersion });
  } else {
    checks.push({
      name: "pi version",
      level: "warn",
      detail: `installed ${input.piVersion}, pinned ${input.expectedPiVersion}`,
    });
  }

  // Node version.
  checks.push(
    gte(parseVersion(input.nodeVersion), parseVersion(input.minNode))
      ? { name: "node version", level: "pass", detail: input.nodeVersion }
      : {
          name: "node version",
          level: "fail",
          detail: `${input.nodeVersion} below required ${input.minNode}`,
        },
  );

  // Repository availability.
  checks.push(
    existsSync(join(input.root, ".git"))
      ? { name: "git repository", level: "pass", detail: "found .git" }
      : { name: "git repository", level: "warn", detail: "no .git in project root" },
  );

  // Project trust visibility.
  try {
    const trustFile = join(homedir(), ".pi", "agent", "trust.json");
    checks.push(
      existsSync(trustFile)
        ? { name: "project trust", level: "pass", detail: "Pi trust store present" }
        : { name: "project trust", level: "warn", detail: "no Pi trust store yet (first run?)" },
    );
  } catch {
    checks.push({ name: "project trust", level: "warn", detail: "trust store not visible" });
  }

  // Writable state directory.
  const writeTarget = existsSync(paths.dir) ? paths.dir : input.root;
  checks.push(
    (await isWritable(writeTarget))
      ? { name: "state directory writable", level: "pass", detail: writeTarget }
      : {
          name: "state directory writable",
          level: "fail",
          detail: `cannot write in ${writeTarget}`,
        },
  );

  // State presence + schema/migration + integrity.
  let raw;
  try {
    raw = await readRawState(input.root);
  } catch (error) {
    if (error instanceof StateNotFoundError) {
      checks.push({
        name: "newfang state",
        level: "warn",
        detail: "no .newfang/project.json — run /newfang init",
      });
      return checks;
    }
    if (error instanceof StateValidationError) {
      checks.push({
        name: "canonical state valid",
        level: "fail",
        detail: (error as Error).message,
      });
      return checks;
    }
    throw error;
  }

  checks.push({ name: "newfang state", level: "pass", detail: "project.json present" });

  // Any older version with a known migration path is a WARN with an actionable instruction.
  if (typeof raw.version === "number" && raw.version !== SCHEMA_VERSION) {
    if (migrationPlan(raw.version) !== null) {
      checks.push({
        name: "schema migration",
        level: "warn",
        detail: `v${raw.version} state; migration to v${SCHEMA_VERSION} is required — run /newfang migrate --apply`,
      });
      return checks;
    }
  }
  if (raw.version !== SCHEMA_VERSION) {
    checks.push({
      name: "schema migration",
      level: "fail",
      detail: `unknown schema version ${String(raw.version)}`,
    });
    return checks;
  }
  checks.push({ name: "schema migration", level: "pass", detail: `at v${SCHEMA_VERSION}` });

  let state: ProjectState;
  try {
    state = await loadState(input.root);
    checks.push({
      name: "canonical state valid",
      level: "pass",
      detail: `schema-valid v${SCHEMA_VERSION}`,
    });
  } catch (error) {
    checks.push({ name: "canonical state valid", level: "fail", detail: (error as Error).message });
    return checks;
  }

  checks.push(...stateIntegrityChecks(state));
  checks.push(...(await intakeChecks(input.root, state)));
  checks.push(...(await orientationChecks(input.root, state)));
  checks.push(...(await proofChecks(input.root, state)));

  // Project brief presence.
  checks.push(
    existsSync(paths.projectBrief)
      ? { name: "project brief", level: "pass", detail: "briefs/PROJECT_BRIEF.md present" }
      : {
          name: "project brief",
          level: state.intakes.some((i) => i.status === "accepted") ? "warn" : "pass",
          detail: existsSync(paths.projectBrief) ? "present" : "not generated yet",
        },
  );

  // Generated-view consistency.
  if (existsSync(paths.statusView)) {
    const onDisk = await readFile(paths.statusView, "utf8");
    checks.push(
      onDisk === renderStatusView(state)
        ? { name: "generated view", level: "pass", detail: "PROJECT_STATUS.md matches state" }
        : { name: "generated view", level: "warn", detail: "PROJECT_STATUS.md is stale" },
    );
  } else {
    checks.push({ name: "generated view", level: "warn", detail: "PROJECT_STATUS.md missing" });
  }

  return checks;
}

const LEVEL_MARK: Record<CheckLevel, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };

export function formatDoctor(checks: DoctorCheck[]): string[] {
  const lines = ["NewFang doctor:"];
  for (const c of checks) lines.push(`  [${LEVEL_MARK[c.level]}] ${c.name}: ${c.detail}`);
  return lines;
}

export function worstLevel(checks: DoctorCheck[]): "info" | "warning" | "error" {
  if (checks.some((c) => c.level === "fail")) return "error";
  if (checks.some((c) => c.level === "warn")) return "warning";
  return "info";
}

/**
 * Proof integrity: claim/receipt references, criterion coverage, artifact presence, manifest/canonical
 * agreement, output hashes, staleness, and leftover staging directories.
 *
 * Read-only and non-destructive. In particular, a completed work item whose CURRENT evidence no longer
 * satisfies its gates is reported as a WARNING — completed work is never silently reverted.
 */
async function proofChecks(root: string, state: ProjectState): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];

  const leftovers = await leftoverReceiptTempDirs(root);
  if (leftovers.length > 0) {
    checks.push({
      name: "receipt staging directories",
      level: "warn",
      detail: `${leftovers.length} leftover temp dir(s) under .newfang/receipts/.tmp/ from an interrupted run (${leftovers.join(", ")}); safe to delete`,
    });
  }

  if (state.claims.length === 0 && state.receipts.length === 0) {
    checks.push({
      name: "proof",
      level: "warn",
      detail: "no claims or receipts recorded; no work item can be completed yet",
    });
    return checks;
  }

  const workIds = new Set(state.workItems.map((w) => w.id));
  const claimIds = new Set(state.claims.map((c) => c.id));
  const receiptIds = new Set(state.receipts.map((r) => r.id));

  // --- Reference integrity ---
  const refProblems: string[] = [];
  for (const claim of state.claims) {
    if (!workIds.has(claim.workItemId)) {
      refProblems.push(`${claim.id} references missing work item ${claim.workItemId}`);
    }
    for (const rid of claim.receiptIds) {
      if (!receiptIds.has(rid)) {
        refProblems.push(`${claim.id} links missing receipt ${rid}`);
        continue;
      }
      const receipt = state.receipts.find((r) => r.id === rid);
      if (receipt && receipt.claimId !== claim.id) {
        refProblems.push(`${claim.id} links ${rid}, which belongs to ${receipt.claimId}`);
      }
    }
  }
  for (const receipt of state.receipts) {
    if (!claimIds.has(receipt.claimId)) {
      refProblems.push(`${receipt.id} references missing claim ${receipt.claimId}`);
      continue;
    }
    const claim = state.claims.find((c) => c.id === receipt.claimId);
    if (claim && !claim.receiptIds.includes(receipt.id)) {
      refProblems.push(`${receipt.id} is not linked from its claim ${receipt.claimId}`);
    }
  }
  for (const item of state.workItems) {
    for (const cid of item.requiredClaimIds) {
      if (!claimIds.has(cid)) {
        refProblems.push(`${item.id} requires missing claim ${cid}`);
        continue;
      }
      const claim = state.claims.find((c) => c.id === cid);
      if (claim && claim.workItemId !== item.id) {
        refProblems.push(`${item.id} requires ${cid}, which is about ${claim.workItemId}`);
      }
    }
  }
  checks.push(
    refProblems.length === 0
      ? {
          name: "proof references",
          level: "pass",
          detail: "claims, receipts, and requirements resolve",
        }
      : { name: "proof references", level: "fail", detail: refProblems.join("; ") },
  );

  // --- Claim/work-item criterion agreement ---
  const mismatches: string[] = [];
  for (const claim of state.claims) {
    const item = state.workItems.find((w) => w.id === claim.workItemId);
    if (!item) continue;
    const known = new Set(item.acceptanceCriteria);
    for (const criterion of claim.coveredAcceptanceCriteria) {
      if (!known.has(criterion)) {
        mismatches.push(
          `${claim.id} covers a criterion ${item.id} no longer states: "${abbreviateDetail(criterion)}"`,
        );
      }
    }
  }
  checks.push(
    mismatches.length === 0
      ? {
          name: "claim criterion agreement",
          level: "pass",
          detail: "covered criteria match work items",
        }
      : { name: "claim criterion agreement", level: "fail", detail: mismatches.join("; ") },
  );

  // --- Uncovered acceptance criteria on gated items ---
  const uncovered: string[] = [];
  for (const item of state.workItems) {
    if (item.requiredClaimIds.length === 0) continue;
    const missing = criterionCoverage(state, item).filter((c) => !c.covered);
    if (missing.length > 0) {
      uncovered.push(`${item.id}: ${missing.length} uncovered criterion(s)`);
    }
  }
  if (uncovered.length > 0) {
    checks.push({
      name: "acceptance criterion coverage",
      level: "warn",
      detail: uncovered.join("; "),
    });
  } else if (state.workItems.some((w) => w.requiredClaimIds.length > 0)) {
    checks.push({
      name: "acceptance criterion coverage",
      level: "pass",
      detail: "every gated item's criteria are covered",
    });
  }

  // --- Artifacts, manifest agreement, and output hashes ---
  const artifactProblems: string[] = [];
  const hashProblems: string[] = [];
  for (const receipt of state.receipts) {
    const paths = receiptPaths(root, receipt.id);
    if (!existsSync(paths.dir)) {
      artifactProblems.push(`${receipt.id}: artifact directory missing`);
      continue;
    }
    if (!existsSync(paths.stdout) || !existsSync(paths.stderr)) {
      artifactProblems.push(`${receipt.id}: stdout.txt or stderr.txt missing`);
    }
    if (receipt.artifactRef !== paths.artifactRef) {
      artifactProblems.push(
        `${receipt.id}: artifactRef ${receipt.artifactRef} disagrees with ${paths.artifactRef}`,
      );
    }
    let manifest;
    try {
      manifest = await readReceiptManifest(root, receipt.id);
    } catch {
      artifactProblems.push(`${receipt.id}: manifest.json missing or unreadable`);
      continue;
    }
    const disagreements: string[] = [];
    if (manifest.receiptId !== receipt.id) disagreements.push("receiptId");
    if (manifest.claimId !== receipt.claimId) disagreements.push("claimId");
    if (manifest.result !== receipt.result) disagreements.push("result");
    if (manifest.executable !== receipt.executable) disagreements.push("executable");
    if (manifest.args.join(" ") !== receipt.args.join(" ")) disagreements.push("args");
    if (manifest.cwdRef !== receipt.cwdRef) disagreements.push("cwdRef");
    if (manifest.repositoryFingerprint !== receipt.repositoryFingerprint) {
      disagreements.push("repositoryFingerprint");
    }
    if (manifest.startedAt !== receipt.startedAt) disagreements.push("startedAt");
    if (manifest.finishedAt !== receipt.finishedAt) disagreements.push("finishedAt");
    if (manifest.outputTruncated !== receipt.outputTruncated) disagreements.push("outputTruncated");
    if ((manifest.exitCode ?? undefined) !== receipt.exitCode) disagreements.push("exitCode");
    if (disagreements.length > 0) {
      artifactProblems.push(
        `${receipt.id}: manifest disagrees with canonical metadata (${disagreements.join(", ")})`,
      );
    }
    try {
      const output = await readReceiptOutput(root, receipt.id);
      if (sha256(output.stdout) !== manifest.stdoutSha256) {
        hashProblems.push(`${receipt.id}: stdout.txt hash mismatch (artifact modified?)`);
      }
      if (sha256(output.stderr) !== manifest.stderrSha256) {
        hashProblems.push(`${receipt.id}: stderr.txt hash mismatch (artifact modified?)`);
      }
    } catch {
      // absence already reported above
    }
  }
  checks.push(
    artifactProblems.length === 0
      ? {
          name: "receipt artifacts",
          level: "pass",
          detail: `${state.receipts.length} receipt(s) present and consistent with canonical metadata`,
        }
      : { name: "receipt artifacts", level: "fail", detail: artifactProblems.join("; ") },
  );
  checks.push(
    hashProblems.length === 0
      ? {
          name: "receipt output hashes",
          level: "pass",
          detail: "stored output matches its manifest hashes",
        }
      : { name: "receipt output hashes", level: "fail", detail: hashProblems.join("; ") },
  );

  // --- Freshness (read-only; the fingerprint is never persisted) ---
  const fingerprint = await tryRepositoryFingerprint(root);
  if (fingerprint === null) {
    checks.push({
      name: "evidence freshness",
      level: "warn",
      detail: "git unavailable, so no receipt can be shown as current evidence",
    });
  } else {
    const notCurrent = state.claims
      .map((c) => evaluateClaim(state, c, fingerprint))
      .filter((e) => e.status === "stale" || e.status === "unsupported");
    checks.push(
      notCurrent.length === 0
        ? {
            name: "evidence freshness",
            level: "pass",
            detail: `${state.claims.length} claim(s): none stale or unsupported`,
          }
        : {
            name: "evidence freshness",
            level: "warn",
            detail: notCurrent.map((e) => `${e.claimId} is ${e.status}`).join("; "),
          },
    );
  }

  // --- Completed work whose CURRENT proof no longer revalidates ---
  const revalidation: string[] = [];
  for (const item of state.workItems) {
    if (item.status !== "completed") continue;
    // Re-assess ignoring the "not already completed" gate, which necessarily fails for completed work.
    const assessment = assessCompletion(state, item.id, fingerprint);
    const relevant = assessment.failing.filter((g) => g.id !== "not_completed");
    if (relevant.length > 0) {
      revalidation.push(`${item.id}: ${relevant.map((g) => g.label).join(", ")}`);
    }
  }
  if (revalidation.length > 0) {
    checks.push({
      name: "completed work revalidation",
      level: "warn",
      detail: `current evidence no longer supports revalidating: ${revalidation.join("; ")}. The completion record stands; re-run verification to restore current evidence.`,
    });
  } else if (state.workItems.some((w) => w.status === "completed")) {
    checks.push({
      name: "completed work revalidation",
      level: "pass",
      detail: "completed items would still pass their gates",
    });
  }

  return checks;
}

function abbreviateDetail(value: string): string {
  return value.length <= 60 ? value : `${value.slice(0, 59)}…`;
}

/** Intake metadata/artifact consistency: hashes, drafts, views, apply events, current pointer. */
async function intakeChecks(root: string, state: ProjectState): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  if (state.intakes.length === 0) {
    if (state.currentIntakeId) {
      checks.push({
        name: "intake reference",
        level: "fail",
        detail: `currentIntakeId ${state.currentIntakeId} but no intakes exist`,
      });
    }
    return checks;
  }

  if (state.currentIntakeId && !state.intakes.some((i) => i.id === state.currentIntakeId)) {
    checks.push({
      name: "intake reference",
      level: "fail",
      detail: `currentIntakeId ${state.currentIntakeId} does not exist`,
    });
  } else {
    checks.push({
      name: "intake reference",
      level: "pass",
      detail: state.currentIntakeId ?? "none",
    });
  }

  const problems: string[] = [];
  const warnings: string[] = [];
  for (const record of state.intakes) {
    const paths = intakePaths(root, record.id);
    if (!existsSync(paths.source)) {
      problems.push(`${record.id}: preserved source missing`);
      continue;
    }
    // Source hash consistency: the preserved bytes must still match the recorded digest.
    try {
      const content = await readFile(paths.source, "utf8");
      if (sha256(content) !== record.sourceSha256) {
        problems.push(`${record.id}: source hash mismatch (artifact modified?)`);
      }
    } catch {
      problems.push(`${record.id}: source unreadable`);
    }
    try {
      const manifest = await readManifest(root, record.id);
      if (manifest.sourceSha256 !== record.sourceSha256) {
        problems.push(`${record.id}: manifest hash disagrees with canonical metadata`);
      }
    } catch {
      warnings.push(`${record.id}: manifest missing`);
    }
    if (record.draftRevision > 0) {
      // The current revision's draft artifact must exist and agree with canonical metadata.
      const draft = await readDraft(root, record.id, record.draftRevision);
      if (!draft) {
        problems.push(
          `${record.id}: draft artifact missing for current revision ${record.draftRevision}`,
        );
      } else if (draft.draftRevision !== record.draftRevision) {
        problems.push(
          `${record.id}: draft artifact says revision ${draft.draftRevision}, canonical says ${record.draftRevision}`,
        );
      }

      // Revisions must be monotonic 1..N with no gaps; each needs an understanding artifact.
      const revisions = await listDraftRevisions(root, record.id);
      const expected = Array.from({ length: record.draftRevision }, (_, i) => i + 1);
      if (revisions.join(",") !== expected.join(",")) {
        problems.push(
          `${record.id}: draft revisions are not monotonic 1..${record.draftRevision} (found ${revisions.join(",") || "none"})`,
        );
      }
      for (const rev of revisions) {
        if ((await readUnderstanding(root, record.id, rev)) === null) {
          warnings.push(`${record.id}: understanding artifact missing for revision ${rev}`);
        }
      }

      // The manifest pointer must agree with canonical metadata.
      try {
        const manifest = await readManifest(root, record.id);
        if (manifest.currentDraftRevision !== record.draftRevision) {
          problems.push(
            `${record.id}: manifest currentDraftRevision ${manifest.currentDraftRevision} disagrees with canonical ${record.draftRevision}`,
          );
        }
      } catch {
        // manifest absence is already reported above
      }
    }

    // Accepted intakes need an accepted review record and a matching applied revision.
    if (record.status === "accepted") {
      const reviews = await readReviews(root, record.id);
      const accepted = reviews.filter((r) => r.action === "accepted");
      if (accepted.length === 0) {
        problems.push(`${record.id}: accepted but no accepted review record in reviews.jsonl`);
      }
      if (record.acceptedDraftRevision === undefined) {
        problems.push(`${record.id}: accepted but acceptedDraftRevision is not recorded`);
      } else if (
        accepted.length > 0 &&
        !accepted.some((r) => r.reviewedRevision === record.acceptedDraftRevision)
      ) {
        problems.push(
          `${record.id}: applied revision ${record.acceptedDraftRevision} does not match any accepted review record`,
        );
      }
    }
  }

  checks.push(
    problems.length === 0
      ? {
          name: "intake artifacts",
          level: "pass",
          detail: `${state.intakes.length} intake(s) consistent`,
        }
      : { name: "intake artifacts", level: "fail", detail: problems.join("; ") },
  );
  if (warnings.length > 0) {
    checks.push({ name: "intake artifact views", level: "warn", detail: warnings.join("; ") });
  }

  // Accepted intakes must have a corresponding apply event in history.
  const accepted = state.intakes.filter((i) => i.status === "accepted");
  if (accepted.length > 0) {
    let events = "";
    try {
      events = await readFile(statePaths(root).eventsJsonl, "utf8");
    } catch {
      // history unreadable; reported below
    }
    const missing = accepted.filter(
      (i) => !events.includes('"intake_applied"') || !events.includes(`"${i.id}"`),
    );
    checks.push(
      missing.length === 0
        ? {
            name: "intake apply events",
            level: "pass",
            detail: `${accepted.length} accepted intake(s) recorded`,
          }
        : {
            name: "intake apply events",
            level: "warn",
            detail: `accepted without an apply event: ${missing.map((i) => i.id).join(", ")}`,
          },
    );
  }

  return checks;
}

/** Orientation reference validity and staleness (read-only; never re-orients). */
async function orientationChecks(root: string, state: ProjectState): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  if (!state.currentOrientationId) {
    checks.push({
      name: "orientation",
      level: state.orientations.length > 0 ? "warn" : "warn",
      detail: "no current orientation recorded",
    });
    return checks;
  }
  if (!state.orientations.some((o) => o.id === state.currentOrientationId)) {
    checks.push({
      name: "orientation reference",
      level: "fail",
      detail: `currentOrientationId ${state.currentOrientationId} does not exist`,
    });
    return checks;
  }
  const status = await currentOrientationStatus(root, state);
  if (!status.artifact) {
    checks.push({
      name: "orientation artifact",
      level: "fail",
      detail: "orientation artifact missing",
    });
    return checks;
  }
  checks.push(
    status.staleness.stale
      ? {
          name: "orientation freshness",
          level: "warn",
          detail: `${state.currentOrientationId} is stale: ${status.staleness.reasons.join("; ")}`,
        }
      : {
          name: "orientation freshness",
          level: "pass",
          detail: `${state.currentOrientationId} current`,
        },
  );
  return checks;
}
