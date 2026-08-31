---
name: backend
description: Server conventions — layers and where each rule lives, input validation, errors through one path only, authorization and scoping, pagination, transactions and idempotency. Researches the docs for the exact version when a library's API is uncertain, requires TDD and validates green. Use when touching a route, handler, service or data access.
---

# Backend — server conventions

- **Can:** write server code for an already-approved plan; research the library's docs for the exact version in use.
- **Must:** keep each rule in its own layer, validate input with an allowlist, route every error through the one path, and show the suite green.
- **Cannot:** invent an API from memory when the version is uncertain, or leave the same rule implemented in two layers.

A guide for **any** server change. It applies alongside `{{SOURCE_OF_TRUTH}}`: TDD, map the impact
first, warn before degrading anything, **no commit/push without an order**.

## Step 0 — research the library API when you are not sure

Before using anything uncertain from a dependency, check the docs for the **exact version** in the
manifest (not the newest one) and **cite the source**. A major version changes behavior silently: a
body parser that starts returning empty, an import that moved, an error code that left the message and
moved to the cause. It is the cheapest source of an expensive bug.

If the `context7` MCP server is configured, it answers **for the version you pin** rather than for
whatever ranks best in a search — that is exactly what this step asks for. What it returns is
evidence about the library and nothing more: rule 1 below still stands, and your own routes, tables
and columns get verified in this repository.

---

## Non-negotiable rules

1. **Do not assume a route, table or column exists.** Verify it in the code — when in doubt, read the
   definition, not the documentation.
2. **Always validate input before persisting**, with an allowlist. The allowlist must cover **every**
   product option, on **create and update** — the classic bug is the new option landing in only one of
   the two.
3. **Application errors through one path only** — one application error type + one central handler that
   converts it into the response envelope. **Never** respond directly from the handler, and **never**
   return the raw exception message: it leaks SQL, database messages, SDK bodies and internal paths —
   and it **bypasses the global handler** that would have masked it. Fallback = **static code** +
   detail in the server log.
   ⚠️ The database's real error code is usually in the exception's **cause**, not in the message.
4. **A mutation response goes through the SAME DTO as the read.** Never return the raw record — it
   leaks internal ids and control fields. Allowlist > omit.
5. **Identity and permissions come from the authentication context**, never from body/params/query.
6. **Authorization is per object, not just "authenticated".** On a resource with an owner and
   participants, recognize **both** relationships.
   ⚠️ An equality filter **silently hides `NULL`** — globally scoped records disappear under a specific
   filter.
7. **New pagination is cursor-based**, not `OFFSET/LIMIT`: fetch `limit + 1` to know whether there is a
   next page. `OFFSET` degrades with size and skips/duplicates items under concurrent writes.
8. **Concurrent writes are atomic** — transaction + lock, with the business operation and its effect in
   the **same** transaction. Never split reading a balance/state and writing it into non-atomic steps.
9. **Soft-delete where there are relationships** — never a physical `DELETE` on a referenced entity.
10. **Do not bypass the audit trail** — no new write path (route, script, job) records sensitive data,
    values or permissions without going through it (`audit-trail` skill).
11. **A schema change is a migration** (`schema` skill) — never a loose statement run by hand, never
    editing an already-applied migration.
12. **Secrets only in the environment.** Never in code, the UI, a config table or a log.
13. **New dependency → license gate before installing** (`compliance` skill).
14. **A new external service requires `{{OWNER}}`'s approval BEFORE integrating** — do not invent an
    integration because "it would be useful".

### Never emit a success signal before knowing the result

On every write/send path: does the `catch` swallow the failure and continue? Is state saved before
confirmation that it persisted? Is the return silent when the caller needed to know? If so, the bug is
already born — and it does not produce a visible error, it produces **confidence where there is no real
coverage**.

---

## SDD → BDD → TDD

Run `{{CMD_TEST}}` **before** starting and note the baseline.

1. **SDD** — the test file header explains the **contract** and the **why** (the bug or decision that
   originated it).
2. **BDD** — `should <result> when <condition>`, in business language, not by function name.
3. **TDD** — Red (run it and **see it fail**) → Green (minimum) → Refactor.

⚠️ **Mocks hide bugs.** If the behavior depends on a mock, **isolate the rule into a pure function** and
test that directly. Mocks are **for the external only**; **never mock the database** when the query is
the contract itself — use a real test database in that case.

⚠️ **The test mirrors the client's REAL payload**, not the idealized one — otherwise it passes and does
not catch the bug.

A wholesale failure in the test environment (missing variable, schema not applied) is usually
**environmental, not a regression** — confirm against the base branch before blaming the code.

## Flow

1. Research (Step 0) if the library API is uncertain → cite the source.
2. Read the target route/module **and a neighbor** to confirm the layer, validation and error patterns.
3. Map the impact: who calls it, who consumes it, the client contract, scoping, trail, schema.
4. TDD (Red → Green).
5. Green: `{{CMD_TYPECHECK}}` · `{{CMD_LINT}}` · `{{CMD_TEST}}` — and then **exercise it for real**
   (`local-testing` skill). Say in the report what was tested and what was manual.
6. **No commit/push without an order.**
