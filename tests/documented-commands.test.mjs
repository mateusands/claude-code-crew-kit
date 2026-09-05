/**
 * A command this kit prints is a command someone will paste. If the printed form
 * hangs, the kit is not permitting the failure, it is causing it.
 *
 * The specific failure: an agent CLI invoked by a tool gets a pipe for stdin rather
 * than a terminal, and `codex exec` appends a piped stdin to its PROMPT argument —
 * so it waits for an EOF that the pipe may never send. Measured on codex-cli
 * 0.153.3: with an open pipe, `Reading additional input from stdin...`, 39 bytes,
 * zero CPU, until killed; with `< /dev/null`, the same call exits 0. It is a race,
 * so it reads as an intermittent reviewer rather than as a broken invocation.
 *
 * NOT COVERED: prose that names a command without invoking it, and inline code
 * spans. Only fenced shell blocks are checked, because only those are pasted whole.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { REPO_ROOT } from "./helpers.mjs";

const SKIP = new Set([".git", "node_modules", "crew-tests"]);
// Agent CLIs that read stdin when it is not a terminal.
const BLOCKING = /\b(codex\s+(exec|review))\b/;

function markdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) markdownFiles(p, out);
    else if (name.endsWith(".md") || name.endsWith(".md.template")) out.push(p);
  }
  return out;
}

function shellBlocks(md) {
  const blocks = [];
  const re = /```(?:bash|sh|shell|console)\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(md))) blocks.push({ body: m[1], line: md.slice(0, m.index).split("\n").length });
  return blocks;
}

test("every documented agent CLI invocation closes stdin", () => {
  const offenders = [];
  for (const file of markdownFiles(REPO_ROOT)) {
    for (const { body, line } of shellBlocks(readFileSync(file, "utf8"))) {
      if (!BLOCKING.test(body)) continue;
      if (body.includes("< /dev/null") || body.includes("</dev/null")) continue;
      offenders.push(`${relative(REPO_ROOT, file)}:${line}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these shell blocks invoke an agent CLI with stdin left open, which hangs when a tool runs them:\n  ${offenders.join("\n  ")}`,
  );
});
