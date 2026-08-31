---
name: schema
description: Database changes — the real shape of the schema, the "did it get applied in the right place?" gotcha, compatibility with the old code during deploy, column conventions and what is never deleted. Use when creating or altering a table, column, index or trigger.
---

# Schema — database changes without breaking the deploy

## 1. What is the REAL shape of the schema?

Two models, and each one's gotcha:

| Model | Source of truth | Main gotcha |
|---|---|---|
| **Versioned migrations** | the sequence of files | **it does not run itself**: someone applies it. A migration written and not applied = `relation does not exist` at runtime |
| **Declarative schema + push** | the schema file | the new table must be **registered** where the tool looks; if it is missing, the deploy goes green and the table is **never created** |

In both: **to know a table's real shape, read the definition or the live dump — do not assume.**

🔴 **Apply it before exercising, to the DEV *and* TEST databases.** A column that exists in the schema
and not in the database makes the query ask for a nonexistent column → **an error on every read** that
touches the table (including login). It is the cause most often confused with "a code bug".

⚠️ **Nothing guarantees the migration runs on deploy.** If CI only checks the code and the deploy only
brings up the container, the migration is a **manual step** — and forgetting it leaves a green deploy
with a broken application. Confirm how it works in this project and **declare it** in the PR.

## 2. Compatibility — the deploy runs with both versions live

During the deploy window (rolling, or "migrate then ship"), the **old code talks to the new schema**.
Therefore:

- **A new column is born nullable or with a default.** `NOT NULL` with no default breaks the `INSERT`
  of the old code still live.
- **Removal or renaming is a TWO-phase operation**: stop reading/writing in one deploy, physically
  remove in the next. Renaming is remove + create — same rule.
- **A code rollback does not revert the database.** If the old code breaks with the change already
  applied, **there is no rollback** — only rolling forward. Say so in the plan.
- **Volume:** adding a nullable column is metadata (instantaneous). But **an index on a large table
  blocks writes** without the concurrent variant — on a live production system that is an availability
  finding.
- **Will the command ask a question?** Renames and orphan tables open an interactive prompt. In an
  automated deploy that **hangs waiting for input** — and the job stalls with no clear error.

## 3. Order and registration

- **A new migration must come AFTER the last applied one** (higher timestamp/number). The tool applies
  in name order; a file with a lower number does not enter the expected sequence.
- **Never edit an already-applied migration.** Fix it with a new one.
- In the declarative model, **register the table in both places** the tool reads (the schema index and
  the config). Missing one = the table is never created, with a green deploy.

## 4. Conventions

- **Isolation scope** (tenant, organization, department): decide **once** and stick to it. Isolation
  column + an index on it; a natural unique key is unique **within** the scope.
- **Exposed identifier:** decide whether the internal id goes outside or whether there is a public
  identifier. **Do not introduce the second layer without a concrete need** — and do not expose the
  internal one if the project already uses a public one.
- **Soft-delete where there are relationships.** Two patterns coexist (`deleted_at` nullable ×
  `active boolean`) — **check what the analogous table already uses** before choosing.
- **Input validation lives with the code**, not with the migration: the migration defines the table's
  shape, the validation schema validates the payload. They are separate files, **kept in sync by
  hand** — the gap between them is a common source of bugs.
- **Enums:** free text in the database + an allowlist in validation, covering **create and update**.
- **Idempotent seeds** (fixed identifiers + "do nothing if it already exists"), otherwise a rerun
  duplicates.

## 5. What is NEVER deleted

- **The audit trail and history** — rollback depends on them. No migration removes the table or makes
  writing to it optional (`audit-trail` skill).
- **The trail of `{{CRITICAL_ASSET}}`** — if a trigger/constraint exists that prevents `UPDATE`/`DELETE`,
  it **is not dropped** to "fix" a value. Correct with a **new record**, never by deleting.

## 6. Afterwards

- Run the **`backend`** skill for the shape of the route/DTO that consumes the new column.
- Run the **`compliance`** skill if the change touches `{{SENSITIVE_DATA}}` or `{{CRITICAL_ASSET}}`.
- Exercise it with the new table (`local-environment` skill) — and **apply it to the test database too**.
- **No commit/push without an order.**
