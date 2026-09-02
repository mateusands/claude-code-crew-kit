/**
 * The shared core, exercised through every backend that sits on it.
 *
 * The three servers used to be near-copies of one another, which is how a rule gets
 * fixed in one of them and quietly stays broken in the other two. They are now thin
 * backends over `mcp/lib/core.mjs`, and this file is what keeps them honest: the same
 * contract, asserted against each, with a stand-in for the real CLI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

/** Each CLI delivers the prompt differently (argv for agy/copilot, stdin for codex) and
 *  answers in its own shape, so the stand-in reads both and emits the right envelope. */
const FLAVOURS = {
  agy: `echo '{"conversation_id":"fake","status":"SUCCESS","response":"STATUS: DONE","usage":{"total_tokens":0}}'`,
  codex: `echo '{"type":"thread.started","thread_id":"fake-thread"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"STATUS: DONE"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}'`,
  copilot: `echo "STATUS: DONE"`,
};

function fake(flavour, delayMs = 0) {
  const dir = mkdtempSync(join(tmpdir(), "crew-bin-"));
  const path = join(dir, `fake-${flavour}`);
  writeFileSync(path, `#!/usr/bin/env bash
prompt="$* $(cat)"
file=$(printf '%s' "$prompt" | grep -o 'TOUCH=[a-z.]*' | head -1 | cut -d= -f2)
ws=""; prev=""
for a in "$@"; do case "$prev" in --add-dir|-C|--cd) ws="$a";; esac; prev="$a"; done
${delayMs ? `sleep ${delayMs / 1000}` : ""}
[ -n "$file" ] && [ -n "$ws" ] && printf 'changed\\n' > "$ws/$file"
${FLAVOURS[flavour]}
`);
  chmodSync(path, 0o755);
  return path;
}

const BACKENDS = [
  { name: "agy", server: "mcp/agy/server.mjs", env: (p) => ({ AGY_MCP_BIN: p }) },
  { name: "codex", server: "mcp/codex/server.mjs", env: (p) => ({ CODEX_MCP_BIN: p }) },
  { name: "copilot", server: "mcp/copilot/server.mjs", env: (p) => ({ COPILOT_MCP_BIN: p }) },
];

for (const b of BACKENDS) {
  const SERVER = join(REPO_ROOT, b.server);

  test(`${b.name}: exposes the whole delegated-executor tool set`, async (t) => {
    const client = new Client(SERVER, b.env(fake(b.name)));
    t.after(() => client.close());
    await client.init();
    const names = (await client.send("tools/list", {})).result.tools.map((x) => x.name);
    for (const suffix of ["task", "start", "await", "status", "result", "cancel", "ask", "followup"]) {
      assert.ok(names.includes(`${b.name}_${suffix}`), `missing ${b.name}_${suffix}`);
    }
  });

  test(`${b.name}: a write outside declared ownership is a violation`, async (t) => {
    const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
    t.after(() => repo.cleanup());
    const client = new Client(SERVER, b.env(fake(b.name)));
    t.after(() => client.close());
    await client.init();

    const r = await client.call(`${b.name}_task`, { task: "TOUCH=b.ts", owned_files: ["a.ts"], cwd: repo.dir });
    assert.deepEqual(outOfScope(r.text), ["b.ts"]);
    assert.ok(r.isError);
  });

  test(`${b.name}: handles come back at once and parallel jobs do not accuse each other`, async (t) => {
    const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
    t.after(() => repo.cleanup());
    const client = new Client(SERVER, b.env(fake(b.name, 1200)));
    t.after(() => client.close());
    await client.init();

    const t0 = Date.now();
    await client.call(`${b.name}_start`, { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
    await client.call(`${b.name}_start`, { task: "TOUCH=b.ts", owned_files: ["b.ts"], cwd: repo.dir });
    assert.ok(Date.now() - t0 < 1000, "start blocked; a handle that waits is not a handle");

    const done = await client.call(`${b.name}_await`, {});
    assert.deepEqual(outOfScope(done.text), [], "parallel jobs accused each other");
    assert.match(done.text, /job-1 · completed/);
    assert.match(done.text, /job-2 · completed/);
  });

  test(`${b.name}: read-only ask reports any write as a violation`, async (t) => {
    const repo = makeRepo({ "a.ts": "1\n" });
    t.after(() => repo.cleanup());
    const client = new Client(SERVER, b.env(fake(b.name)));
    t.after(() => client.close());
    await client.init();

    const r = await client.call(`${b.name}_ask`, { question: "TOUCH=a.ts — describe this repo", cwd: repo.dir });
    assert.match(r.text, /WRITE IN READ-ONLY MODE/);
    assert.ok(r.isError);
  });
}
