# The laws of SQL

[GOLDEN-RULES.md](GOLDEN-RULES.md) is organised by **chapter**, which is the
right order for learning. This file is the same knowledge organised by
**concept**, which is the right order for *looking something up when it has just
surprised you*.

You rarely think "I need chapter 22". You think **"this thing behaved in a way I
did not expect, and I do not know what category of thing it even is."** Twelve
books, and the question each one answers:

| Book | The question it answers |
| --- | --- |
| [I · Sets and order](#i--sets-and-order) | Why did the rows come back like that? |
| [II · Nothing, and the absence of it](#ii--nothing-and-the-absence-of-it) | Why did this row vanish? |
| [III · Identity](#iii--identity) | Which row is this, and will it still be this row tomorrow? |
| [IV · Evaluation](#iv--evaluation) | Why is this an error when the same words work elsewhere? |
| [V · Multiplication](#v--multiplication) | Why is the total wrong by an exact multiple? |
| [VI · Access](#vi--access) | Why is it not using the index? |
| [VII · Estimation](#vii--estimation) | Why is it fast for one input and slow for another? |
| [VIII · The window](#viii--the-window) | Why did my running total jump? |
| [IX · Time](#ix--time) | Why is this row an hour out, or missing on the 31st? |
| [X · Interleaving](#x--interleaving) | Why does this only happen under load? |
| [XI · Durability](#xi--durability) | What survives, and what only appears to? |
| [XII · Trust](#xii--trust) | What is this number actually a fact about? |

Every law below is one of the 456 rules from a chapter card, in a different
order. The chapter reference is where it is argued for.

---

## I · Sets and order

*Why did the rows come back like that?*

- A table is an unordered set. Without `ORDER BY` there is no order, no matter what you observed in testing. → [02](../site/chapters/02-relational-model.html)
- If position is part of the meaning, it is a column, not an artefact of storage. → [02](../site/chapters/02-relational-model.html)
- `LIMIT` without `ORDER BY` returns an arbitrary subset, because there is no defined order to take the first *n* of. → [06](../site/chapters/06-how-select-is-evaluated.html)
- `ROW_NUMBER` breaks ties arbitrarily and non-deterministically. Add a tie-breaker whenever the result decides something. → [13](../site/chapters/13-window-functions.html)
- Keyset pagination requires a *total* sort. A non-unique sort key means rows are skipped or repeated across page boundaries. → [30](../site/chapters/30-pagination.html)
- Set operators deduplicate; `UNION ALL` does not. That is a difference in algorithm, not a flag. → [15](../site/chapters/15-set-operations.html)

**The law:** *order is something you ask for, never something you observe.*

---

## II · Nothing, and the absence of it

*Why did this row vanish?*

- `NULL` is unknown, not empty and not zero. Every comparison with it is `UNKNOWN`. → [09](../site/chapters/09-null-and-three-valued-logic.html)
- `WHERE` keeps only `TRUE`, so `UNKNOWN` filters the row out. `CHECK` accepts `UNKNOWN`, which is the reverse. → [09](../site/chapters/09-null-and-three-valued-logic.html)
- One null in a `NOT IN` subquery returns the empty set. Use `NOT EXISTS`. → [08](../site/chapters/08-joins.html)
- `COUNT(*)` counts rows; `COUNT(col)` counts non-null values; `AVG` divides by the non-null count. → [10](../site/chapters/10-aggregation.html)
- `UNIQUE` permits multiple nulls in most engines but only one in SQL Server. → [09](../site/chapters/09-null-and-three-valued-logic.html)
- Null ordering differs by engine. State it with `NULLS FIRST/LAST` if it matters. → [09](../site/chapters/09-null-and-three-valued-logic.html)
- A predicate on the outer table of a `LEFT JOIN` placed in `WHERE` turns it into an inner join, with no error. → [06](../site/chapters/06-how-select-is-evaluated.html)
- Oracle treats the empty string as `NULL`. Nothing else does. → [44](../site/chapters/44-dialects.html)
- Set operators treat two nulls as equal — the opposite of `=` — which makes `EXCEPT` an excellent table-diff. → [15](../site/chapters/15-set-operations.html)

**The law:** *a missing row is usually three-valued logic, and it never raises an
error.*

---

## III · Identity

*Which row is this, and will it still be this row tomorrow?*

- A candidate key is minimal and unique; a primary key is the candidate key you nominated, and is also `NOT NULL`. → [02](../site/chapters/02-relational-model.html)
- Use a surrogate primary key **and** a `UNIQUE` constraint on the natural key. Choosing one instead of the other is the mistake. → [02](../site/chapters/02-relational-model.html)
- Every non-clustered index carries the clustering key, so a wide primary key inflates all of them. → [25](../site/chapters/25-how-an-index-works.html)
- Random UUIDs as clustered keys scatter inserts and split pages. Use v7 or a sequential variant. → [03](../site/chapters/03-data-types.html)
- Surrogate dimension keys are what let a fact point at a *version* of a dimension row. → [39](../site/chapters/39-oltp-vs-olap.html)
- An upsert is only safe because of the unique constraint. The constraint does the work; the syntax is convenience. → [20](../site/chapters/20-upsert-and-idempotency.html)
- After removing duplicates, add the `UNIQUE` constraint that should have stopped them. → [15](../site/chapters/15-set-operations.html)

**The law:** *identity is a constraint you declared, not a column you named `id`.*

---

## IV · Evaluation

*Why is this an error when the same words work elsewhere?*

- Evaluation order is `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT`. → [06](../site/chapters/06-how-select-is-evaluated.html)
- Aliases are born in `SELECT`, so `ORDER BY` can use them and `WHERE` cannot. → [06](../site/chapters/06-how-select-is-evaluated.html)
- Window functions run after `WHERE`/`GROUP BY`/`HAVING` and before `ORDER BY`. Filtering one always needs a CTE or derived table. → [13](../site/chapters/13-window-functions.html)
- `WHERE` filters rows, `HAVING` filters groups. If it can go in `WHERE`, put it there. → [06](../site/chapters/06-how-select-is-evaluated.html)
- `ON` defines the match; `WHERE` filters the result. → [08](../site/chapters/08-joins.html)
- This order is what the query *means*. The optimiser may do anything that produces the same answer. → [06](../site/chapters/06-how-select-is-evaluated.html)
- `CASE` branches are evaluated in order and the first match wins. Order them most specific first. → [16](../site/chapters/16-case-and-pivot.html)
- The recursive member of a recursive CTE sees only the previous iteration, which is why it terminates. → [12](../site/chapters/12-ctes-and-recursion.html)

**The law:** *the clauses do not run in the order you wrote them, and nearly every
beginner error is that one fact.*

---

## V · Multiplication

*Why is the total wrong by an exact multiple?*

- A join is a cross product filtered by `ON`; an outer join adds back the unmatched rows, null-padded. → [08](../site/chapters/08-joins.html)
- Joining two one-to-many children of the same parent multiplies rows. Pre-aggregate each branch instead. → [08](../site/chapters/08-joins.html)
- `DISTINCT` as a fix for duplicates hides a fan-out and does not fix the aggregates. → [08](../site/chapters/08-joins.html)
- `EXISTS` is a semi-join: it does not duplicate the left row and does not need `DISTINCT`. → [08](../site/chapters/08-joins.html)
- In a `LEFT JOIN`, `COUNT(*)` counts unmatched rows as one. `COUNT(right.col)` counts zero. → [08](../site/chapters/08-joins.html)
- Two eager-loaded collections in one ORM query is a Cartesian explosion; split the queries. → [38](../site/chapters/38-the-orm-boundary.html)
- Never store a ratio as a measure. Store the numerator and denominator. → [39](../site/chapters/39-oltp-vs-olap.html)

**The law:** *if a total is wrong by an exact multiple, count the rows the join
produced before you read another line of the query.*

---

## VI · Access

*Why is it not using the index?*

- Sargable means the engine can seek. The indexed column must appear alone and untouched on one side of the comparison. → [07](../site/chapters/07-predicates-and-sargability.html)
- Never wrap the column in a function. Rewrite as a half-open range. → [07](../site/chapters/07-predicates-and-sargability.html)
- Implicit conversion silently disables an index and returns the right answer, so nothing looks broken. → [07](../site/chapters/07-predicates-and-sargability.html)
- `LIKE 'x%'` seeks; `LIKE '%x%'` cannot. Infix search needs full-text or trigrams, not an index. → [07](../site/chapters/07-predicates-and-sargability.html)
- An index on `(a, b, c)` serves any leftmost prefix, and nothing else. → [26](../site/chapters/26-index-design.html)
- Equality columns first, then the range column, then columns needed only for sorting or covering. → [26](../site/chapters/26-index-design.html)
- A key lookup is a random read per row. Past ~1–5% of the table, a scan is genuinely cheaper. → [25](../site/chapters/25-how-an-index-works.html)
- `SELECT *`'s real cost is that it stops an index covering the query. → [29](../site/chapters/29-slow-query-patterns.html)
- Partition elimination only happens when the predicate is on the raw partition key. → [31](../site/chapters/31-big-tables.html)
- `OFFSET n` costs O(offset + limit): it produces and discards every earlier row. → [30](../site/chapters/30-pagination.html)

**The law:** *touch the column and you lose the index — and the query still
returns the right answer.*

---

## VII · Estimation

*Why is it fast for one input and slow for another?*

- The optimiser chooses by estimating rows. Statistics are the estimate. → [28](../site/chapters/28-statistics-and-sniffing.html)
- Stale statistics do not make it slow — they make it confidently wrong. → [28](../site/chapters/28-statistics-and-sniffing.html)
- “Fast for one customer, slow for another” means sniffing. “Slow since the nightly load” means statistics. → [28](../site/chapters/28-statistics-and-sniffing.html)
- The biggest estimate-versus-actual gap is the root cause; everything below it is a consequence. → [27](../site/chapters/27-execution-plans.html)
- A spill to disk means the memory grant was too small, which means the estimate was too low. → [27](../site/chapters/27-execution-plans.html)
- The optimiser assumes columns are independent, so correlated predicates are underestimated. → [28](../site/chapters/28-statistics-and-sniffing.html)
- Table variables and multi-statement TVFs estimate a fixed guess. Temp tables have real statistics. → [28](../site/chapters/28-statistics-and-sniffing.html)
- The `(@p IS NULL OR col = @p)` pattern caches one plan for every parameter combination. → [07](../site/chapters/07-predicates-and-sargability.html)
- Sort the plan cache by *total* time, never average. → [28](../site/chapters/28-statistics-and-sniffing.html)

**The law:** *the plan is built on a guess; when the plan is wrong, suspect the
guess before the operator.*

---

## VIII · The window

*Why did my running total jump?*

- No `ORDER BY` in `OVER` means the frame is the whole partition — a total, not a running total. → [14](../site/chapters/14-frames-and-islands.html)
- Adding `ORDER BY` silently changes the default frame to “start of partition → current row”. → [14](../site/chapters/14-frames-and-islands.html)
- `ROWS` counts physical rows; `RANGE` includes all peers with the same ordering value. → [14](../site/chapters/14-frames-and-islands.html)
- `RANGE` is the default and is usually not what you meant. Write `ROWS`. → [14](../site/chapters/14-frames-and-islands.html)
- `LAST_VALUE` needs an explicit frame to the end of the partition, or it returns the current row. → [14](../site/chapters/14-frames-and-islands.html)
- `ROW_NUMBER` gives distinct numbers, `RANK` skips after ties, `DENSE_RANK` does not. → [13](../site/chapters/13-window-functions.html)
- An index on `(partition cols, order cols)` removes the sort. → [13](../site/chapters/13-window-functions.html)
- Islands of consecutive integers: group by `value − ROW_NUMBER()`. → [14](../site/chapters/14-frames-and-islands.html)

**The law:** *the frame is doing something even when you did not write one.*

---

## IX · Time

*Why is this row an hour out, or missing on the 31st?*

- Store instants in UTC or a zone-aware type; convert at the edge. → [17](../site/chapters/17-strings-dates-timezones.html)
- Store a zone name (`Europe/Rome`), never an offset. Offsets are snapshots of a rule that changes. → [17](../site/chapters/17-strings-dates-timezones.html)
- Local time is ambiguous for one hour every autumn, permanently and unrecoverably. → [17](../site/chapters/17-strings-dates-timezones.html)
- `BETWEEN` on a timestamp loses the last day. Half-open ranges do not. → [07](../site/chapters/07-predicates-and-sargability.html)
- `DATEDIFF` counts boundaries crossed, not elapsed time. → [17](../site/chapters/17-strings-dates-timezones.html)
- A study day is local, not UTC — and day arithmetic through midday UTC dodges every DST edge. → *`site/assets/store.js`*
- Build a calendar table. Working days and holidays are data, not arithmetic. → [17](../site/chapters/17-strings-dates-timezones.html)
- A timestamp is not a version. Two updates in one clock tick share a value. → [24](../site/chapters/24-concurrency-patterns.html)

**The law:** *every time bug is a missing statement about which clock.*

---

## X · Interleaving

*Why does this only happen under load?*

- Check-then-insert is a race. No isolation level below serialisable closes it, because the row does not exist to be locked. → [20](../site/chapters/20-upsert-and-idempotency.html)
- Lost update is not in the anomaly table, happens at the default level, and raises no error. → [22](../site/chapters/22-isolation-levels.html)
- Prefer an atomic update (`SET x = x + n`) over read-modify-write; then optimistic concurrency; then locking. → [22](../site/chapters/22-isolation-levels.html)
- Optimistic concurrency: a version column and `WHERE version = ?`. Zero rows affected is the conflict signal. → [24](../site/chapters/24-concurrency-patterns.html)
- The commonest deadlock cause is inconsistent access order, and the fix is usually one line. → [23](../site/chapters/23-locks-and-deadlocks.html)
- A missing index causes a scan, and a scan locks rows a seek would never have touched. → [23](../site/chapters/23-locks-and-deadlocks.html)
- `SKIP LOCKED` is what makes a queue-in-a-table work with more than one worker. → [24](../site/chapters/24-concurrency-patterns.html)
- Lock escalation turns thousands of row locks into one table lock. Batch large writes. → [23](../site/chapters/23-locks-and-deadlocks.html)
- Never hold a transaction open across a network call or user input. → [21](../site/chapters/21-transactions.html)
- A deadlock victim is a transient error. The application must retry, with randomised backoff and a bounded count. → [23](../site/chapters/23-locks-and-deadlocks.html)

**The law:** *every concurrency bug is a decision made on information that was
true when you read it.*

---

## XI · Durability

*What survives, and what only appears to?*

- A commit waits for the **log** to reach disk, not the data pages. → [01](../site/chapters/01-engines-and-storage.html)
- Durability means it survives a crash, not a dead disk. That is backups. → [21](../site/chapters/21-transactions.html)
- Point-in-time recovery needs an unbroken log chain. One missing file and you stop at the gap. → [41](../site/chapters/41-backup-restore-ha.html)
- Replication is availability, not recoverability. It replicates your mistakes faithfully. → [41](../site/chapters/41-backup-restore-ha.html)
- An untested backup is a file you hope about. The drill is what tells you your real RTO. → [41](../site/chapters/41-backup-restore-ha.html)
- Logins, jobs, certificates and linked servers are not in the database backup. → [41](../site/chapters/41-backup-restore-ha.html)
- There is no transaction across a database and a broker. The outbox turns the dual write into one local transaction. → [24](../site/chapters/24-concurrency-patterns.html)
- Outbox delivery is at-least-once, so consumers must be idempotent. → [24](../site/chapters/24-concurrency-patterns.html)
- DDL is transactional in PostgreSQL and SQL Server, and is not in MySQL or Oracle. That decides how migrations must be written. → [21](../site/chapters/21-transactions.html)

**The law:** *"it was saved" is four different claims, and they fail separately.*

---

## XII · Trust

*What is this number actually a fact about?*

- Consistency in ACID only means “the constraints you declared still hold”. Declare none and it promises nothing. → [21](../site/chapters/21-transactions.html)
- A constraint is an invariant that holds no matter who is writing. Application validation is the same rule in a bypassable place. → [04](../site/chapters/04-ddl-and-constraints.html)
- Constraints are information the optimiser uses. An untrusted constraint enforces the rule but stops helping the plan. → [04](../site/chapters/04-ddl-and-constraints.html)
- Denormalise only after measuring, and always name the mechanism that keeps the copy true. → [05](../site/chapters/05-normalisation.html)
- Store and display `computed_at`. Stale becomes a property, not a bug report. → [32](../site/chapters/32-materialisation-and-caching.html)
- A JSON column has no types, no constraints and no foreign keys. Everything the engine could have checked, it now cannot. → [18](../site/chapters/18-json-in-sql.html)
- Parameterisation is not better escaping. Escaping is a blacklist; parameters are never parsed as syntax. → [34](../site/chapters/34-dynamic-sql-and-injection.html)
- Encryption at rest protects stolen disks and backups, not authenticated queries. → [35](../site/chapters/35-security-and-gdpr.html)
- Dynamic data masking is a display feature and can be inferred around. → [35](../site/chapters/35-security-and-gdpr.html)
- A transformation without a test is an assertion nobody checked. → [40](../site/chapters/40-etl-and-warehouses.html)
- Do not assert on execution plans; assert on outcomes. Plans legitimately change with volume. → [37](../site/chapters/37-testing-sql.html)
- An in-memory fake is not a database. Test against the engine and version you deploy. → [37](../site/chapters/37-testing-sql.html)

**The law:** *ask what a guarantee is a guarantee of, and you will find most of
them are narrower than the word suggests.*

---

## How to use this file

When something surprises you, do not search for the feature. **Decide which book
it belongs to**, read that book's law, and then follow the chapter link for the
argument.

That is a slower path to the answer and a much faster path to not needing to look
it up again — because the twelve laws are the compression, and the chapters are
the expansion.
