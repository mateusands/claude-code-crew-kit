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

test("the licence travels with the copy it covers", (t) => {
  // An install copies the skills, the workflows and the servers into someone else's
  // repository — a substantial portion, which MIT asks the notice to accompany. The
  // installer shipping everything except the notice put the person who ran it out of
  // compliance through no fault of their own.
  const target = mkdtempSync(join(tmpdir(), "crew-install-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  execFileSync(join(REPO_ROOT, "install.sh"), [target], { stdio: "pipe" });

  const shipped = join(target, ".claude/LICENSE-crewwatch");
  assert.ok(existsSync(shipped), "the kit's MIT notice did not travel with the install");

  const text = readFileSync(shipped, "utf8");
  assert.match(text, /MIT License/);
  assert.match(text, /Copyright \(c\)/);
  assert.match(text, /github\.com\/mateusands\/claude-code-crew-kit/, "the notice must say what it covers");
  // The operative terms are the ones that must not drift.
  assert.equal(text.split("Permission is hereby granted")[1], readFileSync(join(REPO_ROOT, "LICENSE"), "utf8").split("Permission is hereby granted")[1]);
});

test("the installed .mcp.json example points at servers that are actually there", (t) => {
  // A server copied but never registered does not exist, and the shipped example used
  // to carry `/absolute/path/to/...` — three hand-edits between the install and a
  // working tool, with silence as the failure mode when they were skipped.
  const target = mkdtempSync(join(tmpdir(), "crew-install-"));
  t.after(() => rmSync(target, { recursive: true, force: true }));
  execFileSync(join(REPO_ROOT, "install.sh"), [target], { stdio: "pipe" });

  const example = join(target, ".mcp.json.example");
  assert.ok(existsSync(example), "install.sh must write a ready-to-copy .mcp.json.example");
  const cfg = JSON.parse(readFileSync(example, "utf8"));

  assert.ok(!readFileSync(example, "utf8").includes("/absolute/path/to"), "no placeholder path may survive the install");
  for (const [name, srv] of Object.entries(cfg.mcpServers)) {
    for (const arg of srv.args) {
      if (!arg.endsWith("server.mjs")) continue;
      assert.ok(existsSync(arg), `${name} points at ${arg}, which does not exist`);
    }
  }
  // The one the field report caught: shipped in the tree, absent from every registration.
  assert.ok(cfg.mcpServers.agy, "agy ships with the kit and must appear in the example");
});
