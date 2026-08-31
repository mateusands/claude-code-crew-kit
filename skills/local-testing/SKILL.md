---
name: local-testing
description: Tiered validation (L1 suite+build · L2 the production artifact opens · L3 real flow with real data · L4 hostile environment) of any change, with the recipe for computing the expected value before looking at the screen and the traps that have already produced "false green". Use before saying any change is done.
---

# Local testing — prove it at runtime, not in the suite

**A green suite is not proof that it works.** The test runs in one environment; the product runs in
another.

> Real case from this fleet: **1h20 of application downtime** with **421 green tests, a clean
> typecheck and a successful build**. A transitive dependency touched a Node API inside the browser
> bundle. All three checks run in Node — none of them is the browser.

The levels are **cumulative**: L3 without L1 is theater; L1 without L3 is faith.

| Level | What it proves | Cost |
|---|---|---|
| **L1** | the logic is right and the module does not use the wrong environment's APIs | seconds |
| **L2** | the production artifact builds and opens without errors | ~1 min |
| **L3** | the real flow, with real data, shows the right result | ~5 min |
| **L4** | it works in the genuinely hostile environment (another engine, another device, a host page) | ~10 min |

> 🔒 If the project has **no staging**, the levels stop being a recommendation and become a
> **condition for shipping**. Skipping one requires an explicit OK **asked for in advance**; a level
> that does not run is a **blocker**, not a waiver.

---

## First of all — compute the EXPECTED value

**The number first, the screen second.** If the change touches any displayed value (count, balance,
ranking, aggregate, percentage), reproduce the rule at the source and **write down the result** before
opening the interface.

Without that, L3 becomes *"I opened the screen and there was a number there"* — and a wrong number also
looks pretty. That is how a false green got caught: the screen said 18, the query said 16, and the
difference revealed that the service running was from another day.

---

## L1 — suite, static checks and build

```bash
{{CMD_TEST}}
{{CMD_TYPECHECK}}
{{CMD_LINT}}
{{CMD_BUILD}}
```

🔴 **The build is part of L1.** It catches what the suite never catches — in languages with erased
types, a type error only shows up at build time.

Rules that **only** L1 catches:

- **Environment regression:** a new module heading to the other runtime needs a test that **simulates
  the absence** of the APIs that do not exist there.
- **Arithmetic and plurals in the UI** (`1 messages`): formatting is business logic, test it as such.
- **A component that divides** (`x/total`): test with `total = 0`. `NaN%` on screen is a production bug.

## L2 — the production artifact opens

Typecheck and tests pass with a broken artifact — they are compilers, not the execution environment.
It is not enough to **compile**: it has to **open**. What matters is the startup console/log: any error
in the render path takes down the whole tree (blank screen), it does not degrade one piece.

> 🎭 **This is the level the Playwright MCP server changes the most.** L2 is a yes/no question — does
> the built artifact open without console errors? — and a browser answers it in seconds. Without one,
> L2 tends to get skipped, which is exactly how the 1h20 incident above got through. See
> `mcp/README.md`.

## L3 — real flow, with real data

1. **Bring up the stack** (`{{CMD_DEV}}`, see the `local-environment` skill).
2. ⚠️ **Confirm the processes are the CURRENT ones** — the trap that costs the most time:
   ```bash
   for p in <ports>; do printf "%s: " $p; ps -o lstart= -p $(lsof -tiTCP:$p -sTCP:LISTEN | head -1); done
   ```
3. **Seed the data IN THE WINDOW THE SCREEN SHOWS.** Every screen has its default slice (today, 30
   days, this month). Data outside the slice = empty screen, and you wrongly conclude the feature does
   not work.
4. **Exercise the flow for real**, with the console and network tab open.
   🎭 With Playwright MCP, drive it yourself; without it, ask the human to and report what they saw.
   Either way, **say which of the two happened** — "I drove it" and "I was told it works" are
   different evidence.
5. **Compare against the value you computed** in the previous step. 🔴 A browser does not exempt you
   from this: a wrong number renders exactly as prettily as a right one.
6. If the change involves **roles/permissions**, exercise with the role the rule actually restricts —
   testing only as the most powerful role proves nothing.
7. If the change involves **real time/concurrency**, exercise with **two simultaneous users**.

### What to report from L3 — always these four

1. what the screen/API showed (**pasted, not paraphrased**);
2. the expected value, side by side;
3. `ERRORS: none` — or the console/network errors found;
4. **what was NOT validated** (another browser, another role, another theme, another device).

## L4 — the hostile environment (when applicable)

Runs when the change touches global CSS, layout, bundling or integration with a third-party page:

- **another rendering engine** (the public rarely uses the same one you do);
- **a deliberately hostile host page** — global reset, `!important`, large font, dark background,
  high z-index elements — plus a **control page** without your change;
- **a real or emulated device**, not just the desktop window.

---

## 🪤 The traps that have already produced false green

1. **`200 OK` proves nothing.** After any write, **read it back** and check the field. There have been
   cases of the call succeeding and the object coming back empty.
2. **An old process holding the port.** The start script says "ready" because *some* process responds —
   including yesterday's, with the old code. **Symptom:** the screen does not match the expected value.
   **Check:** `ps -o lstart=`. **Fix:** kill it and bring it back up.
3. **Not everything has watch mode.** If the server runs in build+start mode, editing and not
   restarting means you **validated the previous code**. Usually only the frontend reloads itself.
4. **The build cache survives `rm -rf` of the dependencies** and poisons type checking with resolution
   from another branch. Symptom: an error that appears and disappears between builds of the **same**
   branch. A false "it compiled" is worse than an error.
5. **Rule order in the mock hides the path.** A mock matching the generic rule before the specific one
   intercepts the wrong call and returns empty **every time** — the code never runs and the test
   passes. Most specific rule first; and when a rule depends on a mock, **isolate it into a pure
   function** and test that directly.
6. **A new schema not applied** to the dev/test database → the query breaks and **looks like a code
   bug**.
7. **Application cache with a TTL** (minutes): if the reference data changed, restart the service.
8. **A demo/mock toggle left on** in the interface disables the real behavior — leave it off.
9. **Compare against the BASELINE before blaming your change.** Five minutes in a worktree of the base
   branch has changed the conclusion more than once.
10. **The selector lies before the code does.** When a UI test reports a serious failure, suspect the
    **selector first**: similar attributes are not the same attribute, and some frameworks mark state
    in `aria-*` instead of the native attribute.
11. **A frozen interface is not always a bug** — it may be a deliberate lock waiting for an action.
    Read the state before reporting.
12. **Do not reuse an input artifact between attempts** (the same file rewritten invalidates the
    reference the browser already held). Use a unique name per round.

---

## Afterwards

Tear down what you brought up and say **what was left in the dev database** if you seeded or altered
data. **Never point a test driver at production.**

## What to declare on delivery

The PR/report **declares the result of each level** and where each one ran. Never claim "it does not
break production" on the basis of a green suite alone. If you skipped a level: **say which, why and
with whose OK.** And declare the limits — what was not covered is worth more written down than hidden.
