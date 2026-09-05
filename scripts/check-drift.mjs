#!/usr/bin/env node
/**
 * check-drift — does what the kit SAYS about this repository still match the repository?
 *
 * Every other gate in this kit is prose an agent chooses to follow. This one exits 1.
 * That distinction is the whole point: a skill that describes the repository wrongly is
 * believed precisely because a skill is where facts are trusted, and nothing about a
 * wrong description fails. It goes stale in silence, and it ages worse than wrong code,
 * because nobody ever runs it.
 *
 * Four checks, each one a defect that has actually been found in an installed kit:
 *
 *   1. a relative link that resolves nowhere
 *   2. a {{PLACEHOLDER}} that was never filled in
 *   3. a path a document calls gitignored that git actually tracks
 *   4. a script sitting in a skill's directory that its SKILL.md never mentions
 *
 * Run it from the root of the project the kit is installed in.
 *   node .claude/scripts/check-drift.mjs; echo "exit=$?"
 */

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, resolve, basename, extname } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
const SKIP_DIRS = new Set([".git", "node_modules", ".venv", "venv", "__pycache__", "storage"]);
// Two files are supposed to still contain placeholders: the template that gets copied,
// and the onboarding protocol whose whole job is to list the ones you must fill in.
const PLACEHOLDER_EXEMPT = ["crew-info.md.template", "START.md"];

const problems = [];
const skipped = [];
const flag = (check, where, detail) => problems.push({ check, where, detail });

function walk(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// `.claude/` is what makes this an installed project. Without it, the root AGENTS.md and
// START.md are the kit's own SOURCE, whose links point at where the files LAND rather than
// where they sit — so checking them here reports drift that installing would resolve.
if (!existsSync(join(ROOT, ".claude"))) {
  console.error("check-drift: no .claude/ here, so this is not a project the kit is installed in.");
  console.error("Run it from the root of one. (In the kit's own repository, `npm test` covers this.)");
  process.exit(2);
}

const docRoots = [".claude", ".crew"].map((d) => join(ROOT, d)).filter(existsSync);
const docs = docRoots.flatMap((d) => walk(d)).filter((f) => f.endsWith(".md"));
for (const name of ["AGENTS.md", "CLAUDE.md", "START.md"]) {
  const p = join(ROOT, name);
  if (existsSync(p)) docs.push(p);
}

/* ── 1. links ─────────────────────────────────────────────────────────────── */
for (const file of docs) {
  const md = readFileSync(file, "utf8");
  for (const m of md.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1];
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    const target = raw.split("#")[0];
    if (!target) continue;
    const abs = resolve(dirname(file), target);
    if (!existsSync(abs)) {
      flag("link", relative(ROOT, file), `${raw} resolves to nothing`);
    }
  }
}

/* ── 2. placeholders ──────────────────────────────────────────────────────── */
for (const file of docs) {
  if (PLACEHOLDER_EXEMPT.includes(basename(file))) continue;
  const md = readFileSync(file, "utf8");
  const left = [...new Set([...md.matchAll(/\{\{[A-Z_]+\}\}/g)].map((m) => m[0]))];
  if (left.length) flag("placeholder", relative(ROOT, file), left.join(" "));
}

/* ── 3. claims about what git tracks ──────────────────────────────────────── */
/** A sentence saying a path is not in the repository, and the path it names. The
 *  failure this catches: a skill telling people to duplicate a procedure elsewhere
 *  "because these files do not reach your colleagues", years after they started
 *  reaching them. */
const IGNORED_CLAIM = /gitignored|not versioned|never committed|do not reach|does not reach/i;
let gitWorks = true;
try {
  execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: ROOT, stdio: "pipe" });
} catch {
  gitWorks = false;
  skipped.push("the gitignore claims — this is not a git repository, or git is unavailable");
}

if (gitWorks) {
  for (const file of docs) {
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      if (!IGNORED_CLAIM.test(line)) continue;
      // Every path the sentence could be talking about — the ones it names, plus the
      // document itself when it says "this file". The claim is satisfied if ANY of them
      // is genuinely ignored: a sentence naming both `config.toml` and
      // `config.example.toml` is about the first one, and flagging the second is noise.
      // Noise is how a check gets turned off, so the check has to be quiet when it is right.
      // Not filtered by existence: `git check-ignore` matches a PATTERN, and the whole
      // point of a sentence like "`.crew-kit-config` is gitignored" is often that the
      // file is not there yet. Requiring it to exist first made the check flag the one
      // path on the line that does — the committed `.example` beside it.
      const candidates = [...line.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1].trim())
        .filter((c) => /^[\w./-]+$/.test(c) && (c.includes(".") || c.includes("/")));
      if (/this file|these files/i.test(line)) candidates.push(relative(ROOT, file));
      if (!candidates.length) continue;
      // The claim is contradicted only when git TRACKS every path the sentence names.
      // A path git ignores satisfies it. So does one that does not exist — "there is no
      // `.env` in this project" and "`.crew-kit-config` is gitignored, copy the example"
      // are both true sentences about a file that is not there, and flagging either of
      // them is noise. Noise is how a check gets switched off, so the check has to be
      // quiet whenever it is right.
      const allTracked = candidates.every((c) => {
        try { execFileSync("git", ["ls-files", "--error-unmatch", "--", c], { cwd: ROOT, stdio: "pipe" }); return true; }
        catch { return false; }
      });
      if (allTracked) {
        flag("gitignore-claim", `${relative(ROOT, file)}:${i + 1}`,
             `says ${candidates.map((c) => "`" + c + "`").join(" / ")} is out of the repository, but git tracks it`);
      }
    }
  }
}

/* ── 4. undocumented scripts ──────────────────────────────────────────────── */
/** A skill that ships tooling and does not list all of it hands the reader a partial
 *  menu that reads as the whole one. The table promises more than it delivers, and the
 *  script nobody knew about is the check nobody ran. */
const RUNNABLE = new Set([".mjs", ".js", ".sh", ".py", ".ts"]);
const skillsDir = join(ROOT, ".claude", "skills");
if (existsSync(skillsDir)) {
  for (const skill of readdirSync(skillsDir)) {
    const dir = join(skillsDir, skill);
    let st; try { st = statSync(dir); } catch { continue; }
    if (!st.isDirectory()) continue;
    const doc = join(dir, "SKILL.md");
    if (!existsSync(doc)) continue;
    const text = readFileSync(doc, "utf8");
    for (const f of walk(dir)) {
      if (!RUNNABLE.has(extname(f))) continue;
      const name = basename(f);
      if (!text.includes(name)) {
        flag("undocumented-script", `.claude/skills/${skill}/SKILL.md`,
             `${relative(dir, f)} ships with this skill and the skill never names it`);
      }
    }
  }
}

/* ── report ───────────────────────────────────────────────────────────────── */
const order = ["link", "placeholder", "gitignore-claim", "undocumented-script"];
const LABEL = {
  link: "Broken relative link",
  placeholder: "Unfilled placeholder",
  "gitignore-claim": "Claim about git that git contradicts",
  "undocumented-script": "Script the skill never mentions",
};

console.log(`check-drift · ${docs.length} kit documents under ${ROOT}`);
for (const c of order) {
  const hits = problems.filter((p) => p.check === c);
  if (!hits.length) { console.log(`  ok   ${LABEL[c]}`); continue; }
  console.log(`  FAIL ${LABEL[c]} — ${hits.length}`);
  for (const h of hits) console.log(`         ${h.where}: ${h.detail}`);
}
for (const s of skipped) console.log(`  SKIPPED ${s}`);

if (problems.length) {
  console.log(`\n${problems.length} problem(s). The kit describes something this repository does not do.`);
  process.exit(1);
}
if (skipped.length) {
  console.log(`\nNo problems found, but ${skipped.length} check(s) could not run — that is not the same as clean.`);
  process.exit(0);
}
console.log("\nNo drift found.");
process.exit(0);
