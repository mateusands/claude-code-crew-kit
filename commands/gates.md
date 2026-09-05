---
description: Triggers the gates the current diff's content requires — and explicitly says which ones do not apply.
---

## Gate 0 — the exit status, before any other gate

🔴 **A gate you cannot fail is not a gate.** Every command you run as proof gets its status read and
written down:

```bash
<the command>; echo "exit=$?"
```

**Never a pipe as proof.** `cmd | grep passed`, `cmd | tail -1`, or `cmd > log` followed by
`grep passed log` all report **the exit status of the last command in the line — not of the command
you were testing**. Measured: a script printing `5 passed, 2 failed` and exiting **1** returns
`exit=0` through every one of those three forms. A suite can fail for days behind a green report that
way, and nobody is lying.

**If you needed `grep` to find out whether it passed, you do not know whether it passed.** Read the
number, then read the status; they answer different questions, and only the second one is the gate.

Look at what changed (`git status` + `git diff`, plus new untracked files) and **trigger the gates by
the CONTENT of the diff, not by your judgment**.

| If the diff touches… | Run |
|---|---|
| personal data, new logs/telemetry, external service, new dependency | `compliance` skill |
| a manifest or lockfile (`package.json`, `pnpm-lock.yaml`, `requirements.txt`, `go.mod`, `Cargo.toml`…) | `dependencies` skill |
| a database write by a person's action or a job | `audit-trail` skill |
| table, column, index, migration | `schema` skill |
| route, handler, middleware, serialization | `backend` skill |
| screen, component, state, theme | `frontend` + `design-review` skills |
| anything that can only be proven by running it | `local-testing` skill |

Rules:

- The gate is conditional on the **content**, not on your risk assessment. When in doubt, run it.
- 🔴 **`dependencies` is the one gate that also fires on time, not only on content.** Nothing in a diff
  tells you an advisory landed last week. Run it at the start of a session and before a release even
  when the diff touches no manifest at all.
- **Declare what does NOT apply**, instead of omitting it. "No compliance findings" has to mean
  *I ran it and found nothing*, not *I did not look*.
- If any gate requires written authorization from `{{OWNER}}`, **STOP** and say which — do not keep
  coding.

Answer with a `Gate | Run? | Result` table and, at the end, the verdict:
**🟢 clear to proceed · 🟡 proceed with a named caveat · 🔴 stopped, awaiting a decision**.
