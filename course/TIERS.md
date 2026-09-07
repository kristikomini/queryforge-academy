# Interview priority tiers

Two hand-curated lists. Everything else in `GOLDEN-RULES.md` is generated from
the chapters; **this file is the only hand-written input to the viva deck**, and
it exists because "which of these 518 rules actually decide an interview?" is a
judgement, not something that can be derived.

Each line below is a **distinctive substring** of a rule's claim. `tools/viva-deck.mjs`
matches it against the collected rules and fails if a line matches zero rules or
more than one — so a reworded rule breaks the build here rather than silently
dropping out of the tier.

---

## The twelve that decide interviews

These come up in almost every technical interview for a SQL role, and getting
one wrong is memorable in the wrong way.

- Use `NOT EXISTS` for anti-joins
- Evaluation order is
- Sargable means the engine can seek
- An index on `(a, b, c)` serves any leftmost prefix
- A key lookup is a random read per row
- `ROW_NUMBER` gives distinct numbers
- is unknown, not empty and not zero
- Joining two one-to-many children of the same parent multiplies rows
- Never `FLOAT` for money
- Lost update is not in the anomaly table
- Parameterisation is not better escaping
- The biggest estimate-versus-actual gap is the root cause

## The six that separate a senior candidate

Nobody expects a junior to volunteer these. Volunteering one, correctly, changes
the conversation.

- There is no transaction across a database and a broker
- Expand, backfill, migrate the code, contract
- Replication is availability, not recoverability
- means sniffing
- Surrogate dimension keys are what let a fact point at a
- A deadlock victim is a transient error
