# End-to-End Development with Voila

**Status:** Draft v0.1 for iteration  
**Last reviewed:** July 26, 2026  
**Repository baseline:** Current `main`, including the Phase 6 delivery engine, the Phase 7 headless self-hosting gate, and the global Pi-extension installer  
**Audience:** A developer using Voila and a coding model to take work from intent through an evidence-backed delivery proposal

Voila is not primarily a code generator. It is a project-stewardship layer that helps a developer preserve intent, establish accepted project truth, maintain a justified execution path, require evidence before completion, and inspect a change before crossing the Git delivery boundary.

This guide consolidates the repository's product direction, operating rules, Project Steward skill, design documents, commands, and current implementation into one practical workflow.

It covers:

- installing Voila so it loads in other repositories;
- initializing and orienting a project;
- starting from an idea, plan, existing repository, bug, or interrupted project;
- converting a reviewed source into canonical project truth;
- shaping bounded work and acceptance criteria;
- implementing while maintaining decisions, assumptions, risks, focus, and next action;
- creating claims and immutable verification receipts;
- completing work through the protected gate;
- preparing an evidence-aware delivery and coherent commits;
- resuming work safely across sessions;
- understanding what Voila does not yet automate.

For implementation-level detail, follow the source links at the end of this guide.

---

## 1. The operating model

Three actors share responsibility, but they do not share the same authority.

| Actor | Owns | Must not do |
| --- | --- | --- |
| **Human developer** | Final intent, acceptance of interpreted project truth, material decisions, risky or destructive actions, and the Git/publish boundary | Treat model confidence as confirmation; accept an interpretation without reviewing it; assume passing tests prove more than they test |
| **Project Steward** | Reading context, interpreting sources, maintaining focus and next action, proposing work, integrating implementation, recording decisions/assumptions/risks, forming claims, and preparing delivery | Silently apply an intake; edit `.voila/` directly; claim completion without the protected transition; hide stale or failed evidence |
| **Voila** | Exact source preservation, schemas, provenance, lifecycle rules, atomic persistence, immutable receipts, repository fingerprints, protected completion, and read-only delivery inspection | Decide product intent; guarantee that a model interpreted a source correctly; commit, push, open a pull request, or release |

The core boundary is:

> The model interprets. Voila enforces. The human accepts.

### 1.1 Delegate work, never ownership

A model, specialist, external coding harness, or human collaborator may perform a bounded part of the work. The Project Steward still owns integration across the complete result:

- Does the implementation match accepted intent?
- Did a material decision change?
- Are assumptions still valid?
- Did a new risk appear?
- Does every completion claim have current evidence?
- What is the next justified action?

A handoff transfers work, not accountability.

### 1.2 Evidence before completion

A changed file is not evidence that the intended behavior exists.

A meaningful completion path normally includes:

1. explicit acceptance criteria;
2. one or more honest claims mapped to those criteria;
3. executable verification commands;
4. immutable receipts tied to the current repository fingerprint;
5. no unresolved completion blockers;
6. the protected completion transition.

Voila protects its own canonical state transition. It does not guarantee that every statement made by a model is true, that a test suite is sufficient, or that a manually edited `.voila/project.json` is trustworthy.

### 1.3 Quiet autonomy, visible decisions

The Steward should proceed without interrupting for every reversible implementation detail. It should surface decisions that materially affect:

- scope;
- architecture;
- compatibility;
- security;
- data integrity;
- user-visible behavior;
- acceptance criteria;
- delivery boundaries;
- cost or external effects;
- risk.

### 1.4 Progressive rigor

Use enough process for the work rather than maximum ceremony every time.

| Rigor | Suitable work | Expected evidence |
| --- | --- | --- |
| **Research** | Discovery, feasibility, architecture evaluation | Sources, findings, uncertainty, recommendation; no automatic authorization to build |
| **Sketch** | Prototype, experiment, disposable proof | Main path demonstrated, important failure noted, disposal or promotion decision stated |
| **Build** | Normal feature or application work | Acceptance criteria, relevant tests, docs where needed, current receipts |
| **Harden** | Security, resilience, compatibility, production readiness | Deeper failure testing, operational review, explicit risk treatment, stronger verification |
| **Release** | Final preparation and delivery | Current proof, documentation accuracy, delivery inspection, coherent commit boundaries, human approval |

Voila records a project phase, but a complete policy-driven phase-transition workflow is not yet implemented. Treat rigor changes as material operating decisions and record them explicitly.

---

## 2. The end-to-end lifecycle

The current product supports this control flow:

```text
idea, request, plan, bug, or existing repository
    ↓
install/load Voila and initialize project state
    ↓
preserve source
    ↓
bounded repository orientation
    ↓
model interpretation with provenance
    ↓
human understanding review
    ↓
accepted canonical project truth
    ↓
focus + next justified action
    ↓
implementation and project-operations updates
    ↓
claims mapped to exact acceptance criteria
    ↓
executable verification receipts
    ↓
protected completion
    ↓
read-only delivery inspection and commit proposal
    ↓
human Git / PR / release action
```

### 2.1 What Voila provides now

- global loading through a reversible Pi-extension shim;
- canonical per-project `.voila/` state;
- explicit state-directory and schema migrations;
- work items, decisions, assumptions, and risks;
- exact intake-source preservation;
- reviewable model interpretations with provenance;
- durable draft revisions and review records;
- bounded repository orientation and staleness detection;
- a generated project brief and automatic context injection;
- claims tied exactly to acceptance criteria;
- executable verification and immutable receipts;
- repository-fingerprint-based evidence freshness;
- protected completion;
- read-only delivery inspection;
- evidence-aware delivery summaries;
- advisory, disjoint commit-boundary proposals;
- a keyboard-first Steward Console.

### 2.2 Current boundaries

Voila does **not** currently provide:

- runtime subagent delegation;
- background execution;
- sandboxed verification;
- remote execution;
- model routing or cost tracking;
- browser, screenshot, manual-attestation, or other non-command evidence;
- automatic staging, committing, pushing, pull-request creation, or release automation;
- multi-writer locking or team approval bundles.

The lack of a commit tool is deliberate. Voila proposes; a human crosses the Git boundary.

---

## 3. Install Voila for use in other repositories

Voila's source remains in its own checkout. A global Pi-extension shim re-exports that checkout's adapter so every Pi session can load the same implementation.

From the Voila repository:

```bash
mise install
mise exec -- npm install --ignore-scripts
node scripts/install-global.mjs
```

Check the installation:

```bash
node scripts/install-global.mjs --status
```

Remove it:

```bash
node scripts/install-global.mjs --remove
```

### 3.1 What the installer changes

The installer writes one generated shim at:

```text
~/.pi/agent/extensions/voila.ts
```

The shim points to:

```text
<voila-checkout>/.pi/extensions/voila.ts
```

It does **not** copy Voila's source into each project.

Consequences:

- there is one implementation source of truth;
- pulling updates in the Voila checkout updates what every project loads;
- canonical project state remains local to each repository in `.voila/`;
- moving or deleting the Voila checkout breaks the shim until it is reinstalled;
- the installer refuses to overwrite or delete a foreign `voila.ts` it did not create.

### 3.2 Verify the Voila checkout before global use

From the Voila repository:

```bash
mise exec -- npm run verify
```

The repository pins Node and Pi versions through `mise.toml` and `package.json`. A globally loaded shim still imports the implementation and dependencies from this checkout, so keep the checkout installed and healthy.

### 3.3 Start in a target repository

In any Git repository, start Pi using your normal invocation. The global extension should load and show an ambient hint when no Voila state exists.

Then run:

```text
/voila init
/voila doctor
/voila status
```

Initialization creates per-project `.voila/` state and refuses to overwrite existing state.

Git is required for current evidence. Without Git, Voila cannot produce a current repository fingerprint, claims cannot become supported, and work cannot pass protected completion.

### 3.4 Provider authentication

Provider authentication is performed manually through Pi's `/login` workflow. Voila does not read, print, copy, or modify provider credentials.

---

## 4. Start every session by recovering truth

A productive session does not begin with “What should I code?” It begins by recovering the durable project position.

The Project Steward skill instructs the model to call `voila_get_project_context` before project work. Voila also injects a compact deterministic context block before the agent starts.

Human-facing commands:

```text
/voila home
/voila status
/voila backlog
```

Use them to answer:

1. What am I responsible for now?
2. What is the focus item?
3. What is the next justified action?
4. Why is it next?
5. What is blocked or risky?
6. Is an intake waiting for review?
7. Is the orientation stale?
8. What proof is pending, unsupported, or stale?

### 4.1 Recommended session-opening prompt

```text
Act as the Voila Project Steward for this repository.

Read canonical project context first. Check whether orientation is stale, identify any pending intake, review the focused work item and its exact acceptance criteria, inspect open high-impact risks, and tell me the next justified action with a concise rationale.

Do not edit .voila/ directly. Use Voila tools for project truth. Do not begin implementation until you can state which accepted work item the change serves.
```

### 4.2 Run doctor when state may be unhealthy

```text
/voila doctor
```

Use it when:

- the project was freshly cloned;
- the runtime changed;
- `.voila/` was migrated;
- generated views appear inconsistent;
- intake or orientation artifacts may be missing;
- a session ended during a write;
- the widget reports a state error;
- a completed item no longer revalidates.

Doctor reports. It does not repair or migrate.

### 4.3 Handle migration explicitly

Inspect:

```text
/voila migrate
```

Apply only after reviewing the migration summary:

```text
/voila migrate --apply
```

Migrations are explicit, validated, backed up, and atomic. Do not work around a migration requirement by editing state manually.

---

## 5. Repository orientation

Orientation is a bounded snapshot, not an exhaustive repository audit.

It answers five questions and then stops:

1. What is this repository for?
2. What operating instructions govern work here?
3. What is currently in flight?
4. How is it built, tested, and verified?
5. What is the next justified action?

### 5.1 Ordered inspection strategy

The Project Steward should inspect in this order:

1. `AGENTS.md`, then harness-specific files such as `CLAUDE.md`;
2. `README.md`;
3. canonical Voila context and `.voila/briefs/PROJECT_BRIEF.md`;
4. the package manifest;
5. runtime pins and CI configuration;
6. product and architecture index documents;
7. top-level implementation areas;
8. current Git branch, HEAD, and worktree state;
9. only the active plans relevant to current work.

Aim for fewer than roughly twelve file reads. Record unknowns instead of continuing indefinitely.

### 5.2 Record orientation through Voila

`/voila orient` reports the current orientation and staleness:

```text
/voila orient
```

The model records a fresh snapshot with `voila_record_orientation` after performing the bounded inspection.

A record includes:

- repository purpose;
- branch, HEAD, and dirty state when available;
- instruction files and exact SHA-256 hashes;
- key documents;
- implementation areas;
- build/test/check commands;
- relevant work;
- risks and unknowns;
- provenance naming what was actually read.

### 5.3 Command findings must be honest

| Basis | Meaning |
| --- | --- |
| `declared_in_documentation` | A document or manifest presents the command. The orientation names the source. |
| `observed_in_session` | The command was actually run during this orientation. Passed or failed may be recorded. |
| `candidate` | The command looks likely but was not run. No result may be attached. |

Orientation does not create formal proof. Reserve **verified** for a Voila receipt.

### 5.4 When to re-orient

Create a fresh orientation when:

- none exists;
- an instruction file changed;
- the active plan changed materially;
- repository structure moved enough to make the old map misleading;
- work resumed after substantial outside changes;
- the active implementation area was not covered previously.

### 5.5 Recommended orientation prompt

```text
Orient this repository using the Project Steward orientation playbook.

Keep the inspection bounded. Read instructions first, then README, canonical Voila context, the manifest, runtime pins, CI, only index-level product or architecture documents, likely implementation areas, Git state, and the active plan.

Record the orientation with exact instruction-file hashes, repository-relative paths, honest command bases, provenance, risks, and unknowns. Stop once the five orientation questions are answered.
```

---

## 6. Bring work into the project

Voila accepts two main intake forms:

1. a repository file, such as a product brief, specification, bug report, implementation lock, or release checklist;
2. exact conversational text preserved through `voila_create_intake`.

A source is preserved **before** it is interpreted.

### 6.1 Preferred path: use a repository file

For meaningful work, create or locate a durable source document, for example:

```text
docs/plans/FEATURE_NAME.md
```

A useful source normally states:

- the problem or desired outcome;
- intended users or operators;
- constraints;
- locked decisions;
- explicit non-goals;
- requirements;
- acceptance criteria;
- risks or unknowns;
- delivery expectations.

The document does not need a Voila schema.

Preserve it:

```text
/voila intake docs/plans/FEATURE_NAME.md
```

This stores exact source bytes, a SHA-256, and metadata. It interprets and applies nothing.

### 6.2 Conversational intake

For a rough idea or small request:

```text
Preserve the following exact request as a conversational Voila intake before analyzing it:

<request>

Then read the preserved source, stage a structured interpretation with provenance, and stop for my review. Do not apply it.
```

A file intake is preferred whenever the source already exists as a file. The model should never retype a repository file into a text intake.

### 6.3 Common starting situations

#### Existing-project feature

Preserve the feature brief, orient to current architecture and tests, and create work that respects existing conventions.

#### New project from an idea

Preserve the idea, but avoid immediately creating a large implementation backlog. The first work item may be discovery, a vertical slice, or a disposable prototype.

#### Bug fix

Preserve observed behavior, expected behavior, reproduction steps, safe environment details, impact, workaround, and regression criteria.

#### Investigation

Use Research rigor. Do not presume implementation. Complete with findings, evidence strength, remaining uncertainty, and a recommendation.

#### Release preparation

Orient and audit current repository truth before accepting earlier completion claims. Do not invent historical receipts.

---

## 7. Interpret, review, and accept project truth

After preservation, the Project Steward:

1. reads `.voila/intakes/INT-n/source.md`;
2. classifies the source;
3. distinguishes source statements from model inference;
4. identifies conflicts and possible duplicates;
5. proposes only useful work items;
6. proposes a next action and rationale;
7. stages a draft with `voila_stage_intake_draft`;
8. stops for human review.

Staging changes no canonical project truth.

### 7.1 Classification vocabulary

Use the narrowest accurate category:

- objective;
- locked decision;
- proposed decision;
- constraint;
- requirement;
- acceptance criterion;
- open question;
- assumption;
- risk;
- non-goal;
- evidence;
- example.

Every source-derived finding must cite provenance. Model additions must be marked `model_inference`.

### 7.2 Preserve terminology and uncertainty

The Steward must not silently:

- rename concepts from the source;
- turn proposals into accepted decisions;
- smooth over contradictions;
- convert examples into requirements;
- resolve a material question without the human;
- present inference as source truth.

A blocking conflict prevents apply.

### 7.3 Do not create a backlog explosion

Do not turn every requirement into a work item.

A work item should represent a coherent outcome, task, or defect that can be implemented and completed. Requirements may constrain one or more work items without becoming separate tasks.

Check canonical state for duplicates before proposing new work.

### 7.4 Review the understanding

```text
/voila intake review
```

Target a specific intake:

```text
/voila intake review INT-3
```

Review:

- source statements;
- model inferences;
- locked and proposed decisions;
- assumptions and risks;
- open questions;
- blocking and warning conflicts;
- possible duplicates;
- proposed work items;
- exact apply effects;
- proposed next action and rationale.

### 7.5 Request a revision

```text
/voila intake revise "Do not treat the database choice as locked; it remains an open decision."
```

Target an intake:

```text
/voila intake revise INT-3 "Split the release criterion from the implementation criterion."
```

Replace earlier feedback only when intended:

```text
/voila intake revise INT-3 "Use this correction instead of my earlier request." supersede
```

Revision feedback is appended durably. The corrected interpretation becomes a new numbered draft; prior drafts and understanding checks remain preserved.

### 7.6 Preview and apply

Preview:

```text
/voila intake apply
```

Apply after reviewing the exact effect:

```text
/voila intake apply confirm
```

Apply requires:

- `review_required` status;
- the exact reviewed revision;
- no blocking conflict;
- explicit human confirmation.

Reapplying the same accepted revision is idempotent.

### 7.7 Reject an intake

```text
/voila intake reject "The request was superseded before implementation."
```

Or:

```text
/voila intake reject INT-3 "Replaced by INT-4."
```

The source, drafts, and review history remain preserved.

---

## 8. Shape executable work

After applying an intake:

```text
/voila backlog
/voila decisions
/voila assumptions
/voila risks
/voila brief
```

A good work item has:

- an outcome-oriented title;
- a bounded description;
- explicit acceptance criteria;
- accurate dependencies;
- realistic priority;
- no hidden product decision disguised as implementation detail.

### 8.1 Acceptance criteria are load-bearing

Claims must quote covered acceptance criteria **exactly**. Write criteria that are:

- observable;
- specific;
- testable by an executable command where possible;
- scoped to a coherent result;
- free of vague language unless the vague term is separately defined.

Weak:

```text
The feature works correctly.
```

Stronger:

```text
A duplicate request with the same event ID does not create a second delivery record.
```

Stronger when the evidence path is explicit:

```text
The duplicate-event integration suite passes for sequential and concurrent duplicate submissions.
```

Do not make criteria weak merely to make them easy to satisfy.

### 8.2 Focus and next action

Set focus:

```text
/voila focus NF-12
```

Clear it:

```text
/voila focus clear
```

The Steward should use `voila_set_next_action` to record an action and rationale.

Useful action:

```text
Implement the repository adapter for NF-12, then run its integration tests.
```

Useful rationale:

```text
The adapter contract blocks the API handler and is the smallest reversible slice that tests the accepted architecture.
```

Focus is not lifecycle status.

### 8.3 Recommended execution-planning prompt

```text
Review the focused work item, its exact acceptance criteria, dependencies, linked risks, accepted decisions, and relevant assumptions.

Propose the smallest coherent implementation slice that advances the accepted outcome. Identify only material questions that would change the implementation. For reversible details, make and record an explicit assumption rather than interrupting unnecessarily.

Before editing, state the likely files or modules in scope, the tests that should change, and the evidence path for each acceptance criterion.
```

---

## 9. The implementation loop

For each bounded slice:

1. recover canonical context;
2. confirm the focused work item and accepted criteria;
3. inspect only necessary implementation areas;
4. implement the smallest coherent change;
5. run fast development checks;
6. update decisions, assumptions, risks, dependencies, and status when reality changes;
7. inspect the diff and behavior;
8. repair failures;
9. decide whether the slice is ready for formal claims and receipts;
10. update the next justified action.

### 9.1 Development checks are not proof receipts

During implementation, a model may run commands for feedback. Those results are useful but do not become Voila proof because the model reports them.

Formal evidence must be recorded through:

- `voila_run_verification`; or
- `/voila verify`.

This prevents “tests passed” prose from silently becoming canonical evidence.

### 9.2 Keep project truth current

Use Voila tools when:

- a proposed decision becomes accepted or superseded;
- an assumption becomes validated or invalidated;
- a risk is discovered, mitigated, accepted, or closed;
- a dependency changes;
- a work item becomes blocked;
- a new defect appears;
- the next action changes after a failure;
- a work item's acceptance criteria need legitimate correction before proof.

Never edit `.voila/project.json`, generated views, intake artifacts, review logs, or receipts by hand.

### 9.3 Handle failures honestly

When a test or experiment fails:

1. state the failure accurately;
2. decide whether it reveals a defect, invalid assumption, risk, or plan change;
3. update canonical truth where appropriate;
4. repair within accepted scope;
5. escalate when the failure changes a material decision or criterion.

A failed receipt is valid evidence of failure. It is never deleted or overwritten.

### 9.4 Manual specialist handoffs

Voila does not yet spawn runtime subagents. You may use another model or harness manually for bounded work.

A useful handoff contains:

```text
Work item: NF-n
Accepted outcome:
Exact acceptance criteria:
Relevant accepted decisions:
Constraints and non-goals:
Files/modules in scope:
Files/modules out of scope:
Checks to run:
Expected artifacts:
Known risks:
Return: changed files, behavior, tests, failures, assumptions, unresolved questions.
```

The Project Steward must inspect and integrate the result. A specialist's completion statement is not protected completion.

---

## 10. Claims

A claim says something specific and checkable about one work item and names the exact acceptance criteria it covers.

Creating a claim proves nothing. It begins as `pending`.

### 10.1 Good claim design

A useful claim:

- is narrower than a marketing statement;
- describes observable behavior;
- covers exact criterion text;
- can be evaluated by one coherent verification path;
- records known limitations honestly.

Example:

```text
The duplicate-event integration suite demonstrates that sequential and concurrent submissions with the same event ID produce one canonical delivery record.
```

Limitation:

```text
The suite uses SQLite and does not establish behavior under a distributed database deployment.
```

### 10.2 Claim granularity

One claim may cover multiple criteria when one verification command genuinely establishes all of them.

Use separate claims when:

- criteria require different test suites;
- one criterion is documentation and another is runtime behavior;
- evidence has different limitations;
- one part can pass while another fails;
- one result would otherwise overstate what was proven.

Avoid:

- one vague claim covering an entire release;
- many trivial claims written only to satisfy the gate.

### 10.3 Create and require claims

The Steward uses:

- `voila_create_claim`;
- `voila_require_claim`.

Ask it to show the mapping first:

```text
For NF-12, propose the minimum honest set of claims needed to cover every acceptance criterion.

Copy every criterion exactly. Do not create claims merely to satisfy the gate. For each claim, identify the command that could support it and any limitation that remains after that command passes.

Create and require the claims only after showing the mapping.
```

Inspect:

```text
/voila claims NF-12
/voila proof NF-12
```

---

## 11. Verification receipts

Verification is executed as a structured executable and argument array with no shell.

```text
/voila verify CLM-n -- executable arg1 arg2 ...
```

Examples:

```text
/voila verify CLM-4 -- mise exec -- npm run verify
/voila verify CLM-5 -- npm test
/voila verify CLM-6 -- node --test test/delivery-engine.test.ts
```

The first `--` separates the claim ID from the executable. Later `--` tokens are passed as arguments.

### 11.1 No shell semantics

The runner does not support:

- pipes;
- output redirection;
- command chaining;
- shell variable expansion;
- aliases;
- one quoted shell command string.

When complex setup is needed, create a repository script and verify that executable script explicitly.

### 11.2 Verification is not sandboxed

The command runs with the caller's privileges and may have side effects.

Before executing it, consider whether it may:

- delete or overwrite data;
- contact production services;
- publish packages;
- mutate credentials;
- write outside the repository;
- incur cost;
- trigger irreversible external behavior.

External or destructive verification requires explicit human authorization.

### 11.3 Receipt results

A recorded receipt may be:

- passed;
- failed;
- errored;
- timed out.

Tool success means the receipt was recorded. It does **not** mean verification passed.

Each receipt records:

- claim ID;
- executable and arguments;
- repository-relative working directory;
- start and finish time;
- result and exit code when available;
- bounded stdout and stderr artifacts;
- hashes and truncation state;
- repository fingerprint.

Receipts are immutable.

### 11.4 Evidence states

| State | Meaning |
| --- | --- |
| `pending` | No receipt exists. |
| `supported` | The newest receipt matching the current repository fingerprint passed. |
| `unsupported` | The newest current receipt failed, errored, or timed out. |
| `stale` | Receipts exist, but none matches the current repository fingerprint. |

Stale evidence never passes completion.

### 11.5 Run formal verification late enough

Repository changes invalidate evidence. A practical sequence is:

1. implement;
2. run fast checks and repair;
3. inspect the complete diff;
4. update docs and project truth;
5. create and require claims;
6. run formal Voila verification;
7. inspect proof;
8. complete the work item;
9. generate the delivery proposal.

Do not change source after verification and continue describing the receipt as current.

---

## 12. Protected completion

Only this command can move a work item to `completed`:

```text
/voila complete NF-12
```

Inspect proof first:

```text
/voila proof NF-12
```

Completion is refused when any applicable gate fails, including:

- the item is missing;
- the item is cancelled;
- the item is blocked or carries a blocked reason;
- a dependency is incomplete;
- no acceptance criteria exist;
- no required claims exist;
- a required claim is missing;
- an acceptance criterion is uncovered;
- a required claim is pending, unsupported, or stale;
- an open high-impact linked risk remains.

A rejection reports every failing gate and changes nothing.

### 12.1 Do not game the gate

When completion is rejected:

- fix the named problem;
- do not weaken criteria solely to pass;
- do not write a misleading claim;
- do not hide limitations;
- do not close a risk without real resolution or acceptance;
- do not restate completion in conversation as though the gate accepted it.

Sometimes the correct result is that the item is not done.

### 12.2 Completion is scoped

Protected completion means Voila accepted the state transition under the recorded criteria, claims, risks, dependencies, and current receipts.

It does not automatically mean:

- the entire project is release ready;
- tests are comprehensive;
- security review occurred;
- production behavior is guaranteed;
- every non-functional expectation was covered;
- publishing is approved.

---

## 13. Prepare delivery

When the worktree is ready for handoff:

```text
/voila deliver
/voila commit
```

### 13.1 Delivery summary

`/voila deliver` combines read-only repository inspection with canonical project truth. It reports:

- repository identity and position;
- what changed;
- every claim at its real status;
- risks and attention items;
- limitations;
- discovered verification commands that were **not** executed;
- proposed commit boundaries;
- the canonical next action.

A delivery may honestly report zero supported claims.

### 13.2 Commit suggestions

`/voila commit` proposes advisory, disjoint boundaries and paste-ready message shapes.

Generated subjects describe change shape, not semantic intent. Rewrite them.

Generated:

```text
feat: add 7 files
```

Human rewrite:

```text
feat: add evidence-backed delivery summaries
```

### 13.3 Commit readiness

| Readiness | Meaning |
| --- | --- |
| `blocked` | A strong attention item touches the boundary. Inspect before committing. |
| `inspect_first` | A review-worthy or informational item touches it. |
| `ready` | No heuristic attention item touches it. This is not a correctness guarantee. |

Never present a `blocked` boundary as safe.

### 13.4 Delivery attention is heuristic

The inspector may surface:

- possible secret or credential files;
- environment-file changes;
- possible secret-content markers;
- unexpectedly large changes;
- binary changes;
- generated output mixed with source;
- manifest/lockfile mismatch;
- source changes without tests;
- potentially missing docs;
- migrations without tests;
- unrelated top-level areas;
- deleted verification evidence;
- dirty files outside apparent scope;
- unassigned paths.

These are prompts to inspect, not declarations that the change is defective.

### 13.5 The human Git boundary

Voila never stages, commits, pushes, or opens a pull request.

Review deliberately:

```bash
git status --short
git diff --check
git diff
git add <coherent paths>
git diff --cached
git commit
```

Push only after explicit approval:

```bash
git push -u origin <branch>
```

Pull-request creation, merge, publish, and release remain separate actions.

---

## 14. Evidence freshness across commits

The repository fingerprint includes Git HEAD plus tracked, staged, unstaged, and untracked repository content, excluding `.voila/` bookkeeping.

A commit moves HEAD. Therefore, a receipt recorded before a commit becomes stale afterward even when committed source bytes match the verified worktree.

### 14.1 Recommended pre-commit sequence

```text
formal verification
    ↓
proof review
    ↓
protected completion
    ↓
/voila deliver
    ↓
human diff and commit review
    ↓
commit
```

### 14.2 When proof tied to the exact commit is needed

1. Make the commit.
2. Rerun relevant verification through Voila.
3. Do not change source afterward.
4. Understand that committing newly written `.voila/` receipt/state artifacts moves HEAD again and makes that receipt stale.

The repository does not yet automate a final policy for committed evidence artifacts versus local post-commit evidence. Delivery summaries must report the real evidence position rather than hiding staleness.

---

## 15. The golden path: existing-project feature

### Phase A — Establish the project

1. Create a branch from the intended base.
2. Start Pi in the target repository with the global Voila extension loaded.
3. Run `/voila doctor`.
4. Run `/voila init` if needed.
5. Read `/voila status` and `/voila home`.
6. Ask the Project Steward to recover canonical context.
7. Perform a bounded orientation if absent or stale.

### Phase B — Preserve and understand intent

1. Write or locate the source brief.
2. Run `/voila intake <repo-relative-path>`.
3. Ask the Steward to interpret the preserved source with provenance.
4. Run `/voila intake review`.
5. Request revisions until accurate.
6. Preview with `/voila intake apply`.
7. Apply with `/voila intake apply confirm`.

### Phase C — Shape execution

1. Inspect `/voila backlog`.
2. Confirm work-item boundaries and dependencies.
3. Strengthen acceptance criteria before coding.
4. Record decisions, assumptions, and risks.
5. Set focus.
6. Set the next action with rationale.

### Phase D — Implement

1. Inspect only relevant code and tests.
2. Implement the smallest coherent slice.
3. Run fast feedback checks.
4. Repair failures.
5. Update docs and project truth.
6. Inspect the complete diff.
7. Keep the next action current.

### Phase E — Prove

1. Map every criterion to an honest claim.
2. Record limitations.
3. Require the claims.
4. Run verification through Voila.
5. Inspect `/voila claims` and `/voila proof NF-n`.
6. Repair unsupported claims.
7. Rerun stale claims after repository changes.
8. Attempt `/voila complete NF-n` only when all gates are ready.

### Phase F — Prepare delivery

1. Run `/voila deliver`.
2. Inspect attention items and unassigned paths.
3. Confirm supported, unsupported, and stale claim counts.
4. Run `/voila commit`.
5. Rewrite generated subjects to express intent.
6. Inspect every proposed boundary manually.
7. Stage and commit as a human action.
8. Push or open a PR only after approval.
9. Record the next justified action: review, CI, release, or follow-up work.

---

## 16. Workflow variations

### 16.1 New project from an idea

The first accepted item should often be one of:

- product discovery;
- technical feasibility;
- a minimum vertical slice;
- a disposable prototype;
- requirements validation.

Do not convert a rough idea directly into a large speculative backlog.

### 16.2 Bug fix

Preserve:

- observed behavior;
- expected behavior;
- reproduction steps;
- safe environment/version details;
- severity and impact;
- available logs or evidence;
- workaround;
- regression acceptance criteria.

A strong proof path demonstrates the failure in a regression test and then demonstrates that the corrected behavior passes with relevant broader checks.

### 16.3 Investigation before building

Research work may complete with:

- findings;
- cited evidence;
- evidence strength;
- remaining uncertainty;
- recommended decision;
- explicit reasons not to build;
- optional transition into implementation.

Repository experiments and analysis scripts may produce executable receipts. Those receipts do not validate external claims the command did not test.

### 16.4 Quick personal utility

Keep ceremony light but preserve:

- one clear use case;
- basic failure behavior;
- reproducible execution;
- short usage documentation;
- at least one meaningful claim and receipt when protected completion is desired.

### 16.5 Release preparation for work Voila did not manage

1. Orient the repository.
2. Preserve the release plan or checklist.
3. Audit current claims instead of trusting historical statements.
4. Create work for readiness gaps.
5. Run current verification through Voila.
6. Record limitations where history cannot be reconstructed.
7. Inspect delivery shape and risks.

Never invent retrospective receipts.

---

## 17. Daily operator command map

| Need | Command |
| --- | --- |
| Open the console | `/voila home` |
| Compact project position | `/voila status` |
| Diagnose environment/state | `/voila doctor` |
| Initialize project state | `/voila init` |
| Inspect/apply migration | `/voila migrate`, `/voila migrate --apply` |
| Set or clear focus | `/voila focus NF-n`, `/voila focus clear` |
| Inspect backlog | `/voila backlog`, `/voila backlog NF-n` |
| Preserve file intake | `/voila intake docs/path.md` |
| List intake status | `/voila intake status` |
| Review intake | `/voila intake review [INT-n]` |
| Request revision | `/voila intake revise [INT-n] "feedback" [supersede]` |
| Preview apply | `/voila intake apply` |
| Apply after review | `/voila intake apply confirm` |
| Reject intake | `/voila intake reject [INT-n] [reason]` |
| Inspect orientation | `/voila orient` |
| Read project brief | `/voila brief` |
| List decisions | `/voila decisions` |
| List assumptions | `/voila assumptions` |
| List risks | `/voila risks` |
| Inspect claims | `/voila claims [CLM-n|NF-n]` |
| Inspect proof | `/voila proof [NF-n|CLM-n|RCP-n]` |
| Record command evidence | `/voila verify CLM-n -- executable [args...]` |
| Attempt completion | `/voila complete NF-n` |
| Generate delivery summary | `/voila deliver` |
| Propose commit boundaries | `/voila commit` |

Many mutations are model-tool operations rather than slash commands. The Steward uses `voila_*` tools for work items, project operations, intake drafts, orientation, next action, claims, receipts, completion, and delivery summaries.

---

## 18. Recommended prompts

### 18.1 Resume the project

```text
Resume this Voila-managed project as Project Steward.

Read canonical context first. Report the focused item, next action and rationale, pending intake, orientation freshness, blocking work, open high-impact risks, and proof status. Reconcile canonical state with the current repository before recommending one next action.
```

### 18.2 Turn a plan into reviewed truth

```text
Preserve the plan at <path> as a Voila intake before interpreting it.

Then read the preserved source and stage a reviewable interpretation. Separate locked decisions from proposals, preserve terminology, cite source lines, mark model additions as inferences, surface conflicts, avoid converting every requirement into work, check for duplicates, and propose a next action with rationale.

Stop after staging so I can run /voila intake review.
```

### 18.3 Execute one work item

```text
Work only on <NF-n>.

Read its exact acceptance criteria, dependencies, linked risks, accepted decisions, and relevant assumptions. Inspect the smallest necessary implementation area. State the intended slice and evidence plan, then implement it. Keep project truth current through Voila tools. Do not claim completion from file changes or ordinary test output.
```

### 18.4 Repair failed verification

```text
Inspect the latest failed receipt for <CLM-n> and the claim's exact statement, criteria, and limitations.

Determine whether the failure comes from implementation, test design, environment, an invalid assumption, or an overbroad claim. Fix only within accepted scope. Update project truth when the failure changes a decision, risk, assumption, or next action. Rerun verification through Voila; do not erase the failed receipt.
```

### 18.5 Prepare completion

```text
Assess <NF-n> for protected completion.

Use Voila proof, not conversational memory. Confirm every criterion is covered by a required honest claim, every required claim has current passing evidence, dependencies are complete, the item is not blocked, and no open high-impact linked risk remains.

Show every failing gate. Attempt completion only if all gates pass.
```

### 18.6 Prepare delivery

```text
Prepare an evidence-backed delivery for the current worktree.

Use the Voila delivery summary and commit suggestion tools. Report every claim at its real status, all limitations, open risks, attention items, unassigned paths, and discovered-but-unexecuted commands. Do not call stale evidence support. Do not present blocked boundaries as ready. Rewrite proposed commit subjects to express intent, but do not stage, commit, push, or open a PR.
```

---

## 19. Common failure modes

### Coding before accepted intent

**Symptom:** Implementation begins before source preservation and review.  
**Correction:** Preserve, interpret, review, and apply first unless the work is explicitly a disposable Sketch.

### Treating all source text as authoritative

**Symptom:** Examples or proposals become locked decisions.  
**Correction:** Classify carefully, preserve provenance, and surface ambiguity.

### Backlog explosion

**Symptom:** Every requirement becomes a task.  
**Correction:** Create only executable work items; keep constraints attached to coherent outcomes.

### Vague acceptance criteria

**Symptom:** “Works,” “high quality,” or “production ready” cannot map to proof.  
**Correction:** Rewrite into observable behavior and defined gates.

### Calling ordinary test output evidence

**Symptom:** The model says tests passed but no receipt exists.  
**Correction:** Run formal evidence through Voila verification.

### Treating receipt creation as a pass

**Symptom:** Tool execution succeeded but the command failed.  
**Correction:** Read the receipt result and claim evaluation.

### Ignoring staleness

**Symptom:** Source changed after a passing receipt.  
**Correction:** Rerun verification against the current fingerprint.

### Writing claims only to satisfy the gate

**Symptom:** Claims are trivial, misleading, or omit limitations.  
**Correction:** Claims must express meaningful checkable truths.

### Hiding risk during delivery

**Symptom:** A summary omits blocked boundaries, unsupported claims, or unassigned paths.  
**Correction:** Use the delivery engine and report real statuses.

### Crossing the Git boundary automatically

**Symptom:** A model stages, commits, or pushes without approval.  
**Correction:** Voila proposes; the human acts.

### Editing `.voila/` manually

**Symptom:** Canonical or generated artifacts are hand-modified.  
**Correction:** Use supported tools and doctor; do not invent repaired history.

### Over-orienting

**Symptom:** The agent reads the whole repository before starting.  
**Correction:** Stop when the five orientation questions are answered and record unknowns.

### Losing the global shim source checkout

**Symptom:** Voila stops loading in every project after moving the checkout.  
**Correction:** Run `node scripts/install-global.mjs --status`, then reinstall from the checkout's new location.

---

## 20. Delivery checklist

Before describing a work item as complete:

- [ ] The source request or plan was preserved.
- [ ] The interpretation was reviewed and explicitly accepted.
- [ ] The active work item has clear acceptance criteria.
- [ ] Dependencies are accurate.
- [ ] Decisions, assumptions, and risks are current.
- [ ] The implementation was inspected against accepted intent.
- [ ] Every criterion is covered by a required honest claim.
- [ ] Known limitations are recorded.
- [ ] Verification ran through Voila.
- [ ] Every required claim is currently supported.
- [ ] No open high-impact linked risk blocks completion.
- [ ] `/voila complete NF-n` accepted the transition.

Before crossing the Git boundary:

- [ ] `/voila deliver` was reviewed.
- [ ] Unsupported and stale claims were not hidden.
- [ ] Every `blocked` or `inspect_first` boundary was inspected.
- [ ] Unassigned paths were resolved.
- [ ] Possible secret and environment-file findings were inspected.
- [ ] Generated files, manifests, lockfiles, migrations, tests, and docs are coherent.
- [ ] Commit boundaries are disjoint and meaningful.
- [ ] Generated subjects were rewritten to express intent.
- [ ] The staged diff was reviewed by the human.
- [ ] Push, PR, publish, or release received explicit approval.

---

## 21. Questions for later iterations

1. **Onboarding:** Should installation, dependency verification, global-shim setup, and first project initialization become one guided command?
2. **Version drift:** How should a target project know which Voila checkout commit or release it is using?
3. **Rigor transitions:** How should Research, Sketch, Build, Harden, and Release be selected and changed canonically?
4. **Acceptance-criteria assistance:** Should Voila lint criteria for observability and verifiability before implementation?
5. **Manual evidence:** How should browser checks, screenshots, human attestations, performance observations, and external-system evidence work?
6. **Post-commit evidence:** What is the intended policy for current receipts after committing tracked `.voila/` artifacts?
7. **Delivery integration:** Which Git, PR, CI, and release actions should remain permanently human-only, and which may become approval-gated?
8. **Delegation:** How will runtime specialists report bounded results while the Steward retains ownership?
9. **Project phases:** Which phase and health mutations should be commands, tools, policies, or derived values?
10. **Teams:** How should multi-human review, approval bundles, and concurrent writers interact with the single-writer model?
11. **External research:** How should cited external evidence enter project truth without being confused with executable proof?
12. **Guide validation:** Which real external project should be taken from intake through a merged delivery to validate this guide?

---

## 22. Source map

This guide is synthesized from current behavior and these primary documents:

- [`README.md`](../../README.md) — current status, global install, and document map;
- [`AGENTS.md`](../../AGENTS.md) — harness-neutral doctrine and safety rules;
- [`docs/DEVELOPMENT.md`](../DEVELOPMENT.md) — setup, commands, state, migrations, and proof behavior;
- [`docs/product/PRODUCT_DIRECTION.md`](../product/PRODUCT_DIRECTION.md) — product thesis, modes, and Steward model;
- [`.pi/skills/project-steward/SKILL.md`](../../.pi/skills/project-steward/SKILL.md) — authoritative agent instructions;
- [`.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md`](../../.pi/skills/project-steward/references/ORIENTATION_PLAYBOOK.md) — bounded orientation;
- [`docs/design/PLANNING_INTAKE.md`](../design/PLANNING_INTAKE.md) — preservation, interpretation, review, revision, and apply;
- [`docs/design/REPOSITORY_ORIENTATION.md`](../design/REPOSITORY_ORIENTATION.md) — orientation and staleness;
- [`docs/design/PROOF_ENGINE.md`](../design/PROOF_ENGINE.md) — claims, receipts, fingerprints, and completion;
- [`docs/design/DELIVERY_INSPECTOR.md`](../design/DELIVERY_INSPECTOR.md) — read-only inspection and attention heuristics;
- [`docs/design/DELIVERY_ENGINE.md`](../design/DELIVERY_ENGINE.md) — evidence-aware delivery and commit proposals;
- [`scripts/install-global.mjs`](../../scripts/install-global.mjs) — reversible global extension installation;
- [`src/extension/register.ts`](../../src/extension/register.ts) — current slash-command surface;
- [`src/tools/`](../../src/tools/) — current model-tool contracts.

When this guide conflicts with executable behavior, the implementation and current tests are authoritative. Reconcile documentation in the same change rather than allowing incompatible workflows to persist.
