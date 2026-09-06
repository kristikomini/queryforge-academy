# The reference database

An **order-fulfilment schema, written to be read**. Every non-obvious decision is
commented in the file where it was made, not in a document nobody opens.

This is the thing you point at when an interviewer says *"you have no commercial
experience"*. Not because it is equivalent — it is not — but because every
decision in it can be questioned, and being able to answer is what the experience
requirement is a proxy for.

```
reference/
  schema/01-schema.sql   the schema, heavily commented
  schema/02-seed.sql     deterministic seed data — no random(), ever
  labs/*.sql             graded exercises, deliberately RED until you fix them
  demos/*.sql            runnable demonstrations of invisible behaviour
  forge.db               built by the command below; not committed
```

## Three minutes from clone to running

```bash
sqlite3 reference/forge.db < reference/schema/01-schema.sql
sqlite3 reference/forge.db < reference/schema/02-seed.sql
sqlite3 reference/forge.db "SELECT status, COUNT(*) FROM orders GROUP BY status;"
```

Or open [the playground](../site/playground.html) — the same schema and seed,
running in a real SQLite engine compiled to WebAssembly, in your browser, with no
install at all.

For the parts SQLite cannot demonstrate — isolation levels, locking, deadlocks,
real execution plans — use PostgreSQL:

```bash
docker run --rm -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:17
```

The schema is written in portable SQL; the three places a production engine would
spell something differently are marked inline with a comment saying so.

## What is in it, and why each piece is there

| Table | Demonstrates | Chapter |
| --- | --- | --- |
| `regions`, `cities` | 3NF: `city → region` is a transitive dependency on the customer key | [05](../site/chapters/05-normalisation.html) |
| `customers` | Surrogate key **plus** unique constraints on the natural keys; soft delete | [02](../site/chapters/02-relational-model.html), [04](../site/chapters/04-ddl-and-constraints.html) |
| `products` | Money as **integer minor units**, with the unit in the column name | [03](../site/chapters/03-data-types.html) |
| `stock` | `CHECK (on_hand >= 0)` — the invariant that makes overselling impossible | [24](../site/chapters/24-concurrency-patterns.html) |
| `orders` | A **state machine** enforced by `CHECK`, and a `version` column for optimistic concurrency | [04](../site/chapters/04-ddl-and-constraints.html), [24](../site/chapters/24-concurrency-patterns.html) |
| `order_lines` | `unit_price_cents`: a point-in-time capture, not a normalisation violation | [05](../site/chapters/05-normalisation.html) |
| `payments` | `external_ref UNIQUE` — the idempotency key that makes a redelivered webhook a no-op | [20](../site/chapters/20-upsert-and-idempotency.html) |
| `order_events` | Domain events written **inside** the transaction that caused them | [24](../site/chapters/24-concurrency-patterns.html) |
| `outbox` | The transactional outbox, with a **partial index** on exactly the worker's predicate | [24](../site/chapters/24-concurrency-patterns.html), [26](../site/chapters/26-index-design.html) |
| `employees` | A self-referencing hierarchy, for recursive CTEs | [12](../site/chapters/12-ctes-and-recursion.html) |
| `dim_date` | The calendar table with working days and Italian public holidays | [17](../site/chapters/17-strings-dates-timezones.html), [39](../site/chapters/39-oltp-vs-olap.html) |

### The state machine

```
draft ──▶ submitted ──▶ confirmed ──▶ shipped ──▶ delivered
  │           │             │
  └───────────┴─────────────┴──▶ cancelled
```

Note what is **not** there: `shipped → cancelled`. Once it is on a lorry, "cancel"
is a returns process with different accounting, not a status change. Encoding that
refusal is the difference between a state machine and a status column, and it is
the first thing worth talking about if somebody asks you about this schema.

## Labs

Graded exercises. They are **deliberately red**: each one has an assertion that
fails until you make it pass. CI runs them and asserts that they still fail, because
somebody committing the answers over the exercises is a real failure mode.

| Lab | Ask |
| --- | --- |
| `labs/01-find-the-fanout.sql` | The invoice total is wrong. Find out by how much, and why. |
| `labs/02-make-it-sargable.sql` | Three predicates that cannot seek. Rewrite them. |
| `labs/03-top-n-per-group.sql` | The most recent order per customer, deterministically. |
| `labs/04-gaps-and-islands.sql` | Runs of consecutive days with at least one order. |
| `labs/05-idempotent-load.sql` | Make the staging load safe to run twice. |
| `labs/06-claim-a-queue-row.sql` | Claim one outbox row atomically, with no double processing. |
| `labs/schema-invariants.sql` | Assert the rules a schema should hold: every FK indexed, no float money, every table keyed. |

Worked answers, with the reasoning, are in [SOLUTIONS.md](../course/SOLUTIONS.md).

```bash
sqlite3 reference/forge.db < reference/labs/01-find-the-fanout.sql
```

## Demos

Runnable demonstrations of behaviour that is otherwise invisible.

| Demo | Shows |
| --- | --- |
| `demos/01-float-money.sql` | Why `0.1 + 0.2 <> 0.3`, and what `DECIMAL` does instead |
| `demos/02-null-logic.sql` | `NOT IN` returning the empty set because of one null |
| `demos/03-index-effect.sql` | The same query, scan then seek, with the plans side by side |
| `demos/04-page-and-row-width.sql` | Why narrow rows are fast rows |

## What this repository is honest about

- **The seed data is synthetic.** It is deterministic arithmetic, not a real
  business. Distributions are plausible and not real; do not draw conclusions
  from them.
- **SQLite is the default because it needs no install**, and it genuinely cannot
  demonstrate everything. Chapters 22 and 23 need a server engine and say so.
- **The schema is small on purpose.** 1 800 orders is enough to see a missing
  index in a plan and small enough to load in a browser in under a second. It is
  not enough to demonstrate partitioning, and the partitioning chapter does not
  pretend it is.
- **`orders.total_cents` is a deliberate, named denormalisation** — a cached
  aggregate of `order_lines`, maintained at load time and by the application on
  every line change. A denormalised column with no stated mechanism is a bug that
  has not happened yet, so the mechanism is stated, in the file, at the point of
  the `UPDATE`.
