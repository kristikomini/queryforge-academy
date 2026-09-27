# Module 16 · Pagination that scales

> Site chapters: [30](../../../site/chapters/30-pagination.html)

---

## 1 · The idea

`OFFSET 10000 LIMIT 20` does not skip ten thousand rows. It **produces** ten thousand
rows, in order, and throws them away. Its cost is `O(offset + limit)`, so page one is
instant, page five hundred is a table scan with a sort on top, and the endpoint gets
slower the further anyone goes — which is why "the last page of the report times out"
is such a common ticket and why nobody can reproduce it on their laptop.

Keyset pagination — sometimes seek method, sometimes cursor pagination — fixes it by
changing the question. Instead of "skip the first N rows", ask **"give me the rows
after this specific point"**:

```sql
-- OFFSET: cost grows with the page number
SELECT id, placed_at FROM orders
ORDER BY placed_at DESC, id DESC LIMIT 20 OFFSET 10000;

-- KEYSET: the same cost on every page
SELECT id, placed_at FROM orders
WHERE (placed_at, id) < ('2026-03-14T09:00:00Z', 8814)
ORDER BY placed_at DESC, id DESC LIMIT 20;
```

The second is an index range seek starting exactly where the last page stopped. Page
five hundred costs what page one costs.

Two requirements make it work, and both are non-negotiable.

**The sort must be total.** Ordering by a non-unique column leaves ties, and a tie
means the engine has no defined boundary between pages — so a row can appear on two
pages or on none. Add a unique tie-breaker; the primary key is always there.

**The comparison should be a row value.** `(a, b) < (x, y)` is a single, sargable
comparison the optimiser can turn into one range seek. The hand-expanded form —
`a < x OR (a = x AND b < y)` — means the same thing and usually plans much worse. SQL
Server has no row-value comparison, so there you write the expanded form and *verify
the plan*, which is the honest version of that advice.

There is also a correctness argument that most people miss, and it is the stronger one:

> **Keyset is correct under concurrent writes. `OFFSET` is not.**

If a row is inserted before your current position between two page requests,
everything shifts by one: `OFFSET` hands you a row you already saw, and skips one you
never will. No error, no warning — just a paginated list that quietly duplicates and
loses rows whenever the underlying data changes. Keyset anchors on values, not
positions, so an insertion elsewhere cannot move your place.

And the honesty this course insists on: keyset **cannot** jump to an arbitrary page
number and cannot cheaply give a total count. If the requirement is genuinely "page 47
of 300", say so and discuss the trade — an approximate count, an capped count, or
accepting `OFFSET` for a small bounded dataset — rather than pretending keyset does
everything.

Last, the security note, because an API cursor is a parameter like any other: it is
**untrusted user input**. Parameterise it, and if it encodes filter state as well as
position, sign it, or a client can edit it into a query you did not intend.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_orders_cust_date ON orders (customer_id, placed_at DESC)` — the descending direction is part of the design. Keyset needs the index in the *sort direction* to walk it without a sort. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_lines` has `PRIMARY KEY (order_id, line_no)` — a ready-made total order, so paginating lines needs no invented tie-breaker. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` is `ORDER BY xp DESC` with a tie-break on `u.created_at`. Ask whether that tie-break makes the order *total*, and what happens to pagination if two users share both values. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `ix_profiles_leaderboard ON profiles (xp DESC)` with the comment "this index supplies the ORDER BY so the query is a short index scan rather than a sort of every profile" — the same mechanism as keyset, applied to a top-N. |
| [`api/src/handlers.mjs`](../../../api/src/handlers.mjs) | The leaderboard returns a fixed top slice rather than an open-ended paginated list. That is a deliberate scope decision; note how it sidesteps this entire problem. |

---

## 3 · Do it

### a) Feel OFFSET degrade

Generate enough rows for the effect to be visible:

```sql
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 200000)
INSERT INTO orders (customer_id, status, placed_at, total_cents)
SELECT 1, 'draft', '2026-01-01T00:00:00Z', i FROM n;
```

Then time the first page and a deep page:

```sql
SELECT id FROM orders ORDER BY id LIMIT 20 OFFSET 0;
SELECT id FROM orders ORDER BY id LIMIT 20 OFFSET 150000;
```

Same twenty rows returned. Very different amount of work done to return them.

### b) Write the keyset version and compare plans

```sql
EXPLAIN QUERY PLAN SELECT id FROM orders ORDER BY id LIMIT 20 OFFSET 150000;
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE id > 150000 ORDER BY id LIMIT 20;
```

One walks the whole index to find its starting point; the other seeks straight to it.

### c) Break OFFSET with a concurrent insert

Read page one ordered by `placed_at DESC`, note the rows. Insert a row that sorts
*before* them. Read page two. One of the rows from page one is back — and one row you
never saw has been pushed past your window. Now repeat the whole exercise with the
keyset query and confirm it cannot happen.

### d) Prove the tie-breaker is load-bearing

```sql
-- placed_at alone is not unique in the data you just generated.
SELECT id FROM orders ORDER BY placed_at DESC LIMIT 5 OFFSET 0;
SELECT id FROM orders ORDER BY placed_at DESC LIMIT 5 OFFSET 5;
```

Run each several times. With a non-total sort the engine is entitled to return
different rows for the same query, so pages can overlap. Add `, id DESC` to both and
the overlap becomes impossible.

### e) The exercise

Write a keyset-paginated "this customer's orders, newest first" over the reference
schema, using a row-value comparison, and confirm from the plan that it uses
`ix_orders_cust_date` with no sort step. Then write the SQL Server form — expanded
`OR` — and say how you would verify it there. Finally, define the cursor you would
return to an API client: which values it carries, how it is encoded, and why it must be
treated as untrusted input.

---

## 4 · Golden rules

- `OFFSET n` costs O(offset + limit): it produces and discards every earlier row.
- Keyset pagination anchors on the last row's sort values and costs the same on every page.
- The sort must be total — add a unique tie-breaker such as the primary key.
- Row-value comparison `(a, b) < (x, y)` is sargable; the hand-expanded `OR` form usually is not.
- SQL Server has no row-value comparison. Write the expanded form and verify the plan.
- Index on exactly the sort columns, in the sort direction.
- Keyset cannot jump to an arbitrary page and cannot cheaply give a total count. Say so.
- Keyset is also correct under concurrent inserts; `OFFSET` silently duplicates and skips rows.
- An API cursor is untrusted user input. Parameterise it, and sign it if it carries filter state.
- Every paginated `ORDER BY` needs a unique tie-breaker, or pages can repeat and skip rows.
- `OFFSET` produces and discards every skipped row, so deep pages get slower without limit.
- Deep `OFFSET` reads and discards everything before the page.

---

## 5 · Interview questions

**“Why is `OFFSET` pagination slow on deep pages?”**
Because the engine has to produce every row before the offset, in sort order, and then
discard them. The cost is proportional to the offset plus the limit, so it grows with
the page number. Page one is cheap and page five hundred is effectively a sorted scan
of everything before it.

**“What is keyset pagination?”**
Instead of skipping N rows, you filter on the sort values of the last row you saw —
`WHERE (sort_col, tie_break) < (last_sort, last_tie)` — and take the next N. That is an
index range seek into exactly the right place, so every page costs the same. The client
carries a cursor holding those values rather than a page number.

**“What does keyset pagination require?”**
A total sort order, which means a unique tie-breaker such as the primary key appended
to the sort — otherwise ties leave no defined page boundary and rows can repeat or
disappear. And an index on exactly those sort columns in the sort direction, so the
range seek needs no sort step.

**“What can't keyset do?”**
Jump to an arbitrary page number, and give a cheap total count — both need counting or
traversing the rows it exists to avoid. So "page 47 of 300" is not directly
expressible. Say that plainly and offer the alternatives: next/previous navigation, an
approximate or capped count, or accepting `OFFSET` for a small bounded dataset where it
genuinely does not matter.

**“Is there a correctness argument, not just a performance one?”**
Yes, and it is the stronger one. `OFFSET` counts positions, so any insert or delete
before the current position between two requests shifts everything: the client sees a
row twice and never sees another, with no error. Keyset anchors on values, so
concurrent writes elsewhere cannot move the client's place.
