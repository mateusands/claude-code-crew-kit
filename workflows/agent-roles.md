# The crew — who does what, and who reviews whom

Four agents with different costs and different strengths. This file is the policy: **which agent
takes which work, and who is allowed to review it.** It exists because the most expensive mistake in
a multi-agent setup is not a bad model — it is the wrong agent on the wrong job, and work reviewed
by the agent that produced it.

---

## First — which mode is this project in?

🔴 **Read `{{RECORDS_DIR}}/info.md` before applying anything below.** It declares the mode and the
roster, and it is the authority; this file is only the default policy.

| Mode | What applies from this file |
|---|---|
| **solo** | one agent does everything. **Cross-review does not exist** — self-review is allowed but must be declared, and the host's own reviewers (`/security-review`, `/code-review`) become the only independent pass |
| **duo** | the review policy applies in full; the delegation sections do not |
| **crew** | everything below applies |

A roster listing agents that are not actually reachable is worse than `solo`: the process expects
reviews that will never happen, and their absence is invisible in the report.

## The crew

| Agent | Model | Tier | Takes |
|---|---|---|---|
| **Claude** | `claude-opus-5`, effort **high** | complex | orchestration · complex implementation · planning · review |
| **Codex (GPT)** | `gpt-5.6-sol`, reasoning effort **high** | complex | complex implementation · planning · review |
| **agy** | `gemini-3.8-flash-high` | low **and medium** risk | frontend or backend work whose shape is already decided |
| **copilot** | best available (leave `--model` unset) | low risk | small backend tasks · **use sparingly** |

Set the complex tier deliberately: these two are the ones whose judgment you are paying for, so do
not run them cheap. `~/.codex/config.toml` should carry `model = "gpt-5.6-sol"` and
`model_reasoning_effort = "high"`.

**`copilot` is the one to reach for last.** It is capable, but it was measured ignoring its own
documented `--deny-tool` git blocks and, on one occasion, reporting a commit it had been prevented
from making — with a fabricated hash. Its wrapper compensates, but prefer `agy` when either would do.
See [`../mcp/copilot/README.md`](../mcp/copilot/README.md).

### Adding a new agent

Kimi, DeepSeek, Qwen, or whatever ships next joins through the
[`onboard-agent`](../skills/onboard-agent/SKILL.md) skill, which probes its CLI and runs a
**containment battery** before anything is wired up. A new agent joins the **low-risk tier** — the
complex tier is a judgment call for `{{OWNER}}` after the agent has done real work well, not
something a test suite awards.

🔴 **An agent that cannot be prevented from running `git commit` does not join at all**, or joins
read-only. That is measured, not assumed: one CLI here ignored its own documented `--deny-tool` git
blocks three different ways.

---

## Routing work — which tier does this belong to?

The question is **risk and uncertainty**, not size. A three-line change to an authorization check is
complex work; a hundred lines of a well-specified component is not.

| Send to the **complex tier** (Claude / Codex) | Send to the **delegated tier** (agy / copilot) |
|---|---|
| anything in `{{RED_ZONE}}` or touching `{{CRITICAL_ASSET}}` | a component tweak with an obvious shape |
| auth, permissions, authorization | copy, labels, formatting |
| schema, migrations, shared contracts | a small pure function |
| concurrency, transactions, money, ledgers | a straightforward test |
| **anything whose correct shape is still uncertain** | a mechanical refactor already decided in the plan |
| the plan itself | wide read-only analysis |
| the review of anything | **a medium slice — several files, real logic — when the plan already settled its shape** |

**Within the delegated tier:** `agy` takes frontend *or* backend, low **and medium**; `copilot` takes
small backend work, rarely.

### Why `agy` may take medium work — and the two conditions that are not negotiable

Size was never the reason to hold work back. **Uncertainty was.** A hundred lines whose shape a plan
already settled carries less risk than three lines where the right shape is still open, and the model
serving this tier is now good enough that the plan, not the model, is the binding constraint.

So the tier widens on two conditions, and neither is a preference:

1. 🔴 **It never plans.** The shape of the change is decided by a complex-tier agent, reviewed by the
   *other* complex-tier agent (`plan` → `plan-review`), and approved by `{{OWNER}}` before a single
   file is delegated. `agy` receives a decided shape, never an open question.
2. 🔴 **It never reviews — least of all itself.** Whatever comes back goes to a complex-tier agent
   with `codereview`, against the git audit rather than against its report.

Take either condition away and this stops being a wider tier and becomes an unsupervised one. What
makes a medium slice safe is not the model's quality; it is that two other agents bracket it.

### How to wait for a delegated call

🔴 **Start it, then `*_await`. Never poll `*_status` in a loop.**

```
*_start × N   handles in milliseconds; the session stays yours
*_await       instant if they already finished; otherwise your host backgrounds it
              and notifies you the moment it settles
```

Nothing pushes a result at you: an MCP server answers what it is asked and cannot wake a session. The
completion signal comes from the host backgrounding a call that is *waiting*, which is the one thing
`*_status` never does. So polling feels like the safe choice and is the only choice that guarantees
you are told nothing — it burns a turn each time and loses the notification that `*_await` would have
delivered.

Measured in the field: an orchestrator with the right setting already in `settings.json` polled
`*_status` twice anyway, and the human had to ask "anything?" twice, because the protocol was written
in the MCP docs and in the tool descriptions — neither of which is what an agent reads when deciding
how to work.

`settings.json` ships `CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=15000` so that waiting costs seconds of your
turn rather than two minutes.

🔴 **Review is where delegation pays most, and implementation is where it pays least.** Measured in
production: one delegated review returned ten findings that all held up, three of them serious and
already missed by a careful first-party pass — while three of that day's four production bugs came
out of first-party implementation. An executor without a shell cannot show you Red, so a delegated
implementation arrives as a claim that it passes; a delegated review arrives as findings you can
check one by one. Weight the crew accordingly.

🔴 **Uncertainty escalates, always.** If the right shape of the change is still open, no amount of
model quality in the delegated tier fixes it — delegation multiplies whatever the plan already got
right, and multiplies its errors just as faithfully. Decide first, then delegate.

**And what never moves, at any size:** `{{RED_ZONE}}`, `{{CRITICAL_ASSET}}`, auth and permissions,
schema and migrations, shared contracts, concurrency, money and ledgers. Those are complex-tier work
because of what they are, not because of how big the diff is.

---

## Review — nobody reviews their own work

The rule in one line: **the agent that wrote the code never signs off on it.**

| Code written by | Reviewed by |
|---|---|
| **Claude** | **Codex** |
| **Codex** | **Claude** |
| **agy** | the session's orchestrator (whichever of the two is running) |
| **copilot** | the session's orchestrator (whichever of the two is running) |

Why a **low-risk** delegated slice is reviewed by the orchestrator rather than the other complex
agent: whoever delegated it already holds the plan, the acceptance criterion and the file ownership
list. Sending it to the other one buys a second opinion on a task that was, by definition, chosen for
being low risk — and costs a round trip on every delegated slice.

🔴 **A medium slice goes to the OTHER complex agent, not to the orchestrator.** The reasoning above
stops holding as soon as the slice is big enough to matter: the orchestrator wrote the plan that
shaped it, so judging the implementation means judging its own decisions with the answer already in
mind. That is the failure `plan-review` exists to prevent, arriving one step later. The extra round
trip is the price of the wider tier — if it is not worth paying, the slice was not medium.

**Escalate a low-risk review to the other complex agent when the diff turns out not to be low risk
after all** — it touched something the plan did not anticipate, or the executor stopped mid-task and
the result is partial. That is a re-route, not a formality.

### A reviewer that answers is not a reviewer that reviewed

🔴 **Review is complete when a verdict comes back in the format the skill asks for. Nothing else
counts as a pass** — and "it replied" is the failure that looks most like success.

The kit already says what to do when there is no second complex agent: declare `solo` and say so. It
said nothing about the case that actually happens, which is worse: the reviewer is **intermittent**.
Measured in the field across roughly eleven calls — one died after 19 minutes with no output at all,
and another lost itself trying to delegate to an orchestration tool and returned that tool's
documentation instead of an analysis. Neither is an absent reviewer. Both are answers, and an answer
with no verdict in it gets read as "reviewed, nothing found".

| What came back | What it is |
|---|---|
| A verdict in the requested format, with findings or an explicit "none" | **Reviewed.** Proceed |
| Prose, a summary, documentation, an apology, an empty result | **Not reviewed.** It is a non-answer, never an approval |
| Nothing, past the ceiling below | **Not reviewed.** Same as above |

**Set a ceiling before you call.** Something like twice what the review should take, named up front.
When it blows, do not retry by reflex — a second identical call usually fails identically and costs
the same again.

🔴 **Degrade the step, not the session.** A review that did not complete makes *this step* `solo`, and
that must be stated in the report: *"cross-review did not complete for this diff; self-review only."*
The roster in `{{RECORDS_DIR}}/info.md` does not change, and the next step tries the reviewer again.
Downgrading the whole session because one call failed throws away the gate for work that would have
gotten it; silently continuing is worse, because the report then implies a second opinion that never
happened.

### How to run the cross review

The reviewer runs the [`codereview`](../skills/codereview/SKILL.md) skill, including its **Step −1**
(run your own host reviewer too). Concretely:

```bash
# Claude wrote it → Codex reviews
codex exec --sandbox read-only "Review the working tree changes. Follow .claude/skills/codereview/SKILL.md."

# Codex wrote it → Claude reviews
# (run the codereview skill in the Claude session, plus /code-review and /security-review)
```

Keep the sandbox `read-only` for review: a reviewer that can edit stops being a reviewer.

---

## Planning — same rule, one step earlier

A plan is the most expensive thing to get wrong, because every downstream agent inherits its errors.
So it gets the same treatment as code:

| Plan written by | Reviewed by |
|---|---|
| **Claude** (`plan` skill) | **Codex** (`plan-review` skill) |
| **Codex** (`plan` skill) | **Claude** (`plan-review` skill) |

The reviewer is **planner #2**, not a rubber stamp: it looks for the assumption nobody questioned,
the blast radius nobody grepped, and the twin nobody hunted. See
[`../skills/plan-review/SKILL.md`](../skills/plan-review/SKILL.md).

The low-risk tier never writes or reviews a plan.

---

## The whole flow

```
              ┌──────────────────────────────────────────────┐
              │  1. PLAN        Claude or Codex  (skill: plan)│
              └──────────────────────────────────────────────┘
                                   │
              ┌──────────────────────────────────────────────┐
              │  2. PLAN-REVIEW  the OTHER complex agent      │
              │                  (skill: plan-review)         │
              └──────────────────────────────────────────────┘
                                   │  owner's OK
              ┌──────────────────────────────────────────────┐
              │  3. SPLIT        orchestrator slices the work │
              └──────────────────────────────────────────────┘
                     │                              │
         complex slice│                              │low-risk slice
                     ▼                              ▼
        ┌────────────────────────┐      ┌────────────────────────┐
        │ Claude or Codex        │      │ agy  (frontend/backend)│
        │ (skill: coder)         │      │ copilot (backend, rare)│
        └────────────────────────┘      └────────────────────────┘
                     │                              │
              ┌──────────────────────────────────────────────┐
              │  4. REVIEW       never the author             │
              │     Claude↔Codex · executors→orchestrator     │
              └──────────────────────────────────────────────┘
                                   │
              ┌──────────────────────────────────────────────┐
              │  5. VALIDATE     orchestrator only            │
              │     design-review + local-testing + Playwright│
              └──────────────────────────────────────────────┘
                                   │
              ┌──────────────────────────────────────────────┐
              │  6. GIT          orchestrator only, on order  │
              └──────────────────────────────────────────────┘
```

## What never moves, whoever is orchestrating

- **git — commit, push, merge, stage.** One agent, on an explicit order from `{{OWNER}}`.
- **Design review and runtime validation.** They need a browser and a terminal; the low-risk tier has
  neither, and would report success on a screen nobody looked at.
- **The final verdict on any diff.** An agent's report is input. The orchestrator opens the file.
- **Talking to the human.** Executors report to the orchestrator, never to `{{OWNER}}` directly.
