# Module 19 · Dynamic SQL and SQL injection

> Site chapters: [34](../../../site/chapters/34-dynamic-sql-and-injection.html)

---

## 1 · The idea

SQL injection is not a string-handling accident. It is a **channel** problem, and once
you say it that way the fix stops being a list of characters to watch for:

> **Injection happens because data and code share one channel. Parameters give them
> two.**

When you concatenate a value into a statement, the value arrives at the parser as
*text indistinguishable from the SQL around it*. The parser's job is to decide what is
syntax, and you have handed it a string in which the attacker chose part of the syntax.
There is no amount of inspection that reliably reverses that, which is why the
distinction that follows is the one interviews actually probe:

> **Parameterisation is not better escaping.**

Escaping is a blacklist: you try to enumerate the dangerous constructions and neutralise
them, and you lose to the one you did not think of — a different quoting convention, a
multi-byte encoding, a numeric context with no quotes at all, a second-order value that
was already escaped once. Parameters are categorically different: the statement is
parsed and planned **first**, with placeholders, and values are bound afterwards into
slots that are never re-parsed as syntax. The attacker's string cannot become code
because the code was already fixed before the string arrived.

And parameterisation is *also* the faster option, which is a pleasant argument to have
available: one cached plan for the statement, rather than one plan per distinct literal
filling the plan cache.

Then the boundary of what parameters can do, which is where people either demonstrate
understanding or reveal they have only used an ORM:

> **A parameter can be a value. It can never be an identifier, a keyword or a sort
> direction.**

You cannot parameterise a table name, a column name, `ASC`/`DESC`, or `AND`/`OR`. So
dynamic *structure* genuinely requires building SQL — and the safe way is not
sanitising the input but refusing to use it directly: **map the input to an allow-list
in code**. The user sends `sort=oldest`; your code looks that up in a dictionary and
finds the literal string `placed_at ASC` that *you* wrote. The user's bytes never reach
the statement.

Two traps to be able to name. Inside the database, `sp_executesql` accepts parameters
and `EXEC(@sql)` does not — so dynamic SQL in T-SQL is safe or unsafe depending on which
you reach for. And **second-order injection**: a value read back out of your own table,
which was stored safely, is concatenated into a statement later and is now code. The
rule has to be unconditional — never concatenate a value, whatever its origin —
because "it came from our own database" is exactly the reasoning that fails here.

Finally, the ORM point, because it is the most common false comfort: **an ORM is not a
defence**. It parameterises its generated SQL, yes. Its raw-SQL escape hatch — which
every ORM has, and which every codebase uses somewhere — is as injectable as anything
else, and is usually where the vulnerability is.

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | Every statement in the service is written out in full with placeholders, and there is **no statement built by concatenation anywhere**. That is the design, not a convention somebody remembered. |
| [`api/src/db.mjs`](../../../api/src/db.mjs) | The `-- name:` parser loads statements from the file and hands them to the driver for binding. Values never travel with the SQL text. |
| [`api/sql/queries.sql`](../../../api/sql/queries.sql) | `user_by_username` takes the username as a parameter. This is the classic injection target — a login form — and there is nothing to inject into. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `username` is stored **already normalised**: trimmed and lower-cased. Note the comment's reasoning — normalising on read means the unique index is on the wrong thing. Normalisation at the boundary is a related discipline to parameterisation at the boundary. |
| [`api/tests/auth.test.mjs`](../../../api/tests/auth.test.mjs) | The authentication tests, including the refusal to start without a signing key. Security properties asserted by tests rather than assumed. |
| [`api/README.md`](../../../api/README.md) | The decision write-up. Worth reading for how a security decision is *recorded* so the next person does not undo it. |

---

## 3 · Do it

### a) Build the vulnerability so you recognise it

In a scratch database, write the concatenated version by hand:

```sql
-- Imagine: "SELECT * FROM customers WHERE email = '" + input + "'"
SELECT * FROM customers WHERE email = '' OR 1=1 --';
```

Then the version that returns every row regardless of the rest of the predicate, and
the version that ends the statement and starts another. Doing this once, deliberately,
in a database you own, is what makes the shape recognisable in a code review.

### b) Watch parameterisation refuse to be tricked

```bash
node api/server.mjs
```

Then send the classic payload as a *value* to a real endpoint:

```bash
curl -s -X POST http://127.0.0.1:5057/api/auth/sign-in \
  -H 'content-type: application/json' \
  -d '{"username":"admin'"'"' OR 1=1 --","password":"x"}'
```

It fails as a login attempt, because it *is* one: the string was looked up as a
username, found not to exist, and never parsed as syntax. Nothing was escaped. The
channel was simply separate.

### c) Prove a parameter cannot be an identifier

```sql
SELECT * FROM orders ORDER BY ?;      -- bind 'placed_at DESC'
```

This does not sort by `placed_at` descending. Depending on the engine it sorts by a
constant — every row tied — or errors. That failure is the reason allow-lists exist,
and it is a much better teacher than being told.

### d) Write the allow-list properly

```js
// The user sends a key. The code chooses the SQL. The two never mix.
const ORDER = {
  newest:  'placed_at DESC, id DESC',
  oldest:  'placed_at ASC,  id ASC',
  largest: 'total_cents DESC, id DESC',
};
const orderBy = ORDER[input] ?? ORDER.newest;   // no sanitising, a lookup
```

Note what makes this safe: there is no code path in which the user's bytes reach the
statement. Contrast with a version that checks the input against a regular expression
and then concatenates it — that is a blacklist again, and it is one clever input away
from failing.

### e) The exercise

Search this repository for any string concatenation that produces SQL:

```bash
grep -rn "SELECT\|INSERT\|UPDATE\|DELETE" api/src/*.mjs
```

You should find none — the statements all live in
[`api/sql/queries.sql`](../../../api/sql/queries.sql). Now write, in one paragraph, what
you would have to add to this service to introduce a dynamic `ORDER BY` for the
leaderboard, and how you would keep it safe. Then do the same for a genuinely dynamic
report builder where the *columns* are chosen by the user, and say why that one needs an
allow-list of column names rather than any form of input validation.

---

## 4 · Golden rules

- Injection happens because data and code share one channel. Parameters give them two.
- Parameterisation is not better escaping. Escaping is a blacklist; parameters are never parsed as syntax.
- Parameterised queries are also faster: one cached plan instead of one per literal.
- An ORM is not a defence. Its raw-SQL escape hatch is injectable like anything else.
- A parameter can be a value, never an identifier, a keyword or a sort direction.
- For dynamic identifiers, use an allow-list in code — choose from a map, do not sanitise input.
- Inside the database, `sp_executesql` takes parameters and `EXEC(@sql)` does not.
- Safe dynamic SQL is also the fix for the optional-parameter plan problem.
- Second-order injection comes from your own tables. The rule is never to concatenate a value, whatever its origin.
- The `(@p IS NULL OR col = @p)` pattern caches one plan for every parameter combination. Recompile it or build it dynamically with parameters.
- The strongest argument for procedures is the permission boundary: `EXECUTE` only, no table access.
- An application connecting as the owner turns any injection flaw into total compromise.

---

## 5 · Interview questions

**“What is SQL injection and how do you prevent it?”**
It happens because the value and the statement travel in one channel, so a crafted value
becomes part of the syntax the parser reads. Prevent it by separating the channels:
parameterised statements, where the SQL is parsed and planned with placeholders first
and values are bound afterwards into slots that are never re-parsed as syntax. Not by
escaping.

**“Why is parameterisation better than escaping?”**
Escaping is a blacklist — you enumerate dangerous constructions and try to neutralise
them — so it fails to the case you did not enumerate: a different quoting rule, an
encoding trick, a numeric context with no quotes, a value that was already escaped once
and is now being concatenated a second time. Parameters change the category of the
problem rather than filtering it: the value cannot become code because the code was
already fixed before the value arrived. It is also faster, since the plan cache holds
one plan instead of one per literal.

**“How do you write a query where the user chooses the sort column?”**
Not with a parameter — a parameter can only be a value, never an identifier or a sort
direction. Map the user's input to SQL you wrote yourself: a dictionary from
`"newest"` to the literal `ORDER BY placed_at DESC, id DESC`, with a default for
anything unrecognised. The user's bytes never reach the statement, so there is nothing
to validate or sanitise. The same applies to dynamic column and table names.

**“Does using an ORM protect you?”**
Only for the SQL it generates. Every ORM has a raw-SQL escape hatch, every non-trivial
codebase uses it for reports and bulk operations, and string concatenation there is
exactly as injectable as anywhere else. ORMs also have subtler issues — an untranslatable
predicate evaluated client-side, or a parameter type mismatch that defeats an index —
but for injection specifically the answer is that the escape hatch is where to look.

**“What is second-order injection?”**
When a value that was stored safely — properly parameterised on the way in — is later
read back out of your own table and concatenated into another statement. The data is
now code, and the reasoning that let it happen is "this came from our own database, so
it is trusted". That is why the rule has to be unconditional: never concatenate a value
into SQL, regardless of where it came from.
