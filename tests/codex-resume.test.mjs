/**
 * `codex_followup` was dead on arrival, and nothing here noticed.
 *
 * The server built `codex exec resume <id>` and then pushed `--sandbox` and `-C` onto
 * it unconditionally. `codex exec resume` accepts neither, so the CLI aborted at
 * argument parsing with `error: unexpected argument '--sandbox' found` — every
 * follow-up, always, since the tool was written. The cost is measured in whole rounds:
 * a review that had already produced its analysis could not be resumed to write it out.
 *
 * The stand-in below therefore does not merely record argv, it REFUSES the way the real
 * CLI refuses. A fake that accepts everything would have kept passing through the bug.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, chmodSync, mkdtempSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client, makeRepo, REPO_ROOT } from "./helpers.mjs";

const SERVER = join(REPO_ROOT, "mcp/codex/server.mjs");

/** Emulates codex-cli 0.153.3's argument contract for `exec` and `exec resume`. */
function fakeCodex() {
  const dir = mkdtempSync(join(tmpdir(), "crew-codex-"));
  const bin = join(dir, "fake-codex");
  const argvLog = join(dir, "argv");
  writeFileSync(bin, `#!/usr/bin/env bash
printf '%s\\n' "$@" > ${JSON.stringify(argvLog)}
cat > /dev/null
resume=0
for a in "$@"; do [ "$a" = "resume" ] && resume=1; done
if [ "$resume" = "1" ]; then
  for a in "$@"; do
    case "$a" in
      --sandbox) echo "error: unexpected argument '--sandbox' found" >&2; exit 2;;
      -C|--cd)   echo "error: unexpected argument '$a' found" >&2; exit 2;;
    esac
  done
fi
echo '{"type":"thread.started","thread_id":"fake-thread"}'
echo '{"type":"item.completed","item":{"type":"agent_message","text":"STATUS: DONE"}}'
echo '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}'
`);
  chmodSync(bin, 0o755);
  return { bin, argv: () => (existsSync(argvLog) ? readFileSync(argvLog, "utf8").split("\n").filter(Boolean) : []) };
}

test("codex_followup resumes without the arguments resume refuses", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const f = fakeCodex();
  const client = new Client(SERVER, { CODEX_MCP_BIN: f.bin });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  const r = await client.call("codex_followup", { thread_id: "t-1", message: "carry on", cwd: repo.dir });
  const argv = f.argv();

  assert.equal(r.isError, false, `follow-up failed:\n${r.text}`);
  assert.deepEqual(argv.slice(0, 3), ["exec", "resume", "t-1"]);
  assert.ok(!argv.includes("--sandbox"), "`--sandbox` is rejected by `codex exec resume`");
  assert.ok(!argv.includes("-C"), "`-C` is rejected by `codex exec resume`; the spawn cwd carries it");
  assert.ok(argv.includes('sandbox_mode="read-only"'), "containment must survive the resume, by its config name");
});

test("a write follow-up resumes with the sandbox opened, not removed", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const f = fakeCodex();
  const client = new Client(SERVER, { CODEX_MCP_BIN: f.bin });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  await client.call("codex_followup", { thread_id: "t-2", message: "fix it", cwd: repo.dir, owned_files: ["a.txt"] });
  assert.ok(f.argv().includes('sandbox_mode="workspace-write"'));
});

test("a first call still passes the flags plain `codex exec` does accept", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const f = fakeCodex();
  const client = new Client(SERVER, { CODEX_MCP_BIN: f.bin });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  await client.call("codex_ask", { question: "what is here?", cwd: repo.dir });
  const argv = f.argv();
  assert.ok(!argv.includes("resume"));
  assert.equal(argv[argv.indexOf("--sandbox") + 1], "read-only");
  assert.equal(argv[argv.indexOf("-C") + 1], repo.dir);
});

test("no --ephemeral, because an ephemeral session records no rollout to resume", async (t) => {
  const repo = makeRepo({ "a.txt": "x\n" });
  const f = fakeCodex();
  const client = new Client(SERVER, { CODEX_MCP_BIN: f.bin });
  t.after(() => { client.close(); repo.cleanup(); });
  await client.init();

  await client.call("codex_ask", { question: "what is here?", cwd: repo.dir });
  // `codex exec resume <id>` on an ephemeral thread answers
  // `no rollout found for thread id`, so --ephemeral and codex_followup cannot coexist.
  assert.ok(!f.argv().includes("--ephemeral"));
});
