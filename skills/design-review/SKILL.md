---
name: design-review
description: Visual craft review of UI changes — hierarchy, typography, color, depth, states and motion, with severity and a false-positive filter. Complements codereview (which does not look at the visuals). Use before opening a UI PR, or when asked to "review the screen" / "it looks generic".
---

# Design Review — the visual craft of UI changes

`codereview` answers *"is this secure, sound and sustainable?"*. **This one answers a different
question: "did someone decide this, or did it come out on autopilot?"** — generated UI tends to be
*correct* and *unconsidered*: flat hierarchy, looks like every other dashboard.

Reports only. **Do not apply fixes without an explicit order.**

> Method adapted from [interface-design](https://github.com/Dammyjay93/interface-design) (MIT).
> Stack and token facts come from the `frontend` skill — if they diverge, that is the primary source.

---

## Step 1 — which REGISTER is the screen in?

Almost every product has more than one visual register, and applying the same pattern to both is the
foundational error. Before judging anything, name the register:

| Register | Character | What is right and what is a defect |
|---|---|---|
| **Expressive** (feed, onboarding, celebration, marketing) | can breathe, stand out, feel light | boldness is right; audit-report coldness is a defect |
| **Dense** (admin, table, operational panel, report) | density and scannability beat boldness | consistent rhythm is right; an asymmetric hero is a defect |

The same "bold" card is right in one and a defect in the other. **Look at the neighbor before
deciding the tone.**

## Step 2 — look at the whole before the detail

A component suite checks text and classes, **not appearance**. There is no visual regression testing:
**the eye is manual**. Boot it up (`{{CMD_DEV}}`), open `{{LOCAL_URL}}` in a real browser and use it
as a user.

> 🎭 **With the Playwright MCP server available, this is literal, not figurative** — open the page,
> screenshot it, hover things, tab through the focus order, toggle the theme, resize the viewport. Use
> it for lens **E** (the 5 states are hard to judge from source), lens **G** (log in as the
> lowest-privilege role and look for the hole) and lens **H** (read the computed colors instead of
> guessing the contrast).
>
> ⚠️ The browser proves what **renders**, not what was **decided**. Every lens below is still a
> judgment call — a screenshot does not tell you the hierarchy is flat.

- does something **lead**, or does everything compete equally? Squinting, does the hierarchy survive?
- does it look like **this product**, or like a generic screen?
- enter with the **lowest-privilege role** that can reach the screen (see lens G).

## Step 3 — run the lenses (each one in isolation)

**A · Hierarchy** — name the focal element (usually **not** the create form). Does it win by size,
weight, contrast or isolation? Was the secondary actually *demoted*?

**B · Typography and color** — size **+ weight + color** together, or size only? Before saying "off
the scale", **audit the values actually in use** in neighboring files — do not import a scale from
another project and do not invent one. Is the accent **semantic** or decorative? One accent per
function.

**C · Surfaces and depth** — in light mode depth comes from a border **or** a shadow, not both
stacked; in dark mode it comes from **luminance**, not shadow. **Concentric radii** (pill on
chip/avatar, larger radius on the card, smaller on the inner element) — off the steps is noise. **A
new surface color needs its counterpart in the opposite theme**, always.

**D · Composition and rhythm** — judge each register by the right standard: expressive can breathe
unevenly; dense is a list, and rhythm there is **consistent** row height.

**E · States and motion** — **5 states** on every interactive element (default, hover, active, focus,
disabled) and **3 states** on every data panel (loading, empty, error).
⚠️ **The disabled state dims the fill, not just the text** — the default in many frameworks darkens
only the letters and keeps the colored background, giving ~1.3:1 contrast on a button that still looks
clickable. Transitions ≤300ms, with **named** properties, never `transition: all`.

**F · Structure and reuse** — does the primitive already exist? A `<div onClick>` or a home-grown
popover in place of the accessible component already imported is a hack. The right question: **does an
established one already exist, and does this file reuse or duplicate it?**

**G · Visual permissions** — different roles see different screens. Test with the **lowest-privilege**
role that reaches the screen: when an element disappears/disables, does it leave a **visual hole**
(empty row, header with no body, grid with a ghost cell)? Hiding in the UI is only UX — the real ruler
is the server — but the hole left behind is a craft defect.

**H · Contrast with a number, not with the eye** — the AA minimum is **4.5:1** for normal text and
**3:1** for graphical elements. ⚠️ **There is no letter whiter than white**: when a button lacks
contrast, what gets darker is the **fill**, not the text. And remember that **text and background
darken together** — lightening only a chip's text drops the pair's contrast.

## Step 4 — severity and filter

- **Blocker** — no focal point · flat hierarchy · invented palette outside the system · mixed depth
  strategies · missing state · color with no counterpart in the opposite theme · structural hack ·
  visual hole left by permissions · contrast below AA.
- **Should-fix** — a real gap, but the screen works.
- **Note** — minor; say it once and move on.

**Discard before reporting:** personal taste with no demonstrable defect · a deliberate choice working
as intended · outside the diff's scope · already the repo's established pattern (even if you disagree)
· lint/type/formatting (that belongs to `codereview`).

## Step 5 — report

Per finding: **what came out on autopilot**, **what it costs the user**, **the concrete fix** (the real
value — token, class, component to reuse). Always with `file:line`.

---

## Quick symptoms

| Symptom | Fix |
|---|---|
| No element dominates | give size/weight/isolation to the data the user came for |
| Label and value at the same weight | the label becomes meta (smaller, bold, uppercase); the value moves up |
| Same card and same gap in both registers | separate them — expressive breathes, dense is a list |
| Accent scattered across the screen | one accent per function |
| New color with no counterpart in the opposite theme | add the remapping before calling it done |
| `<div onClick>` / home-grown component | swap for the accessible primitive already imported |
| `transition: all` | name the properties |
| An action hidden by permissions leaves a hole | handle the empty space, not just the hiding |
| Icon/glyph that does not follow state | use the project's icon system, not a loose character |

## Output

Do not approve because it renders and aligns. To pass: a clear focal point · hierarchy through
size+weight+color · semantic accent · **one** depth strategy per register · rhythm matching the
register · complete states (5 interactive / 3 panel) · consistent theme in both modes · reuse of
existing primitives · no structural hacks · no permission holes · contrast at AA.

Any blocker present → **not approved**, with explicit, actionable feedback.
