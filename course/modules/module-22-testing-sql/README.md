# Module 22 · Testing SQL against a real engine

> Site chapters: [37](../../../site/chapters/37-testing-sql.html)

---

## 1 · The idea

Most people who say they cannot test SQL are trying to test the wrong thing. You are
not testing that `SUM` adds up or that the B-tree works. You are testing **the
decisions you made**: the constraints you declared, the report logic you wrote, the
procedure's error handling, the security predicate. Those are your code, they are
where your bugs are, and they are entirely testable.

The foundational rule is the one people most want to get around:

> **An in-memory fake is not a database. Test against the engine and version you
> deploy.**

A fake — or a different engine standing in for the real one — cheerfully passes tests
that fail in production, because the things that differ are exactly the things that
cause bugs: type coercion, null handling, collation and case sensitivity, uniqueness
over nulls, transaction and locking semantics, the empty string in Oracle. A test suite
that is green against a fake and red against the real engine has told you nothing
except that the fake works.

**Speed** is the reason people reach for fakes, and the solution is not a fake but the
right isolation strategy: **wrap each test in a transaction and roll it back**. It is
fast, it is perfectly isolated, and the database returns to a known state without
re-seeding. The one thing it cannot test is anything *about* transactions — you cannot
test commit behaviour, isolation levels or deadlock retry inside a transaction you are
going to roll back. Those tests need a real commit and a real cleanup, and there are
few of them.

**Fixtures** have two requirements, and both are about the failure message. They must be
**deterministic** — no `random()`, no `now()`, because a test that depends on the clock
fails at midnight or in another time zone and passes on a retry, which trains everyone
to re-run rather than investigate. And they must be **minimal and named for the
scenario**, because the fixture name is what appears when the test fails:
`customer_with_no_orders` tells you what broke; `test_data_3` does not.

Then the discipline that keeps the suite from becoming a liability:

> **Do not assert on execution plans. Assert on outcomes.**

Plans legitimately change with data volume, statistics and engine version. A test that
fails because the optimiser chose a hash join instead of nested loops is a test that
will be deleted within a month, and it will take the useful tests around it into
disrepute. If you care about performance, assert on a measurable outcome — logical
reads, a time bound on representative data — or measure it in a benchmark rather than a
unit test.

Two final practices that catch whole classes of defect cheaply.

**Run migrations twice in CI.** If the second run fails, they are not re-runnable — and
a migration that cannot be re-run cannot be recovered when it fails halfway.

**Assert schema invariants from the catalogue.** Every foreign key indexed, no floating
point money, every table keyed. These are queries against the system catalogue that run
in about a second and catch the class of mistake code review reliably misses, because
reviewing a migration diff does not show you that the new foreign key has no index.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/tests/harness.mjs`](../../../api/tests/harness.mjs) | Read the header comment in full. It states the fake argument exactly — an in-memory fake "cheerfully passes tests that fail against anything you would deploy" — and then the payoff: "the engine under test IS the engine in production, which is the only version of this claim that is honest." |
| [`api/tests/harness.mjs`](../../../api/tests/harness.mjs) | The clock is **frozen and injected**, because "a test that has to wait fifteen real minutes to prove a token expired is a test nobody runs". That is the determinism rule with its reasoning attached. |
| [`api/tests/harness.mjs`](../../../api/tests/harness.mjs) | A server per test, and the note on why the runner and the tests are separate files — a circular import with top-level await deadlocks rather than erroring. Test infrastructure has its own failure modes. |
| [`reference/labs/schema-invariants.sql`](../../../reference/labs/schema-invariants.sql) | The catalogue assertions, as runnable SQL: every table keyed, no float money, every foreign key indexed with that column *first*. The comments say CI runs this file and that it takes about a second. |
| [`api/tests/profile.test.mjs`](../../../api/tests/profile.test.mjs) | Test names as specifications: "a stale baseRevision gets a 409 CARRYING THE CURRENT DOCUMENT", "mastery cannot be inflated past 100 by a hand-edited profile", "the server formula matches the browser formula". Each names a decision, not a mechanism. |
| [`api/tests/profile.test.mjs`](../../../api/tests/profile.test.mjs) | "a MALFORMED progress document produces zeroes, not a 500" and "rounding is HALF-UP, matching JavaScript's Math.round" — edge cases and cross-implementation agreement, which is where the real bugs were. |
| [`api/tests/auth.test.mjs`](../../../api/tests/auth.test.mjs) | "the service refuses to start outside development without a signing key" — a security property asserted rather than documented. |
| [`api/tests/run.mjs`](../../../api/tests/run.mjs) | The runner. Zero dependencies, which is the same argument the rest of the repository makes. |

---

## 3 · Do it

### a) Run the suite and read the names, not the dots

```bash
node api/tests/run.mjs
```

Read the test names as a specification of the service. Then pick three and find the
decision each one is protecting — you should be able to point at the schema comment or
the handler that would break if the test were deleted. A test whose corresponding
decision you cannot find is either testing the engine or testing nothing.

### b) Run the schema invariants and then violate one

```bash
sqlite3 reference/forge.db < reference/labs/schema-invariants.sql
```

Every violation query should return no rows. Now add a table that breaks a rule on
purpose:

```sql
CREATE TABLE bad_idea (
  id INTEGER,                                   -- no primary key
  order_id INTEGER REFERENCES orders(id),       -- unindexed foreign key
  amount_total REAL                             -- float money
);
```

Re-run the invariants. Three violations, named, in about a second — and note that a code
reviewer looking at that `CREATE TABLE` in a diff would very plausibly have approved it.
That is the case for catalogue assertions. Drop the table afterwards.

### c) Make a test non-deterministic and watch it rot

Write a test that inserts an order with `placed_at` defaulted from the clock and then
asserts it falls within today. Now set your machine's clock to 23:59:58 and run it
repeatedly. This is the bug the frozen clock in
[`api/tests/harness.mjs`](../../../api/tests/harness.mjs) exists to prevent, and
experiencing a flake once is worth more than the rule stated ten times.

### d) Prove transaction rollback isolation

Write two tests that both insert a customer with the same email —
`uq_customers_email` means the second must fail if the first's data is still there.
With per-test rollback, both pass in either order. Then deliberately commit in the first
and watch the second fail depending on execution order. Order-dependent tests are
the thing rollback isolation buys you freedom from.

### e) Test the constraints, which is the part people skip

For each `CHECK` in [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql),
write the insert that should be rejected and assert that it is. Start with
`ck_stock_reservable CHECK (reserved <= on_hand)` and `ck_orders_shipped`. These are
your business rules; an untested constraint is a rule you believe holds.

### f) The exercise

Run the migration-twice check against this service. `api/sql/schema.sql` is applied on
first run when the table list is empty, so work out what "run it twice" means here,
whether it passes, and what would have to change for it to be a genuine re-runnability
test. Then write the PostgreSQL equivalent of two of the invariant queries from
[`reference/labs/schema-invariants.sql`](../../../reference/labs/schema-invariants.sql),
reading `pg_class`, `pg_index` and `pg_constraint` instead of `sqlite_master`.

---

## 4 · Golden rules

- Test the decisions you made — constraints, reports, procedures, security — not the engine's arithmetic.
- Transaction rollback per test is fast and perfect, except for anything about transactions.
- An in-memory fake is not a database. Test against the engine and version you deploy.
- Fixtures must be deterministic: no `random()`, no `now()`.
- Fixtures must be minimal and named for the scenario, because the name is the failure message.
- Do not assert on execution plans; assert on outcomes. Plans legitimately change with volume.
- Run migrations twice in CI. If the second run fails, they are not re-runnable.
- Assert schema invariants from the catalogue: every FK indexed, no float money, every table keyed.
- A transformation without a test is an assertion nobody checked.

---

## 5 · Interview questions

**“How do you test SQL?”**
Against the engine and version I deploy, with each test wrapped in a transaction that is
rolled back afterwards — fast and perfectly isolated. I test the decisions rather than
the engine: that the constraints reject what they should, that reports produce known
numbers from a named fixture, that procedures handle their error paths, that the security
predicate actually filters. Fixtures are deterministic and minimal, named for the
scenario so the name is the failure message.

**“Why not use an in-memory database to make tests fast?”**
Because the differences between it and the real engine are precisely the things that
cause bugs: type coercion, null and collation behaviour, uniqueness over nulls,
transaction and locking semantics. A suite that passes against a fake and fails in
production has actively cost you time. Speed comes from transaction rollback per test
and a container that starts once, not from swapping the engine.

**“What is the limitation of rolling back each test?”**
You cannot test anything about transactions themselves — commit behaviour, isolation
levels, lock waits, deadlock retry — because you are inside a transaction you intend to
abandon. Those tests need real commits and explicit cleanup. There are usually few of
them, so it is worth having two categories rather than giving up the fast path for
everything.

**“Would you assert on the execution plan?”**
No. Plans change legitimately with data volume, statistics and engine version, so such a
test fails for correct reasons and gets deleted — taking the credibility of the
surrounding tests with it. If performance matters, assert on an outcome that is stable:
logical reads, or a time bound against representative data, and preferably in a
benchmark rather than the unit suite.

**“What would you test about a schema that code review misses?”**
Catalogue invariants: every table has a primary key, every foreign key column has an
index whose first column is that column, no monetary column is a floating-point type,
every table has an owner or a retention rule if that is your policy. They run in about a
second and catch the exact class of mistake a reviewer reading a migration diff cannot
see — because nothing in `ADD CONSTRAINT FOREIGN KEY` tells you there is no index behind
it.
