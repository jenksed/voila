# Delivery Inspector — Design

The delivery inspector is a **read-only, standalone repository inspection library**. Given a repository
root it answers four questions:

1. What changed?
2. How is the change scoped?
3. What looks risky or incomplete?
4. What should be inspected before preparing a commit or a delivery summary?

It is the substrate a later delivery engine will stand on. It is **not** that engine.

## Boundaries

The inspector is deliberately inert. It does not:

- run any command, ever (see [Command discovery](#verification-command-discovery-never-executed));
- stage, unstage, commit, stash, reset, checkout, or clean anything;
- touch the network;
- read or write `.voila/` canonical state, or import anything from `src/domain/` or `src/state/`;
- register a Pi tool, command, or UI surface;
- assert that anything is verified, complete, or defective.

It has **no callers inside the extension** at Packet 5A. It is a library plus its tests. That is
intentional: the inspection substrate is proven before anything depends on it.

```text
src/delivery-inspector/
├── types.ts        # result model and closed vocabularies (pure)
├── errors.ts       # DeliveryInspectionError, InspectionRootError, InspectionInvariantError
├── fs.ts           # bounded read-only filesystem + in-memory implementation for tests
├── git.ts          # read-only runner (allowlist), porcelain v2 / numstat parsers, collection
├── classify.ts     # deterministic path classification (pure)
├── scan.ts         # credential-marker scanning — returns rule NAMES only (privacy chokepoint)
├── attention.ts    # heuristic attention items (pure)
├── boundaries.ts   # advisory commit-boundary suggestions (pure)
├── commands.ts     # verification-command discovery (reads files, never executes)
├── inspect.ts      # inspectDelivery — the single entry point
└── index.ts        # public surface
```

## Input and output contract

```ts
inspectDelivery(root: string, options?: InspectDeliveryOptions): Promise<DeliveryInspection>
```

| Option | Purpose |
|--------|---------|
| `runGit` | Injectable git runner. Defaults to a read-only runner rooted at `root`. |
| `fileSystem` | Injectable bounded read-only filesystem. Defaults to one rooted at `root`. |
| `limits` | Partial override of the documented caps. |
| `skipRootCheck` | Skip the `stat` on `root`; defaults to true when both injectables are supplied. |

```ts
interface DeliveryInspection {
  repository: RepositoryFacts;
  changes: ChangedFile[];                              // sorted by path
  summary: ChangeSummary;
  attention: DeliveryAttentionItem[];                  // sorted by severity, kind, first path
  suggestedBoundaries: SuggestedCommitBoundary[];      // mutually disjoint
  unassignedPaths: string[];                           // changed paths deliberately not grouped
  discoveredVerificationCommands: DiscoveredCommand[]; // sorted by basis, then command
  limitations: string[];                               // sorted, de-duplicated
}
```

Errors: `InspectionRootError` when `root` is unusable, `InspectionInvariantError` when the module's own
output invariant would be violated. Everything else degrades to a partial result plus a `limitations`
entry — a failed `git status` yields *no changes*, never guessed ones.

### Adaptations to the proposed model, and why

Three deliberate departures from the packet's sketch, all additive:

| Change | Justification |
|--------|---------------|
| `repository` is a named `RepositoryFacts` with added `isGitRepository` and `detachedHead` | "Works outside git with an actionable result" is a stated acceptance gate, and it needs a positive signal rather than the absence of `branch`. `detachedHead` distinguishes "no branch" from "unknown branch". |
| Top-level `unassignedPaths: string[]` | The gate "unassigned files remain visible" cannot be met from inside `suggestedBoundaries` without inventing a fake boundary, which would corrupt the disjointness guarantee. A sibling field keeps both properties clean. |
| No timestamp field anywhere | Determinism is a stated gate. A timestamp makes byte-identical output impossible, and the caller already knows when it called. |

## Read-only guarantees

Four independent mechanisms, in order of strength:

1. **Subcommand allowlist at the seam.** `createGitRunner` refuses any vector whose subcommand is not
   in `READ_ONLY_GIT_SUBCOMMANDS` (`diff`, `rev-parse`, `status`). The guard lives on the runner, so it
   applies to every call site, present and future. No remote-contacting subcommand is on the list.
2. **Argument-injection denylist.** `-c`, `--config-env`, `--exec`, `--exec-path`, `--git-dir`,
   `--namespace`, `--receive-pack`, `--upload-pack`, and `--work-tree` are refused regardless of
   subcommand, so git cannot be redirected at another repository or made to run another program.
3. **`GIT_OPTIONAL_LOCKS=0`.** This is what makes the no-mutation property real rather than merely
   likely: without it, `git status` takes the index lock to persist a refreshed index, which changes
   `.git/index` on disk. With it, git declines the optional lock. Verified by asserting the index mtime
   and size are unchanged across two inspections.
4. **No shell.** `execFile` is called with an argument array and `shell: false`. A path containing a
   space, quote, or `;` is inert data. `GIT_TERMINAL_PROMPT=0` prevents any credential prompt.

Filesystem access is equally narrow: `fs.ts` contains no write, create, rename, or unlink call. Every
read is byte-capped, and a repository-relative path that would escape the root (absolute, home-relative,
or containing `..`) returns `null` instead of being followed.

## Git state collection

One `git status --porcelain=v2 --branch --untracked-files=all -z` call supplies branch, HEAD, upstream,
ahead/behind, and the full change set. Two `--numstat -z` calls (staged and unstaged) supply line counts
and git's own binary indication. `-z` output is never quoted or escaped, so filenames containing spaces,
quotes, or newlines parse correctly.

Record shapes were captured from **git 2.50.1** before the parser was written:

| Record | Meaning |
|--------|---------|
| `# branch.oid <oid>` / `(initial)` | HEAD, or a repository with no commits |
| `# branch.head <branch>` / `(detached)` | current branch, or detached |
| `# branch.upstream <name>` | present only when an upstream is configured |
| `# branch.ab +<ahead> -<behind>` | divergence counts |
| `1 <XY> …  <path>` | ordinary change |
| `2 <XY> … <Xscore> <path>` + next NUL field | rename or copy; the original path follows as its own field |
| `u <XY> … <path>` | unmerged |
| `? <path>` | untracked |

A path appearing in both the staged and unstaged diff has its counts **summed**, and the result is
documented as "insertions and deletions across the staged and unstaged diffs".

Honest degradation:

- Not a git worktree → `isGitRepository: false`, empty change set, an actionable limitation, and command
  discovery still runs so the result remains useful.
- No commits yet → `head` absent, with the reason recorded.
- No upstream → `ahead`/`behind` absent, with the reason recorded. **No fetch is ever attempted.**
- `git status` fails → no changes reported rather than invented ones.

## Changed-file classification

`classifyPath` is a total, deterministic function of the path string alone. Rules are ordered and the
**first match wins**, so a path always yields the same category, confidence, and reason. Content is never
consulted: a classification is a statement about naming convention, not about what a file does.

| Category | Typical evidence |
|----------|------------------|
| `generated` | build/coverage output directory, `.voila/**/*.md` view, `.generated.`, `.min.js`, `.map` |
| `project_state` | non-view files under `.voila/` |
| `ci` | `.github/workflows/**`, `.circleci/**`, `Jenkinsfile`, `.gitlab-ci.yml` |
| `dependency_metadata` | manifest or lock for npm, cargo, go, composer, bundler, python |
| `verification_evidence` | `docs/verification/**`, filenames naming a verification or receipt |
| `documentation` | `.md`/`.mdx`/`.rst`/`.adoc`, conventional docs, text under `docs/` |
| `test` | test directory, `*.test.*`, `*_test.go`, `test_*.py`, `*_spec.rb` |
| `migration` | `migrations/`, migration-shaped filename, `schema-v*`, `.sql` |
| `configuration` | env file, toolchain/formatter config, structured config, container/infra |
| `source` | known source extension |
| `unknown` | binary asset extension (medium), or nothing matched (low) |

Order is load-bearing and pinned by tests. The interesting cases: `generated` before `project_state`
before `documentation` (a generated Voila view is neither state nor docs); `ci` before `configuration`;
`dependency_metadata` before `configuration`; `verification_evidence` before `documentation`;
`documentation` before `test` and `migration` (a design doc about migrations stays documentation); `test`
before `migration` and `source` (`test/migrate.test.ts` is a test).

`confidence` describes the **inspector's** certainty, never code quality. `low` means "guessed from the
path".

## Attention heuristics

Every item is a prompt to look, carrying `kind`, `severity`, `paths`, `reason`, `confidence`, and
`suggestion`. Severity is about how strongly the inspector suggests looking:
`inspect_before_delivery` → `worth_reviewing` → `informational`. `inspect_before_delivery` is the
strongest statement this module is permitted to make.

| Kind | Fires when |
|------|-----------|
| `possible_secret_filename` | filename suggests credential material (downgraded in test/fixture/docs paths) |
| `possible_credential_store` | well-known credential-store filename (`.netrc`, `.npmrc`, `*.keystore`, …) |
| `possible_private_key_file` | private-key extension or basename (`.pem`, `.key`, `id_ed25519`, …) |
| `environment_file_changed` | a real `.env*` file, excluding `.example`/`.sample`/`.template`/`.dist` |
| `possible_secret_content_pattern` | a credential-marker rule matched the file's bytes |
| `unexpectedly_large_change` | worktree size ≥ `largeFileBytes`, or changed lines ≥ `largeDiffLines` |
| `binary_change` | binary files changed — a binary diff is effectively unreviewed |
| `generated_mixed_with_source` | generated and source files changed together |
| `dependency_lock_without_manifest` | lock changed, matching manifest did not |
| `dependency_manifest_without_lock` | manifest changed, matching lock did not |
| `source_without_test` | source changed, no test changed |
| `potentially_missing_documentation` | source changed, no doc changed, repository maintains `docs/` |
| `migration_without_test` | migration changed with no obviously related test |
| `unrelated_areas_touched` | ≥ 3 distinct top-level areas among source/test/migration/config |
| `deleted_verification_evidence` | verification evidence was deleted |
| `generated_view_without_state_change` | a `.voila/` view changed with no canonical state change |
| `dirty_outside_apparent_scope` | unstaged/untracked files sit outside the staged areas |

### Vocabulary discipline

The wording is a design constraint, not a style preference. Reasons may say "possible", "potentially
missing", "may", "suggests", "cannot tell", "inspect before delivery". They may **not** assert that
something is confirmed, verified, or proven. A test asserts that no reason or suggestion contains an
assertive confirmation ("is confirmed", "was verified", "has been proven"), and that every
`possible_*`/`potentially_*` item hedges explicitly.

Conservatism is expressed by downgrading rather than dropping: a credential-shaped name in
`test/fixtures/` still produces an item, at `worth_reviewing` with `low` confidence and a reason that
names the mitigating context.

## Suggested commit boundaries

Advisory groupings. The inspector never stages and never writes a commit.

Grouping order (fixed, therefore deterministic): migration cluster → verification evidence →
dependencies → CI → project state → source modules → tests joined to their module → generated joined to
its source → documentation → configuration.

- A **migration cluster** pulls in migration-related tests and documents, because reviewing a migration
  without them is reviewing half the change.
- A **module** is at most the first two path segments, so a large tree does not explode into one commit
  per directory.
- A **test** joins the module it appears to cover, matched by filename stem (`test/orientation.test.ts`
  → `src/domain/orientation.ts`), with a deterministic lexicographic tie-break. An unmatched test forms
  its own group rather than being attached to an arbitrary module.
- A **generated file** joins the source whose stem it shares; otherwise it is grouped as an artifact.

### Disjointness

Overlap is **impossible**, not merely rejected: every path is assigned through a single
`Map<path, group>` chokepoint where the first writer wins. `assertDisjoint` then re-verifies and throws
`InspectionInvariantError` if a future edit breaks the property. Both the construction and the guard are
tested.

### One coherent commit stays valid

Splitting a small change into several commits because the extensions differ is worse advice than one
commit. Two collapse rules prevent it:

- fewer than four assigned files across more than one group → one `coherent_single_commit`;
- every candidate group holds exactly one file and there are at most five → one
  `coherent_single_commit`.

When boundaries *are* split, a limitation records that they are advisory and that nothing was staged or
committed.

### Unassigned paths

Paths the classifier could not attribute (`unknown`) are returned in `unassignedPaths`, never forced into
a group and never dropped. A note states why. A caller reading only `suggestedBoundaries` can therefore
detect that the grouping is incomplete.

## Verification-command discovery (never executed)

This mirrors the existing Voila convention in
[`REPOSITORY_ORIENTATION.md`](REPOSITORY_ORIENTATION.md): a command that has not been run has no result,
and nothing is "verified" until formal receipts exist.

| Basis | Meaning |
|-------|---------|
| `declared_in_manifest` | `package.json` scripts, `Makefile` targets, `mise.toml` tasks |
| `declared_in_documentation` | a runner command in a fenced or inline code span of `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `README.md`, `docs/DEVELOPMENT.md` |
| `candidate` | inferred from an ecosystem convention (`Cargo.toml` → `cargo test`), declared nowhere |

Every record carries `executed: false` as a **literal type**, so no caller can set it to `true` through
the model. `commands.ts` imports no process-spawning API. A manifest declaration outranks the same
command found in prose. Documented commands must both begin with a recognized runner and read like a
check, so arbitrary shell in a code block is not harvested.

The result always carries the limitation: *"Discovered commands were NOT executed and are NOT verified."*

## Privacy behavior

The strongest property in the module: **a suspected secret value never appears in the returned
structure.**

- `scan.ts` is the single content chokepoint. It takes text and returns **rule names**. It uses
  `RegExp.test`, which yields a boolean; the match object is never produced, read, stored, hashed, or
  formatted. There is no code path from a matched substring to any output field.
- Bytes are read under a cap (`maxContentScanBytes`, default 64 KiB), decoded in memory, scanned, and
  dropped when the function returns.
- A content finding surfaces the **path** and the **rule name** only — no value, no line, no offset, no
  length, no digest.
- Attention reasons and suggestions are built from paths, counts, and rule names.
- Command discovery **withholds** a documented command that embeds a credential-shaped assignment,
  reporting only a count. The command text is never returned, because returning it would leak the value.
- Paths are always repository-relative; the absolute root never appears anywhere in the result.
- Filename heuristics judge the name only and say so in their reason.

Tests assert this directly: distinctive fake values shaped to trip four different rules are planted, the
entire result is `JSON.stringify`-ed, and the serialized string is asserted not to contain any of the
values — nor even the `AKIA` prefix or the `BEGIN RSA PRIVATE KEY` header. A real-repository test does
the same with a `.env` file.

## Determinism

- Every array is explicitly sorted; `byCategory` is a total record built in `CHANGE_CATEGORIES` order.
- `limitations` is de-duplicated and sorted.
- No timestamps, no random values, no absolute paths, no iteration over unordered structures without an
  explicit sort.
- Tested by inspecting the same fixture twice and comparing `JSON.stringify` output, by reversing input
  order for boundary suggestion, and by inspecting a real repository twice.

## Documented caps

| Limit | Default | Effect when it bites |
|-------|---------|----------------------|
| `maxFilesInspected` | 2000 | change set truncated; limitation declares the result incomplete |
| `maxFilesContentScanned` | 200 | remaining files marked `inspectionCapped`; no marker scan for them |
| `maxContentScanBytes` | 65536 | only the file's prefix is scanned; limitation says a later marker would be missed |
| `largeFileBytes` | 524288 | threshold for `unexpectedly_large_change` |
| `largeDiffLines` | 2000 | threshold for `unexpectedly_large_change` |
| `maxGitOutputBytes` | 8388608 | `execFile` output cap per git invocation |
| `gitTimeoutMs` | 15000 | wall-clock cap per git invocation |
| `maxCommandsDiscovered` | 100 | command list truncated, with the count reported |
| `maxManifestBytes` | 131072 | manifest/document read cap during discovery |

## Limitations

- Classification reads **paths, not content**. A source file named like a document is classified as a
  document. `confidence` is the honest signal.
- Attention heuristics are naming and shape heuristics. False positives are expected and preferred over
  silence; `possible_secret_filename` fires on `src/tokenizer.ts` because "tokenizer" contains "token",
  and that is an accepted trade.
- Credential-marker scanning covers a small set of well-known shapes. **Absence of a finding is not
  evidence that no secret is present.**
- Boundary suggestions are advisory and derived from paths. They cannot know intent.
- `source_without_test` and `potentially_missing_documentation` cannot tell whether behavior changed.
- Rename detection depends on git's own similarity detection.
- Ahead/behind require a locally-known upstream ref; the inspector never fetches.
- Submodule internals are not inspected.
- Nothing here is evidence of correctness. The inspector reports what it can see about a change set.

## Packet 5B integration contract (the seam)

Packet 5A implements **inspection only**. 5B will join it to claims, receipts, and delivery state. The
seam is already shaped for that, and nothing about it is implemented here.

**What 5B may rely on:**

- `inspectDelivery(root, options)` stays the single entry point, read-only and deterministic.
- `DeliveryInspection` is additive-only: new optional fields may appear; existing field meanings will
  not change silently.
- The vocabularies (`CHANGE_CATEGORIES`, `ATTENTION_KINDS`, `BOUNDARY_KINDS`, `DISCOVERY_BASES`) are
  stable identifiers suitable for persisting in state or rendering in a view.
- `runGit` and `fileSystem` remain injectable, so a delivery engine can inspect a synthetic or historic
  tree without a live worktree.

**What 5B must add, and where it attaches:**

| 5B concern | Seam |
|-----------|------|
| Turning a `SuggestedCommitBoundary` into a real commit | 5B owns all staging and committing. The inspector must stay read-only; a delivery engine is a separate module with its own, separately-audited write path. |
| Executing verification commands | A `DiscoveredCommand` is an input to a receipt producer. 5B decides what to run, runs it under its own explicit authority, and records a receipt. `executed: false` on the discovery record must never be flipped — a receipt is a different artifact with a different provenance. |
| Attention items → claims | A `DeliveryAttentionItem` is *not* a claim. 5B may require an operator acknowledgement for each `inspect_before_delivery` item before a completion claim is allowed, but the inspector must not gain a notion of "resolved". |
| Persisting an inspection | The result is a snapshot with no timestamp, like an orientation artifact. 5B decides whether to persist it, under what id, and how staleness is evaluated (HEAD movement is the obvious signal). The inspector must not write `.voila/`. |
| Delivery summaries | `summary`, `suggestedBoundaries`, and `limitations` are the raw material. Any rendered view must carry the `limitations` array; dropping it would present a bounded, heuristic inspection as a complete audit. |

**Invariants 5B must not break:** read-only inspection; suspected secret values never surfaced;
boundaries disjoint; unassigned paths visible; discovered commands never described as verified.

## Provenance

- Git record formats verified empirically against `git version 2.50.1 (Apple Git-155)` before the
  parsers were written.
- Command-evidence vocabulary adapted from the existing Packet 3 convention in
  [`REPOSITORY_ORIENTATION.md`](REPOSITORY_ORIENTATION.md) and
  [`docs/verification/PACKET_3_INTAKE_ORIENTATION.md`](../verification/PACKET_3_INTAKE_ORIENTATION.md).
- Verification record: [`PACKET_5A_DELIVERY_INSPECTOR.md`](../verification/PACKET_5A_DELIVERY_INSPECTOR.md).
