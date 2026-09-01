/**
 * Tests 4 and 6 of docs/plan-async-delegation.md, plus the handle lifecycle.
 *
 * The point of the feature: agy_start hands back a handle at once so the caller
 * keeps working, and agy_await later settles with the job. If start blocks, the
 * feature does not exist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/agy/server.mjs");
const bin = () => mkdtempSync(join(tmpdir(), "crew-bin-"));

function fakeAgy(dir, delayMs) {
  const path = join(dir, "fake-agy");
  writeFileSync(path, `#!/usr/bin/env bash
prompt="$*"
file=$(printf '%s' "$prompt" | grep -o 'TOUCH=[a-z.]*' | head -1 | cut -d= -f2)
ws=""; prev=""
for a in "$@"; do [ "$prev" = "--add-dir" ] && ws="$a"; prev="$a"; done
sleep ${delayMs / 1000}
[ -n "$file" ] && printf 'changed\\n' > "$ws/$file"
echo '{"conversation_id":"fake","status":"SUCCESS","response":"STATUS: DONE","usage":{"total_tokens":0}}'
`);
  chmodSync(path, 0o755);
  return path;
}

test("agy_start returns a handle without waiting for the executor", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 3000) });
  t.after(() => client.close());
  await client.init();

  const t0 = Date.now();
  const started = await client.call("agy_start", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  const took = Date.now() - t0;

  assert.match(started.text, /STARTED job-\d+/);
  assert.ok(took < 1000, `agy_start blocked for ${took}ms; a handle that waits is not a handle`);

  // Visible as running, without blocking.
  const status = await client.call("agy_status", {});
  assert.match(status.text, /job-1 · working/);

  await client.call("agy_await", {});
});

test("agy_await settles with the job and carries its audit", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 800) });
  t.after(() => client.close());
  await client.init();

  await client.call("agy_start", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  await client.call("agy_start", { task: "TOUCH=b.ts", owned_files: ["b.ts"], cwd: repo.dir });

  const done = await client.call("agy_await", {});
  assert.match(done.text, /job-1 · completed/);
  assert.match(done.text, /job-2 · completed/);
  // Started together in one repo: the epoch audit must not make them accuse each other.
  assert.deepEqual(outOfScope(done.text), []);

  // Terminal state is readable again without waiting.
  const again = await client.call("agy_result", { job_id: "job-1" });
  assert.doesNotMatch(again.text, /Still running/);
});

test("a second job may not claim a file a running job owns", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 1500) });
  t.after(() => client.close());
  await client.init();

  await client.call("agy_start", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  const clash = await client.call("agy_start", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });

  assert.match(clash.text, /OWNERSHIP CONFLICT/);
  assert.ok(clash.isError);
  await client.call("agy_await", {});
});

test("agy_cancel stops a job and says the tree is left half-written", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 5000) });
  t.after(() => client.close());
  await client.init();

  await client.call("agy_start", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  const cancelled = await client.call("agy_cancel", { job_id: "job-1" });
  assert.match(cancelled.text, /STAYS in the working tree/);

  const done = await client.call("agy_await", { job_ids: ["job-1"] });
  assert.match(done.text, /job-1 · cancelled/);
});
