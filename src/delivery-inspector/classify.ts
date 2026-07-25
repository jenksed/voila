// Deterministic changed-file classification. Pure — no I/O, no repository access.
//
// The rule list is ordered and the FIRST match wins, so classification is a total function of the
// path string alone: the same path always produces the same category, reason, and confidence.
// Order is load-bearing and is asserted by tests; the interesting orderings are documented inline.
//
// Confidence is about the inspector's own certainty, never about code quality. `low` means "this is
// a guess from the path" and callers should treat it as a prompt to look, not as a fact.

import type { ChangeCategory, Confidence } from "./types.ts";

export interface Classification {
  category: ChangeCategory;
  confidence: Confidence;
  /** One short phrase naming the evidence, so a human can audit the decision. */
  reason: string;
}

interface PathParts {
  /** Full repository-relative POSIX path. */
  path: string;
  segments: string[];
  /** Final segment. */
  base: string;
  /** Lowercased final segment, for case-insensitive matching. */
  lowerBase: string;
  /** Lowercased full path. */
  lowerPath: string;
  /** Final extension including the dot, lowercased, or "" when there is none. */
  ext: string;
}

function parts(path: string): PathParts {
  const segments = path.split("/");
  const base = segments[segments.length - 1] ?? path;
  const dot = base.lastIndexOf(".");
  return {
    path,
    segments,
    base,
    lowerBase: base.toLowerCase(),
    lowerPath: path.toLowerCase(),
    ext: dot > 0 ? base.slice(dot).toLowerCase() : "",
  };
}

/** True when any path segment equals `name`. */
function hasSegment(p: PathParts, name: string): boolean {
  return p.segments.includes(name);
}

/** True when the path begins with `prefix` as a whole segment. */
function underDirectory(p: PathParts, prefix: string): boolean {
  return p.segments.length > 1 && p.segments[0] === prefix;
}

const SOURCE_EXTENSIONS: readonly string[] = [
  ".c",
  ".cc",
  ".cjs",
  ".cpp",
  ".cs",
  ".cts",
  ".ex",
  ".exs",
  ".go",
  ".h",
  ".hpp",
  ".java",
  ".js",
  ".jsx",
  ".kt",
  ".lua",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".scala",
  ".sh",
  ".swift",
  ".ts",
  ".tsx",
  ".zsh",
];

const CONFIG_EXTENSIONS: readonly string[] = [
  ".cfg",
  ".conf",
  ".ini",
  ".json",
  ".json5",
  ".jsonc",
  ".properties",
  ".toml",
  ".yaml",
  ".yml",
];

const DOC_EXTENSIONS: readonly string[] = [".adoc", ".markdown", ".md", ".mdx", ".rst"];

const BINARY_ASSET_EXTENSIONS: readonly string[] = [
  ".bin",
  ".bmp",
  ".class",
  ".dll",
  ".dylib",
  ".eot",
  ".gif",
  ".gz",
  ".ico",
  ".icns",
  ".jar",
  ".jpeg",
  ".jpg",
  ".mp3",
  ".mp4",
  ".otf",
  ".pdf",
  ".png",
  ".so",
  ".tar",
  ".tgz",
  ".ttf",
  ".wasm",
  ".webp",
  ".woff",
  ".woff2",
  ".zip",
];

const DEPENDENCY_MANIFESTS: readonly string[] = [
  "build.gradle",
  "cargo.toml",
  "composer.json",
  "gemfile",
  "go.mod",
  "package.json",
  "pipfile",
  "pom.xml",
  "pyproject.toml",
  "requirements.txt",
];

const DEPENDENCY_LOCKS: readonly string[] = [
  "bun.lockb",
  "cargo.lock",
  "composer.lock",
  "gemfile.lock",
  "go.sum",
  "npm-shrinkwrap.json",
  "package-lock.json",
  "pipfile.lock",
  "pnpm-lock.yaml",
  "poetry.lock",
  "yarn.lock",
];

const CREDENTIAL_STORE_NAMES: readonly string[] = [
  ".git-credentials",
  ".htpasswd",
  ".netrc",
  ".npmrc",
  ".pgpass",
  ".pypirc",
  "credentials",
  "credentials.json",
];

const PRIVATE_KEY_EXTENSIONS: readonly string[] = [
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
];

const PRIVATE_KEY_BASENAMES: readonly string[] = ["id_dsa", "id_ecdsa", "id_ed25519", "id_rsa"];

interface Rule {
  category: ChangeCategory;
  confidence: Confidence;
  reason: string;
  matches: (p: PathParts) => boolean;
}

/**
 * Ordered classification rules. First match wins.
 *
 * Ordering notes that tests pin down:
 * - `generated` precedes `project_state` so a generated Voila markdown view is not mistaken for
 *   canonical state, and both precede `documentation` so `.voila/**\/*.md` is not called docs.
 * - `ci` precedes `configuration` so a workflow YAML is CI, not generic config.
 * - `dependency_metadata` precedes `configuration` so `package.json` is a manifest, not config.
 * - `verification_evidence` precedes `documentation` so `docs/verification/**` is evidence.
 * - `documentation` precedes `test` and `migration` so a design doc about migrations stays docs.
 * - `test` precedes `migration` and `source` so `test/migrate.test.ts` is a test, not a migration.
 */
const RULES: readonly Rule[] = [
  {
    category: "generated",
    confidence: "high",
    reason: "inside a build or coverage output directory",
    matches: (p) =>
      underDirectory(p, "dist") ||
      underDirectory(p, "build") ||
      underDirectory(p, "out") ||
      underDirectory(p, "coverage") ||
      hasSegment(p, "node_modules") ||
      hasSegment(p, "__pycache__") ||
      underDirectory(p, "target"),
  },
  {
    category: "generated",
    confidence: "high",
    reason: "generated Voila view under .voila/",
    matches: (p) => underDirectory(p, ".voila") && DOC_EXTENSIONS.includes(p.ext),
  },
  {
    category: "generated",
    confidence: "medium",
    reason: "filename marks the file as generated or minified",
    matches: (p) =>
      /\.generated\./.test(p.lowerBase) ||
      /\.min\.(js|css)$/.test(p.lowerBase) ||
      p.ext === ".map" ||
      p.lowerBase.endsWith(".lock.hcl"),
  },
  {
    category: "project_state",
    confidence: "high",
    reason: "canonical Voila project state under .voila/",
    matches: (p) => underDirectory(p, ".voila"),
  },
  {
    category: "ci",
    confidence: "high",
    reason: "continuous-integration pipeline definition",
    matches: (p) =>
      (p.segments[0] === ".github" && p.segments[1] === "workflows") ||
      p.segments[0] === ".circleci" ||
      p.base === ".gitlab-ci.yml" ||
      p.base === "azure-pipelines.yml" ||
      p.base === "Jenkinsfile" ||
      p.base === ".travis.yml" ||
      p.base === "appveyor.yml",
  },
  {
    category: "dependency_metadata",
    confidence: "high",
    reason: "dependency manifest",
    matches: (p) => DEPENDENCY_MANIFESTS.includes(p.lowerBase),
  },
  {
    category: "dependency_metadata",
    confidence: "high",
    reason: "dependency lock file",
    matches: (p) => DEPENDENCY_LOCKS.includes(p.lowerBase),
  },
  {
    category: "dependency_metadata",
    confidence: "medium",
    reason: "pinned requirements file",
    matches: (p) => /^requirements[.-].*\.txt$/.test(p.lowerBase),
  },
  {
    category: "verification_evidence",
    confidence: "high",
    reason: "under docs/verification/",
    matches: (p) => p.segments[0] === "docs" && p.segments[1] === "verification",
  },
  {
    category: "verification_evidence",
    confidence: "medium",
    reason: "filename suggests a verification record or receipt",
    matches: (p) => /(^|[-_.])(verification|receipt)s?([-_.]|$)/.test(p.lowerBase),
  },
  {
    category: "documentation",
    confidence: "high",
    reason: "prose document",
    matches: (p) => DOC_EXTENSIONS.includes(p.ext),
  },
  {
    category: "documentation",
    confidence: "high",
    reason: "conventional repository document",
    matches: (p) =>
      ["license", "licence", "notice", "authors", "codeowners"].includes(p.lowerBase) ||
      /^(readme|changelog|contributing|agents|claude)$/.test(p.lowerBase),
  },
  {
    category: "documentation",
    confidence: "medium",
    reason: "text file under docs/",
    matches: (p) => underDirectory(p, "docs"),
  },
  {
    category: "test",
    confidence: "high",
    reason: "inside a test directory",
    matches: (p) =>
      underDirectory(p, "test") ||
      underDirectory(p, "tests") ||
      underDirectory(p, "spec") ||
      hasSegment(p, "__tests__") ||
      hasSegment(p, "__snapshots__"),
  },
  {
    category: "test",
    confidence: "high",
    reason: "test-suffixed filename",
    matches: (p) =>
      /\.(test|spec)\.[cm]?[jt]sx?$/.test(p.lowerBase) ||
      /_test\.(go|py|rb|exs?)$/.test(p.lowerBase) ||
      /^test_.*\.py$/.test(p.lowerBase) ||
      /_spec\.rb$/.test(p.lowerBase),
  },
  {
    category: "migration",
    confidence: "high",
    reason: "inside a migrations directory",
    matches: (p) => hasSegment(p, "migrations") || hasSegment(p, "migrate"),
  },
  {
    category: "migration",
    confidence: "medium",
    reason: "filename suggests a schema migration",
    matches: (p) =>
      /(^|[-_.])migrat(e|ion|ions)([-_.]|$)/.test(p.lowerBase) ||
      /^schema[-_.]v\d+\./.test(p.lowerBase),
  },
  {
    category: "migration",
    confidence: "medium",
    reason: "SQL definition file",
    matches: (p) => p.ext === ".sql",
  },
  {
    category: "configuration",
    confidence: "high",
    reason: "environment file",
    matches: (p) => p.lowerBase === ".env" || p.lowerBase.startsWith(".env."),
  },
  {
    category: "configuration",
    confidence: "high",
    reason: "toolchain or formatter configuration",
    matches: (p) =>
      /^tsconfig(\..+)?\.json$/.test(p.lowerBase) ||
      /^\.prettierrc/.test(p.lowerBase) ||
      /^\.eslintrc/.test(p.lowerBase) ||
      [
        "mise.toml",
        ".tool-versions",
        ".editorconfig",
        ".nvmrc",
        ".gitignore",
        ".gitattributes",
        ".dockerignore",
        ".prettierignore",
        ".eslintignore",
      ].includes(p.lowerBase),
  },
  {
    category: "configuration",
    confidence: "medium",
    reason: "structured configuration file",
    matches: (p) => CONFIG_EXTENSIONS.includes(p.ext),
  },
  {
    category: "configuration",
    confidence: "medium",
    reason: "container or infrastructure definition",
    matches: (p) =>
      /^dockerfile/.test(p.lowerBase) ||
      p.lowerBase === "docker-compose.yml" ||
      p.ext === ".tf" ||
      p.ext === ".tfvars",
  },
  {
    category: "source",
    confidence: "high",
    reason: "source extension",
    matches: (p) => SOURCE_EXTENSIONS.includes(p.ext),
  },
  {
    category: "unknown",
    confidence: "medium",
    reason: "binary asset extension; not attributable to a category from the path alone",
    matches: (p) => BINARY_ASSET_EXTENSIONS.includes(p.ext),
  },
  {
    category: "unknown",
    confidence: "low",
    reason: "no classification rule matched this path",
    matches: () => true,
  },
];

/**
 * Classify a repository-relative path.
 *
 * Deterministic and path-only: the file's content is never consulted, so a classification is a
 * statement about naming convention, not about what the file does.
 */
export function classifyPath(path: string): Classification {
  const p = parts(path);
  for (const rule of RULES) {
    if (rule.matches(p)) {
      return { category: rule.category, confidence: rule.confidence, reason: rule.reason };
    }
  }
  // Unreachable: the final rule matches everything. Kept as an explicit total-function guarantee.
  return { category: "unknown", confidence: "low", reason: "no classification rule matched" };
}

/** First path segment, or "." for a repository-root file. Used for scope and grouping. */
export function topLevelArea(path: string): string {
  const segments = path.split("/");
  return segments.length > 1 ? (segments[0] ?? ".") : ".";
}

export type DependencyRole = "manifest" | "lock";

export interface DependencyFacts {
  role: DependencyRole;
  /** Ecosystem key used to pair a manifest with its lock. */
  ecosystem: string;
}

const ECOSYSTEMS: readonly { ecosystem: string; manifests: string[]; locks: string[] }[] = [
  {
    ecosystem: "npm",
    manifests: ["package.json"],
    locks: ["package-lock.json", "npm-shrinkwrap.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"],
  },
  { ecosystem: "cargo", manifests: ["cargo.toml"], locks: ["cargo.lock"] },
  { ecosystem: "go", manifests: ["go.mod"], locks: ["go.sum"] },
  { ecosystem: "composer", manifests: ["composer.json"], locks: ["composer.lock"] },
  { ecosystem: "bundler", manifests: ["gemfile"], locks: ["gemfile.lock"] },
  {
    ecosystem: "python",
    manifests: ["pyproject.toml", "pipfile", "requirements.txt"],
    locks: ["poetry.lock", "pipfile.lock"],
  },
];

/** Identify a dependency manifest or lock file, for the pairing heuristics. */
export function dependencyFacts(path: string): DependencyFacts | undefined {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  for (const entry of ECOSYSTEMS) {
    if (entry.manifests.includes(base)) return { role: "manifest", ecosystem: entry.ecosystem };
    if (entry.locks.includes(base)) return { role: "lock", ecosystem: entry.ecosystem };
  }
  return undefined;
}

/** True when the filename alone suggests credential material. Never inspects content. */
export function looksLikeSecretFilename(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  // `.env.example` and friends are templates by convention and are excluded on purpose.
  if (/^\.env\.(example|sample|template|dist)$/.test(base)) return false;
  return /(secret|credential|password|passwd|apikey|api[-_]key|access[-_]key|private[-_]key|token)/.test(
    base,
  );
}

/** True when the path is a well-known credential store. */
export function looksLikeCredentialStore(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  return (
    CREDENTIAL_STORE_NAMES.includes(base) || base.endsWith(".keystore") || base.endsWith(".jks")
  );
}

/** True when the path looks like a private key file. */
export function looksLikePrivateKeyFile(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  const dot = base.lastIndexOf(".");
  const ext = dot > 0 ? base.slice(dot) : "";
  return PRIVATE_KEY_EXTENSIONS.includes(ext) || PRIVATE_KEY_BASENAMES.includes(base);
}

/** True when the path is a real environment file rather than a checked-in template. */
export function isEnvironmentFile(path: string): boolean {
  const base = (path.split("/").pop() ?? path).toLowerCase();
  if (/^\.env\.(example|sample|template|dist)$/.test(base)) return false;
  return base === ".env" || base.startsWith(".env.");
}

/** Extension-free, test-suffix-free stem, used to relate tests and generated files to sources. */
export function pathStem(path: string): string {
  let base = (path.split("/").pop() ?? path).toLowerCase();
  const dot = base.lastIndexOf(".");
  if (dot > 0) base = base.slice(0, dot);
  base = base.replace(/\.(test|spec)$/, "");
  base = base
    .replace(/^test_/, "")
    .replace(/_test$/, "")
    .replace(/_spec$/, "");
  return base;
}
