/**
 * Each executor is its own MCP server, so one process's epoch registry cannot see
 * another's. Dispatch agy and codex at the same repository and each audits the
 * other's legitimate writes as out-of-scope — reported from production, and
 * reproduced here before it was fixed.
 *
 * Live ownership is now published to a per-repository file. These tests exist in
 * pairs: the exemption must work, and it must not turn into blindness.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

function fake(binName, writes, delayMs = 1200) {
  const dir = mkdtempSync(join(tmpdir(), "crew-bin-"));
  const path = join(dir, binName);
  writeFileSync(path, `#!/usr/bin/env bash
ws=""; prev=""; for a in "$@"; do case "$prev" in --add-dir|-C|--cd) ws="$a";; esac; prev="$a"; done
sleep ${delayMs / 1000}
${writes.map((w) => `printf 'written\\n' > "$ws/${w}"`).join("\n")}
echo '{"conversation_id":"f","status":"SUCCESS","response":"STATUS: DONE","usage":{}}'
`);
  chmodSync(path, 0o755);
  return path;
}

const agy = (t, w, delay) => { const c = new Client(join(REPO_ROOT, "mcp/agy/server.mjs"), { AGY_MCP_BIN: fake("fake-agy", w, delay) }); t.after(() => c.close()); return c; };
const codex = (t, w, delay) => { const c = new Client(join(REPO_ROOT, "mcp/codex/server.mjs"), { CODEX_MCP_BIN: fake("fake-codex", w, delay) }); t.after(() => c.close()); return c; };

test("two servers on one repo do not accuse each other", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  t.after(() => repo.cleanup());
  const ag = agy(t, ["a.ts"]), cx = codex(t, ["b.ts"]);
  await ag.init(); await cx.init();

  const [ra, rc] = await Promise.all([
    ag.call("agy_task", { task: "t", owned_files: ["a.ts"], cwd: repo.dir }),
    cx.call("codex_task", { task: "t", owned_files: ["b.ts"], cwd: repo.dir }),
  ]);

  assert.deepEqual(outOfScope(ra.text), [], "agy accused codex's declared file");
  assert.deepEqual(outOfScope(rc.text), [], "codex accused agy's declared file");
});

test("...and a write neither of them declared is still caught by both", async (t) => {
  // The exemption must be exactly as wide as what was declared. This is the test
  // that stops "stop accusing each other" from becoming "stop looking".
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n", "nobody.ts": "1\n" });
  t.after(() => repo.cleanup());
  const ag = agy(t, ["a.ts", "nobody.ts"]), cx = codex(t, ["b.ts"]);
  await ag.init(); await cx.init();

  const [ra, rc] = await Promise.all([
    ag.call("agy_task", { task: "t", owned_files: ["a.ts"], cwd: repo.dir }),
    cx.call("codex_task", { task: "t", owned_files: ["b.ts"], cwd: repo.dir }),
  ]);

  assert.deepEqual(outOfScope(ra.text), ["nobody.ts"]);
  assert.deepEqual(outOfScope(rc.text), ["nobody.ts"]);
});

test("ownership is withdrawn when a job ends, so a later job is judged alone", async (t) => {
  // A registry that only ever grows would suppress real violations for the life of
  // the repository.
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  t.after(() => repo.cleanup());

  const first = codex(t, ["b.ts"], 0);
  await first.init();
  await first.call("codex_task", { task: "t", owned_files: ["b.ts"], cwd: repo.dir });

  const second = agy(t, ["b.ts"], 0);
  await second.init();
  const r = await second.call("agy_task", { task: "t", owned_files: ["a.ts"], cwd: repo.dir });

  assert.deepEqual(outOfScope(r.text), ["b.ts"], "a finished job's claim still shielded the path");
});
