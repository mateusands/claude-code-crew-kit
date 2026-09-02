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
| `audit-blindspots.test.mjs` | the holes an independent review found — each starting from a **dirty** tree |

🔴 **The second file is the one that matters.** Making concurrent jobs stop accusing each other means
teaching the audit to ignore something, and an exemption that widens by accident is how the whole
delegation guarantee dies quietly. So every real violation is pinned down: a write nobody declared, a
commit nobody may make, two jobs claiming one file, and a lone job writing out of scope. Never relax
one of those assertions to make a change pass.

Both races in the epoch logic were caught here rather than in production — one where two jobs opened
competing epochs, one where a fast executor wrote before the baseline snapshot completed. Neither is
visible by reading the code; both are one assertion away.

🔴 **`audit-blindspots.test.mjs` exists because 21 green tests were not enough.** Every one of them
started from a clean working tree, so none exercised the case that matters most: a repository someone
is already working in. An independent review found four defects there, the worst of which let an
executor overwrite any file the human had already touched without the audit saying a word. When you
add a test here, start dirty.

Scratch work — probes, dumps, fixture repos — belongs in `crew-tests/`, which is gitignored. What
lives here is the evidence that travels with the code.
