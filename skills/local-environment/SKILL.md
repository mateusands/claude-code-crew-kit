---
name: local-environment
description: Bring up, seed and drive the local development environment — installation, platform-specific dependencies, stand-ins for external services, test data and the wiring traps that cost the most time. Use when running, manually testing or debugging the environment.
---

# Local environment — bring it up, seed it, drive it

- **Can:** install, seed, bring up and drive the local environment, and stand in for external services.
- **Must:** use the project's documented commands and keep every secret out of git.
- **Cannot:** commit a filled-in `.env`, or point a local process at a production resource.

This skill covers **getting it running**. Proving the change works is the `local-testing` skill.

## 1. Installation

```bash
{{PKG_MANAGER}} install     # dependencies
cp .env.example .env        # variables — NEVER commit a filled-in .env
{{CMD_DEV}}                 # bring it up
```

Opens at `{{LOCAL_URL}}`.

### Dependencies that vary by platform

Not every dependency exists on every system. When the project has one that only runs on some
platforms, three things must be true — and all three get verified, not assumed:

1. installation is **conditional** (environment marker in the manifest), so the install does not break
   on the other platforms;
2. there is a documented **alternative backend** for the rest;
3. the choice is **automatic in the code**, in one place, and a missing engine raises a **readable**
   error — never an import stack trace.

⚠️ **Never import a platform-specific engine directly in feature code** — always through the layer
that picks. That is the error that breaks the whole project on someone else's machine.

## 2. Stand-ins for external services

If the project depends on a paid/production external service, exercising against it in dev is
expensive and risky. The pattern is a **local stand-in** enabled by an environment variable, a
**no-op in production** (the variable does not exist there, so the real URL wins).

Rules that apply to any stand-in:

- **The stand-in mirrors the service, not the other way round.** If the real behavior changes, the
  stand-in is what gets adjusted.
- **It must be able to inject failures**, otherwise no retry path is exercisable — and that is exactly
  where fixes pass green in the suite and fail at runtime. Three modes, each proving something
  different: **total failure** (rejects everything), **partial failure** (passes N, rejects the rest —
  the only one that tests the guard) and **transient failure** (rejects the first N, then normalizes —
  the only one that proves the retry actually **delivers**).
- **State that persists to disk** survives a restart. To reset it: **kill the process FIRST**, then
  delete the state file (a clean shutdown usually rewrites it).
- 🔴 **Before any write against the REAL service, confirm which account the credential belongs to.** A
  check that aborts on its own when it detects production is worth more than any README warning.

## 3. Seeding data

An empty area is almost never a bug: it is **data that does not exist** or **data outside the screen's
slice**.

- The seed must be **idempotent** (fixed identifiers + "do nothing if it already exists"), otherwise
  running it twice duplicates.
- Seed **in the window the screen shows** (today, 30 days, this month).
- To exercise a **permission boundary**, seed at least **two** scopes with disjoint access — one alone
  never proves isolation.

## 4. The wiring traps that cost the most time

| 🪤 | Symptom | Fix |
|---|---|---|
| **Old process on the port** | start says "ready" and the screen does not match expectations | `ps -o lstart= -p $(lsof -tiTCP:<port> -sTCP:LISTEN)`; kill it and bring it back up |
| **Service with no watch mode** | you edited the server and nothing changed — you validated the previous code | rebuild/restart; usually only the frontend reloads itself |
| **Application cache (minute-scale TTL)** | you changed a user/config and the app does not see it | restart the service |
| **New schema not applied** | the query breaks and looks like a code bug | apply it to the **dev and test** databases (see the `schema` skill) |
| **Queue with debounce** | the response is slow and you conclude it did not work | know the real window before waiting |
| **Secrets that must MATCH across services** | one signs, the other rejects | both sides read the same value; old session → log in again |
| **Demo/mock toggle left on** | real behavior disabled | leave it off in the test environment |
| **Build cache across branches** | an error that appears and disappears on the **same** branch | clear the cache, not just the dependencies |
| **zsh does not word-split** an unquoted variable | a loop runs **once** with everything jammed together | `while read`, or a script in the project's language |
| **zsh indexes arrays from 1** | the first item comes out empty | `${ARR[1]}`, or iterate without an index |

## 5. Logs

Concentrate the logs in a predictable place (e.g. `.logs/<service>.log`, gitignored). When something
does not come up, the service log answers faster than any guess.

## 6. Manual test script

Keep the list of main flows here, and what to confirm in each. For any flow that **writes**, three
points are non-negotiable:

1. the input data was **not altered**;
2. the error reaches the user — not just the terminal;
3. cancelling midway does not leave the interface stuck.

> Script per flow (fill in per project):
>
> | Flow | Test input | What to confirm |
> |---|---|---|
> | `<flow 1>` | `<file/data>` | `<expected result>` |

## 7. Teardown

Tear down what you brought up, and say what was left in the dev database if you seeded or altered
data. **Never point a test driver at production**, and if you repointed a real service's
webhook/config: **restore it**, checking against the backup you took beforehand.
