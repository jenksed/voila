// Repository-orientation artifact model: a bounded, provenance-backed snapshot — not a permanent
// claim about the repository. Pure — no I/O.
//
// Safety: orientation artifacts must not contain secrets, environment-variable values, absolute
// private paths, or full command logs. Validation rejects absolute paths and home-dir references.

import { GENERATED_BANNER } from "./status.ts";
import { ProjectOperationError } from "./errors.ts";

export interface VerifiedCommand {
  /** e.g. "test", "typecheck" */
  purpose: string;
  command: string;
  /** How it was confirmed, e.g. "declared in package.json scripts" or "run successfully". */
  evidence: string;
}

export interface InstructionFile {
  /** Repository-relative path. */
  path: string;
  /** Short digest of the file's content used for staleness detection. */
  sha256: string;
  note?: string;
}

export interface OrientationArtifact {
  intakeStyleVersion: 1;
  purpose: string;
  branch?: string;
  head?: string;
  dirty?: boolean;
  dirtySummary?: string;
  instructionFiles: InstructionFile[];
  keyDocuments: string[];
  implementationAreas: string[];
  verifiedCommands: VerifiedCommand[];
  candidateCommands: string[];
  relevantWork: string[];
  risks: string[];
  unknowns: string[];
  observedAt: string;
  provenance: string[];
}

const ABSOLUTE_OR_HOME = /^(\/|~|[A-Za-z]:\\)/;
const SECRETISH = /(password|secret|api[_-]?key|token|BEGIN [A-Z ]*PRIVATE KEY)/i;

function requireNonEmpty(v: unknown, field: string): string {
  if (typeof v !== "string" || v.trim().length === 0) {
    throw new ProjectOperationError(`${field} is required and must be a non-empty string.`);
  }
  return v;
}

function requireRelativePathList(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new ProjectOperationError(`${field} must be an array of strings.`);
  }
  for (const p of v as string[]) {
    if (ABSOLUTE_OR_HOME.test(p)) {
      throw new ProjectOperationError(
        `${field} must contain repository-relative paths; got absolute or home path "${p}".`,
      );
    }
  }
  return v as string[];
}

function requireSafeStrings(v: unknown, field: string): string[] {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
    throw new ProjectOperationError(`${field} must be an array of strings.`);
  }
  for (const s of v as string[]) {
    if (SECRETISH.test(s)) {
      throw new ProjectOperationError(`${field} appears to contain sensitive data; refusing.`);
    }
  }
  return v as string[];
}

/** Validate an untrusted orientation snapshot. Throws with an actionable message. */
export function validateOrientationArtifact(raw: unknown): OrientationArtifact {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ProjectOperationError("Orientation must be an object.");
  }
  const o = raw as Record<string, unknown>;
  const purpose = requireNonEmpty(o.purpose, "purpose");
  if (SECRETISH.test(purpose)) {
    throw new ProjectOperationError("purpose appears to contain sensitive data; refusing.");
  }

  const instrRaw = o.instructionFiles;
  if (!Array.isArray(instrRaw)) {
    throw new ProjectOperationError("instructionFiles must be an array.");
  }
  const instructionFiles: InstructionFile[] = instrRaw.map((rawI, i) => {
    if (typeof rawI !== "object" || rawI === null) {
      throw new ProjectOperationError(`instructionFiles[${i}] must be an object.`);
    }
    const f = rawI as Record<string, unknown>;
    const path = requireNonEmpty(f.path, `instructionFiles[${i}].path`);
    if (ABSOLUTE_OR_HOME.test(path)) {
      throw new ProjectOperationError(
        `instructionFiles[${i}].path must be repository-relative; got "${path}".`,
      );
    }
    const sha256 = f.sha256;
    if (typeof sha256 !== "string" || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new ProjectOperationError(
        `instructionFiles[${i}].sha256 must be a sha-256 hex digest.`,
      );
    }
    const out: InstructionFile = { path, sha256 };
    if (f.note !== undefined) {
      if (typeof f.note !== "string") {
        throw new ProjectOperationError(`instructionFiles[${i}].note must be a string.`);
      }
      out.note = f.note;
    }
    return out;
  });

  const cmdRaw = o.verifiedCommands;
  if (cmdRaw !== undefined && !Array.isArray(cmdRaw)) {
    throw new ProjectOperationError("verifiedCommands must be an array.");
  }
  const verifiedCommands: VerifiedCommand[] = ((cmdRaw ?? []) as unknown[]).map((rawC, i) => {
    if (typeof rawC !== "object" || rawC === null) {
      throw new ProjectOperationError(`verifiedCommands[${i}] must be an object.`);
    }
    const c = rawC as Record<string, unknown>;
    const command = requireNonEmpty(c.command, `verifiedCommands[${i}].command`);
    if (SECRETISH.test(command)) {
      throw new ProjectOperationError(`verifiedCommands[${i}].command looks sensitive; refusing.`);
    }
    return {
      purpose: requireNonEmpty(c.purpose, `verifiedCommands[${i}].purpose`),
      command,
      evidence: requireNonEmpty(c.evidence, `verifiedCommands[${i}].evidence`),
    };
  });

  const artifact: OrientationArtifact = {
    intakeStyleVersion: 1,
    purpose,
    instructionFiles,
    keyDocuments: requireRelativePathList(o.keyDocuments ?? [], "keyDocuments"),
    implementationAreas: requireRelativePathList(
      o.implementationAreas ?? [],
      "implementationAreas",
    ),
    verifiedCommands,
    candidateCommands: requireSafeStrings(o.candidateCommands ?? [], "candidateCommands"),
    relevantWork: requireSafeStrings(o.relevantWork ?? [], "relevantWork"),
    risks: requireSafeStrings(o.risks ?? [], "risks"),
    unknowns: requireSafeStrings(o.unknowns ?? [], "unknowns"),
    observedAt: typeof o.observedAt === "string" ? o.observedAt : new Date().toISOString(),
    provenance: requireSafeStrings(o.provenance ?? [], "provenance"),
  };
  if (o.branch !== undefined) artifact.branch = requireNonEmpty(o.branch, "branch");
  if (o.head !== undefined) artifact.head = requireNonEmpty(o.head, "head");
  if (o.dirty !== undefined) {
    if (typeof o.dirty !== "boolean") throw new ProjectOperationError("dirty must be a boolean.");
    artifact.dirty = o.dirty;
  }
  if (o.dirtySummary !== undefined) {
    artifact.dirtySummary = requireNonEmpty(o.dirtySummary, "dirtySummary");
  }
  return artifact;
}

export interface StalenessInput {
  /** Current repository HEAD, when resolvable. */
  head?: string;
  /** Current sha-256 of each instruction file, keyed by repository-relative path. */
  instructionHashes?: Record<string, string>;
  /** Explicit user refresh request. */
  refreshRequested?: boolean;
}

export interface StalenessResult {
  stale: boolean;
  reasons: string[];
}

/**
 * Decide whether an orientation is stale. Deliberately ignores the dirty flag: a dirty worktree
 * alone does not invalidate orientation (and must not rewrite canonical state).
 */
export function evaluateStaleness(
  artifact: OrientationArtifact,
  input: StalenessInput,
): StalenessResult {
  const reasons: string[] = [];
  if (input.refreshRequested) reasons.push("refresh requested");
  if (artifact.head && input.head && artifact.head !== input.head) {
    reasons.push(`HEAD moved (${artifact.head.slice(0, 8)} -> ${input.head.slice(0, 8)})`);
  }
  if (input.instructionHashes) {
    for (const f of artifact.instructionFiles) {
      const current = input.instructionHashes[f.path];
      if (current !== undefined && current !== f.sha256) {
        reasons.push(`${f.path} changed`);
      }
    }
  }
  return { stale: reasons.length > 0, reasons };
}

export function renderOrientationView(id: string, a: OrientationArtifact): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`) : ["_(none)_"]);
  return [
    GENERATED_BANNER,
    "",
    `# Repository Orientation — ${id}`,
    "",
    "_Generated by NewFang from the recorded snapshot. A bounded observation, not a permanent claim._",
    "",
    `- **Observed at**: ${a.observedAt}`,
    ...(a.branch ? [`- **Branch**: ${a.branch}`] : []),
    ...(a.head ? [`- **HEAD**: \`${a.head.slice(0, 12)}\``] : []),
    ...(a.dirty !== undefined
      ? [
          `- **Worktree**: ${a.dirty ? "dirty" : "clean"}${a.dirtySummary ? ` (${a.dirtySummary})` : ""}`,
        ]
      : []),
    "",
    "## Purpose",
    "",
    a.purpose,
    "",
    "## Instruction files",
    "",
    ...(a.instructionFiles.length
      ? a.instructionFiles.map(
          (f) =>
            `- \`${f.path}\` (sha \`${f.sha256.slice(0, 12)}…\`)${f.note ? ` — ${f.note}` : ""}`,
        )
      : ["_(none)_"]),
    "",
    "## Key documents",
    "",
    ...list(a.keyDocuments.map((d) => `\`${d}\``)),
    "",
    "## Likely implementation areas",
    "",
    ...list(a.implementationAreas.map((d) => `\`${d}\``)),
    "",
    "## Verified commands",
    "",
    ...(a.verifiedCommands.length
      ? a.verifiedCommands.map((c) => `- **${c.purpose}**: \`${c.command}\` — ${c.evidence}`)
      : ["_(none)_"]),
    "",
    "## Candidate commands (not yet verified)",
    "",
    ...list(a.candidateCommands.map((c) => `\`${c}\``)),
    "",
    "## Relevant current work",
    "",
    ...list(a.relevantWork),
    "",
    "## Risks",
    "",
    ...list(a.risks),
    "",
    "## Unknowns",
    "",
    ...list(a.unknowns),
    "",
    "## Provenance",
    "",
    ...list(a.provenance),
    "",
  ].join("\n");
}
