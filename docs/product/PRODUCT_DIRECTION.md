# NewFang Product Direction v0.1

**Status:** Direction locked; ready for technical discovery
**Product owner:** Joshua Jenks
**Foundation:** Pi coding-agent harness
**Primary audience:** Joshua first; broader use is a future possibility, not a current requirement

---

## 1. Purpose

NewFang is a custom development harness built around Pi and tailored to Joshua’s actual way of planning, building, verifying, and releasing software.

It is not merely:

* a customized terminal theme,
* a collection of Pi extensions,
* a multi-agent demonstration,
* an OpenCode replacement,
* or another chat interface for coding models.

NewFang is intended to become a **personal development operating system** that can take an idea, rough request, planning document, repository, or interrupted project and move it toward an evidence-backed delivery state.

Its central responsibility is not generating code. Its responsibility is maintaining ownership of the complete path from intent to verified result.

---

## 2. Product thesis

> NewFang converts natural-language intent or an existing project plan into structured execution, delegates work across appropriate agents and harnesses, preserves durable project truth, and requires evidence before claiming completion.

The system should make it possible for one developer to undertake projects that would ordinarily require a coordinated technical team.

It should reduce the amount of manual prompting and agent coordination required without hiding important decisions, risks, failures, or unsupported claims.

---

## 3. Source inspiration

Pi provides an intentionally minimal coding-agent foundation with a small tool surface, compact system prompt, strong terminal interface, and a flexible TypeScript extension system.

Ben Davis’s customized setup demonstrates that Pi can be extended with:

* interface and status customization,
* project and Git information,
* background terminals,
* stronger file-search tools,
* structured user questions,
* multi-phase workflows,
* subagents running through different harnesses,
* model-specific routing,
* navigable agent histories,
* active-agent views,
* and remote long-running execution patterns.

NewFang should borrow useful interface and orchestration ideas from that work, but it should not copy the system indiscriminately.

Its distinguishing focus is:

* project ownership,
* delivery discipline,
* approval quality,
* durable state,
* claims and evidence,
* verification receipts,
* lightweight project operations,
* and reliable continuation across sessions.

---

## 4. Product identity

NewFang has four nested identities.

### 4.1 Personal development operating system

This is the highest-level identity.

NewFang coordinates how work enters the system, how it is understood, how it is delegated, how it is checked, and how it is delivered.

### 4.2 Agent and harness router

NewFang can route work to different models, agents, command-line tools, and coding harnesses according to the nature of the task.

It should use the strengths of multiple systems without requiring Joshua to manually coordinate every handoff.

### 4.3 Project command center

NewFang provides a clear view of:

* current project state,
* current phase,
* active work,
* blockers,
* decisions,
* claims,
* evidence,
* approval needs,
* and the next justified action.

### 4.4 Coding terminal

Direct coding remains an important experience, but it exists within the larger system rather than defining the entire product.

---

## 5. Product principles

### 5.1 Delegate work, never ownership

Specialists, models, harnesses, and execution environments may change throughout a project.

The Project Steward remains accountable for:

* the original intent,
* the current plan,
* the quality of handoffs,
* the evidence supporting completion,
* unresolved risks,
* and the final delivery state.

### 5.2 Evidence before completion

Files changing is not proof that work is complete.

Meaningful work should normally require:

* tests,
* behavior demonstrations,
* relevant documentation,
* explicit risks and limitations,
* reproducible receipts,
* and appropriate Git delivery boundaries.

### 5.3 Quiet autonomy, visible decisions

NewFang should proceed without unnecessary interruption when actions are:

* low risk,
* reversible,
* within the approved plan,
* and supported by sufficient context.

It should surface:

* material decisions,
* changes in direction,
* meaningful failures,
* unresolved disagreements,
* scope expansion,
* and actions requiring approval.

### 5.4 Progressive rigor

Not every task deserves release-grade ceremony.

NewFang should apply enough rigor for the work’s:

* risk,
* expected lifespan,
* intended audience,
* technical complexity,
* reversibility,
* and importance.

### 5.5 Human-readable project truth

Important project state must not exist only inside model context or hidden internal storage.

Decisions, evidence, claims, risks, gates, and continuation state should be available in forms Joshua can inspect and preserve.

### 5.6 Modular rather than monolithic

The core experience should remain understandable and responsive.

Advanced functions should be delivered through optional modules, views, commands, workflows, and policies.

### 5.7 Personal utility before public positioning

NewFang should be optimized for Joshua’s work first.

Public messaging, general-purpose abstractions, plugin marketplaces, and broad adoption should not distort the initial design.

---

## 6. Primary operating priorities

NewFang should optimize for:

1. Making ambitious projects achievable for one developer.
2. Preventing unsupported claims of completion.
3. Keeping Joshua informed without requiring constant supervision.
4. Producing maintainable work where maintainability matters.
5. Completing work quickly where speed is appropriate.
6. Balancing model capability, coding-plan availability, cost, and latency.
7. Preserving continuity across long or interrupted projects.

Speed, quality, and cost should not be permanently ranked.

Their relative importance should change according to:

* project mode,
* rigor level,
* risk,
* current phase,
* and explicit user instruction.

---

## 7. Work intake

NewFang should support several first-class entry paths.

### 7.1 Conversational intake

Joshua may begin with:

* a rough idea,
* voice-to-text notes,
* a problem,
* a desired outcome,
* a bug report,
* or a direct implementation request.

NewFang should construct a lightweight working brief through conversation.

### 7.2 Planning document or specification

Joshua may provide:

* a product plan,
* implementation lock,
* roadmap,
* audit,
* requirements document,
* prompt-generated plan,
* release checklist,
* or other structured text.

The document does not need to follow a NewFang schema.

NewFang should:

1. Preserve the original document.
2. Identify its objective.
3. Classify its contents.
4. Distinguish authoritative decisions from proposals.
5. Detect contradictions and material gaps.
6. Identify stale or uncertain assumptions.
7. Derive executable project state.
8. Present a concise understanding check.
9. Recommend the next justified action.

Useful classifications include:

* locked decision,
* constraint,
* requirement,
* acceptance criterion,
* proposal,
* open question,
* assumption,
* evidence,
* risk,
* example,
* non-goal,
* and deferred work.

Explicit decisions in a supplied plan should be treated as authoritative unless they are impossible, contradictory, unsafe, or materially outdated.

### 7.3 Existing repository

NewFang should be able to enter a repository with little or no prior project context.

Its initial orientation should be focused rather than exhaustive.

It should identify:

* project purpose,
* repository structure,
* current branch and worktree state,
* project instructions,
* likely build and test commands,
* active plans or roadmap documents,
* current risks,
* incomplete work,
* and the most justified next action.

### 7.4 Resumed project

NewFang should recover:

* original intent,
* accepted decisions,
* current phase,
* completed work,
* changed files,
* verification state,
* failures,
* active background work,
* pending approvals,
* and recommended continuation.

Repository inspection and durable NewFang state should be reconciled rather than trusting either source blindly.

---

## 8. Initial project situations

The first version should explicitly support five situations.

### 8.1 Existing-project feature work

Add or change behavior inside an established repository while respecting its architecture, conventions, tests, and delivery process.

### 8.2 New project from an idea

Turn a rough idea into a bounded initial direction and begin implementation without requiring a formal specification.

### 8.3 Investigation before building

Research a problem, opportunity, architecture, or feasibility question without presuming that implementation will follow.

An investigation should end with:

* findings,
* evidence strength,
* remaining uncertainty,
* recommended decision,
* and an optional project transition.

### 8.4 Quick personal utility

Create a small script, CLI, automation, or local tool without imposing full product-development overhead.

A quick utility is complete when:

* its main use case works,
* basic failure behavior has been checked,
* usage is briefly documented,
* and execution or installation is reproducible.

### 8.5 Release preparation

Enter an existing project and prepare it for a credible release, even when NewFang did not manage the earlier implementation.

NewFang should conduct a repository-truth and readiness audit before accepting existing claims.

---

## 9. Modes and rigor levels

Projects may move through different modes over time.

A common progression may be:

```text
Research → Sketch → Build → Harden → Release
```

NewFang should recommend transitions at meaningful boundaries. Material increases in scope, risk, or rigor should require approval.

### 9.1 Research

Used for discovery, evidence gathering, architecture evaluation, product investigation, and decision support.

Research does not automatically authorize implementation.

### 9.2 Sketch

Used for experiments, prototypes, disposable tests, and fast proof-of-concept work.

### 9.3 Build

Used for normal feature and project implementation.

### 9.4 Harden

Used when maintainability, security, resilience, compatibility, deeper testing, or production readiness becomes important.

### 9.5 Release

Used for final verification, documentation, packaging, Git preparation, claims review, and delivery.

### 9.6 Mixed rigor

Different workstreams inside one project may use different rigor.

For example:

* the core application may be in Harden mode,
* a migration utility may be in Build mode,
* and a temporary diagnostic script may use Sketch rules.

Temporary artifacts should be tracked and resolved before release through one of four outcomes:

* keep,
* promote,
* archive,
* or remove.

---

## 10. Project Steward operating model

### 10.1 Project Steward

The primary agent should operate as the Project Steward.

It owns:

* project intent,
* project state,
* task selection,
* delegation,
* decision synthesis,
* status communication,
* approval preparation,
* acceptance gates,
* final claims,
* and continuation.

It may delegate authority over a workstream, but it may not delegate accountability for the complete result.

### 10.2 Permanent specialist roles

#### Explorer

Understands:

* repository structure,
* implementation history,
* active behavior,
* dependencies,
* conventions,
* and likely impact areas.

#### Librarian

Finds and organizes:

* project documentation,
* prior decisions,
* authoritative external documentation,
* related implementations,
* and relevant evidence.

#### Builder

Implements bounded changes according to the accepted plan and project conventions.

#### Fixer

Handles:

* failed tests,
* regressions,
* review findings,
* integration problems,
* and repair loops.

#### Verifier

Independently evaluates whether claims are supported.

The Verifier may block completion when:

* evidence is missing,
* tests do not prove the stated behavior,
* important limits are omitted,
* or the result does not satisfy the accepted criteria.

#### Designer

Owns:

* interface quality,
* information hierarchy,
* interaction design,
* developer experience,
* structure,
* and visual coherence.

#### Release Keeper

Owns:

* release readiness,
* documentation accuracy,
* version identity,
* changelogs,
* commit quality,
* pull-request preparation,
* packaging,
* and delivery receipts.

### 10.3 Temporary specialists

The Project Steward may create task-specific specialists when needed.

Temporary roles should be defined by responsibility rather than permanently bound to a model.

Examples include:

* security reviewer,
* performance investigator,
* migration specialist,
* WordPress compatibility analyst,
* browser tester,
* accessibility reviewer,
* or infrastructure operator.

---

## 11. Handoffs and disagreement

Every meaningful handoff should contain:

* objective,
* relevant context,
* accepted decisions,
* constraints,
* files or systems in scope,
* evidence already available,
* known risks,
* expected output,
* and acceptance conditions.

Raw conversation history may remain accessible, but it should not substitute for a structured handoff.

When specialists disagree:

1. The Project Steward compares the evidence.
2. Ordinary technical disagreements are resolved without interrupting Joshua.
3. The Verifier may block unsupported completion claims.
4. Joshua is consulted when the disagreement changes:

   * product direction,
   * risk tolerance,
   * meaningful cost,
   * destructive action,
   * irreversible architecture,
   * or accepted scope.

---

## 12. Project lifecycle

NewFang should use modular phases rather than one fixed process.

A full lifecycle may include:

```text
Orient → Clarify → Plan → Execute → Review → Verify → Deliver
```

A quick utility might use:

```text
Clarify → Execute → Check → Document
```

Phases may be:

* skipped,
* repeated,
* combined,
* or expanded.

### 12.1 Orient

Understand the repository, request, supplied plan, and current state.

### 12.2 Clarify

Resolve only the uncertainties that materially affect direction or execution.

Questions should favor:

* concrete choices,
* recommended defaults,
* and concise multiple-choice interactions.

### 12.3 Plan

Maintain broad project direction while planning only the next one or two execution boundaries in detail.

Avoid both:

* unstructured local action,
* and speculative full-project plans that become stale immediately.

### 12.4 Execute

Perform work directly or through delegated specialists.

### 12.5 Review

Evaluate:

* implementation quality,
* maintainability,
* project conventions,
* unintended effects,
* and assignment completeness.

### 12.6 Verify

Prove important behavior independently.

### 12.7 Deliver

Prepare:

* documentation,
* receipts,
* commits,
* pull requests,
* release artifacts,
* risks,
* and the next recommended action.

---

## 13. Lightweight backlog and project ledger

NewFang should provide real project-management support without recreating enterprise Jira.

The experience should combine:

* Linear-like clarity and speed,
* with selected Jira strengths such as relationships, acceptance criteria, blockers, and durable history.

### 13.1 Backlog entities

The initial backlog may include:

* outcomes,
* work items,
* tasks,
* defects,
* decisions,
* blockers,
* risks,
* claims,
* acceptance gates,
* and follow-up work.

### 13.2 Useful fields

A work item may track:

* title,
* intended outcome,
* status,
* priority,
* owner,
* workstream,
* dependencies,
* acceptance criteria,
* linked decisions,
* linked claims,
* linked evidence,
* risk,
* and recommended next action.

### 13.3 What NewFang should avoid

The first version should not require:

* sprints,
* story-point rituals,
* elaborate issue types,
* custom enterprise workflows,
* complex permissions,
* or extensive administrative configuration.

### 13.4 Project ledger

The project ledger should provide a human-facing record of:

* accepted decisions,
* assumptions,
* active risks,
* blockers,
* important changes,
* current claims,
* evidence,
* approval history,
* and significant course corrections.

The ledger is not a raw transcript.

It is the current, inspectable representation of project truth.

---

## 14. Claims, evidence, gates, and receipts

Important claims should be tracked separately from tasks.

Examples include:

* “The upgrade path is safe.”
* “Offline verification works.”
* “The implementation preserves existing behavior.”
* “The project supports the documented deployment profile.”
* “The application sustained the reported load.”
* “The release artifact can be installed from the published instructions.”

Each important claim should record:

* statement,
* status,
* confidence,
* supporting evidence,
* applicable environment,
* known limits,
* contradictory evidence,
* and verification date.

### 14.1 Acceptance gates

A gate should describe:

* what must be true,
* how it will be tested,
* what evidence is expected,
* what the test does not prove,
* and what blocks progression.

### 14.2 Verification receipts

A receipt should be reproducible where practical.

It may include:

* command executed,
* environment,
* relevant version information,
* result,
* output location,
* artifact hashes,
* logs,
* screenshots,
* or linked evidence.

### 14.3 Completion standard

For meaningful work, completion normally requires:

* tests passing,
* requested behavior demonstrated,
* documentation updated where relevant,
* risks and unsupported claims listed,
* receipts preserved,
* commits suggested at sensible checkpoints,
* and a pull request created when the work reaches a proper delivery boundary.

---

## 15. Approval experience

Approval quality is a critical NewFang feature.

The system should avoid both extremes:

* constant low-value permission prompts,
* and broad approval requests that hide consequential actions.

### 15.1 Approval bundles

Related actions should be grouped at genuine decision boundaries.

An approval bundle should explain:

* proposed action,
* reason,
* expected changes,
* credible risks,
* reversibility,
* consequences of denial,
* scope of approval,
* and whether the approval applies:

  * once,
  * to a phase,
  * or under a narrow reusable policy.

### 15.2 Actions likely to require approval

The initial policy should audit and refine approval requirements for:

* pushing to a remote,
* merging a pull request,
* publishing a package or release,
* modifying production systems,
* accessing or moving secrets,
* spending meaningful money,
* using paid remote compute,
* deleting substantial work,
* installing global software,
* changing files outside the active project,
* changing project direction,
* accepting major scope expansion,
* and activating self-modifications to NewFang.

### 15.3 Learning from approvals

NewFang may learn preferences from repeated decisions.

It must never silently broaden permission.

Approval to run local tests does not imply permission to:

* install system software,
* access production,
* publish artifacts,
* or use credentials.

---

## 16. Interruption policy

NewFang should interrupt Joshua when:

* project direction would materially change,
* substantial work may be discarded,
* valid approaches have meaningful product or risk tradeoffs,
* evidence contradicts the requested direction,
* scope expands substantially,
* credentials or secrets are involved,
* production or public publishing is involved,
* meaningful cost may be incurred,
* or the system cannot proceed safely.

NewFang should not interrupt for:

* ordinary implementation details,
* reversible local decisions,
* low-risk assumptions,
* routine test failures,
* or disagreements the Project Steward can resolve using evidence.

When uncertainty is low risk and reversible, NewFang should:

1. make a reasonable assumption,
2. record it,
3. proceed,
4. and surface it only when useful.

---

## 17. Model and harness routing

Roles and models must remain separate.

A role defines responsibility. A model is selected for the task.

### 17.1 Routing factors

NewFang should route based on:

* task difficulty,
* risk,
* expected duration,
* need for deep reasoning,
* need for visual or browser interaction,
* need for sustained implementation,
* latency,
* coding-plan availability,
* approximate relative cost,
* and known model strengths.

### 17.2 Coding plans and cost

Coding plans may not expose precise remaining credits.

NewFang should not pretend to know exact balances when providers do not expose them.

Instead, it may track:

* subscription-based access,
* metered API access,
* free or promotional access,
* relative cost tiers,
* recent usage,
* throttling or limit errors,
* and preferred fallback models.

### 17.3 Budget experience

Budgets should be optional and low-friction.

The default experience should emphasize ease of use rather than financial administration.

NewFang may support:

* quiet cost tracking,
* soft project budgets,
* warnings for meaningful overruns,
* and approval before unusually expensive or long-running work.

Routine coding-plan use should not require constant budget decisions.

### 17.4 Primary agent behavior

The main Project Steward should remain responsive.

It should normally perform:

* coordination,
* small changes,
* synthesis,
* decision management,
* and status communication.

Long-running or specialized work should be delegated.

---

## 18. Execution profiles

NewFang should support several execution paths.

### 18.1 Direct local execution

Used for:

* normal repository work,
* fast commands,
* local tests,
* and interactive development.

### 18.2 Local background execution

Used for:

* development servers,
* test watchers,
* builds,
* local services,
* and longer commands that should not block the primary interaction.

The interface should allow users and agents to:

* list processes,
* inspect output,
* view standard output and errors,
* identify ownership,
* and stop processes safely.

### 18.3 Local sandboxed execution

Sandboxing should be explored as an optional execution profile.

Potential benefits include:

* containing destructive mistakes,
* isolating dependencies,
* limiting filesystem access,
* supporting reproducibility,
* testing installation behavior,
* and allowing agents greater autonomy inside a bounded environment.

Sandboxing should not become mandatory if it creates excessive complexity, slow startup, weak macOS compatibility, or confusing filesystem behavior.

The first investigation should compare options such as:

* temporary Git worktrees,
* containers,
* lightweight virtual machines,
* restricted process environments,
* and project-specific isolated directories.

The selected approach should prioritize:

* ease of use,
* predictable file persistence,
* clear promotion of accepted changes,
* and minimal interference with normal local development.

### 18.4 Remote execution

Used for:

* multi-hour jobs,
* compute-heavy work,
* jobs that must survive laptop closure,
* remote development environments,
* or work requiring another machine.

Routing should consider:

* duration,
* resource needs,
* interruption risk,
* data sensitivity,
* available machines,
* and expected transfer of artifacts.

### 18.5 Long-running execution contracts

Before initiating substantial work, NewFang should show:

* intended outcome,
* execution location,
* checkpoints,
* stopping conditions,
* resource implications,
* output destination,
* and expected verification behavior.

This is an execution contract, not an unreliable completion-time promise.

---

## 19. Parallelism and active steering

NewFang should prioritize useful parallelism rather than maximizing agent count.

Agents may edit concurrently when:

* work boundaries are clearly separated,
* file overlap is unlikely,
* dependencies are understood,
* and integration responsibility is assigned.

When work begins to conflict:

1. Pause the affected workstream.
2. Preserve completed work.
3. Let the Project Steward reconcile the plan.
4. Escalate only if reconciliation changes product direction or discards substantial work.

Joshua should be able to steer active agents without restarting them.

A correction should preserve:

* the original assignment,
* the new instruction,
* the reason for the change,
* and the resulting course correction.

For major changes, the Project Steward should determine:

* what remains valid,
* what must change,
* what can be preserved,
* what should be abandoned,
* and which gates must be repeated.

---

## 20. Interface direction

The interface should remain modular and flexible.

It should borrow useful ideas from Ben Davis’s Pi setup, including:

* project and branch status,
* model and reasoning visibility,
* file-change counts,
* context visibility,
* background-terminal views,
* active-agent views,
* navigable execution history,
* agent completion notifications,
* and focused drill-down into tool activity.

NewFang should extend those ideas around project stewardship.

### 20.1 Primary home view

The main question should be:

> Where is this project, and what is the next justified action?

The initial home view should prioritize:

* project identity,
* current phase,
* project health,
* active agents and jobs,
* blockers and risks,
* verification state,
* pending approvals,
* next acceptance gate,
* and recommended next action.

### 20.2 Secondary modules

Optional modules may expose:

* backlog,
* project ledger,
* claims and evidence,
* active agents,
* background terminals,
* changed files,
* Git state,
* model routing,
* cost and usage,
* remote machines,
* sandbox state,
* and session history.

### 20.3 Activity visibility

Visibility should be adjustable per task.

The default should show:

* high-level progress,
* important tool activity,
* significant decisions,
* failures,
* and reasoning summaries relevant to steering.

Raw traces should remain available without becoming the default experience.

Some high-level project narrative should remain visible when key decisions are being made.

---

## 21. Git and delivery behavior

### 21.1 Commit checkpoints

NewFang should suggest commits at meaningful boundaries.

It should not create commits after every minor action.

A commit-preparation process should inspect:

* diff scope,
* unrelated changes,
* generated files,
* secrets,
* tests,
* documentation,
* and commit-message quality.

### 21.2 Automatic commits

Commits may be created at approved checkpoints.

Pushing should require explicit approval unless a future narrowly scoped policy says otherwise.

### 21.3 Pull requests

A pull request should be prepared or created when:

* the work reaches a coherent delivery boundary,
* required gates pass,
* documentation is ready,
* known risks are stated,
* and the diff is reviewable.

### 21.4 Release workflow

The release experience should inspect, as applicable:

* test and verification gates,
* documentation accuracy,
* version identity,
* changelog or release notes,
* commit and branch quality,
* installation paths,
* upgrade paths,
* security and secret exposure,
* packaging,
* generated artifacts,
* capability and performance claims,
* repository cleanliness,
* pull-request readiness,
* rollback,
* and recovery.

Depth should scale with project type and rigor.

---

## 22. Configuration and extensibility

NewFang should provide:

* sensible defaults,
* human-readable policies,
* agent definitions,
* model-routing rules,
* execution profiles,
* approval rules,
* and project-level overrides.

Configuration should be understandable enough that Joshua can determine why the system behaved a particular way.

NewFang should not depend on one enormous opaque configuration file.

Configuration may be divided into focused areas such as:

```text
newfang/
  agents/
  routing/
  policies/
  workflows/
  views/
  project-types/
  execution/
```

Natural-language guidance may supplement structured configuration, but important operating rules should remain inspectable and testable.

---

## 23. Controlled self-modification

NewFang should be especially effective at helping develop NewFang.

It may:

* inspect its extensions,
* propose interface improvements,
* identify recurring workflow failures,
* generate new modules,
* modify policies,
* and improve routing.

Changes to NewFang itself should occur in a controlled development mode.

They should require:

* an explicit objective,
* tests,
* evidence,
* review,
* and approval before activation.

NewFang must not silently rewrite its own operating rules.

---

## 24. Continuous improvement

NewFang should detect recurring problems such as:

* repeated clarification failures,
* weak handoffs,
* avoidable test failures,
* poor model routing,
* missing evidence,
* excessive interruption,
* unnecessary cost,
* or recurring repository cleanup.

It should propose improvements to:

* prompts,
* agent definitions,
* policies,
* tools,
* workflows,
* tests,
* and interface behavior.

Improvements should be evidence-backed and reviewable.

They should not be activated silently.

---

## 25. MVP promise

The first meaningful NewFang version should prove:

> A real project can move from intake through implementation, verification, and delivery while NewFang maintains ownership, preserves project truth, routes work appropriately, and supports its completion claims with evidence.

A usable MVP should be able to:

1. Accept a natural-language request or planning document.
2. Orient itself inside an existing repository.
3. Build a lightweight project brief.
4. Maintain a project ledger and backlog.
5. Identify the next justified work boundary.
6. Delegate at least one bounded specialist task.
7. Track active agents or background jobs.
8. Integrate delegated results through the Project Steward.
9. Track at least one important claim.
10. Run an independent verification step.
11. Save a reproducible receipt.
12. Update relevant documentation.
13. Suggest or create a commit at an approved checkpoint.
14. Prepare a pull request or equivalent delivery summary.
15. Resume the project from durable state.

---

## 26. MVP non-goals

The first version does not need:

* a sophisticated portfolio dashboard,
* full Jira replacement behavior,
* many specialized project types,
* every coding harness integration,
* fully autonomous publishing,
* a workflow marketplace,
* organization-level permissions,
* complex sprint management,
* precise cross-provider credit accounting,
* mandatory sandboxing,
* or a public product narrative.

---

## 27. Proposed implementation phases

### Phase 0: Pi capability and adoption audit

Determine:

* what Pi already provides,
* which Ben-inspired extensions can be adopted,
* which should be adapted,
* which conflict with NewFang’s direction,
* and what must be built uniquely.

Outputs:

* capability matrix,
* extension inventory,
* reuse recommendations,
* integration risks,
* and initial technical boundaries.

### Phase 1: NewFang shell

Create:

* package and configuration structure,
* base theme,
* primary status bar,
* modular view system,
* project identity,
* branch and worktree status,
* and command registration.

The goal is not visual polish alone. The shell should establish stable extension boundaries.

### Phase 2: Project orientation and intake

Implement:

* conversational intake,
* planning-document intake,
* repository orientation,
* decision classification,
* initial project brief,
* and concise understanding check.

### Phase 3: Durable project state

Implement:

* project ledger,
* lightweight backlog,
* decisions,
* assumptions,
* risks,
* blockers,
* claims,
* evidence links,
* and resumable state.

### Phase 4: Project Steward and delegation

Implement:

* permanent role definitions,
* model-independent agents,
* structured handoffs,
* bounded subagent execution,
* active-agent views,
* completion notifications,
* and Steward integration checks.

Initial harness support should remain intentionally narrow.

### Phase 5: Execution management

Implement:

* local foreground commands,
* background terminals,
* process ownership,
* output views,
* stopping controls,
* and basic long-running execution contracts.

Investigate local sandboxing during this phase without making it a release blocker.

### Phase 6: Verification and receipts

Implement:

* acceptance gates,
* claim tracking,
* independent verification,
* receipt storage,
* limitation reporting,
* and completion blocking for unsupported claims.

### Phase 7: Git and delivery

Implement:

* commit checkpoint suggestions,
* diff audits,
* documentation checks,
* release-readiness checks,
* and pull-request preparation.

### Phase 8: End-to-end acceptance project

Run NewFang against one real project from intake through delivery.

The acceptance project should contain:

* a meaningful implementation change,
* at least one delegated specialist,
* a genuine technical risk,
* multiple tests,
* a documentation requirement,
* an independently verified claim,
* and a clean Git delivery boundary.

---

## 28. MVP acceptance criteria

NewFang v0.1 is successful when:

* Joshua can begin with rough notes or an existing plan.
* NewFang forms an accurate working understanding without excessive questioning.
* The Project Steward maintains accountability across delegation.
* Project state survives session interruption.
* The backlog remains useful without feeling like administrative overhead.
* NewFang surfaces key decisions without reporting every minor action.
* Agents do not overwrite overlapping work without coordination.
* Important completion claims are linked to evidence.
* Independent verification can reject an unsupported result.
* The system produces a usable delivery package.
* Joshua needs fewer manual coordination prompts than with his current harness workflow.
* The complete experience feels like one system rather than disconnected extensions.

---

## 29. Major risks

### 29.1 Excessive ceremony

The project could recreate heavy project management inside a coding harness.

Mitigation:

* progressive rigor,
* lightweight defaults,
* optional modules,
* and quick-utility workflows.

### 29.2 Interface overload

Project state, agents, terminals, evidence, cost, and Git information could overwhelm the terminal interface.

Mitigation:

* modular views,
* progressive disclosure,
* strong home-view hierarchy,
* and customizable visibility.

### 29.3 Unreliable project state

Agent-generated state may become stale or conflict with repository reality.

Mitigation:

* reconciliation on resume,
* source attribution,
* explicit verification dates,
* and repository-truth checks.

### 29.4 Weak delegation boundaries

Parallel agents may create conflicts or produce incompatible results.

Mitigation:

* bounded work assignments,
* declared file scope,
* structured handoffs,
* and Project Steward integration.

### 29.5 False confidence from verification

Passing tests may be presented as proving more than they actually prove.

Mitigation:

* claim-specific gates,
* explicit limitations,
* independent verification,
* and evidence-linked completion language.

### 29.6 Provider and harness churn

Models, subscriptions, command-line tools, and harness capabilities will change.

Mitigation:

* role/model separation,
* adapter boundaries,
* capability-based routing,
* and replaceable integrations.

### 29.7 Sandboxing complexity

A sandbox may make ordinary development harder or create confusing file and environment behavior.

Mitigation:

* treat sandboxing as optional,
* test multiple approaches,
* and prioritize transparent promotion of changes.

### 29.8 Self-modification risk

A system capable of modifying itself may degrade its own policies or reliability.

Mitigation:

* controlled development mode,
* test gates,
* approval before activation,
* and rollback.

---

## 30. Deferred decisions

These decisions should be resolved through technical discovery or real usage rather than another broad questionnaire:

* exact Pi extension structure,
* initial harness adapters,
* internal state-storage format,
* repository artifact names,
* sandbox technology,
* remote-execution protocol,
* first acceptance project,
* detailed interface navigation,
* exact approval categories,
* and the initial model-routing table.

Each should be resolved when the relevant design or prototype produces concrete tradeoffs.

---

## 31. Immediate next artifact

The next artifact should be:

# NewFang Pi Capability and Extension Audit

It should compare:

* native Pi capabilities,
* Ben Davis’s demonstrated extensions,
* NewFang requirements,
* direct reuse opportunities,
* adaptation opportunities,
* unique NewFang components,
* implementation dependencies,
* and recommended build order.

That audit should become the basis for the first repository structure and implementation plan.
