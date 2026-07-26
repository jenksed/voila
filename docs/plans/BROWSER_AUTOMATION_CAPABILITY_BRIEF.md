# Browser Automation Capability for Voila

## Status

**Parked feature brief — not part of the active R1 implementation sequence.**

This document preserves a future product direction for browser automation in Voila. It is intentionally isolated on `feature/browser-automation-capability` so the idea can be revisited after the Project Steward Operational Loop has the process, worker, and settlement foundations it needs.

This is planning input, not accepted canonical project truth. If the work is resumed, this document should enter Voila through normal intake, review, and application before new canonical work items or decisions are created.

## 1. Decision summary

Voila should eventually have a **browser automation capability**, not a PandaScript-only feature.

The capability should use one Steward-facing skill that selects among four execution tiers:

```text
HTTP or API
    ↓ when browser state or client JavaScript is required
Playwright
    ↓ when a lighter nonvisual replay is more appropriate
PandaScript / Lightpanda
    ↓ when runtime judgment is genuinely unavoidable
Live browser worker
```

The corrected product position is:

- **Playwright is the default browser automation and E2E verification backend.**
- **PandaScript is an optional lightweight backend for narrow, repeatable, nonvisual procedures.**
- **Live browser reasoning is an exploratory or repair path, not the normal replay path.**
- **Plain HTTP or an existing API remains preferable when no browser is needed.**

This distinction matters because Playwright and PandaScript solve different problems.

Playwright is a mature testing and automation system with real browser engines, assertions, fixtures, traces, screenshots, retries, projects, device emulation, network controls, and CI integration.

PandaScript is a small deterministic browser procedure executed by Lightpanda without an LLM at replay time. It is attractive for lightweight extraction and simple DOM workflows, but it is not a replacement for full browser testing or visual verification.

## 2. Why this belongs in Voila

Voila is intended to move accepted work from intent through implementation and evidence-backed delivery without making the developer coordinate every model, tool, terminal, and verification step.

Browser automation is important to that mission because many meaningful product claims are only testable through a user-facing application flow:

- a form submits successfully;
- a failure state is explained correctly;
- a navigation path works;
- authentication reaches the intended destination;
- a mobile layout exposes required controls;
- a user journey works across multiple browsers;
- a JavaScript-driven page produces expected data;
- a release or hosted preview behaves as claimed.

Without a browser capability, the Steward may complete implementation work while remaining unable to establish whether the product actually works from the user’s perspective.

The desired operational loop is:

```text
Understand the acceptance criterion
    ↓
Choose the least complex honest browser tier
    ↓
Create or locate durable automation
    ↓
Run it through a bounded execution path
    ↓
Capture structured results and artifacts
    ↓
Settle the result against project truth
    ↓
Continue, repair, or escalate
```

The developer should not have to decide which browser tool to use, manually carry output between tools, inspect raw reports, or refresh proof bookkeeping during ordinary work.

## 3. Product hypothesis

If the Project Steward can select, run, interpret, and settle browser automation itself, then Voila can:

- validate actual user journeys rather than only command-line behavior;
- preserve browser evidence with delivery records;
- reduce repeated live-agent browsing;
- convert successful exploration into durable project automation;
- diagnose browser failures with richer evidence;
- distinguish implementation failure from environment or site drift;
- keep browser verification aligned with acceptance criteria;
- reduce the developer’s role as scheduler and message bus.

This capability passes the No Managing the Manager gate when the Steward can choose and settle the correct browser path without requiring routine developer routing.

## 4. Capability routing

The browser skill must choose the least expensive execution tier that can honestly establish the requested result.

### 4.1 HTTP or API

Use when:

- the target exposes a stable API;
- the required information exists in server-rendered HTML;
- browser state is irrelevant;
- JavaScript execution is unnecessary;
- rendering or user interaction is not part of the claim.

Do not open a browser merely because the source is a website.

### 4.2 Playwright

Use by default for product-facing browser verification, including:

- E2E acceptance tests;
- real user journeys;
- authentication flows;
- forms and application state;
- browser-context isolation;
- desktop and mobile emulation;
- screenshots and visual comparisons;
- responsive behavior;
- Chromium, Firefox, or WebKit coverage;
- network interception or mocking;
- uploads and downloads;
- trace-based diagnosis;
- browser tests intended to run in CI;
- any browser check that may become part of the project’s durable test suite.

### 4.3 PandaScript / Lightpanda

Use for narrower nonvisual procedures such as:

- structured extraction from a JavaScript-driven page;
- small repeatable DOM interactions;
- lightweight smoke checks;
- recurring information retrieval;
- replay of a previously explored browser procedure without an LLM;
- tasks where full Playwright installation and browser bundles are unnecessary overhead.

Do not use PandaScript as evidence for:

- pixel accuracy;
- visual layout;
- browser compatibility;
- responsive rendering;
- animation;
- screenshot correctness;
- behavior that depends on unsupported Web APIs.

### 4.4 Live browser worker

Use only when:

- the page is unfamiliar;
- the task requires runtime judgment;
- the workflow has changed and durable automation must be repaired;
- no stable procedure exists yet;
- the result is exploratory rather than routine verification.

The preferred outcome of successful exploration is a durable Playwright test or PandaScript, not permanent dependence on live browser reasoning.

## 5. Proposed skill

### Name

`browser-automation`

A single skill is preferable to separate top-level Playwright and PandaScript skills because the critical Steward behavior is correct routing.

Backend-specific references can live beneath the skill:

```text
.pi/skills/browser-automation/SKILL.md
.pi/skills/browser-automation/references/ROUTING.md
.pi/skills/browser-automation/references/PLAYWRIGHT.md
.pi/skills/browser-automation/references/PANDASCRIPT.md
.pi/skills/browser-automation/references/SECURITY.md
.pi/skills/browser-automation/references/ARTIFACTS_AND_RECEIPTS.md
```

### Skill responsibilities

The skill should teach the Steward to:

1. identify what must actually be proven;
2. inspect the repository for existing browser tooling before adding anything;
3. choose HTTP, Playwright, PandaScript, or live exploration;
4. prefer repository-owned automation over ephemeral agent behavior;
5. distinguish visual claims from DOM or data claims;
6. define expected output and postconditions before running;
7. classify external side effects and credential requirements;
8. use existing project commands and configuration where possible;
9. preserve reports, traces, screenshots, and normalized observations;
10. interpret failures without claiming more than the evidence supports;
11. create repair work when durable automation drifts;
12. avoid asking the developer to operate routine browser proof infrastructure.

## 6. Playwright integration

### 6.1 Why Playwright is primary

Playwright already provides most of the behavior Voila needs from a browser verification system:

- multiple browser engines;
- isolated browser contexts and fixtures;
- locator-based assertions with automatic waiting;
- retries and flaky-test reporting;
- projects for browsers, devices, and environments;
- screenshots, video, and trace archives;
- JSON and machine-readable reporting;
- network interception and API mocking;
- code generation and trace inspection;
- CI-oriented execution.

Voila should integrate these capabilities rather than recreate them.

### 6.2 First integration path

Playwright may not require a dedicated Voila execution tool initially.

Existing project-owned Playwright commands can run through `voila_run_verification`, for example:

```text
executable: "npm"
args: ["run", "test:e2e"]
```

or:

```text
executable: "npx"
args: ["playwright", "test", "tests/e2e/signup.spec.ts"]
```

The initial browser skill should:

- discover existing Playwright configuration;
- locate relevant tests and project scripts;
- select the narrowest meaningful test target;
- run it through Voila’s verification path;
- preserve the command result honestly;
- associate the result with claims only when the test genuinely covers their acceptance criteria.

### 6.3 Playwright-aware integration

A later adapter becomes justified when Voila needs semantic understanding beyond command success.

Possible future tool:

`voila_run_playwright`

It could:

- run a selected suite, file, project, browser, or test title;
- enforce repository-relative configuration and test paths;
- configure a JSON reporter;
- parse suites, tests, projects, retries, and outcomes;
- distinguish passed, failed, skipped, interrupted, and flaky tests;
- preserve trace archives, screenshots, videos, and HTML or JSON reports;
- hash all attached artifacts;
- identify the failing browser step and assertion;
- expose exact test coverage to proof and delivery views;
- rerun failed tests only when retry semantics are safe;
- surface artifact locations through the Steward Console.

The adapter should reuse existing execution, timeout, fingerprint, receipt, and redaction primitives rather than creating a parallel proof engine.

### 6.4 Playwright receipt fields

A Playwright-aware receipt may include:

- command and arguments;
- Playwright package version;
- installed browser versions;
- configuration path and hash;
- selected project, browser, file, and test filters;
- repository fingerprint;
- test counts by status;
- retry and flaky status;
- assertion errors;
- test source paths;
- duration;
- trace, screenshot, video, and report artifact hashes;
- environment classification;
- claim associations;
- known limitations.

A Playwright pass can prove functional browser behavior within the tested configuration. It does not automatically prove every browser, device, environment, or visual state.

## 7. PandaScript integration

### 7.1 Role

PandaScript remains useful as a lightweight deterministic backend.

Its preferred operating model is:

```text
Reason once
    ↓
Preserve the browser procedure
    ↓
Replay without an LLM
    ↓
Validate structured observations
    ↓
Record a receipt
```

The script is deterministic code, but the remote environment may not be deterministic. Page content, sessions, timing, experiments, rate limits, and server behavior can change.

Voila should describe PandaScript as a **model-free reproducible browser procedure**, not a guarantee of identical external results.

### 7.2 Repository artifacts

Recommended managed-project convention:

```text
automation/browser/<workflow-name>.panda.js
automation/browser/<workflow-name>.workflow.json
```

PandaScripts are repository code and must not be hand-edited under `.voila/`.

A companion manifest should define bounded policy rather than becoming a general workflow language.

Example:

```json
{
  "schemaVersion": 1,
  "name": "local-signup-smoke",
  "engine": "lightpanda",
  "script": "automation/browser/local-signup-smoke.panda.js",
  "sideEffectClass": "local_reversible",
  "allowedOrigins": ["http://127.0.0.1:4173"],
  "requiredSecretNames": [],
  "timeoutMs": 30000,
  "resultSchema": {
    "type": "object",
    "required": ["status", "assertions", "observed"]
  }
}
```

### 7.3 Proposed tool

`voila_run_pandascript`

This backend-specific name is preferable until a genuine cross-backend execution contract has been proven.

The tool should accept a workflow manifest path, not an arbitrary command string.

Example input:

```json
{
  "manifestPath": "automation/browser/local-signup-smoke.workflow.json",
  "purpose": "Verify the local signup path reaches confirmation",
  "claimIds": ["CLM-..."]
}
```

The tool should:

- validate repository-relative paths;
- reject traversal and symlink escape;
- validate the manifest;
- enforce allowed origins;
- expose only declared `LP_*` environment names;
- invoke an exact supported Lightpanda binary without a shell;
- enforce timeout and output bounds;
- parse the script’s final JSON-compatible result;
- evaluate required postconditions;
- redact secrets;
- classify failure;
- record a receipt.

### 7.4 PandaScript receipt fields

A PandaScript receipt may include:

- manifest and script paths and hashes;
- exact Lightpanda version;
- executable identity or checksum;
- repository fingerprint;
- allowed origins;
- secret names, never values;
- purpose and side-effect class;
- timing and timeout;
- exit status;
- normalized structured result;
- postcondition results;
- bounded stdout and stderr;
- redaction events;
- failure classification;
- retry count;
- claim associations;
- local versus external target classification.

Process exit code zero is insufficient. A run passes only when the structured output is valid and the declared postconditions pass.

## 8. Browser worker

Once bounded Pi child workers exist, Voila may add a browser automation compiler and repair role.

The worker should not remain alive as a persistent browser agent.

### Compile task

Given an accepted browser objective, the worker returns:

- recommended backend;
- Playwright test or PandaScript;
- supporting configuration or manifest;
- assumptions;
- side-effect classification;
- expected postconditions;
- validation result;
- known limitations.

### Repair task

Given a failed durable workflow, the worker returns:

- failure diagnosis;
- evidence that the target or script changed;
- proposed patch;
- updated assumptions;
- validation against the fixture or approved target;
- any remaining uncertainty.

A worker-generated workflow remains untrusted until accepted through the appropriate review boundary. A worker cannot establish trust merely by saying its own output works.

## 9. Security boundaries

The browser capability must distinguish between execution power and proof value.

### Common controls

- repository-relative paths only;
- no shell invocation;
- bounded timeout and output;
- explicit environment-variable allowlists;
- secret redaction;
- child-process cleanup on timeout and cancellation;
- no automatic approval of generated automation;
- explicit handling of irreversible or external effects;
- no CAPTCHA or access-control bypass;
- no silent retry of potentially side-effecting actions;
- artifact hashing and provenance;
- honest distinction between local fixture and external target.

### Playwright-specific trust

Playwright tests execute inside Node.js and can access files, processes, network resources, and project code. They should be treated like other repository test code, not like a restricted browser macro.

### PandaScript-specific trust

PandaScript has a narrower runtime surface, but page-context evaluation can still execute JavaScript against the target page. `evaluate(...)` should be treated as a high-trust capability and may require explicit manifest declaration.

### Credentials

The first version should not invent a new credential store.

Credentials should remain external to repository code and canonical state. Only explicitly declared secret names should be passed to execution, and values must never be persisted in reports, receipts, logs, or model context.

## 10. Initial proof slices

### Slice A — Playwright through existing verification

Goal: prove that the Steward can discover and run a project-owned E2E suite without a dedicated Playwright tool.

Acceptance:

- an existing or fixture Playwright project is discovered;
- the narrowest relevant command runs through `voila_run_verification`;
- pass and failure receipts are honest;
- a browser acceptance claim is associated only when coverage is real;
- the developer is not asked to operate claim or receipt bookkeeping.

### Slice B — Playwright artifact preservation

Goal: preserve machine-readable reports and trace artifacts.

Acceptance:

- JSON report is parsed or attached;
- trace and screenshot paths are captured when produced;
- artifacts are content-addressed;
- failures identify the test, browser project, assertion, and artifact locations;
- delivery inspection can expose the evidence.

### Slice C — PandaScript local fixture

Goal: prove a complete model-free lightweight browser workflow without depending on the public internet.

Fixture requirements:

- asynchronous JavaScript-driven state;
- a form;
- a click action;
- a confirmation value;
- one deliberate failure mode.

The PandaScript must navigate, wait, fill, click, extract, and return structured output.

Acceptance:

- manifest and policy validation works;
- execution uses an exact supported Lightpanda version;
- malformed output and failed postconditions fail honestly;
- ten repetitions return the same normalized fixture result;
- each run produces an independent receipt;
- secret redaction and disallowed-origin tests pass.

### Slice D — Compiler and repair worker

Depends on bounded child workers and automatic settlement.

Acceptance:

- one unfamiliar local flow is compiled into durable automation;
- routine replay no longer requires an LLM;
- a deliberately broken selector or route is diagnosed and repaired;
- the repair is settled through deterministic execution;
- the developer is interrupted only for a material trust or scope decision.

## 11. Sequencing against the active roadmap

This capability must not displace the accepted Project Steward Operational Loop sequence.

```text
R1  Friction containment and ambient continuity
    No browser automation runtime work.

R2  One background terminal
    Establishes managed process execution and visibility.

R3  One bounded Pi child worker
    Enables compiler and repair workers.

R4  Operational integration and automatic settlement
    Enables worker and process results to settle without user scheduling.

After the operational loop proves itself
    Resume browser automation as a bounded feature packet.
```

A compatibility spike or further design work may happen earlier, but implementation should not interrupt the active roadmap without an explicit owner decision.

## 12. Proposed future work items

These are planning candidates only and must not be inserted into canonical state without intake and review.

### BA-1 — Browser automation skill

Create routing, safety, evidence, and fallback guidance.

### BA-2 — Playwright discovery and verification

Teach the Steward to discover existing Playwright configuration and execute relevant tests through the current verification tool.

### BA-3 — Playwright artifact adapter

Parse Playwright reports and preserve traces, screenshots, videos, retries, and flaky status.

### BA-4 — PandaScript compatibility spike

Select and test one exact Lightpanda release on the primary target environment.

### BA-5 — PandaScript manifest and policy

Define repository artifacts, origin restrictions, secret handling, output schemas, and side-effect classes.

### BA-6 — PandaScript deterministic runner

Implement `voila_run_pandascript` with bounded execution and structured receipts.

### BA-7 — Browser compiler and repair worker

Add bounded worker contracts after R3 and settlement integration after R4.

### BA-8 — Uncoached browser automation dogfood

Prove a fresh Steward can select, run, interpret, settle, and repair browser automation without developer routing.

## 13. Acceptance criteria for the complete capability

The eventual capability is acceptable when:

1. One `browser-automation` skill routes correctly among HTTP, Playwright, PandaScript, and live exploration.
2. Playwright is the default for full E2E and visual-capable browser verification.
3. PandaScript is used only for appropriate lightweight nonvisual procedures.
4. Routine replay of accepted automation requires no LLM.
5. Existing Playwright suites can run through Voila verification without a dedicated adapter.
6. A Playwright-aware path preserves structured test outcomes and browser artifacts.
7. PandaScript execution accepts a repository manifest rather than arbitrary commands.
8. Paths, origins, secrets, timeouts, output, and side effects are bounded.
9. Exit code alone cannot create a passing browser result.
10. Browser receipts record backend, version, configuration, repository fingerprint, outcomes, and limitations.
11. Claims are supported only when browser evidence genuinely covers their acceptance criteria.
12. Visual claims are never supported by PandaScript evidence.
13. Generated automation remains untrusted until accepted.
14. A local fixture proves deterministic positive and negative paths.
15. A repair exercise proves drift can be diagnosed and settled.
16. A fresh Project Steward can operate the capability without coaching.
17. No new proof engine, credential store, or unrestricted workflow language is introduced.
18. The implementation passes Voila’s own completion and delivery gates.

## 14. Open questions

When the feature is resumed, answer these before locking implementation:

1. Should the top-level skill be only `browser-automation`, or should a separate `playwright-testing` specialist skill also exist?
2. At what point does Playwright warrant `voila_run_playwright` rather than continued use of `voila_run_verification`?
3. How should Playwright traces, screenshots, videos, and reports be represented in immutable receipts?
4. Should flaky Playwright tests ever support a claim, or always remain insufficient until stable?
5. What exact trust transition allows newly generated browser automation to run unattended?
6. Should external-origin policy live only in repository manifests or also in canonical project state?
7. Should PandaScript `evaluate(...)` require a declared capability or be rejected initially?
8. Which existing subprocess and receipt primitives can be reused without destabilizing command verification?
9. What exact Lightpanda release and installation method should be supported?
10. What licensing review is required before any Lightpanda bundling or distribution?
11. Which project should provide the first meaningful dogfood case after local fixtures?
12. How should browser tests map to acceptance criteria without encouraging weak tests written only to satisfy gates?

## 15. Resume instructions

When returning to this branch later:

1. Rebase or recreate the branch from the then-current `main` if the roadmap or architecture has materially changed.
2. Read the current Project Steward doctrine, active roadmap, proof-engine design, and execution implementation.
3. Confirm that R2, R3, and R4 capabilities actually exist rather than assuming this document’s future dependencies were completed.
4. Re-check current Playwright and Lightpanda behavior, versions, licenses, and platform support.
5. Run this document through Voila intake as planning input.
6. Resolve the open questions and possible conflicts through review.
7. Start with the Playwright-through-existing-verification slice.
8. Add PandaScript only after the browser routing skill and primary E2E path are grounded.

## 16. Final recommendation

Voila should eventually treat browser automation as a first-class verification and execution capability.

The correct hierarchy is:

```text
HTTP/API for the simplest reliable path
Playwright for real product behavior and E2E evidence
PandaScript for lightweight deterministic replay
Live browser workers for exploration and repair
```

Playwright is foundational because it can establish whether the actual product works in a real browser.

PandaScript remains valuable because it can convert successful browser reasoning into a cheap, inspectable, model-free procedure.

The feature should be resumed only after Voila’s operational loop can manage processes, workers, results, and settlement without turning the developer back into the system’s scheduler.
