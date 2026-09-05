/**
 * The kit is strong on knowledge and weak on mandatory execution — every gate in it is
 * prose an agent reads and decides to follow. `check-drift` is the exception, and this
 * file is what keeps it one: a check that cannot be made to fail is not a check.
 *
 * The two defects it exists for were both found in an installed kit, and neither broke
 * anything: a skill still telling people its scripts were gitignored years after they
 * started being versioned, and a skill documenting 12 of the 29 scripts shipped beside
 * it. Wrong documentation about infrastructure ages worse than wrong code, because
 * nobody ever runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { REPO_ROOT } from "./helpers.mjs";

/** An installed, git-tracked project. Placeholders are substituted the way onboarding
 *  substitutes them, so the fixture is a SPECIALIZED install — the state the check is
 *  meant to be green in. */
function installedProject(t, { specialize = true } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "crew-drift-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "-q", "-b", "main", ".");
  git("config", "user.email", "t@t.co");
  git("config", "user.name", "t");
  execFileSync(join(REPO_ROOT, "install.sh"), [dir], { stdio: "pipe" });
  if (specialize) {
    // What onboarding actually produces, not lorem ipsum: the records directory is a real
    // path, it exists, and the plans under it are ignored exactly as START.md Step 5 says.
    // A fixture that skips that reports drift the check is right about.
    mkdirSync(join(dir, ".crew/plans-local"), { recursive: true });
    mkdirSync(join(dir, ".crew/hardenings"), { recursive: true });
    writeFileSync(join(dir, ".crew/info.md"), "# authority\n");
    appendFileSync(join(dir, ".gitignore"), "\n.crew/plans-local/\n");
    const mds = execFileSync("find", [join(dir, ".claude"), "-name", "*.md"], { encoding: "utf8" })
      .split("\n").filter(Boolean);
    for (const f of [...mds, join(dir, "AGENTS.md"), join(dir, "CLAUDE.md")]) {
      if (!existsSync(f) || f.endsWith("crew-info.md.template")) continue;
      writeFileSync(f, readFileSync(f, "utf8")
        .replace(/\{\{RECORDS_DIR\}\}/g, ".crew")
        .replace(/\{\{[A-Z_]+\}\}/g, "x"));
    }
  }
  git("add", "-A");
  git("commit", "-q", "-m", "install");
  return dir;
}

const run = (dir) => spawnSync(process.execPath, [join(dir, ".claude/scripts/check-drift.mjs")], { cwd: dir, encoding: "utf8" });

test("a specialized install passes", (t) => {
  const r = run(installedProject(t));
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}:\n${r.stdout}${r.stderr}`);
});

test("an install nobody specialized fails on its placeholders", (t) => {
  const r = run(installedProject(t, { specialize: false }));
  assert.equal(r.status, 1, "a kit still full of {{PLACEHOLDER}} is not a specialized kit");
  assert.match(r.stdout, /Unfilled placeholder/);
});

test("a link that resolves nowhere fails it", (t) => {
  const dir = installedProject(t);
  const f = join(dir, "AGENTS.md");
  appendFileSync(f, "\nSee [the missing thing](.claude/skills/nope/SKILL.md).\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Broken relative link/);
});

test("a claim that a tracked path is gitignored fails it", (t) => {
  const dir = installedProject(t);
  // The defect verbatim: a skill telling readers its own scripts do not reach colleagues,
  // written before those scripts started being committed.
  appendFileSync(join(dir, "AGENTS.md"),
    "\n⚠️ These scripts live in `.claude/scripts/check-drift.mjs`, which is gitignored. They do not reach your colleagues.\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /git tracks it/);
});

test("a script shipped beside a skill that the skill never names fails it", (t) => {
  const dir = installedProject(t);
  writeFileSync(join(dir, ".claude/skills/coder/undocumented-helper.mjs"), "// nothing\n");
  const r = run(dir);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /never mentions/);
});

test("a sentence naming both the ignored file and its committed example stays quiet", (t) => {
  const dir = installedProject(t);
  appendFileSync(join(dir, ".gitignore"), "\nsecrets.toml\n");
  writeFileSync(join(dir, "secrets.toml"), "key = ''\n");
  writeFileSync(join(dir, "secrets.example.toml"), "key = ''\n");
  appendFileSync(join(dir, "AGENTS.md"),
    "\nCredentials live in `secrets.toml`, which is gitignored; `secrets.example.toml` ships empty.\n");
  const r = run(dir);
  assert.equal(r.status, 0, `a correct sentence must not be flagged — noise is how a check gets turned off:\n${r.stdout}`);
});
