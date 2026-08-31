---
name: coder
description: Execution of an approved plan — the discipline of the ACT of writing code, between the plan skill (before) and codereview (after). Confirms the right layer, runs the twin protocol, forces Red→Green→Refactor with proof, applies the conventions review will demand, self-reviews its own diff and STOPS when an assumption falls. Use when starting to implement any already-planned and approved fix/feature.
---

# Coder — the act of writing the code

- **Can:** write product code, for an already-approved plan only.
- **Must:** run the pre-flight and the twin protocol, show Red before Green, and self-review your own diff before saying done.
- **Cannot:** plan, and cannot keep going once an assumption falls — it stops and reports. No commit or push without an order.

`plan` decides **what** to do. `codereview` judges **what came out**. This skill governs the
**middle**: the hours when the code is written, where neither of the other two is watching.

## What this skill does NOT do

- **It does not plan.** Without an approved plan, go back to `plan`. Coding without a plan means
  choosing the shape of the change mid-implementation — the worst possible moment.
- **It does not replace `codereview`.** The self-review in § 5 is hygiene, not independent review.
- **It does not commit or push on its own** (§ 6).

---

## 1. Before the first line — the pre-flight

| # | Check | How |
|---|---|---|
| 1 | **Is the file I am about to edit the real owner of the rule?** | the layer is fixed (`{{LAYERS}}`). Editing the wrong layer is the most common way for a fix to "work" in manual testing and not match the rest of the module |
| 2 | **Is there a twin of this rule?** | 🔴 see the protocol below — it is the item that most often escapes, and it escapes by being half-executed |
| 3 | **Did I touch schema/migration?** | apply it **before** exercising. A migration written and not applied is the local equivalent of "the deploy that never ran" |
| 4 | **Does this touch `{{SENSITIVE_DATA}}`, `{{CRITICAL_ASSET}}`, permissions or a new dependency?** | run the `compliance` gate **before** writing, not after |

### 🔴 The twin protocol — item 2 executed in full

**It always fails the same way: the `grep` is done by the IDENTIFIER and not by the CONCEPT.**
An identifier is the name the code uses here; a concept is the decision the code makes. **Two screens
can make the same decision without sharing a single word.**

Real case from this fleet: the fix was "this screen picks the wrong default destination". The `grep`
was done by the field name, found **one** call site, and moved on. The review later grepped by the
*concept* (*"who else picks a default out of a list?"*) and found the twin — with a **wider** reach
than the original bug — plus a third screen that was already doing it right. Three copies silently
diverging.

The right question was not *"who else writes this field?"*. It was **"who else makes this decision?"**.

**Three searches, not one:**

1. **by identifier** — the name/symbol you are touching. That is the cheap `grep`;
2. **by concept, in plain language** — write the decision as a sentence (*"picks the default"*,
   *"decides who can"*, *"resolves the current period"*) and search for the terms it would use;
3. **by the SHAPE of the code** — the expression the decision usually takes: `list[0]`, `?? first`,
   `rows[0]`, `COALESCE(`, `new Date()`. It was the shape that revealed the twin in the case above,
   not the name.

**Prove both sides before moving on**, and write in your report **which searches** you ran. If
`codereview` later finds a twin you did not cite, the pre-flight was not executed, it was signed off.

**The corollary that decides the shape of the change:** when you find a twin, the fix is almost never
"fix both the same way" — it is to **extract the decision into one place**. A side-by-side fix
guarantees the next caller is born wrong, because there is nothing for it to contradict at birth.

---

## 2. The cycle, with proof

Run `{{CMD_TEST}}` **before starting** and note the number — it is the baseline against which you
prove you did not regress. If your change breaks an existing test, the question is always *"was the
test right?"*: a test that asserts the old behavior gets updated **with a written justification**; a
test that catches a real regression sends you back.

When a test **is** being written now, the discipline is **Red → Green → Refactor**, and Red must be
**shown, not claimed**:

1. **SDD** — the test file header first: the contract, why it exists (the rule or bug that motivated
   it), what is intentional vs. an implementation accident.
2. **BDD** — `should <result> when <condition>`, in business language, not by variable or internal
   function name.
3. **Red** — run it and **paste the failure output** into the report. A test that would pass either
   way proves nothing, and only running Red reveals that.
4. **Green** — the minimum to pass. No "while I'm here".
5. **Refactor** — clean up without breaking green, and run again.

⚠️ **Mocks hide bugs.** If the behavior depends on a mock, **isolate the rule into a pure function**
and test that directly. Mocks are for the **external** only; never mock the database when the query
is the contract itself.

If the task adds the **first** test of a module, say so explicitly — do not describe as "following the
convention" something that is being decided right now.

---

## 3. While writing — the conventions review will demand

Applying them now costs nothing; applying them later is rework.

- **Validate before persisting**, always, with an allowlist — covering **both create and update**.
- **Application errors through one path only** (application error type + central handler). Never
  return a raw error to the client: it leaks SQL, SDK messages and internal paths, **and it bypasses
  the global handler**. Fallback = static code + detail in the server log.
- **Identity and permissions come from the authentication context**, never from body/params/query.
- **Authorization always checked on the server.** Hiding it in the UI protects nothing.
- **Mutations return the same DTO as reads** — never the raw record; allowlist > omit.
- **Concurrent writes are atomic** (transaction + lock), paired with the business operation that
  originated them, in the same transaction.
- **Do not erase the trail** — correct with a new record (see the `audit-trail` skill).
- **New dependency → license gate before installing** (`compliance` skill).
- **Do not refactor without need.** Before shortening something long, `git blame`: if the line came
  from a fix, the guard stays.

### Never emit a success signal before knowing the result

A general rule, and the most frequent bug family. When writing any write/send path, ask:

- does the `catch` swallow the failure and continue as if it succeeded?
- is state saved (or the UI showing "saved") **before** confirmation that the write persisted?
- is the return silent when the caller needed to know whether it worked?

If the answer is yes to any of them, the bug is already born — and it does not produce a visible
error, it produces **confidence where there is no real coverage**.

---

## 4. The stop rule

**If an assumption from the plan falls mid-implementation, stop and say so.** Do not improvise a
different design in silence, and do not continue down a path you already believe is wrong.

Stop triggers:

- the code is not what the plan assumed (the right layer is another; the twin exists and is different
  from what was expected);
- the "one file only" fix started requiring a migration, a shared contract change or a new permission
  rule;
- `{{SENSITIVE_DATA}}` or a risk to `{{CRITICAL_ASSET}}` appeared that the plan did not foresee → run
  `compliance` and warn `{{OWNER}}` before continuing;
- the fix now needs a new dependency → license gate before installing.

**Stopping early costs one message. Continuing wrong costs the whole implementation.**

### Record the divergence — whether or not you stopped

A **deviation** is the implementation materially differing from the approved plan. Departing from a
detail the plan marked flexible is not one; everything else is. The stop rule above decides whether
you keep going — this decides what gets written down, and it applies either way.

Write it in the plan file under `## Deviations`, **at the moment you diverge**, never at the end from
memory:

| State | What it means |
|---|---|
| `OPEN` | written the moment you diverged: what the plan expected, what the code actually required, why you chose this |
| `ADDRESSED` | whoever owns that gate in `info.md` has accepted it, rejected it, or sent the plan back |
| `INCORPORATED` | the fact now lives in the code, the updated plan, or the hardening — the row has done its job and can go |

🔴 **Get to `INCORPORATED` before the plan expires.** `{{RECORDS_DIR}}/plans-local/` is deleted after 7
days. A deviation still sitting at `OPEN` when that happens is knowledge that was written down and
then thrown away.

Why this section exists: without a row, `codereview` opens a diff that does not match the approved
plan and has no way to tell a deliberate decision from a slip. It then does one of two things, both
bad — flags your good call as a defect, or waves a real one through.

---

## 5. Before saying "done" — self-review of your own diff

- [ ] **Success signal** emitted only after knowing the result (§ 3)
- [ ] **Right layer**: did the rule land where it is owned, not leak to the edge?
- [ ] **Duplication**: did I fix every live copy of the rule (§ 1), or declare which ones remain and why?
- [ ] **Validation / error / authorization**: no raw error responses, nothing persisted without
      validation, no new route without the check equivalent to the rest of the module
- [ ] **Trail**: if I touched sensitive data/permissions, is the audit trail still being written?
- [ ] **Schema applied** before exercising?
- [ ] **Gates** run where applicable
- [ ] **Runtime**: I actually exercised it — not just "looks right reading the diff"
- [ ] **Deviations**: every departure from the approved plan has a row (§ 4), and every decision worth
      remembering was written when I made it — not left for `end-session` to reconstruct

⚠️ **A green suite proves the contract, not real runtime behavior.** Browser code has to be opened in
a browser; container code has to run in a container. In the report, say the two things
**separately**: what the suite covered and what you exercised by hand.

---

## 6. Commits and delivery

- **One commit per revertible unit.** Several fixes in the same session = separate commits; reverting
  one must not drag the others.
- Message in the repo's convention (`type(scope): what changes`), stating **the effect**, not the file.
- **Never `git commit`/`git push` without an explicit instruction in this session.** An order to
  commit **is not** an order to push.
- Never `--no-verify`, never force-push a published commit, never commit a secret.

---

## 7. Final report — honest

1. **What changed**, one sentence per change.
2. **The proof**: the Red output that became Green; if there was no test, say so explicitly and
   describe what you exercised manually and where.
3. **What was validated and where** — and explicitly **what was NOT validated**.
4. **Residual risk** and how to revert.
5. **What was deliberately left out**, with the reason.

A report that does not declare its own limits is read as full coverage — and that is how a "done"
becomes an incident.
