# Module 18 · Views, procedures, functions and triggers

> Site chapters: [33](../../../site/chapters/33-views-procs-functions-triggers.html) ·
> [45](../../../site/chapters/45-procedural-sql.html)

---

## 1 · The idea

These four objects are how logic gets *into* the database, and each of them has a
sharp, defensible case and a well-documented way of going wrong. Knowing both halves
is what distinguishes an engineer from someone repeating received opinion in either
direction.

**A view is an interface, not a cache.** It is a name for a query, expanded into
whatever references it and re-executed every time. Used well, it is genuinely
valuable: it lets the tables change underneath while the reports keep working, and it
is the right way to hand analysts a stable, correct shape. Used badly, it nests —
a view over a view over a view — and each layer hides cost until nobody can say what
the query at the bottom does. Two levels is plenty, and always read the plan of the
statement you actually run rather than the view definition.

**A procedure's strongest argument is the permission boundary.** Grant `EXECUTE` on a
procedure and no table access at all, and the application physically cannot issue an
arbitrary statement — which means an injection flaw in it has nothing to reach. That is
a real security property, not a preference. The strongest argument *against* is equally
concrete: logic in the database tends to change without review, without CI, and without
anybody outside the database knowing it happened. Both are true at once, and which
dominates depends on whether the schema is under version control — which is why module
21 comes after this one.

**Functions are where the performance traps live,** and the taxonomy is worth having
exact:

| Kind | Behaviour |
| --- | --- |
| Inline table-valued | Expanded into the calling query. Fine. Use these. |
| Multi-statement table-valued | A black box with a **fixed** row estimate. Plans built on a guess. |
| Scalar | Runs **once per row**, no parallelism, no useful estimate. |

A scalar UDF in a `WHERE` clause is the single worst thing in this table: it is
invoked per row, it is opaque to the optimiser, and it usually makes the predicate
non-sargable as well. SQL Server 2019's inlining helps in some cases and is not
something to rely on.

**Triggers** fire inside the caller's transaction, which has two consequences people
discover the hard way. A slow trigger makes every write slow, and the writer has no
idea why. And in SQL Server a trigger fires **per statement, not per row** — so a
trigger written with `SELECT @id = id FROM inserted` is correct until the first
multi-row update, at which point it silently processes one arbitrary row. Where a
trigger genuinely wins is auditing, precisely because it cannot be bypassed: no
application path, no ad-hoc `UPDATE`, no ORM can write without it running.

Finally, procedural SQL itself. The rule is one line:

> **Set-based SQL for the work; procedural code only for control flow around it.**

A cursor is ten thousand statements pretending to be one. If a cursor is genuinely the
right answer — and occasionally it is — declare it `LOCAL FAST_FORWARD READ_ONLY` and
leave a comment explaining why, so the next reader knows it was a decision.

The T-SQL error-handling facts that separate a candidate who has written procedures
from one who has read about them: `SET XACT_ABORT ON` in every procedure that opens a
transaction; `THROW` rethrows the original error where `RAISERROR` replaces it;
`@@ROWCOUNT` is reset by the very next statement so capture it immediately; and check
`@@TRANCOUNT` before rolling back in a `CATCH`, because a nested `COMMIT` commits
nothing while a `ROLLBACK` at any depth rolls back everything.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` and `v_orders_geo` — two views, with the comment stating that a view is an API over the schema and *not* a performance feature. Note neither is nested. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_events` is written **inside the same transaction as the state change**, by the application, rather than by a trigger. That is a deliberate choice; work out what a trigger would have bought and cost here. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | The whole query catalogue is named, parameterised statements in a `.sql` file — logic in SQL, kept in version control, reviewed as code. Compare with the same logic living in stored procedures: what changes about review, CI and deployment? |
| [`api/README.md`](../../../api/README.md) | The decision write-up for keeping the service's logic in SQL files rather than procedures. This is the argument of this module, made as an actual engineering decision with its trade stated. |
| [`api/src/db.mjs`](../../../api/src/db.mjs) | The `-- name:` parser — a tiny convention that gives named statements the benefits people usually reach for procedures to get, without moving logic out of the repository. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | The header comment on create-if-missing versus migrations. A procedure-heavy database makes that distinction much harder, which is the hidden cost. |

---

## 3 · Do it

### a) Prove a view is not a cache

```sql
EXPLAIN QUERY PLAN SELECT * FROM v_order_totals WHERE order_id = 3;
EXPLAIN QUERY PLAN
SELECT o.id, l.line_total_cents, p.paid_cents FROM orders o
LEFT JOIN (SELECT order_id, SUM(quantity*unit_price_cents) line_total_cents
           FROM order_lines GROUP BY order_id) l ON l.order_id = o.id
LEFT JOIN (SELECT order_id, SUM(amount_cents) paid_cents
           FROM payments GROUP BY order_id) p ON p.order_id = o.id
WHERE o.id = 3;
```

The plans are the same, because the view *is* the second query. Nothing was stored.

### b) Watch a view hide cost when nested

```sql
CREATE VIEW v_level2 AS SELECT * FROM v_orders_geo WHERE status <> 'cancelled';
CREATE VIEW v_level3 AS SELECT region, COUNT(*) n FROM v_level2 GROUP BY region;
EXPLAIN QUERY PLAN SELECT * FROM v_level3 WHERE region = 'Marche';
```

Read the plan and count the tables involved. The statement you wrote names one object.
Now imagine debugging this at five levels, which is a real thing that exists in real
systems.

### c) Make a trigger that is wrong for two rows

```sql
CREATE TABLE audit_log (order_id INTEGER, note TEXT);
CREATE TRIGGER trg_orders_audit AFTER UPDATE ON orders
BEGIN
  INSERT INTO audit_log VALUES (NEW.id, 'status now ' || NEW.status);
END;

UPDATE orders SET status = 'submitted' WHERE status = 'draft';
SELECT COUNT(*) FROM audit_log;
```

SQLite fires this per row, so it happens to be right. Now write the SQL Server
equivalent from memory using `inserted`, and identify where the per-statement
assumption would have lost rows. That difference is a portability trap *and* a
correctness bug in the same three lines.

### d) Measure a scalar function in a predicate

```sql
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE total_cents > 1000;
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE abs(total_cents) > 1000;
```

The second wraps the column and loses the index — the same shape as a scalar UDF, with
the additional problem that a UDF is also opaque to cost estimation and runs per row.

### e) The exercise

Take one write path from [`api/sql/queries.sql`](../../../api/sql/queries.sql) —
`update_profile` is a good choice, since it carries the optimistic-concurrency check —
and write the stored-procedure version of it in T-SQL, with `SET XACT_ABORT ON`, a
`TRY`/`CATCH`, `@@ROWCOUNT` captured immediately, and `@@TRANCOUNT` checked before
rollback. Then write two paragraphs: what the procedure version gains (the permission
boundary, one round trip) and what it costs (review, CI, deployment, and the schema
being the place logic hides). That comparison is the interview answer.

---

## 4 · Golden rules

- A view is an interface, not a cache. It is expanded and re-executed every time.
- Nested views hide cost. Two levels is plenty; read the plan of the query you actually run.
- `WITH CHECK OPTION` stops writes that would fall outside the view's own filter.
- The strongest argument for procedures is the permission boundary: `EXECUTE` only, no table access.
- The strongest argument against is logic that changes without review, CI or anyone knowing.
- Inline table-valued functions are good; multi-statement ones estimate a fixed guess; scalar ones run per row.
- Triggers fire per statement. A trigger that assumes one row is wrong the first time two are updated.
- Triggers run in the caller's transaction, so a slow one makes every write slow.
- Auditing is where a trigger genuinely wins, because it cannot be bypassed.
- Set-based SQL for the work, procedural code only for control flow around it.
- `SET XACT_ABORT ON` in every T-SQL procedure with a transaction.
- `THROW` rethrows the original error; `RAISERROR` replaces it.
- `@@ROWCOUNT` is reset by the next statement. Capture it immediately.
- Check `@@TRANCOUNT` before rolling back in a `CATCH`.
- Distinguish “not found” from “changed under us” from “wrong state” — the caller needs to.
- A cursor needs `LOCAL FAST_FORWARD READ_ONLY` and a comment explaining itself.
- A scalar UDF in a predicate is a black box: no estimate, no parallelism, once per row.

---

## 5 · Interview questions

**“Is a view good for performance?”**
No — a plain view is a name for a query, expanded and re-executed at every reference,
so it performs exactly as the underlying query does. Views are good for *interface*:
they let the tables change without every report changing, and they give analysts a
stable, correct shape. If you need stored results you want a materialised or indexed
view, which is a different object with its own refresh cost.

**“Should business logic live in stored procedures?”**
It depends on one thing more than any other: whether the schema is in version control
with a migration pipeline. The strongest argument *for* is the permission boundary —
grant `EXECUTE` and no table access, and an injection flaw in the application has
nothing to reach. The strongest argument *against* is that database logic tends to
change without review, without CI and without anyone outside the database knowing. With
migrations and code review covering the database, procedures are a reasonable choice;
without them, they are where untracked behaviour accumulates.

**“Why is a scalar function in a `WHERE` clause a problem?”**
Three reasons at once. It is invoked once per row rather than once per query; it is
opaque to the optimiser, so there is no useful row estimate and often no parallelism;
and wrapping a column in it makes the predicate non-sargable, so any index on that
column is unusable. An inline table-valued function is expanded into the calling query
and has none of these problems, which is why it is the form to prefer.

**“What is wrong with this trigger?”** *(one that reads `inserted` into a scalar)*
It assumes the statement affected one row. In SQL Server a trigger fires once per
**statement**, and `inserted` is a table — so `SELECT @id = id FROM inserted` takes one
arbitrary row and silently ignores the rest. It works in every test that updates a
single row and is wrong the first time anybody runs a set-based update. Rewrite it
set-based, joining against `inserted`.

**“When is a trigger the right tool?”**
Auditing, mainly — because it cannot be bypassed. Any path that writes to the table
runs it: the application, an ad-hoc fix, an ORM, a migration. That is exactly the
property you want for an audit trail and exactly the property that makes triggers a
bad place for business rules, since the write path now has behaviour that is invisible
at the call site and runs inside the caller's transaction.
