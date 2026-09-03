/**
 * The links have to resolve where the kit LANDS, not where it is developed.
 *
 * Every relative link inside `mcp/**` points at `../agents`, `../skills` or
 * `../workflows`. In this repository those are siblings of `mcp/`, so a link check
 * run here passes — and it did, for weeks. Installed, they live under `.claude/`,
 * and `mcp/` used to be copied to the project root, so six links resolved to
 * directories that did not exist. One of them was the only pointer to the
 * `agy-runner` subagent, and someone ran the kit for a day without knowing it
 * existed.
 *
 * This test checks the installed tree, which is the only layout that matters to
 * anyone who is not developing the kit.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT } from "./helpers.mjs";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === ".git") continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

test("every relative link resolves in the INSTALLED layout", (t) => {
  const target = mkdtempSync(join(tmpdir(), "crew-install-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  execFileSync(join(REPO_ROOT, "install.sh"), [target], { stdio: "pipe" });

  const broken = [];
  for (const file of walk(target)) {
    const md = readFileSync(file, "utf8");
    for (const m of md.matchAll(/\]\((?!https?:|#)([^)]+)\)/g)) {
      const target_ = m[1].split("#")[0];
      if (!target_) continue;
      if (!existsSync(join(dirname(file), target_))) {
        broken.push(`${relative(target, file)} -> ${target_}`);
      }
    }
  }
  assert.deepEqual(broken, [], "links that only resolve while developing the kit");
});

test("the servers land where the shipped .mcp.json examples point", (t) => {
  const target = mkdtempSync(join(tmpdir(), "crew-install-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  execFileSync(join(REPO_ROOT, "install.sh"), [target], { stdio: "pipe" });

  // Every example in the kit says `.claude/mcp/<server>/server.mjs`. If the installer
  // and the configuration it ships disagree, one of them is a lie.
  for (const s of ["agy", "codex", "copilot"]) {
    assert.ok(existsSync(join(target, ".claude/mcp", s, "server.mjs")), `.claude/mcp/${s}/server.mjs missing`);
  }
  assert.ok(existsSync(join(target, ".claude/mcp/lib/core.mjs")));
});
