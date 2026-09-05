# codereview — the sections triage routes to

Reference for [`SKILL.md`](SKILL.md). **Each section below runs only when the triage table there sends
you to it**, which is why they live in this file: what every review needs is in the skill, what some
reviews need is here.

Read the section named for you. Reading all of them costs the attention you were going to spend on
the diff — a reviewer that arrives having spent its budget on the procedure produces a reply about
nothing, which reads exactly like a clean review.

---

### Target runtime — WHERE does the diff run?

> The shape to distrust: a transitive dependency reaching a Node API from inside a browser bundle. A
> suite, a typecheck and a build all run in Node and all pass — none of them is the browser, so none
> of them can see it. The symbol is `undefined` only where the user is.

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

> The shape: a whole metric built without anyone noticing that the main screen **sums two
> populations into one number**. The split was never decided — it is inherited by omission, and
> surfaces weeks later. A review that only reads the diff does not catch it: the defect is not on any
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

> The shape: a card displaying values from a legacy fallback fed by a heuristic — text scanned for a
> digit, so a "1" from a menu becomes a rating. A fallback like that survives for years because
> **nobody revisits one**: it does not show up in tests (the happy path uses the new source) and it does
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

### Infrastructure secrets and defaults — the file nobody reviews like code

Triage routes here on a `Dockerfile`, a compose file, CI config or anything under `deploy/`. The
table promised this section and, until it was written, pointed at nothing — which is the shape of
defect this whole kit is about, arriving inside the review skill itself.

- **A secret in the file, or in the build.** An `ARG` or `ENV` carrying a credential is baked into
  the image layer and survives being overwritten later. `docker history` shows it. The same goes for
  a value pasted into a CI file "temporarily".
- **A default that is safe locally and open in production.** A bind address of `0.0.0.0`, an empty
  API key meaning *authentication off*, CORS with `*`, a debug flag defaulting on. Ask what this file
  does on a machine that is not the author's.
- **A published port that did not need publishing.** Binding to the loopback interface and binding to
  every interface look nearly identical in a compose file and are not the same decision.
- **A mount that reaches back into the working tree.** A bind mount of the repository means the
  container writes your files, config included.
- **A pinned base image, or a moving tag.** `:latest` means the build is not reproducible and a
  rebuild can change the runtime under a green suite.
- **A step that runs as root when it does not need to**, and a credential passed as an argument
  rather than through the environment — arguments are visible in the process list.

---

### The guard on the symptom — where it appeared, not what causes it

> The shape: a bug shows up in one state and the fix lands in that state. The error branch gets the
> `inert`, the "cleared everything" path gets the warning, the selected row gets the invariant. Each
> guard is correct, each one is testable, and each one leaves the door beside it open — because the
> condition that produces the bad state was never what got guarded.

Ask it of every guard, early return, validation or disabled state the diff adds:

🔴 **Is this on the condition that causes the problem, or on the place where the problem was seen?**

- **Name the condition in words before judging the code.** *"An interaction while the operation is in
  flight"* is a condition; *"in the error state"* is a location. If the sentence names a branch, a
  screen or a variable instead of a state, the guard is on the symptom.
- **Then enumerate the other places that condition holds.** If any of them is unguarded, the finding
  is not "add it there too" — it is **the guard is in the wrong layer**, and it belongs where the
  state is decided rather than where it is displayed.
- **A guard that has to be repeated is a guard in the wrong place.** Same finding as LIVE duplication
  above, reached from the other direction.
- **The reproduction is not the boundary.** The steps that exposed the bug are one path through the
  condition, and fitting the fix to those steps is how a class of bug becomes a series of
  single-instance fixes.

🔴 **A diff whose purpose is to FIX something needs more review than one that adds something, not
less.** Whoever wrote it has just been shown that their model of this code was wrong — that is what
the bug was — and the fix was written with that same model still partly in place. A fix reads as
small, careful and obviously correct, which is exactly how it gets waved through.

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
