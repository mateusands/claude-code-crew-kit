/**
 * A cut-off executor is not an empty one, and the server used to report it as one.
 *
 * `<name>_status` said `failed`, which reads as "throw the round away" — while the
 * executor had in fact done most of the work and been killed at the ceiling. Everything
 * it had printed was discarded along with the process, so the only rounds that survived
 * a timeout were the ones whose prompt had told the executor to write its report to a
 * file first.
 *
 * Two separate states, two separate reports: died with nothing, and cut off with work.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/codex/server.mjs");

/** Prints a finding, then hangs past any ceiling — a review killed mid-flight. */
function slowCodex({ speakFirst }) {
  const dir = mkdtempSync(join(tmpdir(), "crew-slow-"));
  const bin = join(dir, "fake-codex");
  writeFileSync(bin, `#!/usr/bin/env bash
cat > /dev/null
${speakFirst ? `echo '{"type":"thread.started","thread_id":"fake-thread"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"FINDING 1: the guard is on the symptom"}}'` : ""}
sleep 30
`);
  chmodSync(bin, 0o755);
  return bin;
}

test("a job killed at the ceiling reports timed_out, not failed", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const client = new Client(SERVER, { CODEX_MCP_BIN: slowCodex({ speakFirst: true }) });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  const started = await client.call("codex_start", { task: "review", owned_files: ["a.txt"], cwd: repo.dir, timeout_s: 1 });
  const id = started.text.match(/STARTED (job-\d+)/)[1];
  await client.call("codex_await", { job_ids: [id] });

  const status = await client.call("codex_status", { job_id: id });
  assert.match(status.text, /timed_out/, `status must not read as a clean failure:\n${status.text}`);
  assert.match(status.text, /NOT empty/, "the state has to say so where it is read");
});

test("what the executor said before it was killed comes back, labelled", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const client = new Client(SERVER, { CODEX_MCP_BIN: slowCodex({ speakFirst: true }) });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  const r = await client.call("codex_ask", { question: "review this", cwd: repo.dir, timeout_s: 1 });
  assert.equal(r.isError, true, "a cut-off is still a failure to finish");
  assert.match(r.text, /TIMED OUT/);
  assert.match(r.text, /FINDING 1: the guard is on the symptom/, "the partial analysis must survive the kill");
  assert.match(r.text, /PARTIAL OUTPUT/, "and must never be readable as a finished report");
});

test("a cut-off with nothing to show says so without inventing output", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const client = new Client(SERVER, { CODEX_MCP_BIN: slowCodex({ speakFirst: false }) });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  const r = await client.call("codex_ask", { question: "review this", cwd: repo.dir, timeout_s: 1 });
  assert.match(r.text, /TIMED OUT/);
  assert.ok(!/PARTIAL OUTPUT/.test(r.text), "no output means no partial-output section");
  assert.match(r.text, /read any file the executor was told to write/, "the recovery path is named either way");
});

test("the ceiling cuts the whole process tree, not just the wrapper", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const client = new Client(SERVER, { CODEX_MCP_BIN: slowCodex({ speakFirst: true }) });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  // The stand-in shells out to `sleep 30`. Killing only the direct child leaves that
  // sleep holding the stdout pipe, and the call returns after 30s with a 1s ceiling
  // set — the timeout reported honestly, and enforced not at all.
  const t0 = Date.now();
  await client.call("codex_ask", { question: "review this", cwd: repo.dir, timeout_s: 1 });
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 5000, `the 1s ceiling took ${elapsed}ms to take effect`);
});
