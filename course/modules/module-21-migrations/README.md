# Module 21 · Migrations under load

> Site chapters: [36](../../../site/chapters/36-migrations.html)

---

## 1 · The idea

Start from the sentence that decides everything else:

> **The schema is code. If it is not in version control, it is a rumour.**

A database whose structure exists only as the accumulated result of whatever people ran
is a database nobody can recreate, test against, or reason about. Every practice below
follows from treating the schema as source.

A migration is **numbered, immutable, and recorded in the database**. Numbered so the
order is defined; immutable because editing an applied migration means environments
that already ran it will never get your change, and now two databases with the same
version number have different schemas; recorded so the database itself can say what it
has had applied.

**Forward-only.** Down scripts are written calm and run panicking — and they cannot undo
the thing you actually need undone, because a dropped column's data is gone. The
recovery path for a bad migration is another migration forward, plus a restore if data
was lost. Writing rollback scripts you will never successfully run is effort that buys
confidence rather than safety.

The centrepiece is the pattern that makes zero-downtime change possible, and it exists
because of one constraint:

> **Old code and new schema must coexist.** During any deployment, both versions of the
> application are running at once.

Hence **expand, backfill, migrate the code, contract**:

| Phase | What happens |
| --- | --- |
| **Expand** | Add the new structure, nullable or with a default. Old code is unaffected. |
| **Backfill** | Populate it, in batches, idempotently and resumably. |
| **Migrate the code** | Deploy the application that writes and reads the new structure. |
| **Contract** | Only once nothing references the old structure: remove it. |

Renaming a column is therefore not a rename. It is: add the new column; write to both;
backfill; switch reads; stop writing the old one; drop it. Four deployments where the
naive version is one statement — and the naive version takes the application down for
the duration, because between the `ALTER` and the deploy, running code refers to a
column that no longer exists.

Then the operational facts that keep a migration from becoming an outage.

**Set a short lock timeout before DDL.** An `ALTER TABLE` needs a lock; if a long
query holds a conflicting one, your migration queues — and every subsequent query
queues behind *it*, because most lock queues are ordered. A one-statement migration can
take a healthy system down in seconds this way. With a short timeout it fails instead,
and you retry, which is the outcome you want.

**Create indexes concurrently or online** on a live table. `CREATE INDEX CONCURRENTLY`
in PostgreSQL, `WITH (ONLINE = ON)` in SQL Server Enterprise. The plain form locks out
writes for the duration, which on a large table is measured in minutes.

**DDL is transactional in PostgreSQL and SQL Server, and is not in MySQL or Oracle** —
and that single fact changes how migrations must be written. Where DDL is
transactional, a failed migration rolls back cleanly. Where it is not, every step must
be safe to have been half-applied, which means each migration does one thing and is
written to be re-runnable.

**Backfills go in batches, and are idempotent and resumable.** A single `UPDATE` across
fifty million rows takes one enormous lock, produces one enormous log burst, and if it
fails at 90% it rolls all of it back.

And the last one, which is the difference between a migration that took four seconds in
staging and an incident: **test against production-sized data and time it before the
window.**

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | The header comment is an **honest statement of a shortcut**: applied on first run when the table list is empty, which is create-if-missing, *not* migrations. It then says precisely where that trade is wrong — multiple instances race on startup, and the runtime account must hold schema-altering permissions — and what the fix would be. Read this before anything else in the module. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `table_count` — the statement the startup check uses to decide whether the schema exists. That single query is the entire "have we migrated" mechanism, which is exactly why the comment above calls it a shortcut. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | Every object is `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`. Re-runnability, at the file level — which is the property a real migration step also needs. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `profiles.document` is a JSON blob **specifically to avoid a migration per badge**. That is a migration-cost argument driving a modelling decision; module 14 argues the other side of it. |
| [`api/tests/pipeline.test.mjs`](../../../api/tests/pipeline.test.mjs) | The pipeline tests. Consider what "run migrations twice in CI" would look like here and whether the current design would pass it. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | Named constraints throughout — `uq_customers_email`, `ck_orders_status`. A generated constraint name differs per environment, which makes "drop the constraint" unwritable as a migration. |

---

## 3 · Do it

### a) Take a database down with a one-line migration

You need a server engine for lock behaviour:

```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

Session 1 — hold a long read:

```sql
BEGIN;
SELECT * FROM orders LIMIT 1;    -- and leave the transaction open
```

Session 2 — the migration:

```sql
ALTER TABLE orders ADD COLUMN note text;
```

It blocks. Now session 3 — an ordinary query that touches nothing the migration
touches:

```sql
SELECT count(*) FROM orders;
```

It **also** blocks, behind the migration, which is behind the idle transaction. This is
how a trivial `ALTER` causes a full outage, and seeing the third session block is the
moment it becomes real. Now retry with a guard:

```sql
SET lock_timeout = '2s';
ALTER TABLE orders ADD COLUMN note text;
```

It fails in two seconds and nobody else notices. That is the correct behaviour.

### b) Rename a column without downtime

Do the whole four-phase sequence on the reference schema, renaming
`orders.total_cents` to `orders.gross_total_cents`:

1. **Expand** — add the new column, nullable.
2. **Backfill** — in batches, resumably. Write it so running it twice is harmless.
3. **Migrate the code** — simulate by writing both columns in one statement.
4. **Contract** — drop the old column, and only now.

Between each phase, ask: if the deployment stopped here forever, would the application
still work? If the answer is ever no, the sequence is wrong.

### c) Make a backfill resumable

```sql
UPDATE orders SET gross_total_cents = total_cents
WHERE gross_total_cents IS NULL
  AND id IN (SELECT id FROM orders WHERE gross_total_cents IS NULL ORDER BY id LIMIT 5000);
```

Run it repeatedly until it affects zero rows. Note the two properties: the predicate
`IS NULL` makes it idempotent — already-done rows are skipped — and the `LIMIT` makes it
bounded. Kill it halfway and run it again; it picks up where it stopped.

### d) Build an index without blocking writes

```sql
CREATE INDEX ix_orders_note ON orders (note);                -- locks out writes
CREATE INDEX CONCURRENTLY ix_orders_note2 ON orders (note);  -- does not
```

Hold a write transaction open in another session and try each. Then read up on what
`CONCURRENTLY` costs: it cannot run inside a transaction, it is slower, and it can leave
an invalid index behind if it fails — which you must then drop and retry.

### e) The exercise

Write a real migration plan for a change this codebase would plausibly need: splitting
`customers.name` into `first_name` and `last_name`. Number the steps, state which are
DDL and which are backfill, mark where a deployment happens, and say for each step what
happens if it is interrupted. Then write the one paragraph that matters most: how you
would test it against production-sized data and what timing you would want before
agreeing to a window.

---

## 4 · Golden rules

- The schema is code. If it is not in version control it is a rumour.
- A migration is numbered, immutable and recorded in the database. Never edit an applied one.
- Forward-only. Down scripts are written calm and run panicking, and cannot undo a drop.
- Set a short lock timeout before DDL, so a blocked migration fails instead of queueing.
- DDL is transactional in PostgreSQL and SQL Server, not in MySQL or Oracle — so there, every step must be safe to have half-applied.
- Expand, backfill, migrate the code, contract. Old code and new schema must coexist.
- Backfills go in batches, and are idempotent and resumable.
- Create indexes concurrently or online on a live table.
- Test against production-sized data and time it before the window.
- Run migrations twice in CI. If the second run fails, they are not re-runnable.
- DDL is transactional in PostgreSQL and SQL Server, and is not in MySQL or Oracle. That decides how migrations must be written.
- Name every constraint. The generated name differs per environment and tells nobody anything.

---

## 5 · Interview questions

**“How would you add a `NOT NULL` column to a large live table?”**
In phases, because old code is still running. Add it nullable — or with a default, where
the engine can do that as a metadata-only change. Backfill in batches, idempotently and
resumably. Deploy the code that populates it. Only then add the `NOT NULL` constraint,
validating it separately where the engine allows. And set a short lock timeout before
each DDL step so a blocked statement fails instead of queueing the whole system behind
it.

**“How do you rename a column without downtime?”**
You do not rename it. Add the new column, have the application write both, backfill the
old values in batches, switch reads to the new column, stop writing the old one, and
drop it in a later deployment. Four deployments, because at every moment during a rolling
deploy both the old and the new code are running and both must work against whatever
schema is live.

**“Why forward-only rather than up/down migrations?”**
Because down scripts are written in a calm moment and run in a panic, and they cannot
undo what actually hurts — a dropped column's data is gone, and no script restores it.
The realistic recovery path for a bad migration is another migration forward, plus a
restore if data was lost. Maintaining rollback scripts you have never successfully run
buys confidence rather than safety.

**“A migration caused an outage and it was only adding a column. How?”**
Lock queueing. The `ALTER` needed a lock, a long-running query or an idle-in-transaction
session held a conflicting one, so the migration waited — and because lock requests
queue in order, every subsequent query waited behind the migration, including ones that
had nothing to do with that table. Setting a short `lock_timeout` before DDL turns that
outage into a failed migration you retry.

**“How do you test migrations?”**
Against the engine and version you deploy, on production-sized data, timed — because a
statement that takes four seconds on a thousand rows takes forty minutes on fifty
million and that is the number you need before agreeing a window. And run them **twice**
in CI: if the second run fails, they are not re-runnable, which means a partially
applied migration cannot be recovered by simply running it again.
