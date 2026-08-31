# Codex (ChatGPT) — no wrapper needed

Codex ships its own MCP server. There is nothing to build:

```jsonc
{ "mcpServers": { "codex": { "command": "codex", "args": ["mcp-server"] } } }
```

It exposes two tools: **`codex`** (run a session) and **`codex-reply`** (continue one by thread id).
Check `codex login status` first — it needs a signed-in ChatGPT or API account.

## Its role in the crew

Codex is a **complex-tier agent**, equal to Claude: it plans, implements complex work, and reviews.
The pairing rule is what makes it valuable — **Claude's code is reviewed by Codex and Codex's by
Claude**, and the same for plans (`plan` / `plan-review`). Nobody signs off on their own work.

Set it up for that tier in `~/.codex/config.toml`:

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "high"
```

Full policy: [`../../workflows/agent-roles.md`](../../workflows/agent-roles.md).

## What it is good for here

**Code review, above all.** Codex has a non-interactive reviewer of its own:

```bash
codex review          # runs a review without an interactive session
```

That is the "GPT as review agent" path the `codereview` skill's Step −1 points at. A second
independent reviewer is worth more than a second implementer: two passes converging on a finding
raises confidence, and each tool's reviewer has a different blind spot.

Also useful as a second opinion on a design decision, and as an executor for a bounded task in a
language it is strong in.

## 🔴 The safety difference from `agy` — read this before delegating writes

The `agy` server in this kit is a **wrapper**: it injects a charter and audits git before and after
every call, so a commit, a push, or a write outside the declared files comes back as an explicit
violation. **The Codex MCP server is the vendor's own, and this kit adds none of that.**

What Codex gives you instead is an **OS-level sandbox**, which is a stronger guarantee in a different
place — it stops writes at the filesystem, not at the prompt:

| `--sandbox` | Effect |
|---|---|
| `read-only` | cannot write at all. **Use this for review and analysis** |
| `workspace-write` | can write inside the workspace only |
| `danger-full-access` | no sandbox |

Set it in `~/.codex/config.toml` so it applies to MCP sessions too, not just the CLI:

```toml
sandbox_mode = "read-only"        # raise to workspace-write only when you want it to implement
approval_policy = "never"          # headless cannot prompt; deny rather than hang
```

⚠️ **`workspace-write` still permits `git commit` inside the workspace.** The sandbox stops writes
outside the directory; it does not know that git belongs to the orchestrator. So when you let Codex
write, you carry that rule yourself:

- state it in the prompt (no commit, push, merge, stage);
- snapshot `git rev-parse HEAD` before and after and compare, exactly as the agy wrapper does;
- prefer `read-only` and apply the diff yourself.

**Never use `--dangerously-bypass-approvals-and-sandbox`.**

## Recommended default

Keep Codex at `read-only` and use it as a **reviewer and second opinion**, and use `agy` for
delegated writes — `agy` is the one with the audit wrapper. If you later want the same guarantees for
Codex writes, the wrapper to copy is [`../agy/server.mjs`](../agy/server.mjs); the charter and the git
audit are backend-agnostic.
