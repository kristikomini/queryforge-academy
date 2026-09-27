# Module 09 · NULL and three-valued logic

> Site chapters: [09](../../../site/chapters/09-null-and-three-valued-logic.html) ·
> [16](../../../site/chapters/16-case-and-pivot.html)

---

## 1 · The idea

`NULL` is not a value. It is the absence of one, and SQL models that absence by
adding a third truth value: every comparison involving `NULL` evaluates to
`UNKNOWN` rather than `TRUE` or `FALSE`.

That single decision produces every surprise in this module, and the surprises are
not symmetric — which is the part worth memorising:

> **`WHERE` keeps a row only when the condition is `TRUE`. `CHECK` rejects a row
> only when the condition is `FALSE`.**

So `UNKNOWN` **discards** a row in a `WHERE` clause and **accepts** it in a `CHECK`
constraint. The same expression, over the same null, has opposite effects depending
on which clause it sits in. A `CHECK (price > 0)` does not stop a `NULL` price; a
`WHERE price > 0` does not return one.

From there, the consequences:

- `= NULL` matches nothing, ever. Only `IS NULL` can test for absence.
- `col <> 'x'` silently excludes the rows where `col` is `NULL`, so "everything
  that is not x" is not what you asked for.
- One `NULL` inside a `NOT IN` subquery empties the entire result set.
- Aggregates ignore nulls — so `AVG` divides by the count of *non-null* values, not
  by the row count, and `COUNT(col)` and `COUNT(*)` are different questions.
- `UNIQUE` permits many nulls in most engines, because two unknowns are not known
  to be equal. SQL Server permits exactly one, and that difference will bite you in
  a migration.
- Set operators go the other way and treat two nulls as *equal*, which is exactly
  what makes `EXCEPT` such a good table-diff tool.

The engineering conclusion is not "avoid nulls". It is narrower and more useful:

> **Decide, per column, what a null means — unknown, inapplicable, or not yet — and
> write it down. Undecided is where the bugs live.**

`customers.vat_number` in this codebase is `NULL` for a specific, documented reason:
private customers genuinely have no VAT number. That is *inapplicable*, and it is a
different thing from "we have not asked yet", even though both store the same
absence.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/demos/02-null-logic.sql`](../../../reference/demos/02-null-logic.sql) | `NOT IN` over a column with one null returning **zero rows**, beside the same question asked with `NOT EXISTS`. The expansion is written out in the comments. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `vat_number TEXT NULL` with `uq_customers_vat UNIQUE (vat_number)` — and the comment "multiple NULLs are allowed", which is true here and false in SQL Server. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_customers_live ON customers (name) WHERE deleted_at IS NULL` — a partial index whose predicate *is* a null test. This is the "at most one active" and "only the live rows" pattern. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_events.from_status` is `NULL` on creation, with a comment saying why: there was no previous status. That is documented meaning, not laziness. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ck_orders_shipped` is written as `status NOT IN (…) OR (shipped_at IS NOT NULL AND …)`. Work out what it does when `status` is null, and why the table also declares `status NOT NULL`. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` wraps both aggregates in `COALESCE(…, 0)`. Without it, an order with no payments reports `NULL` outstanding rather than the full amount. |

---

## 3 · Do it

### a) Run the demo and predict each result first

```bash
sqlite3 reference/forge.db < reference/demos/02-null-logic.sql
```

Write your prediction for all three queries on paper before running it. The
`NOT IN` one is the test: if you predicted "it ignores the null row", the demo has
just earned its place.

### b) Prove the WHERE/CHECK asymmetry

```sql
CREATE TABLE t (price INTEGER CHECK (price > 0));
INSERT INTO t VALUES (NULL);        -- accepted: UNKNOWN is not FALSE
SELECT COUNT(*) FROM t WHERE price > 0;   -- 0: UNKNOWN is not TRUE
SELECT COUNT(*) FROM t;                    -- 1
```

The row is in the table and no query with that predicate will find it. Say the rule
out loud: `CHECK` rejects only `FALSE`, `WHERE` keeps only `TRUE`.

### c) Find the rows your inequality is hiding

```sql
SELECT COUNT(*) FROM customers;
SELECT COUNT(*) FROM customers WHERE vat_number = '';
SELECT COUNT(*) FROM customers WHERE vat_number <> '';
```

The second and third do not add up to the first. The missing rows are the nulls.
Now write the version that does answer "every customer without a usable VAT
number", including both the nulls and the empty strings — `NULLIF(TRIM(x), '')`
inside a `COALESCE` is the idiomatic route.

### d) Watch AVG disagree with itself

```sql
SELECT COUNT(*) AS rows_, COUNT(shipped_at) AS shipped,
       AVG(total_cents) AS avg_all
FROM orders;
```

`COUNT(*)` and `COUNT(shipped_at)` differ by the number of unshipped orders. Then
compute an average "per order" by hand as `SUM(x) / COUNT(*)` and compare it with
`AVG(x)`. They differ whenever `x` has nulls, and only one of them is the number
your stakeholder meant.

### e) The exercise

Go through every nullable column in
[`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) and label
it *unknown*, *inapplicable* or *not yet*. Then find the one that is doing two jobs
and say what you would do about it. This is the exercise that turns the rule from a
slogan into a habit.

---

## 4 · Golden rules

- `NULL` is unknown, not empty and not zero. Every comparison with it is `UNKNOWN`.
- `WHERE` keeps only `TRUE`, so `UNKNOWN` filters the row out. `CHECK` accepts `UNKNOWN`, which is the reverse.
- Use `IS NULL`, never `= NULL`.
- One null in a `NOT IN` subquery returns the empty set. Use `NOT EXISTS`.
- `COUNT(*)` counts rows; `COUNT(col)` counts non-null values; `AVG` divides by the non-null count.
- `UNIQUE` permits multiple nulls in most engines but only one in SQL Server. For “at most one active”, use a filtered unique index.
- Null ordering differs by engine. State it with `NULLS FIRST/LAST` if it matters.
- `NULLIF(x, 0)` is the idiomatic division guard.
- Decide what a null means in each column: unknown, inapplicable, or not yet. Undecided is where the bugs live.
- `col <> 'x'` silently excludes rows where `col` is `NULL`.
- Simple `CASE` cannot match `NULL`, because nothing equals `NULL`.
- Always write an `ELSE`. A missing one produces nulls that nobody investigates.
- Prefer `COALESCE` to `ISNULL`: standard, n-ary, and it will not truncate your default.
- Set operators treat two nulls as equal — the opposite of `=` — which makes `EXCEPT` an excellent table-diff.

---

## 5 · Interview questions

**“What is `NULL`?”**
The absence of a value, not a value — so it is not zero and not an empty string, and
every comparison with it yields a third truth value, `UNKNOWN`, rather than `TRUE`
or `FALSE`. That is why `= NULL` never matches and `IS NULL` exists.

**“Why did `NOT IN` return no rows?”**
Because the subquery contained a `NULL`. `x NOT IN (a, b, NULL)` expands to
`x <> a AND x <> b AND x <> NULL`, the last conjunct is `UNKNOWN`, and an `AND`
chain containing `UNKNOWN` can never evaluate to `TRUE`. So `WHERE` — which keeps
only `TRUE` — discards every row. `NOT EXISTS` is null-safe and is what you should
write for an anti-join by default.

**“What is the difference between `COUNT(*)` and `COUNT(column)`?”**
`COUNT(*)` counts rows and is never null. `COUNT(column)` counts rows where that
column is not null. The gap between them is the null count, which makes the pair a
quick data-quality probe. It also explains `AVG`: it divides the sum by the non-null
count, so an average over a column with nulls is not the same as the sum divided by
the row count.

**“A `CHECK (amount > 0)` is on the table. Can a row have a null amount?”**
Yes, unless the column is also `NOT NULL`. A `CHECK` constraint rejects a row only
when its condition evaluates to `FALSE`; a null makes it `UNKNOWN`, which is
accepted. This asymmetry with `WHERE` — which keeps only `TRUE` — is the most useful
null fact to have ready, because it is the one that surprises interviewers' own
colleagues.

**“How do you enforce 'at most one active row per customer'?”**
A filtered — partial — unique index on the customer column, restricted to the rows
where the deactivation timestamp is null. It relies on nulls being permitted
multiple times in a plain unique index in most engines, which is exactly the
behaviour SQL Server does *not* have; there, the filtered index is not an
optimisation but the only way to express it.
