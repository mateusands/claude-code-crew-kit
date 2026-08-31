---
name: frontend
description: Interface conventions — which design system to use, where types and data come from, mandatory states, theming, permissions as UX rather than as a barrier. Researches the docs for the exact version when a library's API is uncertain, requires TDD and validates in the browser. Use when touching anything visual or stateful.
---

# Frontend — interface conventions

A guide for any UI change. It applies alongside `{{SOURCE_OF_TRUTH}}` — do not refactor without need,
do not assume a field without checking the server, permissions always revalidated on the server.

Bring it up with `{{CMD_DEV}}` at `{{LOCAL_URL}}`.

## Step 0 — research the library API when you are not sure

The stack is **version-specific** — do not assume the newest. ⚠️ And it can **diverge between branches**
(an upgrade in progress): check the manifest **on your branch** before trusting any table. Confirm in
the docs for the exact version and **cite the source** before using a prop or option you do not know
cold.

---

## 1. Which design system to use — the rule without guessing

Real projects almost always have **more than one register** coexisting: the current system and the
legacy one, or the generated component and the product's own primitive.

**Before editing a component, look at the top of the target file:**

- if it already uses the legacy system, **follow its pattern** — do not mix the two in the same
  component;
- if it uses the current system, stay in that register;
- 🔴 **never introduce the legacy system into a new file** just because the library is installed. The
  standing pattern is the current one; legacy only where it is already legacy.

**Before creating a primitive, check whether one already exists.** Relative date formatting, initials
with a color derived from an id, modal, badge — they are usually already there.

## 2. Types and data

- **Types come from the shared place.** If the shape you need is not there, it **is born there** — not
  as a duplicated interface in the screen. A duplicated type is guaranteed divergence.
- **A single HTTP client**, with helpers that **unwrap the response** and convert the error envelope
  into a typed error. Do not call the raw client outside the helpers — you lose error normalization.
- **One cache/query layer**, with the keys centralized in one place. Cursor pagination, matching the
  server.

## 3. States — what can never be missing

- **5 states** on every interactive element: default, hover, active, focus, disabled.
- **3 states** on every data panel: loading, empty, error. The query layer already exposes all three —
  do not leave any of them without visual handling.
- ⚠️ **The disabled state dims the fill, not just the text.** The default in several frameworks darkens
  only the letters and keeps the colored background — ~1.3:1 contrast on a button that still looks
  clickable. Use the project's component, not the raw one.

## 4. Theming

- **A single source for color, font and spacing.** Never write a literal value in a screen — if it is
  missing, add it to the theme.
- **Changed a global token? Check ALL the modes** (light, dark, and any scope with its own palette).
  Changing only one leaves the other broken, and a color with no counterpart in the opposite theme
  passes straight through.
- **Contrast with a number, not with the eye:** AA is 4.5:1 for text. When a button lacks contrast, what
  gets darker is the **fill** — there is no letter whiter than white.
- **Fonts/icons resolved at runtime** do not work as a function's default argument (evaluated at import
  time). And **no emoji in the interface**: the glyph changes per system, it has a fixed color that does
  not follow state, and it depends on an installed font. Use the project's icon system.

## 5. Permissions are UX, not a barrier

Hiding or disabling by role is **convenience**. The real ruler is the server — and any client-side check
**assumes the server rechecks**. Never pretend it is the only barrier.

To test role-based behavior, **switch users**; do not hardcode an id "just to test".

## 6. TDD

- Test next to the component, in `{{TESTS_DIR}}`. `should <what the user sees> when <action>` — by
  **observable output** (text, label, dispatched event), never by internal detail.
- **The selector lies before the code does.** Similar attributes are not the same attribute, and some
  frameworks mark state in `aria-*` instead of the native attribute. When a UI test reports a serious
  failure, suspect the selector first.
- **What the test does NOT cover is appearance** — there is no visual regression testing. Contrast,
  spacing and theming remain a human eye: see the `design-review` skill.

## 7. Validate green — and then open it

```bash
{{CMD_TYPECHECK}}
{{CMD_TEST}}
{{CMD_BUILD}}
```

### Green is not the same as working in the browser

Static checks and builds run over the code, not over the runtime. They do not catch the field the
server stopped sending, the `undefined.map` with real data, or the broken layout. **After green, open
`{{LOCAL_URL}}` and look**, with the console open, switching to the relevant role.

> 🎭 If the Playwright MCP server is configured, "open it and look" is something you can actually do:
> drive the flow, read the console and network tabs, switch roles, check both themes. See
> `mcp/README.md`.

If you did not open it, **say so explicitly** — do not claim "it works" based only on static checks.
**Having a browser available does not make "I opened it" the same as "I validated it"**: the expected
value still gets computed before you look (`local-testing`).

## Flow

1. Research (Step 0) if the library API is uncertain → cite the source.
2. Read the target component **and a neighbor** — find the register and the style/state pattern.
3. Types from the shared place; data through the helpers; cache keys centralized.
4. Map the impact: shared state, other screens consuming the same data.
5. TDD → green → **open the browser**.
6. **No commit/push without an order.**
