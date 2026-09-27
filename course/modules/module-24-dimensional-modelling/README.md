# Module 24 · Dimensional modelling for reporting

> Site chapters: [39](../../../site/chapters/39-oltp-vs-olap.html) ·
> [46](../../../site/chapters/46-italian-market.html)

---

## 1 · The idea

The last module is the one most likely to be the actual job. Italian SQL roles are
heavily concentrated in software houses selling business systems and in manufacturing
companies running them — and in both, the commonest ticket is **"this report is
wrong"**, not "write a new feature". Reporting is where a database developer spends
their time, and dimensional modelling is the discipline that makes reporting tractable.

Start from why you cannot just report off the transactional schema:

> **OLTP optimises latency and concurrency; OLAP optimises throughput per scan. One
> design cannot do both.**

A normalised schema is built to make a single order correct under concurrent writes,
with the fact stored exactly once. An analytical query wants to scan millions of rows
across a dozen joins and aggregate them. Those are opposite requirements, and the
warehouse is denormalised not because the rules stopped applying but because the
workload is different: it is bulk-loaded by one process, so the update anomalies
normalisation exists to prevent largely cannot arise.

Then the single most important sentence in the module, and the one that separates people
who have built a warehouse from people who have read about star schemas:

> **Decide the grain first and write it down. Everything else follows from it.**

The grain is what one row of the fact table *means*. "One row per order line." "One row
per shipment per day." Get it stated and every other question answers itself: which
dimensions can attach (only those that are constant at that grain), which measures are
additive, whether a given question is even answerable. Get it vague and you will build a
table that cannot answer anything without a caveat.

**Facts are measurements; dimensions are the context you slice by.** Facts are numeric
and mostly additive; dimensions are the descriptive attributes — customer, product,
date, region — that appear in `GROUP BY` and `WHERE`.

Two measure rules that cause real, embarrassing errors:

> **Never store a ratio as a measure. Store the numerator and the denominator.**

Because ratios do not sum. Average the daily margin percentages and you get a number
that is not the margin percentage for the period — it is an average of averages, weighted
wrongly. Store the two components, sum each, divide at the end. And **semi-additive
measures** — stock levels, account balances — can be summed across every dimension
*except* time, where summing them is meaningless and averaging or taking the closing
value is what is meant.

Then history, which is what most "the report changed" tickets are really about. A
customer moves from Marche to Lombardia. **Type 1** overwrites the region and all
history silently moves with them — last year's regional report now reports differently
than it did last year. **Type 2** adds a new versioned dimension row with validity dates,
so last year's orders still point at the old version and last year's report stays
reproducible. Type 2 is the default when history matters, and this is why:

> **Surrogate dimension keys are what let a fact point at a *version* of a dimension
> row.**

If the fact stored the natural key — the customer code — it would always resolve to the
current version and type 2 would be impossible. The surrogate key is not bureaucracy;
it is the mechanism.

Finally the two facts that decide whether your reports agree with each other and whether
the BI tool performs. **A conformed dimension is what makes two reports agree** — one
shared `dim_customer`, one shared `dim_date`, so "customers in March" means the same
thing in both. And, concretely for the Italian market: **Power BI's engine wants a star
schema and Import mode.** A view over the OLTP schema will be slow whatever the DAX,
because the engine is columnar and expects denormalised dimensions; DirectQuery aims
your visuals directly at production. Give analysts a star schema and views, not tables.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `dim_date` is a real conformed dimension: `year`, `month`, `quarter`, `iso_week`, `day_of_week`, `is_weekend`, `is_holiday`, `holiday_name`. Note it is the one table in a transactional schema that is modelled dimensionally, and the comment says why. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `order_lines` is the natural fact grain for this domain — one row per product per order, enforced by `uq_lines_product`. Say out loud what one row means; that sentence is the grain. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `unit_price_cents` with the comment "NOT a normalisation violation… this is the price this customer was actually charged on that day". That is a **type 2 idea inside an OLTP schema**: the captured value is a different fact from the current value. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `regions` → `cities` → `customers` is a normalised snowflake. A warehouse would flatten all three into one `dim_customer`. Write down what that buys and what it costs. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | Every monetary column is integer minor units — `total_cents`, `unit_price_cents`, `amount_cents`. Additive measures that cannot drift, which matters far more once they are summed over millions of rows. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `v_orders_geo` and `v_order_totals` — the views you would hand an analyst instead of table access, so every report starts from the same definitions. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `profiles` carries `chapters_passed` and `mastery_percent`. One is additive and one is a **ratio** — decide which of those you could legitimately sum across learners, and what the other one needs instead. |

---

## 3 · Do it

### a) State the grain, then build the fact table

Write the sentence first — "one row per order line per day of placement" — then build it:

```sql
CREATE TABLE fact_sales AS
SELECT
  l.order_id, l.line_no,                              -- degenerate dimension: the document number
  date(o.placed_at)            AS date_key,           -- → dim_date.d
  o.customer_id                AS customer_key,
  l.product_id                 AS product_key,
  l.quantity                   AS quantity,           -- additive
  l.quantity * l.unit_price_cents AS revenue_cents    -- additive
FROM order_lines l
JOIN orders o ON o.id = l.order_id;
```

Now test the grain claim: `SELECT COUNT(*), COUNT(DISTINCT order_id || '-' || line_no)
FROM fact_sales;`. If those differ, your stated grain is not the actual grain, and every
aggregate over the table is suspect.

### b) Prove a ratio does not sum

```sql
-- Daily margin percentage, then "the month's margin" two ways.
WITH daily AS (
  SELECT date_key,
         SUM(revenue_cents) AS rev,
         SUM(quantity * 40) AS cost,      -- pretend cost
         (SUM(revenue_cents) - SUM(quantity*40)) * 100.0 / SUM(revenue_cents) AS margin_pct
  FROM fact_sales GROUP BY date_key
)
SELECT AVG(margin_pct)                                         AS wrong_average_of_averages,
       (SUM(rev) - SUM(cost)) * 100.0 / SUM(rev)               AS right_from_components
FROM daily;
```

The two numbers differ, and the first is the one that ends up in a board pack. Store the
numerator and denominator; divide last.

### c) Break a report with a type 1 update

```sql
SELECT r.name AS region, SUM(o.total_cents)/100.0 AS eur
FROM orders o JOIN customers c ON c.id = o.customer_id
JOIN cities ci ON ci.id = c.city_id JOIN regions r ON r.id = ci.region_id
GROUP BY r.name;
```

Note the numbers. Now move one customer to a different region — a type 1 overwrite —
and re-run it:

```sql
UPDATE customers SET city_id = (SELECT id FROM cities WHERE region_id <> (
  SELECT region_id FROM cities WHERE id = customers.city_id) LIMIT 1) WHERE id = 1;
```

Last year's regional totals just changed. Nothing was wrong before and nothing is wrong
now, and that is the problem: the report is not reproducible. Then design the type 2
version — `dim_customer` with `customer_key` surrogate, `valid_from`, `valid_to`,
`is_current` — and say which key `fact_sales` must store for last year's report to stay
correct. Restore the data afterwards with `sqlite3 reference/forge.db < reference/schema/01-schema.sql`.

### d) Handle a semi-additive measure

Build a daily stock snapshot from `stock` and then try to answer "stock in March". Summing
the daily values gives a meaningless number. Decide between the closing balance and the
average, and say which one the question meant — this is the conversation to have with the
stakeholder rather than a technical choice.

### e) The exercise

Design the star schema for this domain on one page: the fact table with its grain written
at the top, `dim_date` (you already have it), `dim_customer` flattening region and city as
type 2, `dim_product` as type 1 with a stated reason, and the measures with each one
labelled additive, semi-additive or non-additive. Then write the two sentences you would
say to an analyst asking why they get views rather than tables, and the two you would say
to a manager asking why Power BI is slow against the production database.

---

## 4 · Golden rules

- OLTP optimises latency and concurrency; OLAP optimises throughput per scan. One design cannot do both.
- A warehouse is denormalised because it is bulk-loaded by one process, so update anomalies largely cannot arise.
- Decide the grain first and write it down. Everything else follows from it.
- Facts are measurements; dimensions are the context you slice by.
- Never store a ratio as a measure. Store the numerator and denominator.
- Semi-additive measures — stock levels, balances — cannot be summed over time.
- Type 1 overwrites, type 2 adds a versioned row. Type 2 is the default when history matters.
- Surrogate dimension keys are what let a fact point at a version of a dimension row.
- A conformed dimension is what makes two reports agree.
- Power BI's engine wants a star schema. A view over the OLTP schema will be slow whatever the DAX.
- Give analysts views and a star schema, not tables — so every report agrees.
- The commonest ticket is “this report is wrong”, not “write a new feature”.
- Analytics schemas are denormalised on purpose because their workload is different, not because the rules stopped applying.
- Build a calendar table. Working days and holidays are data, not arithmetic.

---

## 5 · Interview questions

**“What is a star schema and why use one?”**
A central fact table holding measurements at a declared grain, surrounded by dimension
tables holding the descriptive context you slice by, joined by surrogate keys. It exists
because analytical and transactional workloads want opposite things: a normalised schema
minimises redundancy for safe concurrent writes, while an analytical query wants wide
scans with few joins. The warehouse can be denormalised safely because it is bulk-loaded
by one process, so the anomalies normalisation prevents largely cannot occur.

**“What is the grain, and why does it come first?”**
The grain is what one row of the fact table means — "one row per order line", "one row per
account per day". It comes first because everything else is derived from it: which
dimensions can attach, which measures are additive, and which questions the table can
answer at all. A fact table with an unstated grain is one where nobody can say whether a
given `SUM` is double-counting.

**“A customer changes region. What happens to last year's report?”**
That depends on the dimension's slowly-changing type, and it is a design decision rather
than an accident. Type 1 overwrites the attribute, so all history follows the customer and
last year's regional totals change retrospectively. Type 2 inserts a new versioned
dimension row with validity dates, and the old facts keep pointing at the old version, so
last year's report stays reproducible. Type 2 is the default whenever history matters —
and it is only possible because the fact stores a surrogate key rather than the customer's
natural key.

**“Why can't you store a percentage in a fact table?”**
Because it does not aggregate. Summing percentages is meaningless and averaging them
produces an average of averages, weighted by nothing sensible, which is wrong whenever the
denominators differ. Store the numerator and denominator as separate additive measures and
compute the ratio at the point of presentation, after aggregation.

**“The Power BI report is slow against the production database. What do you tell them?”**
That the engine is columnar and expects a star schema in Import mode — denormalised
dimensions, a fact table at a declared grain, a real date dimension — and that pointing it
at a normalised OLTP schema through DirectQuery makes every visual a live query against
production, which is both slow and a risk to the transactional workload. The fix is a
star schema it can import, exposed through views so every report shares one set of
definitions, not more DAX.
