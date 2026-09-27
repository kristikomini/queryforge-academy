# Module 08 · The join and the fan-out

> Site chapters: [08](../../../site/chapters/08-joins.html) ·
> [11](../../../site/chapters/11-subqueries.html)

---

## 1 · The idea

A join is a cross product filtered by `ON`. Start there, because it is the
definition that predicts the bug.

If the `ON` condition matches one row on each side, you get one row out. If it
matches one row on the left and four on the right, you get four rows out — and the
left row's values are now **repeated four times**. That repetition is invisible
until something sums them.

Which is the defect this module exists for:

> **Joining two one-to-many children of the same parent multiplies rows, and every
> aggregate over that join is wrong.**

One order, three lines, two payments. Join all three tables and you get six rows:
each line repeated once per payment, each payment repeated once per line.
`SUM(line_total)` is now doubled and `SUM(payment)` is tripled. The row count looks
plausible. The totals are nonsense. And the report was correct until somebody added
the payments join, which is why the ticket always says "it has been wrong since we
added X".

The fix is not `DISTINCT`. `DISTINCT` removes duplicate *output rows* and does
nothing to an aggregate that has already consumed the duplicates — it makes the
symptom go away at the top while the numbers stay wrong underneath. The fix is to
**pre-aggregate each branch to the grain you want before joining**, so each side
contributes exactly one row per order.

The second half of the module is the family of things that are *not* joins even
though they look like them. `EXISTS` is a semi-join: it asks whether a match exists
and stops looking, so it never duplicates the left row and never needs `DISTINCT`.
`NOT EXISTS` is an anti-join, and it is the one you must use, because:

> **`NOT IN` returns the empty set if the subquery yields a single `NULL`.**

Not an error. Not "ignores that row". The whole result, gone — because
`x NOT IN (10, 20, NULL)` expands to `x <> 10 AND x <> 20 AND x <> NULL`, and that
last conjunct is `UNKNOWN` forever, so the `AND` can never be `TRUE`.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/labs/01-find-the-fanout.sql`](../../../reference/labs/01-find-the-fanout.sql) | The whole defect, as a ticket with evidence attached: a broken report, a diagnosis query that counts the rows the join really produces, and an assertion that fails until you fix it. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` is the correct shape. Two `LEFT JOIN`s to *derived tables that already aggregate*, so neither branch can fan out. The comment says so at the join. |
| [`reference/demos/02-null-logic.sql`](../../../reference/demos/02-null-logic.sql) | `NOT IN` against a column with one `NULL`, returning zero rows, beside `NOT EXISTS` returning the right answer. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `uq_lines_product UNIQUE (order_id, product_id)` — one line per product per order. A uniqueness constraint is what lets you *reason* about fan-out instead of guessing. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` joins `profiles` to `users`. Both sides are one-to-one on the key, which is why it can aggregate nothing and still be correct. Say why out loud. |

---

## 3 · Do it

### a) Reproduce the fan-out and count it

```bash
sqlite3 reference/forge.db < reference/labs/01-find-the-fanout.sql
```

Read the `DIAGNOSIS` row before you touch anything. It prints the line count, the
payment count, and the number of rows the join actually produces — and the third is
the product of the first two. Once you have seen that multiplication written out,
you will recognise it in a plan for the rest of your career.

### b) Watch DISTINCT lie to you

```sql
SELECT DISTINCT o.id, SUM(l.quantity * l.unit_price_cents) / 100.0 AS total_eur
FROM orders o
JOIN order_lines l ON l.order_id = o.id
JOIN payments    p ON p.order_id = o.id
WHERE o.id = 3
GROUP BY o.id;
```

One row out, which looks like the problem is solved. Compare the total with
`v_order_totals`. `DISTINCT` de-duplicated the output *after* `SUM` had already
added each line once per payment.

### c) Fix it by pre-aggregating, and prove it

Rewrite the report so each branch is aggregated to one row per order before the
join, then check it against the view:

```sql
SELECT order_id, line_total_cents, paid_cents FROM v_order_totals WHERE order_id = 3;
```

The lab's assertion at the bottom is the test. Make it pass.

### d) Break NOT IN on purpose

```bash
sqlite3 reference/forge.db < reference/demos/02-null-logic.sql
```

Then write the anti-join two ways — `NOT IN` and `NOT EXISTS` — over
`customers.vat_number`, which is deliberately nullable in this schema. One of them
returns nothing. Explain the expansion out loud; that explanation is the interview
answer.

### e) The exercise

Take the `LEFT JOIN` case, which has its own trap: in a `LEFT JOIN`, `COUNT(*)`
counts an unmatched row as one, while `COUNT(right_table.col)` counts it as zero.
Write "every customer with their order count, including customers with none" both
ways and say which one answers the question.

---

## 4 · Golden rules

- A join is a cross product filtered by `ON`; an outer join adds back the unmatched rows, null-padded.
- `ON` defines the match; `WHERE` filters the result. A right-table predicate in `WHERE` turns a `LEFT JOIN` into an inner join.
- Use `NOT EXISTS` for anti-joins. `NOT IN` returns nothing at all if the subquery yields a single `NULL`.
- `EXISTS` is a semi-join: it does not duplicate the left row and does not need `DISTINCT`.
- Joining two one-to-many children of the same parent multiplies rows. Pre-aggregate each branch instead.
- `DISTINCT` as a fix for duplicates hides a fan-out and does not fix the aggregates.
- In a `LEFT JOIN`, `COUNT(*)` counts unmatched rows as one. `COUNT(right.col)` counts zero.
- Nested loops for small outer inputs, hash for large unsorted ones, merge for pre-sorted. A loops join over a badly estimated outer input is the classic regression.
- `EXISTS`, `IN` and a de-duplicated join usually produce the same plan. Choose on meaning, not on folklore.
- Never `NOT IN` over a nullable column. `NOT EXISTS` instead.
- Three correlated subqueries over the same table is three passes. Pre-aggregate and join once.
- `LATERAL` / `APPLY` lets a derived table see the outer row — the natural top-N-per-group tool.

---

## 5 · Interview questions

**“A report's totals doubled after someone added a join. What happened?”**
A fan-out. The query now joins two one-to-many children of the same parent, so each
row of one is repeated once per row of the other, and every `SUM` over them is
multiplied by the other side's row count. Diagnose it by counting the rows the join
produces against the row counts of each child. Fix it by pre-aggregating each
branch to one row per parent before joining — not with `DISTINCT`, which
de-duplicates the output after the aggregates have already been corrupted.

**“What is the difference between `NOT IN` and `NOT EXISTS`?”**
Behaviour with nulls, and it is not a subtlety. `NOT IN` expands to a chain of
`<>` comparisons joined by `AND`; if the subquery returns a single `NULL`, one
conjunct is permanently `UNKNOWN`, so the whole predicate can never be `TRUE` and
the query returns **no rows at all**. `NOT EXISTS` is null-safe and returns what
you meant. Use `NOT EXISTS` for anti-joins as a habit, so the nullability of the
column stops being something you have to check.

**“When would you use `EXISTS` rather than a join?”**
When the question is "does a match exist" rather than "give me the matched data".
`EXISTS` is a semi-join: it cannot duplicate the left row, so you never need
`DISTINCT` to clean up after it, and the intent is visible to the next reader.
Performance is usually identical — the optimiser recognises all three forms — so
choose on meaning.

**“Why is a nested loops join sometimes catastrophic?”**
Because its cost is the outer row count multiplied by the cost of probing the inner
side once. That is the cheapest plan available when the outer input really is small,
and it is the worst available when the optimiser *estimated* it small and it is
actually large. It is the classic regression after statistics go stale: the plan did
not change, the data did.

**“How do you count orders per customer including customers with none?”**
`LEFT JOIN` and `COUNT` of a column from the right-hand table — `COUNT(o.id)`, not
`COUNT(*)`. `COUNT(*)` counts the null-padded row as one, so every customer with no
orders reports one order instead of zero.
