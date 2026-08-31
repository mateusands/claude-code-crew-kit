---
name: end-session
description: Closes the working session — writes the permanent hardening report to .crew/hardenings/, updates the source of truth and the .crew memory files if anything they claim has changed, runs the final validation and honestly reports what was left out. Use at the end of every session.
---

# Session close

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
  - **Non-obvious technical decisions** — and the **why**. It is the most valuable content in the report.
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
