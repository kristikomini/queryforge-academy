# Module 20 · Least privilege and GDPR

> Site chapters: [35](../../../site/chapters/35-security-and-gdpr.html)

---

## 1 · The idea

Database security in practice is mostly about **blast radius**. Assume something will
go wrong — an injection flaw, a leaked connection string, a developer running the wrong
script against the wrong environment — and ask how far the damage reaches. Every
decision in this module shrinks that radius.

The foundation is boring and load-bearing: **grant to roles, not people.** A role
describes a job and outlives whoever is doing it; permissions granted to individuals
become an unauditable sediment that nobody dares remove. And separate the accounts by
*purpose* — migrations, the application, reporting — because that separation is what
changes the consequences of every other mistake:

> **An application connecting as the owner turns any injection flaw into total
> compromise.**

The same flaw, with the application connecting as a role that can only `SELECT`,
`INSERT`, `UPDATE` and `DELETE` on the tables it needs, is a data-integrity incident
rather than the end of the database. The flaw is identical; the blast radius is not.

Then the encryption facts, because this is where interview answers most often overclaim:

> **Encryption at rest protects stolen disks and backups. It does not protect against an
> authenticated query.**

Transparent data encryption decrypts transparently — that is the feature. Someone who
has valid credentials, or an injection foothold, reads plaintext. It is genuinely
necessary and it defends against a specific threat: media that leaves the building.
Column-level encryption *does* defend against the authenticated reader, and the cost is
the one to state up front — you lose searching, sorting, joining and indexing on that
column, because the engine can no longer compare values it cannot read. Dynamic data
masking is weaker still: a display feature that can be inferred around with enough
queries, and not an access control.

**Row-level security** is the one that moves a rule from application code into the
database, where it cannot be forgotten by the next developer writing the next query.
Its predicate becomes part of every plan, so it must be **indexable** — a tenant filter
that is not sargable makes every query in the system slower.

The GDPR half is genuinely a *schema* subject, which is the framing that makes it
tractable:

> **Data minimisation is a schema decision. A column with no purpose is a liability.**

Every column you store is data you must secure, back up, disclose and eventually erase.
The strongest form of compliance is not having collected it. This codebase makes exactly
that argument in one place, deliberately, and you should read it.

Erasure requires knowing **where a person's data is** — which means a data map, and
means foreign keys, because a graph you cannot traverse is a graph you cannot clean.
And erasure collides with retention: Italian invoicing requires ten-year retention of
records that also contain personal data, and "delete everything" is not available.
**Pseudonymisation is the standard resolution** — sever the link between the records and
the identifiable person, keeping the accounting rows intact and no longer attributable.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | **"THERE IS NO EMAIL COLUMN, AND THAT IS THE POINT."** Read that comment in full. An address this service could never send to could never be verified or used for recovery, so storing one would be personal data collected for no purpose. Data minimisation as an actual decision, with its reasoning recorded. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `password_hash` stores the algorithm and its parameters *inside* the string, so the cost factor can be raised later without invalidating existing accounts. Note there is no separate salt or iterations column and the comment says why. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `recovery_code_hash` is a **SHA-256**, not a slow hash — and the comment explains the asymmetry with the password: a slow hash only ever buys anything against a low-entropy, human-chosen secret. This is the kind of reasoning that distinguishes understanding from ritual. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `refresh_tokens.token_hash` — only the hash is stored, because a refresh token is a bearer credential and a stolen dump must not hand over working sessions. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `failed_attempts` / `locked_until` beside the `rate_limits` table, with the comment distinguishing a **per-account** defence from a **per-IP** one, and stating that neither substitutes for the other. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `ON DELETE CASCADE` on `profiles`, `refresh_tokens` and `password_reset_tokens`. This is the erasure path: deleting the user removes everything attributable to them, and the foreign keys are what make that complete rather than hopeful. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `delete_user`, and `set_leaderboard_visibility` — an **opt-out**, so visibility is one click to remove. Compare with the default in the `users` table. |
| [`api/tests/profile.test.mjs`](../../../api/tests/profile.test.mjs) | "one learner cannot read another's profile", "deleting an account removes the profile and the sessions" — authorisation and erasure asserted by tests. |

---

## 3 · Do it

### a) Read the minimisation decision and try to break it

Open [`api/sql/schema.sql`](../../../api/sql/schema.sql) and find the users table. Now
try to design a password-reset-by-email feature for this service. You will discover you
cannot without adding the column — and *that* is the trade the comment is describing.
Write down what the service gives up and what it avoids having to protect. This is the
exercise, because the reflex it builds is asking "what is this column *for*" before
adding one.

### b) Prove erasure is complete

```bash
node api/tests/run.mjs 2>&1 | grep -i 'deleting an account'
```

Then read the test. Now find every table in the schema with a `user_id` and confirm each
one is reachable by cascade from `users`. Add a hypothetical table — say,
`login_history (user_id, at, ip)` — **without** a foreign key, and say what breaks about
the erasure guarantee. That missing constraint is how real systems end up with orphaned
personal data they do not know they hold.

### c) Feel the cost of column-level encryption

```sql
-- Searchable:
SELECT id FROM customers WHERE email = 'mario.rossi@esempio.it';
EXPLAIN QUERY PLAN SELECT id FROM customers WHERE email = 'mario.rossi@esempio.it';
```

`uq_customers_email` makes that a seek. Now imagine `email` stored encrypted with a
non-deterministic scheme. The predicate becomes impossible — you cannot compare
ciphertexts — so the only implementation is decrypt-every-row-and-compare, which is a
full scan with cryptography per row. State which columns in the reference schema you
would encrypt at column level, and accept the consequence for each.

### d) Build the least-privilege grant set

On PostgreSQL, write the actual grants for three roles against the reference schema:
`migrator` (DDL), `app` (DML on specific tables, no DDL), `reporting` (`SELECT` on the
two views only, no table access). Then confirm the reporting role genuinely cannot read
`customers` directly:

```sql
SET ROLE reporting;
SELECT * FROM customers LIMIT 1;    -- must be refused
SELECT * FROM v_orders_geo LIMIT 1; -- must work
```

The second query reads customer names *through* the view. Decide whether that is
acceptable, and notice that this is the real work of least privilege — not the grants,
but deciding what each role legitimately needs.

### e) The exercise

Write the pseudonymisation procedure for the reference schema: a customer exercises
their right to erasure, but their invoices must survive ten years. Which columns are
overwritten, which are kept, what the rows look like afterwards, and how you prove the
person is no longer identifiable from what remains. Then say what stops somebody
re-identifying them by joining the surviving rows against another source — that question
is what separates pseudonymisation from anonymisation, and interviewers who know the
subject will ask it.

---

## 4 · Golden rules

- Grant to roles, not people. Roles outlive employees and describe a job.
- Separate accounts for migrations, the application and reporting. It changes the blast radius of every other mistake.
- An application connecting as the owner turns any injection flaw into total compromise.
- Row-level security moves a tenant filter into the database, where it cannot be forgotten — and its predicate must be indexable.
- Encryption at rest protects stolen disks and backups, not authenticated queries.
- Column-level encryption costs you searching, sorting and joining on that column.
- Data minimisation is a schema decision: a column with no purpose is a liability.
- Erasure requires knowing where a person's data is. That is a data map plus foreign keys.
- Erasure and accounting retention conflict; pseudonymisation is the standard resolution.
- Dynamic data masking is a display feature and can be inferred around.
- Ten-year retention collides with GDPR erasure; pseudonymisation resolves it.
- For business records, prefer soft delete to cascade. “Delete the customer” rarely means “destroy the invoices”.

---

## 5 · Interview questions

**“What does least privilege mean for a database?”**
Separate accounts by purpose — migrations, application, reporting — each granted only
what its job needs, and granted to roles rather than to individuals so the permissions
describe a job and outlive the person. The point is blast radius: the same injection
flaw is total compromise if the application connects as the owner, and a bounded
data-integrity problem if it connects as a role with DML on specific tables and nothing
else.

**“Does encryption at rest protect against SQL injection?”**
No. Transparent encryption decrypts transparently for any authenticated session, which is
the whole feature — so an injection foothold or a leaked credential reads plaintext. It
protects against media leaving the building: stolen disks, stolen backup files,
decommissioned hardware. Defending against the authenticated reader needs column-level
encryption, and that costs you searching, sorting, joining and indexing on the column.

**“How would you implement multi-tenant isolation?”**
Row-level security, so the tenant predicate lives in the database and cannot be forgotten
by the next query somebody writes — which is the failure mode of enforcing it in
application code. Two requirements: the predicate must be indexable, since it is now
part of every plan in the system, and the tenant identity must come from the session
context rather than from anything the client can set.

**“A customer asks for erasure but you must keep invoices for ten years. What do you
do?”**
Pseudonymisation. The accounting rows stay — they are a legal obligation and the law
recognises that — and the link to the identifiable person is severed: name, contact
details and tax identifiers overwritten or removed, the surrogate key retained so the
records remain internally consistent. Then confirm the remaining data cannot be
re-identified by joining it against another source, because that is the difference
between pseudonymised and anonymous.

**“How do you know you have found all of someone's personal data?”**
A data map, kept current, plus foreign keys that make the graph traversable — so
"everything belonging to this person" is a query rather than an archaeology exercise.
A table holding a user reference *without* a foreign key is how systems end up with
personal data they do not know they hold, and erasure that is incomplete without anybody
noticing.
