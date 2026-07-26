# Proof Engine

How Voila turns "I think this is done" into a state transition it will refuse unless evidence
supports it. Packet 4 introduces **claims**, **verification receipts**, **evidence freshness**, and
**protected completion** on canonical schema **v4**.

The chain is: **claim → executable verification → immutable receipt → freshness → protected
completion**.

## The guarantee, stated precisely

> Canonical state will not move a work item to `completed` unless every acceptance criterion is
> covered by a required claim **and** every required claim is supported by a current passing receipt.

**This guarantees Voila's state transition only.** It does **not** guarantee that a model never
writes unsupported prose, never overstates progress in conversation, or never believes a wrong thing.
A model can still say "done" in chat. What it cannot do is make `project.json` say `completed`
without evidence. That narrowness is the point: the ledger is the thing that is defended.

Two further honest boundaries:

- A `completed` status hand-written directly into `project.json` is schema-valid. Voila defends its
  own transitions, not the file against a text editor. `/voila doctor` reports when a completed
  item's current evidence no longer supports revalidating it.
- Verification executes a real command on the real machine. It is bounded, but it is **not a
  sandbox**.

## Claims

A claim is what someone asserts is true about a work item. It is not evidence.

```ts
interface Claim {
  id: string;                          // CLM-n
  workItemId: string;
  statement: string;
  confidence: "low" | "medium" | "high";
  coveredAcceptanceCriteria: string[]; // EXACT criterion text from the work item
  knownLimitations: string[];          // what this claim does NOT establish
  receiptIds: string[];                // creation order; never rewritten
  createdAt: string;
  updatedAt: string;
}
```

Rules the domain enforces:

- The referenced work item must exist.
- Every `coveredAcceptanceCriteria` entry must **exactly** match a criterion currently on that work
  item. Near-miss text (different capitalization, trailing space, paraphrase) is refused with an
  error naming the item's real criteria. A claim cannot invent a criterion.
- A claim must cover at least one criterion. A work item with no acceptance criteria cannot have
  claims — the error says to record criteria first.
- **There is no `supported` flag.** Support is derived on every read from receipts plus the current
  repository fingerprint. Nothing in the record, and no tool parameter, can assert that a claim
  holds.
- Claims are never deleted. No domain function, tool, or command removes one.
- Updating a claim may change its statement, confidence, covered criteria, and limitations. It may
  **not** change the work item it is about, and it never rewrites historical receipts.

`knownLimitations` is deliberately load-bearing: it is shown in the claim list, the Proof view, the
claim detail view, and `/voila claims CLM-n`. A supported claim still displays what it does not
establish.

### Requiring a claim

Attaching a claim with `voila_require_claim` puts it in the work item's `requiredClaimIds`. Only
required claims gate completion and only they raise attention in the console. Duplicates are
rejected, a claim about another work item cannot be required, and proof requirements cannot be added
to or removed from **completed** work — a completion record never loses its proof.

## Verification receipts

One receipt records one executed command.

```ts
interface VerificationReceiptRecord {
  id: string;            // RCP-n
  claimId: string;
  result: "passed" | "failed" | "error" | "timed_out";
  artifactRef: string;   // repository-relative, e.g. receipts/RCP-1
  executable: string;
  args: string[];
  cwdRef: string;        // repository-relative; "." is the repository root
  exitCode?: number;
  startedAt: string;
  finishedAt: string;
  repositoryFingerprint: string;
  gitHead?: string;
  outputTruncated: boolean;
}
```

### Artifact layout

```text
.voila/receipts/
├── .tmp/                 # Voila-owned staging; gitignored, promoted then gone
├── RCP-1/
│   ├── manifest.json     # full metadata + sha256 of each stream
│   ├── stdout.txt        # ANSI-stripped, capped at 64 KiB
│   └── stderr.txt        # ANSI-stripped, capped at 64 KiB
└── RCP-2/…
```

Ordering invariant, in this exact order:

1. compute the repository fingerprint,
2. execute the command,
3. write the **complete** artifact into `.voila/receipts/.tmp/<token>/`,
4. **atomically promote** it with a single `rename` into `.voila/receipts/RCP-n/`,
5. only then link the receipt into canonical state.

Consequences: a failed canonical update never leaves a *linked* partial receipt; the worst case is an
unreferenced promoted directory or an abandoned staging directory, both of which `/voila doctor`
detects and reports as safe to delete. Artifacts are immutable — an existing `RCP-n` directory blocks
reuse of that ID rather than being overwritten.

The receipt counter is re-derived from canonical state inside the reducer. If the ID a run reserved
no longer matches what the counter would allocate, canonical state moved underneath the run and the
link is refused rather than colliding.

### What is never recorded

- No stdout or stderr in `project.json` — only in the artifact.
- No environment-variable **names or values**. `manifest.json` records
  `"capturedEnvironment": "none"`.
- No absolute paths. `cwdRef` is repository-relative.
- No git diffs, raw or summarized.

Both streams are ANSI/VT-stripped (CSI, OSC, nF-class, and two-character escapes) and normalized for
carriage returns before hashing, then capped **independently** at 64 KiB. `outputTruncated` records
truncation honestly; the stored bytes are exactly what the manifest hash covers.

## Verification execution

The contract is structured only:

```ts
{ claimId, executable, args, cwdRef?, timeoutMs? }
```

- `child_process.spawn` with **`shell: false`**. No pipes, redirection, chaining, quoting, or
  variable expansion. Shell syntax inside an argument is passed through literally.
- A single arbitrary shell string is **refused**: an `executable` containing whitespace or shell
  metacharacters produces an error explaining that the program and each argument must be separate.
- `cwdRef` is resolved with the same safety rules as intake sources — absolute paths, `~`, `..`
  traversal, escapes, and symlinks resolving outside the repository are all rejected.
- Execution is bounded by a timeout (default 5 minutes, capped at 30). An over-large request is
  capped, not honored.
- Results map honestly: exit 0 → `passed`; non-zero → `failed`; timeout → `timed_out` (never
  "failed"); spawn failure → `error`.

**Tool success means the receipt was recorded, not that verification passed.** A failing command
produces a valid `failed` receipt, and both the tool text and `/voila verify` say so explicitly.

## Repository fingerprint

**Algorithm: v2.** A deterministic sha256 over a sorted representation of the **effective working
tree**, prefixed with the literal string `fingerprint-v2\n` so v1 and v2 inputs are disjoint:

- every tracked file currently present in the working tree, plus every untracked, non-ignored file,
- each entry carrying a normalized mode (`regular` | `executable` | `symlink`) and a sha256 over
  either the file content (streaming reads) or the symlink target bytes,
- paths sorted and repository-relative; no absolute path, no staging state, no branch name, no
  commit identity, no timestamp in the digest.

`gitHead` is reported on `RepositoryFingerprint` and persisted in receipt manifests as
**non-authoritative diagnostic metadata** — present for human inspection, never used in the digest,
never required for equality.

Properties, each covered by a test against real temporary git repositories
(`test/proof.fingerprint.test.ts`): deterministic when nothing changes; changes on tracked
modification, addition, removal, rename, executable-bit change, and untracked file add/modify/remove;
**unaffected by `git add`, `git reset`, or empty commits**; **unaffected by the repository's absolute
path or current branch name** (a byte-identical copy on another branch or at a different location
yields the same digest); unaffected by gitignored files; correctly represents symlink targets
explicitly; and **creating a receipt does not invalidate its own fingerprint** (a property with a
dedicated test).

When git is unavailable, `repositoryFingerprint` fails clearly. Read-only surfaces use a best-effort
variant that returns `null`, and `null` means *nothing can be current* — evidence reads `stale`, never
optimistically `supported`.

### Algorithm versioning and migration

Every receipt manifest records `fingerprintAlgorithm` (the value of the algorithm that produced it).
v2 is current; v1 is the diff-based predecessor that included `gitHead`, tracked diffs, and the staged
diff. A v1 receipt carries no `fingerprintAlgorithm` field; the proof engine recognizes it as v1 by
absence. Because the v1 and v2 digest inputs are structurally disjoint and the v2 input is prefixed
`fingerprint-v2\n`, a v1 hex value cannot equal a v2 hex value without a sha256 collision, so a v1
receipt is automatically `stale` against any v2 current without any code special-casing the algorithm.

The fingerprint ADR (`docs/decisions/0008-fingerprint-v2-content-addressed.md`) records the design
and the migration consequences: every v1 receipt becomes stale once on the first run that records a
v2 receipt, and re-running `voila_run_verification` once per claim produces a fresh v2 receipt.

### The `.voila/` exclusion

Everything under `.voila/` (and the legacy state directory while it still exists, on the same
grounds) is excluded from the fingerprint. This is deliberate and is the reason **creating a receipt
does not invalidate its own fingerprint** — a property with a dedicated test. Linking a receipt
necessarily rewrites `project.json`, `events.jsonl`, the generated view, and the artifact itself;
including them would make every receipt stale the instant it was created.

The tradeoff, stated plainly: **a change confined entirely to canonical state does not invalidate
existing evidence.**

## Evidence evaluation (derived, never stored)

For each claim, against the current fingerprint:

| Status | Meaning |
|--------|---------|
| `pending` | no receipt exists |
| `supported` | the newest receipt **matching the current fingerprint** passed |
| `unsupported` | the newest receipt matching the current fingerprint failed, errored, or timed out |
| `stale` | receipts exist but none matches the current fingerprint |

Two consequences worth naming: a newer failing receipt at the current fingerprint overrides an older
pass; and an older receipt still matching the current fingerprint keeps a claim supported even if a
later receipt ran against a different state.

This status is computed on read by every surface and is **never written into canonical state merely
by reading**.

## Protected completion

`voila_complete_work_item` (and `/voila complete NF-n`) is the **only** canonical path to
`completed`. Generic create and update still reject the status outright, and a test asserts no other
tool offers `completed` as a settable value.

Every gate is evaluated; **all** failures are reported, never just the first:

| Gate | Fails when |
|------|-----------|
| `not_completed` | the item is already completed |
| `not_cancelled` | the item is cancelled |
| `not_blocked` | the item is blocked |
| `no_blocked_reason` | a blocked reason is still recorded |
| `dependencies_completed` | any `dependsOn` item is not completed |
| `acceptance_criteria_present` | the item has no acceptance criteria |
| `required_claims_present` | the item has no required claims |
| `required_claims_resolve` | a required claim ID does not exist |
| `criteria_covered` | any acceptance criterion is uncovered by a required claim |
| `claims_supported` | any required claim is `pending`, `unsupported`, or `stale` |
| `no_open_high_impact_risk` | an **open** risk with `impact: "high"` is linked to the item |

On rejection, `CompletionRejectedError` carries the full assessment and canonical bytes are
**byte-identical** — no event is appended either. On success: the item is marked completed, its
history (creation time, criteria, requirements, title) is preserved, claims and receipts are
untouched, focus is cleared **if and only if** it pointed at this item — no new focus is chosen
automatically — exactly one `work_item_completed` event is appended, and the generated view is
refreshed.

## Surfaces

### Pi tools

`voila_create_claim`, `voila_update_claim`, `voila_require_claim`, `voila_list_claims`,
`voila_run_verification`, `voila_get_receipt`, `voila_complete_work_item`, `voila_get_proof`.

All use strict typebox schemas with `additionalProperties: false`, accept no filesystem root, expose
no support flag, and provide no completion bypass. `voila_get_receipt` returns output only when
asked, and then only a bounded excerpt.

### Human commands

| Command | Behavior |
|---------|----------|
| `/voila claims [CLM-n\|NF-n]` | Claims with derived status; detail includes coverage and limitations. |
| `/voila proof [NF-n\|CLM-n\|RCP-n]` | Overview, per-item gates and coverage, or curated receipt metadata. Never dumps output or raw JSON. |
| `/voila verify CLM-n -- executable [args...]` | Echoes the exact structured command (claim, executable, quoted args, cwd, the not-a-sandbox note) **before** executing. Only the first `--` is the separator, so `-- mise exec -- npm run verify` survives intact. |
| `/voila complete NF-n` | The protected transition; lists every failing gate on rejection. |

### Steward Console

Navigation order is **Focus → Work → Proof → Project Truth**. The Proof view shows claims by derived
status with limitations visible, required claims marked `*`, curated receipt rows (`current`/`stale`),
and the focused item's completion gate. Detail views exist for a claim, a receipt, and the completion
gate. **No command output appears in any primary view** — reading `stdout.txt` is a deliberate act.

The Focus view adds a compact proof-readiness block. The ambient widget adds **at most one** proof
warning (`unsupported` > `stale` > `unproven`) and stays within its two-line contract.

Unsupported and stale **required** claims raise attention (high and medium); pending claims do not —
unproven is a normal early state, not an alarm.

### Context injection

Deterministic, under the 2400-character cap: claim counts by status plus a compact rules line stating
that claims cite exact criteria, verification runs through `voila_run_verification`, a passing
command is evidence only for the claim it ran for, stale or failed evidence cannot complete work,
limitations stay visible, and only `voila_complete_work_item` may complete work. Individual claim
statements are never enumerated, and the wording deliberately avoids nudging toward satisfying the
gate cheaply.

### Doctor (read-only, repairs nothing)

Detects: v4 migration requirement; missing claim/receipt/requirement references; claims covering
criteria the work item no longer states; uncovered criteria on gated items; missing receipt
artifacts; manifest disagreeing with canonical metadata; stdout/stderr hash mismatch; stale or
unsupported evidence; duplicate IDs; out-of-date claim/receipt counters; leftover staging
directories; and **completed work whose current proof no longer revalidates**.

That last one is a **WARNING**, never a failure and never a reversion: the completion record stands
and the message says so. Silently un-completing work would be worse than a stale record.

## Schema v4 migration

An explicit `3 → 4` step, chaining `1 → 2 → 3 → 4` when needed. It follows the established pattern: a
read-only `schema-v3.ts` source validator, inspect-before-apply, explicit `--apply`, a timestamped
backup to `.voila/backups/`, validation of both source and full candidate before any write, atomic
replace, exactly one `schema_migrated` event after success, and a refreshed generated view. Unknown
versions are rejected; nothing migrates silently.

v4 adds `claims`, `receipts`, `sequences.claim`, `sequences.receipt`, and
`workItems[].requiredClaimIds`. **Existing work items default to `requiredClaimIds: []`**, which means
they cannot be completed until claims are attached deliberately. The migration invents no proof.

A failed migration leaves canonical bytes byte-identical, writes no backup, and appends no event.

## Non-goals

Not built here, and not implied: approval bundles, delegation, background processes, remote
execution, sandboxing, model routing, cost tracking, release publishing, automated PRs, general
workflow engines, manual evidence attestation, browser screenshots, and non-command verification
types. **Command verification only.**
