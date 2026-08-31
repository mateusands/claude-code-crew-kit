---
description: The four two-minute checks before writing the first line of code.
---

Before editing any file, answer **in writing**:

**1. Is the file I am about to edit the real owner of the rule?**
The layer is fixed (`{{LAYERS}}`). Editing the wrong layer is the most common way for a fix to "work"
in manual testing and not match the rest of the module.

**2. Is there a twin of this rule?** 🔴 This is the item that most often escapes — and it escapes by
being half-executed. **Three searches, not one:**
- by **identifier** (the name you are touching);
- by the **concept, in plain language** (write the decision as a sentence and search for the terms it
  would use);
- by the **SHAPE of the code** (`list[0]`, `?? first`, `COALESCE(`, `new Date()`).

List **which searches you ran**. "I only found one place" without the three searches is not a
conclusion, it is a signature. Found a twin? The fix is almost never to correct both the same way — it
is to **extract the decision into one place**.

**3. Did I touch schema, a migration or environment config?**
Apply it **before** exercising, to the dev **and** test databases. A migration written and not applied
is the local equivalent of "the deploy that never ran".

**4. Does this touch `{{SENSITIVE_DATA}}`, `{{CRITICAL_ASSET}}`, permissions or a new dependency?**
If so, run `/gates` **now**, not after coding.

Close by saying: which file you are going to edit, why it is the owner of the rule, and which test will
fail first.
