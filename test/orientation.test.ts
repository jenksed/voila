import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initState, loadState } from "../src/state/store.ts";
import {
  currentHead,
  currentOrientationStatus,
  readOrientationArtifact,
  recordOrientation,
} from "../src/state/orientation-store.ts";
import { orientationPaths } from "../src/state/paths.ts";
import {
  evaluateStaleness,
  renderOrientationView,
  validateOrientationArtifact,
} from "../src/domain/orientation.ts";
import { ProjectOperationError } from "../src/domain/errors.ts";

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

const AGENTS = "# Agents\n\nRules here.\n";

async function repo(withGit = true): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "newfang-ori-"));
  await initState(root, { displayName: "ori-demo" });
  await writeFile(join(root, "AGENTS.md"), AGENTS, "utf8");
  if (withGit) {
    execFileSync("git", ["init", "-q"], { cwd: root });
    execFileSync(
      "git",
      ["-c", "user.email=t@t", "-c", "user.name=T", "commit", "-q", "--allow-empty", "-m", "init"],
      {
        cwd: root,
      },
    );
  }
  return root;
}

function artifact(over: Record<string, unknown> = {}) {
  return {
    purpose: "A demo repository for orientation tests.",
    instructionFiles: [{ path: "AGENTS.md", sha256: sha(AGENTS), note: "rules" }],
    keyDocuments: ["README.md"],
    implementationAreas: ["src"],
    verifiedCommands: [
      { purpose: "tests", command: "npm test", evidence: "declared in package.json scripts" },
    ],
    candidateCommands: ["npm run build"],
    relevantWork: ["NF-1"],
    risks: ["churn"],
    unknowns: ["CI unproven"],
    provenance: ["read AGENTS.md"],
    ...over,
  };
}

test("a validated artifact is stored and made current", async () => {
  const root = await repo();
  const head = await currentHead(root);
  const result = await recordOrientation(root, artifact({ head, branch: "main", dirty: false }));
  assert.equal(result.record.id, "ORI-1");
  assert.equal(result.record.status, "current");
  assert.equal(result.record.repositoryHead, head);

  const state = await loadState(root);
  assert.equal(state.currentOrientationId, "ORI-1");
  assert.equal(state.sequences.orientation, 2);

  const paths = orientationPaths(root, "ORI-1");
  assert.match(await readFile(paths.view, "utf8"), /Repository Orientation — ORI-1/);
  const stored = await readOrientationArtifact(root, "ORI-1");
  assert.equal(stored.purpose, "A demo repository for orientation tests.");
});

test("absolute paths, home paths, and secret-looking content are rejected", () => {
  assert.throws(
    () => validateOrientationArtifact(artifact({ keyDocuments: ["/etc/hosts"] })),
    ProjectOperationError,
  );
  assert.throws(
    () => validateOrientationArtifact(artifact({ implementationAreas: ["~/private"] })),
    ProjectOperationError,
  );
  assert.throws(
    () =>
      validateOrientationArtifact(
        artifact({ instructionFiles: [{ path: "/abs/AGENTS.md", sha256: sha(AGENTS) }] }),
      ),
    ProjectOperationError,
  );
  assert.throws(
    () => validateOrientationArtifact(artifact({ risks: ["api_key=sk-abc123"] })),
    ProjectOperationError,
  );
  assert.throws(
    () =>
      validateOrientationArtifact(
        artifact({
          verifiedCommands: [{ purpose: "x", command: "export TOKEN=abc", evidence: "y" }],
        }),
      ),
    ProjectOperationError,
  );
});

test("instruction files require a real sha-256 digest", () => {
  assert.throws(
    () =>
      validateOrientationArtifact(
        artifact({ instructionFiles: [{ path: "AGENTS.md", sha256: "nope" }] }),
      ),
    ProjectOperationError,
  );
});

test("HEAD movement makes an orientation stale", () => {
  const a = validateOrientationArtifact(artifact({ head: "a".repeat(40) }));
  const same = evaluateStaleness(a, { head: "a".repeat(40) });
  assert.equal(same.stale, false);
  const moved = evaluateStaleness(a, { head: "b".repeat(40) });
  assert.equal(moved.stale, true);
  assert.match(moved.reasons.join(" "), /HEAD moved/);
});

test("instruction-file change makes an orientation stale", () => {
  const a = validateOrientationArtifact(artifact());
  const unchanged = evaluateStaleness(a, { instructionHashes: { "AGENTS.md": sha(AGENTS) } });
  assert.equal(unchanged.stale, false);
  const changed = evaluateStaleness(a, {
    instructionHashes: { "AGENTS.md": sha("# Different\n") },
  });
  assert.equal(changed.stale, true);
  assert.match(changed.reasons.join(" "), /AGENTS\.md changed/);
});

test("a dirty worktree alone does not make an orientation stale", () => {
  const a = validateOrientationArtifact(artifact({ head: "a".repeat(40), dirty: false }));
  // Same head and instructions, but the repo is now dirty: not stale.
  const result = evaluateStaleness(a, {
    head: "a".repeat(40),
    instructionHashes: { "AGENTS.md": sha(AGENTS) },
  });
  assert.equal(result.stale, false);
});

test("an explicit refresh request marks it stale", () => {
  const a = validateOrientationArtifact(artifact());
  assert.equal(evaluateStaleness(a, { refreshRequested: true }).stale, true);
});

test("live staleness detection reports a changed instruction file", async () => {
  const root = await repo();
  const head = await currentHead(root);
  await recordOrientation(root, artifact({ head }));
  let state = await loadState(root);
  const fresh = await currentOrientationStatus(root, state);
  assert.equal(fresh.staleness.stale, false);

  await writeFile(join(root, "AGENTS.md"), "# Agents\n\nDifferent rules.\n", "utf8");
  state = await loadState(root);
  const stale = await currentOrientationStatus(root, state);
  assert.equal(stale.staleness.stale, true);
  assert.match(stale.staleness.reasons.join(" "), /AGENTS\.md changed/);
});

test("git failure degrades gracefully (no git repository)", async () => {
  const root = await repo(false);
  assert.equal(await currentHead(root), undefined, "no throw without git");
  const result = await recordOrientation(root, artifact());
  assert.equal(result.record.repositoryHead, undefined);
  const state = await loadState(root);
  const status = await currentOrientationStatus(root, state);
  assert.equal(status.staleness.stale, false, "no head means no head-based staleness");
});

test("recording a newer orientation marks the previous one stale", async () => {
  const root = await repo();
  await recordOrientation(root, artifact());
  await recordOrientation(root, artifact({ purpose: "Second snapshot." }));
  const state = await loadState(root);
  assert.equal(state.currentOrientationId, "ORI-2");
  assert.equal(state.orientations.find((o) => o.id === "ORI-1")?.status, "stale");
  assert.equal(state.orientations.find((o) => o.id === "ORI-2")?.status, "current");
});

test("the rendered view is deterministic and free of absolute paths", () => {
  const a = validateOrientationArtifact(artifact({ observedAt: "2026-07-25T00:00:00.000Z" }));
  const first = renderOrientationView("ORI-1", a);
  const second = renderOrientationView("ORI-1", a);
  assert.equal(first, second, "deterministic");
  assert.ok(!/\/Users\//.test(first) && !/\/home\//.test(first), "no absolute private paths");
  assert.match(first, /GENERATED by NewFang/);
});

test("orientation state survives reload", async () => {
  const root = await repo();
  await recordOrientation(root, artifact({ head: await currentHead(root) }));
  const first = await loadState(root);
  const second = await loadState(root);
  assert.deepEqual(second.orientations, first.orientations);
  assert.equal(second.currentOrientationId, "ORI-1");
});
