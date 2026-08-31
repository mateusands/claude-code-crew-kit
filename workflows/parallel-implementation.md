# Workflow — parallel implementation of an approved plan

**When the client asks for subagents to go hunt down an already-planned task, and each one goes in
with the `coder` skill.** This is the orchestration protocol: how to slice, how to hand off, how to
join, and what makes the whole thing collapse.

> Prerequisite: **an approved plan** (`plan` skill) with an explicit OK from `{{OWNER}}`. Fanning out
> agents over an unplanned task multiplies the planning error by the number of agents.

---

## Step 0 — should this be parallel at all?

Fan-out is not free: it costs the slicing, the handoff, the join and one contaminated baseline per
mistake. **Run this check honestly before spawning anything.**

| Signal | Verdict |
|---|---|
| The plan has 3+ slices that touch **disjoint** file sets | 🟢 parallelize |
| The slices share a type, a contract, a registry or a migration | 🟡 serialize the shared edge **first**, then parallelize the rest |
| The plan is one fix in one module | 🔴 do it yourself. Fan-out here is pure overhead |
| The slices are only separable "in theory" — each needs the other's output | 🔴 sequential. That is a pipeline, not a fan-out |
| The plan touches `{{CRITICAL_ASSET}}` or `{{RED_ZONE}}` | 🔴 not in parallel. One agent, full attention, full review |

> Real case from this fleet: 3 agents ran in parallel in the SAME worktree and trampled each other —
> contaminated baseline, one reading another's Red as its own failure, `git status` full of a third
> party's files. **The fix is not "warn them to be careful". It is file ownership.**

## Step 1 — the two things that must happen BEFORE the fan-out

Both are the orchestrator's, and neither is delegable:

1. **The twin protocol, once, across the entire plan.** Run the `twin-hunter` over every rule the plan
   touches — before slicing. If each agent runs it inside its own slice, each finds the twin in a
   sibling's slice, and two agents "fix" the same decision in two places. **Finding a twin changes the
   slicing**: the extraction becomes its own slice, and it goes first.
2. **The baseline, once.** Run `{{CMD_TEST}}` and **write down the numbers**. This is the only clean
   baseline that will exist — after the fan-out, every number is contaminated by siblings mid-write.
   No agent runs the full suite.

Also decide the **isolation model** now:

| Model | When | Cost |
|---|---|---|
| **Shared worktree + file ownership** | slices with genuinely disjoint files | cheap; requires the ownership list to be exact |
| **One worktree per agent** | slices that touch the same directory, or anything running the suite | more setup; the only model that survives an imprecise slicing |

When in doubt, one worktree per agent. Trampling costs more than the setup.

## Step 2 — slice by FILE, not by "dimension"

**Dimension-based slicing works for reading; file-based slicing is what works for writing.** "You take
security, you take performance" produces two agents editing the same line.

Each slice comes out with the **five fields of the implementer contract**, written down:

```
SLICE <n>: <the behavior, in one sentence, with its acceptance criterion>
  OWNS:          <exclusive list of files it may write>
  RED:           <which test fails first, in which file>
  BOUNDARY:      <what it must NOT touch, named>
  SHARED EDGES:  <files that are the orchestrator's, not the slice's>
```

Rules for slicing:

- **A file has exactly one owner.** If two slices need the same file, it is not a shared file — it is a
  **badly drawn slice**. Redraw it, or lift that file into a serialized shared edge.
- **The shared edge goes FIRST, and by you.** Types, shared contracts, central registries, migrations,
  config: change them, land them, confirm green, and only then fan out. Agents work against a settled
  edge.
- **A slice with no test is not a slice.** If you cannot say which test goes red first, the slice is not
  defined — and the agent will report "done" with no proof.
- **Slices that need each other's output are sequential.** Chain them; do not spawn them together.

## Step 3 — the handoff

Each agent goes out as **`implementer`**, and its prompt carries, verbatim:

1. the **five contract fields** for its slice;
2. the **path to the approved plan**, so it reads the assumptions rather than re-deriving them;
3. the instruction to **follow the `coder` skill** (that is its discipline — do not repeat it in the prompt);
4. the **project placeholders** it needs (`{{LAYERS}}`, `{{TESTS_DIR}}`, `{{CMD_TEST}}`, `{{SENSITIVE_DATA}}`);
5. its **worktree path**, if that is the isolation model.

What never goes into the handoff: permission to commit, permission to install dependencies, or
permission to touch anything outside its ownership list.

## Step 4 — while they run

- **A shared-edge request stops that agent, not the fan-out.** Handle the edge yourself, then let it
  resume — or fold that piece into a follow-up slice.
- **A stop is a signal, not a failure.** An agent stopping because an assumption fell has done its job.
  Re-plan the slice; do not push it to continue.
- **Do not accept a "done" with no pasted Red.** A slice without proof of Red is a slice whose test may
  be passing by vacuum.
- **Two agents reporting the same twin is a strong finding.** Two independent agents converging raises
  confidence — that decision belongs in one place.

## Step 5 — the join, and it is yours alone

The orchestrator does all of this personally. **An agent's report is input, not a verdict.**

1. **`git status`** — does every changed file have a declared owner? A file nobody claims means the
   ownership was violated, and you go find out where.
2. **The full suite, now** — `{{CMD_TEST}}` against the Step 1 baseline. New failures are joint effects
   that no agent could see alone.
3. **`{{CMD_TYPECHECK}}` · `{{CMD_LINT}}` · `{{CMD_BUILD}}`** — the build catches the cross-slice breakage
   the suites do not.
4. **Read the seams** — the files two slices approached from either side. That is where the joint defect
   lives, and no individual agent's report will contain it.
5. **Run the `codereview` skill over the joined result**, not over each slice. The review of the whole is
   not the sum of the reviews of the parts.
6. **Exercise it at runtime** (`local-testing` skill). Every agent proved its own contract; nobody proved
   the product.

## Step 6 — reporting to the client

State, in this order:

- what each slice delivered, one sentence each, **and which ones stopped**;
- the joint validation: baseline → final numbers, and what you exercised by hand;
- **what no agent covered** — the seams, and what was left outside every slice;
- residual risk and the rollback point;
- one commit **per slice** if `{{OWNER}}` orders a commit. Never one commit for the whole fan-out:
  reverting one slice must not drag the others.

---

## What makes this collapse

| Failure | What it looks like | Prevention |
|---|---|---|
| Two agents in the same file | one's change disappears after the other's write | exclusive ownership, or one worktree per agent |
| Contaminated baseline | an agent reports a failure that is a sibling's | one baseline, run before the fan-out, by the orchestrator |
| The twin found N times | the same decision "fixed" in N places | twin protocol **before** slicing, once |
| A "done" with no Red | green test that never proved anything | require the pasted Red in the report |
| An agent committing | history nobody can untangle | no git state commands in the handoff |
| Slicing by dimension | agents overlapping on the same lines | slice by file; dimensions are for reading, not writing |
| Fan-out over an unplanned task | N agents implementing N different readings | an approved plan is a prerequisite, not a formality |
