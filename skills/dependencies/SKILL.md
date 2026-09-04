---
name: dependencies
description: Audit the dependency surface — known vulnerabilities and how far behind each package is — classify by exploitability and by upgrade cost, and always end with a concrete upgrade recommendation. Use at the start of a session, whenever a diff touches a manifest or lockfile, and before any release. Not for approving a NEW dependency: that is the compliance gate.
---

# Dependencies — what is vulnerable, what is behind, and what to do about it

- **Can:** read manifests and lockfiles, run the ecosystem's audit and outdated commands, and propose a concrete upgrade set.
- **Must:** separate vulnerable from merely behind, say whether a vulnerability is actually reachable here, and end with a recommendation to upgrade — never with a bare list.
- **Cannot:** install, upgrade or edit a lockfile without an explicit order from `{{OWNER}}`, and cannot approve a NEW dependency — that is `compliance`.

Dependencies are the part of the codebase nobody wrote and everybody ships. They rot on a clock
instead of on commits, so unlike every other gate in this kit, **this one is triggered by time as much
as by a diff.**

## When it runs

| Trigger | Why |
|---|---|
| **Start of a session** | rot accumulates while nobody is looking; one command is cheap |
| A diff touches a **manifest or lockfile** | `/gates` routes it here by content |
| **Before a release** | shipping is when an unpatched advisory stops being theoretical |
| A dependency is being **added** | run `compliance` first — licence and vendor approval — then this |

## Step 1 — the two commands

Two different questions, and they need two different commands. Run both.

| Stack | Vulnerable | Behind |
|---|---|---|
| npm · pnpm · yarn | `{{PKG_MANAGER}} audit` | `{{PKG_MANAGER}} outdated` |
| Python | `pip-audit` | `pip list --outdated` |
| Go | `govulncheck ./...` | `go list -m -u all` |
| Rust | `cargo audit` | `cargo outdated` |
| PHP | `composer audit` | `composer outdated` |

If the project pins a lockfile, audit **the lockfile**, not the manifest range. The manifest says what
is allowed; the lockfile says what ships.

**If neither command exists for this stack, say so and stop.** An audit you could not run is not a
clean audit, and reporting it as one is the failure this whole kit is built against.

## Step 2 — the manifest states intentions; the lockfile states what ships

Read both, and never confuse them. `package.json` says what versions are *allowed*; the lockfile says
what is *installed*. Only the lockfile can tell you whether an advisory reaches production or stops at
the build.

```bash
npm ls <package>          # or: yarn why <package> · pnpm why <package>
```

That command is the one that turns a list into an answer: it names who pulled a package in. Use it on
anything you are about to call a finding, because "a CVE in the tree" and "a CVE we ship" are
different reports and only one of them is urgent.

## Step 3 — separate the piles, because they are not the same problem

🔴 **A vulnerability is an incident with a clock. Being behind is a cost with interest.** Reporting
them in one list gets the urgent one skimmed.

### Vulnerable

For each advisory, three questions before it gets a severity:

1. **Is it reachable from this codebase?** A CVE in a code path this project never calls is real but
   not urgent. Say which it is — and say when you could not determine it.
2. **Does it ship?** A dev-only, build-time dependency is a different exposure from one in the
   production bundle. `npm audit` does not make this distinction for you; you must.
3. **Is there a fixed version, and what does reaching it cost?** A patch bump is a decision you make
   now. A major bump is a plan.

⚠️ **The trap that burns trust:** an audit that reports every transitive dev-only advisory as critical
trains the reader to skip the whole section, including the one that mattered. Precision beats coverage
here as everywhere in this kit — a wrong finding costs you the right one.

### Behind

Classify by upgrade cost, not by how many versions have passed:

| | What it means | Recommendation |
|---|---|---|
| **patch** | fixes only | take it now, in one commit, with the suite as the check |
| **minor** | additive | take it now unless the changelog says otherwise |
| **major** | breaking, by definition | this is a **plan**, not a bump — read the migration notes, name what breaks |
| **deprecated / end of life** | upstream says stop using it, and usually names the replacement | 🔴 the finding that outranks every version number below it |
| **unmaintained** | last release long ago, or archived, with no successor named | no upgrade path exists — the decision is replace or accept, in writing |
| **unnecessary** | the runtime or another dependency now provides it | **delete it.** Removing beats upgrading, every time |

🔴 **The bottom three rows are what a version-diff tool cannot see, and they are usually the real
report.** A package sitting at its latest version can still be the worst thing in the manifest.

**Deprecated framework or build tool.** Check whether upstream has retired it, not just whether a
newer version exists. A discontinued build toolchain drags dozens of transitive dependencies nobody
chose, and every advisory in that subtree becomes yours to hand-patch. "Latest version of a dead tool"
is not a healthy dependency.

**Unnecessary.** Runtimes absorb libraries. Before recommending an upgrade, ask whether the platform
version in `engines` already ships the thing: a global `fetch`, a watch mode, `.env` loading, a test
runner, argument parsing, UUID generation. Each one deleted is a dependency that can never again be
outdated, vulnerable, or abandoned. **Check the call sites before proposing removal** — a library and
a built-in rarely have identical semantics, and "it has a built-in now" is a hypothesis until you have
read how the project actually uses it.

### The overrides block is a finding, not configuration

`resolutions`, `overrides`, `pnpm.overrides`: each entry is a version someone pinned by hand inside
*someone else's* dependency tree. A long block is the loudest signal in the manifest — it usually
means the project is manually maintaining the internals of a package it does not control.

- **Do not delete them to tidy up.** Several are probably patching real advisories, and removing one
  silently reintroduces the CVE it was added for.
- Retire them **one at a time**, each with `npm ls` / `yarn why` proving nobody needs it any more, and
  the suite as the check.
- If the block exists because of one deprecated parent, say so plainly: **the block is a symptom, and
  replacing that parent is what removes it** — not fifty individual decisions.

## Step 4 — newest is not the target

The version a registry calls `latest` is not automatically the version to aim for. Two things decide
the real target, and both are cheap to check:

**What the ecosystem around it declares.** A linter, a type checker, a framework and its plugins move
on different clocks. A tooling package that declares support for `>=4.8.4 <6.1.0` of its peer is
telling you that jumping the peer to 7 puts you outside every compatibility promise anyone made — you
would be the one finding the bugs. Read the `peerDependencies` and the support matrix of the packages
that wrap the one you want to move.

**What the runtime supports.** `engines` is the ceiling. An upgrade that requires a newer runtime than
the deploy target is not an upgrade, it is an outage scheduled for release day.

So the recommendation is often **the newest version that the rest of the stack has caught up to**, and
saying that explicitly is more useful than naming the absolute latest and letting someone discover the
constraint at merge time.

## Step 5 — order the upgrades so each one de-risks the next

🔴 **A list of upgrades is not a plan. The order is the plan**, because a bad order multiplies the
failures instead of isolating them.

Two rules do most of the work:

- **Never mix a toolchain migration with a framework major in one change.** Migrate the build tool
  while the framework stands still, then move the framework. If something breaks, you know which half
  did it. Combined, you get a diff nobody can bisect.
- **Move what unblocks the most, first.** A deprecated build tool usually pins the type checker, the
  linter and the test runner beneath it; replacing it frees all three at once. Upgrading them
  underneath it means doing the work twice.

A defensible sequence, in general shape:

```
baseline (suite green, audit recorded)
   -> patches and low-risk minors, one revertible commit
   -> replace the deprecated toolchain, everything else held still
   -> retire the overrides it was forcing, one at a time
   -> type checker and linter, now unpinned
   -> state and data libraries
   -> delete what the runtime now provides
   -> the framework major, alone, last
```

**Establish the baseline before touching anything**: the suite green, the audit output saved. Without
it, the first failure after an upgrade has no "before" to compare against, and you will not know
whether you broke it or found it.

## Step 6 — always recommend

🔴 **This skill never ends in a list. It ends in a recommendation the owner can act on or decline.**
A report that stops at "here are 14 outdated packages" moves the decision back to the person who asked
you to look, which is the opposite of the job.

Give one concrete upgrade set, ordered:

1. **Now, in this session** — security patches, patch/minor bumps, and anything the runtime makes
   deletable. One revertible commit, with the suite as the check.
2. **Scheduled** — majors and toolchain replacements, **in the order of Step 5**, each with what
   breaks and roughly what it costs, so `{{OWNER}}` can pick where to start.
3. **Decide** — deprecated or unmaintained packages: replace with what, or accept and record why.

Name the **target version** for each, not just "upgrade" — and where the ecosystem caps it below
`latest` (Step 4), say which version and which package imposes the cap.

Recommending an upgrade is not the same as performing one. **You do not install or touch a lockfile
without an explicit order** — a dependency bump changes what ships to production and belongs to the
same rule as commit and push.

## Step 7 — after any upgrade you were told to make

A dependency bump is a change to the product, so it is validated like one: the suite, the build, and
`local-testing` at the level the change deserves. A green install proves resolution, not behaviour —
the lockfile resolving is not the same as the code still working.

Bump one thing per commit where you can. When something breaks a week later, the bisect is the whole
value.

## Output

```markdown
## Dependency audit — <date> · <what was scanned: lockfile? manifest? which workspaces?>

### Vulnerable (N)
| Package | Advisory | Reachable here? | Ships? | Fixed in | Cost |

### Behind (N of M total)
| Package | Current → target | Kind | Why this target, if not `latest` |

### Deprecated, unmaintained or unnecessary (N)
| Package | Which | Evidence | Replace with / delete because / accept because |

### Overrides and resolutions (N entries)
| Entry | Still needed? (`npm ls` / `yarn why`) | Why it exists |

### Recommendation
**Now:** …
**Scheduled:** …
**Decide:** …

### Not covered
what could not be scanned, and why — private registries, a lockfile that would not resolve,
a stack with no audit tool available
```

End with a verdict: **🟢 nothing urgent · 🟡 upgrade recommended, nothing exploitable · 🔴 reachable
vulnerability that ships — stop and decide.**
