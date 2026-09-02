#!/usr/bin/env node
/**
 * codex-mcp — delegate work to the OpenAI Codex CLI (`codex exec`), under this kit's
 * charter and git audit.
 *
 * Why a wrapper rather than the vendor's own `codex mcp-server`: that server is fine
 * for a second opinion, but it has no charter, no declared file ownership, and no git
 * snapshot around the call. This one gives Codex the same contract every other
 * executor in the crew works under, and the same handles (`codex_start`/`codex_await`).
 *
 * Everything general lives in ../lib/core.mjs. Here is only what makes Codex Codex.
 *
 * 🔴 Codex differs from the other executors in one important way: it CAN run shell
 * commands, inside its own OS sandbox. That is a strength — it can check its own work
 * — and a risk, so containment is the sandbox flag, measured rather than assumed.
 */

import { serve } from "../lib/core.mjs";

const BIN = process.env.CODEX_MCP_BIN || "codex";
// Empty by default: Codex uses whatever ~/.codex/config.toml selects, which is where
// the crew's model policy already lives (see workflows/agent-roles.md).
const DEFAULT_MODEL = process.env.CODEX_MCP_MODEL || "";
const DEFAULT_TIMEOUT_S = Number(process.env.CODEX_MCP_TIMEOUT_S || 900);

serve({
  name: "codex",
  version: "1.0.0",
  bin: BIN,
  defaultTimeoutS: DEFAULT_TIMEOUT_S,
  resumeIdLabel: "thread_id",
  canRunCommands: true,
  scratchWarning: "It either wrote outside the workspace or did nothing at all.",

  extraTaskProps: {
    model: { type: "string", description: "Codex model. Leave unset to use ~/.codex/config.toml, which is where the crew's model policy lives." },
    effort: { type: "string", enum: ["low", "medium", "high"], description: "Reasoning effort. Passed as a config override, since Codex takes it separately from the model name." },
  },
  callOpts: (a) => ({ model: a.model || DEFAULT_MODEL, effort: a.effort }),

  buildArgs({ prompt, cwd, model, effort, mode, resumeId }) {
    const args = ["exec"];
    if (resumeId) args.push("resume", resumeId);
    if (model) args.push("--model", model);
    if (effort) args.push("-c", `model_reasoning_effort="${effort}"`);
    // 🔴 Containment, measured on codex-cli 0.152.0 rather than taken from the docs:
    // `workspace-write` mounts .git READ-ONLY, so `git add` fails on .git/index.lock and
    // a commit cannot happen — and Codex reports the failure honestly instead of
    // inventing a hash. `read-only` blocks every write. Never use
    // --dangerously-bypass-approvals-and-sandbox: it removes the only real guarantee here.
    args.push("--sandbox", mode === "read" ? "read-only" : "workspace-write");
    args.push("-C", cwd);
    args.push("--skip-git-repo-check");
    // Do not litter the user's session history with delegated calls.
    args.push("--ephemeral");
    args.push("--json");
    // The prompt goes on stdin: as an argv it would hit the shell's argument limit on
    // a long charter, and Codex reads stdin when no PROMPT argument is given.
    return { args, input: prompt };
  },

  parseResult(r) {
    let text = "", resumeId = null, usage = "";
    for (const line of r.stdout.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let d; try { d = JSON.parse(t); } catch { continue; }
      if (d.type === "thread.started") resumeId = d.thread_id ?? resumeId;
      if (d.type === "turn.completed" && d.usage) {
        const u = d.usage;
        usage = `tokens in/out: ${u.input_tokens ?? "?"}/${u.output_tokens ?? "?"} · cached: ${u.cached_input_tokens ?? 0} · reasoning: ${u.reasoning_output_tokens ?? 0}`;
      }
      // The agent's own words. Later messages supersede earlier ones — the last is its report.
      if (d.type === "item.completed" && (d.item?.type === "agent_message" || d.item?.type === "assistant_message")) {
        text = d.item.text || d.item.content || text;
      }
    }
    return { text: text || r.stdout.trim(), status: null, resumeId, usage };
  },

  diagnose(stderr) {
    if (!stderr) return null;
    if (/not logged in|authentication|401/i.test(stderr)) {
      return `CODEX IS NOT AUTHENTICATED — run \`codex login\` yourself; an OAuth flow needs a browser and a human, and this wrapper cannot do it for you.\n  codex stderr: ${stderr.slice(0, 400)}`;
    }
    if (/read-only|permission denied|index\.lock/i.test(stderr)) {
      return `THE SANDBOX BLOCKED A WRITE — this is containment working, not a bug. If the blocked path was inside owned_files, widen the ownership; if it was .git, the executor tried a git command and was correctly stopped.\n  codex stderr: ${stderr.slice(0, 400)}`;
    }
    return `codex stderr: ${stderr.slice(0, 400)}`;
  },
});
