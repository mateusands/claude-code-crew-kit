---
name: plan
description: Planning a fix/feature BEFORE writing code — the mirror skill of codereview, only at the start. Restates the goal with acceptance criteria, asks only the blocking questions (each with a default), declares falsifiable assumptions, maps the blast radius, decides the SHAPE of the change, runs the gates, writes the test plan and the rollback point — and then STOPS. Use on receiving "I want to fix X" / "I want feature Y".
---

# Plan — before the first line of code

- **Can:** read anything, grep the blast radius, and ask the blocking questions — each with a default.
- **Must:** declare assumptions that can be falsified, run the gates now rather than after coding, write the test plan before the code plan, and then STOP.
- **Cannot:** write product code.

`codereview` judges finished code. This skill is the **same discipline at the start**: finding out
what the change really touches **before** a diff exists. A review finding costs one correction; a
planning error costs the entire implementation.

## Golden rule — this skill does NOT write code

It **reads, greps and writes a plan file**. No editing source, creating branches, committing or
pushing. Code only starts with an **explicit OK from `{{OWNER}}`**. If during the survey you find
the obvious one-line bug: **write it into the plan**, do not fix it.

📁 **Save to `{{RECORDS_DIR}}/plans-local/<YYYY-MM-DD>/plan-<slug>.md`** — one folder per day, one
file per plan. Create the day's folder if it does not exist.

> **Plans expire after 7 days.** Once implemented, a plan is redundant with the code, and an
> unbounded folder stops being readable. `start-session` removes what has expired — you do not need to.
>
> 🔴 **What must NOT be left only in the plan:** anything worth keeping past those 7 days — a
> non-obvious decision and its reasoning, a trap discovered along the way, a rejected approach and why.
> That belongs in `{{RECORDS_DIR}}/hardenings/` (written by `end-session`) or in
> `{{SOURCE_OF_TRUTH}}`, which are permanent. The plan is scaffolding; the reasoning is the asset.

---

## Proportionality — ceremony scales with blast radius

**Do not apply the 7 steps to everything.** A disproportionate plan is bureaucracy, and bureaucracy
makes the next fix skip planning entirely.

| Size | Treatment |
|---|---|
| Copy, rename, style tweak < ~20 lines **with an obvious correct shape** | **Just do it.** No plan, no file. Say what you did |
| Localized fix, no contract change (payload, state shape, event) | **Short plan**: goal, assumptions, test, rollback |
| Red zone (`{{RED_ZONE}}`, `{{SENSITIVE_DATA}}`, `{{CRITICAL_ASSET}}`, authentication/authorization, schema migration) | **Full treatment**, and distrust your own assumptions more |

When torn between two levels, go up one. But **declare** which you chose and why.

## Investigate before asking

Read the code and `{{SOURCE_OF_TRUTH}}` **first**. Anything discoverable in under a minute of
searching **is not a question — it is research you owe**. Do not ask whether a convention exists
when it is already established. If the code **contradicts** what is documented, that is worth
raising.

---

## The output contract — and then STOP

Every plan opens with these three blocks, in this order:

1. **The goal, in your own words** — one paragraph restating the request, **including the acceptance
   criteria** you will hold yourself to. If your restatement is wrong, this is the cheapest place in
   the world to find out.
2. **Blocking questions (0 to 3)** — only the ones that, answered wrong, mean **throwing work away**
   (not "adjust later"). Each with **your recommended default**, so `{{OWNER}}` can answer "yes to
   all". **Never ask an open question where a proposal fits.** If nothing is genuinely blocking,
   write **zero** — and move on.
3. **Numbered assumptions, specific and falsifiable.** *"The component mounts"* is an assumption;
   *"the code should be maintainable"* is not.

   | Axis | What to declare |
   |---|---|
   | Data | what data goes into this, and what **cannot** come out (log, telemetry, export) |
   | Failure | what happens if the external dependency dies mid-flight; what is best-effort and must not take down the main flow |
   | Boundaries | does it cross modules/services? does it change payload, contract or state shape? |
   | State | what gets stored, and what happens on reconnect/re-entry |
   | Environment | where this actually runs (browser, container, user's machine) |
   | Scope | what you **deliberately will not** do, and what stays as a TODO |
   | Test | what will have tests and what will stay uncovered |

4. **Which details are binding, and which are flexible.** Mark the flexible ones in the plan itself;
   everything unmarked is binding. This is what makes a deviation detectable later: `coder` departing
   from a binding detail has to record it, and departing from a flexible one does not. Pseudocode is
   always guidance — writing it differently is not a deviation; the *approach* turning out wrong is.

**Then stop. Do not start implementing.**

Two things happen before code, in this order:

1. 🔴 **The other complex agent reviews this plan** with the **`plan-review`** skill — Claude's plan is
   reviewed by Codex, Codex's plan by Claude. **Never review your own plan.** A finding there costs a
   paragraph; the same finding after implementation costs the implementation.
2. **`{{OWNER}}` gives the OK.**

Then execution has its own skill: **`coder`**. Routing of who implements what is in
[`.claude/workflows/agent-roles.md`](../../workflows/agent-roles.md).

---

## Step 0 — what is the REAL problem (not the reported symptom)

Restate the request in **one sentence**: *who* suffers, *what they see today*, *what they should
see*. If that sentence does not come out, the problem is not defined yet — ask, do not guess.

- **Separate symptom × defect × request.** *"It froze"* can be five different things. Planning the
  symptom produces a cosmetic fix.
- **Is it a fix or a feature?** A fix requires a **reproduction scenario** (input → what happens →
  what should happen). If you cannot reproduce it, **the first phase of the plan is to reproduce**,
  not to fix.
- 🔴 **One measurement per symptom. Reproducing is not diagnosing.** List every symptom this fix
  promises to resolve, and next to each one, the measurement that proves this cause produces *that*
  symptom. Symptoms that look like they share a cause need **two measurements, not one measurement and
  an inference** — the inference is where a fix that passes every review still fails to fix anything.

  Measured in the field: a mechanism was proven, it explained symptom A, and symptom B was assumed to
  follow. The plan review approved the design and the code review approved the code — both correctly,
  because the error was in the cause, not in the solution. Nothing asked which measurement covered B.

  | Symptom | Cause claimed | Measurement that proves it | |
  |---|---|---|---|
  | what the user reports | the mechanism | the observation that links this cause to *this* symptom | ✓ / not yet measured |

  A row you cannot fill is not a gap in the table — it is the plan claiming something it has not
  shown. Say so, and either measure it or drop that symptom from what the fix promises.
- **Was this already decided?** Check against previous session records. Reopening a recorded
  decision without saying you are reopening it is a process error.
- **Do two readings produce different work?** Ask now. Half an implementation discovered at the end
  is entirely rework.

## Step 1 — where this actually lives (map before diff)

The opening question: **is this layer really the owner of the rule, or am I fixing a symptom that
surfaces somewhere else?**

- Confirm the right layer (`{{LAYERS}}`). A rule that would repeat in N places belongs in the shared
  place, not in each caller.
- **Base branch**: `git fetch` and `git status` before starting. If there is a stacked open PR, say
  **which branch** the plan sits on — and whether merge order matters.

Output of this step: a table `What | Where (file:line) | Status` — the current state **verified, not
assumed**.

## Step 2 — blast radius: `grep`, not intuition

For **each** function, field or route the plan intends to touch, answer **in writing, with
`file:line`**:

| # | Question | How to prove it |
|---|---|---|
| 1 | **Who calls this?** | `grep` by the name **and by the concept** |
| 2 | **Who consumes the data?** | another screen, another service, export, webhook. **Each surface is a contract** |
| 3 | **Does it cross a boundary?** | contracts between modules are rarely typed end to end — check both sides |
| 4 | **Is there a twin?** | two implementations of the same rule. Both correct today = they will diverge tomorrow |
| 5 | **Is there dead code or a fallback?** | `??` · `COALESCE` · commented-out path: **when** does the alternate side run today? |
| 6 | **What is today's test?** | cite the file and what it covers. An existing test that **asserts** the behavior you are about to change is a plan finding, not an implementation surprise |
| 7 | **Where does it appear to the user?** | screen, report, export, notification |

⚠️ **Prove both sides before asserting.** *"Looks duplicated"* does not go in the plan; *"there are
two implementations, at `X:line` and `Y:line`, and the live path uses the one in `X`"* does. Before
writing any finding, **try to refute it**.

## Step 3 — decide the SHAPE of the change

In this order of preference (the top one is always cheaper to review and revert):

1. **Delete** — the path is no longer used. Report the removal; the decision is `{{OWNER}}`'s.
2. **Change in the right place** — if the fix would repeat across N callers, it belongs in the shared
   place. A rule fixed case by case guarantees the next one is born wrong.
3. **Add** — additive, without touching the existing path. New sensitive behavior should consider
   being born **off behind a flag/config**; whoever skips that justifies it in the plan.
4. **Rewrite/refactor** — last resort. **Do not refactor without need**: if it was not asked for,
   do not change it.

And also:

- 🔴 **Before shortening, ask why it is long.** `git blame` the line: if it points to a previous fix,
  the guard stays. **Simplification that loses error handling is a regression.**
- 🔒 **Preserve what is armored best-effort** — what today does not throw, does not block and becomes
  a no-op without configuration stays that way. If the plan touches it, say explicitly that the
  property is preserved.
- **Declare the boundary**: list what will **NOT** change. A plan without a boundary becomes a
  refactor by accident.

## Step 4 — gates (run NOW, not after coding)

Trigger by the **content** of what will change, not by your judgment:

| If the plan touches… | Run / declare |
|---|---|
| `{{SENSITIVE_DATA}}`, new logs/telemetry, external service | **`compliance`** skill — and **stop** if it requires written authorization |
| new dependency | license before installing (part of the `compliance` gate) |
| database | **`schema`** skill |
| server / interface | **`backend`** / **`frontend`** skills |
| anything that can only be proven by running it | **`local-environment`** skill and the **`local-testing`** gate |
| new environment variable | list **every** place that reads it, and whether it is build-time or runtime |

## Step 5 — the TEST plan comes before the code plan (SDD → BDD → TDD)

Run `{{CMD_TEST}}` **before** planning and **write down the numbers** — those are what you compare
against later. If the change breaks an existing test, the plan says which and why: a test that
disappears or changes expectations without a written justification is a regression in disguise.

1. **SDD** — the spec block at the **top of the test file**: what the contract is, **why it exists**
   (the rule or bug that motivated it), what is intentional vs. an implementation accident.
2. **BDD** — list the `should <result> when <condition>` in **business language**, not by internal
   function name.
3. **TDD** — say **which test will fail first** (Red) and **where the file lives** (`{{TESTS_DIR}}`).

Non-negotiable rules:

- **Test BOTH directions.** The positive case alone proves nothing — a loose condition passes just
  the same.
- 🔴 **Distrust a test that passes on the first run.** A test can pass by **vacuum** (mock returning
  `undefined`, a missing required field, a route serving something else). If Red does not appear,
  find out why before celebrating.

## Step 6 — how this will be VALIDATED

The plan declares **before coding** what each level will cover (see the `local-testing` skill):
L1 suite + typecheck + build · L2 the production artifact opens · L3 real flow with real data.

Also declare **what will NOT be validated** and why. A plan that does not declare its own limits is
read as full coverage.

## Step 7 — risk, rollback and rollout order

- **What can degrade and who feels it.** The worst path is the one that **looks like success** — it
  deserves more attention than a visible error on screen.
- **Rollback point**: `git revert` of the commit/merge (**never** `reset --hard` on a published
  commit). Note the starting SHA.
- **Rollout order** when there is more than one piece: who goes first, and why.
- **Nothing ships without an explicit order.**

---

## Output format

```markdown
# Plan — <short title>

> Request (in one sentence): who suffers, what they see today, what they should see.

**Date:** <YYYY-MM-DD> · **Status:** awaiting OK to implement
**Base branch:** <…> · **Rollback:** <SHA> · **Skills:** <the ones that apply>

## Goal (in MY words) + acceptance criteria
## Diagnosis — one row per symptom, each with the measurement that proves the cause
## Blocking questions (0–3) — each with a recommended default
## Assumptions (numbered, specific, falsifiable)
## Current state (verified in the code, not assumed)
| What | Where (file:line) | Status |
## Blast radius
callers · consumers · boundaries · twins · fallback/dead · today's test
## What changes — and what does NOT
chosen shape (delete/change/add/rewrite) + the explicit boundary
## Gates (run: … / N/A: …)
## Test — SDD → BDD → TDD (which fails first, in which file)
## Validation (L1–L5) — and **what will NOT be validated**
## Risk · rollback · rollout order
## Deviations — empty at plan time; `coder` fills it (OPEN → ADDRESSED → INCORPORATED)
## Verdict
```

**Several fixes in the same session = one plan per fix**, in numbered phases, with the boundary
between them made explicit.

## Finish with a VERDICT

- **🟢 Ready to code** — scope closed, impact mapped, validation defined. Only the OK is missing.
- **🟡 Ready with a pending decision** — name **which** decision and **who** decides. Say what can be
  advanced without it.
- **🔴 Not plannable yet** — missing reproduction, written authorization or environment access. Say
  exactly what unblocks it.

And say **where you did not look**. Precision beats coverage: one wrong item in the plan burns trust
in the others and turns into wrong code.
