# Worked solutions

Answers to the labs in `reference/labs/`, **with the reasoning**. The reasoning is
the point: an answer you can reproduce is worth something, an answer you can
explain is worth the job.

Read these after you have genuinely attempted the lab. The labs are deliberately
red — each one fails its own assertion until you fix it — and reading the answer
first converts a retrieval exercise into a reading exercise, which feels
productive and is not.

---

## Lab 01 · Find the fan-out

**The bug.** Two one-to-many joins from the same parent **multiply** rows rather
than adding them. Order 3 has 4 lines and 1 payment, so the join produces 4 rows,
each carrying the same payment — and `SUM(p.amount_cents)` counts that payment
four times. With 2 lines and 3 payments it would be 6 rows, the line total 3×
too big and the payment total 2× too big.

**Why `DISTINCT` is not the fix.** It removes duplicate *rows*. The aggregate has
already been computed over the duplicated set, so the sums stay wrong — and now
the bug is hidden.

**The fix: pre-aggregate each branch, then join one-to-one.**

```sql
DROP VIEW IF EXISTS fixed_report;
CREATE VIEW fixed_report AS
  SELECT o.id                                     AS order_id,
         COALESCE(l.line_total_cents, 0) / 100.0  AS line_total_eur,
         COALESCE(p.paid_cents, 0)      / 100.0   AS paid_eur
  FROM orders o
  LEFT JOIN (SELECT order_id, SUM(quantity * unit_price_cents) AS line_total_cents
             FROM order_lines GROUP BY order_id) l ON l.order_id = o.id
  LEFT JOIN (SELECT order_id, SUM(amount_cents) AS paid_cents
             FROM payments    GROUP BY order_id) p ON p.order_id = o.id;
```

Three details the assertion is checking for:

- **`LEFT JOIN`, not `JOIN`.** An inner join drops the 360 orders with no
  payments — which is exactly what the first failing run reports: 1 440 rows
  where there are 1 800 orders.
- **`COALESCE(..., 0)`.** Without it an unpaid order shows `NULL`, not `0`, and
  every downstream arithmetic operation propagates the null.
- **Each derived table is grouped**, so each contributes at most one row per
  order. That is what makes the join one-to-one and the multiplication impossible.

**In an interview**, the sentence to say is: *"two one-to-many joins from the same
parent multiply; I would aggregate each branch first so each side contributes one
row."*

---

## Lab 02 · Make it sargable

**(a) A function on the column.**

```sql
-- was: WHERE strftime('%Y', placed_at) = '2026'
WHERE placed_at >= '2026-01-01' AND placed_at < '2027-01-01'
```

The index stores `placed_at`, not `strftime('%Y', placed_at)`, so the engine has
no way to know which stored values satisfy the expression. Note the **half-open**
range rather than `BETWEEN '2026-01-01' AND '2026-12-31'`, which silently drops
everything on 31 December after midnight.

**(b) Arithmetic on the column.**

```sql
-- was: WHERE total_cents / 100 > 5000
WHERE total_cents > 500000
```

Move the arithmetic to the constant side. It is evaluated once, and the column is
left alone.

> **A subtlety worth noticing, and it does not show up in the count.** These two
> predicates are not exactly equivalent. Integer division truncates, so
> `total_cents / 100 > 5000` is true from 500 100 onward, while
> `total_cents > 500000` is true from 500 001. The strictly correct rewrite is
> `total_cents >= 500100`.
>
> On this seed all three give **1 171**, because no order happens to land in the
> 99-cent gap — check it yourself:
>
> ```sql
> SELECT COUNT(*) FROM orders WHERE total_cents > 500000 AND total_cents < 500100;  -- 0
> ```
>
> So the lab's assertion cannot catch this, and that is the lesson: **a rewrite
> that passes the test can still be wrong.** Rewriting a predicate means
> preserving its *result set*, not only its intent, and reasoning about the
> boundary is the only thing that establishes that. A different month of data
> would have made this a production bug.

**(c) The leading wildcard.** Two problems:

1. `LOWER(email)` wraps the column. Fixable: store the email already normalised
   (the reference schema does), or create an expression index on
   `LOWER(email)`.
2. `LIKE '%esempio.it'` has a **leading wildcard**, and that one is *not*
   fixable with a B-tree. An index is sorted by prefix; there is no prefix to
   seek on. The honest answer is to change the tool — a full-text or trigram
   index — or, if the requirement is really "emails at this domain", to store the
   domain as its own column and index that.

Saying *"one of these is a rewrite and the other needs a different kind of index"*
is the answer being looked for.

---

## Lab 03 · Top-N per group

**Why `MAX()` with other columns is wrong.** `MAX(placed_at)` collapses the group;
`id` and `total_cents` are then unrelated to the row that produced the maximum.
SQLite happens to return a value; every standards-compliant engine rejects the
query outright. Getting a plausible-looking answer from a query that is
semantically meaningless is worse than an error.

```sql
DROP VIEW IF EXISTS latest_order;
CREATE VIEW latest_order AS
  SELECT customer_id, order_id, placed_at, total_cents
  FROM (
    SELECT customer_id,
           id AS order_id,
           placed_at,
           total_cents,
           ROW_NUMBER() OVER (PARTITION BY customer_id
                              ORDER BY placed_at DESC, id DESC) AS rn
    FROM orders
  )
  WHERE rn = 1;
```

**The two things being marked:**

- **The wrapping level.** `WHERE rn = 1` cannot go in the same `SELECT`, because
  `WHERE` is evaluated before window functions exist. Every top-N-per-group query
  has two levels, and the error message when you forget does not say so.
- **The tie-breaker `, id DESC`.** Without it, two orders sharing a `placed_at`
  are ordered arbitrarily, and the arbitrary choice can change when the plan
  changes. That is the answer to the question at the bottom of the lab: nothing
  guarantees tomorrow's result matches today's unless the sort is *total*.

**The alternative worth naming:** `CROSS APPLY` / `LATERAL` with `ORDER BY …
LIMIT 1`, which can stop after one row per customer instead of ranking all of
them — usually faster with an index on `(customer_id, placed_at DESC)`.

---

## Lab 04 · Gaps and islands

```sql
DROP VIEW IF EXISTS runs;
CREATE VIEW runs AS
  WITH days AS (
    SELECT DISTINCT date(placed_at) AS d FROM orders
  ),
  numbered AS (
    SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS rn FROM days
  ),
  grouped AS (
    SELECT d, julianday(d) - rn AS grp FROM numbered
  )
  SELECT MIN(d) AS run_start, MAX(d) AS run_end, COUNT(*) AS days
  FROM grouped
  GROUP BY grp;
```

**Why it works.** Inside a run of consecutive days, both the day and the row
number increase by exactly one, so their difference is constant. Across a gap the
day jumps and the row number does not, so the difference changes and a new group
begins.

```
d:       1  2  3  7  8  12
rn:      1  2  3  4  5   6
d - rn:  0  0  0  3  3   6      ← one constant per island
```

**Two things the assertion catches:**

- `DISTINCT` on the day. Several orders on one day would otherwise be numbered
  separately and every run would appear to be length 1.
- `julianday(d) - rn`, not `d - rn`. `d` is a text date in SQLite; subtracting a
  number from it does not do date arithmetic. Convert first.

**The general form,** for irregular steps — sessionisation, status runs — is to
flag where a new group *starts* and take a running `SUM` of the flag as the group
id. That version works when the step is not a fixed one day, and it is the one to
show if the interviewer follows up.

---

## Lab 05 · Idempotent load

```sql
INSERT INTO payments (order_id, amount_cents, method, external_ref)
SELECT order_id, amount_cents, method, external_ref
FROM (
  SELECT order_id, amount_cents, method, external_ref,
         ROW_NUMBER() OVER (PARTITION BY external_ref ORDER BY rowid) AS rn
  FROM staging_payments
)
WHERE rn = 1                                   -- deduplicate WITHIN the batch
ON CONFLICT (external_ref) DO NOTHING;         -- and against what is already there
```

**Two distinct duplicate problems, and the lab has both:**

1. **Within the batch.** The staging file itself contains `PAY-LAB-0001` twice.
   `ON CONFLICT` alone does not help — in PostgreSQL a single statement inserting
   the same key twice raises *"ON CONFLICT DO UPDATE command cannot affect row a
   second time"*. Deduplicate the source first.
2. **Against existing rows.** `ON CONFLICT (external_ref) DO NOTHING` makes the
   re-run a no-op rather than an error.

**The question at the bottom.** The line that already prevents the duplicate is
in `reference/schema/01-schema.sql`:

```sql
CONSTRAINT uq_payments_ref UNIQUE (external_ref)
```

Without it, `ON CONFLICT` has nothing to conflict against and silently degrades to
a plain `INSERT` — so the load would duplicate on every re-run and nothing would
report an error. **The constraint does the work; the syntax is convenience.** That
is the whole lesson of the lab.

---

## Lab 06 · Claim a queue row

**(a) PostgreSQL.** The two words are **`FOR UPDATE SKIP LOCKED`**.

```sql
UPDATE outbox
SET    claimed_at = now(), claimed_by = $1, attempts = attempts + 1
WHERE  id = (
  SELECT id FROM outbox
  WHERE  published_at IS NULL
    AND (claimed_at IS NULL OR claimed_at < now() - INTERVAL '5 minutes')
  ORDER  BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT  1
)
RETURNING id, topic, payload;
```

`FOR UPDATE` takes the write lock at read time, so the row cannot be claimed twice.
`SKIP LOCKED` is what makes it *useful*: without it, ten workers polling the same
table all block on the same first row and you have a one-worker system with nine
spectators. With it, each worker takes a different row on its first attempt.

**(b) SQL Server.** `WITH (UPDLOCK, READPAST)`. `UPDLOCK` takes the update lock
during the read; `READPAST` skips rows locked by others. Same two ideas, different
spelling.

**(c) The three things, all already in the schema:**

| Thing | In the schema | Prevents |
| --- | --- | --- |
| A **claim timeout** | `claimed_at < now() - INTERVAL '5 minutes'` in the predicate | A worker that dies holding a claim keeping the job forever |
| An **attempts counter** | `attempts INTEGER NOT NULL DEFAULT 0`, incremented on claim | A permanently failing message being retried until the end of time — pair it with a dead-letter threshold |
| A **partial index** | `ix_outbox_pending ON outbox (created_at) WHERE published_at IS NULL` | The worker's query degrading as the table grows; published rows leave the index entirely, so it stays tiny forever |

---

## Lab · Schema invariants

This one is not an exercise with a hidden answer — it is a tool, and it passes
against the reference schema as shipped. The useful exercise is to **prove it can
fail**, because a check that never fires is worthless:

```sql
CREATE TABLE bad_no_pk  (a INT, b INT);
CREATE TABLE bad_float  (id INTEGER PRIMARY KEY, unit_price REAL);
CREATE TABLE bad_fk     (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id));
CREATE TABLE bad_status (id INTEGER PRIMARY KEY, status TEXT NULL);
```

Re-run the lab and all four invariants report their violation. Then drop the
tables.

The third invariant — **every foreign key column has an index whose first column
is that column** — is the one that matters most in practice. Without it, deleting
a parent row scans the whole child table to prove nothing references it, and holds
locks while it does. It is one of the most common causes of a mysterious
delete-and-blocking incident, and it is three lines of CI away from being
impossible.
