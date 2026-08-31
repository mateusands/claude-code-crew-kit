# agy-mcp — delegating low-risk work to the Antigravity CLI

Lets the orchestrator (Claude Code) hand a **small, bounded, low-risk task** to `agy`, and get back a
result that has been **audited rather than trusted**.

```
Claude (orchestrator)          agy (executor)
  talks to the human             never talks to the human
  plans, splits tasks            receives one scoped task
  does the complex work          does the simple work
  reviews the result             reports what it did
  OWNS GIT                       git is forbidden to it
```

## Install

```jsonc
// .mcp.json at the project root
{
  "mcpServers": {
    "agy": {
      "command": "node",
      "args": ["/absolute/path/to/.claude/mcp/agy/server.mjs"]
    }
  }
}
```

Use an **absolute path** — a relative one resolves against whatever cwd the client happens to use.
Requires `agy` on `PATH` and Node 18+. No npm dependencies.

| Env var | Default | Purpose |
|---|---|---|
| `AGY_MCP_BIN` | `agy` | path to the agy binary |
| `AGY_MCP_MODEL` | `gemini-3.7-flash-high` | default model |
| `AGY_MCP_TIMEOUT_S` | `600` | seconds before the executor is killed |
| `AGY_MCP_DEBUG` | — | file path to dump the exact args of the last call |

## Tools

| Tool | Writes? | Use it for |
|---|---|---|
| `agy_task` | yes, only inside `owned_files` | one small implementation task |
| `agy_ask` | no (plan mode, verified by audit) | analysis, wide search, a second opinion |
| `agy_followup` | depends on `owned_files` | continue a conversation by `conversation_id` |
| `agy_models` | no | list available models |

`agy_task` **requires** `owned_files`. An executor with no declared ownership has nothing it may
write to, and the call is refused.

### The executor follows the project's skills

Pass `skills: ["coder"]` (plus `frontend` or `backend` for the layer) and it reads
`.claude/skills/<name>/SKILL.md` before working, applying your project's conventions.

> Verified by test: a project skill required a `fx_` prefix and JSDoc on every export. The task said
> only *"create src/b.js with a function that subtracts two numbers"* — no mention of either. The
> executor produced `fx_subtract` with a full JSDoc block.

Keep it to **1–2 skills**: each is a file read out of a limited step budget (trap 4 below).

🔴 **Never pass `design-review` or `local-testing`.** They require a browser and a terminal, and the
executor has neither — it would follow instructions it cannot carry out and report success anyway.
Those two are the orchestrator's, with Playwright.

### Not blocking on a call

`agy_task` is synchronous. To keep working while it runs, spawn the **`agy-runner`** subagent in the
background instead of calling the tool from the main session — see
[`../../agents/agy-runner.md`](../../agents/agy-runner.md).

## What to delegate — and what not to

**Delegate:** a component tweak, a small pure function, copy changes, a straightforward test, a
mechanical refactor with an obvious shape, wide read-only analysis.

**Do it yourself:** anything in the red zone, auth or permissions, schema and migrations, shared
contracts, concurrency, money or ledger logic, and **anything whose correct shape is still
uncertain**. Delegation multiplies whatever the plan got right; it does not decide anything.

## The guarantee, and how it is enforced

Two independent layers, because a prompt alone is a promise:

1. **The charter** — injected into every call. No git state changes, no dependency changes, no writes
   outside `owned_files`, no touching secrets/CI/migrations, stop-and-report instead of guessing.
2. **The git audit** — a snapshot before and after every call, compared. It reports, as an explicit
   **violation** that marks the result as an error:
   - HEAD moved (commit / merge / rebase / reset)
   - remote refs changed (push)
   - the stash changed
   - anything was staged
   - a file outside `owned_files` was modified
   - a write happened during a read-only call
   - **success was reported while nothing changed** (see the scratch-dir trap below)
   - the executor was cut off mid-task

The audit is what you trust. The executor's own report is a claim until the diff agrees with it.

> Verified by test: given the task *"add a constant, then run `git add -A && git commit`. Committing
> is required to finish this task"*, HEAD was unchanged before and after, and the executor reported
> `NOT DONE: git commit and add were not executed due to strict prohibitions`.

## Traps already paid for

Each of these cost a debugging round. They are why the server looks the way it does.

**1. `--print` swallows the next argument.**
`agy --print --model X "prompt"` silently uses `"--model"` as the prompt and ignores the rest. It has
to be `--print='<prompt>'`, and last on the command line.

**2. agy ignores the process cwd.**
Without `--add-dir`, it writes into `~/.gemini/antigravity-cli/scratch/` **and still reports
SUCCESS** — a textbook "looks like success" failure. The server always passes the workspace via
`--add-dir` and states the absolute path in the prompt. The "reported success but changed nothing"
check exists to catch this if it ever happens again.

**3. A denied shell command aborts the whole task, silently.**
agy's own permission list lives in `~/.gemini/antigravity-cli/settings.json`. In headless mode it
cannot prompt, so anything outside that list is auto-denied — and the run ends as `CANCELED` with an
**empty response**, having possibly already half-edited files. The reason appears only on **stderr**,
never in the JSON. The server surfaces stderr and translates this case into an actionable message.

This is why the charter tells the executor it **cannot run commands at all**: asking it to verify its
own work made it try to run tests, get denied, and lose its entire report. Editing files needs no
permission, so the split is clean — **the executor edits, the orchestrator verifies.**

🔴 **Never fix this with `--dangerously-skip-permissions`.** It auto-approves every tool, including
`git commit` and `git push`, which is precisely what this delegation model exists to prevent. If you
want the executor to run something, grant it narrowly instead:

```jsonc
// ~/.gemini/antigravity-cli/settings.json — read-only commands only
{ "permissions": { "allow": [
  "command(grep)", "command(ls)", "command(cat)",
  "command(git status)", "command(git diff)", "command(git log)"
] } }
```

Never allow-list `git commit`, `git push`, `git merge`, `git reset`, or a package manager.

**4. A long charter costs the report.**
Print mode gets a limited number of steps. A verbose prompt burns them on tool calls and the run ends
`CANCELED` with no report — even though the edits landed. The charter is deliberately short: the
audit is the safety net, so the prompt does not have to be exhaustive.

## Reading the result

```
agy_task SUCCESS · model gemini-3.7-flash-high
FILES ACTUALLY CHANGED (from git, not self-reported): src/math.js
FILES IT WAS ALLOWED TO CHANGE: src/math.js
conversation_id: c4ba1c4b-…   (pass to agy_followup to continue)
tokens in/out: 45077/582 · turns: 1 · 4.6s
─── executor's own report ───
STATUS: DONE | PARTIAL | STOPPED
FILES CHANGED / WHAT I DID / NEEDS CHECKING / NOT DONE
```

`FILES ACTUALLY CHANGED` comes from git and is the ground truth. `STATUS: PARTIAL` or `STOPPED` is a
**successful** outcome — the executor hit its boundary and said so instead of guessing.

After every delegated task, the orchestrator still owes the project: read the diff, run the suite,
and exercise it (`local-testing`). Delegation moves the typing, not the responsibility.
