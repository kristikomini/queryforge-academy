# Module 05 · The engine underneath

> Site chapters: [01](../../../site/chapters/01-engines-and-storage.html)

---

## 1 · The idea

Almost every performance rule in this course is a consequence of one fact, and the
fact is not about SQL at all:

> **The engine reads and writes fixed-size pages, never rows.**

You ask for one row. The engine reads the page that contains it — four, eight or
sixteen kilobytes — because that is the smallest unit the storage layer deals in.
Nothing you write can make it read less than a page.

Everything follows from that. Narrow rows are fast because more of them fit in
the page you were going to read anyway. `SELECT *` is expensive partly because
wide rows mean fewer rows per page. A covering index is fast because it is a
*narrower copy* of the data, so the same answer costs fewer pages. An index seek
costs three or four page reads because a B-tree is shallow. None of these are
separate tricks to memorise; they are the same fact seen from different angles.

The second fact is about writes, and it is the one people find surprising:

> **A commit waits for the log to reach disk. It does not wait for the data
> pages.**

Durability does not mean "your table is updated on disk". It means "the *intent*
is on disk, in a sequential file, so a crash can replay it". Data pages are
written later, lazily, in the background. This is why a commit is affordable at
all — a sequential append is orders of magnitude cheaper than scattering random
page writes — and it is why batching writes into one transaction is so dramatic
an improvement: one log flush instead of thousands.

The third is that there are two families of answer to "what do readers see while
a writer is working". Lock the row, or keep the old version of it. MVCC — the
second — is why PostgreSQL readers never block on writers, and the cost of it is
that somebody has to clean the old versions up afterwards. There is no version
without a cost; `VACUUM` is that cost arriving.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/demos/04-page-and-row-width.sql`](../../../reference/demos/04-page-and-row-width.sql) | Two tables, identical row counts, identical query, identical answer. Only the bytes per row differ. It reads `dbstat` so the difference is measured rather than asserted. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `products.list_price_cents` is an `INTEGER`. Money as integer minor units is exact *and* narrow — the correctness argument and the page argument point the same way. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `outbox.payload` is the large column in this schema. Note that the worker's query never selects it until it is about to publish: the claim query reads ids. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `PRAGMA journal_mode = WAL` — the comment says "readers do not block the writer", which is the one-line version of this whole section. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `profiles.document` is a whole JSON document in one column, and the four leaderboard figures are narrow copies beside it. That is the page argument driving a schema decision: the leaderboard sorts without touching the blob. |

---

## 3 · Do it

### a) Measure the page cost of a wide row

```bash
sqlite3 reference/forge.db < reference/demos/04-page-and-row-width.sql
```

The two tables hold the same number of rows and answer the same query. Read the
`bytes_on_disk` column. That ratio is the ratio of work the engine must do for
any query that scans either table — and no index can remove it, because the bytes
are the bytes.

### b) Prove the commit-per-write cost to yourself

```bash
sqlite3 /tmp/batch.db "CREATE TABLE t (i INTEGER);"
```

Insert ten thousand rows one statement at a time, then the same ten thousand
inside a single `BEGIN` … `COMMIT`. Time both:

```sql
BEGIN;
WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 10000)
INSERT INTO t SELECT i FROM n;
COMMIT;
```

The gap is log flushes, not row writes. Nothing about the rows changed.

### c) Watch a large column stay out of the way

```sql
EXPLAIN QUERY PLAN SELECT id FROM outbox WHERE published_at IS NULL;
EXPLAIN QUERY PLAN SELECT id, payload FROM outbox WHERE published_at IS NULL;
```

The first can be answered from `ix_outbox_pending` alone. The second must visit
the table for every row, because `payload` is not in the index. That is the
covering-index argument in its smallest possible form, and it is the reason the
outbox worker claims ids first and fetches payloads second.

### d) The exercise

Take any table in [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql)
and write down, for each column, how many bytes a row costs and whether any query
in [`api/sql/queries.sql`](../../../api/sql/queries.sql) or the reference labs
actually needs it. Then say which index you would add to make the commonest query
covering. You will be asked a version of this in an interview and the answer is
arithmetic, not opinion.

---

## 4 · Golden rules

- The engine reads pages, never rows. Everything about physical design follows from that.
- A commit waits for the log to reach disk, not the data pages. Sequential writes are why that is affordable.
- Narrow rows are fast rows: fewer bytes per row means more rows per page means fewer reads.
- Large columns are stored off-page. Selecting them costs an extra jump; not selecting them costs nothing.
- MVCC removes reader/writer blocking and adds a cleanup obligation. There is no version without a cost.
- Memory is roughly a thousand times faster than SSD and a hundred thousand times faster than spinning disk. Tuning means keeping the working set in memory.
- A thousand fast queries can be slower than one slow query, and no slow-query log will tell you.

---

## 5 · Interview questions

**“What actually happens when I run `COMMIT`?”**
The transaction's log records are flushed to the log file and the engine waits for
that write to be acknowledged. The modified data pages are still in memory, dirty,
and get written later by a background process. That is why durability is
affordable: one sequential append rather than many random page writes. It is also
why a crash needs recovery — the log is replayed to bring the data files forward.

**“Why is inserting ten thousand rows in one transaction so much faster than ten
thousand transactions?”**
Because the expensive part of a commit is waiting for the log write to reach
durable storage, and that happens once per transaction, not once per row. Ten
thousand transactions means ten thousand waits. The rows themselves cost the same
either way.

**“What does MVCC buy and what does it cost?”**
It buys readers that never block on writers and writers that never block on
readers, because a reader is served an older version rather than made to wait.
It costs storage for those versions and a cleanup obligation — `VACUUM` in
PostgreSQL, the version store in SQL Server's snapshot isolation. A long-running
transaction is expensive under MVCC specifically because it pins old versions and
prevents that cleanup.

**“Why does `SELECT *` hurt more than it looks like it should?”**
Two reasons, and the second matters more. It moves bytes you did not need across
every layer; and it usually stops an index covering the query, so instead of
reading a narrow index the engine must visit the table for every row. The width
of the row is the width of the work.
