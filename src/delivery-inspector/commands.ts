// Verification-command discovery. Reads repository-local declarations; NEVER executes anything.
//
// The honesty rules here mirror the existing NewFang convention (see
// `docs/design/REPOSITORY_ORIENTATION.md`): a command that has not been run has no result, and nothing
// is "verified" until formal receipts exist. So:
// - Every discovered command carries an explicit `basis` naming how it became known.
// - `declared_in_manifest` and `declared_in_documentation` both record the declaring file as
//   provenance. `candidate` means the inspector inferred it from an ecosystem convention.
// - `executed` is the literal `false` on every record. This module contains no process spawning, no
//   `child_process` import, and no network access — discovery is file reading only.
//
// Privacy: a documented command that embeds a credential-shaped assignment is skipped rather than
// returned, and the skip is reported as a count in `limitations` without the command text.

import type { InspectionFileSystem } from "./fs.ts";
import type { DiscoveredCommand, DiscoveryBasis, InspectionLimits } from "./types.ts";

const BASIS_RANK: Record<DiscoveryBasis, number> = {
  declared_in_manifest: 0,
  declared_in_documentation: 1,
  candidate: 2,
};

/** Documents scanned for development instructions, in a fixed order. */
const DOCUMENTATION_SOURCES: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "README.md",
  "docs/DEVELOPMENT.md",
  "docs/development.md",
];

/** Command leaders recognized as runners in prose. */
const RUNNERS: readonly string[] = [
  "./gradlew",
  "bun",
  "bundle exec",
  "cargo",
  "deno",
  "dotnet",
  "go",
  "gradle",
  "just",
  "make",
  "mise",
  "mvn",
  "node",
  "npm",
  "npx",
  "pnpm",
  "pytest",
  "python -m pytest",
  "rake",
  "task",
  "tox",
  "yarn",
];

/** A documented command is only kept when it reads like a check rather than arbitrary shell. */
const VERIFICATION_KEYWORDS =
  /\b(test|tests|verify|check|checks|lint|typecheck|types|format|fmt|audit|coverage|ci|validate|doctor|tsc|noEmit|mypy|pyright|vitest|jest)\b/i;

/** Commands that are self-evidently verification even without a keyword match. */
const KNOWN_VERIFICATION_COMMANDS: readonly string[] = [
  "cargo test",
  "go test ./...",
  "npm test",
  "pnpm test",
  "pytest",
  "yarn test",
];

/** Credential-shaped assignment inside a command line. Such commands are skipped, never returned. */
const SENSITIVE_COMMAND =
  /\b(secret|token|password|passwd|api[_-]?key|access[_-]?key|client[_-]?secret)\b\s*=\s*\S/i;

function isRunnerCommand(command: string): boolean {
  return RUNNERS.some((runner) => command === runner || command.startsWith(`${runner} `));
}

/**
 * A runner appearing anywhere in the line as a whole word. Used only to decide whether a
 * credential-bearing line was *command-like* enough to report as a deliberate skip, so arbitrary prose
 * containing `token = ...` does not inflate the skip count.
 */
const RUNNER_ANYWHERE =
  /(?:^|\s)(?:\.\/gradlew|bun|bundle|cargo|deno|dotnet|go|gradle|just|make|mise|mvn|node|npm|npx|pnpm|pytest|python|rake|task|tox|yarn)(?:\s|$)/;

function looksLikeVerification(command: string): boolean {
  return KNOWN_VERIFICATION_COMMANDS.includes(command) || VERIFICATION_KEYWORDS.test(command);
}

/** Normalize a candidate command line from prose. Returns `null` when it is not usable. */
function normalizeCommandLine(raw: string): string | null {
  let command = raw.trim();
  if (command.length === 0 || command.length > 200) return null;
  if (command.includes("\n")) return null;
  command = command.replace(/^[$>]\s+/, "").trim();
  command = command.replace(/^`+|`+$/g, "").trim();
  command = command.replace(/[.,;:]+$/, "").trim();
  if (command.length === 0) return null;
  // Comments and prose fragments are not commands.
  if (command.startsWith("#") || command.startsWith("//")) return null;
  return command;
}

/** Extract fenced-code and inline-code spans from Markdown, in document order. */
function extractCodeSpans(markdown: string): string[] {
  const spans: string[] = [];
  const fencePattern = /```[^\n]*\n([\s\S]*?)```/g;
  let fence = fencePattern.exec(markdown);
  while (fence !== null) {
    const body = fence[1];
    if (body !== undefined) {
      for (const line of body.split("\n")) spans.push(line);
    }
    fence = fencePattern.exec(markdown);
  }
  const inlinePattern = /`([^`\n]+)`/g;
  let inline = inlinePattern.exec(markdown);
  while (inline !== null) {
    const body = inline[1];
    if (body !== undefined) spans.push(body);
    inline = inlinePattern.exec(markdown);
  }
  return spans;
}

/** `package.json` scripts. Parsed defensively: a malformed manifest yields a limitation, not a throw. */
function scriptsFromPackageJson(text: string): { name: string; command: string }[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (typeof scripts !== "object" || scripts === null) return [];
  const out: { name: string; command: string }[] = [];
  for (const name of Object.keys(scripts).sort()) {
    if (typeof (scripts as Record<string, unknown>)[name] !== "string") continue;
    // Reserved npm lifecycle names have a shorter invocation.
    const command =
      name === "test" || name === "start" || name === "stop" || name === "restart"
        ? `npm ${name}`
        : `npm run ${name}`;
    out.push({ name, command });
  }
  return out;
}

/** Makefile targets: a line-leading target name followed by a colon, excluding special targets. */
function targetsFromMakefile(text: string): string[] {
  const targets: string[] = [];
  for (const line of text.split("\n")) {
    const match = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s*:(?!=)/.exec(line);
    const target = match?.[1];
    if (target === undefined) continue;
    if (target.startsWith(".")) continue;
    if (!targets.includes(target)) targets.push(target);
  }
  return targets.sort();
}

/** mise task names from `[tasks.<name>]` table headers. */
function tasksFromMiseToml(text: string): string[] {
  const tasks: string[] = [];
  const pattern = /^\s*\[tasks\.(?:"([^"]+)"|'([^']+)'|([A-Za-z0-9._:-]+))\]/gm;
  let match = pattern.exec(text);
  while (match !== null) {
    const name = match[1] ?? match[2] ?? match[3];
    if (name !== undefined && !tasks.includes(name)) tasks.push(name);
    match = pattern.exec(text);
  }
  return tasks.sort();
}

export interface CommandDiscoveryResult {
  commands: DiscoveredCommand[];
  limitations: string[];
}

/**
 * Discover candidate verification commands from repository-local declarations.
 *
 * Nothing discovered here has been executed or verified. Callers must not present these as passing,
 * and must not run them on the strength of this result alone.
 */
export async function discoverVerificationCommands(
  fs: InspectionFileSystem,
  limits: InspectionLimits,
): Promise<CommandDiscoveryResult> {
  const limitations: string[] = [];
  const found = new Map<string, DiscoveredCommand>();
  let skippedSensitive = 0;

  const record = (command: string, basis: DiscoveryBasis, source: string, note?: string): void => {
    if (SENSITIVE_COMMAND.test(command)) {
      // Deliberately drop the command text: reporting it would leak the embedded value.
      skippedSensitive += 1;
      return;
    }
    const existing = found.get(command);
    if (existing !== undefined && BASIS_RANK[existing.basis] <= BASIS_RANK[basis]) return;
    found.set(command, {
      command,
      basis,
      source,
      executed: false,
      ...(note !== undefined ? { note } : {}),
    });
  };

  // --- package.json scripts -------------------------------------------------------------------
  const packageJson = await fs.readText("package.json", limits.maxManifestBytes);
  if (packageJson !== null) {
    const scripts = scriptsFromPackageJson(packageJson);
    if (scripts === null) {
      limitations.push(
        "package.json could not be parsed as JSON, so no manifest-declared commands were discovered from it.",
      );
    } else {
      for (const script of scripts) {
        record(
          script.command,
          "declared_in_manifest",
          "package.json",
          looksLikeVerification(script.name) || looksLikeVerification(script.command)
            ? `declared as the "${script.name}" script; the name suggests a verification command`
            : `declared as the "${script.name}" script`,
        );
      }
    }
  }

  // --- Makefile targets -----------------------------------------------------------------------
  for (const makefile of ["Makefile", "makefile", "GNUmakefile"]) {
    const text = await fs.readText(makefile, limits.maxManifestBytes);
    if (text === null) continue;
    for (const target of targetsFromMakefile(text)) {
      record(
        `make ${target}`,
        "declared_in_manifest",
        makefile,
        `declared as a ${makefile} target`,
      );
    }
    break;
  }

  // --- mise tasks -----------------------------------------------------------------------------
  const miseToml = await fs.readText("mise.toml", limits.maxManifestBytes);
  if (miseToml !== null) {
    for (const task of tasksFromMiseToml(miseToml)) {
      record(`mise run ${task}`, "declared_in_manifest", "mise.toml", "declared as a mise task");
    }
  }

  // --- Ecosystem conventions: candidates, explicitly not declared anywhere --------------------
  if ((await fs.readText("Cargo.toml", 1)) !== null) {
    record(
      "cargo test",
      "candidate",
      "Cargo.toml",
      "inferred from the presence of a Cargo manifest; not declared anywhere in the repository",
    );
  }
  if ((await fs.readText("go.mod", 1)) !== null) {
    record(
      "go test ./...",
      "candidate",
      "go.mod",
      "inferred from the presence of a Go module; not declared anywhere in the repository",
    );
  }
  const pyproject = await fs.readText("pyproject.toml", limits.maxManifestBytes);
  if (pyproject !== null && /pytest/.test(pyproject)) {
    record(
      "pytest",
      "candidate",
      "pyproject.toml",
      "inferred because pyproject.toml mentions pytest; not declared as a runnable task",
    );
  }

  // --- Documented development instructions ----------------------------------------------------
  for (const document of DOCUMENTATION_SOURCES) {
    const text = await fs.readText(document, limits.maxManifestBytes);
    if (text === null) continue;
    for (const span of extractCodeSpans(text)) {
      const command = normalizeCommandLine(span);
      if (command === null) continue;
      // Sensitivity is checked BEFORE the runner filter, because a documented line such as
      // `API_KEY=... npm test` leads with the assignment rather than the runner. Such a line is
      // withheld entirely and only counted, never returned.
      if (SENSITIVE_COMMAND.test(command)) {
        if (RUNNER_ANYWHERE.test(command)) skippedSensitive += 1;
        continue;
      }
      if (!isRunnerCommand(command)) continue;
      if (!looksLikeVerification(command)) continue;
      record(command, "declared_in_documentation", document, `documented in ${document}`);
    }
  }

  if (skippedSensitive > 0) {
    limitations.push(
      `${skippedSensitive} documented command(s) were skipped because they embedded a credential-shaped assignment. The command text is withheld on purpose so no value is echoed into this result.`,
    );
  }

  const commands = [...found.values()].sort((a, b) => {
    const byBasis = BASIS_RANK[a.basis] - BASIS_RANK[b.basis];
    return byBasis !== 0 ? byBasis : a.command.localeCompare(b.command);
  });

  if (commands.length > limits.maxCommandsDiscovered) {
    limitations.push(
      `Command discovery found ${commands.length} declarations and was capped at ${limits.maxCommandsDiscovered}; the list is incomplete.`,
    );
    return { commands: commands.slice(0, limits.maxCommandsDiscovered), limitations };
  }
  return { commands, limitations };
}
