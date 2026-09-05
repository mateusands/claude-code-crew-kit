---
name: diagnosing-bugs
description: Find the cause of something that is broken, slow, flaky or intermittent — build a loop that goes red before forming any theory, rank falsifiable hypotheses, change one variable at a time, and end with a regression test or a written reason there is none. Use whenever behaviour is wrong and the cause is not yet known.
---

# Diagnosing bugs — the loop comes before the theory

- **Can:** run commands, read logs, add tagged instrumentation, and build throwaway harnesses to reproduce a failure.
- **Must:** have a command that goes red on THIS bug before forming a theory, rank hypotheses before testing any, and remove every probe before declaring done.
- **Cannot:** ship a fix without either a regression test or a written statement of why no seam exists for one.

Every other skill in this kit assumes you know what is wrong. This one is for when you do not.

## 🔴 The rule the whole skill exists for

**No red-capable command, no hypothesis.**

If you catch yourself reading code to build a theory before that command exists, stop. Theories are
free, plausible and unfalsifiable in that order, and the cost of a wrong one is not the time it takes
to have it — it is the work you build on top of it.

> **The shape:** a call hangs. Three theories arrive, each sensible: the scope is too wide, the
> command is too heavy, the input is too large. The process gets restructured around the third one
> and the hang stops, so the theory looks confirmed. It was not: changing the command changed the
> timing, and the real cause — a pipe waiting for an EOF that never came — was untouched and still
> there. Four long waits, one of them 32 minutes, and a restructuring that fixed nothing.
>
> The evidence was on screen the whole time: **39 bytes of output, the same number every run.**
> "Zero useful output" was read as absence of information when it *was* the information.

## Phase 1 — build the loop

**This is the skill. Everything after it is mechanical.** With a command that goes red on this bug,
you will find the cause; bisection, instrumentation and hypotheses all just consume it. Without one,
no amount of reading will get you there.

Spend disproportionate effort here, in roughly this order:

| | |
|---|---|
| **A failing test** | at whatever seam reaches the bug |
| **A direct invocation** | the CLI, a `curl`, one function call, with a fixture input |
| **A captured payload replayed** | save the real request or event, feed it through the path alone |
| **A throwaway harness** | the smallest subset of the system that touches the code path |
| **A differential run** | the same input through two versions or two configs, outputs diffed |
| **A bisection harness** | when it worked at a known state: automate "check at state X", then `git bisect run` |
| **A loop over randomness** | for "sometimes wrong": a thousand inputs, looking for the shape |

**Read what the process already produced before building anything.** A stalled command and a slow one
are indistinguishable from outside, and the output on disk is what separates them. A byte count that
does not move is a measurement. Whatever those few bytes say is what the process is waiting on.

### The loop has to be tight

Treat it as a product and sharpen it before you use it:

- **Fast** — seconds, not minutes. You are going to run it dozens of times.
- **Deterministic** — same verdict every run. Pin the clock, seed the randomness, isolate the
  filesystem.
- **Specific** — it asserts the symptom the human described, not "it did not crash". A loop that goes
  red for a different reason will confirm a theory about a different bug.

For an intermittent bug the goal is not a clean reproduction, it is a **higher rate**. Loop the
trigger a hundred times, run them in parallel, add load, narrow the timing window. Fifty percent is
debuggable; one percent is not.

### Completion criterion

Name **one command**, show that you **already ran it**, and show its output. It must be:

- [ ] **red on this bug** — it fails now, and would pass once the bug is gone;
- [ ] **deterministic**, or reproducing at a rate high enough to work against;
- [ ] **fast enough to run repeatedly**;
- [ ] **runnable by you**, unattended.

**If you cannot build one, stop and say so.** List what you tried and ask for what would unblock it —
access to the environment that reproduces it, a captured artifact, permission to instrument. Do not
proceed to theories without a loop; that is the whole failure this skill prevents.

## Phase 2 — reproduce, then shrink

Run the loop and watch it go red.

- [ ] It produces **the failure the human described**, not a nearby one. Wrong bug, wrong fix.
- [ ] It reproduces across runs.
- [ ] You have captured the exact symptom, so a later phase can prove it is gone.

Then cut the reproduction down: inputs, callers, config, steps — **one at a time, re-running after
each cut**, keeping only what is load-bearing. Done when removing any remaining element makes it go
green.

The small reproduction pays twice: fewer moving parts left to suspect in Phase 3, and it becomes the
regression test in Phase 5.

## Phase 3 — hypotheses, ranked, before testing any

🔴 **Write three to five, ranked, before you test the first one.** One hypothesis at a time anchors on
whatever was plausible first, and every subsequent observation gets read as support for it.

Each one states its prediction, in this shape:

> If **X** is the cause, then **changing Y** makes the bug disappear — and **changing Z** makes it worse.

**A hypothesis with no prediction is a vibe.** Sharpen it or drop it.

**Show the ranked list before testing.** The human re-ranks it in one sentence surprisingly often —
they know what shipped yesterday, and they know what they have already ruled out. Do not block on it;
if they are away, proceed with your own ranking.

⚠️ **Watch for the theory that "worked".** If a change made the symptom go away without you having
confirmed the mechanism, you have a correlation. Restore the original conditions and check that the
bug comes back. A fix you cannot make fail again is a fix you cannot trust.

## Phase 4 — instrument, one variable at a time

Each probe maps to one prediction from Phase 3.

1. **A debugger or a REPL** where the environment allows it. One breakpoint beats ten prints.
2. **Targeted output at the boundary** that distinguishes two hypotheses.
3. Never "log everything and search afterwards" — that produces volume, not signal.

**Tag every probe with a unique marker**, `[DEBUG-a4f2]` or similar, so cleanup is one search.
Untagged probes survive into production; tagged ones do not.

**For a slowdown, measure before you theorise.** Establish a baseline number first — a timing harness,
a profiler, a query plan — then bisect against it. Reading code for the slow part is guessing with
extra steps.

## Phase 5 — fix, with the test first when a seam exists

Write the regression test **before** the fix, at a seam that exercises the **real pattern** — the way
the bug actually occurs at the call site.

**If no correct seam exists, that is itself the finding.** A test at the wrong seam gives false
confidence: it passes for reasons unrelated to the bug and will keep passing when the bug returns.
Write down that the seam is missing, and why, instead of writing the test anyway.

With a seam:

1. Turn the minimal reproduction into a failing test.
2. **Watch it fail.**
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 loop against the **original, un-shrunk** scenario.

## Phase 6 — cleanup, and say what it was

- [ ] the original reproduction no longer reproduces — the Phase 1 loop, run again;
- [ ] the regression test passes, or its absence is documented with the reason;
- [ ] every tagged probe is gone — search for the marker;
- [ ] throwaway harnesses are deleted, or moved somewhere clearly marked;
- [ ] **the hypothesis that turned out right is written in the commit or the PR.**

That last line is what makes the next diagnosis cheaper. The wrong theories are worth a sentence too:
the next person will have the same three, and knowing which ones were tried and refuted is what stops
them being had again.

## What to report

1. **The loop** — the command, and its output, red and then green.
2. **The cause**, in one sentence, and the file:line where it lives.
3. **The hypotheses that were wrong**, and what refuted each.
4. **The regression test**, or the written reason there is none.
5. **What was not explained.** A bug can be fixed with a piece still unaccounted for; say which piece,
   rather than letting the fix imply the whole thing is understood.
