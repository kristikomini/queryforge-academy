# Module 06 · How a SELECT is really evaluated

> Site chapters: [06](../../../site/chapters/06-how-select-is-evaluated.html)

---

## 1 · The idea

SQL is written in an order nobody executes:

```sql
SELECT   ...      -- 5th
FROM     ...      -- 1st
WHERE    ...      -- 2nd
GROUP BY ...      -- 3rd
HAVING   ...      -- 4th
ORDER BY ...      -- 7th
LIMIT    ...      -- 8th
```

This is not trivia. It is the single piece of knowledge that explains the largest
number of otherwise-baffling error messages and wrong answers in the language.

Three consequences, and each one is a bug somebody ships every week:

**Aliases are born in `SELECT`.** So `ORDER BY` — which runs after — can use one,
and `WHERE` — which runs before — cannot. "Invalid column name" on an alias you
can see three lines above is this rule, not a typo.

**`WHERE` filters rows, `HAVING` filters groups.** A condition with no aggregate
in it belongs in `WHERE`, where it removes rows *before* the grouping work. Put it
in `HAVING` and you have grouped rows you were going to throw away.

**A predicate on the null-padded side of a `LEFT JOIN`, placed in `WHERE`, turns
it into an inner join.** With no error. This is the most expensive of the three,
because the query keeps working and the answer is quietly wrong: the padding rows
have `NULL` in that column, `NULL = anything` is `UNKNOWN`, `WHERE` keeps only
`TRUE`, so exactly the rows the `LEFT JOIN` existed to preserve are discarded.

And one caveat that keeps you honest: this order is **what the query means**, not
what the engine does. The optimiser may reorder anything it likes so long as the
answer is identical. You reason in the logical order; the engine reasons in costs.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` uses `LEFT JOIN` to two pre-aggregated derived tables, then `COALESCE`s the results. Ask what would happen if a filter on `paid_cents` were added to a `WHERE` clause over this view. |
| [`reference/labs/01-find-the-fanout.sql`](../../../reference/labs/01-find-the-fanout.sql) | The `GROUP BY` runs after the join, which is exactly why the join's fan-out corrupts the aggregates rather than being fixed by them. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` — a join, a `WHERE` on the users table, an `ORDER BY` and a `LIMIT`. Write down the logical order in which those run, then predict which index is used. |
| [`reference/demos/02-null-logic.sql`](../../../reference/demos/02-null-logic.sql) | The `WHERE` clause keeping only `TRUE` is the mechanism behind every surprise in this demo. |

---

## 3 · Do it

### a) Break a LEFT JOIN without getting an error

```sql
-- Every customer, with their payment count. Customers who never paid show 0.
SELECT c.id, c.name, COUNT(p.id) AS payments
FROM customers c
LEFT JOIN orders   o ON o.customer_id = c.id
LEFT JOIN payments p ON p.order_id    = o.id
GROUP BY c.id, c.name;
```

Count the rows. Now add a filter that looks entirely reasonable:

```sql
... WHERE p.method = 'card'
GROUP BY c.id, c.name;
```

Count them again. Customers with no card payments have not been shown with zero —
they have **vanished**, because `WHERE` ran after the padding and `NULL = 'card'`
is `UNKNOWN`. Now move the condition into the `ON` clause of the payments join and
count a third time. Three different answers, one of which is what was asked for.

### b) Find out which clause your engine lets you cheat in

```sql
SELECT total_cents / 100.0 AS eur FROM orders WHERE eur > 100;      -- fails
SELECT total_cents / 100.0 AS eur FROM orders ORDER BY eur DESC;    -- works
```

The first is the evaluation order, stated as an error message. Fix it by repeating
the expression in `WHERE`, or by wrapping the query so the alias exists by the time
you filter on it.

### c) Move a predicate from HAVING to WHERE and read the plan

```sql
EXPLAIN QUERY PLAN
SELECT customer_id, COUNT(*) FROM orders
GROUP BY customer_id HAVING customer_id = 7;

EXPLAIN QUERY PLAN
SELECT customer_id, COUNT(*) FROM orders
WHERE customer_id = 7 GROUP BY customer_id;
```

Same answer. One of them groups the whole table and then throws almost all of it
away; the other seeks. Some optimisers will rescue you here and some will not,
which is precisely why you do not rely on it.

### d) The exercise

Take `v_order_totals` from the reference schema and write a query for "orders with
something still outstanding, for customers in one region". Put every predicate in
the earliest clause that can legally hold it, then explain — in one sentence per
predicate — why it could not have gone earlier.

---

## 4 · Golden rules

- Evaluation order is `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT`.
- Aliases are born in `SELECT`, so `ORDER BY` can use them and `WHERE` cannot.
- `WHERE` filters rows, `HAVING` filters groups. If it can go in `WHERE`, put it there.
- A predicate on the outer table of a `LEFT JOIN` placed in `WHERE` turns it into an inner join, with no error.
- This order is what the query means. The optimiser may do anything that produces the same answer.
- `DISTINCT` applies to the projected row. Adding a unique column to the select list disables it.
- Reaching for `DISTINCT` to remove duplicates usually means the join is wrong.
- `ORDER BY` runs after `SELECT`, which is why it — alone among the clauses — can use a column alias.

---

## 5 · Interview questions

**“In what order does a `SELECT` actually execute?”**
`FROM`, `WHERE`, `GROUP BY`, `HAVING`, `SELECT`, `DISTINCT`, `ORDER BY`, `LIMIT`.
Then add the sentence that shows you understand why anyone cares: that is the
*logical* order — what the query means — and it explains why `ORDER BY` can use a
`SELECT` alias while `WHERE` cannot. The optimiser is free to execute it any way
that yields the same rows.

**“What is the difference between `WHERE` and `HAVING`?”**
`WHERE` filters rows before grouping; `HAVING` filters groups after it. So a
condition containing an aggregate can only go in `HAVING`, and a condition without
one should always go in `WHERE`, where it reduces the input to the grouping instead
of discarding its output.

**“Why did my `LEFT JOIN` stop returning the unmatched rows?”**
Because a predicate on the right-hand table was in `WHERE` rather than `ON`. The
unmatched rows are padded with `NULL`, the comparison against `NULL` yields
`UNKNOWN`, and `WHERE` keeps only `TRUE`. The join is now an inner join and the
engine has no reason to warn you. Conditions that are part of the *match* go in
`ON`; conditions that filter the *result* go in `WHERE`.

**“Someone adds `DISTINCT` to fix duplicate rows. Is that the right fix?”**
Almost never. Duplicates in a joined query usually mean the join multiplied rows —
a one-to-many relationship traversed twice, or a missing join condition.
`DISTINCT` hides that and does not repair any aggregate computed over the
duplicated rows, so the row count looks right while the sums stay wrong. Find the
fan-out instead.
