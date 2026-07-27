# Voila Project Realignment Plan

## Status

**Accepted direction lock** — recorded as
[ADR-0009](../decisions/0009-project-steward-operational-realignment.md) and DEC-18 in canonical
state on 2026-07-26.

This plan supersedes the remaining sequence in [MVP_IMPLEMENTATION_PLAN.md](MVP_IMPLEMENTATION_PLAN.md).
It does not erase or rewrite the history of the earlier plan, completed packets, decisions,
receipts, or verification records.

**Provenance.** This document is the owner's authored realignment plan, preserved as the source of
the R-sequence. Heading levels were normalized to match the sibling
[PRODUCT_DIRECTION.md](../product/PRODUCT_DIRECTION.md) (numbered sections at `##`); no wording was
changed, added, or removed. Where this plan and a derived document disagree, this plan wins and the
derived document is wrong.

The authoritative statement of doctrine derived from this plan is
[PROJECT_STEWARD_DOCTRINE.md](../product/PROJECT_STEWARD_DOCTRINE.md).

## Realignment objective

Realign Voila around one product outcome:

> The Project Steward should function as a persistent AI technical lead and team operator that uses
> models, agents, tools, terminals, repository context, and durable project knowledge to complete
> the accepted work—without becoming another system the developer must manage.

Voila's project state, claims, receipts, dashboards, gates, and delivery records remain useful
infrastructure. They are no longer the center of the daily experience.

The center becomes:

```text
Understand → Decide → Delegate → Observe → Correct → Integrate → Continue
```

The developer provides intent, consequential judgment, credentials, and final authority.
The Steward provides coordination, continuity, execution leverage, recovery, and forward motion.

---

## 1. Why realignment is required

### What was successfully built

Voila already has a strong foundation:

- durable per-project state;
- planning-document intake;
- repository orientation;
- work items and dependencies;
- decisions, assumptions, and risks;
- a visible focus and next action;
- claims and deterministic verification receipts;
- protected completion transitions;
- a delivery summary;
- a keyboard-first project console;
- a Project Steward skill;
- strong automated test coverage.

These capabilities should be preserved.

### What became over-central

The implementation sequence made the developer increasingly responsible for operating Voila:

- refreshing claims;
- interpreting stale evidence;
- re-running identical verification;
- refreshing orientation;
- understanding internal gates;
- reconciling proof and Doctor;
- telling the Steward how to continue.

The system became excellent at recording whether work was justified, but weak at using AI to
perform and coordinate the work.

### What was postponed

The remaining roadmap treated these as optional or deferred:

- real delegated workers;
- background terminals;
- active-worker visibility;
- automatic settlement;
- steering and takeover;
- multi-model coordination;
- operational session continuity.

Those are not peripheral conveniences. They are necessary for the Project Steward to feel like an
additional capable teammate.

---

## 2. New product statement

Replace the operational product statement with:

> **Voila is a project-aware agentic development environment built on Pi. Its Project Steward keeps
> models, agents, tools, terminals, and handoffs aligned with durable project intent, coordinates
> their work, preserves continuity, and quietly assembles the evidence needed to justify delivery.**

Supporting doctrine:

> **Delegate work, retain the thread.**

The Steward retains:

- why the work exists;
- what is currently being attempted;
- which worker or process owns each task;
- what has actually happened;
- what results returned;
- whether those results advance the goal;
- what should happen next.

---

## 3. Controlling product test

Every future Voila capability must answer:

> Does this capability help the Project Steward use AI to complete accepted work with less developer
> coordination?

A capability fails when it requires the developer to:

- manage routine state freshness;
- understand internal schemas;
- manually route every task;
- check whether workers settled;
- carry results between models;
- repeatedly say "continue";
- repair normal execution state;
- approve reversible work inside the plan;
- operate evidence infrastructure during ordinary development.

This is the **No Managing the Manager gate**.
It applies to Voila itself.

---

## 4. Reclassify the existing system

| Subsystem                            | Decision                         | New role                                                           |
| ------------------------------------ | -------------------------------- | ------------------------------------------------------------------ |
| Canonical `.voila/` state            | **Retain**                       | Durable memory used by the Steward                                 |
| Work items and dependencies          | **Retain and elevate**           | Navigation spine for AI execution                                  |
| Decisions, assumptions, risks        | **Retain**                       | Context for worker assignments and escalation                      |
| Focus and next action                | **Elevate**                      | Primary input to every Steward continuation                        |
| Planning intake                      | **Retain and streamline**        | Convert rough intent or plans into usable work                     |
| Repository orientation               | **Retain and automate**          | Give the Steward bounded repository awareness                      |
| Steward Console                      | **Retain as deep inspection**    | Optional project view, not the normal work surface                 |
| Ambient UI                           | **Expand**                       | Live project, agent, terminal, Git, model, and next-action cockpit |
| Proof Engine                         | **Retain but subordinate**       | Quiet boundary verification service                                |
| Claims and receipts                  | **Automate and hide by default** | Inspectable evidence, not daily user work                          |
| Completion gate                      | **Retain**                       | Prevent false canonical completion                                 |
| Delivery Engine                      | **Retain but subordinate**       | Prepare coherent human-approved delivery                           |
| Doctor                               | **Narrow**                       | Structural and integrity health only                               |
| Manual proof refresh workflow        | **Remove from normal use**       | Steward reconciles evidence automatically                          |
| HEAD-based orientation freshness     | **Replace**                      | Relevant-content freshness                                         |
| Child-agent delegation               | **Build now**                    | Core Steward execution capability                                  |
| Background terminals                 | **Build now**                    | Core long-running execution capability                             |
| Worker inspection and takeover       | **Build now**                    | Required operational visibility                                    |
| Automatic settlement and integration | **Build now**                    | Remove user-as-scheduler behavior                                  |
| Arbitrary workflow scripting         | **Defer**                        | Not required for the first operational loop                        |
| Multi-harness support at scale       | **Defer**                        | Prove one Pi child-worker path first                               |
| Approval bundles                     | **Pause**                        | Resume only after the Steward operational loop passes              |
| Remote execution                     | **Defer**                        | Local operational loop first                                       |
| General policy engine                | **Reject for this realignment**  | Avoid replacing useful autonomy with process machinery             |

---

## 5. Roadmap reset

The old Phase 5–8 sequence is superseded.
Delegation is no longer an optional prototype after the evidence system.
It becomes the next product-critical capability.

The approval-bundles self-hosting project is paused until Voila demonstrates that its Steward can
actually coordinate AI work without being coached.

### New sequence

```text
R0  Direction lock and roadmap reset
R1  Friction containment and ambient continuity
R2  One background terminal
R3  One bounded Pi child worker
R4  Operational integration and automatic settlement
R5  Fresh-session continuity
R6  Quiet boundary reconciliation
R7  Uncoached dogfood acceptance
```

The first major milestone is:

> **Project Steward Operational Loop v1**

---

## 6. R0 — Direction lock and roadmap reset

### Objective

Make the new doctrine authoritative before additional runtime development.

### Deliverables

Create:

```text
docs/product/PROJECT_STEWARD_DOCTRINE.md
docs/plans/PROJECT_REALIGNMENT_PLAN.md
docs/decisions/<next>-project-steward-operational-realignment.md
```

Update:

```text
docs/product/PRODUCT_DIRECTION.md
docs/plans/MVP_IMPLEMENTATION_PLAN.md
docs/HANDOFF.md
README.md
AGENTS.md
.pi/skills/project-steward/SKILL.md
.voila/briefs/PROJECT_BRIEF.md
```

### Required documentation changes

#### Product direction

State clearly that:

- Voila is a project-aware agentic development environment;
- the Steward is an active AI team lead;
- durable state serves AI execution;
- proof serves completion and delivery boundaries;
- reference-style execution visibility is a first-class direction;
- the developer must not operate routine Steward bookkeeping.

#### Previous implementation plan

Do not delete it.
Add a status notice explaining:

- which phases were completed;
- why the remaining sequence is superseded;
- which deferred capabilities are now promoted;
- where the new roadmap lives.

#### Canonical project truth

Record an accepted decision that:

- the Project Steward Operational Loop is now the active product priority;
- proof and delivery remain retained foundations;
- approval-bundle self-hosting is paused;
- delegation and background execution are no longer optional.

Do not rewrite earlier decisions. Supersede them where necessary.

### Acceptance gate

A new agent reading only the current product direction, doctrine, plan, handoff, and canonical state
must reach the same conclusion:

> Build the operational AI-teammate loop next; do not expand proof ceremony or approval
> infrastructure.

### Non-goal

No runtime feature work in R0.

---

## 7. R1 — Friction containment and ambient continuity

### Objective

Stop existing Voila machinery from interrupting ordinary development while the operational loop is
being built.

### Required changes

#### Evidence staleness

During active development:

- stale evidence is expected;
- the ambient UI may show one quiet indicator;
- the user is not instructed to refresh claims manually;
- Doctor does not treat ordinary staleness as structural failure.

Suggested UI:

```text
Development changes detected · evidence will reconcile at the boundary
```

#### Orientation freshness

Replace Git-HEAD-only orientation staleness with relevant-content freshness.
Git HEAD remains provenance.
A commit that changes no orientation-relevant content must not require re-orientation.

#### Repeated verification

Prepare verification grouping so one identical command can serve all applicable claims.
This may initially be implemented internally without redesigning the entire receipt format.

#### Readiness labels

A work item must not display `READY to complete` when a known required human or authenticated
activity remains pending.
Correct the specific existing inconsistency narrowly.
Do not build a universal gate-policy system.

#### Focus capsule

Before every meaningful Project Steward turn, inject a compact capsule containing:

```text
Project
Accepted objective
Active work item
Current implementation slice
Relevant decisions
Relevant non-goals
Known blocker
Next justified action
Active workers and terminals
```

Do not inject the entire ledger.

### Acceptance gate

In a fresh Pi session, the user says:

```text
Continue.
```

The Steward identifies the correct work and begins useful action without asking for a recap or
requiring state maintenance.

### Stop condition

If `Continue` still produces primarily a status report rather than useful action, R1 has failed.

---

## 8. R2 — Background terminal v1

### Planning foundation

The R2 packet is planned first by [R2-0 — Operational Risk and Authority Envelope](R2_0_OPERATIONAL_RISK_AND_AUTHORITY_ENVELOPE.md).
R2-0 establishes the authority boundary and response sequence; DEC-22 corrects its broad risk
categories into separate effect, authority, admission, outcome, and recovery concepts. R2A is the
first finite demonstration packet. Its DEC-22 pivot, full verification, and real parent-Steward
acceptance passed on 2026-07-26 as recorded in
[docs/verification/R2A_FINITE_OPERATION.md](../verification/R2A_FINITE_OPERATION.md). No further R2
runtime behavior is built. R2B and later packets remain unimplemented.

### Objective

Allow the Steward to launch and supervise one long-running local process without blocking the parent
conversation.

### R2A status (first vertical slice — bounded capability accepted)

R2A defines one explicit finite operation: `r2a.state-store-tests` v1, executable `mise` with argv
`["exec","--","node","--test","test/state.store.test.ts"]`, working directory `repository_root`,
effects `{local_read, bounded_temporary_write}`, and authority `accepted_project_operation` sourced
from DEC-22. The working tree contains the pure deterministic admission kernel, atomic in-process
reservation, POSIX process supervision, bounded redacted output, exactly-once canonical settlement,
four model-callable operation tools, structured-file protection for `.voila/`, and a bounded capsule
summary. The supported NF-17 repair restored structural health, the protected full gate passed, and
RUN-5 was delivered automatically to the parent on the next turn and acknowledged exactly once.
This accepts R2A only; it does not complete the broader NF-10 scope.

The remaining R2 plan items (full process list, the `wait` tool, watcher-style commands,
long-running development servers, persistent services) remain R2B onward and are not built.

### Initial supported uses (R2A only)

- one focused test suite, run via the supervisor;
- bounded verification commands through the same registry;
- controlled fixtures used to prove lifecycle, cancellation, timeout, and redaction.

### Required operations

```text
start
list          # omitted in R2A: only one accepted operation exists
inspect
read output
stop          # implemented as cancel
wait          # omitted in R2A: settlement is delivered through canonical state, not polling
```

### Required properties

Each process records:

- operation ID;
- associated work item (optional);
- structured executable and arguments;
- working directory;
- owner;
- start time;
- current status;
- exit result;
- bounded output;
- settlement result.

No shell string execution is required for v1.

### UI

While active, the ordinary Pi surface shows:

```text
1 terminal active
```

A deeper process view shows:

```text
P-1 focused intake tests
running · 00:41
owned by NF-2
```

### Settlement

When the process exits:

- the parent Steward receives one completion event;
- the result is not injected during an active stream;
- the result becomes part of observed project progress;
- the developer does not have to check manually.

### Acceptance gate

The Steward launches a test process, continues parent work, receives the result automatically, and
acts on the outcome.

### Non-goals

- remote processes;
- persistent services across machine restart;
- arbitrary shell sessions;
- full terminal multiplexing;
- multiple concurrent processes beyond what is needed to prove the loop.

---

## 9. R3 — One bounded Pi child worker

### Objective

Let the Steward delegate one useful task to another Pi session and integrate the result without
developer coordination.

### Worker v1

Support one Pi child session with:

```text
spawn
inspect
wait
steer
cancel
receive result
```

Concurrency may begin at one.

### Assignment contract

Every assignment must include:

```text
Project objective
Active work item
Specific bounded task
Relevant decisions
Relevant constraints
Permitted scope
Expected result
Known uncertainty
Return format
```

Do not send the full project history.

### Initial worker modes

#### Read-only worker

Default v1 mode for:

- repository scouting;
- architecture review;
- test review;
- debugging analysis;
- dependency research;
- adversarial review.

#### Isolated-write worker

May be added only after the read-only loop is reliable.
Writes occur in a dedicated worktree with an explicit path scope.
The parent Steward remains responsible for integration.

### UI

The ordinary surface shows:

```text
1 agent active
```

The deeper view shows:

```text
A-1 repository impact review
Pi child · running · NF-2
```

The developer may:

- inspect transcript;
- steer;
- cancel;
- take over when useful.

These are escape hatches, not normal management requirements.

### Acceptance gate

The Steward:

1. identifies a task worth delegating;
2. creates a useful bounded assignment;
3. continues parent work;
4. receives the worker result automatically;
5. evaluates it;
6. integrates or rejects it;
7. proceeds without asking the developer to carry the result.

### Stop condition

If delegation adds more elapsed time or coordination than direct work, do not expand the runtime.
Fix assignment quality and settlement first.

---

## 10. R4 — Operational integration and automatic settlement

### Objective

Turn terminals, workers, project state, and the parent Steward into one coherent loop.

### Shared operational state

Introduce the smallest durable representation needed for active work:

```text
operation ID
type: agent | terminal
work item
assignment
status
owner
model or executable
working directory or worktree
started time
settled time
result summary
artifact references
```

Avoid a generalized workflow DSL.

### Parent behavior

The Project Steward must automatically:

- know what is active;
- avoid duplicate assignments;
- detect when work settles;
- inspect returned results;
- request focused follow-up when needed;
- correct or cancel drift;
- update observed progress;
- select the next justified action;
- continue inside the accepted plan.

### Drift behavior

When a worker moves outside its assignment:

1. remind the worker of scope;
2. request justification;
3. cancel if necessary;
4. preserve useful partial results;
5. involve the developer only if the drift exposes a material plan decision.

### Failure behavior

When a worker or process fails:

1. inspect the failure;
2. determine whether retry is justified;
3. reduce or revise the assignment;
4. switch model or execution path if useful;
5. continue unaffected work;
6. escalate only a real blocker.

### Acceptance gate

Complete this loop without developer orchestration:

```text
delegate → observe → settle → evaluate → integrate → continue
```

---

## 11. R5 — Fresh-session continuity

### Objective

Make the Project Steward resilient across context compaction, exit, restart, and a genuinely fresh
session.

### Continuation record

Persist:

- accepted objective;
- active work item;
- current slice;
- completed actions;
- changed files;
- commands and actual results;
- active or interrupted operations;
- worker findings;
- unresolved decisions;
- failures;
- exact next action.

### Resume behavior

In a fresh Pi session, the user says:

```text
Continue.
```

The Steward:

1. loads canonical project truth;
2. reconciles repository state;
3. reconciles active or abandoned operations;
4. identifies the current slice;
5. resumes useful work.

It does not ask the user to explain what happened.

### Interrupted operations

On startup:

- a still-live local process may be reattached when reliable;
- a dead process previously marked running becomes interrupted;
- an abandoned child session is marked honestly;
- no operation is silently assumed successful.

### Acceptance gate

A real session is closed mid-work.
A new session starts.
`Continue` resumes the correct work with no user reconstruction.

---

## 12. R6 — Quiet boundary reconciliation

### Objective

Preserve evidence honesty while removing the verification treadmill.

### Trigger points

Reconciliation occurs automatically when:

- a work slice appears finished;
- completion is requested;
- delivery is requested;
- the developer explicitly asks for evidence.

It does not require maintenance after every source edit.

### Required behavior

The Steward:

1. identifies current verification contracts;
2. groups identical contracts;
3. runs each unique command once;
4. records deterministic execution;
5. applies the result to applicable claims;
6. refreshes derived views;
7. reports real failures and limitations;
8. asks for human judgment only when necessary.

### User experience

The user should see:

```text
Boundary check
1 verification command executed
5 claims evaluated
5 supported
1 authenticated acceptance still pending
```

The user should not see instructions to refresh five claims individually.

### Doctor

Doctor answers:

> Is Voila structurally healthy and internally consistent?

Readiness belongs in:

- home;
- proof detail;
- completion;
- delivery.

### Acceptance gate

A normal source change reaches the completion boundary without requiring the developer to manage
receipts, claims, or orientation.

---

## 13. R7 — Uncoached dogfood acceptance

### Objective

Prove that the Project Steward behaves like an additional capable teammate.

### Test project

Use a real Voila work item with:

- repository investigation;
- implementation;
- a long-running test or build;
- one delegable review task;
- at least one recoverable failure;
- a completion boundary.

Do not use a toy-only fixture as the primary acceptance.

### Test procedure

1. Start a fresh Pi session.
2. Say only:

   ```text
   Continue.
   ```

3. Do not coach the Steward's internal workflow.
4. Observe whether it:
   - selects the correct work;
   - starts useful parent action;
   - delegates appropriately;
   - launches a useful background process;
   - monitors both;
   - handles settlement;
   - corrects drift;
   - recovers from failure;
   - integrates results;
   - preserves scope;
   - continues automatically;
   - reconciles evidence once at the boundary;
   - surfaces only a real decision or final acceptance.

### Failure rule

The test fails if the developer must repeatedly:

- tell it what task is active;
- tell it to inspect state;
- tell it to delegate;
- tell it to run tests;
- ask whether workers finished;
- carry outputs between agents;
- repair routine state;
- refresh evidence;
- tell it what to do next.

### Final acceptance question

> Did the Project Steward feel like an additional capable teammate, or like a project-management
> process that required supervision?

Only the first answer passes.

---

## 14. Operational success metrics

Record these during R7.

| Metric                                        |                        Target |
| --------------------------------------------- | ----------------------------: |
| Context restatements by developer             |                             0 |
| Manual model routing decisions                |                             0 |
| Manual worker-status checks                   |                             0 |
| Manual result transfers                       |                             0 |
| Manual proof refreshes                        |                             0 |
| Repeated execution of identical verification  |                             0 |
| Routine implementation approvals              |                             0 |
| Material decision escalations                 | Only when genuinely necessary |
| Fresh-session resume from `Continue`          |                          Pass |
| Useful parent work during delegated execution |                          Pass |
| Automatic worker settlement                   |                          Pass |
| Automatic next-step continuation              |                          Pass |

Worker count is not a success metric.
Useful completed work and reduced coordination burden are.

---

## 15. Architecture constraints

### Preserve

- Pi remains the host harness.
- The project-local extension remains thin.
- Canonical state remains per-project.
- Historical evidence remains immutable.
- The parent Steward remains the integrator.
- Models may interpret; deterministic systems establish actual execution.
- The developer retains consequential authority.

### Avoid

- copying the reference setup's implementation;
- adopting Effect merely because the reference uses it;
- creating a universal workflow language;
- building three agent backends before one works well;
- flooding every worker with full project context;
- putting all operational state into one giant schema;
- equating more agents with more progress;
- exposing internal receipts as routine UX;
- making every implementation choice an approval event.

---

## 16. Immediate execution sequence

### First

Finish and merge the current fingerprint-v2/NF-1 branch cleanly.
Do not mix the product realignment into that branch.

### Second

Create:

```bash
git switch main
git pull --ff-only
git switch -c docs/project-steward-realignment
```

Complete R0 as a documentation and canonical-direction packet.

### Third

Open a PR titled:

```text
Realign Voila around the Project Steward operational loop
```

Merge only after:

- the doctrine is authoritative;
- the previous roadmap is explicitly superseded;
- current product documents agree;
- canonical state points to the new priority;
- no runtime capability is falsely claimed.

### Fourth

Create a new implementation branch for R1.
Do not begin approval bundles, broad routing, arbitrary workflows, or release automation before R7
passes.

---

## 17. Final report for the realignment program

Return:

1. Starting repository SHA
2. Doctrine adoption result
3. Documents superseded
4. Decisions recorded or superseded
5. Backlog items paused, retained, or promoted
6. Existing subsystems reclassified
7. R1 friction reduction result
8. `Continue` behavior
9. Background-terminal result
10. Child-worker result
11. Live cockpit result
12. Settlement and integration result
13. Drift-correction result
14. Failure-recovery result
15. Fresh-session continuity result
16. Boundary-verification result
17. Developer interventions required
18. No Managing the Manager verdict
19. Known limitations
20. Exact next justified action

The program is not complete merely because every packet passes its tests.
It is complete when the Project Steward demonstrably uses AI to make the developer more capable
while requiring less coordination.

---

## Deviations from the authored source

Two wording changes were required by repository invariants, and are recorded here rather than made
silently:

1. §6 "Product direction" originally read "Ben-style execution visibility is a first-class
   direction." §15 "Avoid" originally read "copying Ben's implementation." The reference setup is
   named and license-constrained in [AGENTS.md](../../AGENTS.md#reference-handling); this repository
   refers to it by repository identity, not by a person's first name. The requirement is unchanged.
2. Nothing else was altered. Section numbering, tables, code fences, targets, gates, and stop
   conditions are as authored.
