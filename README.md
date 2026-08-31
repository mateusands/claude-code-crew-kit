# CrewWatch

A ready-made `.claude/` package for **Claude Code** — for starting a new repository, or for adopting
one already in flight. Skills, subagents, slash commands, workflows and MCP servers, so the AI setup
is done before the work starts.

**The crew:** Claude and Codex take the complex work, planning and review; `agy` and `copilot` take
small, low-risk tasks.

**The watch:** nobody reviews their own work, every delegated call is audited against git rather than
trusted, and git itself belongs to the orchestrator alone. Orchestrating several agents is the easy
half — the half that decides whether you can trust the output is the watch kept over them. Policy:
[`workflows/agent-roles.md`](workflows/agent-roles.md).

**Using only one agent is a supported mode, not a degraded one.** `.crew/info.md` declares the mode —
`solo`, `duo` or `crew` — and every skill adapts to it. In `solo` there is no cross-review, so the kit
requires you to *say so* rather than let a report imply a second opinion that never happened.

---

## To begin

Copy this kit into the project, then **ask the LLM to read `START.md`**:

```bash
cp -r skills agents commands workflows settings.json /path/to/repo/.claude/
cp crew-info.md.template /path/to/repo/.claude/   # start-session reads it from there
cp AGENTS.md.template /path/to/repo/AGENTS.md
cp CLAUDE.md.template /path/to/repo/CLAUDE.md
cp SECURITY.md.template /path/to/repo/SECURITY.md # public repos only
cp -r START.md mcp /path/to/repo/          # mcp/.mcp.json goes to the project root
```

Then, in the project:

> **"Read START.md and follow it."**

[`START.md`](START.md) is the onboarding protocol for the agent. It walks the project's code, works
out the stack, fills in every placeholder, creates the `.crew/` memory, installs the MCP servers — and,
most importantly, **specializes the skills for this specific project**.

That last part is the point. The kit ships generic so it can land anywhere, and it is worth little
until it stops being generic: **a skill focused on one thing beats a skill that covers everything.**
"Validate the input" helps nobody; "validate with the schema in `src/schemas/`, covering create *and*
update" changes an outcome.

---

## What is in here

```
.
├── START.md                    # 👈 the agent's onboarding protocol — start here
├── AGENTS.md.template          # the shared contract, read by every agent
├── CLAUDE.md.template          # thin — imports AGENTS.md, plus Claude-only notes
├── crew-info.md.template       # the mode and the roster → .crew/info.md
├── SECURITY.md.template        # vulnerability disclosure policy (public repos)
├── settings.json               # default permissions (allow reads, deny the irreversible)
├── settings.local.json.example # what stays on your machine, outside git
├── .gitignore                  # local settings and expiring plans, kept out of git
├── mcp/                        # MCP servers, one folder each (playwright · agy · copilot · codex · shadcn)
├── agents/                     # 5 subagents
├── commands/                   # 4 commands that stitch the skills together
├── workflows/                  # role policy + multi-agent orchestration
└── skills/                     # 16 skills
```

### The 16 skills

| Skill | Role |
|---|---|
| `start-session` | opens the session in read-only mode, loads the `.crew` memory, confirms scope and gates |
| `plan` | a plan before the first line of code, and then it STOPS |
| `plan-review` | the OTHER agent reviews that plan before any code exists |
| `coder` | the discipline of the act of writing (between plan and review) |
| `codereview` | senior review of the diff, with triage, severity and a verdict |
| `complete-security-review` | full-repository security audit, with coverage stated as numbers |
| `design-review` | visual craft — what `codereview` does not look at |
| `local-testing` | prove it at runtime (L1→L4), not in a green suite |
| `local-environment` | bring up, seed and drive the dev environment |
| `backend` | server conventions: layers, validation, errors, authz |
| `frontend` | UI conventions: design system, data, states, theming |
| `schema` | database changes without breaking the deploy |
| `compliance` | gate for personal data, licenses and confidentiality |
| `audit-trail` | no action without a trace |
| `end-session` | permanent hardening report + update the source of truth |
| `onboard-agent` | add a new CLI agent to the crew, after it passes the containment battery |

### The 5 subagents

| Agent | What it answers |
|---|---|
| `twin-hunter` | is there a second implementation of this same rule, and which one runs? |
| `surface-sweeper` | where does this data appear, and do the surfaces agree? |
| `finding-verifier` | does this review finding survive an attempt to refute it? |
| `implementer` | implements one slice of an approved plan, owning an exclusive set of files |
| `agy-runner` | supervises one task delegated to the agy executor, without blocking the main session |

### The 4 commands

| Command | What it does |
|---|---|
| `/pre-flight` | the four two-minute checks before the first line of code |
| `/gates` | triggers the gates the diff's content requires, and declares what does not apply |
| `/honesty` | filters your own report: verified × assumed, and the declared limit |
| `/execute-plan` | fans out `implementer` agents over an approved plan and joins the result |

---

## The project's memory — `.crew/`

Created by the agent during onboarding, maintained by `start-session` and `end-session`:

```
.crew/
├── techstack.md      # what the stack IS: versions, commands, structure
├── operations.md     # how it RUNS: environments, deploy, branches, ports, seeds
├── plans-local/      # plans, by day · retention 7 days · gitignored
│   └── YYYY-MM-DD/plan-<slug>.md
└── hardenings/       # session reports and traps paid for · PERMANENT · versioned
    └── YYYY-MM-DD.md
```

**The two retention policies differ on purpose.** A plan is scaffolding — once implemented it is
redundant with the code, so `plans-local/` expires after 7 days and `start-session` clears it. A
hardening is knowledge — what was decided, why, and which traps have been paid for — so
`hardenings/` **never expires** and is versioned for the team.

> Both paths come from `{{RECORDS_DIR}}`, which defaults to `.crew`. Change it if the project already
> has a convention.

---

## Modes — one agent, two, or the whole crew

Set the mode in `.crew/info.md` (from [`crew-info.md.template`](crew-info.md.template)). It is read at
the start of every session **and again at every gate**, never from memory.

| Mode | Roster | What changes |
|---|---|---|
| **solo** | one agent | no cross-review. Self-review is allowed but **must be declared**; your host's `/code-review` and `/security-review` become the only independent pass |
| **duo** | two complex agents | full review policy; no delegation |
| **crew** | two complex + executors | everything |

`info.md` also holds the **gate authority table** — who approves the plan, who may commit, what needs
written authorization. That is deliberately separate from the skills: the skills describe the
*process*, `info.md` describes the *authority*, so you can change how much you delegate without
editing a single skill.

## How the skills chain together

```
start-session ──► plan ──► plan-review ──► [owner's OK] ──► coder ──► local-testing ──► codereview
                   │        (other agent)                      │            │        + design-review
                   └────────── compliance ──────────────────────┘            │          (if UI)
                              schema / backend / frontend                    ▼
                                                                        end-session
```

The rule that cuts across all of them: **`plan` and `codereview` do not write product code**; `coder`
does; none of them commits or pushes without an explicit order.

### Who does what, when other agents are in play

With the MCP servers configured, Claude stays the orchestrator and delegates narrowly:

| | Claude | Codex (GPT) | agy | copilot |
|---|---|---|---|---|
| Model | `claude-opus-5` high | `gpt-5.6-sol` high | `gemini-3.7-flash-high` | best available |
| Tier | complex | complex | low risk | low risk, **rare** |
| Writes the plan | ✅ | ✅ | ❌ | ❌ |
| Reviews the plan | ✅ (if Codex wrote it) | ✅ (if Claude wrote it) | ❌ | ❌ |
| Complex / red-zone work | ✅ | ✅ | ❌ | ❌ |
| Small, low-risk work | delegates | delegates | ✅ front/back | ✅ backend |
| Reviews code | ✅ (Codex's + delegated) | ✅ (Claude's + delegated) | ❌ | ❌ |
| Design review + runtime validation | ✅ (Playwright) | ✅ | ❌ no browser or terminal | ❌ |
| **git — commit, push, merge** | ✅ orchestrator only | ✅ orchestrator only | ❌ **forbidden** | ❌ **forbidden** |

🔴 **Nobody reviews their own work.** Claude's code goes to Codex, Codex's to Claude, and whatever
`agy` or `copilot` wrote goes to the orchestrator running the session.

See [`mcp/README.md`](mcp/README.md) for the delegation rules and what never gets delegated.

### And when the task fans out

An approved plan with disjoint slices goes through **`/execute-plan`**, which follows
[`workflows/parallel-implementation.md`](workflows/parallel-implementation.md): the twin protocol
first, one clean baseline, shared edges serialized by the orchestrator, then one `implementer` per
slice — each with exclusive file ownership, each following the `coder` skill — and a join that the
orchestrator does personally.

```
plan (approved) ──► /execute-plan ──► twin protocol · baseline · shared edges
                                            │
                          ┌─────────────────┼─────────────────┐
                     implementer       implementer       implementer
                    (slice A, owns    (slice B, owns    (slice C, owns
                     files A1..An)     files B1..Bn)     files C1..Cn)
                          └─────────────────┼─────────────────┘
                                            ▼
                              join: suite · build · seams · codereview · runtime
```

---

## The 12 ideas that repeated across every repo

The kit was consolidated from 7 real projects. These showed up in all of them, under different names:

1. **The source of truth is the code**, not the documentation. If they diverge, the code wins and the
   doc gets updated.
2. **Read-only mode at the start** — absorb context before touching any file.
3. **Intent before the diff** — a reviewer who does not know *why* a change exists becomes a noise
   generator.
4. **`grep` by the CONCEPT, not the identifier** — that is how you find a rule's twin.
5. **A green suite is not proof that it works** — the test runs in one environment, the product in
   another.
6. **Never fail silently** — an error that does not reach the user is the worst possible defect.
7. **Precision beats coverage** — one wrong finding burns trust in all the others.
8. **Severity + verdict**, never a flat list with no conclusion.
9. **Declare what you did NOT validate** — a report with no stated limit is read as full coverage.
10. **SDD → BDD → TDD**, in that order, with Red shown rather than claimed.
11. **No commit/push without an explicit order.**
12. **Stop when an assumption falls** — stopping early costs one message; continuing wrong costs the
    implementation.

---

## Placeholders

Every fact that changes from repo to repo is marked `{{KEY}}`. `START.md` walks the agent through
filling them; `grep -rn "{{" .claude/ CLAUDE.md` lists what is missing.

| Placeholder | What it is | Example |
|---|---|---|
| `{{PROJECT}}` | project name | `PDF Manager` |
| `{{OWNER}}` | who decides (product owner) | `Mateus` |
| `{{SOURCE_OF_TRUTH}}` | where the context lives | `CLAUDE.md` |
| `{{RECORDS_DIR}}` | the project's memory directory | `.crew` |
| `{{PKG_MANAGER}}` | package manager | `pnpm` · `yarn` · `pip` |
| `{{CMD_TEST}}` | run the suite | `pnpm test` · `pytest` |
| `{{CMD_TYPECHECK}}` | static checks | `pnpm typecheck` · `mypy .` |
| `{{CMD_LINT}}` | lint | `pnpm lint` · `ruff check` |
| `{{CMD_BUILD}}` | build | `pnpm build` |
| `{{CMD_DEV}}` | run in dev | `pnpm dev` · `python main.py` |
| `{{LOCAL_URL}}` | where the app shows up | `http://localhost:5173` |
| `{{PROD_BRANCH}}` | the branch that goes to production | `main` · `prod` |
| `{{TESTS_DIR}}` | where tests live | `tests/` · `src/**/__tests__/` |
| `{{LAYERS}}` | the order of the layers | `routes → controller → service → repository` |
| `{{RED_ZONE}}` | what must not degrade without an OK | `payments, authentication` |
| `{{SENSITIVE_DATA}}` | the data that demands care | `national ID, email, medical record` |
| `{{APPROVED_VENDORS}}` | third parties already approved | `AWS, OpenAI` |
| `{{INCIDENT_DEADLINE}}` | incident notification deadline | `24h` · `immediately` |
| `{{CRITICAL_ASSET}}` | what breaks expensively (a ledger, a user's file…) | `user files` |

---

## License

MIT — see [`LICENSE`](LICENSE).
