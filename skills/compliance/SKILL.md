---
name: compliance
description: Compliance gate — personal data, dependency licenses, new external services and confidentiality. Run it BEFORE changing anything that touches sensitive data, adding a dependency or integrating a third party. Returns a verdict with the stopping point.
---

# Compliance — the gate that runs before the code, not after

- **Can:** block a change and require written authorization from `{{OWNER}}`.
- **Must:** answer the three questions for every new personal-data field, check the license of every new dependency, and end with a verdict and its stopping point.
- **Cannot:** clear a third party outside `{{APPROVED_VENDORS}}` on its own authority.

This gate is **conditional on the CONTENT of the diff, not on your judgment**. When in doubt, run it.
**When genuinely in doubt, STOP and tell `{{OWNER}}`.**

## When to run it

Any change that touches: **`{{SENSITIVE_DATA}}`** · **`{{RED_ZONE}}`** · **a new dependency** ·
**any external service** · **credentials/secrets** · **the audit trail**.

---

## 1. Personal data — three questions per new field

Every new field, column or log that carries personal data answers all three. If it fails one, **it does
not get persisted**:

| # | Question | Why |
|---|---|---|
| 1 | Does it have a clear **purpose** tied to the product? | data collected "because it might be useful" has no basis |
| 2 | Does it have a defined **retention/TTL**? | data with no deadline is data forever |
| 3 | **Does it leak into logs?** | logs are the most common leak, and the most invisible |

More:

- **Never log raw personal data** (name, ID number, phone, email, whole payload/message). Logs carry an
  **ID**, not the data. If the logger redacts fields, do not work around the redaction.
- **Minimize.** Do not create a new copy of personal data without a concrete need. Exports carry IDs.
- 🔴 **It is FORBIDDEN to send personal data to a NEW external service** — outside
  `{{APPROVED_VENDORS}}` — without **prior written** authorization. That includes debugging tools,
  analytics, pixels, LLMs, sandboxes, session replay and public artifacts. If the task asks for this →
  **STOP and report it**.
- **An incident involving personal data** (leak, improper access, exposure) = notify `{{OWNER}}`
  **immediately** (deadline: `{{INCIDENT_DEADLINE}}`), with the data affected, the people involved, the
  cause and the mitigation. Never "fix it quietly".

> ⚠️ There is data that is sensitive **without being regulated**: performance reviews, grades, internal
> scores, disciplinary history. It does not generate a fine, it generates a dispute — treat it with the
> same care.

## 2. `{{CRITICAL_ASSET}}` — integrity

Every project has an asset whose damage cannot be undone: a ledger, a user's file, an immutable
history, a balance. Rules that apply to any of them:

- **Correct with a new record, never by erasing the trail.** If a trigger/constraint exists that blocks
  `UPDATE`/`DELETE`, it **is not worked around** with a manual script or a migration that drops it.
- **Concurrent writes must be atomic** — reading and writing the same value in one step (transaction +
  lock), never in separate steps.
- **Idempotency** wherever the operation can be reprocessed: an explicit deduplication key, not
  "it probably will not run twice".

## 3. Dependency licenses — mandatory gate

**FORBIDDEN** to add a **copyleft/viral** package (GPL, AGPL, LGPL, SSPL, EUPL, MPL-2.0 in modified
code…) without prior **written** authorization.

```bash
npm view <pkg> license      # before installing
pip show <pkg> | grep -i license
```

Safe: **MIT, Apache-2.0, BSD-2/3, ISC**. Record the package + license when reporting the change,
**even when everything is fine** — the record is the proof the gate ran.

## 4. Confidentiality

- Code, architecture, schema and credentials are the project's property. **Never reproduce them
  externally** (pastebin, public repo, external tool, public artifact) without authorization.
- **Secrets only in the environment** (`.env` outside git). Never hardcoded, never in a config table,
  never in the UI, never in a log, never in the client bundle.
- **Intact git history**: no rebase/force-push of an already-published commit, no `--no-verify`.

---

## This gate's output

State **explicitly** which of the three:

- **(a) it passes clean** — and what you verified to say so;
- **(b) it needs a written decision/authorization from `{{OWNER}}`** — which, and why;
- **(c) it touches a risk zone** — the risk, and the **rollback point**, before coding.

If it is an incident involving personal data → **report it now**, not at the end of the session.
