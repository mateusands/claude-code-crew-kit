---
name: complete-security-review
description: Full-repository security audit — sweeps entire classes of problem (secrets, authorization, injection, upload, crypto, dependencies, infrastructure) across the whole codebase rather than a diff, states coverage as numbers, classifies by exploitability, and ends by running your host's own security reviewer as an independent pass. Use for a periodic audit, before a first release, when inheriting a codebase, or when asked to "check the security of the project".
---

# Complete security review — the whole repository

- **Can:** sweep the whole repository, read any file, and run your host's own security reviewer.
- **Must:** state coverage as numbers with their denominators, classify by exploitability, and name what you did not audit.
- **Cannot:** fix what it finds without an explicit order, or present a sample as if it were a sweep.

`codereview` judges **what changed**. This judges **what is there** — including everything that was
never reviewed because it landed before anyone was looking.

Only reports. **Do not apply fixes without an explicit order** — a security fix applied mid-audit
changes the ground under the rest of the audit.

## What makes this different from `codereview`

| | `codereview` | this skill |
|---|---|---|
| Scope | the diff | the whole repository |
| Method | read what changed | **sweep a class, count the instances** |
| Finding age | mostly regressions | mostly pre-existing, some for years |
| Honest output | findings | findings **+ the denominator** |

🔴 **The denominator is the deliverable.** "I found no authorization bugs" is worthless. "I walked all
137 handlers; 134 scope by session, 3 do not — here they are" is an audit. If you cannot state the
number, you swept a sample and must say so.

⚠️ **Pre-existing does not mean lower severity.** It changes whether it blocks *a release*, never
whether it matters. A leak that has been live for three weeks is worse than one live for three
minutes.

---

## Step 0 — establish the map and the denominators

Before looking for anything, count what exists. These numbers appear in the final report.

```bash
git ls-files | wc -l                                    # files in scope
git ls-files | sed 's/.*\.//' | sort | uniq -c | sort -rn | head   # languages
```

Then find and **count** each class you are about to sweep — routes/handlers, forms, queries,
file-upload paths, external calls. Use the project's own conventions (`{{LAYERS}}`) to locate them.

Write the map down. A sweep with no denominator cannot be completed honestly.

Also read `{{RECORDS_DIR}}/info.md` and `{{SOURCE_OF_TRUTH}}`: `{{SENSITIVE_DATA}}`,
`{{CRITICAL_ASSET}}`, `{{RED_ZONE}}` and `{{APPROVED_VENDORS}}` are what turn a generic finding into
a ranked one.

---

## The sweeps

Run every one that applies. **Declare the ones that do not** — "no file uploads in this project" is a
result; silence is not.

### 1. Secrets and credentials

- `grep` the working tree for key material: `api[_-]?key`, `secret`, `token`, `password`,
  `BEGIN .* PRIVATE KEY`, `AKIA`, `xox[baprs]-`, `ghp_`, `sk-`.
- 🔴 **Search the git history, not just the tree.** A secret deleted in a later commit is still
  published: `git log -p -S '<pattern>' --all`. A secret that was ever committed must be **rotated**,
  not deleted — say that explicitly in the finding.
- Is `.env` in `.gitignore`, and is `.env.example` free of real values?
- Any secret reachable in a **client bundle**, a config table, a log line, or the UI?
- CI/CD: secrets referenced as variables, never inlined? Do they leak into build logs?

### 2. Authentication and session

- Where is identity established, and is that the **only** place? Count the entry points.
- Tokens: is algorithm, issuer **and** audience verified? Any `alg: none` or unverified decode path?
- Cookies: `HttpOnly` + `Secure` + `SameSite`?
- Expiry and revocation: can a session be ended server-side, or only by waiting?
- Password storage: a slow hash (bcrypt/scrypt/argon2), never a raw digest?
- Reset and invite flows: single-use, expiring, unguessable tokens?

### 3. Authorization — the sweep that most often pays

**Walk every endpoint. Count them. Report the number.**

For each: is it authenticated, and separately, is it **authorized for this object**?

- **IDOR:** a client-supplied id scoped by the owner/tenant **from the session**, before use?
- **Enumerable keys:** sequential ids, protocol numbers, or references used as lookups without
  scoping first?
- **Mass assignment:** raw `{...body}` / `.values(body)` reaching a persistence layer? Can role,
  tenant or flags be set from the client?
- **Role checks on the server**, not only hidden in the UI?
- Resources with an owner *and* participants: are **both** relationships recognized?
- ⚠️ Equality filters silently hide `NULL` — a globally scoped row can vanish, or leak.

### 4. Injection and untrusted input

- SQL parameterized everywhere; no string interpolation into queries. Count raw-query sites.
- Shell/command execution built from user input? Path traversal (`../`) in any file operation?
- Deserialization of untrusted data; template injection; SSRF on any server-side fetch of a
  user-supplied URL (and does it reach internal addresses or cloud metadata?).
- **XSS:** user HTML sanitized by allowlist before storing/rendering; `innerHTML` and equivalents;
  CSP without `unsafe-inline`.

### 5. Uploads and file handling

- **Magic bytes** validated, not just the declared mimetype or the extension.
- Size limits; dangerous renderable types neutralized; served as `attachment`, from outside the
  webroot; filenames sanitized (no traversal, no null bytes).

### 6. Crypto and randomness

- Token comparison in **constant time** — never `==`.
- Randomness from a **CSPRNG** for anything security-bearing.
- No home-grown crypto; no ECB; no hardcoded IV/salt; TLS verification never disabled.

### 7. Dependencies and supply chain

```bash
npm audit --omit=dev     # or: pip-audit · cargo audit · govulncheck
```

- Versions pinned; a lockfile committed.
- 🔴 **Licences** — any copyleft (GPL/AGPL/LGPL/SSPL) present without written authorization is a
  finding for the `compliance` gate, not a nitpick.
- Install scripts from untrusted packages; typosquatting on recently added names.

### 8. Infrastructure and configuration

- `Dockerfile`: not running as root; no secrets in layers; a pinned base image.
- CORS **fail-closed** — never `*` with credentials. Security headers present.
- Rate limiting on expensive and unauthenticated endpoints. Body size limits.
- Webhooks verify **signatures**, and fail closed when the secret is absent.
- Debug/verbose modes off in production; stack traces never returned to clients.
- Database reachable only from the app; backups exist and their restore path is known.

### 9. Data protection and logging

- `{{SENSITIVE_DATA}}`: what is collected, where it lives, its retention, and who can read it.
- **Logs:** personal data redacted; no whole payloads; no tokens. Logs are the most common leak and
  the most invisible.
- Exports and reports carry IDs rather than copies of personal data.
- Anything leaving to a service outside `{{APPROVED_VENDORS}}` — that is a `compliance` stop, not a
  finding to file quietly.

### 10. `{{CRITICAL_ASSET}}` integrity

- Every write path to it goes through the guarded module — including scripts, jobs and admin tools.
- Concurrent writes are atomic (transaction + lock), not read-then-write.
- The audit trail cannot be bypassed or deleted; corrections add records rather than erasing them.

---

## Before reporting — the same precision bar

**A wrong finding costs more than a missing one**, and in a security report it costs more than usual:
one false positive and the reader starts discounting the whole list.

1. **Try to refute each finding.** Find the guard, the middleware, the constraint, the scheduled job.
   Grep by **synonym** — a retention finding was once filed wrongly because the search looked for
   `delete` and `purge` and missed `update … set field = null`.
2. **Open the file and confirm `file:line`.** Never from memory.
3. **Establish exploitability**: anonymous · any authenticated user · privileged only. Omitting the
   condition inflates severity, and inflated severity is how a real Critical gets ignored.
4. **Prove reachability.** Dead code with a vulnerability is a different finding from a live path.
   Say which it is.

## Severity

| Severity | Criterion |
|---|---|
| **Critical** | remote data loss/leak, authentication bypass, RCE, exposed live secret |
| **High** | authorization bypass for an authenticated user, injection with a concrete path, sensitive data in logs |
| **Medium** | missing hardening with a named attack that becomes possible, weak crypto, missing rate limit |
| **Low** | defence in depth, informational exposure |

An **exposed live secret is an incident, not a finding** — report it immediately to `{{OWNER}}`,
before finishing the audit, and say it must be **rotated** rather than deleted.

---

## 🔴 Final step — run your host's own security reviewer

This skill is one lens, written for this project. Your host has a security reviewer of its own with a
different threat model, and **two independent passes catch different things**. Running only one leaves
a blind spot you cannot see from inside it.

| If you are… | Run |
|---|---|
| **Claude Code** | 🔴 **`/security-review`** — always. It is a separate pass with a separate model of what an attacker does, and it does not know this project's `{{CRITICAL_ASSET}}`, which is exactly why it is worth running alongside this checklist |
| **Codex / ChatGPT** | `codex review` with a security-focused prompt, or your security review agent |
| **Gemini / Antigravity** | your own security review command or agent |
| **Any other agent** | 🔴 **look for your own security review skill or command and run it.** Do not assume you have none — check. If you genuinely have none, say so in the verdict |

Then merge: report which pass produced each finding, deduplicate, and note where the two agreed.
**Agreement raises confidence; a finding from a single pass is not weaker, but it is unconfirmed.**

In `solo` mode (`{{RECORDS_DIR}}/info.md`), your host's reviewer is the **only** independent pass that
exists. Skipping it there is not a shortcut, it is the removal of the entire second opinion.

---

## Output

```markdown
# Security audit — {{PROJECT}}
**Date:** <YYYY-MM-DD> · **Commit:** <SHA> · **Mode:** <solo/duo/crew> · **Auditor:** <agent>

## Verdict
🟢 no blocking findings · 🟡 ship with named caveats · 🔴 do not ship

## Coverage — what was swept, with numbers
| Sweep | Scope | Instances checked | Findings | Not applicable |
|---|---|---|---|---|
| Authorization | all HTTP handlers | 137 | 3 | |
| Uploads | — | — | — | no upload paths in this project |

## Findings (most severe first)
### [Critical] <one line>
**Where:** `file:line`
**Exploitable by:** anonymous / any authenticated user / privileged only
**Scenario:** <concrete input → what an attacker gets>
**Age:** regression from <commit> · pre-existing since <date> · latent under <condition>
**Fix:** <concrete, with the code>

## Reviewers run
this skill ✓ · /security-review ✓ · npm audit ✓
Agreement: <n> findings confirmed by more than one pass

## What I did NOT audit
<paths, classes, and anything requiring credentials or a running environment>
```

Close with **what you did not audit**. A security report that does not state its own boundary is read
as a clean bill of health for the entire repository — and that is how an audit becomes the reason
nobody looked again.
