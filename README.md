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

Run the installer against the project, then **ask the LLM to read `START.md`**:

```bash
git clone https://github.com/mateusands/claude-code-crew-kit.git
./claude-code-crew-kit/install.sh /path/to/repo
```

It fills `.claude/` with the skills, subagents, commands, workflows, MCP servers and default
permissions, puts `AGENTS.md`, `CLAUDE.md` and `START.md` at the project root — never overwriting a
file that is already there — and writes **`.claude/crewwatch-version`**: the source, the tag, the
commit and the date.

The servers land at **`.claude/mcp/`**, which is what every `.mcp.json` example in this kit points
at. Only `.mcp.json` itself belongs at the project root, because that is where Claude Code reads it
from.

That stamp exists because the kit is meant to be **specialized in place** (`START.md` Step 4). Once
you have rewritten the skills for your project, it is the only record of what you started from. For
the same reason `install.sh` refuses to run twice over the same project: a re-sync would overwrite
the specialization that gives the kit its value. To adopt upstream changes, diff them against your
stamped commit and port what you want.

`SECURITY.md.template` is deliberately not installed — copy it yourself if the repo is public.

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
├── crew-info.md.template       # the project's authority → .crew/info.md (versioned)
├── .crew-kit-config.example    # your roster and models → .crew-kit-config (gitignored)
├── pull-request.md.template    # PR body → .github/pull_request_template.md, so GitHub fills it
├── SECURITY.md.template        # vulnerability disclosure policy (public repos)
├── install.sh                  # installs the kit into a project, and stamps the version
├── settings.json               # default permissions (allow reads, deny the irreversible)
├── settings.local.json.example # what stays on your machine, outside git
├── .gitignore                  # local settings and expiring plans, kept out of git
├── mcp/                        # MCP servers, one folder each (playwright · agy · copilot · codex · context7 · shadcn)
├── agents/                     # 5 subagents
├── commands/                   # 4 commands that stitch the skills together
├── workflows/                  # role policy + multi-agent orchestration
└── skills/                     # 20 skills
```

### The 20 skills

| Skill | Role |
|---|---|
| `start-session` | opens the session in read-only mode, loads the `.crew` memory, confirms scope and gates |
| `plan` | a plan before the first line of code, and then it STOPS |
| `plan-review` | the OTHER agent reviews that plan before any code exists |
| `coder` | the discipline of the act of writing (between plan and review) |
| `codereview` | senior review of the diff, with triage, severity and a verdict |
| `diagnosing-bugs` | why is it broken — a loop that goes red before any theory exists |
| `complete-security-review` | full-repository security audit, with coverage stated as numbers |
| `design-review` | visual craft — what `codereview` does not look at |
| `local-testing` | prove it at runtime (L1→L5), not in a green suite — and L5 asks whether the artifact is even deployed |
| `local-environment` | bring up, seed and drive the dev environment |
| `backend` | server conventions: layers, validation, errors, authz |
| `frontend` | UI conventions: design system, data, states, theming |
| `schema` | database changes without breaking the deploy |
| `compliance` | gate for personal data, licenses and confidentiality |
| `dependencies` | what is vulnerable and what is behind — the one gate that fires on time, not on a diff |
| `comments` | which comments earn their place in the code, and which to delete |
| `audit-trail` | no action without a trace |
| `end-session` | permanent hardening report + update the source of truth |
| `onboard-agent` | add a new CLI agent to the crew, after it passes the containment battery |
| `writing-for-agents` | how to write a document an agent runs — context load, disclosure, criteria, leading words |

### The 5 subagents

| Agent | What it answers |
|---|---|
| `twin-hunter` | is there a second implementation of this same rule, and which one runs? |
| `surface-sweeper` | where does this data appear, and do the surfaces agree? |
| `finding-verifier` | does this review finding survive an attempt to refute it? |
| `implementer` | implements one slice of an approved plan, owning an exclusive set of files |
| `agy-runner` | supervises one task delegated to the agy executor — audit read before the report, cut-off run retried, diff verified against the claim |

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
├── language.md       # the WORDS this project uses, and the ones it retired
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

**`language.md` is the shortest file and the one that pays first.** An agent with no name for a thing
describes it in twenty words, does it again next session, and invents a third name on the way. One
shared term collapses all of that — *"a problem in the materialization cascade"* rather than *"a
problem when a lesson inside a section of a course is given a real place in the file system"* — and
the payoff is not only concision: variables, functions and files end up named consistently, and the
codebase becomes navigable by the words the humans already use.

> Both paths come from `{{RECORDS_DIR}}`, which defaults to `.crew`. Change it if the project already
> has a convention.

---

## Modes — one agent, two, or the whole crew

Authority lives in `.crew/info.md` (from [`crew-info.md.template`](crew-info.md.template)), versioned
and shared — including the name of whoever decides, so a new contributor inherits it instead of
guessing. Your roster lives in `.crew-kit-config` at the repository root, gitignored — which agents
*this machine* reaches, which models, and whether you are the owner.

It can also set **`OWNER`**, which overrides the versioned name for that working copy — the fork whose
gates would otherwise send you to ask a stranger, the clone whose project owner is upstream while the
decisions about this copy are yours. 🔴 **The override is stated in every report it affects**, because
quietly redirecting "ask the owner" to yourself removes the gate and leaves its name in the report.

**The mode is the smaller of the two**, not a preference: a project that permits `crew` runs `solo` on
a machine with one agent. Both files are read at the start of every session **and again at every
gate**, never from memory.

Splitting them is what stops two people fighting over one file every session — your `crew` is their
`solo`, because they never installed codex — while still letting a new contributor inherit the rules
instead of re-deriving them. Same principle as `settings.json` versus `settings.local.json`.

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

### Declaring who owns what

Three inputs on every delegated call decide what the git audit will say, and getting them wrong is
the most common way to receive a violation that is not one:

| | |
|---|---|
| `owned_files` | **required** — the only paths the executor may write. Everything else is read-only and enforced by audit |
| `reserved_files` | paths **you** will edit while it runs. Without them your own concurrent work reads as the executor going out of scope |
| `orchestrator_writing` | for when you cannot name them in advance: unowned changes come back as *unattributed* rather than as violations |

You do **not** need to declare another executor's files. Two servers dispatched at one repository
publish their live ownership to a shared per-repo registry and stop accusing each other.

### Name the skill when you ask for the work

Nothing fires these automatically. *"Use `plan` for this"* gets you the skill; *"can you plan this
out?"* gets you an agent improvising something plan-shaped, with the gates and the twin protocol left
out. Say the name.

This is the most common way the discipline quietly fails to happen, and it is not a guess — it is
what [LAAW](https://github.com/vitoremanuellds/LAAW) recorded as the single most frequent failure
point in its own testing, on a kit built on the same assumption. The same holds for delegated work:
`agy` and `copilot` have no skill system at all, so the orchestrator names the skill files on every
call.

### Who does what, when other agents are in play

With the MCP servers configured, Claude stays the orchestrator and delegates narrowly:

| | Claude | Codex (GPT) | agy | copilot |
|---|---|---|---|---|
| Model | `claude-opus-5` high | `gpt-5.6-sol` high | `gemini-3.8-flash-high` | best available |
| Tier | complex | complex | low **and medium** | low risk, **rare** |
| Writes the plan | ✅ | ✅ | ❌ | ❌ |
| Reviews the plan | ✅ (if Codex wrote it) | ✅ (if Claude wrote it) | ❌ | ❌ |
| Complex / red-zone work | ✅ | ✅ | ❌ | ❌ |
| Small, low-risk work | delegates | delegates | ✅ front/back | ✅ backend |
| Medium work whose shape the plan settled | delegates | delegates | ✅ front/back | ❌ |
| Reviews code | ✅ (Codex's + delegated) | ✅ (Claude's + delegated) | ❌ | ❌ |
| Design review + runtime validation | ✅ (Playwright) | ✅ | ❌ no browser or terminal | ❌ |
| **git — commit, push, merge** | ✅ orchestrator only | ✅ orchestrator only | ❌ **forbidden** | ❌ **forbidden** |

🔴 **Nobody reviews their own work.** Claude's code goes to Codex, Codex's to Claude, and whatever
`agy` or `copilot` wrote goes to the orchestrator running the session.

`agy` may take a **medium** slice — several files, real logic — on two conditions that are the whole
reason it is safe: the shape was decided by a plan another agent reviewed, and the result is reviewed
by a complex-tier agent against the git audit. It never plans and it never reviews. Take either away
and this is not a wider tier, it is an unsupervised one. Size was never what held work back;
uncertainty was.

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
| `{{OWNER}}` | who **decides** — not who owns the repository | `Mateus` |
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

## The PR body

`install.sh` puts [`pull-request.md.template`](pull-request.md.template) at
`.github/pull_request_template.md`, which is where GitHub reads it from — a convention kept in
`.claude/` reaches the agents and never reaches the team.

Five rules do the work. **Write it in the repository's language** — one PR in another language is
a seam in the history. **No internal-tool attribution** — not "the reviewer agent found", not "the
second opinion said": the PR is read as one developer's work, and authority comes from the proof, not
from who produced the finding. **Result, not intention** — "ran the suite" is worth nothing, "30
tests, 30 pass" is. **Declare what was not covered**, because a PR listing only what passed is read
as full coverage. And **say what does NOT change**, or a fix reads as a refactor.

The traps block at the bottom is the part that decays: fill it with what has actually cost this
project a round, with dates. A rule with no incident attached is a rule people skim.

---

## Credits

Four things here came from [LAAW](https://github.com/vitoremanuellds/LAAW) by
[@vitoremanuellds](https://github.com/vitoremanuellds), a file-based agent workflow built for local
models on small context windows: the re-read discipline in `AGENTS.md` (open the skill file every
time, never run it from memory), the per-skill **Can / Must / Cannot** contract, the deviation
lifecycle `OPEN → ADDRESSED → INCORPORATED`, and the rule that whoever decides writes the record
while review only flags its absence. The ideas are his; the wording here is ours.

Four more came from [mattpocock/skills](https://github.com/mattpocock/skills) by
[@mattpocock](https://github.com/mattpocock), MIT: the diagnosis discipline behind `diagnosing-bugs`
(a loop that goes red before any hypothesis, and three to five ranked falsifiable hypotheses rather
than one), the authoring theory behind `writing-for-agents` (the two loads, the disclosure ladder,
completion criteria, leading words, and negation as a failure mode), the user-invoked vs
model-invoked axis now declared in the frontmatter of the skills only a human starts, and
`.crew/language.md`, which is his `CONTEXT.md` fitted to this kit's records directory. The ideas and
the structure are his; the text and the measurements in it are ours.

Three more came from [anti-slop](https://github.com/miqdadbadjuber/anti-slop) by
[@miqdadbadjuber](https://github.com/miqdadbadjuber), MIT: the three rule tiers with the purpose gate
in the middle (the technique is allowed, the unwritten reason is what fails) and its keystone (a
one-line reason, or the decision is not made yet); the anti-AI-writing patterns now in
`writing-for-agents`, with the counterpart that matters more than the list — look for clusters, and
preserve what makes writing human; and the selftest, whose direction of proof is his contrast
checker's: the script reads the table out of the document and recomputes it, rather than carrying its
own copy. The 38 UI and copy rules that are the rest of that repository are deliberately not here;
they are a design filter, and this is a process kit.

## License

MIT — see [`LICENSE`](LICENSE).

`install.sh` places a copy at **`.claude/LICENSE-crewwatch`** in the project you install into. That is
deliberate: an install copies the skills, the workflows and the MCP servers into another repository,
which is a substantial portion of this software, and MIT asks for the notice to travel with it. The
file covers the kit only — it says nothing about the project that hosts it, which keeps whatever
licence it already had.

Keep it if you publish a repository containing these files. Nothing here asks for a link back or a
badge; the notice is the whole obligation.

⚠️ **If you gitignore parts of `.claude/`, un-ignore the notice.** A project that versions the skills
but ignores `.claude/*` drops the licence with everything else — and then publishes the copy without
the file that covers it, which is the exact situation this is meant to avoid:

```gitignore
.claude/*
!.claude/skills/
!.claude/LICENSE-crewwatch      # the notice goes wherever the copied files go
```

Ignoring `.claude/` **entirely** needs none of this: nothing is being distributed, so nothing needs
the notice.
