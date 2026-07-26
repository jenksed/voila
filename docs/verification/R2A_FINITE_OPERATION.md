# R2A — One finite supervised project operation

Verification record for **R2A: One finite, local, non-interactive project operation supervised
through a language-neutral lifecycle**. The first implementation packet under
[R2-0](../plans/R2_0_OPERATIONAL_RISK_AND_AUTHORITY_ENVELOPE.md).

This record separates two evidence tiers:

- **Automated contract tier** — what the supervisor and tool surface do under controlled fixtures
  and the real accepted operation. Deterministic, run by `mise exec -- npm run verify`.
- **Interactive tier** — whether a fresh Pi session that receives `Continue.` identifies the
  R2A work and exercises the accepted finite operation without developer monitoring.

The honest capability boundary, the no-cross-process claim, the cross-process limitation, and
what R2A does **not** establish are recorded at the end.

---

## 1. Scope and accepted decisions

DEC-21 records the accepted R2A scope. The first accepted operation is `r2a.state-store-tests`
v1: executable `mise`, argv `["exec","--","node","--test","test/state.store.test.ts"]`, working
directory `repository_root`, risk class `safe_and_expected`. The retry policy is zero automatic
retries on every failure class. Time budgets are 10s startup, 120s total, 5s graceful, 5s forced.
Output limits are 16 KiB per chunk, 256 KiB in-memory tail, 1 MiB durable redacted output per run.
Concurrency is one active operation per project root.

The single-process boundary is explicit: R2A does not claim safety across multiple Pi processes,
multiple Node processes, future worker processes, external state writers, process crashes during
persistence, network filesystems, or stale inter-process locks. No filesystem lock is implemented
for the sake of appearing complete.

R2A deliberately does **not** implement: operation discovery, stack adapters, operation
manifests, user-authored workflows, queues, multiple concurrent operations, services, watchers,
PTYs, child workers, cross-session recovery, cross-process coordination, remote execution, or
approval bundles. The Steward skill, doctrine, and handoff state this explicitly.

---

## 2. Automated contract tier

```text
mise exec -- npm run verify   →  666 tests, 666 pass, 0 fail, 1 skip (exit 0)
```

`npm run verify` is `tsc --noEmit && prettier --check && node --test`. The schema was bumped from
v4 to v5 to introduce `operationDefinitions` and `operationRuns`; the migration chain is
verified to walk from every prior version to the current schema. 38 new tests were added.

| Contract                                                            | Where                                  |
| ------------------------------------------------------------------- | -------------------------------------- |
| The accepted R2A operation is exactly one (id, version, executable, argv) | `test/operations-domain.test.ts` |
| Definition fingerprint is stable across re-registration and changes when argv changes | `test/operations-domain.test.ts` |
| Shell metacharacters in executable or argv are rejected            | `test/operations-domain.test.ts`       |
| Non-finite operations are rejected                                  | `test/operations-domain.test.ts`       |
| Unsupported working-directory policies are rejected                 | `test/operations-domain.test.ts`       |
| Register is idempotent on (id, version)                             | `test/operations-domain.test.ts`       |
| Find returns the latest version when version is omitted             | `test/operations-domain.test.ts`       |
| Lifecycle states cover queued, starting, running, and the 5 finals  | `test/operations-domain.test.ts`       |
| `isFinalState` is true exactly for the canonical final set          | `test/operations-domain.test.ts`       |
| Lifecycle transitions reject illegal moves (queued → passed etc.)   | `test/operations-domain.test.ts`       |
| Final states are terminal                                           | `test/operations-domain.test.ts`       |
| Runs with shared (fingerprint, project, root, worktree, fp) are equivalent | `test/operations-domain.test.ts` |
| `activeRun` returns the only active run                             | `test/operations-domain.test.ts`       |
| `latestSettlement` returns the most recent final run                | `test/operations-domain.test.ts`       |
| `summarizeRun` reports lifecycle, duration, pending acknowledgement | `test/operations-domain.test.ts`      |
| Registry registers the accepted operation exactly once              | `test/operations-supervisor.test.ts`   |
| Start returns before settlement; parent can keep working            | `test/operations-supervisor.test.ts`   |
| Passing exit produces one `passed` settlement                       | `test/operations-supervisor.test.ts`   |
| Nonzero exit produces one `failed` settlement                       | `test/operations-supervisor.test.ts`   |
| Equivalent active request reuses the run without spawning a second  | `test/operations-supervisor.test.ts`   |
| Different operation at capacity is rejected (no queue, no auto-cancel) | `test/operations-supervisor.test.ts` |
| stdout and stderr stay attributed and labelled separately           | `test/operations-supervisor.test.ts`   |
| Classified secret values are redacted from stdout and stderr        | `test/operations-supervisor.test.ts`   |
| Authorization headers and embedded-credential URLs are redacted     | `test/operations-supervisor.test.ts`   |
| Output exceeding the durable cap is truncated; dropped bytes counted | `test/operations-supervisor.test.ts`  |
| Timeout produces one `timed_out` settlement and never auto-retries  | `test/operations-supervisor.test.ts`   |
| Cancellation produces one `cancelled` settlement                    | `test/operations-supervisor.test.ts`   |
| Racing close + cancel produces exactly one canonical settlement     | `test/operations-supervisor.test.ts`   |
| Prompt-injection-style output text is preserved verbatim, labelled untrusted | `test/operations-supervisor.test.ts` |
| Unknown definition id is rejected without spawning                  | `test/operations-supervisor.test.ts`   |
| Non-POSIX platforms are rejected                                    | `test/operations-supervisor.test.ts`   |
| Output for an unknown run returns null                              | `test/operations-supervisor.test.ts`   |
| The real `r2a.state-store-tests` operation settles passed against the actual project | `test/operations-supervisor.test.ts` |

---

## 3. Capability boundary, stated honestly

What R2A makes true:

- The Steward can start one explicit accepted finite operation through `voila_start_operation`.
- Start returns before settlement; the Steward continues useful work.
- Exactly one canonical settlement is recorded per run, including under racing exit, cancellation,
  and timeout.
- Equivalent active requests reuse the existing run; different requests at capacity are rejected.
- Output is bounded, classified secrets and authorization headers are redacted before persistence
  or model exposure.
- Output is labelled untrusted; prompt-injection content cannot authorize an action.
- Start and end fingerprints are recorded; changed-during-run is recorded honestly.
- Wrong project, wrong worktree, shell metacharacters, and unknown definitions are rejected.
- The parent Steward receives the settlement through canonical state on its next turn (no hidden
  polling).
- The focus capsule shows one bounded active or settled operation summary.

What R2A does **not** establish:

- No cross-process safety. The supervisor lives in the same Node/Pi process as the Steward and
  relies on the per-root async write mutex already in `src/state/store.ts`. A second Node process
  mutating `.voila/project.json` is **not** protected by R2A.
- No service readiness, no watcher cycles, no PTY input, no terminal takeover.
- No worker assignment, no child-agent delegation. The Steward still does not spawn subagents
  (R3 is separate).
- No operation discovery. Operations are explicit and accepted through canonical registration.
- No execution deduplication beyond the same-active-run reuse already built.
- No persistent execution across Pi or OS restart. Restarting Pi or the machine abandons any
  active run; the supervisor does not reattach.
- No multiple concurrent operations. Capacity is one per project root.
- No arbitrary shell sessions. The supervisor refuses `shell: true` and argv containing shell
  metacharacters.

---

## 4. Open follow-ups beyond R2A

- Multiple concurrent operations on different definitions (R2B).
- The `list` and `wait` tool surface; today they are deliberately omitted (R2B).
- Reattachment after Pi or OS restart (R5).
- Cross-process coordination and crash consistency (R5/R6).
- Automatic result integration (R4).

These belong to later packets. They are not in R2A and are not claimed.

EOF