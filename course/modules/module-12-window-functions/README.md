# Module 12 · Window functions

> Site chapters: [13](../../../site/chapters/13-window-functions.html)

---

## 1 · The idea

An aggregate collapses rows. A window function does the same arithmetic and
**keeps them**:

```sql
SELECT id, customer_id, total_cents,
       SUM(total_cents) OVER (PARTITION BY customer_id) AS customer_total
FROM orders;
```

Every order still has its own row, and each one now knows something about its
neighbours. That is the entire concept, and it replaces a whole genre of
self-join-to-an-aggregate query that was the only way to do this before window
functions existed.

Two facts then decide whether you can use one correctly.

**Where they run.** Window functions are evaluated after `WHERE`, `GROUP BY` and
`HAVING`, and before `ORDER BY`. So a window function cannot appear in a `WHERE`
clause — it does not exist yet — and **filtering on one always requires wrapping the
query** in a CTE or derived table. This is not a limitation to work around; it is
the reason the top-N-per-group idiom looks the way it does.

**Which ranking function.** Three of them, and the difference is asked in almost
every interview:

| Function | On a tie | Then |
| --- | --- | --- |
| `ROW_NUMBER` | gives each row a distinct number | no gaps, order arbitrary |
| `RANK` | gives ties the same number | skips, so 1, 1, 3 |
| `DENSE_RANK` | gives ties the same number | does not skip, so 1, 1, 2 |

And the trap inside `ROW_NUMBER`: it breaks ties **arbitrarily and
non-deterministically**. If two orders share a timestamp and you take
`ROW_NUMBER() = 1`, you will get one of them — possibly a different one on the next
run, on a different index, or after a version upgrade. So:

> **Whenever the ranking decides something, add a tie-breaker that makes it total.**
> The primary key is always available and always works.

This is the difference between a query that passes review and one that produces a
different answer in production every few weeks for no discoverable reason.

Finally, performance. A window function needs its input in `PARTITION BY`, then
`ORDER BY` order. If an index already supplies that order, the sort disappears; if
not, the engine sorts — and a sort that does not fit in its memory grant spills to
disk, which is the usual cause of a window query that is fine on test data and
terrible on real data.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/labs/03-top-n-per-group.sql`](../../../reference/labs/03-top-n-per-group.sql) | "The most recent order per customer", with the naive `MAX()` version shown first and its two separate defects named. The assertion checks both row count *and* determinism. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_orders_cust_date ON orders (customer_id, placed_at DESC)` is exactly `(partition column, order column)` for the top-N query. That is not a coincidence — it is what makes the window free. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_lines` has an explicit `line_no` in its primary key. A relation has no order, so "the first line" needs a column — and that column is also the tie-breaker any ranking over lines should use. |
| [`reference/labs/04-gaps-and-islands.sql`](../../../reference/labs/04-gaps-and-islands.sql) | The next module's lab, built on `ROW_NUMBER`. Worth glancing at now to see ranking used as arithmetic rather than as a ranking. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` is a top-N with no window function — `ORDER BY xp DESC LIMIT`. Say why a window is unnecessary here, and what would have to change about the requirement to need one. |

---

## 3 · Do it

### a) See the three ranking functions disagree

```sql
SELECT status, total_cents,
       ROW_NUMBER()  OVER (ORDER BY status) AS rn,
       RANK()        OVER (ORDER BY status) AS rnk,
       DENSE_RANK()  OVER (ORDER BY status) AS dense
FROM orders ORDER BY status;
```

`status` has duplicates, which is the point. Read the three columns side by side
until you can state the difference without looking.

### b) Prove ROW_NUMBER is non-deterministic

```sql
INSERT INTO orders (customer_id, status, placed_at, total_cents)
VALUES (1, 'draft', '2026-03-01T10:00:00Z', 500),
       (1, 'draft', '2026-03-01T10:00:00Z', 900);   -- a deliberate tie

WITH ranked AS (
  SELECT id, customer_id, total_cents,
         ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY placed_at DESC) AS rn
  FROM orders
)
SELECT * FROM ranked WHERE rn = 1 AND customer_id = 1;
```

Run it, then drop and recreate `ix_orders_cust_date`, then run it again. Nothing
about the data changed and the answer is permitted to. Now add `, id DESC` to the
window's `ORDER BY` and it is pinned forever.

### c) Filter on a window function

Try it the way that cannot work, so the error message is familiar:

```sql
SELECT id FROM orders WHERE ROW_NUMBER() OVER (ORDER BY id) = 1;    -- fails
```

Then wrap it. That wrapping is not ceremony — it is the evaluation order made
visible.

### d) Make the sort disappear

```sql
EXPLAIN QUERY PLAN
SELECT id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY placed_at DESC)
FROM orders;
```

Look for a temporary B-tree for the ordering. Then drop `ix_orders_cust_date`, run it
again, and put the index back. The index is `(partition, order)` and that is the
general recipe.

### e) De-duplicate with a ranking

```sql
-- Find duplicate customers by email, keeping the earliest.
WITH d AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY email ORDER BY created_at, id) AS rn
  FROM customers
)
SELECT COUNT(*) FROM d WHERE rn > 1;      -- CHECK THE COUNT FIRST
```

`uq_customers_email` means this returns zero here, which is the lesson: the
constraint is what stops the duplicates existing. Drop the constraint, insert a
duplicate, and run the de-duplication — then add the constraint back, which is the
step people skip.

### f) The exercise

Solve [`reference/labs/03-top-n-per-group.sql`](../../../reference/labs/03-top-n-per-group.sql).
The assertion tests exactly one row per customer **and** that the result does not
change between runs, so a solution without a tie-breaker fails. Check your reasoning
against [SOLUTIONS.md](../../SOLUTIONS.md) afterwards.

---

## 4 · Golden rules

- A window function adds a column about neighbouring rows without collapsing the result.
- Window functions run after `WHERE`/`GROUP BY`/`HAVING` and before `ORDER BY`. Filtering one always needs a CTE or derived table.
- `ROW_NUMBER` gives distinct numbers, `RANK` skips after ties, `DENSE_RANK` does not.
- `ROW_NUMBER` breaks ties arbitrarily and non-deterministically. Add a tie-breaker whenever the result decides something.
- Top-N per group is `ROW_NUMBER() OVER (PARTITION BY … ORDER BY …)` filtered in an outer query.
- De-duplicate by ranking within the duplicate key and deleting `rn > 1` — after checking the count.
- Name a repeated window with `WINDOW w AS (…)` — everywhere except SQL Server.
- An index on `(partition cols, order cols)` removes the sort. A spilling sort is the usual cause of a slow window query.
- After removing duplicates, add the `UNIQUE` constraint that should have stopped them.
- `LATERAL` / `APPLY` lets a derived table see the outer row — the natural top-N-per-group tool.

---

## 5 · Interview questions

**“What is the difference between `ROW_NUMBER`, `RANK` and `DENSE_RANK`?”**
All three number rows within a partition in a given order. `ROW_NUMBER` always gives
distinct numbers, breaking ties arbitrarily. `RANK` gives tied rows the same number
and then skips — 1, 1, 3. `DENSE_RANK` gives tied rows the same number and does not
skip — 1, 1, 2. Choose `ROW_NUMBER` when you need exactly one row per group, `RANK`
or `DENSE_RANK` when ties genuinely are ties.

**“How do you get the most recent row per customer?”**
`ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY placed_at DESC, id DESC)` in a
CTE, filtered to `= 1` in the outer query. The outer query is required because a
window function cannot appear in `WHERE` — it is evaluated later. The second sort
column is not decoration: without it, two rows sharing a timestamp make the result
non-deterministic.

**“Why can't I put a window function in the `WHERE` clause?”**
Because of evaluation order: `WHERE` runs before the window functions are computed,
so it cannot reference one. Wrap the query in a CTE or derived table and filter
outside it. The same reasoning explains why `ORDER BY` *can* reference a window
function — it runs after.

**“A window query is fast in test and slow in production. Where do you look?”**
The sort. The window needs its input partitioned and ordered; if no index supplies
that, the engine sorts, and at production volume that sort exceeds its memory grant
and spills to disk. Check the plan for a spill warning, then consider an index on
the partition columns followed by the ordering columns, which removes the sort
entirely.

**“How would you delete duplicate rows, keeping the oldest?”**
Rank within the duplicate key — `PARTITION BY` the columns that should have been
unique, `ORDER BY` the tie-break that defines "oldest" — then delete where the rank
is greater than one. Check the count with a `SELECT` before converting it to a
`DELETE`. Then add the `UNIQUE` constraint that should have prevented them, or you
will do this again.
