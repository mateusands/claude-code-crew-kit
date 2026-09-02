#!/usr/bin/env node
/**
 * copilot-mcp — delegate low-risk tasks to the GitHub Copilot CLI.
 *
 * Everything general — the charter, the git audit, concurrency epochs, job handles
 * and the MCP transport — lives in ../lib/core.mjs. What is here is only what makes
 * Copilot Copilot, and the two findings that shaped it.
 *
 * 🔴 This is the least trusted executor in the crew. Both reasons were measured on
 * this machine, not assumed — see README.md:
 *
 *   1. Its `--deny-tool` patterns did NOT stop a commit. Three different spellings
 *      were tried and it committed anyway. `--excluded-tools bash` was the only
 *      mechanism that held, so this wrapper removes the tool rather than denying it.
 *   2. It once reported a commit it had been prevented from making, with a fabricated
 *      hash. The charter forbids that explicitly now, and its prose is labelled
 *      narration: believe the git audit line, never the report.
 */

import { serve } from "../lib/core.mjs";
import { randomUUID } from "node:crypto";

const BIN = process.env.COPILOT_MCP_BIN || "copilot";
// Empty by default: leave --model unset and let Copilot pick its best available.
const DEFAULT_MODEL = process.env.COPILOT_MCP_MODEL || "";
const DEFAULT_TIMEOUT_S = Number(process.env.COPILOT_MCP_TIMEOUT_S || 600);

serve({
  name: "copilot",
  version: "2.0.0",
  bin: BIN,
  defaultTimeoutS: DEFAULT_TIMEOUT_S,
  resumeIdLabel: "session_id",
  // The tool is REMOVED, not denied — see the header. It cannot run anything.
  canRunCommands: false,
  scratchWarning: "It either wrote outside the workspace or did nothing at all — and this executor has been measured claiming work it did not do.",

  extraTaskProps: {
    model: { type: "string", description: "Copilot model. Leave unset for its best available. Copilot takes model and effort independently — unlike agy, the effort is not baked into the model name." },
    effort: { type: "string", enum: ["low", "medium", "high"], description: "Reasoning effort. Independent of the model here." },
  },
  callOpts: (a) => ({ model: a.model || DEFAULT_MODEL, effort: a.effort }),

  buildArgs({ prompt, cwd, model, effort, resumeId }) {
    const args = ["-p", prompt, "-s", "--no-ask-user", "--allow-all-tools"];
    // 🔴 The one guarantee that actually holds. Never remove this, and never replace it
    // with --deny-tool patterns: those were measured and did not stop a commit.
    args.push("--excluded-tools", "bash");
    args.push("-C", cwd);
    if (model) args.push("--model", model);
    if (effort) args.push("--effort", effort);
    if (resumeId) args.push(`--resume=${resumeId}`);
    else args.push("--session-id", randomUUID());
    return { args };
  },

  parseResult(r) {
    return { text: r.stdout.trim(), status: null, resumeId: null, usage: "" };
  },

  diagnose(stderr) {
    if (!stderr) return null;
    if (/not logged in|authentication|401/i.test(stderr)) {
      return `COPILOT IS NOT AUTHENTICATED — run \`copilot\` yourself and sign in; this wrapper cannot run an OAuth flow.\n  copilot stderr: ${stderr.slice(0, 400)}`;
    }
    return `copilot stderr: ${stderr.slice(0, 400)}`;
  },
});
