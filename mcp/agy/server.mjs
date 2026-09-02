#!/usr/bin/env node
/**
 * agy-mcp — delegate low-risk tasks to the Antigravity CLI (`agy`).
 *
 * Everything general — the charter, the git audit, concurrency epochs, job handles
 * and the MCP transport — lives in ../lib/core.mjs. What is here is only what makes
 * agy agy: how to invoke it, how to read its output, and the traps measured on it.
 */

import { serve } from "../lib/core.mjs";

const BIN = process.env.AGY_MCP_BIN || "agy";
// Best of the Google line; the low-risk tier still gets a capable model (see workflows/agent-roles.md).
const DEFAULT_MODEL = process.env.AGY_MCP_MODEL || "gemini-3.7-flash-high";
const DEFAULT_TIMEOUT_S = Number(process.env.AGY_MCP_TIMEOUT_S || 600);

/** agy bakes the reasoning effort into most model names (`gemini-3.7-flash-high`, `-medium`,
 *  `-low`) and rejects `--model <suffixed> --effort <x>` as a contradiction. A few models carry
 *  no suffix (`claude-sonnet-4-6`, `claude-opus-4-6-thinking`), and for those `--effort` is the
 *  only way to say it. So the flag is conditional, not removable. */
const EFFORT_SUFFIX = /-(low|medium|high)$/;

serve({
  name: "agy",
  version: "2.0.0",
  bin: BIN,
  defaultTimeoutS: DEFAULT_TIMEOUT_S,
  resumeIdLabel: "conversation_id",
  // agy cannot run shell commands under this wrapper's permission model.
  canRunCommands: false,
  scratchWarning: "The executor most likely wrote outside it (agy falls back to ~/.gemini/antigravity-cli/scratch), or it did nothing at all.",
  modelsArgs: ["models"],

  extraTaskProps: {
    model: { type: "string", description: `agy model. Default ${DEFAULT_MODEL} (best of the Google line). Cheaper/faster for trivial edits: gemini-3.7-flash-low.` },
    effort: { type: "string", enum: ["low", "medium", "high"], description: "Reasoning effort — ONLY for a model whose name does not already end in -low/-medium/-high. Every gemini model here bakes it into the name, so for those choose the model variant (gemini-3.7-flash-low for mechanical work) and leave this unset; passing both is refused. It applies to the unsuffixed models, e.g. claude-sonnet-4-6." },
  },
  callOpts: (a) => ({ model: a.model || DEFAULT_MODEL, effort: a.effort }),

  buildArgs({ prompt, cwd, model, effort, mode, resumeId }) {
    const baked = model ? (model.match(EFFORT_SUFFIX)?.[1] ?? null) : null;
    if (effort && baked && baked !== effort) {
      // Fail here rather than let agy reject it after the call is set up. Guessing the
      // sibling model name is not an option: `gemini-3.1-pro` ships -high and -low, no -medium.
      return {
        error:
          `Model \`${model}\` already runs at effort=${baked}, so \`effort: "${effort}"\` contradicts it and agy refuses the call. ` +
          `Pick the model variant instead — e.g. \`${model.replace(EFFORT_SUFFIX, "-" + effort)}\` — and drop \`effort\`. ` +
          `Call agy_models first: not every family has all three (gemini-3.1-pro has -high and -low, no -medium).`,
      };
    }
    const args = [];
    if (model) args.push("--model", model);
    // Suppressed when the model name already says it — passing both is what agy rejects.
    if (effort && !baked) args.push("--effort", effort);
    args.push("--mode", mode === "read" ? "plan" : "accept-edits");
    if (resumeId) args.push("--conversation", resumeId);
    // The workspace must be added explicitly; agy ignores the process cwd.
    args.push("--add-dir", cwd);
    args.push("--output-format", "json");
    // NOTE: `--print` swallows the next argv as its value, so it MUST be `--print=<text>`
    // and it MUST come last. This is the single most common way to call agy wrongly.
    args.push(`--print=${prompt}`);
    return { args };
  },

  parseResult(r) {
    // The JSON result is the last complete JSON object on stdout.
    let parsed = null;
    const lines = r.stdout.split("\n").map((l) => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith("{")) {
        try { parsed = JSON.parse(lines[i]); break; } catch { /* keep looking */ }
      }
    }
    if (!parsed) return { text: r.stdout.trim(), status: null, resumeId: null, usage: "" };
    const u = parsed.usage;
    return {
      text: parsed.response || r.stdout.trim(),
      status: parsed.status,
      resumeId: parsed.conversation_id,
      usage: u ? `tokens in/out: ${u.input_tokens ?? "?"}/${u.output_tokens ?? "?"} · turns: ${parsed.num_turns ?? "?"} · ${parsed.duration_seconds != null ? parsed.duration_seconds.toFixed(1) + "s" : "?"}` : "",
    };
  },

  /** agy reports a denied tool permission only on stderr, and then returns CANCELED with an
   *  empty response. Untranslated, that looks like an unexplained failure. */
  diagnose(stderr) {
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
  },
});
