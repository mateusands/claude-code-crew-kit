/**
 * Shared core for every delegated-executor MCP server in this kit.
 *
 * The role split it enforces, whichever CLI sits behind it:
 *   orchestrator = plans, splits the work, reviews, OWNS GIT.
 *   executor     = receives one scoped task, does it, reports. Never touches git.
 *
 * The prohibitions are not advisory. Every write is bracketed by a git snapshot and
 * the difference is reported as a VIOLATION when the executor stepped outside its
 * lane. Trust is not the mechanism; verification is.
 *
 * A server built on this supplies only a BACKEND: how to invoke its CLI, how to read
 * its output, and what its containment actually is. Everything else — the charter,
 * the audit, concurrency epochs, job handles and the MCP transport — lives here, in
 * one copy. Three near-identical servers is how a rule gets fixed in one of them.
 *
 * No dependencies — MCP stdio transport is newline-delimited JSON-RPC 2.0.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const PROTOCOL_FALLBACK = "2024-11-05";

/* ─────────────────────────── shell ─────────────────────────── */

export function run(cmd, args, { cwd, timeoutMs, input, signal } = {}) {
  return new Promise((res) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"], signal });
    } catch (e) {
      return res({ code: -1, stdout: "", stderr: String(e), timedOut: false });
    }
    let stdout = "", stderr = "", timedOut = false;
    const timer = timeoutMs
      ? setTimeout(() => { timedOut = true; child.kill("SIGKILL"); }, timeoutMs)
      : null;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      res({ code: -1, stdout, stderr: stderr + String(e), timedOut });
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      res({ code, stdout, stderr, timedOut });
    });
    if (input !== undefined) child.stdin.end(input);
    else child.stdin.end();
  });
}

const git = (args, cwd) => run("git", args, { cwd, timeoutMs: 15000 });

async function isGitRepo(cwd) {
  const r = await git(["rev-parse", "--is-inside-work-tree"], cwd);
  return r.code === 0 && r.stdout.trim() === "true";
}

/* ─────────────────────────── git audit ─────────────────────────── */

/** 🔴 A status CODE is not a fingerprint. A file already at `" M"` before the executor
 *  runs is still `" M"` after it rewrites the whole thing, and a file already at `"??"`
 *  stays `"??"` — so comparing codes alone lets an unauthorised overwrite of anything
 *  the human was already editing pass completely unseen. Every path git reports is
 *  therefore fingerprinted by size and mtime as well. The set is small: only dirty and
 *  untracked paths, never the whole tree. */
function fingerprint(cwd, path) {
  try {
    const st = statSync(resolve(cwd, path), { bigint: true });
    return `${st.size}:${st.mtimeNs}`;
  } catch {
    return "absent";
  }
}

function parseStatus(cwd, stdout, into) {
  for (const line of stdout.split("\n")) {
    if (line.trim() === "") continue;
    const code = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    path = path.replace(/^"|"$/g, "");
    into.set(path, `${code}|${fingerprint(cwd, path)}`);
  }
  return into;
}

export async function gitSnapshot(cwd) {
  if (!(await isGitRepo(cwd))) return { repo: false };
  const [head, status, remotes, stash, refs, headRef] = await Promise.all([
    git(["rev-parse", "HEAD"], cwd),
    git(["status", "--porcelain=v1", "--untracked-files=all"], cwd),
    git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes"], cwd),
    git(["stash", "list"], cwd),
    // Local branches and tags: `git branch x` and `git tag x` are forbidden by the
    // charter and move neither HEAD nor the worktree, so nothing else here sees them.
    git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/heads", "refs/tags"], cwd),
    // A branch switch between two refs at the same commit leaves HEAD's hash unchanged.
    git(["symbolic-ref", "-q", "HEAD"], cwd),
  ]);
  return {
    repo: true,
    head: head.stdout.trim(),
    files: parseStatus(cwd, status.stdout, new Map()),
    remotes: remotes.stdout.trim(),
    stash: stash.stdout.trim(),
    refs: refs.stdout.trim(),
    headRef: headRef.stdout.trim(),
  };
}

/** Ignored paths never appear in `git status`, so a write into one is invisible to the
 *  audit. Scanning every ignored file is not an option — `node_modules` alone would
 *  dwarf the repository — so the scan is limited by pathspec to what this job actually
 *  declared. An owned ignored path is therefore audited; an UNDECLARED one still cannot
 *  be seen, and the report says so rather than implying coverage it does not have. */
export async function ignoredSnapshot(cwd, owned) {
  if (!owned.length || !(await isGitRepo(cwd))) return new Map();
  const r = await git(["status", "--porcelain=v1", "--untracked-files=all", "--ignored", "--", ...owned], cwd);
  return parseStatus(cwd, r.stdout, new Map());
}

const norm = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");

/** Does `file` fall under any of the owned entries (file or directory prefix)? */
export function isOwned(file, owned) {
  const f = norm(file);
  return owned.some((o) => {
    const n = norm(o);
    return f === n || f.startsWith(n + "/");
  });
}

/** Do two ownership entries cover any of the same ground, in either direction? */
const pathsOverlap = (x, y) => isOwned(x, [y]) || isOwned(y, [x]);

export function auditSnapshots(before, after, owned, ownedByOthers = []) {
  const violations = [];
  const touched = [];
  if (!before.repo || !after.repo) {
    return { violations, touched, note: "Not a git repository — no git audit was possible. File ownership was NOT verified." };
  }

  if (before.head !== after.head) {
    violations.push(
      `GIT HISTORY CHANGED — HEAD moved from ${before.head.slice(0, 8)} to ${after.head.slice(0, 8)}. ` +
      `The executor ran a commit/merge/rebase/reset. This is forbidden; git belongs to the orchestrator.`
    );
  }
  if (before.remotes !== after.remotes) violations.push("REMOTE REFS CHANGED — a push or fetch altered refs/remotes. Pushing is forbidden.");
  if (before.stash !== after.stash) violations.push("STASH CHANGED — the executor ran git stash. This is forbidden.");
  if (before.refs !== after.refs) violations.push("LOCAL REFS CHANGED — a branch or tag was created, moved or deleted. Branching and tagging belong to the orchestrator.");
  if (before.headRef !== after.headRef) violations.push("BRANCH SWITCHED — HEAD now points at a different ref. Checkout and switch are forbidden.");

  const paths = new Set([...before.files.keys(), ...after.files.keys()]);
  for (const p of paths) {
    if (before.files.get(p) === after.files.get(p)) continue;
    // Another job running in this repo declared this file. Its write is that job's
    // business and is audited in that job's own report — crediting it here would
    // manufacture a violation out of legitimate parallel work.
    if (isOwned(p, ownedByOthers)) continue;
    touched.push(p);
    if (owned.length > 0 && !isOwned(p, owned)) {
      violations.push(`OUT-OF-SCOPE WRITE — \`${p}\` was modified but is not in the owned files list.`);
    }
  }

  for (const [p, code] of after.files) {
    const idx = code[0];
    if (idx !== " " && idx !== "?" && before.files.get(p) !== code) {
      violations.push(`STAGED CHANGE — \`${p}\` was added to the git index. Staging belongs to the orchestrator.`);
    }
  }

  return { violations, touched, note: null };
}

/* ─────────────────────────── concurrency epochs ───────────────────────────
 * Several delegated jobs may run in one repository at once. Bracketing each call
 * with its own before/after snapshot cannot survive that: one job's `after`
 * contains the other's legitimate writes, and each accuses the other.
 *
 * So the snapshot is per EPOCH. An epoch opens when a job starts with none already
 * running, and every job in it audits against that one baseline. A changed path is
 * attributed to whichever job declared it; a path nobody declared is a violation
 * reported to all of them, because attribution is impossible and silence is worse.
 *
 * Finished jobs stay in `owners`: their writes must keep being excluded from the
 * reports of jobs still running.
 */

const EPOCHS = new Map();
let JOB_SEQ = 0;

/** 🔴 Synchronous up to and including registration. An earlier version awaited the
 *  baseline before adding the job to `active`, and a second call arriving during that
 *  await saw an empty registry and opened a competing epoch — so each job audited
 *  against its own baseline and the false accusations came back. Check-then-act must
 *  not straddle an await here. The baseline is shared as a PROMISE; callers await it
 *  before letting the executor run, or a fast executor writes before the snapshot and
 *  its change never reaches the audit at all. */
export function beginJob(cwd, owned) {
  let epoch = EPOCHS.get(cwd);
  if (!epoch || epoch.active.size === 0) {
    epoch = { baselineP: gitSnapshot(cwd), active: new Set(), owners: new Map() };
    EPOCHS.set(cwd, epoch);
  } else {
    for (const id of epoch.active) {
      const theirs = epoch.owners.get(id) || [];
      for (const mine of owned) {
        const clash = theirs.find((t) => pathsOverlap(mine, t));
        if (clash) {
          // Refuse rather than queue: a queue turns "parallel" into "serial" without
          // saying so, and the orchestrator plans around throughput that is not there.
          return {
            error:
              `OWNERSHIP CONFLICT — \`${mine}\` overlaps \`${clash}\`, already owned by job #${id} running in this repository. ` +
              `Two jobs may not share a file: the audit could not tell you which one wrote it. ` +
              `Wait for job #${id}, or split the work so each job owns a disjoint set.`,
          };
        }
      }
    }
  }
  const id = ++JOB_SEQ;
  epoch.active.add(id);
  epoch.owners.set(id, owned);
  return { id, epoch };
}

export function othersOwned(epoch, id) {
  const out = [];
  for (const [other, owned] of epoch.owners) if (other !== id) out.push(...owned);
  return out;
}

/** 🔴 Must run on EVERY exit path, including a throw. When this was reachable only
 *  through the success path, an exception after registration left the id in `active`
 *  forever — and every later job claiming that path failed with an ownership conflict
 *  for the life of the process. Callers wrap the work in try/finally. */
export function endJob(epoch, id) {
  epoch.active.delete(id);
  // The epoch is over. Dropping it keeps EPOCHS from growing one entry per workspace
  // for the life of the server; the next job opens a fresh one with a fresh baseline.
  if (epoch.active.size === 0) {
    for (const [cwd, e] of EPOCHS) if (e === epoch) EPOCHS.delete(cwd);
  }
}

export function validateCwd(cwd) {
  if (!cwd || !cwd.startsWith("/")) return "cwd must be an absolute path.";
  const p = resolve(cwd);
  if (!existsSync(p) || !statSync(p).isDirectory()) return `cwd does not exist or is not a directory: ${p}`;
  return null;
}

/* ─────────────────────────── the executor's charter ─────────────────────────── */

export function charter({ canRunCommands }) {
  return `You are a DELEGATED EXECUTOR. Another agent planned this work, will review your
output, and talks to the human. You never talk to the human and never decide scope.

=== PROHIBITIONS (a violation fails the task even if the code is correct) ===
1. NEVER run a git command that changes state: commit, push, merge, rebase, reset, checkout,
   switch, stash, cherry-pick, tag, branch, add, restore. Read-only git (status/diff/log) is fine.
2. NEVER install, upgrade or remove a dependency, and never edit a lockfile or manifest.
3. NEVER write to a file outside OWNED FILES. Everything else is read-only, however obvious the fix.
4. NEVER touch secrets, .env, CI config, deploy config or migrations unless listed as owned.
5. NEVER delete a file you did not create in this task.
6. NEVER report an action you did not perform. Do not invent commit hashes, command output or test
   results. "I could not do this" is always a better answer than a plausible fiction.

=== RULES ===
- Follow the project's existing conventions over your own preferences.
- Make the smallest change that meets the acceptance criterion. No unrequested refactors.
${canRunCommands
  ? `- You MAY run read-only commands to check your work. You may NOT run git state changes,
  installs, or anything that reaches the network.`
  : `- 🔴 You CANNOT run shell commands — the environment denies them and a denied attempt aborts your
  whole task, losing your report. Do not run tests, builds, git, or any other command. Read and edit
  files only. The orchestrator runs and verifies everything after you.`}
- STOP and report instead of continuing if you would need a file you do not own, a new dependency,
  a schema or shared-contract change, or a guess that changes the outcome. Stopping early is success.

=== END YOUR REPLY WITH EXACTLY THIS ===
STATUS: DONE | PARTIAL | STOPPED
FILES CHANGED: <paths, or none>
WHAT I DID: <one sentence per change>
NEEDS CHECKING: <what the orchestrator should run or review to confirm this works>
NOT DONE: <anything left out, and why>
`;
}

function workspaceBlock(cwd) {
  return (
    "\n=== WORKSPACE (absolute) ===\n" + cwd +
    "\nEvery path below is relative to that directory. Read and write ONLY inside it.\n" +
    "Do NOT create files in any scratch, temporary or default project directory — if you cannot\n" +
    "write inside the workspace above, STOP and say so instead of writing somewhere else."
  );
}

/** The executor follows the project's own skills. Pointing at the path costs one file read;
 *  inlining the text would blow the step budget and cost the report. */
function skillsBlock(skills, canRunCommands) {
  if (!skills || !skills.length) return null;
  return (
    "\n=== SKILLS TO FOLLOW ===\n" +
    "Read each of these files first and apply its conventions to your work:\n" +
    skills.map((sk) => `- .claude/skills/${sk}/SKILL.md`).join("\n") +
    (canRunCommands ? "" : "\nIf a skill instructs you to run a command, SKIP that instruction — you cannot run commands.") +
    "\nIf a skill contradicts the PROHIBITIONS above, the PROHIBITIONS win."
  );
}

function buildTaskPrompt(b, { task, owned, context, acceptance, notes, cwd, skills }) {
  const parts = [charter(b), workspaceBlock(cwd)];
  const sb = skillsBlock(skills, b.canRunCommands);
  if (sb) parts.push(sb);
  parts.push("\n=== THE TASK ===\n" + task.trim());
  if (acceptance) parts.push("\n=== ACCEPTANCE CRITERION ===\n" + acceptance.trim());
  parts.push(
    "\n=== OWNED FILES (the ONLY paths you may write to) ===\n" +
      (owned.length ? owned.map((f) => "- " + f).join("\n") : "- (none declared — do not write to any file)")
  );
  if (context && context.length) parts.push("\n=== READ THESE FIRST (read-only context) ===\n" + context.map((f) => "- " + f).join("\n"));
  if (notes) parts.push("\n=== NOTES FROM THE ORCHESTRATOR ===\n" + notes.trim());
  return parts.join("\n");
}

function report(b, { header, violations, touched, declared, execText, usage, resumeId, auditNote, diagnostic }) {
  const out = [];
  if (violations.length) {
    out.push("🔴 CHARTER VIOLATIONS — do not accept this result as-is:");
    for (const v of violations) out.push("  • " + v);
    out.push("");
    out.push("Review the working tree yourself before doing anything else. `git diff` is the ground truth,");
    out.push("not the executor's report below.");
    out.push("");
  }
  out.push(header);
  if (diagnostic) { out.push(""); out.push("⚠️  " + diagnostic); out.push(""); }
  if (auditNote) out.push("⚠️  " + auditNote);
  out.push(`FILES ACTUALLY CHANGED (from git, not self-reported): ${touched.length ? touched.join(", ") : "none"}`);
  if (declared && declared.length) out.push(`FILES IT WAS ALLOWED TO CHANGE: ${declared.join(", ")}`);
  if (resumeId) out.push(`${b.resumeIdLabel}: ${resumeId}   (pass to ${b.name}_followup to continue)`);
  if (usage) out.push(usage);
  out.push("");
  out.push("─── executor's own report ───");
  out.push(execText || "(no output)");
  if (!violations.length) {
    out.push("");
    out.push("─── reminder ───");
    out.push("This is a delegated result, not a reviewed one. Verify the diff before it becomes yours;");
    out.push("its 'NEEDS CHECKING' line tells you what it could not run. Committing is yours alone.");
  }
  return out.join("\n");
}

/* ─────────────────────────── calling the backend ─────────────────────────── */

async function callExecutor(b, opts) {
  const built = b.buildArgs(opts);
  if (built.error) return { ok: false, error: built.error };

  if (process.env[`${b.name.toUpperCase()}_MCP_DEBUG`]) {
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env[`${b.name.toUpperCase()}_MCP_DEBUG`], JSON.stringify({ cwd: opts.cwd, args: built.args }, null, 2));
    } catch { /* debugging must never break the call */ }
  }

  const r = await run(b.bin, built.args, { cwd: opts.cwd, timeoutMs: opts.timeoutS * 1000, signal: opts.signal, input: built.input });

  if (opts.signal?.aborted) {
    return { ok: false, cancelled: true, error: `Cancelled by ${b.name}_cancel. Partial work may exist in the working tree — read the diff before doing anything else.` };
  }
  if (r.timedOut) return { ok: false, error: `${b.name} timed out after ${opts.timeoutS}s. Partial work may exist in the working tree — check git status.` };
  if (r.code === -1) return { ok: false, error: `Could not run \`${b.bin}\`: ${r.stderr.trim()}` };
  return { ok: r.code === 0, ...b.parseResult(r), stderr: r.stderr.trim(), code: r.code };
}

/* ─────────────────────────── job handles ───────────────────────────
 * `<name>_task` blocks for as long as the executor runs. `<name>_start` returns a
 * handle instead, so the orchestrator can fan several slices out and keep working.
 *
 * A handle alone never tells you the work finished — an MCP server cannot wake its
 * client, so `<name>_status` only answers when someone thinks to ask. That is what
 * `<name>_await` is for: it blocks on work that is ALREADY running, so the client's
 * own backgrounding turns it into a notification. Starting costs nothing and waiting
 * costs no wall clock.
 *
 * Records live in memory and die with the process. A lost handle degrades to reading
 * the diff, which the orchestrator owes the task regardless.
 */

const JOBS = new Map();
let HANDLE_SEQ = 0;

/** Completed handles keep their full executor report and their AbortController. A
 *  long-lived server that runs many jobs would grow JOBS without bound, so finished
 *  records past the most recent MAX_JOBS are dropped; a handle that old has long since
 *  been read, and a lost one degrades to reading the diff. */
const MAX_JOBS = 50;
function reapJobs() {
  const done = [...JOBS.values()].filter((j) => j.state !== "working");
  for (const rec of done.slice(0, Math.max(0, done.length - MAX_JOBS))) JOBS.delete(rec.id);
}

const elapsed = (rec) => Math.round(((rec.finishedAt ?? Date.now()) - rec.startedAt) / 1000);
const runningJobs = () => [...JOBS.values()].filter((j) => j.state === "working");
const jobLine = (rec) => `${rec.id} · ${rec.state} · ${elapsed(rec)}s · owns ${rec.owned.join(", ")}`;

/* ─────────────────────────── the tools ─────────────────────────── */

function makeTools(b) {
  const taskSchema = {
    type: "object",
    properties: {
      task: { type: "string", description: "What to do, written for someone who has not seen the plan. Be concrete and bounded." },
      owned_files: { type: "array", items: { type: "string" }, description: "REQUIRED. Exact repo-relative paths (or directories) the executor may write to. Everything else is read-only and enforced by audit." },
      cwd: { type: "string", description: "Absolute path to the project root the executor works in." },
      acceptance: { type: "string", description: "How to tell it is done — the observable result, ideally a test that must pass." },
      context_files: { type: "array", items: { type: "string" }, description: "Read-only files it should read first (the pattern to follow, the caller, the type)." },
      notes: { type: "string", description: "Constraints from the plan: conventions to follow, what NOT to touch, gotchas." },
      skills: { type: "array", items: { type: "string" }, description: `Project skills the executor must read and follow, by directory name (e.g. ["coder"], ["coder","frontend"]). Keep it to 1-2. Use \`coder\` for any implementation task plus \`frontend\` or \`backend\` for the layer. Do NOT pass \`design-review\` or \`local-testing\`: they need a browser and a terminal the executor does not have.` },
      ...b.extraTaskProps,
      timeout_s: { type: "number", description: `Seconds before the executor is killed. Default ${b.defaultTimeoutS}.` },
    },
    required: ["task", "owned_files", "cwd"],
  };

  const delegationRules =
    "Use for simple, well-understood, non-critical work (a component tweak, a small pure function, copy changes, a straightforward test). " +
    "Do NOT use for: anything in the red zone, auth/permissions, schema or migrations, shared contracts, concurrency, money or ledger logic, " +
    "or anything whose correct shape is still uncertain — do that work yourself. " +
    "git is audited before and after: any commit/push/merge/stage or write outside `owned_files` comes back as a violation. " +
    "The executor never commits, pushes or installs dependencies; git stays entirely yours.";

  const tools = [
    { name: `${b.name}_task`, description: `Delegate ONE small, low-risk implementation task to the ${b.name} executor, which may write only to the files you list. ${delegationRules} This call BLOCKS until it finishes — use ${b.name}_start to fan out instead.`, inputSchema: taskSchema },
    { name: `${b.name}_start`, description: `Start a delegated task and get a HANDLE back immediately instead of waiting. Same rules, charter and git audit as ${b.name}_task. Use it to fan several disjoint slices out at once, or whenever you want to keep working — or keep talking to the human — while the executor runs. Two jobs may not declare overlapping files: the audit could not then say which one wrote what, so the second call is refused. 🔴 The handle says the executor STARTED and nothing more; the work is unverified until you read its report with ${b.name}_await, and then read the diff yourself.`, inputSchema: taskSchema },
    { name: `${b.name}_await`, description: `Wait for jobs started with ${b.name}_start and return their full reports, audit included. Omit job_ids to wait for every job still running. It blocks, and your host may move it to the background and notify you when it settles. Waiting costs no wall clock: the executors have been running since ${b.name}_start.`, inputSchema: { type: "object", properties: { job_ids: { type: "array", items: { type: "string" }, description: "Handles. Omit to wait for all running jobs." } } } },
    { name: `${b.name}_status`, description: "Peek at delegated jobs without waiting — state, elapsed seconds and declared ownership. Omit job_id to list them all. Never blocks.", inputSchema: { type: "object", properties: { job_id: { type: "string" } } } },
    { name: `${b.name}_result`, description: "Read a finished job's report again without waiting. Says so if the job is still running.", inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
    { name: `${b.name}_cancel`, description: "Kill a running job. 🔴 Whatever the executor already wrote STAYS in the working tree, half-done — cancelling is not undoing. Read the diff afterwards.", inputSchema: { type: "object", properties: { job_id: { type: "string" } }, required: ["job_id"] } },
    { name: `${b.name}_ask`, description: `Ask the ${b.name} executor a READ-ONLY question about a codebase — analysis, a broad search, a summary, a second opinion. It writes nothing, and a git audit confirms that. Good for offloading wide reading you would otherwise spend your own context on. Its answer is INPUT, not a verdict: verify anything you are going to act on.`, inputSchema: { type: "object", properties: { question: { type: "string", description: "The question. Ask for file:line citations so you can verify the answer." }, cwd: { type: "string" }, context_files: { type: "array", items: { type: "string" } }, ...b.extraTaskProps, timeout_s: { type: "number" } }, required: ["question", "cwd"] } },
    { name: `${b.name}_followup`, description: `Continue a previous ${b.name} conversation by its ${b.resumeIdLabel} — to correct course, ask for a fix, or answer a question the executor was blocked on. Cheaper and more accurate than restating the whole task, because the executor keeps its context. Same rules and the same git audit apply.`, inputSchema: { type: "object", properties: { [b.resumeIdLabel]: { type: "string" }, message: { type: "string" }, cwd: { type: "string" }, owned_files: { type: "array", items: { type: "string" }, description: "Re-state the owned files if this follow-up writes. Omit for a read-only follow-up." }, timeout_s: { type: "number" } }, required: [b.resumeIdLabel, "message", "cwd"] } },
  ];
  if (b.modelsArgs) {
    tools.push({ name: `${b.name}_models`, description: `List the models the local ${b.name} install can use. Call this if you are unsure a model name is valid before delegating.`, inputSchema: { type: "object", properties: {} } });
  }
  return tools;
}

/* ─────────────────────────── implementations ─────────────────────────── */

function makeImpl(b) {
  /** Validate, open an epoch slot and take the baseline. Shared by the blocking and the
   *  handle-returning entry points so they cannot drift apart on the audit. */
  async function prepare(a, owned) {
    const err = validateCwd(a.cwd);
    if (err) return { error: err };
    const cwd = resolve(a.cwd);
    const job = beginJob(cwd, owned);
    if (job.error) return { error: job.error };
    // Registration above is synchronous so two jobs cannot open competing epochs;
    // the baseline must nonetheless be COMPLETE before the executor may write, or a
    // fast executor lands its change before the snapshot and the audit never sees it.
    const before = await job.epoch.baselineP;
    const ignoredBefore = await ignoredSnapshot(cwd, owned);
    return { cwd, job, before, ignoredBefore };
  }

  async function finish(prep, owned, after) {
    const audit = auditSnapshots(prep.before, after, owned, othersOwned(prep.job.epoch, prep.job.id));
    // Owned paths that git ignores are invisible to the snapshot above, so they get
    // their own pathspec-limited comparison. Without this, writing a report into an
    // ignored directory reads as "reported success but changed nothing".
    const ignoredAfter = await ignoredSnapshot(prep.cwd, owned);
    for (const [path, fp] of ignoredAfter) {
      if (prep.ignoredBefore.get(path) === fp) continue;
      if (!audit.touched.includes(path)) audit.touched.push(path);
    }
    for (const path of prep.ignoredBefore.keys()) {
      if (!ignoredAfter.has(path) && !audit.touched.includes(path)) audit.touched.push(path);
    }
    if (ignoredAfter.size || prep.ignoredBefore.size) {
      audit.note = (audit.note ? audit.note + " " : "") +
        "Some owned paths are gitignored and were audited by pathspec. A write to an UNDECLARED ignored path (a build directory, .env) cannot be seen by this audit at all.";
    }
    return audit;
  }

  /** 🔴 The epoch slot is released here and only here, so a throw cannot strand it. */
  async function guarded(prep, fn) {
    try { return await fn(); }
    finally { endJob(prep.job.epoch, prep.job.id); }
  }

  async function runTask(a, prep, signal) {
    const prompt = buildTaskPrompt(b, {
      task: a.task, owned: a.owned_files, context: a.context_files,
      acceptance: a.acceptance, notes: a.notes, cwd: prep.cwd, skills: a.skills,
    });
    const r = await callExecutor(b, { prompt, cwd: prep.cwd, mode: "write", timeoutS: a.timeout_s || b.defaultTimeoutS, signal, ...b.callOpts(a) });
    const after = await gitSnapshot(prep.cwd);
    const audit = await finish(prep, a.owned_files, after);

    if (!r.ok && r.error) {
      return { isError: true, text: report(b, { header: `${b.name}_task FAILED: ${r.error}`, violations: audit.violations, touched: audit.touched, declared: a.owned_files, execText: r.text || "", usage: "", resumeId: null, auditNote: audit.note }) };
    }
    const violations = [...audit.violations];
    if (r.status === "CANCELED") {
      violations.push(`EXECUTOR STOPPED EARLY — ${b.name} returned CANCELED with no report. Its work in the tree may be HALF-DONE. See the diagnostic below, inspect the diff yourself, then either finish it or use ${b.name}_followup.`);
    }
    if (prep.before.repo && r.ok && audit.touched.length === 0) {
      violations.push(`REPORTED SUCCESS BUT CHANGED NOTHING — git sees no modification in the workspace. ${b.scratchWarning} Do not treat this as done; check its report below for where it claims to have written.`);
    }
    return {
      isError: violations.length > 0,
      text: report(b, { header: `${b.name}_task ${r.status || (r.ok ? "SUCCESS" : "UNKNOWN")}`, violations, touched: audit.touched, declared: a.owned_files, execText: (r.text || "").trim(), usage: r.usage, resumeId: r.resumeId, auditNote: audit.note, diagnostic: b.diagnose?.(r.stderr) }),
    };
  }

  const needOwned = (a) =>
    !Array.isArray(a.owned_files) || a.owned_files.length === 0
      ? "owned_files is required and must be non-empty. An executor with no declared ownership has nothing it may write to."
      : null;

  return {
    [`${b.name}_task`]: async (a) => {
      const bad = needOwned(a); if (bad) return { isError: true, text: bad };
      const prep = await prepare(a, a.owned_files);
      if (prep.error) return { isError: true, text: prep.error };
      return guarded(prep, () => runTask(a, prep));
    },

    [`${b.name}_start`]: async (a) => {
      const bad = needOwned(a); if (bad) return { isError: true, text: bad };
      const prep = await prepare(a, a.owned_files);
      if (prep.error) return { isError: true, text: prep.error };
      const id = `job-${++HANDLE_SEQ}`;
      const ctrl = new AbortController();
      const rec = { id, state: "working", cwd: prep.cwd, owned: a.owned_files, startedAt: Date.now(), finishedAt: null, result: null, ctrl };
      rec.promise = runTask(a, prep, ctrl.signal)
        .then((r) => { rec.result = r; rec.state = ctrl.signal.aborted ? "cancelled" : r.isError ? "failed" : "completed"; })
        .catch((e) => { rec.result = { isError: true, text: `${b.name}-mcp internal error: ${e?.stack || e}` }; rec.state = "failed"; })
        .finally(() => {
          rec.finishedAt = Date.now();
          endJob(prep.job.epoch, prep.job.id);
          reapJobs();
          maybeExit();
        });
      JOBS.set(id, rec);
      return { isError: false, text: `STARTED ${id} — owns ${a.owned_files.join(", ")}\n\nThe executor is running. Nothing about this result says the work is correct or even started well.\nCall ${b.name}_await with this id when you want the report; ${b.name}_status to peek without waiting.` };
    },

    [`${b.name}_await`]: async (a) => {
      const ids = Array.isArray(a.job_ids) && a.job_ids.length ? a.job_ids : runningJobs().map((j) => j.id);
      if (!ids.length) return { isError: false, text: "Nothing to wait for." };
      const missing = ids.filter((id) => !JOBS.has(id));
      if (missing.length) return { isError: true, text: `No such job: ${missing.join(", ")}. Handles die with the server process.` };
      const recs = ids.map((id) => JOBS.get(id));
      await Promise.all(recs.map((r) => r.promise));
      return { isError: recs.some((r) => r.result?.isError), text: recs.map((r) => `═══ ${jobLine(r)} ═══\n${r.result?.text ?? "(no report)"}`).join("\n\n") };
    },

    [`${b.name}_status`]: (a) => {
      if (a.job_id) {
        const rec = JOBS.get(a.job_id);
        return rec ? { isError: false, text: jobLine(rec) } : { isError: true, text: `No such job: ${a.job_id}. Handles die with the server process.` };
      }
      if (JOBS.size === 0) return { isError: false, text: "No jobs in this session." };
      return { isError: false, text: [...JOBS.values()].map(jobLine).join("\n") };
    },

    [`${b.name}_result`]: (a) => {
      const rec = JOBS.get(a.job_id);
      if (!rec) return { isError: true, text: `No such job: ${a.job_id}. Handles die with the server process.` };
      if (rec.state === "working") return { isError: false, text: `${jobLine(rec)}\n\nStill running — use ${b.name}_await to wait for it.` };
      return rec.result ?? { isError: true, text: `${rec.id} finished as ${rec.state} with no report.` };
    },

    [`${b.name}_cancel`]: (a) => {
      const rec = JOBS.get(a.job_id);
      if (!rec) return { isError: true, text: `No such job: ${a.job_id}.` };
      if (rec.state !== "working") return { isError: false, text: `${rec.id} already ${rec.state}; nothing to cancel.` };
      rec.ctrl.abort();
      return { isError: false, text: `Cancelling ${rec.id}. The executor is killed mid-flight, so whatever it had already written STAYS in the working tree, half-done. Read the diff before doing anything else; ${b.name}_await still returns its audit.` };
    },

    [`${b.name}_ask`]: async (a) => {
      const prep = await prepare(a, []);
      if (prep.error) return { isError: true, text: prep.error };
      return guarded(prep, async () => {
      const parts = [
        "You are answering a READ-ONLY question about this codebase for another agent.",
        workspaceBlock(prep.cwd),
        "Do NOT modify, create or delete any file. Do NOT run any git command that changes state.",
        "Cite concrete `file:line` references so the asker can verify you. If you are unsure, say so —",
        "an honest 'I could not determine this' is more useful than a confident guess.",
        "", "=== THE QUESTION ===", a.question.trim(),
      ];
      if (a.context_files?.length) parts.push("", "=== START FROM THESE FILES ===", ...a.context_files.map((f) => "- " + f));
      const r = await callExecutor(b, { prompt: parts.join("\n"), cwd: prep.cwd, mode: "read", timeoutS: a.timeout_s || b.defaultTimeoutS, ...b.callOpts(a) });
      const after = await gitSnapshot(prep.cwd);
      const audit = await finish(prep, [], after);
      const violations = [...audit.violations];
      // In read-only mode ANY write is a violation.
      for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY MODE — \`${f}\` changed during a ${b.name}_ask call.`);
      if (!r.ok && r.error) return { isError: true, text: `${b.name}_ask FAILED: ${r.error}` };
      return { isError: violations.length > 0, text: report(b, { header: `${b.name}_ask ${r.status || "SUCCESS"} · read-only`, violations, touched: audit.touched, declared: null, execText: (r.text || "").trim(), usage: r.usage, resumeId: r.resumeId, auditNote: audit.note, diagnostic: b.diagnose?.(r.stderr) }) };
      });
    },

    [`${b.name}_followup`]: async (a) => {
      const owned = Array.isArray(a.owned_files) ? a.owned_files : [];
      const prep = await prepare(a, owned);
      if (prep.error) return { isError: true, text: prep.error };
      return guarded(prep, async () => {
      const parts = [workspaceBlock(prep.cwd), "", a.message.trim()];
      if (owned.length) {
        parts.push("", "Reminder — the ONLY files you may write to are:", ...owned.map((f) => "- " + f), "", "All prohibitions from your original instructions still apply: no git state changes, no dependency changes.");
      } else {
        parts.push("", "Reminder — this follow-up is READ-ONLY. Do not modify any file.");
      }
      const r = await callExecutor(b, { prompt: parts.join("\n"), cwd: prep.cwd, mode: owned.length ? "write" : "read", resumeId: a[b.resumeIdLabel], timeoutS: a.timeout_s || b.defaultTimeoutS, ...b.callOpts(a) });
      const after = await gitSnapshot(prep.cwd);
      const audit = await finish(prep, owned, after);
      const violations = [...audit.violations];
      if (!owned.length) for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY MODE — \`${f}\` changed during a read-only follow-up.`);
      if (!r.ok && r.error) return { isError: true, text: `${b.name}_followup FAILED: ${r.error}` };
      return { isError: violations.length > 0, text: report(b, { header: `${b.name}_followup ${r.status || "SUCCESS"}`, violations, touched: audit.touched, declared: owned, execText: (r.text || "").trim(), usage: r.usage, resumeId: r.resumeId, auditNote: audit.note, diagnostic: b.diagnose?.(r.stderr) }) };
      });
    },

    ...(b.modelsArgs ? { [`${b.name}_models`]: async () => {
      const r = await run(b.bin, b.modelsArgs, { timeoutMs: 30000 });
      if (r.code !== 0) return { isError: true, text: `Could not list models: ${r.stderr.trim() || r.stdout.trim()}` };
      return { isError: false, text: r.stdout.trim() };
    } } : {}),
  };
}

/* ─────────────────────────── MCP stdio transport ─────────────────────────── */

let stdinClosed = false;
let inFlight = 0;

/** A job started with `<name>_start` outlives the request that created it, so inFlight
 *  alone would let the process exit while an executor is still writing — leaving a
 *  half-written tree and no report at all. */
function maybeExit() {
  if (stdinClosed && inFlight === 0 && runningJobs().length === 0) process.exit(0);
}

export function serve(b) {
  const TOOLS = makeTools(b);
  const IMPL = makeImpl(b);
  const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
  const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
  const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

  async function handle(msg) {
    const { id, method, params } = msg;
    if (method === "initialize") {
      return ok(id, { protocolVersion: params?.protocolVersion || PROTOCOL_FALLBACK, capabilities: { tools: {} }, serverInfo: { name: `${b.name}-mcp`, version: b.version } });
    }
    if (method === "notifications/initialized" || method === "notifications/cancelled") return;
    if (method === "ping") return ok(id, {});
    if (method === "tools/list") return ok(id, { tools: TOOLS });
    if (method === "tools/call") {
      const impl = IMPL[params?.name];
      if (!impl) return fail(id, -32602, `Unknown tool: ${params?.name}`);
      try {
        const r = await impl(params.arguments || {});
        return ok(id, { content: [{ type: "text", text: r.text }], isError: !!r.isError });
      } catch (e) {
        return ok(id, { content: [{ type: "text", text: `${b.name}-mcp internal error: ${e?.stack || e}` }], isError: true });
      }
    }
    if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
  }

  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      inFlight++;
      Promise.resolve(handle(msg))
        .catch((e) => { if (msg?.id !== undefined) fail(msg.id, -32603, String(e)); })
        .finally(() => { inFlight--; maybeExit(); });
    }
  });
  process.stdin.on("end", () => { stdinClosed = true; maybeExit(); });
}
