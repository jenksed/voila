# R2B — Superseded planning draft

This pre-acceptance draft is superseded by the owner-accepted
[`R2B_BACKGROUND_OPERATION_VISIBILITY.md`](R2B_BACKGROUND_OPERATION_VISIBILITY.md) and DEC-23.

Do not implement from this file. The accepted packet controls where the drafts differed, including:

- operation ID `r2b.repository-checks` (not `repository-verify`);
- model input `operationId` only with focus-derived ownership;
- no list, wait, poll, follow, or tail tool;
- no elapsed counter in the ambient widget;
- runtime-ownership/liveness-backed presentation and `requires_reconciliation` truth;
- four mandatory acceptance tiers.
