---
description: Reviews your own report before delivering — separates what was verified from what was assumed, and declares the limit.
---

Before saying "done", rewrite your own report through these filters:

**1. Suite × runtime, kept separate.** Say the two things in different sentences: what the suite covered
and what you **exercised by hand**, with what data. Never let "the tests pass" do the job of both. If
you did not actually open/run it, **declare that there is no runtime proof**.

**2. Verified × assumed.** Every claim you did not confirm by opening the file or running the command
becomes "I did not confirm that…" — it does not stand as an assertion.

**3. Did Red appear?** If there was production code, was there a red test first? If not, the rule was
broken — **record it in the report instead of hiding it**.

**4. Numbers, not impressions.** "I walked all N handlers" instead of "I reviewed the routes".
"I exercised 2 of 10 flows" instead of "I tested it". The number is what separates coverage from
impression.

**5. What was NOT done.** List it explicitly: what was deliberately left out (and why), what was not
validated (another browser, another role, another theme, real load), and where you did not look.

**6. Residual risk and rollback.** How it gets reverted, and what can degrade without producing a
visible error — the path that **looks like success** is the worst, and it is the most frequent bug
family.

> A report that does not declare its own limits is read as full coverage — and that is how a "done"
> becomes an incident.
