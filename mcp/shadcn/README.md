# shadcn — component registry access

```jsonc
{ "mcpServers": { "shadcn": { "command": "npx", "args": ["shadcn@latest", "mcp"] } } }
```

Or let it configure itself: `pnpm dlx shadcn@latest mcp init --client claude`
(also supports `cursor`, `vscode`, `codex`).

It exposes: browse a registry, search components by name or function, and install one from a natural
language request. It supports private and third-party registries, not only shadcn/ui.

## 🔴 Only install this if the project already uses shadcn

It needs a **`components.json`** in the project to work properly. It is not a general-purpose UI
helper — it is a client for a component registry that the project has already adopted.

```bash
test -f components.json && echo "yes — this MCP applies" || echo "no — skip it"
```

On a project using MUI, Chakra, Ant, Mantine, a Tailwind-only setup, or a house design system, this
server is **worse than useless**: it costs context on every session and offers an agent a tempting
path straight out of the project's conventions.

## 🔴 The conflict you have to manage

The `frontend` skill says, in order of priority:

> *"Before creating a primitive, check whether one already exists."*
> *"Look at the top of the target file… follow its pattern. Never introduce the legacy system into a
> new file just because the library is installed."*

This MCP makes **installing a new component** the easiest action available — one sentence and it is
in. That is the opposite of the reflex the skill is trying to build. Left unmanaged, it produces a
codebase with three date pickers: the project's own, the one from a previous rush, and the one an
agent installed last Tuesday.

**The rule that keeps it useful:**

1. **Search the project first**, always. `grep` for an existing primitive before you search a registry.
2. **The registry is a source of reference, not a shortcut.** Reading how shadcn builds a component
   and applying that to the project's own primitive is the high-value use. Installing over the top of
   an existing primitive is the failure mode.
3. 🔴 **Installing a component is a dependency change.** It writes files, and it usually pulls in
   Radix packages. That means the **`compliance` gate runs first** — licence check before install —
   and `{{OWNER}}` decides, exactly like any other dependency.
4. **Never install during a review.** `codereview` and `design-review` report; they do not add
   packages.

## Where it genuinely pays

- **Greenfield in a shadcn project** — scaffolding forms, dialogs, tables and command menus that the
  project has not built yet.
- **Reference for accessibility** — shadcn components carry focus management, ARIA and keyboard
  handling that a hand-rolled `<div onClick>` will not. That is the exact hack `design-review` lens F
  flags, and reading a correct implementation is the cheapest fix.
- **A private registry** — if your team publishes its own design system to a registry, this is how an
  agent discovers it, and then the "reuse, do not duplicate" rule points *here* instead of away.

## What it does not do

It does not review your UI. The screen still has to be opened and looked at
([`../playwright/README.md`](../playwright/README.md)), and judged against `design-review`. A
correctly installed component in a screen with a flat hierarchy is still a flat hierarchy.
