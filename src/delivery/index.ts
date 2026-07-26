// Public surface of the delivery engine (Phase 6).
//
// The engine joins the read-only inspector to canonical project truth and proposes a delivery:
// what changed, which claims carry evidence right now, what is risky, and how the change could be
// split into commits.
//
// It proposes and never acts: no commit, no staging, no push, no pull request, and no execution of
// the verification commands it lists.

export { buildDeliverySummary } from "./summary.ts";
export type { BuildDeliverySummaryInput } from "./summary.ts";

export { renderCommitMessage, suggestCommits, SUBJECT_SOFT_LIMIT } from "./commit.ts";
export { renderCommitProposal, renderDeliverySummary } from "./render.ts";

export { COMMIT_READINESS } from "./types.ts";
export type { CommitReadiness, CommitSuggestion, DeliveryClaim, DeliverySummary } from "./types.ts";
