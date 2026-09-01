# tests

Runs the real MCP servers over stdio, against throwaway git repositories, with a stand-in for the
executor CLI — so the suite costs nothing and needs no model, no network and no account.

```bash
node --test tests/
```

| File | What it covers |
|---|---|
| `helpers.mjs` | an MCP stdio client, and git fixtures |
| `audit-concurrency.test.mjs` | test 1 of [`../docs/plan-async-delegation.md`](../docs/plan-async-delegation.md) |

🔴 **`audit-concurrency.test.mjs` fails on purpose right now.** It is the red that the audit rework
has to turn green: two delegated jobs with disjoint ownership run at once, and each one's report
accuses the other of an out-of-scope write. The bug is real — per-call `git status` bracketing
(`mcp/agy/server.mjs:63-88,134-144`) puts one job's legitimate write inside the other's snapshot.
Do not "fix" it by relaxing the assertion.

Scratch work — probes, dumps, fixture repos — belongs in `crew-tests/`, which is gitignored. What
lives here is the evidence that travels with the code.
