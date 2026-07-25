// Repository-orientation artifact model: a bounded, provenance-backed snapshot — not a permanent
// claim about the repository. Pure — no I/O.
//
// Safety: orientation artifacts must not contain secrets, environment-variable values, absolute
// private paths, or full command logs. Validation rejects absolute paths and home-dir references.

import { GENERATED_BANNER } from "./status.ts";
import { ProjectOperationError } from "./errors.ts";

export const COMMAND_BASES = [
  "declared_in_documentation",
  "observed_in_session",
  "candidate",
] as const;
export type CommandBasis = (typeof COMMAND_BASES)[number];

/**
 * A command recorded during orientation, with an honest basis for believing it.
 *
 * NewFang does NOT run or formally verify these. `observed_in_session` means the operator or agent
 * actually executed it during this orientation session — that is an observation, not a NewFang
 * verification receipt. Formal verification begins only when Phase 4 receipts exist, so nothing here
 * (or in any generated view) may describe a command as "verified".
 */
export interface CommandFinding {
  command: string;
  basis: CommandBasis;
  /** Only permitted with `observed_in_session`. */
  observedResult?: "passed" | "failed";
  /** Provenance: which document/manifest declared it, or how it was observed. */
  evidenceNote?: string;
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
  /** Commands with an explicit basis. Never described as "verified". */
  commands: CommandFinding[];
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

  const cmdRaw = o.commands;
  if (cmdRaw !== undefined && !Array.isArray(cmdRaw)) {
    throw new ProjectOperationError("commands must be an array.");
  }
  const commands: CommandFinding[] = ((cmdRaw ?? []) as unknown[]).map((rawC, i) => {
    if (typeof rawC !== "object" || rawC === null) {
      throw new ProjectOperationError(`commands[${i}] must be an object.`);
    }
    const c = rawC as Record<string, unknown>;
    const command = requireNonEmpty(c.command, `commands[${i}].command`);
    if (SECRETISH.test(command)) {
      throw new ProjectOperationError(`commands[${i}].command looks sensitive; refusing.`);
    }
    if (typeof c.basis !== "string" || !(COMMAND_BASES as readonly string[]).includes(c.basis)) {
      throw new ProjectOperationError(
        `commands[${i}].basis must be one of: ${COMMAND_BASES.join(", ")}.`,
      );
    }
    const basis = c.basis as CommandBasis;
    const finding: CommandFinding = { command, basis };

    if (c.observedResult !== undefined) {
      if (basis !== "observed_in_session") {
        throw new ProjectOperationError(
          `commands[${i}].observedResult is only permitted with basis "observed_in_session"; got "${basis}". A command that was not executed has no result.`,
        );
      }
      if (c.observedResult !== "passed" && c.observedResult !== "failed") {
        throw new ProjectOperationError(
          `commands[${i}].observedResult must be "passed" or "failed".`,
        );
      }
      finding.observedResult = c.observedResult;
    }

    if (c.evidenceNote !== undefined) {
      const note = requireNonEmpty(c.evidenceNote, `commands[${i}].evidenceNote`);
      if (SECRETISH.test(note)) {
        throw new ProjectOperationError(`commands[${i}].evidenceNote looks sensitive; refusing.`);
      }
      finding.evidenceNote = note;
    } else if (basis === "declared_in_documentation") {
      // Provenance is mandatory for documented commands: name the document or manifest.
      throw new ProjectOperationError(
        `commands[${i}].evidenceNote is required for basis "declared_in_documentation" (name the document or manifest).`,
      );
    }
    return finding;
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
    commands,
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

const BASIS_LABEL: Record<CommandBasis, string> = {
  declared_in_documentation: "declared in documentation",
  observed_in_session: "observed in this session",
  candidate: "candidate (not executed)",
};

function commandLine(c: CommandFinding): string {
  const parts = [`\`${c.command}\` — ${BASIS_LABEL[c.basis]}`];
  if (c.observedResult) parts.push(`result: ${c.observedResult}`);
  if (c.evidenceNote) parts.push(c.evidenceNote);
  return `- ${parts.join("; ")}`;
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
    "## Commands (recorded, not verified by NewFang)",
    "",
    "_Basis is how the command is known. NewFang does not run or formally verify commands; an",
    "observation is not a verification receipt._",
    "",
    ...(a.commands.length ? a.commands.map(commandLine) : ["_(none)_"]),
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
