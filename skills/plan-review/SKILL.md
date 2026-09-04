---
name: plan-review
description: Adversarial review of a plan written by ANOTHER agent, before any code exists — checks that the problem is the real one, that the assumptions are falsifiable and actually verified, that the blast radius was grepped rather than guessed, that the twin was hunted, that the test plan can fail, and that the boundary is drawn. Returns a verdict. Use when Claude wrote a plan and Codex reviews it, or the reverse. Never review your own plan.
---

# Plan review — the second planner

- **Can:** challenge every assumption in a plan written by another agent, and return a verdict.
- **Must:** refuse if you wrote the plan, verify for yourself what you can, and declare what you did not check.
- **Cannot:** rewrite the plan — it reports back to the author — and cannot write code.

`plan` decides what to do. `codereview` judges finished code. **This sits between them**, and it is
the cheapest review in the whole chain: a finding here costs a paragraph, the same finding after
implementation costs the implementation.

## 🔴 Rule zero — you did not write this plan

**Never run this skill on a plan you wrote.** The value here is entirely in the second pair of eyes;
an author reviewing their own plan re-reads their own reasoning and finds it convincing, because it
convinced them once already.

| Plan written by | This skill is run by |
|---|---|
| Claude | Codex |
| Codex | Claude |

If you wrote the plan under review, stop and say so. See
[`../../workflows/agent-roles.md`](../../workflows/agent-roles.md).

**In `solo` mode** (`{{RECORDS_DIR}}/info.md`) there is no other agent. Reviewing your own plan is
then permitted, on two conditions: do it as a **separate pass** after the plan is fully written, not
while writing it — and **state in the verdict that it was a self-review**. A reader who does not know
will assume a second agent signed off.


🔴 **Delegating any part of this?** Start it and then `*_await` — never poll `*_status` in a loop.
Polling is the one call that guarantees you are told nothing: the completion notification comes from
your host backgrounding a call that is *waiting*. See
[`../../workflows/agent-roles.md`](../../workflows/agent-roles.md#how-to-wait-for-a-delegated-call).

## What you are, and are not

You are **planner #2**, not a proofreader and not a rubber stamp.

- You do **not** write code, and you do **not** rewrite the plan. You report.
- You do **not** re-plan from scratch. A different plan that is merely *your* plan is not a finding —
  the bar is *"this plan will produce the wrong outcome, and here is the concrete way"*.
- You **do** read the actual code before agreeing with any claim the plan makes about it.

🔴 **The plan's claims about the codebase are the most common source of error, and the easiest to
check.** A plan that says *"this is the only call site"* is making a testable assertion. Test it.

---

## The nine checks

Run all eight. Say explicitly which ones found nothing — a review that only lists problems reads as
if the rest was verified, and it was not.

### 1. Is the problem the real problem?

- Does the plan restate the request in **one sentence** (who suffers, what they see, what they should
  see)? If that sentence is missing, everything downstream is built on an unstated interpretation.
- Is it planning the **symptom** or the **defect**? *"The screen freezes"* has five possible causes,
  and a plan for the wrong one produces a cosmetic fix that ships.
- If it is a fix: is there a **reproduction scenario**? A fix planned without one is a guess with a
  schedule attached.
- **Does a second reading of the request produce different work?** If yes, that ambiguity should have
  been a blocking question, and it was not.

### 2. Are the assumptions falsifiable — and were they actually checked?

For each numbered assumption:

- Could it be **proven wrong** by looking at something? *"The component mounts"* can; *"the code
  should be maintainable"* cannot, and does not belong in the list.
- 🔴 **Was it verified, or asserted?** This is the single highest-yield check in this skill. Open the
  file and confirm. An assumption that turned out to be wrong is worth more than any other finding
  you will produce, because the whole plan rests on it.
- Is anything load-bearing **missing** from the list? Walk the axes: data, failure, boundaries, state,
  environment, scope, test.

### 3. Was the blast radius grepped, or guessed?

- Does every impact claim carry a **`file:line`**? "Who calls this" without citations is intuition.
- **Spot-check two of them yourself.** Not all — two. If both hold, the plan's method is probably
  sound; if either is wrong, distrust the rest and say so.
- Were **consumers** traced to the surface — screen, export, webhook, report? Each surface is a
  contract, and a plan that changes a field without listing them is incomplete.

### 4. Was the twin hunted?

- Does the plan say **which three searches** were run (identifier · concept · shape)? "I found one
  place" without them is a signature, not a conclusion.
- If a twin was found: does the plan **extract the decision to one place**, or does it fix both copies
  side by side? Side-by-side is a finding — it guarantees the next caller is born wrong.
- If no twin was found, **run one search of your own** by concept. You are the last cheap chance to
  catch it.

### 5. Is the shape of the change right?

- Was the cheapest viable shape chosen — **delete > change in the right place > add > rewrite**?
- Is the fix landing in the **layer that owns the rule**, or in the caller where the symptom shows?
- Is there **refactoring nobody asked for** riding along?
- Does anything shorten code that a `git blame` would show came from a previous fix? **Simplification
  that drops a guard is a regression**, planned in advance.

### 6. Can the test plan actually fail?

- Is there a **named test that goes red first**, in a named file? "We will add tests" is not a test plan.
- Would the proposed test **pass by vacuum** — a mock returning `undefined`, a missing required field,
  a route serving something else? If it could pass against the unfixed code, it proves nothing.
- Are **both directions** covered? A positive case alone passes with a condition that is too loose.
- Does an **existing test assert the behaviour being changed**? If the plan does not name it, the
  implementation will meet it as a surprise.

### 7. Are the gates and the boundary honest?

- Were the gates triggered by the **content** of the change (`{{SENSITIVE_DATA}}`, `{{RED_ZONE}}`,
  `{{CRITICAL_ASSET}}`, new dependency, schema, external service) rather than by the author's risk
  judgment?
- Does the plan state what will **NOT** change? A plan without a boundary becomes a refactor by
  accident.
- Is there a **rollback point**, and does it survive a schema change? If the old code breaks against
  the migrated database, there is no rollback, and the plan should say so.

### 8. Does the diagnosis hold for every symptom it claims?

The check that the other seven do not make. They ask whether the *solution* is right; this one asks
whether the **cause** is, and a plan can pass all of them while fixing something that was never the
problem.

For each symptom the plan promises to resolve, find the measurement that links this cause to *that*
symptom. Then ask the only question that matters:

> Which of these rows is an **observation**, and which is an **inference from a neighbouring row**?

Two symptoms that look like they share a cause are the trap. One gets measured, the other gets assumed
because the story is coherent — and a coherent story is exactly what makes the assumption invisible.
An inference here is a finding, not a nitpick: it means part of what this fix promises rests on
nothing.

🔴 **If a symptom has no measurement, the plan does not get to promise it.** Either it is measured
before implementation, or it comes out of the acceptance criteria and is stated as still open.

### 9. Is it routed and sliced correctly?

- Is anything in `{{RED_ZONE}}`, auth, schema or concurrency being sent to the **low-risk tier**?
  That is a routing error and it is a blocker.
- If the work is sliced for parallel execution: do the slices have **disjoint file ownership**? Two
  slices needing the same file is a badly drawn slice.
- Is the **ceremony proportional**? A 20-line copy change wrapped in a seven-section plan trains the
  next person to skip planning entirely. Over-planning is a real finding.

---

## Before you report — the same precision bar as `codereview`

**A wrong finding costs more than a missing one.** Before writing each item:

1. **Try to refute it.** Read the code the plan is talking about. Most plan findings die here, and
   that is the skill working.
2. **Separate "the plan is wrong" from "I would have done it differently."** Only the first is a
   finding. Preference goes in a single line at the end, if at all.
3. **Point at the specific claim**, quoting the plan's own words. "Assumption 3 says X; `foo.ts:214`
   shows Y" is actionable. "The assumptions are weak" is noise.

## Severity

| Severity | Meaning |
|---|---|
| **Blocker** | the plan will produce the wrong outcome, damage something irreversible, or is routed to the wrong tier. Do not start coding |
| **Should-fix** | a real gap — an unverified assumption, a missing consumer, a test that cannot fail. Fix the plan, then start |
| **Note** | worth knowing, does not change the work |

## Output

```markdown
# Plan review — <plan title>

**Plan by:** <agent> · **Reviewed by:** <agent> · **Verdict:** 🟢 / 🟡 / 🔴

## Checks run
| # | Check | Result |
|---|---|---|
| 1 | Real problem | ✓ / finding |
| 2 | Assumptions falsifiable + verified | … |
| 3 | Blast radius grepped | … (spot-checked: <file:line>, <file:line>) |
| 4 | Twin hunted | … |
| 5 | Shape of the change | … |
| 6 | Test plan can fail | … |
| 8 | Diagnosis holds per symptom | … (measured: <symptom>; inferred: <symptom>) |
| 7 | Gates and boundary | … |
| 8 | Routing and slicing | … |

## Findings
### [Blocker|Should-fix|Note] <one line>
**The plan says:** "<quote>"
**But:** <what you verified, with file:line>
**Consequence:** <what goes wrong if it proceeds>
**Suggested change to the plan:** <concrete>

## What I verified myself
<the claims you opened files to check>

## What I did NOT check
<the rest — say it plainly>
```

## Verdict

- **🟢 Approved** — the plan holds. Say what you **verified**, not just that you read it.
- **🟡 Approved with changes** — start after the named items are fixed. List them numbered.
- **🔴 Not approved** — a blocker, or an assumption that failed verification. Name what has to be
  re-planned, and what can be kept.

End with **what you did not check**. You reviewed a plan, not the codebase — a plan review that does
not declare its own limits gets read as a guarantee, and that is how a confidently wrong plan reaches
implementation with two signatures on it.
