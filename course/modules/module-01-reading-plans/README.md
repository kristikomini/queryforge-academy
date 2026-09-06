# Module 01 · Reading a query plan

> Site chapters: [25](../../../site/chapters/25-how-an-index-works.html) ·
> [26](../../../site/chapters/26-index-design.html) ·
> [27](../../../site/chapters/27-execution-plans.html) ·
> [29](../../../site/chapters/29-slow-query-patterns.html)

---

## 1 · The idea

A query plan is not a diagnostic report. It is **the optimiser showing you what
it decided, and why it thought that was cheapest** — and "why it thought" is the
important half, because the optimiser is guessing.

Everything it decides comes from one number: how many rows it expects each step
to produce. Join order, join algorithm, whether to seek or scan, how much memory
to reserve for a sort. Get that estimate wrong and the plan is not merely
suboptimal, it is built on a false premise — and every operator downstream is a
*consequence*, not a fault.

Which gives the whole method in one sentence:

> **Find the largest gap between estimated and actual rows. Start there.
> Everything below it is a symptom.**

Most people read a plan by looking for the most expensive-looking operator. That
is reading the thermometer. The expensive operator is usually working exactly as
designed, on an input nobody expected it to receive.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_orders_cust_date` is `(customer_id, placed_at DESC)`. Equality column first, then the range column — and the comment says why that order and not the other. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_outbox_pending ... WHERE published_at IS NULL` — a partial index on exactly the worker's predicate, which stays small however large the table grows. |
| [`reference/demos/03-index-effect.sql`](../../../reference/demos/03-index-effect.sql) | Five plans, side by side: scan, seek, seek thrown away by a non-sargable predicate, covering, and an `ORDER BY` that needs no sort. |
| [`reference/labs/02-make-it-sargable.sql`](../../../reference/labs/02-make-it-sargable.sql) | Three predicates that cannot seek. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` — read it and predict the plan before you run it. Which index does the `ORDER BY p.xp DESC` use, and what does the tie-break on `u.created_at` cost? |

---

## 3 · Do it

### a) Watch an index appear and then be thrown away

```bash
sqlite3 reference/forge.db < reference/demos/03-index-effect.sql
```

Read the five plans. The third is the one to sit with: **the index still exists,
and the query threw it away** by wrapping the column in arithmetic. Nothing in
the SQL looks wrong.

### b) Make the ORDER BY free

```sql
EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE customer_id = 7 ORDER BY placed_at DESC;
```

There is no `USE TEMP B-TREE FOR ORDER BY` line. **The absence of that line is
the win** — the index is already in that order, so the sort costs nothing. Now
drop `ix_orders_cust_date` and run it again to see the line appear. Put the index
back.

### c) The measurement that changes how you read plans

On a server engine, where the plan carries real numbers:

```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT c.name, COUNT(o.id)
FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.name;
```

Compare `rows=` (estimated) with `actual rows=` at every node. Then delete the
statistics — `DELETE FROM pg_statistic` is not available to you, but
`ALTER TABLE orders ALTER COLUMN customer_id SET STATISTICS 0; ANALYZE orders;`
is — and run it again. Watch the plan change shape because the *guess* changed,
not the data.

### d) The exercise

Solve [`reference/labs/02-make-it-sargable.sql`](../../../reference/labs/02-make-it-sargable.sql).
Then read the note in [SOLUTIONS.md](../../SOLUTIONS.md) about why one of the
three rewrites is **correct on this data and wrong in general**. That note is the
point of the lab.

---

## 4 · Golden rules

- An index is sorted and shallow. Sorted is why it answers ranges; shallow is why it scales.
- A seek costs three or four page reads whether the table has a thousand rows or a billion.
- A key lookup is a random read per row. Past ~1–5% of the table, a scan is genuinely cheaper.
- “It has an index and still scans” is usually the optimiser being right. Make the index cover the query.
- An index on `(a, b, c)` serves any leftmost prefix, and nothing else.
- Equality columns first, then the range column, then columns needed only for sorting or covering.
- A covering index removes the lookup entirely and is often the single biggest win available.
- Get an actual plan. An estimated plan is missing the diagnostic half.
- The biggest estimate-versus-actual gap is the root cause; everything below it is a consequence.
- Logical reads are measured; cost percentages are estimated. Trust the measured one.
- A sort operator is an invitation to ask whether an index could supply the order.
- A spill to disk means the memory grant was too small, which means the estimate was too low.
- Change one thing and re-measure.

---

## 5 · Interview questions

**“Walk me through how you would investigate a slow query.”**
Actual plan plus IO statistics. Largest estimate-versus-actual gap first, because
everything downstream of a bad estimate is a symptom. Then which table did the
most logical reads. Then: what work did the engine do that it should not have —
a scan where a seek was possible, a sort an index could have supplied, a lookup
per row. Change one thing, re-measure.

**“You see a key lookup executed fifty thousand times. What does that mean?”**
The index found the rows but did not contain every column the query needed, so
the engine follows the pointer back to the table once per row — fifty thousand
random reads. Adding the missing columns to the index (as `INCLUDE` where
available) removes the lookup entirely.

**“Why would the optimiser choose a scan when there is a perfectly good index?”**
Two possibilities, and they need different answers. Either the predicate is not
sargable, so the index *cannot* be used; or it can be used and the optimiser has
correctly costed seek-plus-lookup as more expensive than a sequential scan, which
happens once the query returns more than a few percent of the table.

**“Should you follow SQL Server's missing-index suggestions?”**
They are evidence, not instructions. Each is generated for one query in
isolation: it ignores the indexes you already have, proposes very wide `INCLUDE`
lists, and takes no account of write cost. Read it for which columns matter, then
design the index — often by extending one that exists rather than adding a fourth
similar one.
