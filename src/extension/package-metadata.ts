// Immutable package/runtime identity for the L0.1 Pi package boundary.

import { POLICY_VERSION, SCHEMA_VERSION } from "../domain/types.ts";

export const VOILA_PACKAGE_NAME = "voila";
export const VOILA_PACKAGE_VERSION = "0.1.0-alpha.1";
export const SUPPORTED_PI_VERSION = "0.82.0";
export const MIN_NODE_VERSION = "22.19.0";
export const MAX_NODE_MAJOR_EXCLUSIVE = 23;

export interface RuntimeCompatibility {
  supported: boolean;
  piSupported: boolean;
  nodeSupported: boolean;
  installedPiVersion: string;
  installedNodeVersion: string;
  reasons: string[];
}

export interface PackageProvenance {
  /** What this entry point can establish without exposing a private filesystem path. */
  entrypoint: "pi-package-entrypoint";
  /** Pi's package manager owns source/scope/origin; the extension API does not expose them. */
  hostMetadata: "verify-with-pi-package-manager";
}

export interface RuntimeDescriptor {
  packageName: string;
  packageVersion: string;
  supportedPiVersion: string;
  supportedNodeRange: string;
  schemaVersion: number;
  operationPolicyVersion: number;
  provenance: PackageProvenance;
}

export const RUNTIME_DESCRIPTOR: Readonly<RuntimeDescriptor> = Object.freeze({
  packageName: VOILA_PACKAGE_NAME,
  packageVersion: VOILA_PACKAGE_VERSION,
  supportedPiVersion: SUPPORTED_PI_VERSION,
  supportedNodeRange: `>=${MIN_NODE_VERSION} <${MAX_NODE_MAJOR_EXCLUSIVE}`,
  schemaVersion: SCHEMA_VERSION,
  operationPolicyVersion: POLICY_VERSION,
  provenance: Object.freeze({
    entrypoint: "pi-package-entrypoint" as const,
    hostMetadata: "verify-with-pi-package-manager" as const,
  }),
});

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compare(a: [number, number, number], b: [number, number, number]): number {
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function assessRuntimeCompatibility(input: {
  piVersion: string;
  nodeVersion: string;
}): RuntimeCompatibility {
  const piSupported = input.piVersion === SUPPORTED_PI_VERSION;
  const parsedNode = parseVersion(input.nodeVersion);
  const minimumNode = parseVersion(MIN_NODE_VERSION)!;
  const nodeSupported =
    parsedNode !== null &&
    parsedNode[0] < MAX_NODE_MAJOR_EXCLUSIVE &&
    compare(parsedNode, minimumNode) >= 0;
  const reasons: string[] = [];
  if (!piSupported) {
    reasons.push(
      input.piVersion === "unknown"
        ? `Pi version is unreadable; exactly ${SUPPORTED_PI_VERSION} is required`
        : `Pi ${input.piVersion} is unsupported; exactly ${SUPPORTED_PI_VERSION} is required`,
    );
  }
  if (!nodeSupported) {
    reasons.push(
      `Node ${input.nodeVersion || "unknown"} is unsupported; required ${RUNTIME_DESCRIPTOR.supportedNodeRange}`,
    );
  }
  return {
    supported: piSupported && nodeSupported,
    piSupported,
    nodeSupported,
    installedPiVersion: input.piVersion,
    installedNodeVersion: input.nodeVersion,
    reasons,
  };
}

export function runtimeDescriptorLines(compatibility: RuntimeCompatibility): string[] {
  return [
    `Voila package: ${RUNTIME_DESCRIPTOR.packageVersion}`,
    `Pi installed: ${compatibility.installedPiVersion}`,
    `Pi support: exactly ${RUNTIME_DESCRIPTOR.supportedPiVersion}`,
    `Node installed: ${compatibility.installedNodeVersion}`,
    `Node support: ${RUNTIME_DESCRIPTOR.supportedNodeRange}`,
    `Canonical schema: ${RUNTIME_DESCRIPTOR.schemaVersion}`,
    `Operation policy: ${RUNTIME_DESCRIPTOR.operationPolicyVersion}`,
    `Entrypoint: ${RUNTIME_DESCRIPTOR.provenance.entrypoint}`,
    "Package source metadata: verify through Pi package resolution (the extension API does not expose scope/origin)",
    `Compatibility: ${compatibility.supported ? "supported" : "REFUSED"}`,
    ...compatibility.reasons.map((reason) => `Reason: ${reason}`),
  ];
}
