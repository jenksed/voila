// Orientation artifact I/O: record a validated snapshot, make it current, and evaluate staleness
// against live repository facts. Canonical state stores only compact metadata.

import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { orientationPaths } from "./paths.ts";
import { loadState, updateState } from "./store.ts";
import { sha256 } from "./source.ts";
import { VoilaStateError } from "./errors.ts";
import { allocateId } from "../domain/ids.ts";
import { ProjectOperationError } from "../domain/errors.ts";
import type { OrientationArtifact, StalenessResult } from "../domain/orientation.ts";
import {
  evaluateStaleness,
  orientationStateFingerprint,
  ORIENTATION_FRESHNESS_POLICY,
  POLICY_INSTRUCTION_PATHS,
  renderOrientationView,
  validateOrientationArtifact,
} from "../domain/orientation.ts";
import type { OrientationRecord, ProjectState } from "../domain/types.ts";

export class OrientationNotFoundError extends VoilaStateError {
  constructor(id: string) {
    super(`Orientation not found: ${id}.`);
    this.name = "OrientationNotFoundError";
  }
}

async function atomicWrite(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, contents, "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** Resolve the current git HEAD, or undefined when git is unavailable. Never throws. */
export async function currentHead(root: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile("git", ["rev-parse", "HEAD"], { cwd: root }, (err, stdout) => {
      resolve(err ? undefined : stdout.toString().trim() || undefined);
    });
  });
}

export async function readOrientationArtifact(
  root: string,
  id: string,
): Promise<OrientationArtifact> {
  const paths = orientationPaths(root, id);
  if (!existsSync(paths.orientation)) throw new OrientationNotFoundError(id);
  return JSON.parse(await readFile(paths.orientation, "utf8")) as OrientationArtifact;
}

export interface InspectedInstructionState {
  /** sha-256 of each inspected instruction file that is still readable. */
  hashes: Record<string, string>;
  /** Inspected instruction files that could not be read — the orientation described something gone. */
  missing: string[];
}

/** Re-read the instruction files an orientation inspected, for content-based staleness. */
export async function inspectedInstructionState(
  root: string,
  artifact: OrientationArtifact,
): Promise<InspectedInstructionState> {
  const hashes: Record<string, string> = {};
  const missing: string[] = [];
  for (const f of artifact.instructionFiles) {
    try {
      hashes[f.path] = sha256(await readFile(join(root, f.path), "utf8"));
    } catch {
      missing.push(f.path);
    }
  }
  return { hashes, missing };
}

/** Which policy-declared instruction files the repository actually has right now. */
export function presentPolicyInstructionPaths(root: string): string[] {
  return POLICY_INSTRUCTION_PATHS.filter((path) => existsSync(join(root, path)));
}

export interface RecordOrientationResult {
  record: OrientationRecord;
  artifact: OrientationArtifact;
}

/** Validate and store an orientation snapshot, then make it current. */
export async function recordOrientation(
  root: string,
  rawArtifact: unknown,
): Promise<RecordOrientationResult> {
  const validated = validateOrientationArtifact(rawArtifact);
  const state = await loadState(root);
  // Freshness provenance is recorded from observed facts, never self-reported by the caller.
  const artifact: OrientationArtifact = {
    ...validated,
    freshnessPolicyVersion: ORIENTATION_FRESHNESS_POLICY,
    stateFingerprint: orientationStateFingerprint(state),
  };
  const { id } = allocateId(state.sequences, "orientation");
  const paths = orientationPaths(root, id);
  const now = new Date().toISOString();

  await mkdir(paths.dir, { recursive: true });
  await atomicWrite(paths.orientation, `${JSON.stringify(artifact, null, 2)}\n`);
  await atomicWrite(paths.view, renderOrientationView(id, artifact));

  const nextState = await updateState(
    root,
    (cur) => {
      const alloc = allocateId(cur.sequences, "orientation");
      const record: OrientationRecord = {
        id: alloc.id,
        artifactRef: `orientations/${alloc.id}/orientation.json`,
        ...(artifact.head ? { repositoryHead: artifact.head } : {}),
        status: "current" as const,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...cur,
        sequences: alloc.sequences,
        // Previous orientations become stale once a newer one is current.
        orientations: [
          ...cur.orientations.map((o) =>
            o.status === "current" ? { ...o, status: "stale" as const, updatedAt: now } : o,
          ),
          record,
        ],
        currentOrientationId: alloc.id,
      };
    },
    { type: "orientation_recorded", id, head: artifact.head },
  );

  const record = nextState.orientations.find((o) => o.id === id);
  if (!record) throw new ProjectOperationError(`Orientation ${id} was not recorded.`);
  return { record, artifact };
}

export interface OrientationStatusResult {
  record: OrientationRecord | null;
  artifact: OrientationArtifact | null;
  staleness: StalenessResult;
}

/**
 * Report the current orientation and whether it is stale against live repository facts.
 * Read-only: it never rewrites canonical state (in particular, a dirty worktree changes nothing).
 */
export async function currentOrientationStatus(
  root: string,
  state: ProjectState,
  opts: { refreshRequested?: boolean } = {},
): Promise<OrientationStatusResult> {
  const id = state.currentOrientationId;
  if (!id) {
    return {
      record: null,
      artifact: null,
      staleness: { stale: false, reasons: ["no orientation recorded"] },
    };
  }
  const record = state.orientations.find((o) => o.id === id) ?? null;
  if (!record) {
    return {
      record: null,
      artifact: null,
      staleness: { stale: false, reasons: ["orientation reference is invalid"] },
    };
  }
  let artifact: OrientationArtifact | null = null;
  try {
    artifact = await readOrientationArtifact(root, id);
  } catch {
    return {
      record,
      artifact: null,
      staleness: { stale: true, reasons: ["orientation artifact missing"] },
    };
  }
  // HEAD is read for provenance only: under the content-based policy it is never a staleness reason.
  const head = await currentHead(root);
  const instructions = await inspectedInstructionState(root, artifact);
  const staleness = evaluateStaleness(artifact, {
    ...(head ? { head } : {}),
    instructionHashes: instructions.hashes,
    missingInstructionPaths: instructions.missing,
    presentPolicyPaths: presentPolicyInstructionPaths(root),
    stateFingerprint: orientationStateFingerprint(state),
    ...(opts.refreshRequested ? { refreshRequested: true } : {}),
  });
  return { record, artifact, staleness };
}

/** Persist a `stale` marker for the current orientation (explicit, never automatic on startup). */
export async function markOrientationStale(root: string, id: string): Promise<void> {
  await updateState(
    root,
    (cur) => ({
      ...cur,
      orientations: cur.orientations.map((o) =>
        o.id === id ? { ...o, status: "stale" as const, updatedAt: new Date().toISOString() } : o,
      ),
    }),
    { type: "orientation_marked_stale", id },
  );
}
