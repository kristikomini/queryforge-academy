# Module 04 · Making a load idempotent

> Site chapters: [19](../../../site/chapters/19-insert-update-delete.html) ·
> [20](../../../site/chapters/20-upsert-and-idempotency.html) ·
> [40](../../../site/chapters/40-etl-and-warehouses.html)

---

## 1 · The idea

Everything retries. The nightly job that failed at 03:40 and somebody re-ran. The
payment webhook the provider delivers twice because your acknowledgement was
lost. The message queue that promises *at-least-once* because exactly-once does
not exist. The deploy that ran the migration a second time.

So the question is never *"will this run twice?"* — it will — but **"what happens
when it does?"**

An operation is **idempotent** if running it twice has the same effect as running
it once. That single property is what makes "just re-run it" a safe sentence
instead of a way to create duplicate invoices. And it is what buys you the
*overlapping* incremental window, which is the only safe way to handle
late-arriving data.

The three mechanisms, in the order you should reach for them:

1. **A natural business key with a unique constraint**, and an upsert against it.
   The database enforces it, so it holds whatever the application does.
2. **A watermark**, advanced in the same transaction as the load — with an
   inclusive comparison, which is only affordable because the load is idempotent.
3. **Delete-and-reload by slice**, which is idempotent by construction and on a
   partitioned table becomes a near-instant partition swap.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `payments.external_ref TEXT NOT NULL` with `uq_payments_ref UNIQUE`. That one constraint is the entire defence against a redelivered webhook. |
| [`reference/schema/02-seed.sql`](../../../reference/schema/02-seed.sql) | The seed is deterministic — arithmetic, never `random()` — so it can be rebuilt identically and lab assertions can be exact. Idempotency applied to test data. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `rate_hit` — `INSERT ... ON CONFLICT DO UPDATE SET hits = hits + 1`. One statement, no check-then-act. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `spend_reset` — single use enforced by the `WHERE` clause, not by reading then writing. Zero rows affected means "already spent", which is reported differently from "unknown". |
| [`api/src/handlers.mjs`](../../../api/src/handlers.mjs) | `register` — it checks for a taken username *and* catches the unique violation, with a comment saying the constraint is the real defence and the check is only for the error message. |

---

## 3 · Do it

### a) Watch check-then-insert lose

Two `psql` windows against PostgreSQL, and a table with **no** unique constraint:

```sql
CREATE TABLE t (email text);

-- window 1                                   -- window 2
BEGIN;                                        BEGIN;
SELECT count(*) FROM t                        SELECT count(*) FROM t
WHERE email='a@b.c';  -- 0                    WHERE email='a@b.c';  -- 0
INSERT INTO t VALUES ('a@b.c');               INSERT INTO t VALUES ('a@b.c');
COMMIT;                                       COMMIT;

SELECT count(*) FROM t;  -- 2
```

Both sessions did the right thing. Now add `ALTER TABLE t ADD CONSTRAINT uq
UNIQUE (email)` and repeat: one of them fails with a violation you can catch.
**The constraint is what made the difference, not the code.**

### b) Prove the upsert is idempotent

```bash
sqlite3 reference/forge.db < reference/labs/05-idempotent-load.sql
sqlite3 reference/forge.db < reference/labs/05-idempotent-load.sql   # again
```

Once you have solved it, the second run must also report `PASS`. A load that only
works the first time is not a load, it is a one-off.

### c) Lose a row to a strict watermark

```sql
-- The classic. Two rows share the maximum timestamp; you read the max,
-- process what you have, and record it.
-- Meanwhile a third row commits WITH THAT SAME TIMESTAMP.
-- Next run: WHERE updated_at > watermark. The third row is gone forever,
-- and nothing anywhere reports an error.
```

Then change it to `>=` and observe that the boundary row is reprocessed — and
that reprocessing is harmless, **because the load is idempotent**. That pairing
is the whole lesson: idempotency is what buys you the safe overlapping window.

### d) The one nobody thinks of

```sql
-- A nightly load where 99% of rows are unchanged still rewrites every row
-- without this. Bloat, log volume, and every trigger fires.
ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
WHERE customers.name IS DISTINCT FROM EXCLUDED.name;
```

Add and remove that `WHERE` on a load of the full `customers` table and compare
the rows-affected count. It is the difference between a two-hour job and a
two-minute one.

### e) The exercise

[`reference/labs/05-idempotent-load.sql`](../../../reference/labs/05-idempotent-load.sql).
Note that it plants **two different duplicate problems** — one within the batch
and one against existing rows — and `ON CONFLICT` alone only solves the second.

---

## 4 · Golden rules

- Write the `SELECT` first, read the count, then convert it to the write.
- Wrap destructive statements in an explicit transaction and check the affected row count before committing.
- Know whether your client is in autocommit before you run a delete, not after.
- `RETURNING` / `OUTPUT` makes “write then read” one atomic round trip and removes a race.
- Ten thousand inserts in one transaction is one log flush instead of ten thousand — routinely 50–100× faster.
- Check-then-insert is a race. No isolation level below serialisable closes it, because the row does not exist to be locked.
- An upsert is only safe because of the unique constraint. The constraint does the work; the syntax is convenience.
- Idempotent means running twice equals running once — which is what makes “just re-run it” safe.
- Three mechanisms: a unique business key, a watermark, or delete-and-reload by slice.
- Update the watermark in the same transaction as the load, and use `>=` because an idempotent load can absorb the overlap.
- Upsert a batch from a staging table, not a row at a time, and skip rows that have not changed.
- Late-arriving data silently disappears with a strict watermark. Overlap the window; idempotency makes that affordable.
- A timestamp-based load cannot detect deletes. Use CDC, or reconcile keys periodically.
- Raw is append-only evidence; staging and marts are rebuildable from it.

---

## 5 · Interview questions

**“How do you make a nightly import safe to re-run?”**
Give every source record a stable business key, put a unique constraint on it,
and load with an upsert — so a re-run updates rather than duplicates. For
incremental loads, advance the watermark inside the same transaction as the
insert and use an inclusive comparison, which is safe precisely because the load
is idempotent.

**“What is wrong with SELECT-then-INSERT?”**
There is a window between them in which another session can insert the same row.
It is a race that only appears under concurrency, so it passes every test and
fails in production. Use an atomic upsert, or let a unique constraint reject the
duplicate and handle the violation.

**“How do you detect that a row was deleted in the source system?”**
A timestamp watermark cannot — a delete leaves no updated row. Either log-based
CDC, which reads the source's transaction log and sees deletes as events, or a
periodic full reconciliation of the key sets. Which one depends on how much load
the source can take.

**“Would you use MERGE?”**
In Oracle, yes. In SQL Server I am cautious: it is not concurrency-safe without
`HOLDLOCK`, it has a documented history of bugs, and it errors unpredictably when
the source contains duplicate keys. For a simple upsert I would often write an
update followed by an insert-where-not-exists in one transaction, which is easier
to reason about.
