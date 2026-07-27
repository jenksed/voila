# R2B — Background Operation Visibility

Verification and acceptance record for NF-20 / NF-10.

**Current verdict: pass.** Implementation, automated verification, deterministic UI, real-TTY
presentation, fresh Project Steward behavior, and controlled stale-state truth pass. All four
acceptance tiers pass, and NF-20 plus NF-10 completed through Voila's evidence-gated protected
transition on 2026-07-27.

---

## 1. Accepted source

- Preserved intake: `INT-9`, 1,631 lines, sha256 prefix `0a85e7983a04`.
- Corrected interpretation: revision 2.
- Accepted decision: DEC-23 only.
- Owner authorization: explicit in the preserved source.
- Accepted operation ID: `r2b.repository-checks` (not `repository-verify`).
- Model input: `operationId` only.
- Tools added: none; list/wait/poll are prohibited in this packet.

The preserved source supersedes the earlier unaccepted
`docs/plans/R2B_BACKGROUND_OPERATION_PACKET.md` wherever they differ.

---

## 2. Preflight — 2026-07-27

| Check | Observation | Verdict |
| --- | --- | --- |
| Starting SHA | `b5e955ec61e0cd90c82fb53e5c2ebed9f08df47e` | pass |
| Accepted R2A tip | `7640b80`, contained by merged main `b5e955e` | pass |
| Implementation branch | `feat/r2b-operation-visibility`, created directly from merged main | pass |
| Worktree scope | Only NF-20 planning, canonical intake/state, and generated views were present before implementation | pass |
| Repository identity | Active Pi process cwd matched this repository | pass |
| Related runtime processes | One Pi host for this checkout; no second Voila Node/Pi writer observed | pass |
| Pi | `@earendil-works/pi-coding-agent` 0.82.0 | pass |
| Node | 22.23.1 through mise | pass |
| Canonical schema | v6; current loaded Voila tools read revision 368 successfully | pass |
| Accepted decisions | DEC-22 and DEC-23 present and accepted | pass |
| Operation registry | Exactly `r2a.state-store-tests` before R2B implementation | pass |
| R2A baseline | RCP-132: `mise exec -- npm run verify`, passed | pass |
| NF-10 | Backlog; no claims; old terminal wording captured before correction | expected |
| NF-20 | In progress; owner-authorized bounded implementation source preserved | expected |
| Broader runtime | No PTY, service, watcher, worker, queue, multiple-operation, or cross-process runtime | pass |
| Approval bundles | Paused; no implementation resumed | pass |

The implementation Pi process originally predated R2B source changes. A deliberate `/reload` occurred
before runtime acceptance; the refreshed public start-tool schema accepted only `operationId` and the
new runtime launched `r2b.repository-checks` as RUN-6, RUN-7, and the bounded-delay visual fixture
RUN-8. This prevents stale-module evidence from being mistaken for R2B acceptance.

---

## 3. Proof reconciliation before NF-10 correction

NF-10 had no claims or required claims. Its criteria before correction were:

1. `The Steward launches a test process, continues useful parent work while it runs, receives the result automatically without the developer checking, and acts on the outcome`
2. `The ordinary Pi surface shows an active-terminal indicator while a process runs, and a deeper view shows the process, its elapsed time, and the work item that owns it`
3. `A process result is delivered as one completion event and is never injected into an active stream`

Changing criterion 2 therefore cannot orphan or silently reinterpret any NF-10 claim or receipt.
Historical R2A receipts remain attached to their original claims only and do not become NF-10 UI
evidence.

---

## 4. Implementation and automated traceability — 2026-07-27

Implemented:

- one additional accepted finite operation, for exactly two accepted definitions total;
- fixed `mise exec -- npm run verify` execution under DEC-23 with a 300-second timeout and zero retry;
- operation-ID-only model input and immutable focus-derived ownership during atomic reservation;
- shared one-operation capacity and same-runtime equivalent reuse;
- one shared, time-injected presentation projection backed by current-runtime ownership and liveness;
- ordinary widget, Console Focus, focus-capsule, settlement-pending, and reconciliation-required views;
- lifecycle-bound refresh at reservation, running, settlement, acknowledgement, and Console open;
- stale canonical active-state denial without clear or adoption;
- existing next-parent-turn settlement and exactly-once acknowledgement path.

| Accepted automated requirements | Focused evidence | Result |
| --- | --- | --- |
| 1–8 registry, exact definition, authority, bounded effects, timeout/retry, immutable executable/argv, no model owner | `test/operations-domain.test.ts`; `test/operation-enforcement.test.ts`; `test/tools.test.ts` | pass |
| 9–17 focus capture/denial, shared capacity/reuse, metadata independence, project/worktree/health denials | `test/operation-admission.test.ts`; `test/operations-supervisor.test.ts` | pass |
| 18–27 runtime ownership, liveness, stale truth, pending/none, deterministic time, immutable owner, curated projection | `test/operation-presentation.test.ts`; `test/operation-admission.test.ts` | pass |
| 28–34 bounded widget active/none/reconciliation behavior | `test/operation-presentation.test.ts` | pass |
| 35–42 bounded Console Focus active/reconciliation/settled behavior | `test/operation-presentation.test.ts`; Console width regressions in `test/proof.ui.test.ts` | pass |
| 43–57 non-blocking supervision, exactly-once settlement, proof separation, changed-during-run, untrusted output, shared finalizer/capacity, R2A regressions | `test/operations-supervisor.test.ts`; `test/operations-capsule.test.ts`; `test/operation-enforcement.test.ts` | pass |
| UI refresh capability: lifecycle event, safe widget refresh, no polling or refresh storm | `test/extension.integration.test.ts` (`operation lifecycle requests bounded widget refreshes without polling`) | pass |
| 58 complete repository gate | `mise exec -- npm run verify`: 710 tests, 707 passed, 3 skipped, 0 failed | pass |

The final gate also passed TypeScript checking and Prettier checking. Operational passes never create
claim receipts; final support must use `voila_run_verification` after documentation settles.

## 5. Acceptance-tier status

| Tier | Status | Current evidence / remaining boundary |
| --- | --- | --- |
| A — deterministic surface model | pass | Pure projection/rendering covers active, settled pending, none, reconciliation, narrow/normal widget, Console detail, elapsed snapshots, and bounded width. |
| B — real TTY presentation | pass | Genuine Pi TUI after reload showed the ordinary active indicator, running Console detail with owner/elapsed snapshot, clean settled-pending transition, and no corruption or raw output. |
| C — fresh Project Steward behavior | pass | A new `Continue.` conversation started real RUN-9 by operation ID only, continued useful parent work, and received one automatically delivered passing settlement on the next parent turn without polling or retry. |
| D — stale-runtime truth | pass | Controlled state harness proves projection, widget, Console, admission denial, no clear/adoption, and Doctor warning without damaging real canonical state. |

### Tier B observation record — 2026-07-27

| Field | Observation |
| --- | --- |
| Pi / Node | Pi 0.82.0; Node 22.23.1 through mise |
| Terminal mechanism | Genuine current Pi TUI with project-local Voila extension reloaded |
| Width | Wide host TUI (exact column count was not exposed to the model); bounded narrow behavior remains covered by Tier A |
| SHA / branch | `b5e955ec61e0cd90c82fb53e5c2ebed9f08df47e`; `feat/r2b-operation-visibility` |
| Definition | `r2b.repository-checks` v1; `mise exec -- npm run verify`; DEC-23 |
| First runtime run | RUN-6 returned `running` promptly, then passed in 15.7s and was delivered once on the next parent turn |
| Useful parent action | Captured Pi/Node/SHA facts and reviewed the skill/verification update while RUN-6 was active |
| Settled presentation | Real Console exact observation: `ACTIVE OPERATION` / `Repository checks · passed · pending delivery`; no raw output or visual corruption |
| Running presentation | RUN-8 used the packet-authorized temporary 30-second test delay; the owner confirmed the requested ordinary widget and Console running/elapsed/`Owned by NF-20` presentation “looks good” |
| Delayed run settlement | RUN-8 passed in 36.2s, arrived once on the next parent turn, and was acknowledged once; the temporary fixture was then removed |
| Clean post-TTY gate | `mise exec -- npm run verify`: 710 tests, 707 passed, 3 skipped, 0 failed after fixture removal |
| Independent capsule observation | `Active operation: Repository checks · running · owned by NF-20` |
| Refresh / monitoring | Lifecycle refresh was automatic; no list, wait, poll, repeated refresh, or finish monitoring was used |
| Verdict | pass |

The deliberate reload was a validation boundary, not routine operation-state management. Normal
successful operation required no manual refresh, monitoring, list/wait calls, result copying, or state
repair. Opening the Console was the packet-required deliberate visual inspection.

### Tier C fresh-session record — 2026-07-27 (pass)

A genuinely new conversation began with only `Continue.` plus Voila's injected continuation capsule.
The fresh Steward recovered NF-20 without asking for a recap, acknowledged the previously delivered
R2A settlement, and selected the accepted full repository gate because it directly informs NF-20.

| Field | Observation |
| --- | --- |
| SHA / content state | `b5e955ec61e0cd90c82fb53e5c2ebed9f08df47e`; dirty NF-20 implementation tree described by the capsule as 58 changed files |
| Pi / Node / model | Pi 0.82.0; Node 22.23.1 through mise; `gpt-5.6-sol` |
| Pi invocation | `npm run pi`, observed from the current Pi process ancestry |
| Initial prompt | `Continue.` |
| Initial response | Two concise lines: acknowledged the settled R2A operation, identified this as the requested fresh-session Tier C turn, and proceeded without a question |
| Operation tool call | `voila_start_operation({ operationId: "r2b.repository-checks" })`; no owner, command, cwd, timeout, or policy supplied |
| Admission / authority | `allow`; `ADMIT.OPERATIONS.ALLOW_NEW`; definition authority remains DEC-23 |
| Run / recorded owner | `RUN-9`; ownership derived automatically from focused NF-20 |
| Start return | Returned promptly in `running` state; observed by `2026-07-27T02:29:18Z` |
| Useful parent action | While the run was active, captured the Pi/Node/SHA/invocation facts and updated this Tier C acceptance record |
| Monitoring behavior | One deliberate known-run read recorded active state; no wait, list, repeated status check, polling loop, or automatic retry |
| Active presentation | The live TUI retained its ordinary widget and Console access; the model did not invent a visual observation. Tier B remains the direct visual evidence. |
| Questions / interventions | 0 questions; 0 developer interventions after the initial accepted prompt |
| Settlement | RUN-9 settled once at `2026-07-27T02:29:23.740Z` after 15.6s, with exit code 0, `passed`, no content change during the run, no redaction, and no truncation |
| Automatic delivery | The next parent turn received the settlement through the continuation capsule; canonical acknowledgement for that exact run was recorded once at `2026-07-27T02:32:17.454Z` |
| Final reaction | The fresh Steward interpreted the passing lifecycle result, did not treat it as a receipt, did not read output as instructions, did not retry, and proceeded to acceptance/proof reconciliation |
| Settlement count | One canonical settlement, one next-turn delivery, one exact-run acknowledgement |
| Verdict | pass |

---

## 6. Capability boundary

Not implemented or claimed by R2B:

- PTY, terminal emulation, interactive stdin;
- services, readiness probes, watchers;
- queues or multiple active operations;
- arbitrary commands or operation discovery;
- model-facing list/wait/poll/follow/tail tools;
- cross-process coordination, restart/process adoption, or automatic stale repair;
- sandboxing or universal shell/tool enforcement;
- workers, subagents, R3 behavior;
- receipt fan-out or verification deduplication;
- approval bundles, remote execution, push, PR, or merge.

---

## 7. Final proof and risk reconciliation — 2026-07-27

- RSK-6 remains an accepted limitation for bounded R2 v1: one supervising Pi/Node process per
  repository root, same-process ownership, and no cross-process coordination, adoption, replay, or
  stale-state repair.
- RSK-7 is mitigated for both accepted definitions by their shared idempotent finalizer, output
  finalization, capacity release, next-turn delivery, exact-run acknowledgement, race regressions,
  and RUN-9's one settlement/one delivery/one acknowledgement result.
- RSK-8 is mitigated for the bounded operation path: ambient and Console presentation omit output;
  deliberate reads are bounded, redacted, and labelled untrusted; model input remains operation ID
  only; and instruction-like output cannot affect admission or create work.
- CLM-16 covers all nine NF-20 criteria and is required. CLM-17 covers all three corrected NF-10
  criteria and is required. Each claim received its own current passing `voila_run_verification`
  receipt for `mise exec -- npm run verify`; RUN-9 itself created no receipt or claim support.
- `voila_complete_work_item` accepted NF-20 and NF-10 after all eleven gates passed for each item.
  No generic status update or operational result was used as completion evidence.

The accepted capability is one supervised fixed operation at a time. The non-goals in section 6
remain non-goals after completion.
