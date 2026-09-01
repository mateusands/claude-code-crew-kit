/**
 * Tests 2, 3 and 5 of docs/plan-async-delegation.md.
 *
 * The concurrency rework makes one job's writes invisible to another job's audit.
 * These exist so that exemption can never widen into "the audit stopped looking":
 * a write nobody declared, a git command nobody may run, and two jobs claiming the
 * same file must all still be caught while jobs are in flight.
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("a write nobody declared is still caught, and reaches every running job", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n", "c.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 1500) });
  t.after(() => client.close());
  await client.init();

  const running = Promise.all([
    client.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir }),
    client.call("agy_task", { task: "TOUCH=b.ts", owned_files: ["b.ts"], cwd: repo.dir }),
  ]);
  // Nobody owns c.ts. Attribution is impossible, so both reports must carry it.
  await sleep(400);
  writeFileSync(join(repo.dir, "c.ts"), "touched by nobody\n");
  const [a, b] = await running;

  assert.deepEqual(outOfScope(a.text), ["c.ts"]);
  assert.deepEqual(outOfScope(b.text), ["c.ts"]);
  assert.ok(a.isError && b.isError, "an unattributable write must fail both reports");
});

test("a commit during a job is still caught", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 1500) });
  t.after(() => client.close());
  await client.init();

  const running = client.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  await sleep(400);
  writeFileSync(join(repo.dir, "other.ts"), "x\n");
  repo.git("add", "-A");
  repo.git("commit", "-q", "-m", "a commit the executor was forbidden to make");
  const r = await running;

  assert.match(r.text, /GIT HISTORY CHANGED/, "HEAD moved and the audit stayed silent");
  assert.ok(r.isError);
});

test("two jobs may not claim the same file", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 1500) });
  t.after(() => client.close());
  await client.init();

  const first = client.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["src"], cwd: repo.dir });
  await sleep(200);
  // `src/x.ts` sits under `src`, which the running job already owns.
  const second = await client.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["src/x.ts"], cwd: repo.dir });

  assert.match(second.text, /OWNERSHIP CONFLICT/);
  assert.ok(second.isError);
  await first;
});

test("a lone job writing outside its ownership is still caught", async (t) => {
  // The common case, and the one the concurrency rework could most easily have
  // broken without any of the tests above noticing.
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(bin(), 0) });
  t.after(() => client.close());
  await client.init();

  const r = await client.call("agy_task", { task: "TOUCH=b.ts", owned_files: ["a.ts"], cwd: repo.dir });

  assert.deepEqual(outOfScope(r.text), ["b.ts"]);
  assert.ok(r.isError);
});
