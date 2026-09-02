# tests

Runs the real MCP servers over stdio, against throwaway git repositories, with a stand-in for the
executor CLI — so the suite costs nothing and needs no model, no network and no account.

```bash
node --test tests/
```

| File | What it covers |
|---|---|
| `helpers.mjs` | an MCP stdio client, and git fixtures |
| `audit-concurrency.test.mjs` | jobs running at once must not accuse each other |
| `audit-integrity.test.mjs` | …and the audit must still catch what it is for |
| `job-handles.test.mjs` | `*_start` returns at once, `*_await` settles, `*_cancel` says the tree is left half-written |
| `backends.test.mjs` | the same contract asserted against **every** backend on `mcp/lib/core.mjs` |

🔴 **The second file is the one that matters.** Making concurrent jobs stop accusing each other means
teaching the audit to ignore something, and an exemption that widens by accident is how the whole
delegation guarantee dies quietly. So every real violation is pinned down: a write nobody declared, a
commit nobody may make, two jobs claiming one file, and a lone job writing out of scope. Never relax
one of those assertions to make a change pass.

Both races in the epoch logic were caught here rather than in production — one where two jobs opened
competing epochs, one where a fast executor wrote before the baseline snapshot completed. Neither is
visible by reading the code; both are one assertion away.

Scratch work — probes, dumps, fixture repos — belongs in `crew-tests/`, which is gitignored. What
lives here is the evidence that travels with the code.
