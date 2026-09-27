# Module 10 · Aggregation, grain and set operations

> Site chapters: [10](../../../site/chapters/10-aggregation.html) ·
> [15](../../../site/chapters/15-set-operations.html) ·
> [16](../../../site/chapters/16-case-and-pivot.html)

---

## 1 · The idea

`GROUP BY` does one thing, and naming it correctly makes the whole clause obvious:

> **`GROUP BY` changes the grain.** One output row now stands for many input rows.

Every rule follows. Only the grouping columns and aggregates may appear in
`SELECT`, because anything else has many values at the new grain and no rule for
choosing between them. That is not a restriction the language imposes to be
awkward; it is the only honest answer. MySQL's old behaviour of silently picking
one arbitrarily is worse than an error, because it produces a report that is wrong
in a way nobody can see.

`WHERE` filters rows at the old grain, `HAVING` filters groups at the new one. So a
condition with no aggregate in it belongs in `WHERE` — where it reduces the work —
and a condition containing an aggregate has nowhere else to go but `HAVING`.

The technique in this module that earns its keep daily is **conditional
aggregation**:

```sql
SELECT customer_id,
       COUNT(*)                                        AS orders_all,
       COUNT(CASE WHEN status = 'shipped'   THEN 1 END) AS shipped,
       SUM(CASE WHEN status = 'cancelled' THEN total_cents ELSE 0 END) AS lost_cents
FROM orders GROUP BY customer_id;
```

Three questions, one scan. It works because **aggregates ignore nulls**, so a
`CASE` with no `ELSE` produces nulls for the rows you want excluded and `COUNT`
skips them. Hence the pairing worth memorising: in `COUNT(CASE …)` omit the `ELSE`;
in `SUM(CASE …)` write `ELSE 0`. The alternative — three separate queries joined
together, or three correlated subqueries — is three passes over the same table for
the same answer.

The same tool is how you pivot portably. `PIVOT` exists in SQL Server and Oracle,
is shorter, and is non-portable and single-aggregate. Conditional aggregation is
longer, works everywhere, and can compute several aggregates per column. Either
way the column list is fixed at parse time, so a genuinely dynamic pivot needs
dynamic SQL — and the right answer is usually to let the reporting tool do it.

Set operations close the module because they are where the null rule inverts.
`UNION` deduplicates, and therefore sorts or hashes the entire result; `UNION ALL`
concatenates and is what you want unless duplicates must actually go. And when set
operators compare rows, **two nulls count as equal** — the opposite of `=` — which
is precisely what makes `EXCEPT` the best table-diff tool in the language.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` aggregates each branch to one row per order in a derived table. That is grain management written into the schema: the view's grain is "one row per order" and it says so. |
| [`reference/labs/01-find-the-fanout.sql`](../../../reference/labs/01-find-the-fanout.sql) | What happens when the grain of the input is not what the aggregate assumes. Aggregation and joins are the same subject seen twice. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` reads the pre-computed `xp`, `mastery_percent`, `streak_days` and `chapters_passed` columns instead of aggregating on read. Ask what that buys and what it costs. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `rate_limits` is `(ip, minute)` with a `hits` counter — a pre-aggregated table whose grain is chosen so the query is a point lookup rather than a `COUNT` over a log. |
| [`api/src/mastery.mjs`](../../../api/src/mastery.mjs) | The mastery figure is an aggregate computed in one place, server-side, and the test suite asserts it matches the browser's formula. An aggregate with two implementations is an aggregate with two answers. |

---

## 3 · Do it

### a) Answer four questions in one scan

Write a single query over `orders` returning, per customer: total orders, shipped
orders, cancelled orders, and the value of everything not cancelled. Use
conditional aggregation and no subqueries. Then write it as four separate queries
and compare the plans — the second version reads the table four times for the same
answer.

### b) Get the ELSE wrong on purpose

```sql
SELECT COUNT(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS wrong,
       COUNT(CASE WHEN status = 'shipped' THEN 1      END) AS right_,
       SUM(CASE WHEN status = 'shipped' THEN 1 ELSE 0 END) AS also_right
FROM orders;
```

The first counts **every** row, because `0` is not null and `COUNT` counts it. This
is the commonest conditional-aggregation bug and it always reports too many.

### c) Feel the cost of COUNT(DISTINCT)

```sql
EXPLAIN QUERY PLAN SELECT COUNT(*) FROM order_lines;
EXPLAIN QUERY PLAN SELECT COUNT(DISTINCT product_id) FROM order_lines;
```

The second needs a sort or hash to know what it has already seen. Now put three
`COUNT(DISTINCT)`s over different columns in one query and read the plan again.
That shape is the commonest cause of a dashboard tile that takes nine seconds.

### d) Diff two tables with EXCEPT

```sql
CREATE TABLE orders_copy AS SELECT * FROM orders;
UPDATE orders_copy SET total_cents = total_cents + 1 WHERE id = 3;
UPDATE orders_copy SET shipped_at = NULL WHERE id = 4;

SELECT 'only in original' AS side, * FROM (SELECT * FROM orders EXCEPT SELECT * FROM orders_copy)
UNION ALL
SELECT 'only in copy', * FROM (SELECT * FROM orders_copy EXCEPT SELECT * FROM orders);
```

Both edited rows are found, **including the one where the difference is a null** —
which a join on every column with `=` would have missed entirely. That asymmetry is
the reason to reach for `EXCEPT` when reconciling a load against its source.

### e) The exercise

Build a status pivot: one row per month, one column per order status, values are
counts, plus a total column. Use conditional aggregation over `dim_date`. Then say
in one sentence what has to change when a new status is added to
`ck_orders_status` — that sentence is the honest argument against pivoting in SQL
at all.

---

## 4 · Golden rules

- `GROUP BY` changes the grain: one output row now stands for many input rows.
- Every selected column must be grouped or aggregated. MySQL's old behaviour of picking one arbitrarily is worse than an error.
- `COUNT(*)` counts rows; `COUNT(col)` counts non-nulls; `COUNT(1)` is identical to `COUNT(*)` and no faster.
- `COUNT(DISTINCT)` needs a sort or hash. Several in one query is a common cause of a slow dashboard.
- A condition without an aggregate belongs in `WHERE`, not `HAVING`.
- Conditional aggregation answers several questions in one scan, because aggregates ignore nulls.
- In `COUNT(CASE …)` omit the `ELSE`; in `SUM(CASE …)` write `ELSE 0`.
- `ROLLUP` produces subtotals in one pass; `GROUPING()` tells you which nulls it created.
- `UNION` deduplicates and therefore sorts or hashes the whole result. `UNION ALL` concatenates.
- Default to `UNION ALL`; reach for `UNION` only when duplicates must actually go.
- Branches must match in column count and order; names come from the first branch.
- One `ORDER BY`, at the end, applying to the whole result.
- Set operators treat two nulls as equal — the opposite of `=` — which makes `EXCEPT` an excellent table-diff.
- Pivot with conditional aggregation: portable, multi-aggregate, readable. `PIVOT` is shorter and non-portable.
- The column list of a pivot is fixed at parse time. A dynamic pivot needs dynamic SQL — usually let the reporting tool do it instead.
- Unpivot with `UNION ALL`, or a lateral `VALUES` list for one pass.

---

## 5 · Interview questions

**“Why must every non-aggregated column appear in `GROUP BY`?”**
Because grouping changes the grain: the output row stands for many input rows, so a
column that is not grouped has many candidate values and the language has no rule
for picking one. Requiring it in `GROUP BY` — or inside an aggregate — is the only
answer that is defined. Engines that pick arbitrarily instead of erroring produce
reports that are wrong invisibly.

**“`WHERE` or `HAVING`?”**
`WHERE` filters rows before grouping, `HAVING` filters groups after. If the
condition contains no aggregate it belongs in `WHERE`, where it shrinks the input to
the grouping rather than discarding its output. `HAVING` is for conditions that can
only be evaluated once the group exists, such as `COUNT(*) > 1`.

**“How would you get counts of several statuses in one query?”**
Conditional aggregation: one `COUNT(CASE WHEN status = … THEN 1 END)` per status, in
one pass over the table. It works because aggregates ignore nulls, so the `CASE`
without an `ELSE` excludes the rows you do not want. Omit the `ELSE` under `COUNT`
and write `ELSE 0` under `SUM` — putting `ELSE 0` under `COUNT` counts every row.

**“`UNION` or `UNION ALL`?”**
`UNION ALL` unless you specifically need duplicates removed, because `UNION` must
sort or hash the entire result to deduplicate it. That cost is invisible in the SQL
and substantial at volume. Writing `UNION` by reflex is how a concatenation of two
cheap queries becomes an expensive one.

**“How would you check that a nightly load matches its source?”**
`EXCEPT` in both directions: rows in the source but not the target, then rows in the
target but not the source. It compares whole rows, and — unlike a join on every
column — it treats two nulls as equal, so a row whose only difference is a null is
still reported. Empty results both ways is the reconciliation passing.
