---
name: codereview
description: Senior code review of the repository's latest changes (working tree or latest commits) — intent before diff, triage by trigger, scalability/maintainability/security pillars, precision before coverage, severity and verdict. Only reports problems with file/line and the suggested refactor; does not apply fixes without an explicit order.
---

# Senior Code Review — latest changes

- **Can:** read the diff, the code around it and the intent; classify by severity; run your host's reviewer as a second pass.
- **Must:** refuse the review if you wrote the code, confirm every `file:line` by opening the file, end with a verdict and state what you did not cover.
- **Cannot:** apply fixes without an explicit order, or report a finding you could not confirm in the file.

Act as a Senior Software Engineer and Solutions Architect. Critical, in-depth review of the
**latest changes in this repository**.

> This skill does not compete with the reviewers your environment already ships — it is the checklist
> that only exists because **this** repository exists. Run this skill **and** your own. See below.

🔴 **Delegating this review? Tell the reviewer to write its report to a file AS IT GOES.** Not at the
end — as it goes: the header first, then each finding the moment it is confirmed. A review is the
longest call the crew makes and the likeliest to hit its ceiling, and a reviewer killed at the
ceiling loses everything it was still holding in its reply. With the file, a cut-off costs the tail
of the analysis instead of all of it, and the round can be resumed instead of repeated.

Own that file in the delegated call (`owned_files: ["<the report>"]`), so the audit covers it and the
partial work is attributable. **A timed-out job is not an empty one** — read the file and the diff
before deciding the round is lost.

## Step −2 — 🔴 did you write this code?

**Nobody reviews their own work.** An author re-reading their own diff re-reads their own reasoning
and finds it convincing, because it convinced them once already.

| Code written by | Reviewed by |
|---|---|
| **Claude** | **Codex** |
| **Codex** | **Claude** |
| **agy** / **copilot** | the session's orchestrator (whichever complex agent is running) |

**Check `{{RECORDS_DIR}}/info.md` first.** In **`solo` mode there is no second agent**, so self-review
is the only option — that is allowed, but it must be **declared in the verdict**, and Step −1 stops
being optional: your host's own reviewers become the only independent pass in existence.

If you wrote the code under review and a second agent exists, **say so and hand it to them** instead
of proceeding.
The exception is a delegated diff: reviewing what `agy` or `copilot` wrote is exactly your job as
orchestrator, and it is not self-review.

**Escalate to the other complex agent** when a delegated diff turns out not to be low risk after all
— it touched something the plan did not anticipate, or the executor stopped mid-task. Full policy:
[`.claude/workflows/agent-roles.md`](../../workflows/agent-roles.md).


🔴 **Delegating any part of this?** Start it and then `*_await` — never poll `*_status` in a loop.
Polling is the one call that guarantees you are told nothing: the completion notification comes from
your host backgrounding a call that is *waiting*. See
[`../../workflows/agent-roles.md`](../../workflows/agent-roles.md#how-to-wait-for-a-delegated-call).

## Step −1 — run your host's reviewer too, not only this skill

This skill is one lens. Whatever agent is reading it also has a reviewer of its own, tuned to its
tooling, and the two catch different things. **Two independent reviewers converging on the same
finding raises confidence; only one running leaves a blind spot you cannot see.**

Identify yourself and act accordingly:

| If you are… | Run, in addition to this skill |
|---|---|
| **Claude Code** | the built-in `/code-review` for the diff, and 🔴 **`/security-review`** — always, on any diff that touches a route, handler, auth, input handling, a dependency, or infrastructure config. It is a separate pass with a separate threat model; this skill's security pillar does not replace it |
| **Codex / ChatGPT** | `codex review < /dev/null` (its non-interactive review — close stdin, see [`agent-roles.md`](../../workflows/agent-roles.md#how-to-run-the-cross-review)), or your review agent |
| **Gemini / Antigravity** | your own review command or review agent |
| **Any other agent** | 🔴 **find your own review skill or command before starting**, and run it. Do not assume you do not have one — look. If you genuinely have none, say so explicitly in the verdict rather than staying quiet about it |

Rules for combining them:

- **Run this skill's checklist regardless.** The host reviewer does not know this project's red zone,
  its critical asset, or its traps already paid for.
- **Report them separately, then merge.** State which reviewer produced each finding. A finding both
  produced is stronger; a finding only one produced is not weaker, but it is unconfirmed.
- **Deduplicate, do not double-count.** The same bug found twice is one finding, reported once, with
  a note that two passes agreed.
- **A reviewer you skipped gets declared in the verdict.** "I did not run `/security-review`" is a
  legitimate line; silently not running it is what turns a review into false assurance.

⚠️ Do not let a clean host review substitute for this checklist, or the reverse. The generic reviewer
does not know what `{{CRITICAL_ASSET}}` is; this checklist does not know your tooling's specialties.

## Not this skill: a bug whose cause is unknown

A review judges code you can read. **If the question is "why is this broken", stop and run
[`diagnosing-bugs`](../diagnosing-bugs/SKILL.md) instead** — it builds a command that goes red on the
bug before any theory exists, which is the step reviewing cannot substitute for. Come back here with
the cause in hand.

## Step 0 — understand the INTENT before judging the code

Before opening the diff, find out **why** the change exists: commit message, PR description, issue,
what `{{OWNER}}` asked for. One minute here.

A reviewer who does not know the intent becomes a noise generator: complains about a deliberate
decision, misses the requirement the code fails to meet, and anchors everything on style preference.
If the intent is nowhere to be found, **ask** — do not guess.

**If the change had a plan, read its `## Deviations` section too.** That is where the author states
where the implementation left the approved plan, and why. A divergence you can see in the diff with
**no row there** is itself a finding: the deviation went unrecorded, and nobody downstream can tell a
decision from a slip.

🔴 **This skill never writes the decision record.** If the diff contains a decision that future work
needs to know and nothing records it, flag it back to the agent that made it — the one who decided
writes it, at the moment of deciding. A reviewer who writes it up instead produces a record of what
they *inferred*, and it gets read afterwards as what was actually decided.

## How to identify what to review (in this order)

1. Uncommitted changes (`git status` + `git diff` + relevant new files).
2. If the working tree is clean, the latest commits on the branch that have not been reviewed
   (`git log` + `git show`).
3. **Read the whole file** when the diff does not give context — never review a snippet in the dark.
4. **A new untracked file is 100% new code** — no diff covers it; read it in full.

### PRE-EXISTING findings — the urgency is higher, not lower

When reviewing code already live, also classify each finding by **since when**:

| Type | What it means | Effect on urgency |
|---|---|---|
| **Regression** | introduced by the diff under review | blocks the delivery |
| **Pre-existing** | already in production | does **not** block the delivery — but the clock has been running since the date it landed |
| **Latent** | only blows up under a future condition (scale, new config, another tenant) | record it with the trigger named |

⚠️ **Never use "it is pre-existing" to downgrade severity.** It decides whether it *blocks the
delivery*, not whether it *matters*. A 3-week leak is worse than a 3-minute one.

---

## Triage — what always runs and what depends on the diff

Running every section on every change dilutes the serious finding among style comments. **Choose by
what the diff touches**, and say at the end which gates you applied.

**Always, on any diff:** Step 0 · the 3 pillars · precision before reporting · severity · verdict.

| If the diff touches… | Run |
|---|---|
| route, handler, middleware, response serialization | Application security (in this file) · **LIVE duplication** |
| code that runs on the client/browser | **Target runtime** |
| a field/column/metric that reaches the user | **Surface** · **Business analysis** |
| schema / migration | **Schema and migration** (and the `schema` skill) |
| a data source with `??` · `COALESCE` · flag · legacy path | **Dead code and stale fallback** |
| `{{SENSITIVE_DATA}}`, `{{RED_ZONE}}`, external service | the **`compliance`** gate (do not repeat its text here) |
| the dependency manifest or a lockfile | the **license** gate (`compliance`) for anything new, and the **`dependencies`** skill for what is already there |
| a new `resolutions` / `overrides` entry | ask what it patches and whether the parent is the real problem — a pin inside someone else's tree is debt taken on, and it needs the reason written where the next person will find it |
| a changed line with a comment above it | the **`comments`** skill — a comment the diff made false is a lie the next reader acts on, and the author is the least likely to see it |
| infra: `Dockerfile`, `compose`, CI, `deploy/` | **Infrastructure secrets and defaults** |
| a guard, early return, validation or disabled state the diff ADDS | **The guard on the symptom** — is it on the condition that causes the bug, or on the place where the bug was seen? |
| a function > ~30 lines, or a block repeated in 3+ places | **Simplification** |
| `{{CRITICAL_ASSET}}` | the project's integrity checklist — the highest-risk trigger |

⚠️ **Compliance gates are not conditional on your judgment** — they are conditional on the
**content** of the diff.

🔴 **Every bold name above is a section of [`REFERENCE.md`](REFERENCE.md), beside this file. Open the
ones this diff routes you to, and only those.** They are there rather than here because a reviewer
that reads every section arrives at the diff with its attention already spent, and produces a reply
about nothing — which is indistinguishable from a clean review.

## Coverage — sweep, not sample

When the question is about a **class** of problem (authorization, ownership, secrets, escaping), the
only honest answer comes from walking the entire class and **stating the number**.

Three rules come with it:

- **state the number in the verdict** ("I walked all 137 handlers", not "I reviewed the routes"). The
  number is what separates coverage from impression;
- **a category that does not apply gets declared**, instead of becoming a forced finding;
- **every finding carries the exploitability CONDITION** — "exploitable by any authenticated user" and
  "exploitable only by an existing admin" are different severities; omitting the condition inflates it.

---

## Analysis pillars

### 1. Scalability
Ready for growth in load, data or requests? Bottlenecks, nested loops (Big O), `N+1`, database/API
calls that stall under scale?

### 2. Maintainability
Clean Code and SOLID? Easy to read, test and modify? High coupling, unnecessary cyclomatic
complexity, mixed responsibilities?

### 3. Application security
Run on **every** route/handler/middleware/serialization diff:

- **Raw error leakage:** does any `catch` respond with the exception message, the raw SDK body or the
  SQL? That responds directly and **bypasses the global handler**. Correct: static code + detail in
  the server log.
- **Over-serialization:** does the response return the raw record, with internal ids and control
  fields? Run it through the **same DTO** as the read — allowlist > omit.
- **IDOR / object-level authorization:** does a route receiving a client-supplied id scope by the
  owner/tenant **from the session**? Object-level authorization, not just "is authenticated". On a
  resource with an owner and participants, does access recognize **both** relationships?
- **Enumerable keys:** any lookup by a client-supplied key that is guessable (sequential, protocol
  number, reference) must be scoped **first**. An opaque random key is safe; a sequential one is not.
- **Identity always from the session/token** — never from body/params/query.
- **Mass assignment:** is there a raw `.values(body)` / `{...body}`? Validate with a strict allowlist;
  role/tenant/flags never come from the client.
- **Injection:** parameterized SQL, external command/expression with format-validated input — nothing
  interpolated raw.
- **XSS:** is user-supplied HTML sanitized by allowlist before storing/rendering? `innerHTML` and
  equivalents with user content? CSP without `unsafe-inline`?
- **Upload:** does it validate **magic bytes** (not just the declared mimetype)? Is a dangerous
  renderable type neutralized? Served as `attachment`, outside the webroot?
- **Crypto/secrets:** constant-time token comparison (never `==`)? Randomness from a CSPRNG? Secrets
  only in the environment — never in the client bundle, in the UI, in a table or in a log?
- **Token/session:** does it verify algorithm, issuer **and** audience? Cookie
  `HttpOnly`+`Secure`+`SameSite`?
- **Config/network:** fail-closed CORS (never `*` with credentials); security headers; body size
  limit; webhooks validate the **signature** (fail-closed without the secret); expensive public
  endpoints rate-limited.
- **Logs:** personal data redacted; no whole payloads.

## Verify each Critical and High before it reaches the list

🔴 **A finding you did not try to refute is a hypothesis with a severity attached.** Before a
Critical or a High is signed, one adversarial pass over it: open the file at the `file:line`, try to
make the claim false, and come back with **CONFIRMED / REFUTED / UNCERTAIN** plus the concrete
failure scenario.

The kit ships a subagent for exactly this — [`finding-verifier`](../../agents/finding-verifier.md),
whose whole job is to attack one finding and report which of the three it is.

⚠️ **Some hosts do not let you call a subagent unless the human asked for one.** That is a real
constraint and it does not exempt the step: **do the pass yourself, in a separate reading**, and say
in the verdict which of the two happened. "Verified by a separate pass" and "verified while writing
it" are different evidence, and only the first one catches the finding that felt obviously true.

The two shapes this catches most often:

- **A contract or a test that passed while asserting nothing** — the assertion ran against an empty
  set and reported success. Ask what the assertion would have to see to fail.
- **A finding whose `file:line` is close but not right.** The reader goes to the line, sees something
  else, and stops trusting the whole list.

## Before reporting — precision beats coverage

**A wrong finding costs more than a missing one.** The first burns trust in every other item on the
list; the second gets caught by the next review. The classic: "there is no retention" reported while
the purge exists, because the search looked for `delete`/`purge` and missed the
`update … set field = null` that did the job.

Before writing each finding:

1. **Try to REFUTE your own finding.** Look for the guard, the test, the `try/catch`, the default, the
   scheduled job you may not have seen. Grep by **synonym**, not just by the term that came to mind
   first.
2. **Check `file:line` by OPENING the file** — never from memory of the diff. A wrong line makes the
   reader lose trust before evaluating the merit.
3. **Discard the doubtful silently.** If it does not support a concrete failure scenario (input → what
   breaks), it does not go on the list. There is no "reporting it just in case".
4. **Separate what you verified from what you assume.** If you could not confirm it, say so in the
   sentence itself instead of asserting.

## Severity and category — every finding comes out classified

| Severity | Criterion | What to do |
|---|---|---|
| **Critical** | data loss/leak, authorization failure, production breakage | always report, **at the TOP** |
| **High** | bug with a concrete failure scenario, security risk | always report |
| **Medium** | performance, missing error handling, maintainability | report with context |
| **Low** | style, naming, minor suggestion | only if clearly useful — when in doubt, cut it |

**Category:** `correctness` · `security` · `performance` · `maintainability` · `test-coverage` ·
`process`.

**Incidents** (vulnerability, data exposure) and **release blockers** (an unmet gate) come **before
everything**, above even criticals — they are blockers, not findings.

When using `ReportFindings`, fill in `category` and order from most to least severe.

## If splitting into subagents — file ownership, not "dimension"

> What happens without it: 3 agents in the SAME worktree trampled each other — contaminated
> baseline, one reading the other's Red as its own failure, `git status` full of a third party's files.

- **Split by DIMENSION on reads** (security, business, duplication) — that is what produces findings a
  single lens misses. Two independent agents converging on the same finding raises confidence.
- **Split by FILE on writes.** Exclusive, declared ownership; everything else is read-only. Or one
  worktree per agent.
- **The orchestrator verifies serious findings personally.** An agent's report is input, not a
  verdict — open the file and check the line before signing Critical/High.
- **Scale with the target:** a 3-file diff does not need this.

---

## When to stop reviewing — read what the rounds are finding, not how many there were

A round that keeps finding real defects has earned the next one. The question is never *how many
rounds*, it is **what kind of thing each round finds** — and a count is the wrong instrument, because
stopping at three would have been wrong in the case that produced this rule: five rounds on a ~60-line
fix, each one finding something real, with production down the whole time.

| What the latest round found | What that means |
|---|---|
| A **new class** of defect — a risk nobody had looked at yet | Keep going. The surface is still unexplored |
| **Another instance of a class already found** | Stop reviewing and change the code. Round N+1 will find instance three |
| Only **nits and preferences** | Done. Say so and close it |
| Nothing, on a diff that has been changing every round | Suspect the review, not the diff — see the intermittency rule in `agent-roles.md` |

🔴 **Repeated instances of one class are a finding about the shape of the change, not about the
review.** Three rounds each catching a different place the same invariant was violated is the diff
telling you it is wrong-shaped: the fix is to restructure so the invariant cannot be violated, not to
review until every site is caught by hand. Say that out loud in the verdict — "this is the third
instance of X; the shape is the problem" is worth more than a fourth list.

**Rounds are not free while something is broken.** Under an incident, name the cost you are spending
in the verdict, so continuing is a decision someone makes rather than a default.

## Finish with a VERDICT, not just the list

A list with no conclusion pushes the decision onto the reader, who has less context than the reviewer.

- **🟢 Approved** — nothing blocking. Say what you **verified**, not just that it passed.
- **🟡 Approved with a caveat** — it ships, with a named item to follow up.
- **🔴 Not approved** — an incident, an unmet gate, or a Critical finding without mitigation.

And say **where you did NOT look**. A review that does not declare its own limits is read as full
coverage. Close by listing **which conditional gates you ran** — the reader needs to know whether "no
security findings" means *I looked and found nothing* or *it was not applicable to this diff*.

Also close with **which reviewers ran** (Step −1), in one line:

```
REVIEWERS: this skill ✓ · /code-review ✓ · /security-review ✓ (or: not run — <why>)
AGREEMENT: <n> findings confirmed by more than one pass · <n> from a single pass
```

A review signed by one pass when two were available is a weaker review, and the reader deserves to
know which one they are holding.

## Response format

- No irrelevant micro-optimizations.
- For each problem: **file and line**, the long-term impact, and the refactored code demonstrating the
  solution.
- **Only review and report. Do not apply fixes without an explicit order.**
