# Module 17 · Big tables and pre-aggregation

> Site chapters: [31](../../../site/chapters/31-big-tables.html) ·
> [32](../../../site/chapters/32-materialisation-and-caching.html)

---

## 1 · The idea

The first thing to say about big tables is the thing nobody wants to hear:

> **Most big-table problems are indexing problems.** Check that first.

Partitioning, sharding and archiving are all substantial, permanent commitments, and a
sizeable proportion of the tables they get applied to were simply missing a composite
index. Establish that you have exhausted the cheap option before you propose the
expensive one — in an interview, saying this *first* is most of the signal.

When partitioning is right, it is right for a reason people usually get backwards:

> **Partitioning is for manageability, not speed.**

Loading a month, archiving a month, dropping a month — those become metadata
operations instead of hours of logged deletes. That is the win. Query speed is a
secondary and *conditional* benefit, because partition elimination only happens when
the predicate is on the **raw partition key**. Wrap it in a function and you are back
to touching every partition. And a query that does not filter on the partition key at
all is genuinely **slower** partitioned than it was before, because the engine now
visits many structures instead of one.

Two more facts that decide designs. The partition key must be part of the primary key,
because enforcing uniqueness across partitions cannot be done cheaply. And detaching a
partition is a metadata change, while deleting the same rows is fully logged work
measured in hours — which is the entire argument for partitioning by date on a table
with a retention policy.

For everyone who is not partitioned, archiving is still solvable, and the recipe is
specific: **batched, ordered, bounded deletes**. Delete in chunks of a few thousand,
in key order, in their own transactions, with a bound on how long the job runs. A
single `DELETE` of fifty million rows takes one enormous lock, produces an enormous log
burst, escalates to a table lock, and blocks everything — and if it fails at 90% it
rolls all of it back.

Then the escalation order, which is the answer to "how do we scale this", in the order
you should actually try:

> **Index, archive, replicate, partition, bigger machine — and only then shard.**

Sharding costs you cross-shard transactions, cross-shard joins and foreign keys,
permanently and irreversibly.

The second half of the module is the other way to make a big table fast: stop reading
it. **Caching and pre-aggregation trade freshness for speed**, and the discipline is
entirely in how you specify the trade:

> **Decide the tolerated staleness first, in numbers. If you cannot name the
> invalidation mechanism, you have not designed a cache.**

Note what a plain view is not: it is a *name for a query*, expanded and re-executed
every time, and does nothing for performance. A materialised view does store results —
refreshed manually in PostgreSQL, maintained synchronously on every write for SQL
Server's indexed views, which means the write path pays for every read you accelerated.
Refresh incrementally by slice, because a full refresh stops scaling at exactly the
size that made you want it. And store and display `computed_at`, so "stale" becomes a
visible property rather than a bug report.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_order_totals` is a **plain view** — a name for a query, re-executed on every reference. It is the right choice here and it is not a cache; the comment says exactly that. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_outbox_pending ON outbox (created_at) WHERE published_at IS NULL` — a partial index as an alternative to archiving: published rows leave the index entirely, so the worker's index stays tiny however large the table grows. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `orders.placed_at` is the natural partition key for this schema. Work out what would have to change about `PRIMARY KEY (id)` to partition by it, and why. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `profiles` carries `xp`, `mastery_percent`, `streak_days`, `chapters_passed` — **pre-aggregated on write** from the document. This is materialisation with a synchronous refresh, and its invalidation mechanism is named: every write recomputes it. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `rate_limits (ip, minute)` with a `hits` counter — pre-aggregation chosen so the hot query is a point lookup instead of a `COUNT` over a log table. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `purge_rate_limits` and `purge_expired_refresh` — the archiving story for this service. Ask whether they are batched, and what would happen at a thousand times the volume. |
| [`reference/demos/04-page-and-row-width.sql`](../../../reference/demos/04-page-and-row-width.sql) | Twenty thousand rows, two widths. The bytes-per-row argument is what decides when a table becomes "big" in the first place. |

---

## 3 · Do it

### a) Prove the indexing point before anything else

```sql
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 300000)
INSERT INTO orders (customer_id, status, placed_at, total_cents)
SELECT (i % 500) + 1, 'draft', '2026-0' || ((i % 9) + 1) || '-01T00:00:00Z', i FROM n;

EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE customer_id = 7 AND placed_at >= '2026-03-01';
```

The composite index already handles this. Before you would ever partition this table,
you have to be able to say what query is *still* slow with the right index on it.

### b) Compare one big delete with batched deletes

```sql
-- The version that takes one enormous lock and one enormous log burst:
DELETE FROM orders WHERE placed_at < '2026-05-01';
```

Roll that back, then do the same work in bounded chunks, each in its own transaction:

```sql
DELETE FROM orders WHERE id IN (
  SELECT id FROM orders WHERE placed_at < '2026-05-01' ORDER BY id LIMIT 5000
);
```

Run it in a loop until it affects zero rows. The total work is similar; the *impact* on
everyone else is not, and the batched version can be stopped at any point without
losing what it has done.

### c) Watch a partial index behave like an archive

```sql
EXPLAIN QUERY PLAN SELECT id FROM outbox WHERE published_at IS NULL ORDER BY created_at;
```

Insert a large number of *published* outbox rows, then run it again. The plan and the
cost do not change, because the published rows are not in `ix_outbox_pending` at all.
That is a lot of the benefit of archiving, for the cost of one `WHERE` clause.

### d) Build a pre-aggregate and then make it wrong

```sql
CREATE TABLE monthly_sales AS
SELECT substr(placed_at, 1, 7) AS ym, COUNT(*) AS orders_, SUM(total_cents) AS cents
FROM orders GROUP BY ym;
```

Now insert a new order and re-read `monthly_sales`. It is stale, silently, and nothing
in the schema records that. Add a `computed_at` column, populate it, and write down —
in numbers — how stale this table is allowed to be and what will refresh it. If you
cannot answer both, you have just demonstrated the rule.

### e) The exercise

Take `orders` and write a one-page archiving proposal: which rows leave, where they go,
how the job is batched and bounded, how it is made resumable and idempotent, and what
query proves afterwards that nothing was lost. Then state the one thing that would make
you propose partitioning instead — and the one thing that would make you propose
sharding, knowing what it costs permanently.

---

## 4 · Golden rules

- Most big-table problems are indexing problems. Check that first.
- Partitioning is for manageability — loading, archiving, dropping by age — more than for speed.
- Partition elimination only happens when the predicate is on the raw partition key.
- A query that does not filter on the partition key is slower when partitioned.
- The partition key must be in the primary key, because uniqueness cannot be enforced across partitions cheaply.
- Detaching a partition is a metadata operation; deleting the same rows is hours of logged work.
- Batched, ordered, bounded deletes are the archiving strategy for everyone who is not partitioned.
- Sharding costs cross-shard transactions, joins and foreign keys, permanently.
- Index, archive, replicate, partition, bigger machine, and only then shard.
- Caching trades freshness for speed. Decide the tolerated staleness first, in numbers.
- If you cannot name the invalidation mechanism, you have not designed a cache.
- A plain view is a name for a query and does nothing for performance.
- PostgreSQL materialised views are refreshed manually; SQL Server indexed views are maintained synchronously on every write.
- Refresh incrementally by slice. A full refresh stops scaling.
- Store and display `computed_at`. Stale becomes a property, not a bug report.
- Expiring a popular key can stampede the database. Use a lock, serve-stale, or jittered TTLs.

---

## 5 · Interview questions

**“This table has two hundred million rows and queries are slow. Would you partition
it?”**
Probably not first. Most big-table problems are indexing problems, so I would start
with the actual plans: is there a composite index serving the real predicates, is it
covering, are the predicates sargable. Partitioning is a large, permanent commitment
whose main benefit is manageability — loading and archiving by slice — not query speed,
and a query that does not filter on the partition key gets *slower* partitioned. I
would want to name the specific query that is still slow with correct indexing before
proposing it.

**“What does partitioning actually buy you?”**
Manageability. Dropping or detaching a month of data becomes a metadata operation
instead of hours of logged deletes; loading can target one partition; maintenance can
run per partition. Query speed only improves through partition elimination, which
requires the predicate to be on the raw partition key — wrap it in a function and you
lose it. The partition key also has to be in the primary key, because uniqueness cannot
be enforced across partitions cheaply.

**“How would you delete fifty million old rows from a live table?”**
In batches, ordered by the key, each batch in its own transaction, with a bound on
runtime and a sleep between batches. A single statement takes one huge lock, escalates
to a table lock, produces one enormous log burst, blocks everyone else, and rolls all of
it back if it fails near the end. Batched deletes are resumable, stoppable, and leave
the table usable throughout.

**“When is a materialised view the right answer?”**
When the same expensive aggregate is read far more often than the underlying data
changes, *and* you can state the tolerated staleness as a number and name what will
refresh it. In PostgreSQL the refresh is manual, so staleness is yours to manage — and
should be incremental by slice, since a full refresh stops scaling. SQL Server's
indexed views are maintained synchronously, which moves the whole cost onto every write
to the base tables; that is sometimes right and should be a decision, not a surprise.

**“A dashboard tile is slow. What are your options in order?”**
Index it properly first. Then reduce what it asks for — narrower grain, a shorter
window. Then pre-aggregate: a summary table refreshed incrementally, with a
`computed_at` shown on the tile so staleness is visible. Caching in application memory
is last, because it multiplies by the number of instances and has the hardest
invalidation story. At every step, the tolerated staleness is a number somebody has
agreed to.
