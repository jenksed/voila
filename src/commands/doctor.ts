// `/newfang doctor` logic. Read-only diagnostics; makes no repairs in this packet.

import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import { statePaths } from "../state/paths.ts";
import { loadState, stateExists } from "../state/store.ts";
import { renderStatusView } from "../domain/status.ts";

export type CheckLevel = "pass" | "warn" | "fail";

export interface DoctorCheck {
  name: string;
  level: CheckLevel;
  detail: string;
}

export interface DoctorInput {
  root: string;
  /** Version of the installed Pi package, or "unknown". */
  piVersion: string;
  /** Version NewFang pins/expects. */
  expectedPiVersion: string;
  /** e.g. process.version ("v22.23.1"). */
  nodeVersion: string;
  /** Minimum required Node, e.g. "22.19.0". */
  minNode: string;
}

/** Parse "v22.23.1" / "22.19.0" into [major, minor, patch]. */
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

/** Run all diagnostics and return the checks (unformatted). No repairs are performed. */
export async function runDoctor(input: DoctorInput): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const paths = statePaths(input.root);

  // Pinned Pi version.
  if (input.piVersion === "unknown") {
    checks.push({
      name: "pi version",
      level: "warn",
      detail: `could not determine installed Pi version (expected ${input.expectedPiVersion})`,
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
  if (gte(parseVersion(input.nodeVersion), parseVersion(input.minNode))) {
    checks.push({ name: "node version", level: "pass", detail: input.nodeVersion });
  } else {
    checks.push({
      name: "node version",
      level: "fail",
      detail: `${input.nodeVersion} is below required ${input.minNode}`,
    });
  }

  // Repository availability.
  checks.push(
    existsSync(join(input.root, ".git"))
      ? { name: "git repository", level: "pass", detail: "found .git" }
      : { name: "git repository", level: "warn", detail: "no .git in project root" },
  );

  // Project trust visibility (best-effort; Pi owns the real trust store).
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

  // Writable state directory (parent must be writable to create/update .newfang/).
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

  // NewFang state presence + schema validity + view consistency.
  if (!stateExists(input.root)) {
    checks.push({
      name: "newfang state",
      level: "warn",
      detail: "no .newfang/project.json — run /newfang init",
    });
    return checks;
  }

  checks.push({ name: "newfang state", level: "pass", detail: "project.json present" });

  try {
    const state = await loadState(input.root);
    checks.push({
      name: "schema valid",
      level: "pass",
      detail: `schemaVersion ${state.schemaVersion}`,
    });

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
  } catch (error) {
    checks.push({ name: "schema valid", level: "fail", detail: (error as Error).message });
  }

  return checks;
}

const LEVEL_MARK: Record<CheckLevel, string> = { pass: "PASS", warn: "WARN", fail: "FAIL" };

/** Format checks into display lines. */
export function formatDoctor(checks: DoctorCheck[]): string[] {
  const lines = ["NewFang doctor:"];
  for (const c of checks) {
    lines.push(`  [${LEVEL_MARK[c.level]}] ${c.name}: ${c.detail}`);
  }
  return lines;
}

/** Map the worst check level to a UI notify level. */
export function worstLevel(checks: DoctorCheck[]): "info" | "warning" | "error" {
  if (checks.some((c) => c.level === "fail")) return "error";
  if (checks.some((c) => c.level === "warn")) return "warning";
  return "info";
}
