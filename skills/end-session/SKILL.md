---
name: end-session
description: Closes the working session — writes the permanent hardening report to .crew/hardenings/, updates the source of truth and the .crew memory files if anything they claim has changed, runs the final validation and honestly reports what was left out. Use at the end of every session.
---

# Session close

- **Can:** write the permanent hardening report and update `{{SOURCE_OF_TRUTH}}` and the `{{RECORDS_DIR}}` memory files.
- **Must:** record the traps paid for, run the final validation, and say what was left out and what is still uncommitted.
- **Cannot:** commit or push without an order, and cannot delete anything under `hardenings/`.

The goal right now is **not to code**, but to consolidate what the session changed. A session that ends
with no record forces the next one to rediscover everything.

## 1. Session report

- Save it to **`{{RECORDS_DIR}}/hardenings/YYYY-MM-DD.md`**. If today's file already exists, **append a
  section** instead of overwriting.

> **Why "hardenings" and not "sessions":** this folder is **permanent and versioned** — nothing ever
> expires it. Plans live in `plans-local/` and are deleted after 7 days; what lands here is what
> survives them. Write it for someone who was not in the session and does not have the code in their
> head: it is the only artifact that outlives the plan.
- Required content:
  - **What was done** — per change, one sentence with the effect (not the file name).
  - **Non-obvious technical decisions** — and the **why**. It is the most valuable content in the
    report. Each one should already have been written **when it was made**, by whoever made it
    (`AGENTS.md`), which makes this step consolidation rather than reconstruction. If a decision is
    reaching this file only from memory, **say so** — a reconstructed "why" reads exactly like a
    recorded one, and is not the same thing.
  - **Deviations** — anything still `OPEN` or `ADDRESSED` under a plan's `## Deviations`. Carry the
    fact here and mark it `INCORPORATED` there. `plans-local/` expires after 7 days; this file does
    not, so a deviation that never makes the trip is simply lost.
  - **Validation** — what the suite covered **and**, separately, what you exercised by hand, with what
    data. "The tests pass" never does the job of both.
  - **Loose ends** — explicit enough to resume without context.
  - **Git state** — branch, what was left uncommitted.

### Compliance checklist (mandatory, even if everything is "none")

1. **New dependencies** — package + license for each. Copyleft without written authorization is a
   violation: if it happened, flag it at the top.
2. **`{{SENSITIVE_DATA}}` touched** — a new field, table or log? Did it pass the purpose / retention /
   does-not-leak-in-logs gate? Did any data go to an external service outside `{{APPROVED_VENDORS}}`?
3. **`{{CRITICAL_ASSET}}` / `{{RED_ZONE}}`** — did the session touch it? What is the rollback point?
4. **Incidents** — did you find a vulnerability or a suspicion? Was it communicated to `{{OWNER}}` **at
   the time** (not now)? If it is only being reported now, that is a process failure — record it as such.

## 2. Update the source of truth

Assess whether the session changed anything `{{SOURCE_OF_TRUTH}}` **claims**. Triggers:

- **A new or removed module/screen/command** — the directory tree and the feature list are documented
  there, and also in the skills under `.claude/skills/`. **A wrong path in a skill is worse than a
  missing one**: it sends the reader to a file that does not exist.
- **A structural rule** (the one that makes the suite run, the one that separates the layers) — the most
  expensive claim to leave out of date.
- **A new or removed dependency**, a change in the contract between modules, or in the deploy flow.
- **A newly discovered trap** — add it. It is what stops the next person from paying for it again.

Also update the `{{RECORDS_DIR}}` memory files when the session invalidated them:

| Update… | When the session… |
|---|---|
| `{{RECORDS_DIR}}/techstack.md` | added/removed a dependency, changed a command or script, moved the structure, changed the dependency rule |
| `{{RECORDS_DIR}}/operations.md` | changed how it boots, a port, an environment, the deploy flow, a manual step, or how data gets seeded |

**A wrong fact in these two files is worse than a missing one** — the next session reads them as
verified and stops checking.

> If the project has context shared across repos: update **only** this project's slice. Polluting the
> neighbors' is a process error. And never record secrets, credentials or real data there.

## 2.4 — hand the session forward, if there is a memory server

**Skip this whole section when the project has no `ai-memory` MCP** (`mcp/ai-memory/README.md`). The
hardening you just wrote is the record either way; this makes it retrievable and hands the baton on.

Two calls, and they do different jobs:

**1. Write the page. This is the one that matters.** One durable page per thing the session *decided*
or *discovered* — not a log of what happened.

```
memory_write_page  path: decisions/<slug>.md | gotchas/<slug>.md
                   title, body, kind: decision | gotcha | rule | concept
```

Write it the way the hardening is written: the finding, the measurement behind it, and the
consequence. **A page nobody would act on is a page nobody needed.** Three good ones beat thirty
automatic ones.

**2. Leave a handoff, when the work is unfinished.**

```
memory_handoff_begin  summary, next_steps[], open_questions[], files_touched[]
```

A handoff is claimed exactly once, by whichever agent opens this project next — Claude, Codex, or
another. That is what it is for: **not a note you hope somebody reads, a baton that disappears when
taken.** Skip it when the session closed cleanly and nothing is pending.

### 🔴 Closing the session is a separate decision

Automatic capture only becomes prose when a session *ends*, and the lifecycle hook cannot be trusted
to do that: measured on Claude Code, closing the window ended a one-second session with two events
while the session holding 127 observations stayed open. So the end is explicit:

```bash
ai-memory finalize-session --agent <this agent> --session-id <this session>; echo "exit=$?"
```

**Finding your own session id**, because an instruction nobody can follow is not an instruction. In
Claude Code it is the directory name of the scratchpad path in your system prompt. Otherwise, ask the
server which sessions it has open and match on `cwd` and start time:

```bash
ai-memory status --json | python3 -c "import json,sys; print(json.load(sys.stdin))"   # counts, not ids
```

🔴 **If you cannot identify it with certainty, do not guess and do not fall back to "latest open".**
Say in the report that the session was left open, and why. A wrongly closed session ends someone
else's live work, and the summary it produces describes a session that never happened.

**Only run it when an LLM provider is configured.** Without one, finalizing produces a rule-based page
titled after the first event — measured: a page called `pre-tool-use` whose body was the raw event
list — and that page then pollutes every search. **A summary nobody can use is worse than no summary,
because it ranks.**

⚠️ Prefer `--session-id` over the default "latest open session". With several sessions open in one
project, "latest" closes the wrong one.

## 2.5 — did this session make the kit wrong?

```bash
node .claude/scripts/check-drift.mjs; echo "exit=$?"
```

You have just edited the source of truth. If you moved a file, changed what is versioned, added a
script beside a skill, or specialized a document, this is where you find out whether the kit still
describes the repository. It is cheap, it exits 1, and it is the only check in this kit that does.

## 3. Final validation

**The suite first** — and report the real result, not the expected one:

```bash
{{CMD_TEST}}
```

If there was production code this session, was there a red test first? If not, the rule was broken —
**record it in the report instead of hiding it**.

**Then exercise it for real** (`{{CMD_DEV}}`), following the `local-testing` skill's script. For any
change to a write flow, confirm the three non-negotiable points:

1. the input data was **not altered**;
2. the error reaches the user — not just the terminal;
3. cancelling midway does not leave the interface stuck.

**Report what you actually tested.** If you exercised 2 of 10 flows, say 2.

## What to answer

1. The path of the report you generated.
2. Whether `{{SOURCE_OF_TRUTH}}` was updated, and with what (or that nothing was needed).
3. What was validated, with what data, and **what was left out**.
4. Remember: **do not commit or push** — only when `{{OWNER}}` says so.
