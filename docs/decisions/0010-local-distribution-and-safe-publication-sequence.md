# ADR-0010 — Insert local distribution and safe publication before delegation

- **Status:** accepted
- **Date:** 2026-07-27
- **Decider:** Joshua Jenks (owner direction)
- **Canonical records:** DEC-24 through DEC-32
- **Source:** [Voila Operational Roadmap v2](../plans/VOILA_OPERATIONAL_ROADMAP_V2.md), preserved and reviewed as INT-10 revision 2
- **Supersedes only:** DEC-13's package-sequencing clause; DEC-18 / ADR-0009's affected roadmap sequencing and pre-R7 publication restrictions
- **Does not supersede:** DEC-13's extension-first architecture rationale; DEC-18's Project Steward doctrine, No Managing the Manager gate, retained proof/delivery foundation, completed R1/R2 history, or R3–R7 program

## Context

R1 and R2 now provide ambient continuation and two bounded supervised operations, but Voila is still
loaded project by project and stops at Git instructions. The developer must copy the extension and
skill into each repository, then manually stage, commit, push, and create the pull request. That
prevents Voila from being broadly useful locally and leaves routine delivery coordination with the
developer.

The owner-authored v2 roadmap adds value without abandoning the accepted operational loop. It inserts
local package availability and deterministic Git delivery boundaries before worker delegation, then
uses those capabilities later as the parent Steward's integration path.

## Decision

1. Insert these priority capabilities before R3:
   - **L0:** Local Pi Extension Release;
   - **G0:** Safe Local Commit;
   - **G1:** Safe GitHub Publication, including a bounded publisher proposal role.
2. Deliver **L0.1 first** as one globally installed local-path Pi package with an explicit manifest,
   one canonical extension/skill entry point, per-project state and runtime isolation, deliberate
   initialization, visible compatibility/source, and multi-project dogfood.
3. Preserve the current read-only Delivery Engine. DEC-30 proposes a later narrow G0 supersession of
   only the no-local-commit clause after its guarded executor and acceptance gate pass.
4. DEC-31 proposes G1's explicit single-use publication authority. Push and pull-request effects stay
   unauthorized until G1's deterministic executor and acceptance gate pass.
5. Use OpenRouter `cohere/north-mini-code:free` as G1's bounded text-only publisher proposal model,
   with validated deterministic fallback and no effect authority.
6. Preserve the R3–R7 program but refine it into R3-0/R3A/R3B/R3C and R4A/R4B/R4C before R5–R7.
7. L0.2 may build one guarded exception for `v0.1.0-alpha.1`. Actual annotated-tag creation and
   exact-ref push require a separate, explicit, single-use owner authorization bound to the exact
   repository, tag, target SHA, default branch, remote, package version, and current release plan.
   Roadmap acceptance grants no tag effect authority.

## Current authority remains unchanged

This decision authorizes roadmap and implementation work. Until each later packet is implemented,
accepted, and reflected in the active instructions and tool surface, the present Steward does not:

- stage or commit;
- push;
- create or mutate pull requests;
- approve or merge;
- create or push tags; or
- publish releases or packages.

Voila also never merges the implementation PR required before the L0.2 tag transaction.

## Consequences

- NF-22 is the immediate focus; NF-23 through NF-27 record the inserted capability packets.
- The globally installed package must replace, not accompany, project-local auto-discovery in the
  development repository. Runtime duplicate registration remains defense in depth.
- Local package installation is an explicit out-of-repository machine effect and must be listed
  separately from repository changes and acceptance claims.
- G0 commits are local and reversible but exact-path guarded. They do not imply remote authority.
- G1 authority is one publication transaction, not permanent approval.
- General tag creation, releases, signing, registry publication, approval, merge, force push,
  default-branch commits, automatic commits/pushes, and release automation remain deferred.

## Evidence required by the sequence

- L0.1: manifest/package tests, six-context isolation matrix, actual global local-path installation,
  and development-repository dogfood.
- G0: current plan invalidation, clean-index/exact-path transaction, hook behavior, commit-tree
  verification, and unrelated-change preservation.
- G1: exact branch/remote/base authority, fast-forward-only push, draft-first idempotent PR handling,
  ready-for-review verification, and no approval/merge authority.
- L0.2: all accepted prerequisites, exact owner-authorized SHA, clean/current proof and target CI,
  absent local/remote tag, exact-ref-only push, verified remote target, and pinned-install acceptance.
