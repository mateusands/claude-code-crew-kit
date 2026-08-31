# START.md — onboarding protocol for the AI agent

> **You are the agent reading this.** The human pointed you here because this repository is a
> `.claude/` starter kit, and your job right now is to **install it into a project and tailor it to
> that project** — not to start coding.
>
> Read this file to the end before doing anything.

---

## What this kit is

A stack-agnostic set of skills, subagents, commands and workflows distilled from 7 real projects.
It ships **generic on purpose** so it can land anywhere, and it is **worth almost nothing until you
specialize it**. A skill that says "validate input" helps nobody; a skill that says "validate with the
Zod schema in `src/schemas/`, and the allowlist must cover create *and* update" is what changes an
outcome.

**Your job is that specialization.** Generic → specific. That is the whole task.

## The rule that governs this entire session

🔴 **Everything before the last step is READ-ONLY on the project's source code.** You are reading the
project to describe it. You do not fix bugs, you do not refactor, you do not "improve" anything you
find along the way. If you spot the obvious one-line bug, **write it down in the report** and move on.

You will be writing files — but only inside `.claude/`, `.crew/`, `CLAUDE.md` and `.mcp.json`.

---

## Step 1 — figure out which situation you are in

| Situation | How you can tell | What changes |
|---|---|---|
| **New repository** | empty or near-empty, no source code yet | you have no code to read. Interview the human instead — do not invent facts |
| **Existing project** | there is code, history, dependencies | the code is your source of truth. Read it before asking anything |

Say which one you concluded, and why, before continuing.

## Step 2 — read the project (existing projects only)

Do not read the whole repository. Follow this path, in order — it is the cheapest route to an accurate
picture:

1. **The manifest** (`package.json`, `pyproject.toml`, `go.mod`, `Gemfile`…) — dependencies, versions,
   and above all **the scripts**. The scripts are where the real commands live.
2. **The README and any existing docs** — read them, but **trust them less than the code**. Docs go
   stale; manifests do not.
3. **The directory tree** — one pass, to find the layers and where things live.
4. **The entry point** (`main`, `index`, `app`, the router) — this is what tells you how the pieces
   actually connect.
5. **One representative file per layer** — one route, one service, one component, one test. You are
   looking for **the pattern the project already follows**, not for how you would have written it.
6. **The git history** — `git log --oneline -30` for the commit convention, `git branch -a` for the
   branch model.

While reading, collect the answers to Step 3. Do not guess any of them.

## Step 3 — fill in the placeholders

Every fact that changes from repo to repo is marked `{{KEY}}` across the kit.
`grep -rn "{{" .claude/ CLAUDE.md` lists what is still missing.

| Placeholder | Where you find the answer |
|---|---|
| `{{PROJECT}}` | manifest name, or ask |
| `{{OWNER}}` | ask. This is the person who decides — it is never inferable |
| `{{SOURCE_OF_TRUTH}}` | usually `CLAUDE.md`; ask if the project uses a vault/wiki |
| `{{RECORDS_DIR}}` | default `.crew` (see Step 5) |
| `{{PKG_MANAGER}}` | the lockfile tells you: `pnpm-lock.yaml` → pnpm, `poetry.lock` → poetry… |
| `{{CMD_TEST}}` `{{CMD_TYPECHECK}}` `{{CMD_LINT}}` `{{CMD_BUILD}}` `{{CMD_DEV}}` | the manifest's scripts section. **Do not invent them** — if a script does not exist, say so |
| `{{LOCAL_URL}}` | the dev server config (port in vite/next/django config) |
| `{{PROD_BRANCH}}` | `git branch -a` + any CI config |
| `{{TESTS_DIR}}` | where the existing tests actually are |
| `{{LAYERS}}` | derived from the tree + the entry point. Write the real order, not the ideal one |
| `{{RED_ZONE}}` | ask. "What must not break without your explicit OK?" |
| `{{SENSITIVE_DATA}}` | the schema/models tell you a lot; confirm with the human |
| `{{APPROVED_VENDORS}}` | ask. Which third parties are already approved |
| `{{INCIDENT_DEADLINE}}` | ask. Default `immediately` |
| `{{CRITICAL_ASSET}}` | ask. "What breaks expensively and cannot be undone?" |

**Anything you could not determine stays as an open question in the report.** A placeholder filled with
a guess is worse than an unfilled one: the guess gets trusted.

## Step 4 — 🔴 specialize the skills (this is the important step)

Filling placeholders is mechanical. **This step is the one that decides whether the kit is useful.**

The principle: **a skill focused on one thing beats a skill that covers everything.** Every generic
sentence you leave behind is a sentence the next agent will skim past.

### 4a. Delete what does not apply

Deleting is the highest-value edit you will make here. An irrelevant skill is not neutral — it dilutes
the relevant ones and teaches the reader to skim.

| Delete… | When |
|---|---|
| `skills/schema/` | no database |
| `skills/frontend/` + `skills/design-review/` | no UI (a library, a CLI, a service) |
| `skills/backend/` | pure frontend, no server of its own |
| `skills/audit-trail/` | nothing worth auditing — no permissions, no values, no personal data |
| `skills/plan-review/` | only one agent will ever work in this repo (it needs a second one to be worth anything) |
| `skills/onboard-agent/` | the crew is fixed and nobody will add another CLI agent |
| `skills/local-environment/` | nothing to bring up locally |
| individual sections **inside** a skill | the same rule: a section about workers in a project with no workers is noise |

Deleting `compliance`, `plan`, `coder`, `codereview`, `local-testing`, `start-session` or
`end-session` requires the human's explicit say-so. Those are the spine.

Also read [`workflows/agent-roles.md`](workflows/agent-roles.md) and tell the human which agents are
actually available here — the review policy assumes two complex agents (Claude and Codex). With only
one, say so plainly: cross-review is the mechanism, and without a second agent it does not exist.

### 4b. Replace generic wording with the project's real facts

Go through each surviving skill and swap the abstract for the concrete:

| The kit says (generic) | You rewrite it as (specific) |
|---|---|
| "validate the input with an allowlist" | "validate with `<the project's actual validation library>`, schemas live in `<the real path>`" |
| "application errors through one path only" | "throw `<the project's real error class>`; the central handler is at `<file:line>`" |
| "the types come from the shared place" | "types come from `<the real path>`" |
| "check the layer (`{{LAYERS}}`)" | the real layer names of this project, in order |
| "run the suite" | the real command, with the real current test count as the baseline |

**Cite `file:line` wherever you can.** A path is worth ten sentences of description.

### 4c. Keep the war stories, add the project's own

The kit's skills contain real incidents ("421 green tests and 1h20 of downtime", "the ratings fed by a
regex heuristic"). **Do not delete them** — a rule with a story attached gets followed; a rule without
one gets skimmed. They are marked as coming from another fleet, so they do not misrepresent this
project.

Then add this project's own, as you find them: an odd guard in the code, a `git log` entry that
explains a workaround, something the human tells you. Those go in `CLAUDE.md` under **"Traps already
paid for"**, and into the relevant skill.

### 4d. Do not invent

If you did not verify it in the code, do not write it as fact. A specialized skill full of plausible
inventions is worse than the generic one it replaced, because it reads as authoritative.

## Step 5 — create the `.crew/` structure

This is where the project's working memory lives.

```
.crew/
├── info.md           # the mode and the roster: who is in the crew, who decides each gate
├── techstack.md      # what the stack IS: versions, commands, structure, dependency rules
├── operations.md     # how it RUNS: environments, deploy, branches, ports, seeds, secrets
├── plans-local/      # plans, by day. Retention: 7 days. Not versioned
│   └── YYYY-MM-DD/plan-<slug>.md
└── hardenings/       # session reports and traps paid for. PERMANENT. Versioned
    └── YYYY-MM-DD.md
```

**Create `info.md` from [`crew-info.md.template`](crew-info.md.template) first**, and 🔴 **ask the
human which mode applies** — `solo`, `duo` or `crew`. Do not infer `crew` from the fact that MCP
servers exist in the config. A roster naming agents that are not actually reachable is worse than
`solo`, because the process will then expect reviews that never happen and nobody will notice.

**Create `techstack.md` and `operations.md` too**, filled with what you learned in Step 2 — not with
placeholders. If a section has no answer, write `<unknown — needs confirmation>` rather than an
invention.

The division of labor between the three documents, so they do not duplicate each other:

| File | Answers | Changes |
|---|---|---|
| `AGENTS.md` | **the rules** — what to do and not do here, for every agent | rarely |
| `CLAUDE.md` | imports `AGENTS.md`; holds only Claude-specific notes | rarely |
| `.crew/info.md` | **the authority** — mode, roster, who decides each gate | when trust or the roster changes |
| `.crew/techstack.md` | **the facts** — what exists and what it is called | on every dependency/structure change |
| `.crew/operations.md` | **the procedures** — how to run, ship and debug it | on every environment/deploy change |

🔴 **The two retention policies are different, and it is deliberate:**

- **`plans-local/` expires after 7 days.** A plan is scaffolding — once implemented it is redundant
  with the code, and keeping it forever makes the directory unreadable. `start-session` removes what
  has expired.
- **`hardenings/` never expires.** It is the accumulated knowledge: what was decided, why, and which
  traps have been paid for. It is the most valuable content in the repository after the code itself.
  **Nothing ever deletes it automatically.**

Add to `.gitignore`:

```gitignore
.crew/plans-local/
```

Leave `hardenings/`, `techstack.md` and `operations.md` versioned — they are for the team, not for
one machine.

## Step 6 — install the MCP servers

See [`mcp/README.md`](mcp/README.md). One folder per server; copy the ones the project needs into the
project root as `.mcp.json`.

| Server | Offer it when | Why |
|---|---|---|
| **playwright** | the project has any UI | without it, `design-review` and `local-testing` cannot open anything and are reduced to guessing |
| **agy** | there will be small, repetitive, low-risk work to delegate | it executes bounded tasks under a charter and a git audit |
| **codex** | you want a second, independent review pass | `codereview` Step −1 asks for one |
| **copilot** | you want a second executor beside `agy` | prefer `agy` first — see [`mcp/copilot/README.md`](mcp/copilot/README.md) on why it is the least trusted |
| **shadcn** | 🔴 **only if `components.json` exists** in the project | on any other UI stack it costs context and tempts agents away from the project's own primitives |

**Do not install servers "just in case"** — every one costs context on every session.

If you configure `agy`, put the **absolute** path to `server.mjs` in the config, and tell the human
that delegated writes never include git: commit, push and merge stay with the orchestrator.

## Step 7 — verify, then report

```bash
grep -rn "{{" .claude/ CLAUDE.md    # must return nothing, or only documented open questions
ls .crew/                             # techstack.md, operations.md, plans-local/, hardenings/
```

Report to the human, in this order:

1. **What kind of project you concluded this is**, in one sentence, and what you based that on.
2. **Which skills you kept, which you deleted, and why.** Deletions are decisions — name them.
3. **What you specialized**, per skill, in one line each.
4. **The placeholders you could not fill** — as questions, each with your recommended default.
5. **What you did NOT read.** You read a slice of the project; say which slice. A report that does not
   declare its own limits gets read as full coverage.
6. **Anything you found and deliberately did not fix**, with `file:line`.

Then stop. Do not start working on the product. The next session opens with `start-session`.

---

## Reminders that survive this session

- **Never commit or push without an explicit order.** Not even the files you just created.
- **The code is the source of truth.** When a doc disagrees with the code, the code wins and the doc
  gets updated.
- **A skill that lies is worse than no skill.** If you specialized something wrong, the next agent
  will follow it confidently in the wrong direction.
