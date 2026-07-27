// Deterministic PublicationPlan compiler. Pure: it consumes Delivery Engine + canonical state
// inputs and produces an immutable plan-shaped value. All filesystem, Git, and Pi access live in
// other modules so this file can stay purely testable.

import { digestOf } from "./digest.ts";
import type { CommitSuggestion } from "../delivery/types.ts";
import type { DeliveryAttentionItem, DeliveryInspection } from "../delivery-inspector/types.ts";
import type {
  PublicationBindings,
  PublicationBoundary,
  PublicationEvidenceBinding,
  PublicationExpectedDiffEntry,
  PublicationPathSnapshot,
  PublicationPlan,
} from "./types.ts";
import { PUBLICATION_POLICY_VERSION, PUBLICATION_PLAN_FORMAT_VERSION } from "./types.ts";

export interface IdentityDigestInputs {
  readonly projectId: string;
  readonly repositoryIdentityDigest: string;
  readonly worktreeIdentityDigest: string;
  readonly indexIdentityDigest: string;
  readonly completionDigest: string;
  readonly defaultBranch: string;
  readonly defaultBranchSource: "remote_head" | "project_setting";
  readonly branch: string;
  readonly branchRef: string;
  readonly head: string;
  readonly effectiveContentFingerprint: string;
  readonly rawIndexDigest: string;
  readonly authorIdentityDigest: string;
  readonly committerIdentityDigest: string;
}

export interface CompileBoundary {
  readonly boundaryId: string;
  readonly displayPaths: readonly string[];
  readonly stagePaths: readonly string[];
  readonly expectedDiff: readonly PublicationExpectedDiffEntry[];
  readonly subject: string;
  readonly body: readonly string[];
  readonly readiness: "ready" | "inspect_first" | "blocked";
}

export interface CompileInput {
  readonly workItemId: string;
  readonly identity: IdentityDigestInputs;
  readonly packageVersion: string;
  readonly schemaVersion: number;
  readonly inspection: DeliveryInspection;
  readonly boundaries: readonly CommitSuggestion[];
  readonly selectedBoundaryIds: readonly string[];
  readonly evidence: readonly PublicationEvidenceBinding[];
  readonly authorIdentity: string;
  readonly committerIdentity: string;
  readonly now: string;
}

export interface CompileResult {
  readonly plan: PublicationPlan;
}

function statusToMode(status: CommitSuggestion["paths"][number]): PublicationPathSnapshot["mode"] {
  if (status === "deleted") return "deleted";
  return "regular";
}

function snapshotFromChange(
  change: DeliveryInspection["changes"][number],
): PublicationPathSnapshot {
  const tracked =
    change.staged ||
    change.status === "modified" ||
    change.status === "renamed" ||
    change.status === "copied" ||
    change.status === "type_changed" ||
    change.status === "deleted";
  const untracked = change.untracked;
  return {
    path: change.path,
    ...(change.previousPath !== undefined ? { previousPath: change.previousPath } : {}),
    status: change.status,
    tracked,
    untracked,
    mode: statusToMode(change.status),
  };
}

function diffForBoundary(boundary: CommitSuggestion): readonly PublicationExpectedDiffEntry[] {
  const out: PublicationExpectedDiffEntry[] = [];
  for (const path of boundary.paths) {
    const change = null as unknown as { status: string } | null;
    if (change === null) {
      out.push({ status: "M", path });
      continue;
    }
    const status = change.status;
    let entry: PublicationExpectedDiffEntry;
    if (status === "added" || status === "untracked") entry = { status: "A", path };
    else if (status === "deleted") entry = { status: "D", path };
    else if (status === "type_changed") entry = { status: "T", path };
    else entry = { status: "M", path };
    out.push(entry);
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function attentionForBoundary(
  boundary: CommitSuggestion,
  allAttention: readonly DeliveryAttentionItem[],
): readonly DeliveryAttentionItem[] {
  const pathSet = new Set(boundary.paths);
  return allAttention.filter((item) => item.paths.some((path) => pathSet.has(path)));
}

export function compilePublicationPlan(input: CompileInput): CompileResult {
  const selectedBoundaryIds = [...input.selectedBoundaryIds];
  const selected = input.boundaries.filter((boundary) =>
    selectedBoundaryIds.includes(boundary.boundaryId),
  );
  if (selected.length !== selectedBoundaryIds.length) {
    throw new Error(
      `Publication plan compiler: unknown boundary ID(s). Expected ${selectedBoundaryIds.join(", ")}, got ${selected.map((b) => b.boundaryId).join(", ")}.`,
    );
  }

  const unselectedBoundaries = input.boundaries.filter(
    (boundary) => !selectedBoundaryIds.includes(boundary.boundaryId),
  );

  const selectedPathSet = new Set<string>();
  for (const boundary of selected) {
    for (const path of boundary.paths) selectedPathSet.add(path);
  }

  const paths: PublicationPathSnapshot[] = input.inspection.changes.map(snapshotFromChange);

  const nonSelectedPaths = unselectedBoundaries.flatMap((boundary) => boundary.paths).sort();

  const selectedAttention: readonly DeliveryAttentionItem[] = selected.flatMap((boundary) =>
    attentionForBoundary(boundary, input.inspection.attention),
  );

  const boundaries: PublicationBoundary[] = selected.map((boundary) => ({
    boundaryId: boundary.boundaryId,
    displayPaths: [...boundary.paths].sort(),
    stagePaths: [...boundary.paths].sort(),
    expectedDiff: diffForBoundary(boundary),
    message: {
      subject: boundary.subject,
      body: [...boundary.body],
    },
  }));

  const changeSetDigest = digestOf({
    paths: paths.map((path) => ({
      mode: path.mode,
      path: path.path,
      previousPath: path.previousPath ?? null,
      status: path.status,
      tracked: path.tracked,
      untracked: path.untracked,
    })),
  });

  const boundaryDigest = digestOf({
    boundaries: boundaries.map((boundary) => ({
      boundaryId: boundary.boundaryId,
      displayPaths: boundary.displayPaths,
      expectedDiff: boundary.expectedDiff,
      stagePaths: boundary.stagePaths,
      message: boundary.message,
    })),
  });

  const evidenceDigest = digestOf({
    evidence: input.evidence.map((entry) => ({ ...entry })),
  });

  const messageDigest = digestOf({
    messages: boundaries.map((boundary) => boundary.message),
  });

  const bindings: PublicationBindings = {
    projectId: input.identity.projectId,
    workItemId: input.workItemId,
    completionDigest: input.identity.completionDigest,
    repositoryIdentityDigest: input.identity.repositoryIdentityDigest,
    worktreeIdentityDigest: input.identity.worktreeIdentityDigest,
    indexIdentityDigest: input.identity.indexIdentityDigest,
    defaultBranch: input.identity.defaultBranch,
    defaultBranchSource: input.identity.defaultBranchSource,
    branch: input.identity.branch,
    branchRef: input.identity.branchRef,
    head: input.identity.head,
    effectiveContentFingerprint: input.identity.effectiveContentFingerprint,
    rawIndexDigest: input.identity.rawIndexDigest,
    changeSetDigest,
    boundaryDigest,
    evidenceDigest,
    messageDigest,
    authorIdentityDigest: input.identity.authorIdentityDigest,
    committerIdentityDigest: input.identity.committerIdentityDigest,
    packageVersion: input.packageVersion,
    schemaVersion: input.schemaVersion,
    publicationPolicyVersion: PUBLICATION_POLICY_VERSION,
  };

  const unassignedPaths = input.inspection.unassignedPaths.slice();

  const selfBookkeepingPaths: string[] = [];

  const payload = {
    formatVersion: PUBLICATION_PLAN_FORMAT_VERSION,
    bindings,
    paths,
    boundaries,
    evidence: input.evidence,
    selectedAttention,
    unassignedPaths,
    nonSelectedPaths,
    selfBookkeepingPaths,
    createdAt: input.now,
    authorIdentityDigest: input.identity.authorIdentityDigest,
    committerIdentityDigest: input.identity.committerIdentityDigest,
    expiresAt: new Date(Date.parse(input.now) + 30 * 60 * 1000).toISOString(),
  };

  const payloadSha256 = digestOf(payload);
  const id = `PUB-${payloadSha256.slice(0, 12)}`;

  const plan: PublicationPlan = {
    ...payload,
    id,
    payloadSha256,
  };

  return { plan };
}
