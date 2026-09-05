---
name: writing-for-agents
description: How to write a document an agent will run — a skill, an AGENTS.md, a workflow, a prompt. Covers what earns permanent context, where material sits between inline and disclosed, how a step's completion criterion drives thoroughness, and why a prohibition activates what it forbids. Use when creating or editing any of them.
---

# Writing for agents — the document is a process, not a text

- **Can:** restructure, split, prune and rename any document in this kit.
- **Must:** state which of the two loads each addition spends, and keep one meaning in one place.
- **Cannot:** add a rule without a reason attached, or leave a prohibition standing without the
  positive behaviour beside it.

A document for a human is judged by what the reader understands. A document for an agent is judged by
**what the agent does on a run it has not had yet**. Those come apart: a paragraph that reads well and
changes no behaviour is a cost with no return, and it is the most common thing in a bad skill file.

## The two budgets, and which one each addition spends

| | What it costs | Who pays |
|---|---|---|
| **Context** | tokens and attention on **every turn**, whether or not the material fires | the agent |
| **Attention of the human** | remembering that the document exists and when to reach for it | you |

A skill's `description`, a line in `AGENTS.md`, anything always loaded: context. Material behind a
pointer costs only the pointer's own line. Material with no pointer at all costs nothing in context
and everything in memory — the human is the index.

🔴 **Neither budget is to be minimised.** Human attention is the price of human agency: spend it where
judgment matters, and take it back where it does not.

### Invocation is the lever on the first budget

In Claude Code, two frontmatter fields decide who can reach a skill, and the second column is the one
people miss:

| Frontmatter | Human | Agent | Description in context |
|---|---|---|---|
| *(default)* | yes | yes | **always** |
| `disable-model-invocation: true` | yes | no | **never** |
| `user-invocable: false` | no | yes | always |

**Give a skill a description only if the agent must reach it on its own, or another skill must.** A
skill that only ever fires because a human typed it pays permanent context for discoverability nobody
uses. Anything with side effects the human times — starting or ending a session, onboarding, a deploy
— belongs in the second row.

⚠️ **A user-invoked skill cannot be reached by another skill either.** Shared material two of them
need lives in neither: put it in a plain file both point at.

## Where each piece sits

Three rungs, ordered by how immediately the agent needs the material:

1. **A step in the file** — what the agent does, in order. The primary tier.
2. **Reference in the file** — consulted on demand. Often a flat list of peers, which is a legitimate
   shape, not a smell.
3. **Reference behind a pointer** — a separate file, loaded only when the pointer fires.

**The branching test decides the rung:** inline what every run needs, disclose what only some runs
reach. Push too little down and the top bloats; push too much and the agent never sees what it needed.

🔴 **A document with steps buries them under long in-file reference.** When the steps are the point,
reference that could be disclosed does not merely lengthen the file — it turns following the steps
into a coin flip.

**Sprawl** is the failure even when every line is live and unique: attention thins across the excess.
Measured here — a review skill grew past 390 lines, and the effect showed up as a delegated reviewer
that spent its budget reading the procedure and arrived at the diff with nothing left. The reply came
back; it was just about nothing.

**Keep a concept whole where it sits.** Definition, rule and caveat under one heading, so reading one
brings the others. Scattering one meaning across a file is a different defect from repeating it in
two places, and it is harder to see.

## Steps end on a criterion

Every step needs the condition that says it is done, and two properties make that condition a lever:

**Can the agent tell done from not-done?** A soft bound — "once you understand the module" — invites
stopping early, with attention already on the steps ahead. Sharpen the bound first; it is cheap and
local. Only if it is irreducibly fuzzy *and* you see the rush, split the sequence so the later steps
are not in view.

**How much does it demand?** "Every handler accounted for, with the number" forces work that "review
the routes" does not. The demand is what produces the digging, and it binds a flat list of rules as
well as a sequence: *every rule applied* is an exhaustiveness bar on reference.

**The strongest criteria are checkable and exhaustive.** This kit's version of that is a command with
an exit status: `<command>; echo "exit=$?"`. Where one exists, it beats any sentence.

## One word instead of a paragraph

A word the model already knows anchors a whole region of behaviour at the cost of one token, because
it recruits what the model brings rather than what you wrote. *Tight* carries fast-deterministic-
specific. *Red* turns "a loop you believe in" into a binary you can observe. **Repeat the word, never
the definition** — the meaning accumulates across its uses.

Invent one only when nothing existing fits: a coined word recruits nothing, so you pay in definition
tokens what a known word gives free.

Go hunting for these. A triad spelled out at three sites, a sentence gesturing at an idea that has a
name — each is a passage waiting to collapse into a token, and you win twice: fewer tokens, and a
sharper hook.

## 🔴 A prohibition activates what it forbids

Steering by ban drags the banned thing into context and makes it *more* available. *Do not think of an
elephant.* The negation is a weak modifier over a strongly activated concept, and it half-reads as an
instruction.

**Write the target behaviour.** "Comments explain why" rather than "do not describe what the code
does". The banned thing then never gets named at all.

A prohibition earns its place as a hard guardrail you cannot phrase positively — *never force-push a
published commit* — and even there it wants the positive beside it: *branch, and open a pull request.*
This kit's `Cannot:` contracts are the guardrail case. Everything else in a skill should be a target.

## Three tiers, so a rule says how it fails

A document full of rules at one volume is a document where nothing is absolute. Give every rule one
of three tiers, and say which:

| Tier | What it means | Fails when |
|---|---|---|
| **Hard gate** | absolute, no exception | it is broken at all |
| **Purpose gate** | the thing is allowed; **the unwritten reason is what fails** | it appears as a default, or the reason is not written down |
| **Consistency lock** | the same choice, applied throughout | one place diverges without saying so |

🔴 **The middle tier is the one worth having, and it is the one most rulesets skip.** It is the
constructive form of the section above: instead of *never use a fallback*, write *a fallback is
allowed, and its reason is written down where the next reader will find it.* The technique stops
being forbidden and the absence of thought starts being what fails — which is what you actually
wanted to catch.

Most of this kit's prohibitions are purpose gates wearing a ban's clothes. *A fact a command
re-derives does not belong in a skill* is really: **put it there if you write down why the command
cannot.** *Never simplify a guard that came from an incident* is really: **simplify it once you have
written what it was guarding.**

The per-skill **Can / Must / Cannot** contract is already this shape: `Cannot` is the hard gate,
`Must` is the consistency lock. What it has never carried is the middle tier, which is where most of
the judgment lives.

### The keystone: one line, or the decision is not made

**Every non-obvious decision gets a one-line reason, written where the decision lives** — the commit,
the plan's deviation row, the comment above the guard, the hardening.

🔴 **If the reason will not fit in one line, the decision has not been made yet.** That is the whole
test, and it is what makes every purpose gate above checkable: the gate is not "is this technique
acceptable", which nobody can answer, but "is the reason written", which anybody can.

## How the kit's own output should read

The deliverables here are text: a report, a pull request body, a hardening, a review verdict. So the
writing is not presentation on top of the work — for a reviewer reading it, **it is the work**.

The patterns below are not style preferences. Each one is a way a report says less than it appears
to, and they cluster in machine-written text because they are what a model reaches for when it has
nothing specific to say:

| The tell | What it costs a report |
|---|---|
| **Empty vocabulary** — *leverage, robust, seamless, streamline, comprehensive* | words that signal effort instead of naming a result |
| **Significance inflation** — *a major step, a pivotal change* | ceremony where a measurement belongs |
| **Attribution with no source** — *it is generally understood, best practice suggests* | authority borrowed for a claim nobody made |
| **Actorless passive** — *the decision was taken, the file was updated* | the actor was available and got deleted, and so did the accountability |
| **An abstraction given a human verb** — *the audit knows, the data tells us* | sounds active, names nobody, passes a passive-voice check |
| **A forced group of three** | a rhythm the content did not ask for; real lists are as long as they are |
| **A run of short fragments** — *No guessing. No waiting. No surprises.* | manufactured emphasis where earned emphasis was possible |
| **A generic positive close** — *this puts us in a strong position* | padding the ending with mood instead of the last concrete fact |
| **Stacked hedging** — *could potentially perhaps* | one qualifier does the work; three read as evasion |
| **Filler** — *in order to, it is important to note that* | length that adds nothing, which the reader pays for |

The three that matter most here are the ones that **fake evidence**: the unsourced attribution, the
invented specific, and the upbeat conclusion. A report exists to carry proof, and each of those is
proof-shaped and empty. `/honesty` is the pass that catches them.

⚠️ **Look for clusters, not single tells, and do not gut good writing to hit a list.** These are not
reliable on their own, and over-editing produces exactly the flat, careful prose the list exists to
prevent:

- one *however*, one em dash, one short emphatic sentence: nothing;
- precise or formal vocabulary is not the same as empty vocabulary — do not flatten an exact word;
- **passive is right** when the actor is genuinely unknown or irrelevant (*the process was killed at
  the ceiling*);
- **preserve what makes writing human**: the specific unfabricable detail, varying sentence length,
  a real aside, an unresolved tension. A report that admits *I do not know why the suite exited 254*
  is worth more than one that reads cleanly.

The pull request rules live in this project's PR template (`.github/pull_request_template.md`) and
are not repeated here.

## Pruning is the maintenance

- **One meaning, one place.** The same rule in two files costs tokens, costs maintenance, and
  overstates its own rank. (The opposite of a leading word, which repeats the *token* deliberately and
  never the meaning.)
- **The environment is a source of truth, and a document that restates it is a cache.** A test count,
  a version, a branch state, the scripts in a manifest: a command re-derives each in seconds, and the
  copy in the document goes wrong silently. **Cache only what cannot be looked up** — the unwritten
  convention, the reason behind a choice, the trap no config confesses.
- **Hunt the no-ops.** An instruction the model already follows by default spends context to say
  nothing. The test is not whether a human finds it sensible; it is whether behaviour changes without
  it. Two people disagreeing about a no-op are disagreeing about the default, and the way to settle it
  is to run the document. When a sentence fails the test, delete the sentence — not a few words of it.
- **Check every line for whether it still bears on the task.** Lines go stale as the world they
  describe changes, and the default fate of a document nobody prunes is sediment: layers that settled
  because adding felt safe and removing felt risky.

## The check that fails

`node .claude/scripts/check-drift.mjs; echo "exit=$?"` — a link that resolves nowhere, a placeholder
nobody filled, a path called gitignored that git tracks, a script beside a skill the skill never
names, and a skill's own selftest. Everything above is judgment; this is the part that can be wrong
in a way a machine sees.

### When a computable fact has to live in the skill

The pruning rule above says a fact a command re-derives belongs to the command. Sometimes one has to
sit in the document anyway: a table the reader needs inline, values that are only useful next to the
rule they serve. **That is a purpose gate, and the written reason is not enough on its own — ship the
check that recomputes it.**

Declare it in the frontmatter, and `check-drift` runs it:

```yaml
selftest: check-table.py --selftest
```

The script reads the table **out of the SKILL.md** and recomputes every row, so the document stays
the source of truth and the script only proves it. A script carrying its own copy of the values
proves that the copy agrees with itself.

It must sit inside the skill's own directory, be executable, and exit non-zero when a row is wrong —
a check that cannot fail is not a check.

---

*The structure of this skill — the two loads, the disclosure ladder, completion criteria, leading
words, negation — comes from Matt Pocock's `writing-for-agents`
([mattpocock/skills](https://github.com/mattpocock/skills), MIT). The text is ours, and so are the
measurements in it.*
