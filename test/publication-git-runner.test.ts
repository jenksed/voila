import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TRANSACTION_LIMITS,
  runTransactionCommand,
  TransactionGitError,
  TRANSACTION_GIT_SUBCOMMANDS,
} from "../src/publication/git-runner.ts";

/**
 * Test-only entry that intentionally bypasses the closed-runner type narrowing so an assertion
 * can exercise the runtime guard against a literal off-allowlist subcommand.
 */
async function runUnsafe(args: readonly string[]): Promise<unknown> {
  return runTransactionCommand({
    args: args as unknown as readonly string[],
    cwd: "/tmp",
  });
}

test("the closed subcommand allowlist is deterministic and closed", () => {
  assert.ok(TRANSACTION_GIT_SUBCOMMANDS.length > 0);
  assert.ok(TRANSACTION_GIT_SUBCOMMANDS.includes("commit-tree"));
  assert.ok(!TRANSACTION_GIT_SUBCOMMANDS.includes("push"));
  assert.ok(!TRANSACTION_GIT_SUBCOMMANDS.includes("fetch"));
  assert.ok(!TRANSACTION_GIT_SUBCOMMANDS.includes("checkout"));
  assert.ok(!TRANSACTION_GIT_SUBCOMMANDS.includes("reset"));
});

test("the runner refuses unknown subcommands before invoking Git", async () => {
  await assert.rejects(() => runUnsafe(["push", "origin", "feat/x"]), TransactionGitError);
});

test("the runner refuses redirect flags that could leak the transaction", async () => {
  await assert.rejects(
    () => runUnsafe(["commit-tree", "-c", "core.editor=cat"]),
    TransactionGitError,
  );
});

test("the runner refuses prohibited history-rewrite flags", async () => {
  await assert.rejects(() => runUnsafe(["commit-tree", "--amend"]), TransactionGitError);
  await assert.rejects(() => runUnsafe(["commit-tree", "--no-verify"]), TransactionGitError);
  await assert.rejects(() => runUnsafe(["commit-tree", "--force"]), TransactionGitError);
});

test("the runner surfaces an empty arg vector as a refused transaction", async () => {
  await assert.rejects(() => runUnsafe([]), TransactionGitError);
});

test("the default limits bound time and output", () => {
  assert.ok(DEFAULT_TRANSACTION_LIMITS.perCommandTimeoutMs > 0);
  assert.ok(
    DEFAULT_TRANSACTION_LIMITS.transactionTimeoutMs >=
      DEFAULT_TRANSACTION_LIMITS.perCommandTimeoutMs,
  );
  assert.ok(DEFAULT_TRANSACTION_LIMITS.hookTimeoutMs > 0);
  assert.ok(DEFAULT_TRANSACTION_LIMITS.maxBuffer > 0);
});
