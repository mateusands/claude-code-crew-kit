---
description: Executes an approved plan by fanning out implementer subagents — one slice each, exclusive file ownership, each following the coder skill — and joins the result personally.
---

Follow **`.claude/workflows/parallel-implementation.md`**. It is the protocol; this command is the
entry point.

**The plan to execute:** $ARGUMENTS
(if empty, use the most recent plan in `{{RECORDS_DIR}}/plans-local/` and say which one you picked)

Run it in this order, and do not skip Step 0:

1. **Is it worth parallelizing?** Apply the Step 0 table. A single fix in a single module is done by
   you — say so and do it, do not fan out for the sake of fanning out. Anything touching
   `{{CRITICAL_ASSET}}` or `{{RED_ZONE}}` does not go in parallel.
2. **Twin protocol first, once, over the whole plan** (`twin-hunter`). Finding a twin changes the
   slicing — the extraction becomes its own slice, and it goes first.
3. **Clean baseline**: `{{CMD_TEST}}`, numbers written down. It is the only uncontaminated one you
   will get.
4. **Serialize the shared edges yourself** — types, shared contracts, registries, migrations, config.
   Land them and confirm green **before** anyone fans out.
5. **Slice by FILE**, one owner per file, each slice with the five contract fields
   (slice · owns · red · boundary · shared edges).
6. **Fan out `implementer` agents**, one per slice, each carrying its contract verbatim, the path to
   the plan, and the instruction to follow the `coder` skill.
7. **Join it yourself**: `git status` (every file has a declared owner?) → full suite against the
   baseline → typecheck/lint/build → **read the seams** → `codereview` over the joined result →
   exercise at runtime (`local-testing`).

Rules that do not bend:

- **No agent commits, pushes or installs dependencies.** Ever.
- **A "done" with no pasted Red is not accepted** — send it back.
- **An agent's report is input, not a verdict.** Open the file and check the line yourself before
  signing off on anything serious.
- **A slice that stopped is reported as stopped**, not smoothed over in the summary.

Close with: what each slice delivered · which stopped · baseline → final numbers · **what no agent
covered** (the seams) · residual risk and rollback point. One commit per slice, and only if
`{{OWNER}}` ordered a commit.
