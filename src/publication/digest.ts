// Pure digests used by PublicationPlan bindings. Stable across runs and architectures.

import { createHash } from "node:crypto";

export interface DigestInput {
  readonly [key: string]: unknown;
}

function canonicalize(value: DigestInput): string {
  // Sort top-level keys so a structurally identical input always hashes the same way.
  const keys = Object.keys(value).sort();
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = value[key];
  return JSON.stringify(ordered, (_k, v) => v);
}

export function digestOf(value: DigestInput): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
