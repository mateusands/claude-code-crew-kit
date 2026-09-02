/**
 * From the field: an orchestrator that kept working while a job ran got three
 * charter violations back, all of which were its own edits. Its workaround was to
 * stop working in parallel — which is most of what delegation was for.
 *
 * git records that a file changed, never who changed it. So the audit cannot deduce
 * this; it has to be told. The hard verdict stays the default (nobody declaring
 * anything keeps the strong guarantee) and degrades only on request.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/agy/server.mjs");

function fakeAgy(delayMs) {
  const dir = mkdtempSync(join(tmpdir(), "crew-bin-"));
  const path = join(dir, "fake-agy");
  writeFileSync(path, `#!/usr/bin/env bash
ws=""; prev=""; for a in "$@"; do [ "$prev" = "--add-dir" ] && ws="$a"; prev="$a"; done
sleep ${delayMs / 1000}
printf 'by the executor\\n' > "$ws/exec.ts"
echo '{"conversation_id":"fake","status":"SUCCESS","response":"STATUS: DONE","usage":{}}'
`);
  chmodSync(path, 0o755);
  return path;
}

/** Delegate, and edit three files of your own while it runs. */
async function withHumanWriting(t, extra) {
  const repo = makeRepo({ "exec.ts": "1\n", "mine1.ts": "1\n", "mine2.ts": "1\n", "mine3.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(1200) });
  t.after(() => client.close());
  await client.init();

  const running = client.call("agy_task", { task: "x", owned_files: ["exec.ts"], cwd: repo.dir, ...extra });
  await new Promise((r) => setTimeout(r, 300));
  for (const f of ["mine1.ts", "mine2.ts", "mine3.ts"]) writeFileSync(join(repo.dir, f), "the human kept working\n");
  return running;
}

test("declaring nothing keeps the hard verdict — and names the way out", async (t) => {
  const r = await withHumanWriting(t, {});
  assert.deepEqual(outOfScope(r.text), ["mine1.ts", "mine2.ts", "mine3.ts"]);
  // The field report's author had no way to know the option existed. The finding says so now.
  assert.match(r.text, /reserved_files/);
  assert.match(r.text, /orchestrator_writing/);
});

test("orchestrator_writing turns a claim the audit cannot support into a stated ambiguity", async (t) => {
  const r = await withHumanWriting(t, { orchestrator_writing: true });
  assert.deepEqual(outOfScope(r.text), [], "still accusing the executor of the orchestrator's edits");
  assert.match(r.text, /UNATTRIBUTED CHANGES/);
  assert.ok(!r.isError, "an ambiguity is not a failed delegation");
});

test("reserved_files removes the ambiguity instead of narrating it", async (t) => {
  const r = await withHumanWriting(t, { reserved_files: ["mine1.ts", "mine2.ts", "mine3.ts"] });
  assert.deepEqual(outOfScope(r.text), []);
  assert.doesNotMatch(r.text, /UNATTRIBUTED CHANGES/, "declared paths are known, not ambiguous");
  assert.ok(!r.isError);
});

test("a declared lane does not cover a path outside it", async (t) => {
  const repo = makeRepo({ "exec.ts": "1\n", "mine1.ts": "1\n", "elsewhere.ts": "1\n" });
  t.after(() => repo.cleanup());
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(1200) });
  t.after(() => client.close());
  await client.init();

  const running = client.call("agy_task", { task: "x", owned_files: ["exec.ts"], cwd: repo.dir, reserved_files: ["mine1.ts"] });
  await new Promise((r) => setTimeout(r, 300));
  writeFileSync(join(repo.dir, "mine1.ts"), "declared\n");
  writeFileSync(join(repo.dir, "elsewhere.ts"), "NOT declared\n");
  const r = await running;

  assert.deepEqual(outOfScope(r.text), ["elsewhere.ts"], "reserving one path must not blanket the tree");
});
