/**
 * The blind spots an independent review found in the audit, each pinned down before
 * it was fixed. Every one of them was invisible to the other test files because those
 * all start from a CLEAN working tree — which is not how a real session looks.
 *
 * Source: a `codex_ask` review of mcp/lib/core.mjs, cross-reviewed rather than
 * self-reviewed, per the kit's own rule.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, outOfScope, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/agy/server.mjs");

function fakeAgy(delayMs = 0) {
  const dir = mkdtempSync(join(tmpdir(), "crew-bin-"));
  const path = join(dir, "fake-agy");
  writeFileSync(path, `#!/usr/bin/env bash
prompt="$* $(cat)"
file=$(printf '%s' "$prompt" | grep -o 'TOUCH=[a-zA-Z0-9./_-]*' | head -1 | cut -d= -f2)
cmd=$(printf '%s' "$prompt" | grep -o 'RUNGIT=[a-zA-Z0-9._-]*' | head -1 | cut -d= -f2)
ws=""; prev=""
for a in "$@"; do case "$prev" in --add-dir|-C|--cd) ws="$a";; esac; prev="$a"; done
${delayMs ? `sleep ${delayMs / 1000}` : ""}
[ -n "$file" ] && [ -n "$ws" ] && mkdir -p "$(dirname "$ws/$file")" && printf 'written by the executor\\n' > "$ws/$file"
[ -n "$cmd" ] && [ -n "$ws" ] && git -C "$ws" branch "$cmd" >/dev/null 2>&1
echo '{"conversation_id":"fake","status":"SUCCESS","response":"STATUS: DONE","usage":{"total_tokens":0}}'
`);
  chmodSync(path, 0o755);
  return path;
}

const client = (t, delay) => {
  const c = new Client(SERVER, { AGY_MCP_BIN: fakeAgy(delay) });
  t.after(() => c.close());
  return c;
};

test("overwriting a file that was ALREADY modified is still out of scope", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n", "b.ts": "1\n" });
  t.after(() => repo.cleanup());
  // b.ts is dirty before the job starts — its porcelain code is " M" and stays " M"
  // however much the executor rewrites it. Comparing codes alone sees nothing.
  appendFileSync(join(repo.dir, "b.ts"), "the human was editing this\n");

  const c = client(t);
  await c.init();
  const r = await c.call("agy_task", { task: "TOUCH=b.ts", owned_files: ["a.ts"], cwd: repo.dir });

  assert.deepEqual(outOfScope(r.text), ["b.ts"], "an unauthorised overwrite of a dirty file went unreported");
});

test("overwriting a file that was ALREADY untracked is still out of scope", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());
  writeFileSync(join(repo.dir, "scratch.ts"), "someone's work in progress\n"); // "??" before and after

  const c = client(t);
  await c.init();
  const r = await c.call("agy_task", { task: "TOUCH=scratch.ts", owned_files: ["a.ts"], cwd: repo.dir });

  assert.deepEqual(outOfScope(r.text), ["scratch.ts"]);
});

test("a write to an owned but gitignored file is seen, not reported as nothing", async (t) => {
  // makeRepo commits everything it is given, .gitignore included.
  const repo = makeRepo({ "a.ts": "1\n", ".gitignore": "out/\n" });
  t.after(() => repo.cleanup());

  const c = client(t);
  await c.init();
  const r = await c.call("agy_task", { task: "TOUCH=out/report.md", owned_files: ["out"], cwd: repo.dir });

  assert.doesNotMatch(r.text, /CHANGED NOTHING/, "an owned ignored path is auditable via pathspec; it must not read as no-op");
  assert.match(r.text, /out\/report\.md/);
});

test("creating a branch is a forbidden git mutation and must be caught", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());

  const c = client(t);
  await c.init();
  const r = await c.call("agy_task", { task: "TOUCH=a.ts RUNGIT=executor-was-here", owned_files: ["a.ts"], cwd: repo.dir });

  assert.match(r.text, /BRANCH|REF/i, "git branch left no trace in the audit");
  assert.ok(r.isError);
});

test("a job that throws releases its ownership instead of wedging it forever", async (t) => {
  const repo = makeRepo({ "a.ts": "1\n" });
  t.after(() => repo.cleanup());

  const c = client(t);
  await c.init();
  // `task` is not a string: it blows up inside the tool, after the epoch slot was taken.
  const boom = await c.call("agy_task", { task: null, owned_files: ["a.ts"], cwd: repo.dir });
  assert.ok(boom.isError);

  const after = await c.call("agy_task", { task: "TOUCH=a.ts", owned_files: ["a.ts"], cwd: repo.dir });
  assert.doesNotMatch(after.text, /OWNERSHIP CONFLICT/, "the failed job never released its claim");
});
