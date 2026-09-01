#!/usr/bin/env node
/**
 * agy-mcp — delegate low-risk tasks to the Antigravity CLI (`agy`).
 *
 * Role split this server exists to enforce:
 *   Claude = orchestrator. Talks to the human, plans, splits tasks, reviews, owns git.
 *   agy    = executor. Receives one scoped task, does it, reports. Never touches git.
 *
 * The prohibitions below are not advisory. Every write task is bracketed by a git
 * snapshot, and the diff between the two snapshots is reported as a VIOLATION when
 * the executor stepped outside its lane. Trust is not the mechanism; verification is.
 *
 * No dependencies — MCP stdio transport is newline-delimited JSON-RPC 2.0.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const AGY_BIN = process.env.AGY_MCP_BIN || "agy";
// Best of the Google line; the low-risk tier still gets a capable model (see workflows/agent-roles.md).
const DEFAULT_MODEL = process.env.AGY_MCP_MODEL || "gemini-3.7-flash-high";
const DEFAULT_TIMEOUT_S = Number(process.env.AGY_MCP_TIMEOUT_S || 600);
const PROTOCOL_FALLBACK = "2024-11-05";

/* ─────────────────────────── shell helpers ─────────────────────────── */

function run(cmd, args, { cwd, timeoutMs, input } = {}) {
  return new Promise((res) => {
    let child;
    try {
      child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
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

/** Everything we need to prove the executor stayed in its lane. */
async function gitSnapshot(cwd) {
  if (!(await isGitRepo(cwd))) return { repo: false };
  const [head, status, remotes, stash] = await Promise.all([
    git(["rev-parse", "HEAD"], cwd),
    git(["status", "--porcelain=v1", "--untracked-files=all"], cwd),
    git(["for-each-ref", "--format=%(refname) %(objectname)", "refs/remotes"], cwd),
    git(["stash", "list"], cwd),
  ]);
  const files = new Map();
  for (const line of status.stdout.split("\n")) {
    if (line.trim() === "") continue;
    // porcelain v1: XY<space>path  (path may contain " -> " for renames)
    const code = line.slice(0, 2);
    let path = line.slice(3);
    const arrow = path.indexOf(" -> ");
    if (arrow !== -1) path = path.slice(arrow + 4);
    files.set(path.replace(/^"|"$/g, ""), code);
  }
  return {
    repo: true,
    head: head.stdout.trim(),
    files,
    remotes: remotes.stdout.trim(),
    stash: stash.stdout.trim(),
  };
}

/** Normalize a user-supplied path to a repo-relative comparable form. */
function norm(p) {
  return p.replace(/^\.\//, "").replace(/\/+$/, "");
}

/** Does `file` fall under any of the owned entries (file or directory prefix)? */
function isOwned(file, owned) {
  const f = norm(file);
  return owned.some((o) => {
    const n = norm(o);
    return f === n || f.startsWith(n + "/");
  });
}

/**
 * Compare snapshots. Returns the violations the orchestrator must see, and the
 * list of files the executor actually touched.
 */
function auditSnapshots(before, after, owned) {
  const violations = [];
  const touched = [];
  if (!before.repo || !after.repo) {
    return {
      violations,
      touched,
      note: "Not a git repository — no git audit was possible. File ownership was NOT verified.",
    };
  }

  if (before.head !== after.head) {
    violations.push(
      `GIT HISTORY CHANGED — HEAD moved from ${before.head.slice(0, 8)} to ${after.head.slice(0, 8)}. ` +
      `The executor ran a commit/merge/rebase/reset. This is forbidden; git belongs to the orchestrator.`
    );
  }
  if (before.remotes !== after.remotes) {
    violations.push(
      "REMOTE REFS CHANGED — a push or fetch altered refs/remotes. Pushing is forbidden."
    );
  }
  if (before.stash !== after.stash) {
    violations.push("STASH CHANGED — the executor ran git stash. This is forbidden.");
  }

  // Which working-tree files differ between the two snapshots?
  const paths = new Set([...before.files.keys(), ...after.files.keys()]);
  for (const p of paths) {
    const b = before.files.get(p);
    const a = after.files.get(p);
    if (b === a) continue;
    touched.push(p);
    if (owned.length > 0 && !isOwned(p, owned)) {
      violations.push(`OUT-OF-SCOPE WRITE — \`${p}\` was modified but is not in the owned files list.`);
    }
  }

  // Staged changes are the orchestrator's business, not the executor's.
  for (const [p, code] of after.files) {
    const idx = code[0];
    if (idx !== " " && idx !== "?" && before.files.get(p) !== code) {
      violations.push(`STAGED CHANGE — \`${p}\` was added to the git index. Staging belongs to the orchestrator.`);
    }
  }

  return { violations, touched, note: null };
}

/* ─────────────────────────── the executor's charter ─────────────────────────── */

const CHARTER = `You are a DELEGATED EXECUTOR. Another agent planned this work, will review your
output, and talks to the human. You never talk to the human and never decide scope.

=== PROHIBITIONS (a violation fails the task even if the code is correct) ===
1. NEVER run a git command that changes state: commit, push, merge, rebase, reset, checkout,
   switch, stash, cherry-pick, tag, branch, add, restore. Read-only git (status/diff/log) is fine.
2. NEVER install, upgrade or remove a dependency, and never edit a lockfile or manifest.
3. NEVER write to a file outside OWNED FILES. Everything else is read-only, however obvious the fix.
4. NEVER touch secrets, .env, CI config, deploy config or migrations unless listed as owned.
5. NEVER delete a file you did not create in this task.

=== RULES ===
- Follow the project's existing conventions over your own preferences.
- Make the smallest change that meets the acceptance criterion. No unrequested refactors.
- 🔴 You CANNOT run shell commands — the environment denies them and a denied attempt aborts your
  whole task, losing your report. Do not run tests, builds, git, or any other command. Read and edit
  files only. The orchestrator runs and verifies everything after you.
- STOP and report instead of continuing if you would need a file you do not own, a new dependency,
  a schema or shared-contract change, or a guess that changes the outcome. Stopping early is success.

=== END YOUR REPLY WITH EXACTLY THIS ===
STATUS: DONE | PARTIAL | STOPPED
FILES CHANGED: <paths, or none>
WHAT I DID: <one sentence per change>
NEEDS CHECKING: <what the orchestrator should run or review to confirm this works>
NOT DONE: <anything left out, and why>
`;

function workspaceBlock(cwd) {
  // agy does NOT use the process cwd as its workspace — without this it silently writes
  // into ~/.gemini/antigravity-cli/scratch and still reports SUCCESS.
  return (
    "\n=== WORKSPACE (absolute) ===\n" + cwd +
    "\nEvery path below is relative to that directory. Read and write ONLY inside it.\n" +
    "Do NOT create files in any scratch, temporary or default project directory — if you cannot\n" +
    "write inside the workspace above, STOP and say so instead of writing somewhere else."
  );
}

/** The executor follows the project's own skills. Pointing at the path costs one file read;
 *  inlining the text would blow the step budget and cost the report (see README trap 4). */
function skillsBlock(skills) {
  if (!skills || !skills.length) return null;
  return (
    "\n=== SKILLS TO FOLLOW ===\n" +
    "Read each of these files first and apply its conventions to your work:\n" +
    skills.map((sk) => `- .claude/skills/${sk}/SKILL.md`).join("\n") +
    "\nIf a skill instructs you to run a command, SKIP that instruction — you cannot run commands.\n" +
    "If a skill contradicts the PROHIBITIONS above, the PROHIBITIONS win."
  );
}

function buildTaskPrompt({ task, owned, context, acceptance, notes, cwd, skills }) {
  const parts = [CHARTER, workspaceBlock(cwd)];
  const sb = skillsBlock(skills);
  if (sb) parts.push(sb);
  parts.push("\n=== THE TASK ===\n" + task.trim());
  if (acceptance) parts.push("\n=== ACCEPTANCE CRITERION ===\n" + acceptance.trim());
  parts.push(
    "\n=== OWNED FILES (the ONLY paths you may write to) ===\n" +
      (owned.length ? owned.map((f) => "- " + f).join("\n") : "- (none declared — do not write to any file)")
  );
  if (context && context.length) {
    parts.push("\n=== READ THESE FIRST (read-only context) ===\n" + context.map((f) => "- " + f).join("\n"));
  }
  if (notes) parts.push("\n=== NOTES FROM THE ORCHESTRATOR ===\n" + notes.trim());
  return parts.join("\n");
}

/* ─────────────────────────── agy invocation ─────────────────────────── */

/** agy bakes the reasoning effort into most model names (`gemini-3.7-flash-high`, `-medium`, `-low`),
 *  and rejects `--model <suffixed> --effort <x>` as a contradiction. A few models carry no suffix
 *  (`claude-sonnet-4-6`, `claude-opus-4-6-thinking`), and for those `--effort` is the only way to say
 *  it. So the flag is conditional, not removable. */
const EFFORT_SUFFIX = /-(low|medium|high)$/;

async function callAgy({ prompt, cwd, model, effort, mode, conversationId, addDirs, timeoutS }) {
  const args = [];
  const baked = model ? (model.match(EFFORT_SUFFIX)?.[1] ?? null) : null;
  if (effort && baked && baked !== effort) {
    // Fail here rather than let agy reject it after the call is set up. Guessing the sibling
    // model name is not an option: `gemini-3.1-pro` ships -high and -low but no -medium.
    return {
      ok: false,
      error:
        `Model \`${model}\` already runs at effort=${baked}, so \`effort: "${effort}"\` contradicts it and agy refuses the call. ` +
        `Pick the model variant instead — e.g. \`${model.replace(EFFORT_SUFFIX, "-" + effort)}\` — and drop \`effort\`. ` +
        `Call agy_models first: not every family has all three (gemini-3.1-pro has -high and -low, no -medium).`,
    };
  }
  if (model) args.push("--model", model);
  // Suppressed when the model name already says it — passing both is what agy rejects.
  if (effort && !baked) args.push("--effort", effort);
  if (mode) args.push("--mode", mode);
  if (conversationId) args.push("--conversation", conversationId);
  // The workspace must be added explicitly; agy ignores the process cwd.
  const dirs = new Set([cwd, ...(addDirs || [])].filter(Boolean));
  for (const d of dirs) args.push("--add-dir", d);
  args.push("--output-format", "json");
  // NOTE: `--print` swallows the next argv as its value, so it MUST be `--print=<text>`
  // and it MUST come last. This is the single most common way to call agy wrongly.
  args.push(`--print=${prompt}`);

  if (process.env.AGY_MCP_DEBUG) {
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.AGY_MCP_DEBUG, JSON.stringify({ cwd, args }, null, 2));
    } catch { /* debugging must never break the call */ }
  }
  const r = await run(AGY_BIN, args, { cwd, timeoutMs: timeoutS * 1000 });

  if (r.timedOut) {
    return { ok: false, error: `agy timed out after ${timeoutS}s. Partial work may exist in the working tree — check git status.` };
  }
  if (r.code === -1) {
    return { ok: false, error: `Could not run \`${AGY_BIN}\`: ${r.stderr.trim()}` };
  }

  // The JSON result is the last complete JSON object on stdout.
  let parsed = null;
  const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith("{")) {
      try { parsed = JSON.parse(lines[i]); break; } catch { /* keep looking */ }
    }
  }
  if (!parsed) {
    return {
      ok: r.code === 0,
      raw: r.stdout.trim(),
      stderr: r.stderr.trim(),
      error: r.code === 0 ? null : `agy exited ${r.code}: ${r.stderr.trim() || r.stdout.trim()}`,
    };
  }
  return { ok: true, parsed, stderr: r.stderr.trim() };
}

/** agy reports a denied tool permission only on stderr, and then returns CANCELED with an
 *  empty response. Untranslated, that looks like an unexplained failure. */
function diagnose(stderr) {
  if (!stderr) return null;
  if (/permission that headless mode cannot prompt for|auto-denied/i.test(stderr)) {
    const m = stderr.match(/required the "([^"]+)" permission/);
    const perm = m ? m[1] : "a tool";
    return (
      `THE EXECUTOR WAS BLOCKED BY ITS OWN PERMISSIONS — it tried to use "${perm}", which headless mode ` +
      `cannot prompt for, so agy auto-denied it and stopped mid-task.\n` +
      `  Fix: add an allow-rule to ~/.gemini/antigravity-cli/settings.json under permissions.allow, ` +
      `e.g. "command(git diff)". Grant narrow, read-only commands only.\n` +
      `  🔴 Do NOT "fix" this with --dangerously-skip-permissions: that auto-approves every tool, ` +
      `including git commit and push, which this delegation model forbids.\n` +
      `  agy stderr: ${stderr.slice(0, 400)}`
    );
  }
  return `agy stderr: ${stderr.slice(0, 400)}`;
}

function usageLine(p) {
  if (!p || !p.usage) return "";
  const u = p.usage;
  return `tokens in/out: ${u.input_tokens ?? "?"}/${u.output_tokens ?? "?"} · turns: ${p.num_turns ?? "?"} · ${
    p.duration_seconds != null ? p.duration_seconds.toFixed(1) + "s" : "?"
  }`;
}

/* ─────────────────────────── tools ─────────────────────────── */

const TOOLS = [
  {
    name: "agy_task",
    description:
      "Delegate ONE small, low-risk implementation task to the agy executor, which may write only to the files you list. " +
      "Use for simple, well-understood, non-critical work (a component tweak, a small pure function, copy changes, a straightforward test). " +
      "Do NOT use for: anything in the red zone, auth/permissions, schema or migrations, shared contracts, concurrency, money or ledger logic, " +
      "or anything whose correct shape is still uncertain — do that work yourself. " +
      "The call is synchronous and git is audited before and after: any commit/push/merge/stage or write outside `owned_files` is reported back as a violation. " +
      "The executor never commits, pushes or installs dependencies; git stays entirely yours.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What to do, written for someone who has not seen the plan. Be concrete and bounded." },
        owned_files: {
          type: "array", items: { type: "string" },
          description: "REQUIRED. Exact repo-relative paths (or directories) the executor may write to. Everything else is read-only and enforced by audit.",
        },
        cwd: { type: "string", description: "Absolute path to the project root the executor works in." },
        acceptance: { type: "string", description: "How to tell it is done — the observable result, ideally a test that must pass." },
        context_files: { type: "array", items: { type: "string" }, description: "Read-only files it should read first (the pattern to follow, the caller, the type)." },
        notes: { type: "string", description: "Constraints from the plan: conventions to follow, what NOT to touch, gotchas." },
        skills: {
          type: "array", items: { type: "string" },
          description: "Project skills the executor must read and follow, by directory name (e.g. [\"coder\"], [\"coder\",\"frontend\"]). It reads .claude/skills/<name>/SKILL.md. Keep it to 1-2 — each one costs a file read out of a limited step budget. Use `coder` for any implementation task, plus `frontend` or `backend` for the matching layer. Do NOT pass `design-review` or `local-testing`: those need a browser and a terminal, which the executor does not have — you run those yourself.",
        },
        model: { type: "string", description: `agy model. Default ${DEFAULT_MODEL} (best of the Google line). Cheaper/faster for trivial edits: gemini-3.7-flash-low.` },
        effort: { type: "string", enum: ["low", "medium", "high"], description: "Reasoning effort — ONLY for a model whose name does not already end in -low/-medium/-high. Every gemini model here bakes it into the name, so for those choose the model variant (gemini-3.7-flash-low for mechanical work) and leave this unset; passing both is refused. It applies to the unsuffixed models, e.g. claude-sonnet-4-6." },
        timeout_s: { type: "number", description: `Seconds before the executor is killed. Default ${DEFAULT_TIMEOUT_S}.` },
      },
      required: ["task", "owned_files", "cwd"],
    },
  },
  {
    name: "agy_ask",
    description:
      "Ask the agy executor a READ-ONLY question about a codebase — analysis, a broad search, a summary, a second opinion. " +
      "It runs in plan mode and writes nothing; a git audit still confirms that. " +
      "Good for offloading wide reading you would otherwise spend your own context on. " +
      "Its answer is INPUT, not a verdict: verify anything you are going to act on.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question. Ask for file:line citations so you can verify the answer." },
        cwd: { type: "string", description: "Absolute path to the project root to analyse." },
        context_files: { type: "array", items: { type: "string" }, description: "Files it should start from." },
        model: { type: "string", description: `Default ${DEFAULT_MODEL}.` },
        effort: { type: "string", enum: ["low", "medium", "high"], description: "Only for a model that does not already encode effort in its name — see agy_task's note." },
        timeout_s: { type: "number" },
      },
      required: ["question", "cwd"],
    },
  },
  {
    name: "agy_followup",
    description:
      "Continue a previous agy conversation by its conversation_id — to correct course, ask for a fix, or answer a question the executor was blocked on. " +
      "Cheaper and more accurate than restating the whole task, because the executor keeps its context. " +
      "Same rules and the same git audit apply.",
    inputSchema: {
      type: "object",
      properties: {
        conversation_id: { type: "string", description: "The conversation_id returned by a previous agy_task/agy_ask call." },
        message: { type: "string", description: "The follow-up instruction or answer." },
        cwd: { type: "string", description: "Absolute path to the project root (same as the original call)." },
        owned_files: { type: "array", items: { type: "string" }, description: "Re-state the owned files if this follow-up writes. Omit for a read-only follow-up." },
        timeout_s: { type: "number" },
      },
      required: ["conversation_id", "message", "cwd"],
    },
  },
  {
    name: "agy_models",
    description: "List the models the local agy install can use. Call this if you are unsure a model name is valid before delegating.",
    inputSchema: { type: "object", properties: {} },
  },
];

/* ─────────────────────────── tool implementations ─────────────────────────── */

function validateCwd(cwd) {
  if (!cwd || !cwd.startsWith("/")) return "cwd must be an absolute path.";
  const p = resolve(cwd);
  if (!existsSync(p) || !statSync(p).isDirectory()) return `cwd does not exist or is not a directory: ${p}`;
  return null;
}

function report({ header, violations, touched, declared, agyText, usage, conversationId, auditNote, diagnostic }) {
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
  if (conversationId) out.push(`conversation_id: ${conversationId}   (pass to agy_followup to continue)`);
  if (usage) out.push(usage);
  out.push("");
  out.push("─── executor's own report ───");
  out.push(agyText || "(no output)");
  if (!violations.length) {
    out.push("");
    out.push("─── reminder ───");
    out.push("This is a delegated result, not a reviewed one. Verify the diff before it becomes yours;");
    out.push("its 'NEEDS CHECKING' line tells you what it could not run. Committing is yours alone.");
  }
  return out.join("\n");
}

async function toolAgyTask(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  if (!Array.isArray(a.owned_files) || a.owned_files.length === 0) {
    return { isError: true, text: "owned_files is required and must be non-empty. An executor with no declared ownership has nothing it may write to." };
  }
  const cwd = resolve(a.cwd);
  const before = await gitSnapshot(cwd);
  const prompt = buildTaskPrompt({
    task: a.task,
    owned: a.owned_files,
    context: a.context_files,
    acceptance: a.acceptance,
    notes: a.notes,
    cwd,
    skills: a.skills,
  });
  const r = await callAgy({
    prompt, cwd,
    model: a.model || DEFAULT_MODEL,
    effort: a.effort,
    mode: "accept-edits",
    addDirs: [],
    timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, a.owned_files);

  if (!r.ok && r.error) {
    return {
      isError: true,
      text: report({
        header: `agy_task FAILED: ${r.error}`,
        violations: audit.violations, touched: audit.touched, declared: a.owned_files,
        agyText: r.raw || "", usage: "", conversationId: null, auditNote: audit.note,
      }),
    };
  }
  const p = r.parsed || {};
  // A task that claims success while changing nothing usually means it wrote outside the
  // workspace (agy's scratch dir) — the exact "looks like success" failure the charter forbids.
  const violations = [...audit.violations];
  if (p.status === "CANCELED") {
    violations.push(
      "EXECUTOR STOPPED EARLY — agy returned CANCELED with no report. Its work in the tree may be HALF-DONE. " +
      "See the diagnostic below for why, inspect the diff yourself, then either finish it or use agy_followup."
    );
  }
  if (before.repo && p.status === "SUCCESS" && audit.touched.length === 0) {
    violations.push(
      "REPORTED SUCCESS BUT CHANGED NOTHING — git sees no modification in the workspace. " +
      "The executor most likely wrote outside it (agy falls back to ~/.gemini/antigravity-cli/scratch), " +
      "or it did nothing at all. Do not treat this as done; check its report below for where it claims to have written."
    );
  }
  return {
    isError: violations.length > 0,
    text: report({
      header: `agy_task ${p.status || (r.ok ? "SUCCESS" : "UNKNOWN")} · model ${a.model || DEFAULT_MODEL}`,
      violations, touched: audit.touched, declared: a.owned_files,
      agyText: (p.response || r.raw || "").trim(),
      usage: usageLine(p), conversationId: p.conversation_id, auditNote: audit.note,
      diagnostic: diagnose(r.stderr),
    }),
  };
}

async function toolAgyAsk(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  const cwd = resolve(a.cwd);
  const before = await gitSnapshot(cwd);
  const parts = [
    "You are answering a READ-ONLY question about this codebase for another agent.",
    workspaceBlock(cwd),
    "Do NOT modify, create or delete any file. Do NOT run any git command that changes state.",
    "Cite concrete `file:line` references so the asker can verify you. If you are unsure, say so —",
    "an honest 'I could not determine this' is more useful than a confident guess.",
    "",
    "=== QUESTION ===",
    a.question.trim(),
  ];
  if (a.context_files && a.context_files.length) {
    parts.push("", "=== START FROM THESE FILES ===", ...a.context_files.map((f) => "- " + f));
  }
  const r = await callAgy({
    prompt: parts.join("\n"), cwd,
    model: a.model || DEFAULT_MODEL,
    effort: a.effort, mode: "plan",
    timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, []);
  // In read-only mode ANY write is a violation.
  const violations = [...audit.violations];
  for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY MODE — \`${f}\` changed during an agy_ask call.`);

  if (!r.ok && r.error) return { isError: true, text: `agy_ask FAILED: ${r.error}` };
  const p = r.parsed || {};
  return {
    isError: violations.length > 0,
    text: report({
      header: `agy_ask ${p.status || "SUCCESS"} · model ${a.model || DEFAULT_MODEL} · read-only`,
      violations, touched: audit.touched, declared: null,
      agyText: (p.response || r.raw || "").trim(),
      usage: usageLine(p), conversationId: p.conversation_id, auditNote: audit.note,
      diagnostic: diagnose(r.stderr),
    }),
  };
}

async function toolAgyFollowup(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  const cwd = resolve(a.cwd);
  const owned = Array.isArray(a.owned_files) ? a.owned_files : [];
  const before = await gitSnapshot(cwd);
  const parts = [workspaceBlock(cwd), "", a.message.trim()];
  if (owned.length) {
    parts.push("", "Reminder — the ONLY files you may write to are:", ...owned.map((f) => "- " + f),
      "", "All prohibitions from your original instructions still apply: no git state changes, no dependency changes.");
  } else {
    parts.push("", "Reminder — this follow-up is READ-ONLY. Do not modify any file.");
  }
  const r = await callAgy({
    prompt: parts.join("\n"), cwd,
    conversationId: a.conversation_id,
    mode: owned.length ? "accept-edits" : "plan",
    timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, owned);
  const violations = [...audit.violations];
  if (!owned.length) for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY FOLLOW-UP — \`${f}\` changed.`);

  if (!r.ok && r.error) return { isError: true, text: `agy_followup FAILED: ${r.error}` };
  const p = r.parsed || {};
  return {
    isError: violations.length > 0,
    text: report({
      header: `agy_followup ${p.status || "SUCCESS"}`,
      violations, touched: audit.touched, declared: owned.length ? owned : null,
      agyText: (p.response || r.raw || "").trim(),
      usage: usageLine(p), conversationId: p.conversation_id || a.conversation_id, auditNote: audit.note,
      diagnostic: diagnose(r.stderr),
    }),
  };
}

async function toolAgyModels() {
  const r = await run(AGY_BIN, ["models"], { timeoutMs: 30000 });
  if (r.code !== 0) return { isError: true, text: `Could not list models: ${r.stderr.trim() || r.stdout.trim()}` };
  return { isError: false, text: r.stdout.trim() };
}

const IMPL = {
  agy_task: toolAgyTask,
  agy_ask: toolAgyAsk,
  agy_followup: toolAgyFollowup,
  agy_models: toolAgyModels,
};

/* ─────────────────────────── JSON-RPC / stdio ─────────────────────────── */

function send(msg) { process.stdout.write(JSON.stringify(msg) + "\n"); }
const ok = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handle(msg) {
  const { id, method, params } = msg;
  if (method === "initialize") {
    return ok(id, {
      protocolVersion: params?.protocolVersion || PROTOCOL_FALLBACK,
      capabilities: { tools: {} },
      serverInfo: { name: "agy-mcp", version: "1.0.0" },
    });
  }
  if (method === "notifications/initialized" || method === "notifications/cancelled") return;
  if (method === "ping") return ok(id, {});
  if (method === "tools/list") return ok(id, { tools: TOOLS });
  if (method === "tools/call") {
    const name = params?.name;
    const impl = IMPL[name];
    if (!impl) return fail(id, -32602, `Unknown tool: ${name}`);
    try {
      const r = await impl(params.arguments || {});
      return ok(id, { content: [{ type: "text", text: r.text }], isError: !!r.isError });
    } catch (e) {
      return ok(id, { content: [{ type: "text", text: `agy-mcp internal error: ${e?.stack || e}` }], isError: true });
    }
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

let buf = "";
let inFlight = 0;
let stdinClosed = false;

/** Exit only once stdin is done AND nothing is still running — a delegated task can
 *  outlive the request that started it, and killing it mid-flight would leave the
 *  working tree half-written with no report. */
function maybeExit() {
  if (stdinClosed && inFlight === 0) process.exit(0);
}

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
