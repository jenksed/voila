# Voila Operational Roadmap v2

## Local Distribution, Safe Publication, Delegated Work, and Uncoached Operation

## Status and authority

**Accepted direction as of 2026-07-27** — preserved as intake INT-10 revision 2 and established by
DEC-24 through DEC-29. This roadmap supersedes only DEC-13's package-sequencing clause and the
affected sequencing and pre-R7 publication restrictions in DEC-18 / ADR-0009. The remaining
doctrine, completed R1/R2 history, and R3–R7 program stand.

DEC-30, DEC-31, and DEC-32 record G0, G1, and L0.2 effect authority as **proposed**. This roadmap
authorizes building their deterministic executors and acceptance gates; it does not grant the
current Steward permission to stage, commit, push, mutate pull requests, merge, or create or push
Git tags.

**Provenance.** The owner's authored source is preserved byte-for-byte under INT-10. The only
substantive correction incorporated here is the owner-reviewed L0.2 tag-authority resolution recorded
against intake draft revision 1 and accepted in revision 2.

## 1. Product direction

Voila’s controlling outcome remains:

> The Project Steward completes accepted project work with less developer coordination while retaining truthful project state, bounded authority, and human control over consequential external actions.

The roadmap now has three connected capability lanes:

```text id="dqvjqc"
Local availability
→ Safe publication
→ Delegated execution
→ Operational integration
→ Continuity
→ Quiet proof
→ Uncoached dogfood
```

The revised sequence is:

```text id="b87xke"
L0    Local Pi Extension Release

G0    Safe Local Commit
G1    Safe GitHub Publication
      + North Mini Code publisher agent

R3-0  Delegation suitability and assignment compiler

R3A   Read-only worker
      + capability lease
      + structured result envelope
      + assignment fingerprint

R3B   Steering, cancellation, transcript inspection
      + bounded checkpoints
      + partial-result salvage

R3C   Isolated-write worker
      + path-scoped write lease
      + parent-controlled integration

R4A   Unified operational projection
      + separate result disposition
      + duplicate-assignment prevention

R4B   Automatic evaluation and integration
      + selective independent review

R4C   Drift and failure recovery
      + shadow model-routing experiment

R5    Fresh-session continuity
      + checkpoint-based recovery
      + compact operational trace

R6    Quiet proof reconciliation

R7    Uncoached dogfood
      + attention-budget metrics
      + delegation-value metrics
```

L0, G0, and G1 are priority insertions.

They do not replace or renumber the accepted R3–R7 operational program. G0, G1, and L0.2 remain
future capabilities until their respective deterministic executors and acceptance gates pass.

---

# 2. L0 — Local Pi Extension Release

## Objective

Install Voila once in the user’s local Pi environment and make it available across projects without copying `.pi/extensions/voila.ts` and the Project Steward skill into every repository.

Pi supports globally installed local-path packages, package manifests containing extensions and skills, and package discovery through `~/.pi/agent/settings.json`. A local-path package is referenced directly rather than copied.

## L0.1 — Global local-path alpha

Package Voila as a Pi package and install it globally from the development checkout.

Conceptual installation:

```bash id="awbo5b"
pi install /absolute/path/to/voila
```

The package manifest should expose:

```text id="1op3p6"
Voila extension
Project Steward skill
Voila prompts, when applicable
Voila themes, when applicable
```

Use a `pi` manifest in `package.json` rather than depending on accidental directory discovery.

Conceptually:

```json id="fjppvz"
{
  "name": "voila",
  "version": "0.1.0-alpha.1",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./pi-package/extensions"],
    "skills": ["./pi-package/skills"]
  }
}
```

Use repository-native paths after inspecting the current package structure.

## Package-boundary requirements

The installed package must:

* load from any project directory;
* remain quiet when a project is not initialized;
* expose `/voila init` deliberately;
* never create `.voila/` merely because Pi started;
* maintain canonical state independently per project;
* resolve the current repository and worktree correctly;
* avoid sharing active-operation state between projects;
* avoid leaking one project’s focus capsule into another;
* expose its package version and source;
* fail truthfully when the host Pi version is unsupported.

## Duplicate-load prevention

Do not load both:

```text id="d7yuym"
global Voila package
project-local Voila extension
```

in the same Pi session.

Preferred direction:

1. establish one canonical package entry point;
2. move development loading through that package;
3. remove or disable accidental `.pi/extensions/` auto-discovery for the old entry point;
4. retain a runtime duplicate-registration assertion as defense in depth.

Do not rely exclusively on an instance guard while continuing to load two copies.

## Compatibility contract

Record:

```text id="6fw8l5"
Voila package version
supported Pi version or range
supported Node version or range
canonical schema version
operation policy version
package source
```

Runtime dependencies required after installation must be listed as actual package dependencies rather than development-only dependencies. Pi’s Git package installation uses production dependencies by default.

## Multi-project acceptance

Test at least:

```text id="6lxaqi"
A. uninitialized repository
B. initialized healthy Voila repository
C. second initialized repository with different state
D. ordinary directory that is not a Git repository
E. repository with unsupported or malformed Voila state
F. the Voila development repository itself
```

Prove:

* no state crosses between projects;
* commands resolve the correct root;
* the extension loads once;
* the Project Steward skill loads;
* uninitialized projects remain unmodified;
* the development repository can dogfood the globally installed package.

## L0.2 — Git-pinned local alpha

After G1 exists, create a tagged Git alpha suitable for:

```bash id="xoxsi9"
pi install git:github.com/jenksed/voila@v0.1.0-alpha.1
```

Pinned Git package references are intentionally not moved by ordinary package updates.

L0.2 is not required before continuing to G0.

L0.1 is the immediate “use Voila across my projects” milestone.

### L0.2 tag authority

L0.2 may create exactly one initial Git alpha tag:

```text
v0.1.0-alpha.1
```

This is a narrow exception to the general deferral of tag and release publication. The roadmap
authorizes building the guarded capability. It does not grant immediate authority to create the tag.

Actual tag creation requires a separate, explicit, single-use owner authorization after the exact
target commit SHA is known. The authorization must be bound to:

```text
repository: jenksed/voila
tag: v0.1.0-alpha.1
exact target SHA
expected default branch
expected remote
package version
current release plan
```

The authority expires when the target SHA changes, the package contents change, verification becomes
stale, the tag already exists, the remote changes, or the authorization is used.

### Tag preconditions

Before creating the tag, Voila must verify:

1. L0.1 is accepted and dogfooded across multiple projects.
2. G0 and G1 are accepted.
3. The package version is exactly `0.1.0-alpha.1`.
4. The target commit is on the expected default branch.
5. The target commit is the exact owner-authorized SHA.
6. The working tree is clean.
7. Required local verification passes.
8. Required GitHub CI for the target commit passes.
9. No local tag named `v0.1.0-alpha.1` exists.
10. No remote tag named `v0.1.0-alpha.1` exists.
11. The remote repository identity is exactly the expected repository.
12. The package can be installed successfully from the resulting pinned reference.

### Allowed tag effect

Voila may create one unsigned annotated local tag named `v0.1.0-alpha.1`, point it at the exact
authorized commit, use a deterministic release message, push only that exact tag ref to the expected
remote, and verify the resulting remote tag and target SHA.

Voila may not:

- create any differently named or additional tag;
- move, replace, force-push, or delete an existing local or remote tag;
- use a wildcard tag push;
- push another branch as part of the tag transaction;
- create a GitHub Release;
- publish an npm package;
- generate a release changelog automatically;
- mark the release stable;
- sign the tag unless a later accepted packet adds signing; or
- infer authority from roadmap acceptance alone.

If any precondition fails, no tag is created or pushed. If local tag creation succeeds but remote
push fails, retain the local tag, report the partial transaction honestly, do not delete or recreate
it automatically, and require a new currentness check before retry.

### L0.2 sequence

```text
L0.1 accepted
→ G0 accepted
→ G1 accepted
→ relevant implementation PR merged by a human
→ target-commit CI passes
→ explicit single-use owner tag authorization
→ guarded tag transaction
→ pinned-install acceptance
```

Voila does not merge the prerequisite PR.

---

# 3. G0 — Safe Local Commit

**Active bounded implementation packet:**
[`G0_GUARDED_LOCAL_COMMIT.md`](G0_GUARDED_LOCAL_COMMIT.md), revised under DEC-34 so protected
completion—not a per-commit prompt—provides the proposed deterministic local authority. DEC-30 and
all development-repository commit effects remain unavailable until final G0 acceptance.

## Objective

Allow Voila to create accurate local commits from accepted project work without gaining remote publication authority.

The existing Delivery Engine already provides:

* read-only repository inspection;
* disjoint proposed commit boundaries;
* attention and risk classification;
* current claim status;
* candidate commit messages;
* detection of ungrouped paths.

G0 should extend that existing boundary rather than create a second delivery planner.

## New decision

Record a decision superseding only the old no-commit clause:

> Local commits are reversible project operations that Voila may perform through a deterministic guarded transaction when the user has requested a commit or the accepted project action explicitly authorizes one. Remote pushes and pull-request mutations remain separately authorized external actions.

Preserve the existing read-only summary and proposal tools.

Add a new execution layer beneath them.

## Authority model

### Local commit

A local commit may proceed when:

* the active work item authorizes the changed scope;
* the user has asked Voila to commit or the canonical next action explicitly requires committing;
* the commit plan is current;
* every included boundary is ready;
* no material ambiguity remains;
* the runtime gate permits the operation.

Do not ask for separate approval for every routine file once the bounded commit action is authorized.

### Remote publication

A local commit does not imply authority to:

```text id="dg35bz"
push
create a pull request
mark a pull request ready
merge
approve
release
tag
delete a remote branch
```

Those are G1 actions.

## Publication plan

Create a bounded `PublicationPlan` or equivalent artifact containing:

```text id="fwy8vf"
plan ID
project ID
work item
repository identity
worktree identity
branch
expected HEAD
effective content fingerprint
selected commit boundaries
exact path membership
untracked-file membership
attention findings
required verification
current verification result
proposed commit messages
created time
expiration/currentness state
```

The plan is invalid when:

* HEAD changes;
* relevant content changes;
* the branch changes;
* index state changes;
* path membership changes;
* required evidence becomes stale;
* a new blocking attention item appears.

The model must not bypass plan invalidation by repeating the request.

## Safe index policy

G0 v1 should require:

```text id="ninj6g"
no pre-existing staged changes
```

when the transaction begins.

This is intentionally conservative.

Do not attempt to preserve and merge arbitrary user staging state in v1.

For each commit boundary:

1. verify expected HEAD and fingerprint;
2. verify the index remains clean;
3. stage exactly the accepted paths;
4. verify staged paths exactly equal the boundary;
5. run `git diff --cached --check`;
6. rerun relevant secret and attention checks;
7. verify the final message;
8. create the commit;
9. verify the new commit parent and tree;
10. verify no unintended paths entered the commit;
11. verify the index returns to the expected state;
12. record the resulting SHA.

When a pre-commit hook changes files or rejects the commit:

* preserve the hook output;
* stop;
* do not bypass the hook;
* do not use `--no-verify`;
* do not create a replacement commit automatically.

## Hard prohibitions

G0 must not:

* commit on the default branch;
* amend;
* rebase;
* squash existing commits;
* create empty commits;
* use `--no-verify`;
* disable signing requirements;
* rewrite branch history;
* reset an existing commit;
* delete user changes;
* stage paths outside the accepted boundary;
* use shell-generated path lists;
* include unresolved conflict markers;
* commit from detached HEAD.

If a commit is created and a later boundary fails, retain the completed commit and report the partial transaction honestly.

Do not reset it automatically.

## Commit message contract

Commit messages may use:

```text id="1fkfsp"
canonical work-item intent
accepted change scope
path and change-shape metadata
verification result
known limitations
```

Do not include secret values, raw prompts, reasoning traces, or untrusted operation output.

The publisher agent introduced in G1 may improve the message, but the deterministic G0 message generator remains the fallback.

## G0 acceptance

G0 passes when Voila can:

```text id="0yu7jb"
inspect
plan
stage exact paths
commit
verify the created commit
leave unrelated work untouched
record the SHA
continue the project thread
```

without requiring the developer to manually run Git commands.

---

# 4. G1 — Safe GitHub Publication

## Objective

Allow Voila to push the current feature branch, open a GitHub pull request, and mark it ready for review.

Voila never:

```text id="n51m47"
approves the PR
submits an approving review
merges the PR
enables auto-merge
force-pushes
pushes directly to the default branch
deletes the remote branch
changes branch protection
publishes a release
```

## Remote authority

Remote publication requires one explicit, bounded owner authorization.

A request such as:

```text id="nb311w"
Publish this work for review.
```

may authorize one transaction containing:

```text id="gc91xm"
push the named current branch
create or reuse its PR
set the specified base branch
apply the approved title and body
mark the PR ready for review
```

The authority is:

* single use;
* repository-specific;
* branch-specific;
* remote-specific;
* base-branch-specific;
* tied to the current publication plan;
* invalidated by changed HEAD or content.

It is not permanent blanket approval.

## Push rules

Allow only:

```text id="tsd7hl"
current non-default feature branch
expected configured remote
fast-forward update
exact expected local HEAD
no tags
no force
```

Before pushing:

* inspect the remote URL;
* verify authentication;
* verify the target repository;
* fetch remote branch state;
* reject non-fast-forward updates;
* reject unexpected upstreams;
* reject default-branch pushes;
* rerun publication-plan currentness checks.

Do not silently add another remote.

## Pull-request transaction

Use GitHub’s authenticated CLI or another explicit supported GitHub adapter.

Preferred sequence:

```text id="2zaxpe"
1. Push the feature branch.
2. Check whether a PR already exists for head and base.
3. Reuse the existing PR when one exists.
4. Otherwise create a draft PR.
5. Verify repository, head, base, title, and body.
6. Mark the PR ready for review.
7. Read the resulting PR state and URL.
8. Record the publication result.
```

Creating as a draft first prevents a partially configured PR from immediately appearing ready.

If marking ready fails:

* leave the PR as draft;
* report the exact state;
* do not delete it;
* do not create a duplicate.

## PR state

Voila may create:

```text id="8mdj92"
draft
ready_for_review
```

Voila may not create or assert:

```text id="pgptrf"
approved
mergeable as a correctness claim
merged
release-ready
```

“Ready for review” means the authoring work is presented for human review.

It is not an approval.

## Idempotency

Repeated publication requests against the same repository, head branch, base branch, and HEAD must:

* reuse the existing PR;
* avoid duplicate pushes;
* avoid duplicate comments;
* avoid duplicate PRs;
* update title or body only when the authorized plan calls for it;
* never mark a closed PR open without explicit authority.

---

# 5. G1 Publisher Agent

## Purpose

Use a dedicated publisher agent to prepare high-quality Git communication while keeping publication authority deterministic.

Default provider:

```text id="uw9hs8"
OpenRouter
```

Default model:

```text id="c9xgox"
cohere/north-mini-code:free
```

North Mini Code is currently positioned by OpenRouter as an agentic coding model suited to software-engineering and terminal-oriented work, with a 256K context window.

## Critical boundary

The publisher agent may produce text.

It may not:

```text id="n4p58q"
select files
stage files
create commits
push
call GitHub
approve a PR
mark a PR ready
merge
change project state
grant authority
run shell commands
read arbitrary repository files
```

The deterministic publication engine owns all effects.

## Publisher input

Provide one redacted bounded `PublicationBrief`:

```text id="kpvxd2"
project and work-item identity
accepted objective
commit boundary summaries
path and change statistics
verification results
known risks
known limitations
base and head branch names
existing PR metadata when applicable
required output schema
```

Do not send:

* full repository history;
* environment values;
* credentials;
* raw canonical state;
* hidden reasoning;
* unrelated work items;
* unbounded diffs;
* operation output;
* source text that has not passed the publication redaction boundary.

Raw changed-file contents should not be required for v1.

## Publisher output

Require a structured result:

```text id="pz7dwb"
commit proposals:
  subject
  optional body
  boundary reference

pull request:
  title
  summary
  changes
  verification
  risks
  limitations
  reviewer notes

confidence
assumptions
unresolved ambiguity
```

Validate:

* boundary references;
* subject length;
* title length;
* required PR sections;
* absence of secrets;
* absence of invented verification claims;
* absence of approval or merge claims;
* consistency with the publication brief.

Model output is untrusted proposal data.

## Availability and fallback

The selected free model is currently served through one provider on OpenRouter, so model availability must not become publication authority or a single point of irreversible failure.

Behavior:

```text id="egowr7"
publisher succeeds
→ validate and use its proposal

publisher unavailable, rate-limited, or invalid
→ use Voila’s deterministic message generator
→ disclose that fallback was used

publisher returns conflicting claims
→ reject proposal
→ use deterministic fallback or stop on material ambiguity
```

Do not silently switch to another model.

## Configuration

Use an explicit configuration equivalent to:

```text id="i5ea1z"
publisher.provider = openrouter
publisher.model = cohere/north-mini-code:free
publisher.fallback = deterministic
```

Require the OpenRouter credential only when the publisher agent is invoked.

Voila’s base extension and local commits must continue functioning without it.

## Future convergence

The G1 publisher is a stateless, one-shot proposal agent.

It is not yet an R3 worker.

When R3A exists, its invocation may migrate onto the generic read-only worker substrate while preserving:

* the same `PublicationBrief`;
* the same result schema;
* the same lack of mutation tools;
* the same deterministic publication executor.

Do not build a second permanent worker architecture for publishing.

---

# 6. Revised delegated-work roadmap

## R3-0 — Delegation suitability and assignment compiler

Add:

* delegate-versus-direct suitability decision;
* bounded context compiler;
* canonical/observed/inferred/stale labels;
* explicit omitted-context summary;
* assignment budget;
* return contract.

The publisher agent’s bounded brief may inform the assignment compiler design, but it must not dictate the generic worker model.

## R3A — Read-only worker

Add:

* one Pi child worker;
* read-only capability lease;
* structured result envelope;
* assignment fingerprint;
* equivalent-assignment reuse;
* automatic result delivery.

First general worker uses:

```text id="mlisdm"
repository scouting
architecture review
debug analysis
test review
adversarial review
```

The publisher role may migrate onto this substrate after R3A acceptance.

## R3B — Steering and partial-result recovery

Add:

* parent-to-worker correction;
* bounded transcript inspection;
* cancellation;
* bounded checkpoints;
* partial-result salvage;
* no continuous developer supervision.

## R3C — Isolated-write worker

Add:

* dedicated Git worktree;
* path-scoped write lease;
* protected canonical paths;
* structured diff return;
* parent-controlled integration;
* G0 commit transaction after parent acceptance.

A write worker must not publish its own work.

It returns changes to the parent Steward.

The parent uses G0/G1.

## R4A — Unified operational projection

Unify:

```text id="4d9phf"
background operations
read-only workers
write workers
publication transactions
```

through one curated projection without forcing them into one giant schema.

Separate:

```text id="wvrupo"
runtime settled
assignment completed
result accepted
result integrated
publication completed
work item advanced
```

Add duplicate-assignment prevention.

## R4B — Automatic evaluation and integration

Add:

* parent result evaluation;
* integration decisions;
* focused follow-up;
* selective independent review;
* commit-plan handoff to G0;
* PR-publication handoff to G1.

## R4C — Drift and failure recovery

Add:

* scope-drift detection;
* correction;
* cancellation;
* partial-result preservation;
* bounded retry reasoning;
* shadow model-routing experiment.

The publisher model may contribute routing evidence, but no automatic routing decision should be based on one role.

## R5 — Fresh-session continuity

Persist enough to recover:

* active and interrupted operations;
* active workers;
* worker checkpoints;
* unsettled results;
* uncommitted integration state;
* local commits not yet pushed;
* pushed branches without PRs;
* draft PRs not yet ready;
* ready PRs awaiting human review;
* exact next justified action.

Do not automatically resume external publication after restart without checking the original authority scope.

## R6 — Quiet proof reconciliation

At the completion or publication boundary:

* identify unique verification contracts;
* execute each current contract once;
* evaluate all applicable claims;
* update readiness;
* avoid duplicate verification;
* feed the result into G0/G1 publication readiness.

A passing background operation remains distinct from a verification receipt.

## R7 — Uncoached dogfood

The dogfood scenario should now include:

```text id="uwidlp"
fresh-session Continue
one background operation
one delegated read-only task
one recoverable failure
one bounded code change
one safe local commit
one pushed feature branch
one ready-for-review PR
one boundary proof reconciliation
zero manual result transfers
zero manual Git command execution
zero PR approval or merge by Voila
```

Record:

* developer interruptions;
* worker-status checks;
* repeated questions;
* manual Git commands;
* manual result transfers;
* publisher fallback rate;
* rejected publisher proposals;
* commit transaction failures;
* publication retries;
* delegations that saved coordination;
* delegations that cost more than direct execution.

---

# 7. Authority summary

| Action                                      | Default R2/R3 authority                          |
| ------------------------------------------- | ------------------------------------------------ |
| Inspect repository                          | Allowed                                          |
| Run accepted local operation                | Runtime policy                                   |
| Create bounded local commit                 | Requested or canonically authorized local action |
| Amend/rebase/reset history                  | Denied                                           |
| Push feature branch                         | Explicit single-use publication authority        |
| Create draft PR                             | Explicit single-use publication authority        |
| Mark PR ready for review                    | Explicit single-use publication authority        |
| Approve PR                                  | Denied                                           |
| Merge PR                                    | Denied                                           |
| Enable auto-merge                           | Denied                                           |
| Force push                                  | Denied                                           |
| Publish release or tag                      | Not implemented                                  |
| Worker commits its own work                 | Denied                                           |
| Parent integrates and commits worker result | G0 guarded transaction                           |

---

# 8. Immediate implementation order

Proceed in this order:

```text id="thlqyb"
1. Record the revised roadmap and authority decisions.
2. L0.1 package Voila as a global local-path Pi extension.
3. Prove multi-project isolation and dogfood the package.
4. Supersede the Delivery Engine’s no-commit clause narrowly.
5. G0 implement current publication plans and safe local commits.
6. Dogfood G0 on Voila without pushing.
7. G1 implement guarded branch push and draft PR creation.
8. Add ready-for-review transition.
9. Add the bounded North Mini Code publisher proposal agent.
10. Dogfood G1 by publishing a Voila branch for human review.
11. L0.2 build the guarded single-tag transaction, then create the Git-pinned local alpha only after human merge, passing target CI, and explicit single-use owner tag authorization.
12. Begin R3-0.
13. Continue R3A through R7 in the accepted sequence.
```

---

# 9. Near-term milestone definitions

## Milestone A — Voila Everywhere

Passes when:

* Voila is installed globally in local Pi;
* it loads in unrelated projects;
* project state remains isolated;
* uninitialized projects are not mutated;
* the development repository dogfoods the package;
* version and compatibility are visible.

## Milestone B — Voila Commits Safely

Passes when:

* Voila creates a local commit from an accepted plan;
* exact paths are enforced;
* hooks are honored;
* unrelated changes remain untouched;
* no history rewrite occurs;
* the resulting commit is verified.

## Milestone C — Voila Publishes for Review

Passes when:

* Voila pushes a feature branch;
* creates or reuses one PR;
* uses the North Mini Code publisher proposal when available;
* creates the PR as draft;
* verifies its metadata;
* marks it ready for review;
* never approves or merges it;
* reports the URL and exact final state.

## Milestone D — Delegation Loop

Passes when R3A–R4C complete:

```text id="dshzo5"
delegate
→ observe
→ settle
→ evaluate
→ integrate
→ commit
→ publish for review
→ continue
```

without developer orchestration.

## Milestone E — Operational Loop v1

Passes only after R7 uncoached dogfood.

---

# 10. Explicitly deferred

Do not pull these into L0, G0, or G1:

```text id="mzygfj"
automatic commits after every edit
automatic pushing
direct default-branch commits
PR approval
merging
auto-merge
force pushing
rebasing
general tag creation and release publication
changelog automation
multi-provider publisher routing
remote worker execution
multiple simultaneous workers
workflow DSLs
generic RBAC
cross-project orchestration
```

L0.2 contains one explicit exception for the separately owner-authorized
`v0.1.0-alpha.1` Git installation tag. Additional tags, stable releases, GitHub Releases,
package-registry publication, signing, and release automation require later accepted decisions.

Release publication and merge authority remain deferred. Ready-for-review PR creation does not imply
either.