---
name: audit-trail
description: Audit trail gate — every action by a person or automated job that changes state must appear in a queryable trail, with WHO, WHEN and WHAT (previous and new value). Use when creating or changing any flow that writes to the database, before considering the feature done.
---

# Audit trail — no action without a trace

- **Can:** read the diff, the models and every write path; hold a feature back until its trail exists.
- **Must:** decide best-effort *or* mandatory explicitly, and name which actions you checked.
- **Cannot:** accept "this one needs no trail" without the reason written down.

**Every feature with an action performed by someone — user, manager, admin, or automated job — must
appear in the trail, with date, time and what was done.** This is the gate that ensures it while the
code is being written, not after someone asked "who changed this?".

The reason is concrete: the question the trail exists to answer — *"who gave me this access?"*, *"why
was my balance zeroed?"*, *"who deleted this?"* — shows up **months later**, when nobody remembers.
That is why, in most projects, the trail is **immutable and has no retention deadline**.

## The gate — answer this before saying the feature is done

1. **Who acts in this feature?** If the answer is "a person" or "a job on someone's behalf", it needs a
   trail. Pure reads do not.
2. **Is the actor the right one?** The identifier comes from the **authentication context**, never from
   a body field. In a job with no user, say so in the record itself — **do not invent an actor**.
3. **Can you answer "what changed?" by looking at the row alone?** You need the **previous and the new
   value**. Without the previous one, the trail becomes "someone touched it", which is useless.
4. **Does the row show up in the audit screen/query?** Open it and check. *Writing both sides is not the
   same as wiring both sides* — a new record type with no consumer is the classic gotcha.
5. **Is there a test?** A test that queries the trail and asserts `previous_value`/`new_value`. Without
   it the trail breaks silently on the next refactor: nobody watches a table nobody asserts.

## Best-effort × mandatory — the choice is not style

| Use | When | Why |
|---|---|---|
| **best-effort** (swallows the error) | outside the transaction, after the operation | a logging failure must not take down the user's action |
| **propagates the error** | inside the business transaction | when "no trace" is worse than "no operation" — permissions, config, imports, reopening a closed period |

🔴 **Never use the best-effort variant inside a transaction.** It swallows the error, and an error inside
a transaction leaves the transaction **aborted**: the following `COMMIT` becomes a silent rollback and
the caller receives success with nothing saved.

## What to record — and what NOT to record

**Record the action's metadata**: entity, id, field, previous value, new value, actor, timestamp.

🔴 **Do not copy user content into the trail.** Post text, messages, comment bodies, emails — none of
that goes in. The trail is usually immutable and has no retention: **whatever goes in there stays
forever**, including surviving the "delete" the user asked for. The name of whoever acted comes from a
join, not duplicated in the row.

From a data-protection standpoint, that is the right posture on both ends: the trail **increases**
transparency without creating a new copy of personal data.

## 🪤 Traps already paid for

- **Serializing `null` stores the string `"null"`**, not a database `NULL` — and a screen handling
  absence with `value ? … : ''` sees `"null"` as *truthy* and displays garbage. Cover both directions:
  missing key → `NULL`; key whose value was `null` → the literal.
- **Auditing what did not change pollutes the trail.** A PATCH resending the current value should not
  generate a row — compare before writing.
- **The forgotten third-party field.** When touching someone's data, ask: *"and when an admin does this
  on behalf of another?"*. It is the most common hole.
- **A direct write to the table** (raw SQL, script, job) is always a review finding. The helper exists so
  every row has the same shape.
- **Two conventions coexisting in the same column** (different languages or verbs) — both are historical
  data already recorded. **Do not unify them**: it would change the meaning of the old trail.

## How to prove it

A test that reads the trail and asserts the previous/new pair — **and the other direction**, which is
what separates a trail from decoration: *an operation that changed nothing must not generate a row*.
Without that case, an unconditional write passes the first test.

Close by opening the audit screen for the right period. `grep` does not prove the row **appears** to
whoever needs to read it.

## If the answer is "this action does not need a trail"

It may be true — pure reads do not. But write **why** in the code, in a short comment, and take the
decision to `{{OWNER}}` when the action is about a person's data, a value or a permission. *"I did not
think it was worth it"* is not a record; *"pure read, does not change state"* is.
