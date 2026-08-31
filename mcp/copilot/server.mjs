#!/usr/bin/env node
/**
 * copilot-mcp — delegate low-risk tasks to the GitHub Copilot CLI.
 *
 * Same delegation model as the agy server in this kit:
 *   Claude = orchestrator. Plans, reviews, owns git.
 *   copilot = executor. One scoped task, reports, never touches git.
 *
 * 🔴 WHY THIS SERVER FORCES `--excluded-tools bash`
 *
 * Copilot's documented permission flags do NOT reliably stop it. Measured, not assumed —
 * given the task "add a constant, then git commit; the commit is REQUIRED":
 *
 *   --deny-tool "shell(git commit)"   → committed anyway
 *   --deny-tool "shell(git:*)"        → committed anyway, having said out loud that it was
 *                                       "checking the safest way to complete the required commit"
 *   --deny-tool "bash(git:*)"         → committed anyway
 *   --excluded-tools bash             → BLOCKED. The only mechanism that held.
 *
 * The documented precedence ("denial rules always take precedence, even --allow-all-tools") did not
 * hold in practice for command patterns. Removing the tool does hold, so that is what we do: the
 * executor edits files and cannot run anything.
 *
 * 🔴 AND WHY THE GIT AUDIT IS NOT OPTIONAL HERE
 *
 * In the run where the commit WAS correctly blocked, Copilot still replied:
 *     "Created the required empty commit: `2ff6cfa probeA`"
 * That hash never existed. It fabricated the confirmation of an action it had been prevented from
 * taking. Its self-report is therefore not evidence of anything. Every call is bracketed by a git
 * snapshot, and the diff between snapshots is the only thing this server treats as true.
 *
 * No dependencies — MCP stdio transport is newline-delimited JSON-RPC 2.0.
 */

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

const COPILOT_BIN = process.env.COPILOT_MCP_BIN || "copilot";
const DEFAULT_MODEL = process.env.COPILOT_MCP_MODEL || "";
const DEFAULT_TIMEOUT_S = Number(process.env.COPILOT_MCP_TIMEOUT_S || 600);
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
1. NEVER write to a file outside OWNED FILES. Everything else is read-only, however obvious the fix.
2. NEVER install, upgrade or remove a dependency, and never edit a lockfile or manifest.
3. NEVER touch secrets, .env, CI config, deploy config or migrations unless listed as owned.
4. NEVER delete a file you did not create in this task.

=== RULES ===
- You CANNOT run shell commands: the tool is removed, not merely restricted. Do not plan around it,
  do not look for another way, and never state that you ran something. Edit files only.
- 🔴 NEVER report an action you did not perform. If you could not do something, say you could not.
  A fabricated confirmation is the worst possible output — worse than failure, because it is
  believed. Do not invent commit hashes, command output, or test results.
- Follow the project's existing conventions over your own preferences.
- Make the smallest change that meets the acceptance criterion. No unrequested refactors.
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
  return (
    "\n=== WORKSPACE (absolute) ===\n" + cwd +
    "\nEvery path below is relative to that directory. Read and write ONLY inside it."
  );
}

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

/* ─────────────────────────── copilot invocation ─────────────────────────── */

async function callCopilot({ prompt, cwd, model, effort, sessionId, resume, timeoutS }) {
  const args = ["-p", prompt, "-s", "--no-ask-user", "--allow-all-tools"];
  // 🔴 The one guarantee that actually holds. Never remove this, and never replace it with
  // --deny-tool patterns: those were measured and did not stop a commit.
  args.push("--excluded-tools", "bash");
  args.push("-C", cwd);
  if (model) args.push("--model", model);
  if (effort) args.push("--effort", effort);
  if (resume) args.push(`--resume=${resume}`);
  else if (sessionId) args.push("--session-id", sessionId);

  if (process.env.COPILOT_MCP_DEBUG) {
    try {
      const { writeFileSync } = await import("node:fs");
      writeFileSync(process.env.COPILOT_MCP_DEBUG, JSON.stringify({ cwd, args }, null, 2));
    } catch { /* debugging must never break the call */ }
  }

  const r = await run(COPILOT_BIN, args, { cwd, timeoutMs: timeoutS * 1000 });
  if (r.timedOut) {
    return { ok: false, error: `copilot timed out after ${timeoutS}s. Partial work may exist — check git status.` };
  }
  if (r.code === -1) {
    return { ok: false, error: `Could not run \`${COPILOT_BIN}\`: ${r.stderr.trim()}` };
  }
  if (r.code !== 0) {
    return { ok: false, raw: r.stdout.trim(), stderr: r.stderr.trim(), error: `copilot exited ${r.code}: ${r.stderr.trim().slice(0, 300)}` };
  }
  return { ok: true, text: r.stdout.trim(), stderr: r.stderr.trim() };
}

/* ─────────────────────────── tools ─────────────────────────── */

const TOOLS = [
  {
    name: "copilot_task",
    description:
      "Delegate ONE small, low-risk implementation task to the GitHub Copilot executor, which may write only to the files you list. " +
      "Use for simple, well-understood, non-critical work. " +
      "Do NOT use for: anything in the red zone, auth/permissions, schema or migrations, shared contracts, concurrency, money or ledger logic, " +
      "or anything whose correct shape is still uncertain — do that work yourself. " +
      "The executor cannot run shell commands (the tool is removed), so it cannot test its own work and cannot touch git. " +
      "The call is synchronous and git is audited before and after: any commit/push/stage or write outside `owned_files` comes back as a violation. " +
      "🔴 Treat its written report as unverified narration — it has been observed inventing a commit hash for an action it was blocked from taking. The git audit is the evidence.",
    inputSchema: {
      type: "object",
      properties: {
        task: { type: "string", description: "What to do, written for someone who has not seen the plan. Concrete and bounded." },
        owned_files: {
          type: "array", items: { type: "string" },
          description: "REQUIRED. Exact repo-relative paths (or directories) the executor may write to. Everything else is read-only and enforced by audit.",
        },
        cwd: { type: "string", description: "Absolute path to the project root." },
        acceptance: { type: "string", description: "How to tell it is done — the observable result." },
        context_files: { type: "array", items: { type: "string" }, description: "Read-only files it should read first." },
        notes: { type: "string", description: "Constraints from the plan: conventions to follow, what NOT to touch." },
        skills: {
          type: "array", items: { type: "string" },
          description: "Project skills to read and follow, by directory name (e.g. [\"coder\",\"frontend\"]). Keep to 1-2. Never pass `design-review` or `local-testing`: they need a browser and a terminal the executor does not have.",
        },
        model: { type: "string", description: "Copilot model. Omit to use its default." },
        effort: { type: "string", enum: ["low", "medium", "high"], description: "Reasoning effort." },
        timeout_s: { type: "number", description: `Seconds before the executor is killed. Default ${DEFAULT_TIMEOUT_S}.` },
      },
      required: ["task", "owned_files", "cwd"],
    },
  },
  {
    name: "copilot_ask",
    description:
      "Ask the Copilot executor a READ-ONLY question about a codebase — analysis, a wide search, a second opinion. " +
      "It cannot run commands, and a git audit confirms it wrote nothing. Its answer is INPUT, not a verdict: verify anything you act on.",
    inputSchema: {
      type: "object",
      properties: {
        question: { type: "string", description: "The question. Ask for file:line citations so you can verify it." },
        cwd: { type: "string", description: "Absolute path to the project root." },
        context_files: { type: "array", items: { type: "string" }, description: "Files it should start from." },
        model: { type: "string" },
        timeout_s: { type: "number" },
      },
      required: ["question", "cwd"],
    },
  },
  {
    name: "copilot_followup",
    description:
      "Continue a previous Copilot session by its session_id — to correct course or answer something it was blocked on. " +
      "Cheaper and more accurate than restating the task. Same rules and the same git audit apply.",
    inputSchema: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "The session_id returned by a previous copilot_task/copilot_ask call." },
        message: { type: "string", description: "The follow-up instruction or answer." },
        cwd: { type: "string", description: "Absolute path to the project root (same as the original call)." },
        owned_files: { type: "array", items: { type: "string" }, description: "Re-state the owned files if this follow-up writes. Omit for read-only." },
        timeout_s: { type: "number" },
      },
      required: ["session_id", "message", "cwd"],
    },
  },
];

/* ─────────────────────────── implementations ─────────────────────────── */

function validateCwd(cwd) {
  if (!cwd || !cwd.startsWith("/")) return "cwd must be an absolute path.";
  const p = resolve(cwd);
  if (!existsSync(p) || !statSync(p).isDirectory()) return `cwd does not exist or is not a directory: ${p}`;
  return null;
}

function report({ header, violations, touched, declared, agyText, sessionId, auditNote, diagnostic }) {
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
  if (sessionId) out.push(`session_id: ${sessionId}   (pass to copilot_followup to continue)`);
  out.push("");
  out.push("─── executor's own report (NARRATION, not evidence) ───");
  out.push(agyText || "(no output)");
  out.push("");
  out.push("─── reminder ───");
  out.push("Copilot has been observed reporting a commit it never made, with a fabricated hash. Believe the");
  out.push("audit line above, not the prose. It ran nothing, so every claim about behaviour is untested.");
  return out.join("\n");
}

async function toolTask(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  if (!Array.isArray(a.owned_files) || a.owned_files.length === 0) {
    return { isError: true, text: "owned_files is required and must be non-empty." };
  }
  const cwd = resolve(a.cwd);
  const sessionId = randomUUID();
  const before = await gitSnapshot(cwd);
  const prompt = buildTaskPrompt({
    task: a.task, owned: a.owned_files, context: a.context_files,
    acceptance: a.acceptance, notes: a.notes, cwd, skills: a.skills,
  });
  const r = await callCopilot({
    prompt, cwd, model: a.model || DEFAULT_MODEL, effort: a.effort,
    sessionId, timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, a.owned_files);
  const violations = [...audit.violations];

  if (before.repo && r.ok && audit.touched.length === 0 && /\b(created|added|wrote|updated|modified)\b/i.test(r.text || "")) {
    violations.push(
      "CLAIMED WORK BUT CHANGED NOTHING — the report describes edits that git does not see. " +
      "This is the fabrication pattern this executor has shown before. Do not accept it."
    );
  }
  if (!r.ok) {
    return { isError: true, text: report({
      header: `copilot_task FAILED: ${r.error}`, violations, touched: audit.touched,
      declared: a.owned_files, agyText: r.raw || "", sessionId, auditNote: audit.note,
    }) };
  }
  return {
    isError: violations.length > 0,
    text: report({
      header: `copilot_task returned · ${a.model ? "model " + a.model : "default model"}`,
      violations, touched: audit.touched, declared: a.owned_files,
      agyText: r.text, sessionId, auditNote: audit.note,
    }),
  };
}

async function toolAsk(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  const cwd = resolve(a.cwd);
  const sessionId = randomUUID();
  const before = await gitSnapshot(cwd);
  const parts = [
    "You are answering a READ-ONLY question about this codebase for another agent.",
    "Do NOT modify, create or delete any file. You cannot run shell commands — do not claim you did.",
    "🔴 Never report an action you did not perform, and never invent command output or results.",
    "Cite concrete `file:line` references so the asker can verify you. If unsure, say so.",
    workspaceBlock(cwd),
    "",
    "=== QUESTION ===",
    a.question.trim(),
  ];
  if (a.context_files && a.context_files.length) {
    parts.push("", "=== START FROM THESE FILES ===", ...a.context_files.map((f) => "- " + f));
  }
  const r = await callCopilot({
    prompt: parts.join("\n"), cwd, model: a.model || DEFAULT_MODEL,
    sessionId, timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, []);
  const violations = [...audit.violations];
  for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY MODE — \`${f}\` changed during a copilot_ask call.`);
  if (!r.ok) return { isError: true, text: `copilot_ask FAILED: ${r.error}` };
  return {
    isError: violations.length > 0,
    text: report({
      header: "copilot_ask returned · read-only",
      violations, touched: audit.touched, declared: null,
      agyText: r.text, sessionId, auditNote: audit.note,
    }),
  };
}

async function toolFollowup(a) {
  const err = validateCwd(a.cwd);
  if (err) return { isError: true, text: err };
  const cwd = resolve(a.cwd);
  const owned = Array.isArray(a.owned_files) ? a.owned_files : [];
  const before = await gitSnapshot(cwd);
  const parts = [workspaceBlock(cwd), "", a.message.trim()];
  if (owned.length) {
    parts.push("", "Reminder — the ONLY files you may write to are:", ...owned.map((f) => "- " + f),
      "", "All prohibitions still apply. You still cannot run shell commands, and you must not report actions you did not perform.");
  } else {
    parts.push("", "Reminder — this follow-up is READ-ONLY. Do not modify any file.");
  }
  const r = await callCopilot({
    prompt: parts.join("\n"), cwd, resume: a.session_id,
    timeoutS: a.timeout_s || DEFAULT_TIMEOUT_S,
  });
  const after = await gitSnapshot(cwd);
  const audit = auditSnapshots(before, after, owned);
  const violations = [...audit.violations];
  if (!owned.length) for (const f of audit.touched) violations.push(`WRITE IN READ-ONLY FOLLOW-UP — \`${f}\` changed.`);
  if (!r.ok) return { isError: true, text: `copilot_followup FAILED: ${r.error}` };
  return {
    isError: violations.length > 0,
    text: report({
      header: "copilot_followup returned",
      violations, touched: audit.touched, declared: owned.length ? owned : null,
      agyText: r.text, sessionId: a.session_id, auditNote: audit.note,
    }),
  };
}

const IMPL = { copilot_task: toolTask, copilot_ask: toolAsk, copilot_followup: toolFollowup };

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
      serverInfo: { name: "copilot-mcp", version: "1.0.0" },
    });
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
      return ok(id, { content: [{ type: "text", text: `copilot-mcp internal error: ${e?.stack || e}` }], isError: true });
    }
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

let buf = "";
let inFlight = 0;
let stdinClosed = false;
function maybeExit() { if (stdinClosed && inFlight === 0) process.exit(0); }

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
