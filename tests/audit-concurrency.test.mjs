/**
 * Test 1 of docs/plan-async-delegation.md.
 *
 * Two delegated tasks run at once in one repository, each owning a different file.
 * Neither wrote outside its ownership, so neither report may contain a violation.
 *
 * On the current server this FAILS, and that failure is the point: per-call
 * `git status` bracketing (server.mjs:63-88, 134-144) makes each job's `after`
 * snapshot include the other job's legitimate write.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/agy/server.mjs");

/** Fake agy: writes whichever file the task names as `TOUCH=<file>`, after a delay
 *  long enough that two calls genuinely overlap. */
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

test("concurrent jobs with disjoint ownership do not accuse each other", async (t) => {
  const repo = makeRepo({ "a.ts": "export const A = 1;\n", "b.ts": "export const B = 1;\n" });
  t.after(() => repo.cleanup());

  // Outside the fixture: a binary inside it would show up as an untracked file and
  // become a violation in its own right.
  const client = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(mkdtempSync(join(tmpdir(), "crew-bin-")), 1500) });
  t.after(() => client.close());
  await client.init();

  // Both issued before either returns — the server handles requests concurrently.
  const [a, b] = await Promise.all([
    client.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir }),
    client.call("agy_task", { task: "TOUCH=b.ts", owned_files: ["b.ts"], cwd: repo.dir }),
  ]);

  // Both writes really happened — otherwise the test proves nothing.
  assert.deepEqual(
    repo.git("status", "--porcelain").toString().split("\n").filter(Boolean).map((l) => l.slice(3)).sort(),
    ["a.ts", "b.ts"],
    "fixture precondition: both files must have been modified",
  );

  assert.deepEqual(outOfScope(a.text), [], "job A accused job B of an out-of-scope write");
  assert.deepEqual(outOfScope(b.text), [], "job B accused job A of an out-of-scope write");
});
