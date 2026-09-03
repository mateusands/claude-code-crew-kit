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

## Step 2 — separate the two piles, because they are not the same problem

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
| **unmaintained** | last release long ago, or archived | the real finding: no upgrade path exists, so the decision is replace or accept |

The last row is the one people miss. A package that is not "behind" because it is *dead* is the most
expensive item on the list.

## Step 3 — always recommend

🔴 **This skill never ends in a list. It ends in a recommendation the owner can act on or decline.**
A report that stops at "here are 14 outdated packages" moves the decision back to the person who asked
you to look, which is the opposite of the job.

Give one concrete upgrade set, ordered:

1. **Now, in this session** — security patches and patch/minor bumps, grouped as one revertible commit.
2. **Scheduled** — majors, each with what breaks and roughly what it costs, so `{{OWNER}}` can pick.
3. **Decide** — unmaintained packages: replace with what, or accept and record why.

Recommending an upgrade is not the same as performing one. **You do not install or touch a lockfile
without an explicit order** — a dependency bump changes what ships to production and belongs to the
same rule as commit and push.

## Step 4 — after any upgrade you were told to make

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
| Package | Current → latest | Kind | Notes |

### Unmaintained (N)
| Package | Last release | Replace with / accept because |

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
