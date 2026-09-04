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
| **Codex / ChatGPT** | `codex review` (its non-interactive review), or your review agent |
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
| route, handler, middleware, response serialization | Application security · Live duplication |
| code that runs on the client/browser | **Target runtime** |
| a field/column/metric that reaches the user | **Surface** · Business analysis |
| schema / migration | **Schema and migration** (and the `schema` skill) |
| a data source with `??` · `COALESCE` · flag · legacy path | **Dead code and stale fallback** |
| `{{SENSITIVE_DATA}}`, `{{RED_ZONE}}`, external service | the **`compliance`** gate (do not repeat its text here) |
| the dependency manifest or a lockfile | the **license** gate (`compliance`) for anything new, and the **`dependencies`** skill for what is already there |
| a changed line with a comment above it | the **`comments`** skill — a comment the diff made false is a lie the next reader acts on, and the author is the least likely to see it |
| infra: `Dockerfile`, `compose`, CI, `deploy/` | **Infrastructure secrets and defaults** |
| a function > ~30 lines, or a block repeated in 3+ places | **Simplification** |
| `{{CRITICAL_ASSET}}` | the project's integrity checklist — the highest-risk trigger |

⚠️ **Compliance gates are not conditional on your judgment** — they are conditional on the
**content** of the diff.

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

### Target runtime — WHERE does the diff run?

> Real case from this fleet: the application vanished for every client for 1h20 because a transitive
> dependency touched a Node API inside the browser bundle. It passed **421 green tests, a clean
> typecheck and a successful build** — all three run in Node, none of them is the browser.

- **Wrong-environment API in the bundle** — directly or **through a transitive dependency**. The
  symbol becomes `undefined` and blows up at runtime.
- **New import in client code:** is the package **genuinely** isomorphic? Read what the function you
  use actually does — it is not enough for the package to "be a browser package".
- **Code in the render path is a critical zone:** an error there takes down the entire tree (blank
  screen), it does not degrade one piece.
- **Coverage:** does the new module have a test that simulates the absence of the other
  environment's APIs?
- **When concluding:** say explicitly whether it was validated in the real environment. If there were
  only tests/builds, **declare that there is NO runtime proof** — never claim "it does not break
  production" on the basis of a green suite.

### Surface — where does this data APPEAR? (trace to the screen)

> Real case: a whole metric was built without anyone noticing that the main screen **summed two
> populations into one number**. The split was never decided — it was inherited by omission, and only
> surfaced weeks later. A review that only reads the diff does not catch it: the defect is not on any
> changed line, it is in the **set of screens** the data feeds.

For **every field/column/metric** the diff creates, changes or starts reading, answer in writing —
this is not rhetorical, it is `grep`:

1. **Who consumes this?** `grep` by name across routes, pages, reports and exports. List with `file:line`.
2. **On how many screens does it appear?** Card, table, filter, CSV, email, webhook. **Each surface is
   a contract.**
3. **Why is it aggregated?** If it sums things operations treats separately, **that is a finding** —
   aggregation hiding a difference is a product decision nobody made. Take it as a question to
   `{{OWNER}}`, not as a bug.
4. **Will two screens showing the same number agree?** If the windows/filters diverge, **say so** —
   whoever compares them will think it is an error. Either align them, or label them in the UI.

Rule of thumb: **new field in the database → does it have a screen? new field on the screen → does it
have a test?** If the answer to either is "I don't know", the review is not finished.

### Dead code and stale fallback — what is still wired up with no owner

> Real case: a card displayed ratings coming from a legacy fallback fed by a heuristic that scanned
> text for a digit — the "1" from a menu became a rating. It stayed live for years because **nobody
> revisits a fallback**: it does not show up in tests (the happy path uses the new source) and it does
> not error.

- **`??` / `COALESCE` / `fallback` / `legacy` / `dual-read`:** for each one, ask **when** the
  right-hand side is used today. If the new source is already universal, the fallback became a
  **stale-data injector**, not a safety net.
- **Does the fallback have a test?** If no test exercises the right-hand side, nobody knows what it
  returns.
- **Where does the legacy side's data come from?** If the origin is a heuristic (regex over free text,
  "the first match"), the fallback does not preserve history: it **fabricates** history. That is
  `correctness`, not debt.
- **A disabled feature that still WRITES?** The table accumulates unvalidated data that will show up
  as truth the day the flag flips on.
- **A "completed" migration with both paths alive?** A "temporary"/"until the migration" comment older
  than a quarter is a finding.
- **Route/column/env with no references:** `grep` the whole repo. Zero hits outside the definition =
  removal candidate — **report it, do not delete it** (that is `{{OWNER}}`'s decision).

### LIVE duplication — "if I fix it here, does production pick it up?"

Different from dead code: dead code has no consumer; **duplicated code has two**, and the one you are
reading may not be the one that executes. The symptom is always *"I fixed it and nothing changed"*.

- **Two implementations of the same rule.** `grep` by the **concept**, not by the function name. Two
  functions deciding the same thing = a finding, even if both are correct today.
- **The same path served from two places, with infrastructure deciding** (proxy, load balancer,
  worker). The code does not say who wins; the routing rule does.
- **A fix applied case by case where one would do.** If the correction is the same line repeated
  across N routes, the finding is not "route X is missing it" — it is *"this belongs in the shared
  place"*.
- **A file with a copy outside version control** (`~/x` vs `/etc/x`, `.example` vs the real one).
  Which of the two does the process read?
- **A test duplicated across two paths** — the runner runs both; the old one either fails (good) or
  **passes green testing code that no longer runs** (terrible).

⚠️ **Prove BOTH sides:** show where the two implementations are and **which one production executes**.

### Simplification — only with the finished code in hand

Target: **50 lines solving what 10 would solve**. Where to look: reimplementing what the lib/stdlib
already does; a loop making N queries where one would do; the same block in 3+ places; derived state
stored when it could be computed; a chained `if/else` that is a map in disguise.

**To keep it from becoming bikeshedding:**

1. **Write the 10 lines.** Without the replacement in hand, it is not a finding — it is an opinion.
2. 🔴 **Before shortening, ask WHY it is long.** Defensive code accumulates through incidents.
   **Simplification that loses error handling, a guard or an edge case is a regression.** If
   `git blame` on the line points to a fix, it stays.
3. **Removing > rewriting.** If it can be deleted, report the removal — cheaper to review and revert.
4. **Severity:** usually `maintainability`/Medium. It only rises if it hides a bug (`correctness`) or
   costs at scale (`performance`).

📌 **This section also produces the inverse, and that is desired output.** While running `git blame`
you will identify guards that came from incidents. **List them, by name, as "do not simplify"** —
that is what stops the next person from "cleaning up" the protection. **The anti-simplification list
is worth more than the simplification list.**

### Business analysis — does this make sense for the product?

Reviewing only the technique lets the expensive thing through: correct code solving the wrong problem.

- **Say in ONE sentence what the user gains.** If it does not come out, the intent is not clear or the
  change has no owner.
- **Is the default safe?** Is a new feature born on or off? Whoever inverts the default justifies it.
- **Is the unhappy path coherent?** On failure, does the user see an error, see nothing, or see
  something that **looks like success**? "Looks like success" is the worst, and the most frequent bug
  family.
- **Does it contradict a decision already made?** Reopening without saying you are reopening is a
  `process` finding.
- **Is it reversible?** Can it be turned off without a deploy (flag/config), or only by reverting the
  code? That changes the severity of everything else.

### Schema and migration — the deploy runs with both versions live

- **A new `NOT NULL` column with no default** breaks the `INSERT` of the old code, which is still live
  during the deploy window. New columns are born **nullable** or with a default.
- **Removal/rename is a TWO-phase operation**: stop using it in one deploy, remove it in the next.
  Renaming is remove + create — same rule.
- **Does a code rollback work with the schema already migrated?** Reverting the deploy does not revert
  the database. If the old code breaks with the new column present, **there is no rollback** — say so
  in the review.
- **Volume:** an index on a large table **blocks writes** without the concurrent variant — on a live
  production system that is an availability finding.
- **Does the migration run itself on deploy, or is it a manual step?** If it is manual and nobody
  declared it, the deploy goes green and the application breaks at runtime.

---

## Before reporting — precision beats coverage

**A wrong finding costs more than a missing one.** The first burns trust in every other item on the
list; the second gets caught by the next review. It has already happened in this fleet: "there is no
retention" was reported when the purge existed — the search looked for `delete`/`purge` and missed the
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

> Real case: 3 agents ran in parallel in the SAME worktree and trampled each other — contaminated
> baseline, one reading the other's Red as its own failure, `git status` full of a third party's files.

- **Split by DIMENSION on reads** (security, business, duplication) — that is what produces findings a
  single lens misses. Two independent agents converging on the same finding raises confidence.
- **Split by FILE on writes.** Exclusive, declared ownership; everything else is read-only. Or one
  worktree per agent.
- **The orchestrator verifies serious findings personally.** An agent's report is input, not a
  verdict — open the file and check the line before signing Critical/High.
- **Scale with the target:** a 3-file diff does not need this.

---

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
