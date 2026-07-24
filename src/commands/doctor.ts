// `/newfang doctor` logic. Read-only diagnostics; makes no repairs or migrations.

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { statePaths } from "../state/paths.ts";
import { loadState, readRawState } from "../state/store.ts";
import { StateNotFoundError, StateValidationError } from "../state/errors.ts";
import { renderStatusView } from "../domain/status.ts";
import { detectCycle } from "../domain/operations.ts";
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
  if (state.activeWorkItemId === null) {
    checks.push({ name: "active work item", level: "pass", detail: "none selected" });
  } else {
    const active = state.workItems.find((w) => w.id === state.activeWorkItemId);
    if (!active) {
      checks.push({
        name: "active work item",
        level: "fail",
        detail: `activeWorkItemId ${state.activeWorkItemId} does not exist`,
      });
    } else if (active.status === "completed" || active.status === "cancelled") {
      checks.push({
        name: "active work item",
        level: "warn",
        detail: `active ${active.id} is ${active.status}`,
      });
    } else {
      checks.push({ name: "active work item", level: "pass", detail: active.id });
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

  if (raw.version === 1) {
    checks.push({
      name: "schema migration",
      level: "warn",
      detail: "v1 state; run /newfang migrate --apply",
    });
    return checks;
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
    checks.push({ name: "canonical state valid", level: "pass", detail: "schema-valid v2" });
  } catch (error) {
    checks.push({ name: "canonical state valid", level: "fail", detail: (error as Error).message });
    return checks;
  }

  checks.push(...stateIntegrityChecks(state));

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
