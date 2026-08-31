# MCP servers

One folder per server, each with its own `.mcp.json` and README. Copy the ones you want into the
project root, or use the combined [`.mcp.json`](.mcp.json) here and delete what you do not need.

```bash
cp mcp/.mcp.json /path/to/repo/.mcp.json     # playwright + agy + codex + copilot
# or just one:
cp mcp/playwright/.mcp.json /path/to/repo/.mcp.json
```

`.mcp.json` at the repo root is project-scoped and shared with the team through git. Personal servers
belong in your user config instead (`claude mcp add`).

> ⚠️ **Every server costs context on every session** — its tool definitions load whether you use them
> or not. Install what the project needs, not what might be useful someday.

Role and model policy for the whole crew lives in
[`../workflows/agent-roles.md`](../workflows/agent-roles.md) — read that first; this file covers the
plumbing.

| Server | Folder | Role | Needs |
|---|---|---|---|
| **playwright** | [`playwright/`](playwright/) | the browser the review skills assume | `npx` |
| **agy** | [`agy/`](agy/) | delegated executor for small, low-risk tasks | `agy` on PATH, Node 18+ |
| **codex** | [`codex/`](codex/) | second reviewer / second opinion | `codex` on PATH, signed in |
| **copilot** | [`copilot/`](copilot/) | second executor for delegated writes | `copilot` on PATH, signed in, Node 18+ |
| **shadcn** | [`shadcn/`](shadcn/) | component registry access — **only if the project has `components.json`** | `npx` |

---

## How they divide the work

The orchestrator (Claude) keeps planning, review, the browser and **all of git**. The other agents get
narrow, bounded jobs.

```
                    ┌──────────────────────────────────────────┐
                    │  Claude — orchestrator                    │
                    │  plan · split tasks · review · OWNS GIT   │
                    └──────────────────────────────────────────┘
                         │              │               │
            delegates    │              │ opens         │ second opinion
            simple work  │              │ the browser   │ / review
                         ▼              ▼               ▼
             ┌──────────────────┐  ┌────────────┐  ┌──────────┐
             │  agy · copilot   │  │ playwright │  │  codex   │
             │    executors     │  │  (Claude's │  │ reviewer │
             │                  │  │   own eye) │  │          │
             └──────────────────┘  └────────────┘  └──────────┘
              skills: coder,       skills: design-  runs its own
              frontend, backend    review, local-   review pass
              (no commands,        testing
               no browser, no git)
```

**What stays with the orchestrator, always:**

- every git command that changes state — commit, push, merge, stage;
- planning and slicing the work;
- **design review and runtime validation**, because they need eyes and a terminal the executor does
  not have;
- the final verdict on any delegated diff.

**Default models** (set deliberately — the low-risk tier is cheap, not weak):
`agy` = `gemini-3.7-flash-high` · `copilot` = best available (leave `--model` unset) ·
`codex` = `gpt-5.6-sol` with `model_reasoning_effort = "high"` in `~/.codex/config.toml`.

**What `agy` and `copilot` get:** one small, bounded, low-risk task at a time, with an explicit list
of files each may write to. Both follow the project's own skills (`coder`, plus `frontend` or
`backend`) by reading them. Neither can run commands, so neither can test its own work — you do that.

Prefer **`agy`** as the default executor. Use **`copilot`** for a second, independent implementation,
or when its model suits the language better — but read [`copilot/README.md`](copilot/README.md) first:
it was measured ignoring its own `--deny-tool` git blocks, and once reported a commit it never made,
with a fabricated hash. Its wrapper compensates, and its report is labelled narration rather than
evidence.

**What `codex` gets:** a second review pass. Keep it `read-only` unless you have read
[`codex/README.md`](codex/README.md) on why its sandbox does not stop `git commit`.

## Delegate, or do it yourself?

| Delegate to an executor | Keep for yourself |
|---|---|
| a component tweak, a small pure function | anything in `{{RED_ZONE}}` or touching `{{CRITICAL_ASSET}}` |
| copy or label changes | auth, permissions, authorization |
| a straightforward test | schema, migrations, shared contracts |
| a mechanical refactor with an obvious shape | concurrency, money, ledgers |
| wide read-only analysis (`agy_ask` / `copilot_ask`) | **anything whose correct shape is still uncertain** |

Delegation multiplies whatever the plan already got right. It does not decide anything, and it does
not reduce what you owe the project: after every delegated task you still read the diff, run the
suite, and exercise it.

## Not blocking on a delegated task

`agy_task` is synchronous — it blocks for as long as the executor runs. To keep working meanwhile,
spawn the **`agy-runner`** subagent in the background, one per slice. It drives the agy call, reads
the git audit, retries a cut-off run once, reviews the diff, and reports back. See
[`../agents/agy-runner.md`](../agents/agy-runner.md).

## Adding another agent (Kimi, DeepSeek, Qwen…)

Follow the [`onboard-agent`](../skills/onboard-agent/SKILL.md) skill. It probes the CLI's six
relevant capabilities, runs the containment battery — including **the commit test** and **the
fabrication test** — and only then has you copy [`agy/server.mjs`](agy/server.mjs) or
[`copilot/server.mjs`](copilot/server.mjs) and swap the backend.

The human must have the CLI installed and logged in first; you cannot run an OAuth flow for them.

🔴 **Do not register an agent that has not passed the battery.** The wrapper's guarantees come from
the containment flags plus the git audit — and which containment flag actually works is different for
every CLI, and is not reliably what its documentation says.

## Candidates worth considering

Not enabled by default. Add one only for a concrete reason, and **confirm the current package name
before adding it** — MCP package names move around.

| Server | Add it when | Pairs with |
|---|---|---|
| **Context7** | the stack is version-specific and agents keep guessing library APIs | `backend` / `frontend` Step 0 |
| **A private component registry** | your team publishes its own design system | `frontend` "reuse, do not duplicate" — see [`shadcn/`](shadcn/) |
| **Chrome DevTools** | you need performance traces or deeper network inspection | `local-testing` L3/L4 |
| **A database server** | an agent needs to read the live schema and query real data | `schema`, `local-environment` |
| **GitHub** | the work is PR-driven and intent lives in issues/PR threads | `codereview` Step 0 |
| **Sentry** or your error tracker | fixes usually start from a production incident | `plan` Step 0 |

### Think twice about

- **Anything with write access to production** — the kit's discipline is "nothing ships without an
  explicit order". A server that writes to prod hands that decision to an agent.
- **Broad filesystem servers** — Claude Code already reads and writes files; you would pay context
  for a duplicate.
- **Anything that sends code or data to a third party** — that is the `compliance` gate: outside
  `{{APPROVED_VENDORS}}` it needs prior written authorization.
