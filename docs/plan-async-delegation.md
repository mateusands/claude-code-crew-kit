# Plan — asynchronous delegation for the executor MCP servers

> Request (in one sentence): the orchestrator loses wall-clock time serialising delegated tasks it
> could run at once, and today's only way around that — the `agy-runner` subagent — is the one calling
> context Claude Code never backgrounds.

**Date:** 2026-09-01 · **Status:** awaiting OK to implement
**Base branch:** `feat/async-delegation` · **Rollback:** `e4947e1` · **Skills:** `plan`, `coder`, `backend`, `local-testing`

---

## Goal (in MY words) + acceptance criteria

Give `mcp/agy/server.mjs` a job interface — start returns a handle immediately, the orchestrator polls
— so several delegated slices run at once, from any calling context, **without weakening the git audit
that is the only reason to trust a delegated diff at all.**

The audit is the point, not the concurrency. If this lands with parallel jobs and a fuzzier audit, it
is a net loss: the kit's whole delegation story is "verification, not trust", and a report that cries
wolf on a legitimate write teaches the orchestrator to skim violations.

**Acceptance criteria**

1. `agy_start` returns a job id in under 2 seconds regardless of how long the task will run.
2. N concurrent jobs with disjoint `owned_files` in one repository produce N reports with **zero false
   `OUT-OF-SCOPE WRITE` violations**.
3. While those N jobs run, a real violation — a commit, a stage, a write owned by no running job — is
   still detected and reported.
4. The server does not exit while a job is running, even after stdin closes.
5. `agy_task` keeps working exactly as it does today, unchanged.

---

## Blocking questions (0–3) — each with a recommended default

1. **Keep `agy_task` (blocking) alongside the job tools, or replace it?**
   *Default: keep both.* For a single short delegation the blocking call is simpler and the client
   backgrounds it after 2 minutes anyway. The job tools earn their keep on fan-out, not on one task.
2. **When two jobs declare overlapping `owned_files`, refuse the second or queue it behind the first?**
   *Default: refuse*, naming the conflicting job and the overlapping path. A queue silently converts
   "parallel" into "serial" and the orchestrator plans around a throughput that is not there.
3. **Does job state survive a server restart?**
   *Default: no — in memory only.* A lost handle degrades to reading the diff, which the orchestrator
   owes the task anyway. Persistence buys little and adds a state file to keep coherent.

---

## Assumptions (numbered, specific, falsifiable)

1. **The stdio loop already serves concurrent requests.** `handle()` is invoked without `await` and
   only counted (`server.mjs:637-642`), so a second `tools/call` is processed while the first is
   outstanding. *Falsify:* send two calls before the first responds; both must get replies.
2. **Claude Code will actually issue a second `tools/call` before the first returns.** *Falsify:* call
   `agy_start` twice in one turn and watch for two ids. If the client serialises tool calls per server,
   the job tools still help subagents and headless mode but not main-session fan-out — which changes
   how much this is worth.
3. ✅ **VERIFIED — the file audit reads the whole working tree, so any concurrent writer contaminates
   it.** `gitSnapshot` captures `git status --porcelain` for the entire repo (`server.mjs:63-88`) and
   `auditSnapshots` flags every path whose status changed and is not owned (`server.mjs:134-144`).
   *Probe `crew-tests/probe-a3.sh`, 2026-09-01:* two agy jobs, A owning `a.ts` and B owning `b.ts`,
   each bracketing itself exactly as `toolAgyTask` does. Both jobs' own before→after brackets reported
   **both** files changed, producing one false violation each:

   ```
   job A  owned=['a.ts']  touched=['a.ts','b.ts']
      🔴 OUT-OF-SCOPE WRITE — `b.ts` was modified but is not in the owned files list.
   job B  owned=['b.ts']  touched=['a.ts','b.ts']
      🔴 OUT-OF-SCOPE WRITE — `a.ts` was modified but is not in the owned files list.
   ```

   The audit logic was applied as a literal port, because `node` is broken on this machine (see
   *Blocked* below) — the snapshots themselves are real `git status` output.
4. **Concurrent `owned_files` will be disjoint**, because `workflows/parallel-implementation.md`
   already requires exclusive file ownership per slice. *Falsify:* compute the intersection at
   `agy_start` — if it is ever non-empty in practice, question 2's default is wrong.
5. ✅ **VERIFIED — the `agy` CLI tolerates concurrent processes in the same working directory.** This
   was the item the whole plan hung on. *Probe `crew-tests/probe-a5.sh`, 2026-09-01, agy 1.1.22:* two
   runs launched in parallel in one repo, replicating `callAgy`'s invocation exactly. Both returned
   `status: SUCCESS` and exit 0 in ~10 s; each wrote only its own file (`a.ts`→2, `b.ts`→2); HEAD did
   not move; `~/.gemini/antigravity-cli/scratch` was untouched. No lock, no clobber, no interleaving.
   *Limit of the evidence:* two jobs, trivial single-file edits, one model
   (`gemini-3.7-flash-low`). Not proof for N large jobs.
6. **The report string stays the contract.** Nothing reads a job's outcome out of band; `agy_result`
   returns the same `report()` text `agy_task` returns today (`server.mjs:395`).

| Axis | Declaration |
|---|---|
| **Data** | No personal data. Job records hold task text, paths, timings and the executor's report — the same content already crossing this boundary today. Nothing new is logged or persisted. |
| **Failure** | If a job dies, its handle must resolve to `failed` with the reason, never hang at `working`. A crashed executor must not block other jobs or keep the server alive. |
| **Boundaries** | stdio JSON-RPC contract only. No new dependency, no network, no change to the charter, no change to what the executor may write. |
| **State** | New: an in-memory job map in the server process. Dies with the server (question 3). The git snapshot baseline becomes shared across running jobs instead of per call. |
| **Environment** | Long-lived stdio server on the developer's machine, one process per MCP client session. |
| **Scope** | `mcp/agy/server.mjs` only. **Deliberately NOT** in this change: `mcp/copilot/server.mjs` (same design, ported after agy has run real work), the codex wrapper, and the MCP Tasks extension. |
| **Test** | Covered: job lifecycle, concurrent audit correctness, server lifetime. Not covered: whether `agy` itself behaves under concurrency (assumption 5 — probed by hand, not by suite). |

---

## Current state (verified in the code, not assumed)

| What | Where (`file:line`) | Status |
|---|---|---|
| Concurrent request handling | `mcp/agy/server.mjs:637-642` | Already there — requests are not serialised |
| Server exits when idle | `mcp/agy/server.mjs:625-626` | `stdinClosed && inFlight === 0` — a detached job would zero `inFlight` and kill the server mid-work |
| Whole-tree snapshot | `mcp/agy/server.mjs:63-88` | `git status --porcelain` over the entire repo, per call |
| Ownership violation check | `mcp/agy/server.mjs:134-144` | Any changed path not in `owned` → violation. **Breaks under concurrency** |
| Global violation checks (HEAD, remotes, stash, index) | `mcp/agy/server.mjs:113-133,146-152` | Stay correct under concurrency; only attribution is lost |
| Blocking task tool | `mcp/agy/server.mjs:424` | `before → run → after → audit`, all in one request |
| Internal cap | `mcp/agy/server.mjs:23` | `DEFAULT_TIMEOUT_S = 600` — this, not any client timeout, is what cuts a long run today |
| Test harness | — | **None. The repo has no tests at all.** |

---

## Blast radius

- **Callers:** `agents/agy-runner.md` (declares `mcp__agy__agy_task` in its tools list) ·
  `workflows/parallel-implementation.md` · the delegation section of `AGENTS.md.template` ·
  `mcp/README.md` and `mcp/agy/README.md`.
- **Consumers:** every project that installed the kit and copied `mcp/agy/`. New tools are additive,
  so an old config keeps working — but the READMEs they copied will be out of date.
- **Boundaries:** the MCP stdio contract (`tools/list` grows), and the executor's charter (unchanged).
- **Twin:** 🔴 `mcp/copilot/server.mjs` is a near-duplicate of this file — same snapshot, same audit,
  same lifecycle bug. Whatever is decided here is a rule that will exist in two places. That is the
  twin protocol's exact case: fix one, declare the other, port deliberately.
- **Fallback/dead:** none removed. `agy_task` stays.
- **Today's test:** **there is none.** No suite, no fixture, no CI. Every claim about the audit today
  rests on manual runs.

---

## What changes — and what does NOT

**Shape: add, then change one function.** Not a rewrite.

**Add** four tools — `agy_start`, `agy_status`, `agy_result`, `agy_cancel` — over an in-memory job
registry with states `working → completed | failed | cancelled`. Those names mirror the MCP Tasks
lifecycle on purpose: when a client we use implements that extension, the migration is a rename, not a
redesign.

**Change** the audit from per-call bracketing to **ownership attribution**:

- one baseline snapshot taken when the first job in a `cwd` starts;
- a path that changed and belongs to **no** running job's `owned_files` is a violation, reported to
  every job running in that repo;
- a path that changed and belongs to another running job is that job's business — not a violation, and
  not in this job's `touched` list;
- HEAD / remotes / stash / index checks stay global and are reported to every running job, naming all
  of them, because a commit is forbidden regardless of who ran it.

**Change** `maybeExit()` to count running jobs alongside `inFlight`.

**Does NOT change:** the charter, what the executor may write, `agy_task`, `agy_ask`, `agy_followup`,
`agy_models`, the report format, or any dependency (still zero).

**Binding vs flexible.** Binding: the four acceptance criteria, ownership attribution as the audit
model, zero dependencies, `agy_task` untouched. Flexible: tool names, the shape of the job record,
polling interval advice, and whether `agy_cancel` kills the process or only marks intent.

---

## Gates (run now, not after coding)

| Gate | Run? | Result |
|---|---|---|
| `compliance` | Run | No personal data, no new dependency, no new third party. Clear. |
| `audit-trail` | N/A | No database, no state change by a person's action. |
| `schema` | N/A | No database. |
| `backend` | Run | Server-side code: applies to error paths and the "never fail silently" rule. |
| `frontend` / `design-review` | N/A | No UI. |
| `local-testing` | Run | This is the gate that bites — see below. |

---

## Test — SDD → BDD → TDD (which fails first, in which file)

🔴 **The first thing to build is the harness, because there isn't one.** Adding concurrency to the
audit without a test is how a silent regression gets into the one mechanism the kit tells people to
trust.

`tests/agy-server.test.mjs`, on `node:test`, driving the real server over stdio against throwaway git
repos in a temp dir, with a fake `agy` binary on `PATH` (a script that writes declared files and exits)
so nothing depends on a live model.

Order, each failing before its fix exists:

1. **`concurrent jobs do not accuse each other`** — two jobs, disjoint owned files, both write. Today's
   code produces two false `OUT-OF-SCOPE WRITE` violations. **Red first, and it fails on the code as it
   stands** — that is the proof the problem is real, not theorised.
2. **`an unowned write is still caught while jobs run`** — a third writer touches a file nobody owns;
   both reports must carry the violation.
3. **`a commit during a job is still caught`** — HEAD moves mid-flight; every running job reports it.
4. **`the server outlives stdin while a job runs`** — close stdin with a job in flight; the process must
   stay up until the job settles.
5. **`overlapping ownership is refused`** — second `agy_start` naming an owned path of a running job is
   rejected, naming both.

---

## Validation (L1/L2/L3) — and what will NOT be validated

- **L1** — `node --test` green, and the server still answers `initialize` / `tools/list`.
- **L2** — register the built server in a scratch project's `.mcp.json` and confirm the tools appear.
- **L3** — one real fan-out: three genuine slices delegated at once in a real repository, reports read
  against `git diff`.
- 🔴 **Not validated:** behaviour under a client that serialises tool calls per server (assumption 2);
  `agy`'s own tolerance of concurrent runs beyond the manual probe (assumption 5); anything about
  `copilot` or `codex`; Windows.

---

## Risk · rollback · rollout order

| Risk | Mitigation |
|---|---|
| 🔴 A weakened audit lets a real violation through | Tests 2 and 3 exist precisely for this and must be written before the audit changes |
| ~~`agy` collides with itself under concurrency~~ | **Retired — probed and disproved (assumption 5).** |
| The twin (`copilot`) drifts | Port deliberately in a second pass, or declare in `mcp/copilot/README.md` that it has not been ported |
| A job leaks and keeps the server alive forever | TTL on the job registry; `agy`'s own `timeout_s` already caps the process |

**Rollback:** `e4947e1`. Additive tools mean an old `.mcp.json` keeps working; reverting the audit
change restores per-call bracketing exactly.

**Rollout order:** ~~probe assumption 5~~ ✅ → **harness + failing tests (blocked, see below)** →
audit attribution → job tools → lifecycle fix → docs → port to `copilot` as a separate change.

---

## Blocked — `node` does not run on this machine

`/usr/bin/node` (nodejs 26.7.0-2) fails with `libada.so.3: cannot open shared object file`; the system
carries `libada.so.4`. A partial upgrade left the binary linked against the previous soname.

This blocks the test harness, which needs `node --test` — and it also means **the agy and copilot MCP
servers cannot start at all right now**, since both run under `node`. The probes above were unaffected
only because `agy` is a standalone ELF binary.

Two permanent ways out, both the human's call: a full system upgrade (`sudo pacman -Syu`) to get a
rebuilt `nodejs`, or a user-local Node install that leaves system packages alone.

✅ **Unblocked in the meantime.** The machine has Electron 40, which runs as a Node runtime:

```bash
ELECTRON_RUN_AS_NODE=1 /usr/lib/electron40/electron --version   # v24.15.0
```

That is enough for `--check`, for `node:test`, and for driving the server over stdio — the whole
harness. It is a local workaround, not a fix: the `.mcp.json` entries still say `"command": "node"`,
so **the MCP servers themselves stay dead for Claude Code until the real node is repaired.** Nothing
in the repository should be changed to depend on Electron.

---

## Found while probing — out of scope, fix separately

🔴 **`effort` and the default model contradict each other, and every call that sets both fails.**
`agy models` shows the effort is baked into the model name — `gemini-3.7-flash-high`, `-medium`,
`-low`. `callAgy` pushes `--model` and `--effort` independently (`server.mjs:232-234`) and
`toolAgyTask` passes `model: a.model || DEFAULT_MODEL` alongside `effort: a.effort`
(`server.mjs:445-446`). So a caller that sets `effort` without overriding `model` gets:

```
{"status":"ERROR","error":"invalid model selection (--model \"gemini-3.7-flash-high\" --effort \"low\"):
 --model gemini-3.7-flash-high conflicts with --effort=low"}
```

The tool schema actively invites this — `effort`'s own description said *"Match it to the task"*
(`server.mjs:335`).

**Correction on `copilot`:** an earlier draft of this document claimed the same defect there. It does
not follow. `mcp/copilot/server.mjs:41` defaults `DEFAULT_MODEL` to `""`, so `--model` is not sent
unless someone sets `COPILOT_MCP_MODEL`, and no contradiction arises by default. Whether the
`copilot` CLI even accepts `--effort` could not be checked, because `copilot` is a node script and
node is broken here (see *Blocked*). Left alone until it can be verified.

The flag is not useless: `claude-sonnet-4-6` and `claude-opus-4-6-thinking` carry no suffix, so
`--effort` is meaningful for them. **Fixed in this branch**, conditionally rather than by deletion:
`--effort` is suppressed when the model name already encodes the same effort, and a mismatch is
refused up front with the sibling model name in the message. It does not auto-rewrite the model —
`gemini-3.1-pro` ships `-high` and `-low` but no `-medium`, so guessing the sibling would invent a
model that does not exist.

---

## Deviations

*(empty at plan time — `coder` fills this: OPEN → ADDRESSED → INCORPORATED)*

---

## Verdict

🟢 **Ready to implement.** The condition is discharged: assumption 5 was probed and holds, and
assumption 3 — the reason this change exists — was reproduced rather than argued, with the false
violation printed verbatim.

The harness is no longer blocked: Electron 40 provides a working Node v24.15.0 for tests, even though
the servers themselves cannot start under Claude Code until the system `node` is repaired. So the plan
can proceed through harness → failing tests → audit attribution, and only the final end-to-end
validation (L2/L3) waits on the repair.
