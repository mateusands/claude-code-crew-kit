---
name: start-session
description: Initializes the working session — reads the project's source of truth, the .crew memory (techstack, operations, hardenings), the real git state and the loose ends from the last session, in READ-ONLY mode, creates the memory files if missing, expires old plans, and confirms scope alignment and active gates before any code. Use at the start of every session.
---

# Session start

- **Can:** read the source of truth, the `{{RECORDS_DIR}}` memory and the real git state; create the memory files if they are missing; expire plans past their 7 days.
- **Must:** read `info.md` fresh rather than from memory, state the mode it declares, and confirm scope and the active gates before any code.
- **Cannot:** touch product code — the session opens READ-ONLY — and cannot delete anything under `hardenings/`.

The goal right now is **not to code**: it is to load context and confirm we are in the right scope.
Wrong context at the start costs the whole session.

## 1. Absorb the source of truth

Read, in this order:

1. 🔴 **`{{RECORDS_DIR}}/info.md`** (authority) **and `.crew-kit-config`** (this machine's roster): who reviews, who
   decides each gate. **Read it fresh, never from memory of a previous session**, and state the mode
   in your opening report. In `solo` mode there is no cross-review, and every later report must say so.
2. **`{{SOURCE_OF_TRUTH}}`** — architecture, conventions, traps already paid for.
3. **`{{RECORDS_DIR}}/techstack.md`** — what the stack is: versions, commands, structure.
4. **`{{RECORDS_DIR}}/operations.md`** — how it runs: environments, deploy, branches, ports, seeds.
5. **The most recent `{{RECORDS_DIR}}/hardenings/*.md`** — the last session's report. That is where the
   loose ends nobody else remembers live. If the task touches an area you do not know, `grep` the older
   ones too: that folder is the accumulated memory.
6. **Today's plans**, if any: `{{RECORDS_DIR}}/plans-local/<today>/`.
7. **The dependency surface** — run the **`dependencies`** skill. It is the one gate triggered by
   time rather than by a diff: an advisory that landed last week appears in no `git diff`, and the
   cost of finding out is one command.
8. **The real git state** (read-only):
   ```bash
   git status --short && git branch --show-current && git log --oneline -10
   ```

### If `info.md`, `language.md`, `techstack.md` or `operations.md` do not exist, create them now

🔴 **The roster is not in `info.md`.** Read `.crew-kit-config` at the repository root for which agents
this machine actually reaches; `info.md` holds only the project's authority. If `.crew-kit-config` is
missing, copy it from `.crew-kit-config.example`, and until it is filled in **assume `solo`** — an
assumed reviewer is the one failure the mode declaration exists to prevent.

**The mode you state is the derived one:** the smaller of what `info.md` permits and what the roster
reaches. Say both in the opening, so a reader can see why: *"project allows crew; this machine has
claude only; running solo."*

For `info.md`, copy `crew-info.md.template` and **ask the human which mode applies** — do not assume
`crew` because the MCP servers happen to be configured. A roster listing agents that are not actually
reachable is worse than `solo`, because the process will expect reviews that never happen.

### For `techstack.md` and `operations.md`

They are the two files that stop every session from rediscovering the same facts. Fill them with what
you **verify in the code** — the manifest, the scripts, the entry point, the tree. Where you have no
answer, write `<unknown — needs confirmation>`; never invent one.

| File | What goes in it |
|---|---|
| `techstack.md` | language and versions · framework · package manager · the real commands (test, lint, build, dev) · directory structure · the dependency rule (who may import whom) |
| `operations.md` | how to bring it up locally · ports and URLs · environments and which branch ships where · what does NOT run automatically on deploy (migrations, seeds, cache) · where the logs are · how to seed data |

This is a **one-time cost per project**, and it is the highest-return writing you will do all session.

### Housekeeping — expire the old plans

`plans-local/` holds 7 days. Remove what is past that, listing what you removed:

```bash
find {{RECORDS_DIR}}/plans-local -mindepth 1 -maxdepth 1 -type d -mtime +7 -print
```

Check the list, then delete those directories.

🔴 **This applies to `plans-local/` only.** `hardenings/`, `techstack.md` and `operations.md` are
permanent — **nothing ever expires them automatically**. They are the project's memory; a plan is
scaffolding.

> If the project uses context shared across repos (vault, wiki, common folder), **read only this
> project's slice**. Loading the neighbors' context pollutes the session — and if that context is a
> git clone, **confirm it is up to date before reading**: stale context makes you absorb the wrong
> thing without noticing.

## 1.5 — does the kit still describe this repository?

```bash
node .claude/scripts/check-drift.mjs; echo "exit=$?"
```

One command, and it is the only gate here that can fail. It catches the class of defect this skill
cannot: the sentence in a skill that was true when it was written. A skill claiming a file is
gitignored after it started being versioned, a link to a file that moved, a placeholder nobody
filled, a script shipped beside a skill the skill never mentions — none of those break anything, so
nothing reports them, and they get believed precisely because a skill is where facts are trusted.

**`exit=1` is not a reason to stop working.** It is a reason to fix the document before you act on
it, and to say in the report that you did.

## 2. Read only what the task requires

Do not load the whole repository. The efficient path is always the same:
**the file that wires everything together → the target of the task → one neighbor of the same kind,
to pick up the pattern.**

## 3. READ-ONLY MODE

At this stage it is **forbidden** to change code or create or delete files. If you find the obvious
one-line bug, **write it down** — do not fix it yet.

---

## Gates that apply to this session

Confirm explicitly that they are active (adapt the list to the project — these are the ones that
repeat in any repository):

- **Integrity of `{{CRITICAL_ASSET}}`** — never destroy or overwrite what the user cannot recover;
  never fail silently.
- **The source of truth is the code.** If `{{SOURCE_OF_TRUTH}}` claims something the code
  contradicts, the code wins — and the document gets updated at the end of the session.
- **SDD → BDD → TDD** — spec at the top of the test, behavior in business language, red test before
  production code.
- **Green is not enough** — the suite proves the contract, not the product. Real validation is
  exercising it (see the `local-testing` skill).
- **Content gates** — if the task touches `{{SENSITIVE_DATA}}`, a new dependency or
  `{{RED_ZONE}}`, the `compliance` skill runs **before** writing, not after.
- **No commit/push without an explicit order from `{{OWNER}}`.**

---

## What to answer

Keep the return **short**, in 4 lines:

1. **The mode** from `info.md` (solo / duo / crew), and the current branch and whether the tree is clean.
2. What we are going to touch this session (file/module/screen).
3. Whether there was a loose end from the previous session — and which.
4. One sentence confirming the gates above are active.
5. Only if something changed in `{{RECORDS_DIR}}`: which memory files you created, and which expired
   plans you removed. If nothing changed, say nothing — silence is the normal case here.

If reading the context revealed that something changed since the last session, **say so in one line**.
