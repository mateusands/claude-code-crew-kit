# Playwright — the browser the review skills assume

```jsonc
{ "mcpServers": { "playwright": { "command": "npx", "args": ["-y", "@playwright/mcp@0.0.80"] } } }
```

Nothing else to install; `npx` fetches it. The first run downloads a browser.

The version is pinned, and this package is the strongest case for it in the kit: `latest` sits on the
**0.0.x** line, where semver promises nothing between releases, across 433 published versions. `npx`
resolves at every session start, so `@latest` means whatever shipped upstream this afternoon drives
your browser tonight. Raise the pin deliberately, after reading what changed.

## Why this one is the default

Two skills in this kit rest on the same claim: a green suite does not prove the product works, so
someone has to **open it and look**. Without a browser an agent can only say "the code looks right" —
the exact false confidence those skills exist to prevent.

| Skill | What the browser unlocks |
|---|---|
| `design-review` | see the rendered screen · the 5 interactive and 3 panel states · light vs dark · the visual hole a permission leaves behind · computed contrast instead of a guess |
| `local-testing` | **L2** does the built artifact actually open? · **L3** drive the real flow with the console and network tabs open · **L4** another engine, another viewport, a hostile host page |
| `frontend` | after green, actually open `{{LOCAL_URL}}` with real data |

## 🔴 This is the orchestrator's tool, not a delegated one

Design review is **not delegable**. The delegated executor (`agy`) cannot run commands and has no
browser: it can write a component, but it cannot see it. So the split is:

```
agy         → writes the component        (skills: coder + frontend)
Claude      → opens it in Playwright and reviews it   (skills: design-review + local-testing)
```

Never accept "the component is done" from an executor as evidence that the screen is right. Nobody in
that chain looked at it.

## The rule that comes with having a browser

**"I opened it" is not "I validated it."** `local-testing` still requires computing the expected
value **before** looking at the screen — a wrong number renders exactly as prettily as a right one.
Report what you saw pasted, not paraphrased, and say what you did not check (another role, another
theme, another device).

⚠️ Never point it at production. It drives a real browser against whatever URL you give it.
