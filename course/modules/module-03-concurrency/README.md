# Module 03 · Concurrency you can defend

> Site chapters: [21](../../../site/chapters/21-transactions.html) ·
> [22](../../../site/chapters/22-isolation-levels.html) ·
> [23](../../../site/chapters/23-locks-and-deadlocks.html) ·
> [24](../../../site/chapters/24-concurrency-patterns.html)

---

## 1 · The idea

Every concurrency bug you will meet has the same shape: **a decision made on
information that was true when you read it and false when you acted on it.**

That is the whole thing. Lost update: you read the quantity, someone else
changed it, you wrote a value derived from the old one. Check-then-insert: you
checked for a duplicate, someone else inserted one, you inserted a second.
Read-then-decide-then-write is the pattern, and the window between the read and
the write is the bug.

There are only three ways out, and knowing which to reach for is the skill:

1. **Remove the window.** Make the decision and the write one statement:
   `UPDATE ... SET qty = qty - :n WHERE id = :id AND qty >= :n`. Nothing to race.
   Free, and always the first thing to try.
2. **Detect that you lost.** Optimistic concurrency: carry a version, write
   `WHERE version = ?`, and treat zero rows affected as the conflict signal. No
   lock is held while a human thinks.
3. **Prevent the interleaving.** Pessimistic locking: `SELECT ... FOR UPDATE`,
   held to the end of the transaction. Correct, and it costs concurrency.

And underneath all three: **a constraint, because it is the only defence that
survives somebody writing a second application against the same database.**

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `orders.version` — the optimistic concurrency column, with the comment explaining why it is not a timestamp. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `stock` `CHECK (on_hand >= 0 AND reserved <= on_hand)` — the last line of defence, which holds when the code does not. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `outbox`, and `ix_outbox_pending` — a partial index on exactly the worker's predicate. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `update_profile` — optimistic concurrency in production, and the row count *is* the answer. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `record_failure` — the lockout increment and its threshold test in **one** statement, so two concurrent failures cannot both read 7. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `rate_hit` — `INSERT ... ON CONFLICT DO UPDATE`, for the same reason. |
| [`api/src/handlers.mjs`](../../../api/src/handlers.mjs) | `putProfile` — how zero rows affected becomes a 409 that *carries the current document*. |

---

## 3 · Do it

### a) See a lost update happen

SQLite has one writer, so this needs a server engine:

```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

Two `psql` windows, and go slowly:

```sql
-- window 1                          -- window 2
BEGIN;
SELECT on_hand FROM stock            BEGIN;
WHERE product_id = 1;   -- 19        SELECT on_hand FROM stock
                                     WHERE product_id = 1;   -- 19
UPDATE stock SET on_hand = 19 - 5
WHERE product_id = 1;
COMMIT;
                                     UPDATE stock SET on_hand = 19 - 2
                                     WHERE product_id = 1;
                                     COMMIT;
SELECT on_hand FROM stock WHERE product_id = 1;   -- 17, not 12
```

Five units sold and never deducted. **No error was raised at any point**, and
both sessions behaved correctly at the default isolation level.

Now do it again with `UPDATE stock SET on_hand = on_hand - 5 ...` and watch the
problem disappear entirely — no locking, no version column, no retry.

### b) Cause a deadlock on purpose

```sql
-- window 1                          -- window 2
BEGIN;                               BEGIN;
UPDATE stock SET reserved = reserved WHERE product_id = 1;
                                     UPDATE stock SET reserved = reserved WHERE product_id = 2;
UPDATE stock SET reserved = reserved WHERE product_id = 2;   -- waits
                                     UPDATE stock SET reserved = reserved WHERE product_id = 1;   -- deadlock
```

One session is killed with SQLSTATE 40P01. Then do it again with **both windows
touching product 1 first**, and observe that the deadlock is gone — the same
work, in a consistent order. That is the fix for most real deadlocks, and it is
usually one line of application code.

### c) Prove `SKIP LOCKED` is the whole reason a queue works

```sql
-- window 1
BEGIN;
SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at
FOR UPDATE LIMIT 1;             -- claims row A, holds the lock

-- window 2, WITHOUT skip locked: blocks, waiting for window 1
SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at
FOR UPDATE LIMIT 1;

-- window 2, WITH it: returns row B immediately
SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at
FOR UPDATE SKIP LOCKED LIMIT 1;
```

Ten workers without it is a one-worker system with nine spectators.

### d) The exercise

[`reference/labs/06-claim-a-queue-row.sql`](../../../reference/labs/06-claim-a-queue-row.sql).
Part (c) — naming the three things the queue still needs and what each prevents —
is the part that is actually being assessed.

---

## 4 · Golden rules

- Atomicity is all-or-nothing; isolation is what other sessions can see meanwhile. They are different letters for a reason.
- Consistency in ACID only means “the constraints you declared still hold”. Declare none and it promises nothing.
- Long transactions bloat PostgreSQL, grow the SQL Server log, and make everyone else wait.
- Never hold a transaction open across a network call or user input.
- `READ COMMITTED` is the default nearly everywhere and permits everything except dirty reads.
- Lost update is not in the anomaly table, happens at the default level, and raises no error.
- Prefer an atomic update (`SET x = x + n`) over read-modify-write; then optimistic concurrency; then locking.
- SQL Server readers block writers until `READ_COMMITTED_SNAPSHOT` is on. That setting, not `NOLOCK`, is the fix.
- Blocking is a wait and resolves itself; a deadlock is a cycle and the engine kills a victim.
- The commonest deadlock cause is inconsistent access order, and the fix is usually one line.
- A missing index causes a scan, and a scan locks rows a seek would never have touched.
- A deadlock victim is a transient error. The application must retry, with randomised backoff and a bounded count.
- Optimistic concurrency: a version column and `WHERE version = ?`. Zero rows affected is the conflict signal.
- A timestamp is not a version. Two updates in one clock tick share a value.
- `SKIP LOCKED` is what makes a queue-in-a-table work with more than one worker.
- There is no transaction across a database and a broker. The outbox turns the dual write into one local transaction.
- Outbox delivery is at-least-once, so consumers must be idempotent. Say so rather than implying exactly-once.
- Back every concurrency pattern with a constraint. It is the only defence that survives a second application.

---

## 5 · Interview questions

**“Two users edit the same record. How do you stop one overwriting the other?”**
If it is a simple increment, make the write atomic — there is then no window at
all. Otherwise optimistic concurrency: a version column, `WHERE version = ?`, and
zero rows affected treated as a conflict to report or retry. Pessimistic locking
works but holds a lock across the user's thinking time, which is usually
unacceptable.

**“How do you stop two customers buying the last item?”**
One conditional statement — `UPDATE stock SET on_hand = on_hand - :q WHERE id =
:id AND on_hand >= :q` — treating zero rows affected as out of stock. And
`CHECK (on_hand >= 0)` on the table regardless, because the constraint is the
only defence that survives somebody writing different code against the same
database.

**“What is a deadlock and how do you fix one?”**
Two transactions each holding a lock the other needs. Read the deadlock graph for
the resources and statements, look for an inconsistent access order to normalise,
and look for a missing index causing a scan to lock more than necessary. And the
application retries, because a victim is a transient failure.

**“How do you publish an event reliably when you save a record?”**
A transactional outbox: the domain change and the message in one database
transaction, and a worker that reads the outbox and publishes. It removes the
dual-write problem at the cost of at-least-once delivery, so the consumer needs
an idempotency key — usually a unique constraint on the message id.
