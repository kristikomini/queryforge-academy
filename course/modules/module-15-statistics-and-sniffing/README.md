# Module 15 · Statistics, cardinality and parameter sniffing

> Site chapters: [28](../../../site/chapters/28-statistics-and-sniffing.html)

---

## 1 · The idea

Module 01 established the diagnostic rule: find the biggest gap between estimated
and actual rows, because everything downstream of a bad estimate is a consequence
rather than a fault. This module is about *where the estimate comes from*, which is
what lets you fix the cause instead of the symptom.

The optimiser chooses a plan by estimating how many rows each step will produce.
Those estimates come from **statistics**: histograms of value distribution and
counts of distinct values, sampled from the table and stored. Statistics are the
only thing standing between "the optimiser knows what your data looks like" and "the
optimiser is guessing".

The failure mode is specific, and stating it this way is what makes it memorable:

> **Stale statistics do not make the engine slow. They make it confidently wrong.**

It does not hesitate or fall back to something safe. It builds a plan that would be
optimal for the data it *believes* it has — a nested loops join because it expects
forty rows — and then executes it against four million. The plan is not suboptimal;
it is built on a false premise.

On SQL Server the auto-update threshold is the classic trap: the old rule was 20% of
rows plus 500, which on a large table means statistics go stale for an extremely long
time before anything refreshes them. Newer versions scale better, and a nightly load
of a few million rows into a billion-row table still will not trip it.

**Parameter sniffing** is the other half, and it is the one candidates fumble. A
procedure is compiled once, using the *first* parameter values it happens to see, and
that plan is cached and reused for every subsequent call. If the parameters imply
wildly different row counts — a customer with three orders and a customer with three
hundred thousand — one of those callers gets a plan designed for the other.

The diagnostic sentence is worth having word-perfect, because it separates the two
causes in one line:

> **"Fast for one customer, slow for another" means sniffing. "Slow since the nightly
> load" means statistics.**

The fixes are different and choosing between them is the skill. `RECOMPILE` when the
query is genuinely variable and expensive enough to justify compiling every time.
`OPTIMIZE FOR` when one parameter shape dominates and you want that plan pinned.
Splitting the procedure in two when there are honestly two workloads wearing one
name. The local-variable trick — assigning the parameter to a variable so the
optimiser falls back to an average-density guess — works, is invisible to the next
reader, and should therefore be accompanied by a hint or a comment saying it is
deliberate.

Two more estimation facts that cause real regressions. The optimiser assumes columns
are **independent**, so correlated predicates — city and postcode, status and
shipped date — are multiplied together and badly underestimated. And table variables
and multi-statement table-valued functions estimate a **fixed guess** regardless of
content, where a temp table gets real statistics; that difference alone explains a
great many "it got slow when we refactored it into a function" reports.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | Every statement is a **named, parameterised** statement. That is what makes plan reuse possible at all — and therefore what makes sniffing a thing that could happen here. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `leaderboard` has a fixed shape and no user-supplied predicate, so it has exactly one plan and no sniffing exposure. Say why that is a property of the query and not luck. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `rate_count` is parameterised by `(ip, minute)`. Consider what its row-count estimate looks like for a busy IP versus an idle one, and whether that matters at this table's size. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_orders_status ON orders (status, placed_at)` — `status` has few distinct values and a very skewed distribution. That skew is exactly what a histogram exists to record, and exactly what an average-density guess gets wrong. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `customers.city_id` and `cities.region_id` are correlated by construction — a city implies its region. Predicates on both are the textbook correlated-predicate underestimate. |
| [`reference/demos/03-index-effect.sql`](../../../reference/demos/03-index-effect.sql) | The five plans from module 01. Re-read them now asking "what estimate would make each of these the cheapest option?" |

---

## 3 · Do it

SQLite has a much simpler optimiser than the server engines, so this module needs a
real one for its measurements. That is itself the lesson — this is why the course
tells you to pin the engine you are interviewing for.

```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

### a) Make the optimiser confidently wrong

Create a table, load it, gather statistics, and then change the data *without*
re-gathering:

```sql
CREATE TABLE t (id int primary key, grp int, pad text);
INSERT INTO t SELECT g, g % 5, repeat('x', 100) FROM generate_series(1, 1000) g;
ANALYZE t;
EXPLAIN (ANALYZE) SELECT * FROM t WHERE grp = 1;      -- estimate ≈ actual

INSERT INTO t SELECT g, 1, repeat('x',100) FROM generate_series(1001, 500000) g;
EXPLAIN (ANALYZE) SELECT * FROM t WHERE grp = 1;      -- estimate is now a fiction
ANALYZE t;
EXPLAIN (ANALYZE) SELECT * FROM t WHERE grp = 1;      -- and now it is not
```

Read the estimated-versus-actual numbers at each step. The middle plan is what a
stale-statistics incident looks like from the inside.

### b) Reproduce parameter sniffing

```sql
PREPARE p(int) AS SELECT * FROM t WHERE grp = $1;
EXPLAIN (ANALYZE) EXECUTE p(1);     -- the dominant value: half a million rows
EXPLAIN (ANALYZE) EXECUTE p(3);     -- a rare value: a couple of hundred
```

Run the rare value first in a fresh session, then the common one, and compare with
running them in the other order. The plan that gets cached is the plan the *first*
caller deserved.

### c) Find the correlated-predicate underestimate

```sql
EXPLAIN (ANALYZE) SELECT * FROM t WHERE grp = 1 AND id < 2000;
```

The optimiser multiplies the two selectivities as though they were independent.
Compare its estimate with the actual. Then create extended statistics —
`CREATE STATISTICS s (dependencies) ON grp, id FROM t; ANALYZE t;` — and look again.

### d) The exercise

Take `leaderboard` from [`api/sql/queries.sql`](../../../api/sql/queries.sql) and write
down, for each step, what the optimiser must estimate in order to choose its plan.
Then say which of those estimates you would expect to be wrong first as the table
grows, and what you would measure to confirm it. This is the exercise that turns plan
reading into plan *prediction*, which is the version of the skill interviews test.

---

## 4 · Golden rules

- The optimiser chooses by estimating rows. Statistics are the estimate.
- Stale statistics do not make it slow — they make it confidently wrong.
- SQL Server's classic auto-update threshold is 20% of rows plus 500, which is far too late on a large table.
- Parameter sniffing caches a plan built for the first values seen and reuses it for all.
- “Fast for one customer, slow for another” means sniffing. “Slow since the nightly load” means statistics.
- `RECOMPILE` for variable expensive queries; `OPTIMIZE FOR` when one shape dominates; splitting the procedure when there are genuinely two workloads.
- The local-variable trick works and is invisible. Use a hint so the next reader knows it is deliberate.
- The optimiser assumes columns are independent, so correlated predicates are underestimated.
- Table variables and multi-statement TVFs estimate a fixed guess. Temp tables have real statistics.
- Sort the plan cache by total time, never average.

---

## 5 · Interview questions

**“What are statistics and why do they matter?”**
Sampled summaries of a column's data distribution — a histogram plus distinct-value
counts — that the optimiser uses to estimate how many rows each step of a plan will
produce. Every structural decision follows from those estimates: join order, join
algorithm, seek versus scan, memory grant. Statistics are therefore the input that
decides the plan, which is why a wrong estimate is a wrong plan rather than a slightly
slower one.

**“A query was fast for months and is suddenly slow. The code did not change.”**
Two main candidates, and one question separates them. If it is slow for everyone since
a particular load or a particular time, suspect statistics: the data distribution
moved and the cached plan is built on the old shape. If it is fast for some inputs and
slow for others, suspect parameter sniffing: the cached plan was compiled for one
parameter value and is being reused for a very different one. Confirm with an actual
plan and the estimated-versus-actual row counts.

**“What is parameter sniffing, and is it bad?”**
The optimiser compiles a parameterised statement using the actual parameter values of
the first execution, then caches and reuses that plan. It is usually *good* — a plan
tailored to real values beats a generic one — and becomes a problem only when the
parameter values imply very different row counts, so one caller's plan is wrong for
another's data. The fix depends on which: `RECOMPILE` for genuinely variable
expensive queries, `OPTIMIZE FOR` when one shape dominates, or splitting the
procedure when there are two real workloads.

**“Why is a table variable sometimes much slower than a temp table?”**
Because it has no statistics: the optimiser estimates a fixed row count regardless of
what is in it, so a table variable holding a million rows may be planned as though it
held one. A temp table is a real table with real statistics, so joins against it are
costed properly. The same applies to multi-statement table-valued functions, where an
inline one is fine.

**“How do you find the queries worth tuning?”**
Sort the plan cache or query store by **total** elapsed time, not average. A query
taking twenty milliseconds called a million times an hour costs far more than one
taking four seconds twice a day, and averages hide exactly that. Then diff two
snapshots rather than reading cumulative counters, because those describe the whole
uptime rather than now.
