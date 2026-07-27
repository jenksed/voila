# R2A — One finite supervised project operation

Verification record for **R2A: one finite, local, non-interactive project operation with
deterministic admission and a language-neutral lifecycle**.

**Current verdict: R2A acceptance passed on 2026-07-26.** The DEC-22 authority pivot passes the
full repository gate and the explicitly reloaded Pi runtime passed the real parent-Steward sequence.
This accepts only the bounded R2A capability; it does not complete NF-10 or claim later R2 behavior.

---

## 1. Accepted contract

DEC-21 selected one operation:

```text
id:         r2a.state-store-tests
version:    1
executable: mise
argv:       ["exec", "--", "node", "--test", "test/state.store.test.ts"]
cwd:        repository root
```

DEC-22 corrected the admission model. R2A now separates:

1. effect profile;
2. authority requirement;
3. deterministic admission decision;
4. post-execution outcome;
5. post-observation recovery response.

The accepted operation declares effects `local_read` and `bounded_temporary_write`. It requires
`accepted_project_operation` authority sourced from DEC-22. The model-facing start tool accepts the
operation ID, optional ownership metadata, and no executable, argv, cwd, effect, authority, timeout,
environment, or output-policy substitution.

The earlier `riskClassification` structure remains only as a Steward response hint. It is not an
admission input.

---

## 2. Implementation map

| Contract | Implementation |
| --- | --- |
| Closed effect, authority, and result vocabularies | `src/domain/types.ts` |
| Policy version independent of schema version | `src/domain/types.ts` (`POLICY_VERSION`) |
| Pure model-independent evaluator and stable rule IDs | `src/domain/operation-admission.ts` |
| Stable human explanation derived from rule IDs | `explainAdmission()` in `src/domain/operation-admission.ts` |
| Internal resolved start value | `AuthorizedOperationStart` in `src/domain/operation-admission.ts` |
| Canonical definition fingerprint binds ordered argv, effects, and authority | `src/domain/operations-runtime.ts` |
| Atomic admission plus `starting` reservation | `FiniteOperationSupervisor.start()` inside the per-root `updateState` critical section |
| One in-process supervisor per repository root | `operationSupervisor()` in `src/state/operations-runtime.ts` |
| Direct spawn with structured argv and `shell: false` | `src/state/operations-runtime.ts` |
| Process-group signaling, timeout, cancellation, one settlement | `src/state/operations-runtime.ts` |
| Start/end content fingerprints and `changedDuringRun` | `src/state/operations-runtime.ts` |
| Bounded redacted in-memory and durable output | `src/state/operations-runtime.ts` |
| Durable output remains readable after acknowledgement | `FiniteOperationSupervisor.readOutput()` |
| One capsule delivery followed by acknowledgement | `assembleContextEnvelope()` and `before_agent_start` in `src/extension/register.ts` |
| Shared source/cwd/mutation path boundary | `src/state/path-boundary.ts` and `src/state/source.ts` |
| Structured `write`/`edit` block for all `.voila/` paths | `enforceProtectedPathMutation()` in `src/extension/register.ts` |
| Static descriptors for all four R2A tools | `src/domain/tool-enforcement.ts` |
| Explicit supported ID-counter repair | `voila_repair_state_counters` and `repairSequenceCounters()` |
| Schema-v5 pivot migration and legacy `cwdRef` recovery | `src/domain/migrate.ts` |

Admission receives only resolved canonical/runtime facts. Model identity, provider, prompt prose,
reasoning text, conversation history, display metadata, and operation output are absent from the
policy type and are varied in deterministic invariance tests.

---

## 3. Automated tier status

**Passed.** After the extension reload, `voila_repair_state_counters` advanced the canonical DEC
sequence from 22 to 23 without renumbering any entity. NF-17 then passed all protected completion
gates.

RCP-109 records the full protected command on 2026-07-26:

```text
mise exec -- npm run verify
TypeScript: passed
Prettier:   passed
Full Node test suite: passed (3 platform/fixture skips)
```

RCP-110 independently supports the counter-repair claim and proves the unchanged dogfood
structural-health assertion passes. The receipt-backed suite includes:

- pure admission allow/deny/reuse and forbidden-metadata invariance;
- parallel equivalent starts reserving one run and returning `reuse_existing`;
- structural-health denial before run creation;
- passing, failing, timeout, cancellation, and racing settlement paths;
- start/end fingerprints and changed-during-run detection;
- process-group cleanup observations;
- redaction, truncation, durable output, and untrusted-output handling;
- shared path containment, symlink escape, protected mutation interception;
- exactly-once capsule settlement acknowledgement;
- v5-to-v6 legacy `cwdRef` migration recovery;
- explicit counter repair.

Earlier shell-driven runs remain exploratory only; RCP-109 and RCP-110 are the canonical Voila
verification evidence.

---

## 4. Interactive tier status

**Passed on 2026-07-26.**

Two earlier attempts exercised a stale loaded module graph and failed validation before process
creation. Neither created a run or counted as acceptance evidence. RSK-9 records that runtime/source
skew and the explicit-reload mitigation.

The corrected sequence then passed:

1. the Pi extension runtime was explicitly reloaded;
2. `voila_repair_state_counters` repaired the only structural-health failure;
3. RCP-109 recorded a current passing full verification gate;
4. `voila_start_operation({ operationId: "r2a.state-store-tests" })` returned RUN-5 while running,
   with `allow` and rule `ADMIT.OPERATIONS.ALLOW_NEW`;
5. the parent continued useful independent work without polling: `git diff --check` passed and a
   bounded stale-capability-claim search returned no matches;
6. on the next `Continue.`, the focus capsule automatically delivered one `passed` settlement after
   0.3 seconds;
7. the extension acknowledged that exact delivered run on the same turn;
8. RCP-111 verified RUN-5's passing settlement, DEC-22 admission, NF-16 ownership, and exactly one
   reservation plus one acknowledgement event.

No developer watched another terminal, reported completion, or carried output back to the Steward.
There was no automatic retry and no manual status polling before delivery.

---

## 5. Enforcement boundary

Hard-enforced in R2A:

- operation ID resolves only through the accepted registry;
- executable and ordered argv come from the accepted definition;
- authority comes from canonical accepted references;
- unknown, invalid, wrong-project, wrong-worktree, structurally unhealthy, retry-exhausted, and
  capacity-occupied requests receive stable decisions before process creation;
- admission and capacity reservation occur in one per-root in-process critical section;
- equivalent `starting` or `running` requests reuse the existing run;
- general structured `write` and `edit` calls targeting `.voila/` are blocked before mutation;
- supported internal Voila state/artifact transitions remain allowed;
- operation output cannot grant runtime authority.

Explicitly not hard-enforced:

- arbitrary `bash` command effects;
- unknown third-party tool effects;
- network denial (the accepted operation does not require network, but R2A has no network sandbox);
- a second Pi/Node process mutating the same project;
- universal Pi-tool policy.

R2A introduces no policy DSL, approval database, RBAC system, or sandbox.

---

## 6. Capability boundary

Implemented in the working tree:

- one explicit accepted finite operation;
- pure deterministic model-independent admission;
- atomic in-process admission and one-run reservation;
- direct executable-plus-argv spawn;
- finite lifecycle, timeout, cancellation, process-group signaling, and one settlement;
- bounded redacted output with durable artifacts;
- content-change truthfulness;
- one bounded operation summary in the focus capsule;
- one parent-turn settlement delivery and acknowledgement;
- structured-file protection for canonical Voila paths.

Not implemented or not claimed:

- arbitrary commands or operation discovery;
- services, readiness probes, watchers, PTYs, or terminal takeover;
- worker agents or subagents;
- queues or multiple concurrent operations;
- cross-process coordination, crash-consistent persistence, or restart adoption;
- immediate unsolicited settlement turns while the parent is idle;
- universal tool interception, network sandboxing, or generalized policy language;
- remote execution, approval bundles, receipt fan-out, or later R2–R7 capabilities.

---

## 7. Acceptance verdict

```text
R2A accepted operation contract: PASS
Pure deterministic admission kernel: PASS · RCP-109
Atomic admission and reservation: PASS · RCP-109
Protected canonical-state boundary: PASS FOR STRUCTURED WRITE/EDIT · RCP-109
Freshly reloaded Pi acceptance: PASS · RUN-5 / RCP-111
No Managing the Manager gate: PASS
NF-10 completed: NO
Later R2 runtime started: NO
Branch ready for owner review: YES
```

NF-16 completed through the protected transition after all 11 gates passed. Its obsolete dependency
on broader NF-10 was reversed: NF-10 now depends on its completed R2A slice. The remaining action is
owner review and delivery; broader NF-10 stays backlog.
