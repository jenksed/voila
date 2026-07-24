// Thin Pi adapter (ADR-0007). Pi-specific loading + composition only.
// No state persistence or domain logic lives here; it delegates to src/.

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerNewfang, type NewfangHost } from "../../src/extension/register.ts";

const EXPECTED_PI_VERSION = "0.82.0";
const MIN_NODE = "22.19.0";

/**
 * Resolve the installed Pi package version by walking up from this file (and cwd)
 * to find node_modules/@earendil-works/pi-coding-agent/package.json. This avoids
 * require.resolve, which is unreliable under Pi's jiti extension loader.
 */
function resolvePiVersion(): string {
  const starts: string[] = [];
  try {
    starts.push(dirname(fileURLToPath(import.meta.url)));
  } catch {
    // import.meta.url unavailable; fall back to cwd
  }
  starts.push(process.cwd());

  for (const start of starts) {
    let dir = start;
    for (let i = 0; i < 10; i++) {
      const pkg = join(dir, "node_modules", "@earendil-works", "pi-coding-agent", "package.json");
      if (existsSync(pkg)) {
        try {
          const parsed = JSON.parse(readFileSync(pkg, "utf8")) as { version?: string };
          if (parsed.version) return parsed.version;
        } catch {
          // unreadable; keep walking
        }
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return "unknown";
}

export default function newfangExtension(pi: ExtensionAPI): void {
  // The single Pi boundary: bridge the real ExtensionAPI to NewFang's structural host
  // interface. All logic lives in src/ and is tested without Pi.
  registerNewfang(pi as unknown as NewfangHost, {
    piVersion: resolvePiVersion(),
    expectedPiVersion: EXPECTED_PI_VERSION,
    nodeVersion: process.version,
    minNode: MIN_NODE,
  });
}
