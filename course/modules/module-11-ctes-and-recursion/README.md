# Module 11 · CTEs and recursive queries

> Site chapters: [12](../../../site/chapters/12-ctes-and-recursion.html)

---

## 1 · The idea

A CTE names a step. That is its whole purpose, and it is a bigger deal than it
sounds: a query built from four named steps can be *read* in four pieces, and —
crucially — each piece can be run on its own while you are debugging. A nested
subquery three levels deep cannot.

What a CTE is **not** is a performance feature, and this is where people get hurt:

> **A CTE is not automatically materialised.**

In SQL Server and MySQL it is inlined into the outer query and re-evaluated at every
reference. Name an expensive aggregate as a CTE, reference it three times because
that reads nicely, and you have asked for it three times. PostgreSQL materialised
CTEs by default until version 12 and now inlines them unless you say
`AS MATERIALIZED` — so the same SQL changed behaviour across a version upgrade,
which is a useful thing to have an opinion about in an interview.

When you genuinely need single evaluation, say so explicitly: `AS MATERIALIZED`
where it exists, or a temp table — which has the additional advantage of carrying
real statistics, where a CTE and a table variable do not.

**Recursion** is the other half. A recursive CTE has exactly two parts joined by
`UNION ALL`: an anchor that runs once, and a recursive member that references the
CTE itself. The reason it terminates is the part people cannot explain under
pressure:

> **The recursive member sees only the rows produced by the previous iteration**,
> not the whole accumulated set. When an iteration produces no rows, it stops.

So the shape is: start at the root, join children to the previous level, repeat.
Add a depth column and increment it, because you need the depth anyway and because
of the rule that matters most in production:

> **Always add a depth guard. Real hierarchy data contains cycles.**

An employee who is transitively their own manager — through a data-entry error, a
reorganisation done badly, or a merge of two org charts — turns a recursive CTE into
an infinite loop that consumes the server. `CHECK (manager_id <> id)` stops the
one-step cycle and cannot stop the three-step one. `UNION` instead of `UNION ALL`
breaks cycles by deduplicating, and pays for a sort on every iteration.

And the escape hatch worth knowing: a read-heavy tree does not have to be walked at
all. Store the materialised path — `/1/7/23/` — and ancestry becomes a `LIKE 'prefix%'`
range seek with no recursion. You pay on write and on move, which is the right trade
when reads outnumber writes by orders of magnitude.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `employees` is self-referencing — `manager_id INTEGER NULL REFERENCES employees(id)` — with `NULL` marking the root. The comment says it exists so the course has a real hierarchy to recurse over. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ck_employees_not_own_manager CHECK (manager_id <> id)` — the one-step cycle guard, and a good prompt for "what does this *not* prevent?". |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_employees_manager ON employees (manager_id)` — the index each recursive step seeks on. Drop it and every iteration becomes a scan. |
| [`reference/demos/01-float-money.sql`](../../../reference/demos/01-float-money.sql) | Uses `WITH RECURSIVE` as a **generator** — a thousand iterations to accumulate floating-point error. Recursion is not only for trees. |
| [`reference/demos/04-page-and-row-width.sql`](../../../reference/demos/04-page-and-row-width.sql) | The same generator trick, used to populate twenty thousand rows without an external tool. This is the most useful non-hierarchy use of recursion there is. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` uses derived tables rather than CTEs. Ask why that choice is invisible to the optimiser and visible to the reader. |

---

## 3 · Do it

### a) Walk the tree, with depth and a path

```sql
WITH RECURSIVE tree AS (
  SELECT id, name, manager_id, 0 AS depth, '/' || id || '/' AS path
  FROM employees WHERE manager_id IS NULL          -- the anchor: runs once
  UNION ALL
  SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.id || '/'
  FROM employees e
  JOIN tree t ON e.manager_id = t.id               -- sees only the previous level
  WHERE t.depth < 20                               -- the guard
)
SELECT depth, path, name FROM tree ORDER BY path;
```

Read the `path` column: that is the materialised path, computed on the fly. Now
remove the `WHERE t.depth < 20` line and keep it removed for the next step.

### b) Introduce a cycle and watch it matter

```sql
-- Find two employees in a manager relationship and close the loop.
UPDATE employees SET manager_id = (SELECT MAX(id) FROM employees) WHERE manager_id IS NULL;
```

Now run the unguarded query. SQLite will run until it exhausts memory or you
interrupt it; a server engine will either error at a recursion limit or consume a
core. Put the guard back, run it again, and note that **the guard turns a hang into
a wrong-but-bounded answer** — which is why you also want the cycle *detected*, not
merely bounded. Restore the data afterwards:

```bash
sqlite3 reference/forge.db < reference/schema/01-schema.sql
```

### c) Detect the cycle instead of just surviving it

Extend the CTE to carry the path and refuse to extend it into a node already in the
path:

```sql
  AND t.path NOT LIKE '%/' || e.id || '/%'
```

This is the production-grade version, and it is three extra lines. Compare with the
`UNION` approach — swap `UNION ALL` for `UNION` — and read both plans to see the
per-iteration sort you just bought.

### d) Prove a CTE is re-evaluated

On PostgreSQL, where you can control it:

```sql
EXPLAIN (ANALYZE) WITH c AS (SELECT customer_id, COUNT(*) n FROM orders GROUP BY customer_id)
SELECT (SELECT SUM(n) FROM c), (SELECT MAX(n) FROM c), (SELECT MIN(n) FROM c);
```

Then again with `WITH c AS MATERIALIZED (…)`. Count the aggregate nodes in each
plan. That difference is the whole argument for saying what you mean.

### e) The exercise

Write "every employee, with the name of their top-level manager and their distance
from the root", with a depth guard and cycle detection. Then write the same answer
assuming a `path` column exists and is maintained — no recursion at all — and state
which you would deploy for an org chart read on every page load.

---

## 4 · Golden rules

- A CTE names a step. Its main value is readability and being able to run each step alone while debugging.
- A CTE is not automatically materialised. In SQL Server and MySQL it is inlined and re-evaluated per reference.
- When you need single evaluation, say so: `AS MATERIALIZED`, or a temp table — which also gets statistics.
- A recursive CTE has an anchor and a recursive member joined by `UNION ALL`.
- The recursive member sees only the previous iteration, which is why it terminates.
- Always add a depth guard. Production hierarchy data contains cycles.
- `UNION` instead of `UNION ALL` breaks cycles by deduplication, and pays for a sort each iteration.
- Read-heavy trees can be stored as materialised paths and queried without recursion at all.

---

## 5 · Interview questions

**“What is a CTE and when would you use one?”**
A named subquery that exists for the duration of the statement. Its value is
readability and debuggability — each step can be selected from on its own — plus
recursion, which has no other syntax. It is not a performance feature and not a
cache.

**“Is a CTE materialised?”**
Not by default in most engines. SQL Server and MySQL inline it and re-evaluate it at
every reference, so referencing an expensive CTE three times computes it three
times. PostgreSQL materialised them until version 12 and now inlines unless you
write `AS MATERIALIZED`. If you need single evaluation, say so explicitly, or use a
temp table — which also gets real statistics, where a CTE does not.

**“How does a recursive CTE terminate?”**
The recursive member sees only the rows the previous iteration produced, not the
whole accumulated result. Each iteration therefore works on a shrinking frontier,
and when an iteration returns no rows the recursion stops. That is also why a cycle
in the data breaks it: the frontier never empties.

**“What goes wrong with recursive queries in production?”**
Cycles. Real hierarchy data — org charts, bills of materials, category trees —
contains them, through data entry, merges and reorganisations. Without a guard the
query loops until it exhausts memory or hits an engine recursion limit. Always carry
a depth column with a bound, and for anything important detect the cycle properly by
carrying the path and refusing to revisit a node.

**“A category tree is read on every page and changes twice a year. How would you
query it?”**
Not recursively. Store a materialised path on each row, so "everything under this
node" is a `LIKE 'path%'` prefix range that an index can seek, and ancestry is
already in the string. The cost is maintaining the paths on insert and on move,
which is the right trade when reads outnumber writes by orders of magnitude.
