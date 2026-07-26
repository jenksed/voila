# ADR-0008 — Content-addressed fingerprint v2

- **Status:** accepted
- **Date:** 2026-07-26
- **Supersedes:** the v1 (diff-based) digest in `src/state/fingerprint.ts` prior to this ADR

## Context

The v1 fingerprint combined four inputs into a SHA-256 digest:

1. `gitHead` (commit identity),
2. `git diff` of the tracked working tree against HEAD,
3. `git diff --cached` (the staged index),
4. `git ls-files --others --exclude-standard` content hashes for untracked, non-ignored files.

Two consequences fall out of that design:

- **Commits invalidate evidence.** A clean commit that changes no effective working-tree content moves `gitHead`, which moves the digest. Receipts recorded before the commit are immediately stale, including the receipt that lives in that very commit. The product cannot land evidence-backed code at a branch tip.
- **Staging state leaks in.** `git diff --cached` makes `git add` change the digest even when the working tree content is identical. The fingerprint is therefore sensitive to the index, not the tree.

DEC-12 documents the second defect in passing; the HANDOFF §5B documents the first. Owner direction on 2026-07-26: ship a content-addressed fingerprint.

## Decision

Replace the digest input with a deterministic representation of the **effective working tree**:

- every tracked file currently present in the working tree, plus every untracked, non-ignored file;
- `.voila/` and the legacy `.newfang/` state directories excluded, exactly as before;
- paths sorted, repository-relative, never absolute;
- each entry carries a normalized mode (`regular` | `executable` | `symlink`) and a SHA-256 of either the regular-file content or the symlink target;
- the digest input is the literal string `fingerprint-v2\n` followed by one line per entry: `<path>\t<mode>\t<hash>\n`;
- no timestamps, no absolute paths, no staging state, no branch name, no commit identity in the digest.

`gitHead` is retained on `RepositoryFingerprint` and in receipt manifests as **non-authoritative diagnostic metadata** — present for human inspection, never used in the digest, never required for equality.

The algorithm is named `v2` and that name is recorded on every receipt manifest written from this point on. v1 receipts carry no algorithm field; the proof engine recognizes them as v1 by absence. Because the digest input differs in shape and prefix, a v1 hex value cannot equal a v2 hex value without a SHA-256 collision, so receipts are compared within algorithm by default.

## Consequences

### Receipts

- **Migration**: every existing v1 receipt becomes stale once, on the first run that records a v2 receipt. v1 receipts are not rewritten. Re-running `voila_run_verification` once after this change produces a fresh, current v2 receipt per claim. Owner direction explicitly accepted this one-time cost.
- **Future compatibility**: new receipt manifests include `fingerprintAlgorithm: "v2"`. If the digest ever needs to change again, a `v3` constant is added; v2 receipts remain evaluable by their own algorithm.

### Tools and surfaces

- `repositoryFingerprint(root)` returns `RepositoryFingerprint` with a new `algorithm` field; the `.value` remains a 64-character hex digest so every existing call site that compares hex strings keeps working.
- `tryRepositoryFingerprint(root)` is unchanged in signature; it returns the same `.value`.
- `receipt-store.ts` writes `fingerprintAlgorithm` on every new manifest and records it on the canonical `VerificationReceiptRecord`.

### What does NOT change

- The proof engine in `src/domain/proof.ts` continues to compare `receipt.repositoryFingerprint === currentFingerprint`. With v1 receipts and v2 current, that comparison fails for every v1 receipt — exactly the one-time staleness we accepted.
- The exclusion of `.voila/` and `.newfang/` is preserved. Recording a receipt still does not invalidate itself.
- `runDoctor`, the Steward Console, the ambient widget, and `/voila status` all read the same `tryRepositoryFingerprint`; their surface text remains compatible.