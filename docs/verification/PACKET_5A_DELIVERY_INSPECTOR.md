# Packet 5A Delivery Inspector — Verification Record

Read-only repository delivery inspector. Date: 2026-07-25.

Design: [`docs/design/DELIVERY_INSPECTOR.md`](../design/DELIVERY_INSPECTOR.md).

## Verification tiers — status at a glance

| Tier | Status |
|------|--------|
| 1. Automated acceptance (`npm run verify`) | **PASS** — 551/551 after the rebase onto Voila main (was 296/296 pre-rebase) |
| 2. Real-repository integration (temporary git repos) | **PASS** — 13 tests, included in tier 1 |
| 3. No-mutation proof (byte-identical porcelain + untouched index) | **PASS** — included in tier 1 |
| 4. Pi integration | **NOT APPLICABLE** — Packet 5A registers no tool, command, or UI |
| 5. GitHub CI | **PENDING** — branch pushed; recorded when Actions completes |

No pending tier is claimed as passed. The inspector has **no callers inside the extension**, so no
daily-use readiness is claimed.

## Environment

| Item | Value |
|------|-------|
| Worktree | `/Users/jenksed/Projects/voila-delivery-inspector` (git worktree) |
| Branch | `feat/delivery-inspector` |
| Base commit | `20effff08615016a2cb8cd881cf5e901dc6249f8` |
| Node | `v22.23.1` (via mise) |
| TypeScript | `7.0.2` |
| prettier | `3.9.6` |
| git | `2.50.1 (Apple Git-155)` |
| Dependencies added | **none** |
| `package.json` changes | **none** — the existing `test/**/*.test.ts` glob discovers the new tests |

All commands were run through mise:

```bash
export PATH="$HOME/.local/bin:$PATH"
mise exec -- npm run verify        # typecheck + format:check + test
mise exec -- npx tsc --noEmit
mise exec -- node --test "test/delivery-inspector/*.test.ts"
```

## Baseline

Confirmed **before** any implementation, at `20effff`:

```text
ℹ tests 191
ℹ pass 191
ℹ fail 0
```

Working tree clean at the start.

## What was implemented

Eleven modules under `src/delivery-inspector/`, importing nothing from Pi, `src/domain/`, `src/state/`,
`src/tools/`, `src/commands/`, `src/context/`, or `src/ui/`:

`types.ts`, `errors.ts`, `fs.ts`, `git.ts`, `classify.ts`, `scan.ts`, `attention.ts`, `boundaries.ts`,
`commands.ts`, `inspect.ts`, `index.ts`.

Single entry point: `inspectDelivery(root, options?)`.

## Automated results

```text
ℹ tests 296
ℹ suites 0
ℹ pass 296
ℹ fail 0
```

`npm run verify` = `typecheck` + `format:check` + `test`, all passing. Typecheck is clean with the
project's `strict`, `verbatimModuleSyntax`, `isolatedModules`, and `erasableSyntaxOnly` settings. No
`any` was introduced.

New tests, 105 total:

| File | Tests | Covers |
|------|-------|--------|
| `test/delivery-inspector/classify.test.ts` | 9 | every category reachable, rule order, determinism, totality, confidence discipline, dependency pairing, credential-name helpers, stem extraction |
| `test/delivery-inspector/git.test.ts` | 14 | read-only allowlist, refusal of all 24 mutating subcommands, refusal of redirect flags, porcelain v2 parsing (ordinary, rename, untracked, unmerged, initial, detached, spaces in paths), numstat parsing (counts, rename, binary), staged+unstaged count summing, non-repository handling, partial and total git failure, `primaryStatus` precedence |
| `test/delivery-inspector/attention.test.ts` | 18 | clean set raises nothing, each heuristic, template exclusion, fixture downgrade, vocabulary discipline, rule-names-only reporting, sorting, path de-duplication |
| `test/delivery-inspector/boundaries.test.ts` | 14 | module key, source+test grouping, unmatched test, documentation-only, migration cluster, unrelated-area split, disjointness, total coverage, unassigned visibility, both collapse rules, advisory note, determinism under input reordering, `assertDisjoint` throwing |
| `test/delivery-inspector/commands.test.ts` | 13 | manifest scripts, Makefile targets, mise tasks, ecosystem candidates, documented commands, prose rejection, manifest-outranks-docs de-duplication, credential withholding, sorting, malformed manifest, cap, empty repository |
| `test/delivery-inspector/inspect.test.ts` | 24 | clean, staged/unstaged/untracked, rename, deletion, binary (numstat and bytes), outside git, missing upstream, ahead/behind, detached, no commits, classification surface, suspicious filenames, **no secret leakage**, dependency mismatch, missing tests, boundary disjointness, discovery caveat, byte-identical determinism, sorted limitations, file cap, content cap, partial git failure, read-only call audit, root errors |
| `test/delivery-inspector/repository.test.ts` | 13 | real temporary git repositories (see below) |

`test/delivery-inspector/support.ts` holds the harness and is not a test file (the glob requires
`*.test.ts`).

## Temporary-repository procedures

Real-repository tests create their repositories under the OS temp directory (`mkdtemp` in `os.tmpdir()`),
never inside the project tree.

- Created with `git init -q -b main`; files written; `git add -A`; `git commit -q -m initial`.
- Identity is supplied **per invocation** with `-c user.email=inspector@example.invalid`,
  `-c user.name=Delivery Inspector Test`, `-c commit.gpgsign=false`. Nothing is written to the user's
  global or system git configuration.
- The test helper also sets `GIT_TERMINAL_PROMPT=0`, `LC_ALL=C`, and `GIT_OPTIONAL_LOCKS=0`, so the
  test's own `git status` probes cannot themselves rewrite the index and be mistaken for inspector
  mutation.
- Every repository is removed with `rm -rf` in a `finally` block.
- The ahead/behind test clones over a **filesystem path** (`git clone <local-dir>`) and fetches from that
  local remote. No network access occurs.
- `git mv`, `git rm`, `git add`, `git commit`, and `git checkout --detach` appear only in **test setup**,
  never in inspector code.

Real-repository coverage: clean repository; staged, unstaged, untracked, renamed, and deleted changes in
one pass; binary change; missing upstream; ahead/behind on a diverged clone; detached HEAD; repository
with no commits; non-repository directory; no-mutation proof; repeat-inspection determinism; real command
discovery; real `.env` handling; multi-boundary suggestion with disjointness.

## No-mutation proof

Test: `INSPECTION MUTATES NOTHING: porcelain status is byte-identical before and after`
(`test/delivery-inspector/repository.test.ts`).

Procedure:

1. Build a representative dirty state: staged modification, unstaged modification, untracked file,
   `git mv` rename, `git rm` deletion.
2. Warm the index with a throwaway `git status`, so the baseline is not attributed to the inspector.
3. Capture `git status --porcelain --untracked-files=all`, `git rev-parse HEAD`, `git log --oneline`, and
   `stat(.git/index)`.
4. Run `inspectDelivery(root)` **twice**.
5. `stat(.git/index)` **immediately**, before any further git command, so index changes are attributable
   to the inspector alone.
6. Re-capture the porcelain status and compare.

Assertions:

| Assertion | Result |
|-----------|--------|
| `git status --porcelain` byte-identical | PASS |
| `HEAD` unmoved | PASS |
| `git log --oneline` unchanged (no commit created) | PASS |
| `.git/index` size unchanged (nothing staged) | PASS |
| `.git/index` mtime unchanged (index not rewritten) | PASS |
| `git stash list` empty (no stash created) | PASS |

The index-mtime assertion is the load-bearing one, and it is why `GIT_OPTIONAL_LOCKS=0` is set on the
inspector's runner: without it `git status` persists a refreshed index, which is a real on-disk write.

Two further guarantees are tested independently of any repository:

- `createGitRunner` refuses all 24 subcommands in the test's mutating list, plus `-c`, `--git-dir=`, and
  `--exec-path=` style redirects (`test/delivery-inspector/git.test.ts`).
- Every argument vector the inspector actually issues is audited to be `rev-parse`, `status`, or `diff`
  (`test/delivery-inspector/inspect.test.ts`, "the inspector only ever asks git for read-only
  inspections").

## Privacy verification

Test: `NO SUSPECTED SECRET VALUE EVER APPEARS IN THE RETURNED STRUCTURE`
(`test/delivery-inspector/inspect.test.ts`).

Four distinctive fake values are planted, shaped to trip four different marker rules (AWS key id, GitHub
token, quoted password literal, private-key block). The **entire** `DeliveryInspection` is
`JSON.stringify`-ed and asserted not to contain any of them — nor the `AKIA` prefix, the
`BEGIN RSA PRIVATE KEY` header, or the password literal. The detection is still asserted to be reported,
by path and rule name only.

`a real untracked environment file is flagged without echoing its contents`
(`test/delivery-inspector/repository.test.ts`) repeats this against a real `.env` in a real repository.

`a documented command embedding a credential is withheld, not returned`
(`test/delivery-inspector/commands.test.ts`) proves the discovery path withholds the command text and
reports only a count.

`staged, unstaged, untracked, renamed, and deleted changes are all observed` additionally asserts the
absolute repository root appears nowhere in the serialized result.

No temporary fixture retained private content: all fixture values are obviously fake, and all temporary
repositories are deleted after each test.

## Ownership compliance

Verified immediately before committing:

```bash
git diff --name-only 20effff   # empty — no tracked file modified
git status --short             # only the new owned paths
```

Files added (all within the packet's ownership):

```text
src/delivery-inspector/{attention,boundaries,classify,commands,errors,fs,git,index,inspect,scan,types}.ts
test/delivery-inspector/{attention,boundaries,classify,commands,git,inspect,repository}.test.ts
test/delivery-inspector/support.ts
docs/design/DELIVERY_INSPECTOR.md
docs/verification/PACKET_5A_DELIVERY_INSPECTOR.md
```

No tracked file was modified. In particular: no change to `package.json`, `package-lock.json`,
`README.md`, `AGENTS.md`, `CLAUDE.md`, `docs/DEVELOPMENT.md`, `docs/project/PROJECT_LEDGER.md`,
`src/domain/**`, `src/state/**`, `src/tools/**`, `src/commands/**`, `src/context/**`, `src/ui/**`,
`.pi/**`, or `.voila/**`. No `test/fixtures/` directory was added; the in-memory filesystem made one
unnecessary.

## Rebase onto Voila main (Packet 4.5)

This packet was authored before the NewFang -> Voila rename and was rebased onto `main` at
`4bc9769` afterwards. The rebase itself was conflict-free: Packet 5A only adds files.

Two changes were then required.

**Rename.** The inspector's path rules, prose, tests, and docs moved from `.newfang/` to `.voila/`.
This was folded into the feature commit rather than appended, so every commit on the branch passes
the rename guard introduced in Packet 4.5.

**Legacy classification fix.** The rename alone left an unmigrated repository *worse* than before:
`.newfang/project.json` fell through to `configuration` and `.newfang/views/PROJECT_STATUS.md` to
prose `documentation`. Verified directly:

```text
.newfang/project.json              -> configuration   | structured configuration file
.newfang/views/PROJECT_STATUS.md   -> documentation   | prose document
```

Since a repository that has not yet run `/voila migrate --apply` still holds real canonical state
there, the legacy directory is now classified alongside `.voila/`, with a reason naming it as
legacy, and is treated as a state area in the generated-view-drift heuristic:

```text
.newfang/project.json              -> project_state   | canonical Voila project state under the legacy .newfang/ state directory
.newfang/views/PROJECT_STATUS.md   -> generated       | generated Voila view under the legacy .newfang/ state directory
```

Lookalike paths (`newfang/project.json`, `docs/newfang-notes.md`) are asserted **not** to match, and
`config.json` and `docs/design/X.md` still classify as before.

`LEGACY_STATE_DIR` is defined locally in `classify.ts` rather than imported from
`src/state/legacy.ts`, preserving this library's invariant that it imports nothing from canonical
state, tools, commands, context, or UI.

Three files gained rename-guard allowlist entries (`classify.ts` and the two touched test files);
`attention.ts` did not, because it imports the constant rather than spelling the directory — the
guard's staleness check caught the over-broad entry and it was removed.

### Independent review

The rename-only diff was also reviewed by an external model (MiniMax `MiniMax-M2.7` via `mmx text
chat`) as a second opinion. It confirmed literal-for-literal consistency and no smuggled behavioral
change, but asserted that a legacy `.newfang/` directory would simply be "unclassified" and that
this was acceptable. Direct execution of `classifyPath` showed that claim to be wrong — the files
were actively misclassified — which is what prompted the fix above. The review was advisory; the
finding came from running the code.

## Known limitations

Recorded honestly; the full list is in the design document.

1. **Classification is path-based.** Content is never consulted. A misleadingly named file is
   misclassified, which is why every classification carries a `confidence` and a stated reason.
2. **Attention items are heuristics, not findings.** False positives are expected and deliberately
   preferred over silence. `possible_secret_filename` fires on `src/tokenizer.ts`; this is tested as an
   accepted trade-off.
3. **Absence of a credential finding proves nothing.** The marker set covers a small number of
   well-known shapes, reads at most 64 KiB per file, and scans at most 200 files by default.
4. **Boundary suggestions cannot know intent.** They are advisory groupings derived from paths.
5. **`source_without_test` and `potentially_missing_documentation` cannot tell whether behavior
   changed.** Both are phrased as questions.
6. **Rename detection depends on git's similarity detection**, not on any analysis here.
7. **Ahead/behind require a locally-known upstream ref.** The inspector never fetches, so a stale remote
   ref yields absent counts plus a recorded limitation.
8. **Submodule internals are not inspected.**
9. **Line counts are summed across the staged and unstaged diffs** for a path that appears in both. This
   is documented in the model rather than split into two fields.
10. **Verified against git 2.50.1 only.** The porcelain v2 and numstat formats are documented stable
    formats, and the real-repository tests would surface a behavior change, but only this version was
    exercised.
11. **No Pi integration was exercised**, because none exists in this packet.

## What this packet does NOT implement

Explicitly out of scope, and absent from the code:

- No Pi tool, command, extension registration, skill, or UI surface.
- No reading or writing of `.voila/` canonical state; no schema change; no migration.
- No claims, verification receipts, completion transition, or proof model.
- No delivery summary rendering, changelog, or commit-message generation.
- No staging, committing, stashing, or any other git write — by construction, not by omission.
- No command execution and no network access.
- No dependency additions and no `package.json` script changes.
- No integration with a parallel packet's work.
- No caller of `inspectDelivery` anywhere in the extension. It is a proven library awaiting Packet 5B.

The Packet 5B integration contract — how this will later join proof and delivery state — is described in
the design document's final section. It is a described seam, and nothing about it is implemented here.
