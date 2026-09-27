# Module 14 · JSON and semi-structured data

> Site chapters: [18](../../../site/chapters/18-json-in-sql.html)

---

## 1 · The idea

A JSON column is a way of storing data the database cannot help you with. That is
not an argument against it — sometimes that is exactly the right trade — but it has
to be the trade you *chose*, stated in one sentence, rather than the one you drifted
into because the shape was awkward.

What you give up, precisely: a JSON column has no column types, no `NOT NULL`, no
`CHECK`, no `UNIQUE`, no foreign keys, and no statistics for the optimiser.
**Everything the engine could have checked, it now cannot.** A typo in a key name is
not an error, it is a null. A number stored as a string is not a type violation, it
is Tuesday. A reference to a row that no longer exists is nobody's problem until a
report is wrong.

So the rule is about *what the field is for*:

> **JSON is right for open-ended attributes, verbatim payloads and sparse settings.
> It is wrong for anything you filter, join or aggregate.**

"Verbatim payload" is the strongest case and worth recognising because it comes up
constantly: you received a webhook, or a message off a queue, and you want to keep
exactly what arrived — for debugging, for replay, for an audit trail. Parsing it into
columns and throwing away the original is a loss of evidence. Store the document,
and *promote* the two or three fields you actually query into real columns beside it.

That promotion is the technique that matters:

> **Generated / computed columns give you one source of truth and real indexes.**

The value stays in the document; a generated column extracts it, the engine keeps it
in step automatically, and you index *that*. PostgreSQL and MySQL have generated
columns; SQL Server has `PERSISTED` computed columns, which is the only way to index
JSON there at all, since SQL Server has no JSON index type.

And the dialect facts that decide real designs: in PostgreSQL use `jsonb`, never
`json` — `json` is stored as text and reparsed on every access, and only `jsonb`
indexes usefully. Prefer a B-tree on one extracted path over a GIN index on the whole
document far more often than people expect; GIN is for "any key, any value"
containment queries, and if you know which path you filter on, you do not need it.

The closing test, which is a design smell you should be able to name:

> **Three indexes on three JSON paths is a schema asking to be written.**

---

## 2 · In this codebase

| Where | What to look at |
| --- | --- |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `profiles.document TEXT NOT NULL` — the whole learner progress document as a blob, with a comment explaining the decision: its shape is owned by the browser and changes with every learning feature, and the server only ever reads and writes the whole thing. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `xp`, `mastery_percent`, `streak_days`, `chapters_passed` — the four figures the leaderboard orders by, **promoted out of the document into real columns** on every write. The comment says why: querying inside a JSON column across two engines is the sort of cleverness that stops working when somebody switches engine. |
| [`api/sql/schema.sql`](../../../api/sql/schema.sql) | `ix_profiles_leaderboard ON profiles (xp DESC)` — an index on the promoted column. You cannot write this against a path inside `document` portably, which is the whole argument. |
| [`api/src/mastery.mjs`](../../../api/src/mastery.mjs) | Where the promotion happens, server-side, re-derived rather than trusted from the client. A promoted column is a copy, and every copy needs a named mechanism that keeps it true. |
| [`api/tests/profile.test.mjs`](../../../api/tests/profile.test.mjs) | "a MALFORMED progress document produces zeroes, not a 500" — the test that exists precisely because a JSON column has no schema to reject bad input at write time. |
| [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql) | `outbox.payload TEXT NOT NULL` with the comment "JSON. See chapter 18 for why it is a blob here" — the verbatim-payload case. The worker publishes it unchanged; nothing queries inside it. |

---

## 3 · Do it

### a) Watch the engine decline to help you

```sql
CREATE TABLE settings (id INTEGER PRIMARY KEY, doc TEXT NOT NULL);
INSERT INTO settings VALUES (1, '{"theme":"dark","max_items":50}');
INSERT INTO settings VALUES (2, '{"theme":"dark","max_items":"fifty"}');
INSERT INTO settings VALUES (3, '{"thmee":"dark"}');

SELECT id, json_extract(doc, '$.theme') AS theme,
           json_extract(doc, '$.max_items') AS max_items
FROM settings;
```

Three rows inserted, zero errors. Row 2 has a string where a number belongs; row 3
has a misspelled key that now reads as `NULL`. A `theme TEXT NOT NULL CHECK (theme IN
('light','dark'))` column would have rejected both at the door.

### b) Promote a field and index it

```sql
CREATE TABLE settings2 (
  id        INTEGER PRIMARY KEY,
  doc       TEXT NOT NULL,
  theme     TEXT GENERATED ALWAYS AS (json_extract(doc, '$.theme')) VIRTUAL
);
CREATE INDEX ix_settings2_theme ON settings2 (theme);
INSERT INTO settings2 (id, doc) VALUES (1, '{"theme":"dark"}');

EXPLAIN QUERY PLAN SELECT id FROM settings2 WHERE theme = 'dark';
EXPLAIN QUERY PLAN SELECT id FROM settings2 WHERE json_extract(doc,'$.theme') = 'dark';
```

One seeks, one scans. Note that the second is *the same expression the generated
column is defined as* — some engines match it and some do not, which is exactly the
kind of thing you verify rather than assume.

### c) Expand an array into rows

```sql
SELECT s.id, j.value AS tag
FROM settings s, json_each(json_extract(s.doc, '$.tags')) j;
```

Once the array is rows, it is ordinary SQL again — you can join it, group it,
aggregate it. That transition is the skill: get out of JSON as early as possible and
use the language.

### d) The exercise

Read `profiles` in [`api/sql/schema.sql`](../../../api/sql/schema.sql) and answer two
questions in writing. First: name a field currently inside `document` that a new
feature would plausibly need to filter or sort by, and say what you would do — promote
it, or query inside the document, and why. Second: the four promoted columns are
copies, and every copy can drift from its source. Find the mechanism in
[`api/src/mastery.mjs`](../../../api/src/mastery.mjs) that keeps them true, and say
what would have to go wrong for the leaderboard to disagree with a learner's own
dashboard.

---

## 4 · Golden rules

- JSON is right for open-ended attributes, verbatim payloads and sparse settings — not for anything you filter, join or aggregate.
- A JSON column has no types, no constraints and no foreign keys. Everything the engine could have checked, it now cannot.
- PostgreSQL: use `jsonb`, not `json`. Only `jsonb` indexes usefully.
- Index one extracted path with a B-tree far more often than the whole document with GIN.
- SQL Server has no JSON index; index a `PERSISTED` computed column instead.
- Promote queried fields into generated columns: one source of truth, real indexes and statistics.
- Expand arrays into rows with `jsonb_array_elements` / `OPENJSON` and then use ordinary SQL.
- Three indexes on three JSON paths is a schema asking to be written.

---

## 5 · Interview questions

**“When would you use a JSON column?”**
For open-ended or sparse attributes whose shape you do not control, for settings that
vary per tenant, and for verbatim payloads you want to keep exactly as received — a
webhook body, a message off a queue — because parsing and discarding the original
loses evidence you will want when something is wrong. Not for anything you filter,
join or aggregate on, because those are the operations the engine can no longer help
with.

**“What do you lose by putting a field in JSON instead of a column?”**
Types, `NOT NULL`, `CHECK`, `UNIQUE`, foreign keys and statistics. A misspelled key
reads as null rather than failing; a number stored as a string is accepted; a
reference to a deleted row is never noticed. You also lose the optimiser's
cardinality estimates for that field, so plans over it are guesses.

**“How do you index a value inside a JSON document?”**
Prefer promoting it: a generated or computed column that extracts the path, with an
ordinary B-tree index on that column. One source of truth — the document — plus real
indexes and real statistics. In SQL Server that is the *only* option, since there is
no JSON index type; a `PERSISTED` computed column with an index is the idiom.
PostgreSQL can also index the expression directly, or use GIN over the whole
document, but GIN is for containment queries where you do not know the path in
advance.

**“`json` or `jsonb` in PostgreSQL?”**
`jsonb` essentially always. `json` keeps the original text and reparses it on every
access, preserving key order and duplicates; `jsonb` stores a parsed binary form,
which is faster to read and is the only one that supports the useful index types. The
only reason to choose `json` is if you must reproduce the input byte-for-byte.

**“When would you migrate a JSON field into a real column?”**
When you start filtering, joining, sorting or aggregating on it — or when you find
yourself wanting a constraint on it. Three indexes on three different paths is the
clearest signal: the access pattern is now structured, so the storage should be too.
Do it as an expand-and-backfill migration, with the generated column as the
intermediate step so nothing has to change at once.
