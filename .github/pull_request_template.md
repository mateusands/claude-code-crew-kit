## Context

The problem in one sentence: who suffers, what they see today, what they should see.
If it is a bug, how to reproduce it. If it is an improvement, what made it worth doing now.

## What changes

The solution, and why this shape rather than another. Cite `file:line` for anything central.

## What does NOT change

The boundary, stated. Without it a fix reads as a refactor.

## How to validate

| Level | What it covers | Result |
|---|---|---|
| N1 | `npm test` + `node --check` on each `server.mjs` and on `core.mjs` | |
| N2 | The servers answer `initialize` and `tools/list` over stdio | |
| N3 | End to end against the real executor CLI, in a throwaway repository | |

**Not covered:** what was left out, and why.

## Behaviour change

Yes/No. If yes: what the orchestrator or the executor now sees differently.

## Risk and rollback

The worst path is the one that LOOKS like success: an audit that lets an out-of-scope write through, a
job reporting DONE having written nothing, a green verdict on a tree nobody opened. Name the SHA to
`git revert` to.

## Merge order

If it stacks on another PR, say which and why the order matters.

<!--
═══════════════════════════════════════════════════════════════════════════════
WRITING RULES — delete this block before opening the PR

Write the PR in English. Every commit, release and document in this repository is in English;
one PR in another language is a seam in the history.

No internal-tool attribution. Not "the reviewer agent found", not "the second opinion said".
The PR is read as one developer's work: a finding enters by what it is and how it was proven,
and the proof is what carries authority, not who produced it.

Few emotes. At most where they mark real severity inside a table. A PR body is not a chat.

Result, not intention. "Ran N1" is worth nothing; "N1: 30 tests, 30 pass" is. Paste the number.

Declare what was NOT covered. A PR listing only what passed is read as full coverage.
A written limit is worth more than a hidden one.

Title: `type(scope): objective description`, and `[n/N]` when the PR is one of a queue.

───────────────────────────────────────────────────────────────────────────────
TRAPS THAT HAVE ALREADY COST A ROUND IN THIS REPOSITORY

A green suite does not prove runtime. Twenty-one tests passed while the audit had four holes —
all of them because every test started from a CLEAN tree, which is not what a repository in use
looks like. When you write an audit test, start dirty.

The documented command has to work on other people's version. `node --test tests/` works on
Node 26 and fails on 22 with `Cannot find module`. It was the first command in the README, and
a green suite looked like a broken kit. Run `npm test`, which names the files.

git records THAT a file changed, never WHO changed it. Your own concurrent writes are
indistinguishable from an executor going out of scope. If you touched the tree while a job ran,
declare it (`reserved_files` or `orchestrator_writing`) before treating a violation as real.

An MCP server cannot wake its client. The completion signal comes from the host backgrounding
`*_await` — polling `*_status` in a loop does not substitute for it, it just burns turns.
═══════════════════════════════════════════════════════════════════════════════
-->
