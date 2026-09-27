# Module 07 · Predicates, dates and the half-open range

> Site chapters: [07](../../../site/chapters/07-predicates-and-sargability.html) ·
> [17](../../../site/chapters/17-strings-dates-timezones.html)

---

## 1 · The idea

An index is a sorted structure. It can answer "where does this value sit" in three
or four page reads *only* if it can compare your value against the values it
stored. The moment you wrap the indexed column in something, the engine no longer
has anything to compare:

```sql
WHERE YEAR(placed_at) = 2026        -- cannot seek: the index holds placed_at,
                                    -- not YEAR(placed_at)
WHERE placed_at >= '2026-01-01'
  AND placed_at <  '2027-01-01'     -- seeks: a range over the stored value
```

Both return the same rows. One is a scan of the whole table and the other is a
range seek, and nothing in the first version *looks* wrong. That is the danger:
non-sargability is a silent performance bug with a correct answer attached.

The word is ugly and worth knowing anyway — **s**earch **arg**ument **able**. The
test is mechanical: *is the indexed column sitting alone, untouched, on one side of
the comparison?* If not, rewrite until it is. Move arithmetic to the constant side.
Turn a function call into a range. Replace `LIKE '%x%'` with something an ordered
structure can actually do.

Dates are where this bites hardest, because dates are where people reach for
functions instinctively — and because dates carry a second, independent trap:

> **`BETWEEN` on a timestamp loses the last day.**

`BETWEEN '2026-01-01' AND '2026-01-31'` is inclusive at both ends, so it means
`<= '2026-01-31 00:00:00'` — and every order placed at 09:14 on the 31st is
missing. The bug is invisible in testing if your test data happens to have
midnight timestamps. The fix is the same half-open range that makes the predicate
sargable: `>= start AND < next_start`. One rewrite, two bugs closed, which is why
these two chapters belong in one module.

Then time zones, which are not a formatting problem but a modelling one. Store
instants in UTC or a zone-aware type. Store a zone *name* — `Europe/Rome` — and
never an offset, because `+01:00` is a snapshot of a rule that changes twice a
year and that governments amend. And accept the thing nobody wants to accept: for
one hour every autumn, local wall-clock time is genuinely ambiguous, and no column
type can recover which of the two instants was meant.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/labs/02-make-it-sargable.sql`](../../../reference/labs/02-make-it-sargable.sql) | Three predicates that cannot seek. Module 01 uses this lab to read the *plans*; here you are rewriting the *predicates*. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | Every timestamp is `TEXT` in ISO-8601 `…Z` form. That is a deliberate choice for SQLite: ISO-8601 sorts lexicographically, so a text range comparison *is* a chronological one. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `dim_date` — the calendar table. Working days and Italian holidays are stored as data, with `is_holiday` and `holiday_name`, because they are not derivable by arithmetic. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `ix_orders_cust_date` is `(customer_id, placed_at DESC)`: equality column first, then the range column. Reverse that order and "this customer's recent orders" stops being a single seek. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `rate_limits` is keyed by `(ip, minute)` where minute is `'YYYY-MM-DDTHH:MM'` text. Truncating the timestamp into the *key* instead of computing it in the predicate is the same idea from the other end. |

---

## 3 · Do it

### a) Watch a function throw the index away

```sql
EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE strftime('%Y', placed_at) = '2026';

EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE placed_at >= '2026-01-01' AND placed_at < '2027-01-01';
```

Same rows, two different plans. The first cannot use `ix_orders_cust_date` at all.

### b) Lose a day with BETWEEN, then get it back

```sql
INSERT INTO orders (customer_id, status, placed_at)
VALUES (1, 'draft', '2026-01-31T09:14:00Z');

SELECT COUNT(*) FROM orders
WHERE placed_at BETWEEN '2026-01-01' AND '2026-01-31';   -- misses it

SELECT COUNT(*) FROM orders
WHERE placed_at >= '2026-01-01' AND placed_at < '2026-02-01';   -- finds it
```

This is the bug that produces "the January report is short by a day's takings"
tickets, and it survives code review because `BETWEEN` reads like English.

### c) Use the calendar table instead of arithmetic

Count orders placed on Italian working days:

```sql
SELECT COUNT(*)
FROM orders o
JOIN dim_date d ON d.d = date(o.placed_at)
WHERE d.is_weekend = 0 AND d.is_holiday = 0;
```

Now try to write that without `dim_date`. You will need a weekday calculation and
a hard-coded holiday list including Easter Monday, which moves. That is the
argument for the table, and it is why every reporting system eventually grows one.

### d) The exercise

Solve [`reference/labs/02-make-it-sargable.sql`](../../../reference/labs/02-make-it-sargable.sql),
then read the note in [SOLUTIONS.md](../../SOLUTIONS.md) on why one of the three
rewrites is correct on this data and wrong in general. Afterwards, write one
predicate that is non-sargable and **cannot** be rewritten into a range — an infix
`LIKE '%…%'` is the obvious family — and say what you would do instead. "Index the
expression" and "this needs full-text, not a B-tree" are both real answers.

---

## 4 · Golden rules

- Sargable means the engine can seek. The indexed column must appear alone and untouched on one side of the comparison.
- Never wrap the column in a function. Rewrite as a half-open range: `>= start AND < next_start`.
- `BETWEEN` on a timestamp loses the last day. Half-open ranges do not.
- Move arithmetic to the constant side of the comparison.
- `LIKE 'x%'` seeks; `LIKE '%x%'` cannot. Infix search needs full-text or trigrams, not an index.
- Implicit conversion silently disables an index and returns the right answer, so nothing looks broken. Check the plan for a convert warning.
- `OR` across different columns often defeats indexing; `UNION` of two seeks lets the optimiser cost each half.
- If you cannot change the query, index the expression — an expression index or a persisted computed column.
- Store instants in UTC or a zone-aware type; convert at the edge.
- Store a zone name (`Europe/Rome`), never an offset. Offsets are snapshots of a rule that changes.
- Local time is ambiguous for one hour every autumn, permanently and unrecoverably.
- `DATEDIFF` counts boundaries crossed, not elapsed time.
- Build a calendar table. Working days and holidays are data, not arithmetic.

---

## 5 · Interview questions

**“What does sargable mean?”**
That the engine can use an index seek to satisfy the predicate, which requires the
indexed column to appear alone and untouched on one side of the comparison. Wrap it
in a function, apply arithmetic to it, or force an implicit conversion, and the
index becomes unusable — while the query still returns the right answer, which is
why it is so often missed.

**“Why should I not use `BETWEEN` for a date range?”**
Because it is inclusive at both ends and a date literal means midnight, so
`BETWEEN` the 1st and the 31st silently excludes everything that happened during
the 31st. A half-open range — `>= '2026-01-01' AND < '2026-02-01'` — is correct
whatever the time component is, needs no knowledge of how many days the month has,
and stays sargable.

**“How would you make `WHERE YEAR(order_date) = 2026` fast?”**
Rewrite it as a half-open range on the raw column so the existing index can seek.
If the query cannot be changed — it is generated, or buried in a report — then
index the expression instead: an expression index in PostgreSQL, or a `PERSISTED`
computed column with an index on it in SQL Server.

**“Why store a time zone name rather than an offset?”**
Because an offset is the *result* of applying a zone's rules at one instant, and
those rules change — daylight saving transitions, and legislated changes to the
transitions themselves. Storing `+01:00` records the answer and throws away the
question, so it becomes wrong for any date outside the moment it was captured.
`Europe/Rome` stays correct because the rules are looked up when needed.

**“A report is short by one day every month and nobody can find it.”**
Start with `BETWEEN` over a timestamp column. Then look for a predicate that
compares a `DATE` to a `DATETIME`, or a conversion that truncates. All three fail
the same way: they look inclusive, and they exclude part of a day.
