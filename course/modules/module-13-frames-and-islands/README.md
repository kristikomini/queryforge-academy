# Module 13 · Frames, gaps and islands

> Site chapters: [14](../../../site/chapters/14-frames-and-islands.html)

---

## 1 · The idea

A window function has a **frame**: the set of rows, within the partition, that it
actually looks at. Most people never write one explicitly, which is why most people
have a running total that is secretly a grand total, or vice versa.

The defaults are the trap, and they are worth learning as a pair:

```sql
SUM(x) OVER (PARTITION BY c)                  -- frame = the WHOLE partition: a total
SUM(x) OVER (PARTITION BY c ORDER BY d)       -- frame = start … current row: a running total
```

Adding `ORDER BY` to an `OVER` clause **silently changes the frame**. Nothing in the
syntax announces it. One clause, two completely different questions answered.

Then the second default, which is worse because it is wrong more subtly:

> **`RANGE` is the default, and `RANGE` is almost never what you meant.**

`ROWS BETWEEN … ` counts physical rows. `RANGE BETWEEN …` includes every *peer* — every
row with the same value in the `ORDER BY` column. So a running total ordered by day,
over data with several orders per day, jumps by the whole day at each step rather
than row by row. The numbers look plausible. They are answering a different question.
Write `ROWS` unless you specifically want peer semantics.

`RANGE` does have one place where it is the only right answer, and it is worth
knowing because it sounds like a trick and is not: `RANGE BETWEEN INTERVAL '7' DAY
PRECEDING AND CURRENT ROW` gives you a true seven-day window that is still correct
when some days have no rows at all. `ROWS` cannot express that — seven rows back is
not seven days back.

The second half of the module is **gaps and islands**, which is the most
transferable trick in the language. The problem: find runs of consecutive things —
consecutive days with orders, consecutive successful logins, the periods a machine
was running. The insight:

> **For consecutive integers, `value − ROW_NUMBER()` is constant within a run.**

Number the distinct days in order. Subtract the row number from the day. Inside a
run both increase in step, so the difference does not change; at a gap, the day
jumps and the row number does not, so the difference changes. Group by the
difference and each group is one island. That is it — three lines of SQL for a
problem that looks like it needs a cursor.

And the general form, for when the "consecutive" test is not arithmetic: flag the
rows where a new group starts, then take a running `SUM` of the flag as the group
id. Every sessionisation problem you will ever be handed is that pattern.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/labs/04-gaps-and-islands.sql`](../../../reference/labs/04-gaps-and-islands.sql) | Runs of consecutive calendar days with at least one order. The comments state the technique; the assertion checks that every ordered day falls in exactly one run and that no two runs are adjacent. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `dim_date` is what makes a *gap* expressible at all: to know a day is missing you need a table of all the days. `is_weekend` and `is_holiday` let you ask for runs of consecutive **working** days. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_events (order_id, from_status, to_status, at)` — a state-transition log, which is the natural input to "how long did each order spend in each status". That is a frame problem: `LEAD(at) OVER (PARTITION BY order_id ORDER BY at)`. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_events_order ON order_events (order_id, at)` — the partition-then-order index that makes the window above sort-free. |
| [`reference/labs/03-top-n-per-group.sql`](../../../reference/labs/03-top-n-per-group.sql) | The previous module's lab. `ROW_NUMBER` there is a ranking; here it is arithmetic. Same function, different use. |

---

## 3 · Do it

### a) Turn a running total into a grand total by accident

```sql
SELECT id, placed_at, total_cents,
       SUM(total_cents) OVER (PARTITION BY customer_id)                    AS grand,
       SUM(total_cents) OVER (PARTITION BY customer_id ORDER BY placed_at) AS running
FROM orders WHERE customer_id = 1 ORDER BY placed_at;
```

One clause different, two different columns. If you have ever shipped a "running
total" that was constant down the whole column, this is why.

### b) Catch RANGE misbehaving

```sql
SELECT date(placed_at) AS d, total_cents,
       SUM(total_cents) OVER (ORDER BY date(placed_at))                            AS range_default,
       SUM(total_cents) OVER (ORDER BY date(placed_at) ROWS UNBOUNDED PRECEDING)   AS rows_explicit
FROM orders ORDER BY d;
```

Where several orders share a day, the two columns differ: `RANGE` includes all of
that day's peers at once, `ROWS` advances one row at a time. Neither is broken —
but only one of them is what "running total" usually means.

### c) Make LAST_VALUE behave

```sql
SELECT id, placed_at,
       LAST_VALUE(total_cents) OVER (PARTITION BY customer_id ORDER BY placed_at) AS looks_wrong,
       LAST_VALUE(total_cents) OVER (PARTITION BY customer_id ORDER BY placed_at
         ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)                AS actually_last
FROM orders WHERE customer_id = 1 ORDER BY placed_at;
```

The first returns the current row every time, because the default frame ends at the
current row — so "the last value" *is* the current one. This is the single most
reported window-function "bug" and it is the frame default.

### d) Build islands by hand before using the trick

```sql
WITH days AS (SELECT DISTINCT date(placed_at) AS d FROM orders),
     n AS (SELECT d, ROW_NUMBER() OVER (ORDER BY d) AS rn FROM days)
SELECT d, rn, julianday(d) - rn AS grp FROM n ORDER BY d;
```

Read the `grp` column. It is constant inside each run and changes at every gap. Once
you have *seen* that column, the technique stops being something you memorise.

### e) Measure time in each status

```sql
SELECT order_id, from_status, to_status, at,
       LEAD(at) OVER (PARTITION BY order_id ORDER BY at) AS next_at
FROM order_events ORDER BY order_id, at;
```

Then compute the duration in each status, and say what the `NULL` in the last row of
each partition means — it is not missing data, it is "still in this status".

### f) The exercise

Solve [`reference/labs/04-gaps-and-islands.sql`](../../../reference/labs/04-gaps-and-islands.sql),
then extend it: runs of consecutive **working** days, joining `dim_date` so that a
weekend does not break a run. Compare your answer with
[SOLUTIONS.md](../../SOLUTIONS.md). The extension is where the pattern proves it
generalises — the "consecutive" test is no longer arithmetic on the date, so you need
the flag-and-running-sum form.

---

## 4 · Golden rules

- No `ORDER BY` in `OVER` means the frame is the whole partition — a total, not a running total.
- Adding `ORDER BY` silently changes the default frame to “start of partition → current row”.
- `ROWS` counts physical rows; `RANGE` includes all peers with the same ordering value.
- `RANGE` is the default and is usually not what you meant. Write `ROWS`.
- `RANGE` with an `INTERVAL` is the one place it wins: a true time window across missing days.
- `LAST_VALUE` needs an explicit frame to the end of the partition, or it returns the current row.
- Islands of consecutive integers: group by `value − ROW_NUMBER()`.
- The general form: flag where a new group starts, then take a running `SUM` of the flag as the group id.
- An index on `(partition cols, order cols)` removes the sort. A spilling sort is the usual cause of a slow window query.
- Build a calendar table. Working days and holidays are data, not arithmetic.

---

## 5 · Interview questions

**“Write a running total.”**
`SUM(x) OVER (ORDER BY d ROWS UNBOUNDED PRECEDING)`. Then volunteer the two things
that make it correct rather than lucky: without the `ORDER BY` the frame is the whole
partition and you get a grand total; and `ROWS` rather than the default `RANGE`,
because `RANGE` would include every peer sharing the same `d` value and advance a
whole group at a time.

**“What is the difference between `ROWS` and `RANGE`?”**
`ROWS` counts physical rows relative to the current one. `RANGE` works on *values*:
it includes every peer with the same value in the `ORDER BY` expression. `RANGE` is
the default, which is why running totals over data with duplicate sort keys are so
often subtly wrong. The one place `RANGE` is clearly right is with an `INTERVAL` —
a true "last seven days" window that stays correct when some days have no rows.

**“Why does `LAST_VALUE` return the current row?”**
Because the default frame with an `ORDER BY` ends at the current row, so the last
value *in the frame* is the current value. Give it an explicit frame to the end of
the partition — `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING` — or use
`FIRST_VALUE` with a descending order instead.

**“Find all runs of consecutive days on which something happened.”**
Take the distinct days, number them with `ROW_NUMBER` in date order, and subtract the
row number from the date. Inside a run both advance together so the difference is
constant; at a gap the date jumps and the row number does not, so the difference
changes. Group by that difference and each group is one island — `MIN` and `MAX` give
its start and end. For a "consecutive" rule that is not simple arithmetic, use the
general form: flag where a new group starts and take a running `SUM` of the flag as
the group id.

**“How would you calculate how long each order spent in each status?”**
`LEAD(changed_at) OVER (PARTITION BY order_id ORDER BY changed_at)` over the
transition log gives each row the time of the next transition, and the difference is
the duration. The null in the final row of each partition is meaningful — that status
has not ended — so decide deliberately whether to treat it as "until now" or exclude
it.
