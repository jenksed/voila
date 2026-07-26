// Advisory commit-boundary suggestions. Pure — no I/O, no staging, no commits.
//
// Hard invariants:
// 1. **Disjoint by construction.** Every path is assigned to at most one group through a single
//    `Map<path, groupKey>`. Overlap is not merely rejected after the fact — there is no code path that
//    can place a path in two groups. A defensive check still runs and throws
//    `InspectionInvariantError` if the invariant is ever broken by a future edit.
// 2. **Nothing is hidden.** A path the inspector declines to group is returned in `unassignedPaths`
//    rather than dropped, so a caller reading only the boundaries can still see it is incomplete.
// 3. **One coherent commit stays valid.** Small or uniformly single-file change sets collapse into one
//    `coherent_single_commit` suggestion. Splitting a three-file change into three commits because the
//    extensions differ is worse advice than one commit, so the collapse rules exist to prevent it.
// 4. **Advisory only.** This module suggests groupings. It never stages, never writes a commit, and
//    never claims a grouping is correct.

import { pathStem } from "./classify.ts";
import { InspectionInvariantError } from "./errors.ts";
import type { BoundaryKind, ChangedFile, SuggestedCommitBoundary } from "./types.ts";
import { BOUNDARY_KINDS } from "./types.ts";

export interface BoundarySuggestions {
  boundaries: SuggestedCommitBoundary[];
  /** Changed paths deliberately left ungrouped. Always visible. */
  unassignedPaths: string[];
  /** Notes explaining collapse decisions and ungrouped paths. */
  notes: string[];
}

const KIND_RANK = new Map<BoundaryKind, number>(BOUNDARY_KINDS.map((kind, index) => [kind, index]));

/** Module identity for grouping: at most the first two path segments. */
export function moduleKey(path: string): string {
  const segments = path.split("/");
  if (segments.length === 1) return ".";
  if (segments.length === 2) return segments[0] ?? ".";
  return `${segments[0]}/${segments[1]}`;
}

function stemTokens(path: string): string[] {
  return pathStem(path)
    .split(/[.\-_]/)
    .filter((token) => token.length > 2);
}

function looksMigrationRelated(path: string): boolean {
  const lower = path.toLowerCase();
  return /migrat/.test(lower) || /schema[-_.]v?\d/.test(lower);
}

interface Group {
  key: string;
  kind: BoundaryKind;
  rationale: string;
  suggestedType: SuggestedCommitBoundary["suggestedType"];
  paths: string[];
}

/**
 * Suggest advisory commit boundaries for a change set.
 *
 * Grouping order is fixed so results are deterministic: migration cluster, verification evidence,
 * dependency metadata, CI, project state, source modules, tests joined to their module, generated
 * artifacts joined to their source, documentation, configuration. Anything still unassigned — files the
 * classifier could not attribute — is returned separately rather than forced into a group.
 */
export function suggestCommitBoundaries(changes: readonly ChangedFile[]): BoundarySuggestions {
  const notes: string[] = [];
  const assignment = new Map<string, Group>();
  const groups = new Map<string, Group>();

  const group = (
    key: string,
    kind: BoundaryKind,
    rationale: string,
    suggestedType: SuggestedCommitBoundary["suggestedType"],
  ): Group => {
    const existing = groups.get(key);
    if (existing !== undefined) return existing;
    const created: Group = { key, kind, rationale, suggestedType, paths: [] };
    groups.set(key, created);
    return created;
  };

  // A single chokepoint for assignment. First writer wins, so a path can never join two groups.
  const assign = (file: ChangedFile, target: Group): void => {
    if (assignment.has(file.path)) return;
    assignment.set(file.path, target);
    target.paths.push(file.path);
  };

  const unassigned = (file: ChangedFile): boolean => !assignment.has(file.path);
  const byCategory = (category: ChangedFile["category"]): ChangedFile[] =>
    changes.filter((file) => file.category === category);

  // 1. Migration cluster: migrations travel with their tests and their documentation, because
  //    reviewing a migration without them is reviewing half the change.
  const migrations = byCategory("migration");
  if (migrations.length > 0) {
    const cluster = group(
      "migration",
      "migration",
      "Migrations, plus the tests and documents that describe them — a migration is hard to reverse, so it should be reviewable and revertable on its own.",
      "feat",
    );
    for (const file of migrations) assign(file, cluster);
    for (const file of changes) {
      if (!unassigned(file)) continue;
      if (
        (file.category === "test" || file.category === "documentation") &&
        looksMigrationRelated(file.path)
      ) {
        assign(file, cluster);
      }
    }
  }

  // 2. Verification evidence stands alone: it is the record of a claim, not part of the change.
  const evidence = byCategory("verification_evidence").filter(unassigned);
  if (evidence.length > 0) {
    const target = group(
      "verification",
      "verification_evidence",
      "Verification records and receipts, kept separate so the evidence trail is auditable on its own.",
      "docs",
    );
    for (const file of evidence) assign(file, target);
  }

  // 3. Dependency metadata: manifest and lock belong together and nowhere else.
  const dependencies = byCategory("dependency_metadata").filter(unassigned);
  if (dependencies.length > 0) {
    const target = group(
      "dependencies",
      "dependencies",
      "Dependency manifests and lock files, which reviewers read as a pair.",
      "build",
    );
    for (const file of dependencies) assign(file, target);
  }

  // 4. CI definitions.
  const ci = byCategory("ci").filter(unassigned);
  if (ci.length > 0) {
    const target = group(
      "ci",
      "ci",
      "Continuous-integration pipeline changes, which are reviewed against pipeline behavior rather than product behavior.",
      "ci",
    );
    for (const file of ci) assign(file, target);
  }

  // 5. Canonical project state.
  const projectState = byCategory("project_state").filter(unassigned);
  if (projectState.length > 0) {
    const target = group(
      "project_state",
      "project_state",
      "Canonical project-state files, which record what happened rather than changing behavior.",
      "chore",
    );
    for (const file of projectState) assign(file, target);
  }

  // 6. Source modules. `moduleKey` keeps a module at two path segments so a large tree does not
  //    explode into one commit per directory.
  const sources = byCategory("source").filter(unassigned);
  const stemToModule = new Map<string, string>();
  for (const file of sources) {
    const key = moduleKey(file.path);
    const stem = pathStem(file.path);
    const existing = stemToModule.get(stem);
    // Deterministic tie-break: the lexicographically smallest module wins.
    if (existing === undefined || key < existing) stemToModule.set(stem, key);
  }
  for (const file of sources) {
    const key = moduleKey(file.path);
    assign(
      file,
      group(
        `module:${key}`,
        "module_with_tests",
        `Changes in \`${key}\` together with the tests that cover them.`,
        "feat",
      ),
    );
  }

  // 7. Tests join the module they appear to cover, matched by filename stem. An unmatched test forms
  //    its own group rather than being attached to an arbitrary module.
  const tests = byCategory("test").filter(unassigned);
  for (const file of tests) {
    const tokens = stemTokens(file.path);
    let bestModule: string | undefined;
    let bestScore = 0;
    for (const [stem, key] of [...stemToModule].sort(([a], [b]) => a.localeCompare(b))) {
      let score = 0;
      if (pathStem(file.path) === stem) score += 2;
      if (tokens.includes(stem)) score += 1;
      if (score > bestScore || (score === bestScore && score > 0 && key < (bestModule ?? "￿"))) {
        bestScore = score;
        bestModule = key;
      }
    }
    if (bestModule !== undefined && bestScore > 0) {
      const target = groups.get(`module:${bestModule}`);
      if (target !== undefined) {
        assign(file, target);
        continue;
      }
    }
    assign(
      file,
      group(
        "tests",
        "module_with_tests",
        "Test changes that do not map onto a changed source module in this change set.",
        "test",
      ),
    );
  }

  // 8. Generated artifacts join the source whose stem they share; otherwise they are grouped as
  //    artifacts, because a regeneration is reviewed differently from hand-written code.
  const generated = byCategory("generated").filter(unassigned);
  for (const file of generated) {
    const owningModule = stemToModule.get(pathStem(file.path));
    const target = owningModule !== undefined ? groups.get(`module:${owningModule}`) : undefined;
    if (target !== undefined) {
      assign(file, target);
      continue;
    }
    assign(
      file,
      group(
        "generated",
        "generated_artifacts",
        "Generated artifacts with no changed source of the same name in this change set — regenerate rather than hand-edit.",
        "chore",
      ),
    );
  }

  // 9. Documentation-only changes.
  const docs = byCategory("documentation").filter(unassigned);
  if (docs.length > 0) {
    const target = group(
      "documentation",
      "documentation",
      "Documentation-only changes, which can be reviewed and delivered independently of code.",
      "docs",
    );
    for (const file of docs) assign(file, target);
  }

  // 10. Configuration.
  const configuration = byCategory("configuration").filter(unassigned);
  if (configuration.length > 0) {
    const target = group(
      "configuration",
      "configuration",
      "Configuration and toolchain settings, which affect how the project builds rather than what it does.",
      "chore",
    );
    for (const file of configuration) assign(file, target);
  }

  // Anything left is `unknown`: not attributable from the path. Deliberately left visible.
  const unassignedPaths = changes
    .filter(unassigned)
    .map((file) => file.path)
    .sort();
  if (unassignedPaths.length > 0) {
    notes.push(
      `${unassignedPaths.length} changed path(s) were not assigned to a suggested boundary because the inspector could not classify them from the path alone. They are listed in \`unassignedPaths\` and must be placed by a human.`,
    );
  }

  const populated = [...groups.values()].filter((entry) => entry.paths.length > 0);
  const assignedCount = populated.reduce((total, entry) => total + entry.paths.length, 0);

  // Collapse rules: never recommend many tiny commits merely because categories differ.
  const everyGroupIsOneFile = populated.length > 1 && populated.length === assignedCount;
  const collapseSmall = populated.length > 1 && assignedCount <= 3;
  const collapseFragmented = everyGroupIsOneFile && assignedCount <= 5;

  let boundaries: SuggestedCommitBoundary[];
  if (collapseSmall || collapseFragmented) {
    const reason = collapseSmall
      ? `only ${assignedCount} file(s) changed`
      : `each candidate group holds a single file`;
    notes.push(
      `Suggested boundaries were collapsed into one commit because ${reason}; splitting this change set would produce commits too small to review usefully.`,
    );
    boundaries = [
      {
        id: "B1",
        kind: "coherent_single_commit",
        paths: populated.flatMap((entry) => entry.paths).sort(),
        rationale: `One coherent commit: ${reason}, so a single delivery is easier to review and revert than several fragments.`,
        suggestedType: "chore",
      },
    ];
  } else {
    boundaries = populated
      .sort((a, b) => {
        const byKind = (KIND_RANK.get(a.kind) ?? 0) - (KIND_RANK.get(b.kind) ?? 0);
        return byKind !== 0 ? byKind : a.key.localeCompare(b.key);
      })
      .map((entry, index) => ({
        id: `B${index + 1}`,
        kind: entry.kind,
        paths: [...entry.paths].sort(),
        rationale: entry.rationale,
        suggestedType: entry.suggestedType,
      }));
    if (boundaries.length > 1) {
      notes.push(
        "Suggested boundaries are advisory. One coherent commit remains a valid delivery; nothing was staged and no commit was created.",
      );
    }
  }

  assertDisjoint(boundaries);
  return { boundaries, unassignedPaths, notes };
}

/**
 * Defensive verification of the disjointness invariant.
 * Grouping already makes overlap unreachable; this makes a regression loud instead of silent.
 */
export function assertDisjoint(boundaries: readonly SuggestedCommitBoundary[]): void {
  const owner = new Map<string, string>();
  for (const boundary of boundaries) {
    for (const path of boundary.paths) {
      const existing = owner.get(path);
      if (existing !== undefined) {
        throw new InspectionInvariantError(
          `Suggested commit boundaries overlap: "${path}" appears in both ${existing} and ${boundary.id}. Boundaries must be disjoint.`,
        );
      }
      owner.set(path, boundary.id);
    }
  }
}
