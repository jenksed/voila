// PublicationPlan persistence: atomic write of an immutable plan, bounded read/listing, and
// deterministic content-bound identifiers. No Git, no Pi.
//
// The on-disk layout is:
//   .voila/publications/plans/PUB-<digest-prefix>.json
//
// A plan file is a complete serialization of the runtime `PublicationPlan` object. Once written,
// the file is never modified; an invalidated plan remains on disk so callers can read the original
// payload and explain why it cannot run, without exposing it as authority.

import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile, rename } from "node:fs/promises";
import { join } from "node:path";
import { publicationPlanPath } from "../state/paths.ts";
import {
  PUBLICATION_PLAN_FORMAT_VERSION,
  PUBLICATION_POLICY_VERSION,
  PUBLICATION_PLAN_TTL_MS,
} from "./types.ts";
import type { PublicationPlan } from "./types.ts";

export interface CompilePlanInput {
  readonly payload: Omit<PublicationPlan, "id" | "formatVersion" | "payloadSha256">;
  readonly createdAt: string;
}

export interface CompilePlanResult {
  readonly plan: PublicationPlan;
}

/** Serialize a plan payload for hashing/writing without the `id`/`formatVersion`/`payloadSha256` fields. */
export function serializePlanPayload(payload: PublicationPlan["bindings"]): string {
  // Canonical JSON with sorted top-level keys; the runtime enforces the rest of the structure.
  return JSON.stringify(payload, Object.keys(payload).sort(), 0);
}

export function computePlanId(payload: PublicationPlan["bindings"]): string {
  const hash = createHash("sha256")
    .update(serializePlanPayload(payload))
    .digest("hex")
    .slice(0, 12);
  return `PUB-${hash}`;
}

/** Deterministic compile: derive plan id, expiry, and payload digest without touching disk. */
export function compilePlan(input: CompilePlanInput): CompilePlanResult {
  const expiresAt = new Date(Date.parse(input.createdAt) + PUBLICATION_PLAN_TTL_MS).toISOString();
  const basePayload = {
    ...input.payload,
    bindings: { ...input.payload.bindings, publicationPolicyVersion: PUBLICATION_POLICY_VERSION },
  };
  const id = computePlanId(basePayload.bindings);
  const payloadSha256 = createHash("sha256")
    .update(serializePlanPayload(basePayload.bindings))
    .digest("hex");
  const plan: PublicationPlan = {
    ...basePayload,
    id,
    formatVersion: PUBLICATION_PLAN_FORMAT_VERSION,
    payloadSha256,
    createdAt: input.createdAt,
    expiresAt,
  };
  return { plan };
}

export async function persistPlan(root: string, plan: PublicationPlan): Promise<string> {
  const path = publicationPlanPath(root, plan.id);
  await mkdir(join(root, ".voila", "publications", "plans"), { recursive: true });
  const serialized = JSON.stringify(plan, null, 2);
  const tmp = `${path}.tmp-${randomBytes(6).toString("hex")}`;
  await writeFile(tmp, serialized, "utf8");
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
  return path;
}

export async function loadPlan(root: string, planId: string): Promise<PublicationPlan | null> {
  try {
    const text = await readFile(publicationPlanPath(root, planId), "utf8");
    const parsed = JSON.parse(text) as PublicationPlan;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function listPlanIds(root: string): Promise<readonly string[]> {
  const dir = join(root, ".voila", "publications", "plans");
  try {
    const entries = await readdir(dir);
    return entries
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
