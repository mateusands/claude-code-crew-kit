---
name: comments
description: What to write in a code comment and what to delete — the test for whether a comment earns its place, the four kinds that do, the two red flags that mean it does not, and TODO conventions. Use while writing or reviewing any comment, and when a diff adds comments that restate the code.
---

# Comments — the ones worth keeping

- **Can:** add, rewrite and delete comments in code you are already touching.
- **Must:** make every comment say something the code does not, at a different level than the code; delete a comment that repeats its line.
- **Cannot:** use a comment to excuse code that should be clearer, and cannot leave a comment that has stopped being true.

A comment costs a reader's attention every time the file is opened, forever. It earns that by carrying
something the code cannot carry. Most comments do not, which is why deleting is as much of this skill
as writing.

## The test, before you write one

> **Does this say something the code does not, at a different level than the code?**

Ousterhout's formulation, and the sharpest tool here: a comment adds value at a **lower** level than
the code (precision — units, bounds, what null means) or a **higher** level (intuition — what this is
for, what it guarantees). *A comment at the same level as the code repeats the code, and is worthless.*

```js
i += 1;                       // increment i by one          ← same level. Delete.
i += 1;                       // skip the BOM                ← higher level. Keep.
const t = 15000;              // ms, not seconds             ← lower level. Keep.
```

If the answer is no, you have two options and only two: **delete it**, or **make the code clearer** so
the comment is unnecessary. A comment is not a way to pay for a confusing name.

## "Why, not what" — and where that rule stops

Google's guidance is that comments explain **why** code exists, not what it does, and that code needing
a *what* comment should usually be refactored instead. Follow it — for implementation comments.

🔴 **It does not apply to interface comments, and applying it there is a common mistake.** The comment
on a function, a type or an exported constant exists so a caller never has to read the body: behaviour,
arguments, return value, side effects, errors, what the caller must guarantee. That is *what*, on
purpose. Ousterhout again: *if a user must read the code of a method in order to use it, there is no
abstraction.*

So the rule is really two rules:

| Comment on | Says | Never says |
|---|---|---|
| **an interface** (function, type, exported value) | what it does, what it promises, what it demands of the caller | how it does it |
| **an implementation** (a line, a block) | why this way, what it guards against, what breaks without it | what the line already says |

The second red flag has a name too: **implementation documentation contaminating the interface** — a
doc comment that leaks how it works. When the internals change, every caller who read it now believes
something false.

## The four that earn their place

**The constraint you are honoring.** Something outside this file forces this shape. Nothing in the code
can say so.

```js
// `--print` swallows the next argv as its value, so it MUST be `--print=<text>` and MUST come last.
```

**The failure already paid for.** The highest-value comment there is: it stops someone from
re-introducing a bug by "cleaning up". Write what was tried, what happened, and why the current shape
is not an accident.

```js
// Synchronous on purpose, up to and including registration. An earlier version awaited the baseline
// before adding the job to `active`, and a second call arriving during that await saw an empty
// registry and opened a competing epoch. Check-then-act must not straddle an await here.
```

**The invariant.** What must stay true, which no single line states.

```js
// Every path in `owned` is repo-relative and already normalised; callers must not pass absolutes.
```

**The unit, the bound, the null.** Precision the type system does not carry.

```js
// Seconds. 0 disables the cap entirely.
```

## The two that do not

**A comment that repeats its line.** `// loop over the users` above `for (const u of users)`. Delete.

**A comment apologising for the code.** *"This is a bit hacky but"*, *"not sure why this works"*. Either
understand it and say the real reason, or leave it broken-looking so the next person knows to look.
A comment that launders confusion into acceptability is worse than no comment: it stops the fix.

## Comments that have stopped being true

🔴 **A stale comment is worse than no comment, because it is trusted.** Nobody re-derives what a comment
asserts; they act on it. When you change code, the comments around it are part of the change — if the
diff makes a comment false and you leave it, you shipped a lie with a straight face.

The practical rule while editing: if you changed the behaviour a comment describes, you either update
the comment in the same diff or delete it. Never in a follow-up.

## TODO

A bare `// TODO: fix this` is a comment that will outlive everyone who could act on it. A TODO needs
the two things that make it actionable:

```js
// TODO(owner): what unblocks this, or the condition under which it must be done.
```

If you cannot name a condition, it is not a TODO — it is either work to do now or a thought to delete.

## Formatting

- **No emoji in code comments.** Severity markers belong in output a human reads, not in source. A
  comment earns urgency by what it says.
- Write full sentences. A comment is prose; it is the only part of the file that is.
- Put the comment **above** what it explains, not trailing at the end of a long line, unless it is a
  short unit or bound.
- Match the file's existing comment style — block or line, doc-comment syntax, language. A file with
  one comment in a different register reads as pasted from somewhere else.

## While reviewing a diff

Three questions, in order:

1. **Which added comments repeat their code?** Those are the easy deletions, and the most common.
2. **Which changed lines have comments above them that are now false?** This is where real damage
   hides, and a reviewer catches it more reliably than the author.
3. **What in this diff was hard to understand, and has no comment?** That is the comment the change
   actually needed — usually a constraint or a failure already paid for.

A diff that adds no comments is not suspicious. A diff that adds a comment per line is.

---

Sources: John Ousterhout, *A Philosophy of Software Design* (comment categories; the different-level
test; "comment repeats code" and "implementation documentation contaminates interface" as red flags) ·
[Google eng-practices](https://google.github.io/eng-practices/review/reviewer/comments.html) (why over
what for implementation comments; refactor instead of explaining).
