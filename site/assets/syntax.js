/* ===========================================================================
   syntax.js — THE TOKEN DICTIONARY.

   Every code example in this course is annotated twice:

     1. a comment on EVERY line, written by hand, in the code itself; and
     2. a SYNTAX ANATOMY table, generated at read time by assets/codex.js from
        this file.

   The second one is why this file exists. Hand-written token tables rot: the
   example gets edited, the table underneath it does not, and the reader is told
   that a function they are looking at does something it stopped doing a year
   ago. So the tables are not written, they are DERIVED — codex.js tokenises the
   block, looks each token up here, and renders what it finds. One dictionary,
   one wording, every chapter.

   tools/doctor.mjs then closes the loop: any keyword, function or operator that
   appears in any code block and is NOT in this file fails the build. That is
   what makes "every token in every example is explained" a fact rather than a
   promise.

   ENTRY SHAPE
       k  kind      keyword | clause | operator | function | type | literal
                    | variable | directive | tool
       w  what      what it does, in one sentence, in plain words
       t  types     the type story: what goes in, what comes out, and every
                    implicit conversion. Optional, but write one wherever a type
                    changes — that is the part readers get wrong.
       d  dialect   only when the token is not portable

   Keys are UPPERCASE for SQL keywords and functions (SQL is case-insensitive;
   the lookup uppercases first). Multi-word keys ("GROUP BY", "IS NOT NULL") are
   matched longest-first, so "IS NOT NULL" never comes out as three rows.

   `self` and not `window`, for the same reason chapters.js uses it: this file is
   loaded by pages, and could be loaded by a worker.
   =========================================================================== */

(function (root) {
  "use strict";

  var S = {};

  /* Small helper so four hundred entries stay readable. */
  function def(key, k, w, t, d) { S[key] = { k: k, w: w, t: t || "", d: d || "" }; }

  /* ============================================================== clauses ===
     The clauses of a SELECT. They are listed here in the order the ENGINE runs
     them, which is not the order you write them — chapter 06 is entirely about
     that gap, and half the beginner mistakes in this course come from it. */

  def("SELECT", "clause",
    "Names the columns of the result. Runs FIFTH — after FROM, WHERE, GROUP BY and HAVING — which is why an alias defined here is invisible to WHERE.",
    "Each output column takes the type of its expression: a bare column keeps the column's declared type; an expression takes the widest type of its operands.");
  def("FROM", "clause",
    "Names the tables, views, subqueries or functions the rows come from. Runs FIRST.",
    "Produces a row source. Every later clause sees the columns of whatever FROM produced, under their table aliases.");
  def("WHERE", "clause",
    "Throws away rows before grouping. Runs SECOND, so it cannot see aggregates or SELECT aliases.",
    "Takes a boolean expression and keeps rows for which it is TRUE. UNKNOWN — the NULL case — is discarded exactly like FALSE.");
  def("GROUP BY", "clause",
    "Collapses rows that share the listed values into one row each. Runs THIRD.",
    "Afterwards only the grouping columns and aggregate functions are legal in SELECT: every other column no longer has a single value to show.");
  def("HAVING", "clause",
    "Throws away whole GROUPS. Runs FOURTH, so unlike WHERE it can see aggregates.",
    "Boolean, like WHERE. HAVING COUNT(*) > 1 is legal; WHERE COUNT(*) > 1 is a syntax error.");
  def("ORDER BY", "clause",
    "Sorts the result. Runs SIXTH — last but for LIMIT — which is why it CAN use a SELECT alias.",
    "Text sorts by collation, numbers by value: as text '10' comes before '9', as numbers it does not. Without ORDER BY the row order is undefined, not insertion order.");
  def("LIMIT", "clause",
    "Returns at most n rows. Meaningless without ORDER BY: 'any 10 rows' is what you actually asked for.",
    "Takes an integer. PostgreSQL, MySQL and SQLite spell it LIMIT; SQL Server spells it TOP, or OFFSET … FETCH NEXT.",
    "PostgreSQL / MySQL / SQLite");
  def("OFFSET", "clause",
    "Skips n rows before returning any. The engine still produces and discards them, which is why deep OFFSET pagination gets slower every page.",
    "Integer. Chapter 30 has the keyset alternative that does not degrade.");
  def("FETCH", "clause",
    "The standard spelling of LIMIT: OFFSET n ROWS FETCH NEXT m ROWS ONLY. Also the cursor verb, FETCH NEXT FROM cur.",
    "Integer counts.");
  def("NEXT", "keyword", "Part of FETCH NEXT n ROWS ONLY, and of FETCH NEXT FROM a cursor.", "");
  def("ONLY", "keyword", "Closes FETCH NEXT n ROWS ONLY.", "");
  def("TOP", "clause",
    "SQL Server's LIMIT, written before the column list: SELECT TOP 12 …",
    "Integer, or a percentage with PERCENT. TOP without ORDER BY returns an arbitrary n rows, not the first n.",
    "SQL Server");
  def("DISTINCT", "keyword",
    "Removes duplicate rows. Often a plaster over a join fan-out rather than a requirement — ask where the duplicates came from first.",
    "Compares whole rows, and here two NULLs count as the same value, unlike in =. Usually costs a sort or a hash over the result.");
  def("AS", "keyword",
    "Names something: a column alias, a table alias, or the body of a CREATE VIEW, a CTE or a computed column.",
    "Purely a name. It converts nothing and copies nothing.");
  def("WITH", "clause",
    "Opens a common table expression — a named subquery you can reference by name, and reference more than once. Also introduces a table hint in T-SQL, WITH (UPDLOCK), and a column schema in OPENJSON.",
    "As a CTE it is a row source like a table. It is not a temporary table: most engines inline it rather than materialising it.");
  def("RECURSIVE", "keyword",
    "Lets a CTE reference itself, which is how you walk a hierarchy or generate a series.",
    "The recursive branch repeats until it returns no rows. Always add a depth guard: one cycle in the data is otherwise an infinite loop.");
  def("VALUES", "keyword",
    "A literal row constructor: the rows of an INSERT, or a small inline table in FROM.",
    "Each literal is converted to the target column's type where it can be — '2026-01-01' into a DATE column is parsed as a date, not stored as text.");

  def("ROWNUM", "keyword", "Oracle's pseudo-column: the row's position as the engine PRODUCED it.",
    "Assigned before ORDER BY sorts, so WHERE ROWNUM <= 10 takes ten arbitrary rows and then sorts those ten. FETCH FIRST sorts first. They are not the same query.", "Oracle");
  def("GROUP", "keyword", "Part of GROUP BY, and of GROUPING SETS.", "");
  def("BY", "keyword", "Part of GROUP BY, ORDER BY and PARTITION BY.", "");
  def("ORDER", "keyword", "Part of ORDER BY.", "");

  def("CTID", "keyword", "PostgreSQL's physical row address — the (page, slot) location of a row inside the table file.",
    "Not data: it CHANGES when the row is updated or the table is vacuumed, so it is valid only within the statement that read it. Never store it.", "PostgreSQL");
  def("ROWID", "keyword", "Oracle's physical row address, and SQLite's hidden integer primary key.",
    "In Oracle it is stable for the life of the row but not across a table move. In SQLite, INTEGER PRIMARY KEY IS the rowid.", "Oracle / SQLite");
  def("MINUS", "clause", "Oracle's spelling of EXCEPT.", "", "Oracle");
  def("PIVOT", "clause", "SQL Server's and Oracle's built-in pivot syntax.",
    "The column list must still be written out. Conditional aggregation with CASE says the same thing portably, and is what to give in an interview.", "SQL Server / Oracle");
  def("UNPIVOT", "clause", "The reverse: turns columns into rows.", "", "SQL Server / Oracle");

  def("INSTR", "function", "Oracle's and MySQL's POSITION(): the index of a substring, 1-based, 0 when absent.", "", "Oracle / MySQL");
  def("CHANGES", "function", "SQLite: how many rows the last statement changed.",
    "The row count IS the answer to an optimistic-concurrency update: 0 means somebody else got there first. T-SQL spells it @@ROWCOUNT.", "SQLite");
  def("ROWCOUNT", "variable", "T-SQL's @@ROWCOUNT: rows affected by the previous statement.",
    "Read it IMMEDIATELY — the next statement, including an IF, resets it.", "SQL Server");
  def("TRANCOUNT", "variable", "T-SQL's @@TRANCOUNT: how many transactions are open, counting nested BEGINs.",
    "Nested BEGIN TRANSACTION does not nest: only the outermost COMMIT commits, while any ROLLBACK undoes everything.", "SQL Server");
  def("FETCH_STATUS", "variable", "T-SQL's @@FETCH_STATUS: 0 while a cursor FETCH succeeded.", "", "SQL Server");
  def("NOCOUNT", "directive", "SET NOCOUNT ON: stop sending a 'n rows affected' message per statement.",
    "Standard in stored procedures: those messages are network round trips, and some clients mistake them for result sets.", "SQL Server");
  def("XACT_ABORT", "directive", "SET XACT_ABORT ON: abort and roll back the whole transaction on any runtime error.",
    "Without it, some errors abort only the statement and leave the transaction open — which is how a connection returns to the pool holding locks.", "SQL Server");
  def("XACT_STATE", "function", "T-SQL: whether the current transaction is committable (1), doomed (-1) or absent (0).", "", "SQL Server");
  def("JSONB_PATH_OPS", "keyword", "A GIN operator class that indexes only containment (@>), making the index smaller and faster than the default.", "", "PostgreSQL");
  def("VALUE", "keyword", "The column name OPENJSON and similar table functions give to the extracted value.", "", "SQL Server");

  def("GIN", "keyword", "PostgreSQL's Generalised Inverted Index: one index entry per KEY inside a value.",
    "The index type that makes JSONB containment (@>), array membership and full-text search fast. Larger and slower to update than a B-tree, which is the trade.", "PostgreSQL");
  def("GIST", "keyword", "PostgreSQL's Generalised Search Tree: the index type behind ranges, geometry and exclusion constraints.", "", "PostgreSQL");
  def("BRIN", "keyword", "A Block Range INdex: tiny, and only useful when the physical row order correlates with the column (append-only timestamps).", "", "PostgreSQL");

  def("PG_STAT_ACTIVITY", "tool", "PostgreSQL: one row per connection — what it is running, and what it is waiting for.", "", "PostgreSQL");
  def("SAVE", "keyword", "T-SQL's SAVE TRANSACTION: the savepoint verb.", "", "SQL Server");

  def("TO", "keyword", "Part of ROLLBACK TO SAVEPOINT, GRANT … TO, ALTER TABLE … RENAME TO and BACKUP … TO DISK.", "");

  def("$", "variable", "PostgreSQL's positional parameter marker: $1, $2 — the values the driver binds separately from the SQL text.",
    "Like every parameter marker, it is not string interpolation: the value never becomes part of the statement, which is what makes injection impossible.", "PostgreSQL");
  def("PG_STAT_USER_INDEXES", "tool", "PostgreSQL: how often each index has actually been used.",
    "idx_scan = 0 means an index nobody reads and every writer pays for.", "PostgreSQL");

  def("PG_STATS", "tool", "PostgreSQL: the per-column statistics the planner is actually using — distinct values, most common values, histogram bounds.", "", "PostgreSQL");

  def("OF", "keyword", "Part of PARTITION OF, FOR UPDATE OF and INSTEAD OF.", "");

  def("ENABLE", "keyword", "Turns a feature on for an object — ENABLE ROW LEVEL SECURITY, ENABLE TRIGGER.", "");
  def("FORCE", "keyword", "FORCE ROW LEVEL SECURITY: apply the policies to the table's OWNER too, who is otherwise exempt.", "", "PostgreSQL");
  def("QUOTE_IDENT", "function", "PL/pgSQL: quote a string so it is safe to use as an identifier in dynamic SQL.", "", "PostgreSQL");

  def("HAS_TABLE", "function", "pgTAP: asserts that a table exists.", "", "pgTAP");
  def("COL_NOT_NULL", "function", "pgTAP: asserts that a column is declared NOT NULL.", "", "pgTAP");
  def("THROWS_OK", "function", "pgTAP: asserts that a statement raises a given SQLSTATE.",
    "Assert on the SQLSTATE (23514 is a check violation), never on the message text — messages are localised and change between versions.", "pgTAP");
  def("FINISH", "function", "pgTAP: ends the test run and reports whether the planned number of assertions ran.", "", "pgTAP");

  def("RAISE_FAIL", "function", "A stand-in for whichever error verb your engine uses — THROW in T-SQL, RAISE EXCEPTION in PL/pgSQL, a non-zero exit in the orchestrator.",
    "The point of a data-quality check is that a failed check FAILS something. A check that only logs is a check nobody reads.");
  def("COPY_ONLY", "keyword", "Takes a backup WITHOUT resetting the differential base, so an ad-hoc copy cannot break the scheduled chain.", "", "SQL Server");

  def("OR REPLACE", "keyword", "CREATE OR REPLACE: define the object, overwriting one of the same name.",
    "It keeps existing GRANTs, unlike DROP then CREATE — which silently loses every permission on the object. SQL Server spells it CREATE OR ALTER.", "PostgreSQL / Oracle");
  def("OR ALTER", "keyword", "SQL Server's CREATE OR REPLACE.", "", "SQL Server");
  def("SQL", "keyword", "In PL/SQL, the implicit cursor for the statement just executed: SQL%ROWCOUNT, SQL%FOUND.", "", "Oracle");

  def("EXCEPTION_INIT", "directive", "Oracle: PRAGMA EXCEPTION_INIT binds a named exception to an error number, so callers can catch it by name.", "", "Oracle");
  def("RAISE_APPLICATION_ERROR", "function", "Oracle: raise a custom error, numbered between -20000 and -20999.",
    "The number is what the caller catches; the message is for a human. Choosing numbers deliberately is what makes a package's errors an interface rather than a surprise.", "Oracle");

  /* =============================================================== joins === */

  def("JOIN", "clause",
    "Pairs rows from two row sources. Logically a Cartesian product filtered by ON; the engine picks a faster physical strategy, but the ANSWER is defined that way.",
    "The result carries both sides' columns. Its row count is not the sum of the inputs and rarely the larger of them: it is however many pairs satisfy ON.");
  def("INNER JOIN", "clause", "Keeps only pairs that match. The default: a bare JOIN is an INNER JOIN.",
    "A row with no partner vanishes from the result entirely, including its own columns.");
  def("LEFT JOIN", "clause",
    "Keeps every row of the LEFT table, padding the right-hand columns with NULL where there was no match.",
    "Every right-hand column becomes nullable in the result whatever its declared type. That is where the NULLs in an outer-join result come from.");
  def("LEFT OUTER JOIN", "clause", "Identical to LEFT JOIN; OUTER is noise the standard permits.", "");
  def("RIGHT JOIN", "clause", "Keeps every row of the RIGHT table. Rewrite it as a LEFT JOIN with the tables swapped — it reads better and reviews better.", "");
  def("FULL", "keyword", "Part of FULL OUTER JOIN. Also the name of a complete database backup.", "");
  def("FULL OUTER JOIN", "clause",
    "Keeps unmatched rows from BOTH sides, padding whichever side is missing.",
    "Columns from both sides become nullable. This is the reconciliation join: what is in one system and not the other.");
  def("OUTER", "keyword", "Marks a join as outer — LEFT/RIGHT/FULL OUTER — meaning unmatched rows are preserved rather than dropped.", "");
  def("CROSS JOIN", "clause",
    "Every row of A paired with every row of B, with no ON clause.",
    "The row count is the PRODUCT of the two counts. Deliberate against a small fixed table — a calendar, a status list — and a disaster by accident.");
  def("CROSS", "keyword", "Part of CROSS JOIN, and of SQL Server's CROSS APPLY.", "");
  def("ON", "keyword",
    "The join predicate: which pairs of rows belong together.",
    "In an OUTER join a condition in ON filters BEFORE the NULL padding is added; the same condition in WHERE filters after, which silently turns the outer join into an inner one.");
  def("USING", "keyword",
    "Shorthand for ON when both sides spell the key identically: USING (customer_id).",
    "Merges the two key columns into one in the result. Also CREATE INDEX … USING GIN in PostgreSQL, and DELETE … USING.");
  def("APPLY", "keyword", "SQL Server's LATERAL: evaluate the right-hand table expression once per left-hand row.", "", "SQL Server");
  def("CROSS APPLY", "clause",
    "Runs a table expression once per left row and keeps only rows that returned something. The top-N-per-group workhorse in SQL Server.",
    "Behaves like an INNER JOIN to a correlated subquery; OUTER APPLY is the LEFT JOIN version.",
    "SQL Server");
  def("OUTER APPLY", "clause", "CROSS APPLY that keeps left rows whose expression returned nothing, padded with NULL.", "", "SQL Server");
  def("LATERAL", "keyword",
    "Lets a subquery in FROM see the columns of the tables written before it, so it can run once per row.",
    "Without LATERAL a FROM subquery is evaluated independently and cannot reference its neighbours.",
    "PostgreSQL / standard");

  /* ========================================================== predicates === */

  def("AND", "operator", "Both sides must be TRUE.",
    "Three-valued: TRUE AND UNKNOWN is UNKNOWN, but FALSE AND UNKNOWN is FALSE — a FALSE anywhere ends it.");
  def("OR", "operator", "Either side may be TRUE.",
    "Three-valued: TRUE OR UNKNOWN is TRUE; FALSE OR UNKNOWN is UNKNOWN.");
  def("NOT", "operator", "Inverts a condition.",
    "NOT UNKNOWN is UNKNOWN, not TRUE. That one fact is the whole reason NOT IN over a nullable column returns nothing.");
  def("IN", "operator", "True when the value equals any item in a list or subquery.",
    "Equivalent to a chain of ORs. A NULL in the list makes a non-match UNKNOWN rather than FALSE — harmless for IN, fatal for NOT IN.");
  def("NOT IN", "operator", "True when the value equals none of the items.",
    "Expands to a chain of <> joined by AND. One NULL in the list makes that chain UNKNOWN for every row, so the result is EMPTY — not an error. Use NOT EXISTS.");
  def("EXISTS", "operator", "True if the subquery returns at least one row. A semi-join: no duplication, and no columns taken from the right side.",
    "Boolean. What the subquery SELECTs is irrelevant — SELECT 1 is the convention precisely because the engine never evaluates it.");
  def("NOT EXISTS", "operator", "True if the subquery returns no rows. The anti-join, and the null-safe answer to 'which rows have no match'.",
    "Boolean, and never UNKNOWN: 'does a row exist' is a two-valued question. That is why it survives NULLs where NOT IN does not.");
  def("IS", "keyword", "Part of IS NULL / IS NOT NULL / IS DISTINCT FROM — the only operators that can test a NULL.", "");
  def("IS NULL", "operator", "True when the value is NULL.",
    "The ONLY way to test for NULL. x = NULL is UNKNOWN even when x is NULL, so it matches nothing at all.");
  def("IS NOT NULL", "operator", "True when the value is not NULL.", "Two-valued: it is never itself UNKNOWN.");
  def("IS DISTINCT FROM", "operator", "Null-safe inequality: two NULLs are not distinct from each other; a NULL and a value are.",
    "Always TRUE or FALSE, never UNKNOWN.", "PostgreSQL / standard");
  def("LIKE", "operator", "Pattern match: % is any run of characters, _ is exactly one.",
    "Text in, boolean out. A leading % cannot use a normal B-tree index — the index is ordered by prefix and you have not given one.");
  def("BETWEEN", "operator", "Range test, INCLUSIVE at both ends.",
    "a BETWEEN x AND y is exactly a >= x AND a <= y. Dangerous on timestamps: BETWEEN '2026-01-01' AND '2026-01-31' loses everything after midnight on the 31st. Use >= and <.");
  def("ANY", "operator", "True if the comparison holds for at least one row of the subquery. = ANY is IN.", "");
  def("ALL", "keyword", "In a comparison, true if it holds for every row of the subquery. In UNION ALL, keep duplicates. In SELECT ALL, the default opposite of DISTINCT.", "");
  def("SOME", "operator", "A synonym for ANY.", "");
  def("ESCAPE", "keyword", "Names the escape character in a LIKE pattern, so you can search for a literal % or _.", "");

  /* ========================================================= conditionals === */

  def("CASE", "keyword", "The if/else of SQL. An EXPRESSION, not a statement, so it goes anywhere a value goes — including inside an aggregate.",
    "Every branch must return a compatible type and the engine picks the widest. Mixing an INT branch with a VARCHAR branch either converts or errors, by dialect.");
  def("WHEN", "keyword", "One test inside a CASE. Branches are evaluated in order and the first TRUE one wins.", "");
  def("THEN", "keyword", "The value a WHEN branch produces.", "");
  def("ELSE", "keyword", "The fallback branch of a CASE.",
    "Omit it and the fallback is NULL — which is how a CASE that looks exhaustive quietly produces nulls.");
  def("END", "keyword", "Closes a CASE expression, or a BEGIN block in procedural SQL.", "");
  def("IF", "keyword", "A procedural branch in T-SQL or PL/pgSQL. Not CASE, which is an expression rather than a statement.", "");

  /* =========================================================== set logic === */

  def("UNION", "clause", "Stacks two results and REMOVES duplicates.",
    "Both sides need the same number of columns with compatible types; the deduplication costs a sort or a hash over everything.");
  def("UNION ALL", "clause", "Stacks two results and keeps duplicates. Cheaper, and usually what was meant.",
    "No sort, no hash — rows stream through. Use it whenever the two sides cannot overlap.");
  def("INTERSECT", "clause", "Rows present in both results.", "Deduplicates like UNION, and treats NULLs as equal.");
  def("EXCEPT", "clause", "Rows in the first result and not in the second. Oracle spells it MINUS.",
    "Deduplicates. A good test assertion: A EXCEPT B returning nothing means A is a subset of B.");

  /* ======================================================== window clause === */

  def("OVER", "keyword",
    "Turns an aggregate or a ranking function into a WINDOW function: compute across related rows WITHOUT collapsing them.",
    "The row count of the result is unchanged — that is the whole difference from GROUP BY.");
  def("PARTITION BY", "clause", "Restarts the window for each new value: 'per customer', 'per month'.",
    "Like GROUP BY inside the window, except the rows survive.");
  def("WINDOW", "keyword", "Names a window definition once so several functions can share it: WINDOW w AS (PARTITION BY …).", "");
  def("ROWS", "keyword", "Frame in ROWS: count physical rows, so ROWS BETWEEN 2 PRECEDING AND CURRENT ROW is exactly three rows.",
    "Positional. Ties are NOT grouped: two rows with the same ORDER BY value stay separate.");
  def("RANGE", "keyword", "Frame in RANGE: include every row whose ORDER BY VALUE ties with the current one.",
    "The DEFAULT frame when you write ORDER BY inside OVER and no frame — which is why a running total can jump by a whole day at once. Say ROWS when you mean rows.");
  def("PRECEDING", "keyword", "The start of a frame, counted backwards from the current row.", "");
  def("FOLLOWING", "keyword", "The end of a frame, counted forwards from the current row.", "");
  def("UNBOUNDED", "keyword", "As far as the partition goes: UNBOUNDED PRECEDING is its first row, UNBOUNDED FOLLOWING its last.", "");
  def("CURRENT", "keyword", "Part of CURRENT ROW in a frame, and of CURRENT_DATE / CURRENT_TIMESTAMP.", "");
  def("ROW", "keyword", "Part of CURRENT ROW; also the row constructor ROW(a, b).", "");
  def("CURRENT ROW", "keyword", "The frame boundary at the row being computed.",
    "Under RANGE this means 'and every row that ties with it', not 'this one row'.");
  def("FILTER", "keyword", "Restricts which rows an aggregate sees: COUNT(*) FILTER (WHERE status = 'paid').",
    "The standard, tidier spelling of conditional aggregation.", "PostgreSQL / SQLite");
  def("NULLS", "keyword", "Part of NULLS FIRST / NULLS LAST, which says where NULLs sort.",
    "Engines disagree by default: PostgreSQL sorts NULLs last ascending, SQL Server sorts them first. Say it explicitly when it matters.");
  def("FIRST", "keyword", "Part of NULLS FIRST, and of FETCH FIRST n ROWS.", "");
  def("LAST", "keyword", "Part of NULLS LAST.", "");
  def("ASC", "keyword", "Ascending sort. The default, so it is usually written only for symmetry with a DESC beside it.", "");
  def("DESC", "keyword", "Descending sort.",
    "An index can serve a DESC sort by being read backwards, so a separate descending index is rarely needed.");
  def("ROLLUP", "keyword", "Adds subtotal rows and a grand total to a GROUP BY.",
    "The extra rows carry NULL in the columns being totalled over; GROUPING() tells a real NULL from a subtotal marker.");
  def("CUBE", "keyword", "Every combination of subtotals across the grouping columns.", "");
  def("GROUPING SETS", "keyword", "Several different GROUP BYs in one pass over the data.", "");

  /* ================================================================= DML === */

  def("INSERT", "clause", "Adds rows to a table.",
    "Every column not listed gets its DEFAULT, or NULL where there is no default — and fails outright if the column is NOT NULL without one.");
  def("INSERT INTO", "clause", "Adds rows to the named table. Always list the columns: INSERT INTO t (a, b) VALUES …",
    "Without a column list the statement is positional, so adding a column to the table later silently breaks it.");
  def("INTO", "keyword", "Names the target of an INSERT, or of SELECT … INTO in T-SQL.", "");
  def("UPDATE", "clause", "Changes column values in rows that already exist.",
    "An UPDATE with no WHERE updates every row. Run the SELECT first; that habit is worth more than any recovery plan.");
  def("SET", "keyword", "In UPDATE: which columns get which values. In T-SQL: a session setting, as in SET NOCOUNT ON.",
    "The right-hand side is evaluated against the row's OLD values, so SET a = b, b = a swaps them rather than making both equal.");
  def("DELETE", "clause", "Removes rows.",
    "Row-by-row and fully logged, so it can be rolled back and is slow at volume. TRUNCATE is the bulk alternative, with different rules.");
  def("TRUNCATE", "clause", "Empties a table by deallocating its pages rather than deleting rows.",
    "Minimally logged and very fast, but it cannot be filtered, usually cannot run while a foreign key references the table, and resets identity counters.");
  def("MERGE", "clause", "One statement that inserts, updates and deletes according to whether a source row matched.",
    "Concurrency-hostile in several engines without HOLDLOCK: two sessions can both decide 'no match' and both insert. Chapter 20 prefers upsert.");
  def("MATCHED", "keyword", "The branch selector in MERGE: WHEN MATCHED / WHEN NOT MATCHED.", "");
  def("ON CONFLICT", "clause", "PostgreSQL's and SQLite's upsert: what to do when an insert would violate a unique constraint.",
    "Requires a real UNIQUE index to detect the conflict — there is nothing to conflict with otherwise.", "PostgreSQL / SQLite");
  def("CONFLICT", "keyword", "Part of ON CONFLICT DO UPDATE / DO NOTHING.", "", "PostgreSQL / SQLite");
  def("DO", "keyword", "Part of ON CONFLICT DO UPDATE / DO NOTHING; also PostgreSQL's anonymous DO block.", "", "PostgreSQL / SQLite");
  def("NOTHING", "keyword", "ON CONFLICT DO NOTHING: skip the row silently instead of raising an error.", "", "PostgreSQL / SQLite");
  def("EXCLUDED", "keyword", "Inside ON CONFLICT DO UPDATE, the pseudo-table holding the row that WOULD have been inserted.",
    "So SET qty = EXCLUDED.qty means 'take the new value', and SET qty = t.qty + EXCLUDED.qty accumulates.", "PostgreSQL / SQLite");
  def("DUPLICATE", "keyword", "MySQL's upsert: INSERT … ON DUPLICATE KEY UPDATE.", "", "MySQL");
  def("RETURNING", "clause", "Gives back the rows a write actually touched, in the same statement.",
    "Turns insert-then-select into one atomic round trip. There is no window in which another session can change the row underneath you.",
    "PostgreSQL / SQLite / Oracle");
  def("OUTPUT", "clause", "SQL Server's RETURNING. OUTPUT INSERTED.id, DELETED.status gives before and after values.", "", "SQL Server");
  def("INSERTED", "keyword", "In an OUTPUT clause or a trigger, the pseudo-table of new row values.", "", "SQL Server");
  def("DELETED", "keyword", "In an OUTPUT clause or a trigger, the pseudo-table of old row values.", "", "SQL Server");

  /* ================================================================= DDL === */

  def("CREATE", "clause", "Defines a new object: table, index, view, procedure, function, trigger, schema.", "");
  def("TABLE", "keyword", "The object kind in CREATE/ALTER/DROP TABLE.", "");
  def("ALTER", "clause", "Changes an existing object.",
    "Cost varies enormously: adding a nullable column is metadata-only in most engines, while adding a NOT NULL column with a default may rewrite every page.");
  def("DROP", "clause", "Deletes an object and its data. Not transactional in every engine — check before you rely on rolling it back.", "");
  def("ADD", "keyword", "The ALTER verb for a new column or constraint.", "");
  def("COLUMN", "keyword", "The object kind in ALTER TABLE … ADD/DROP/ALTER COLUMN.", "");
  def("CONSTRAINT", "keyword", "Names a rule the data must satisfy. Name them: 'ck_orders_status' in an error log is a diagnosis, 'CK__orders__3213E83F' is a scavenger hunt.",
    "A named constraint can be dropped and re-created by name in a migration; an auto-named one cannot, portably.");
  def("PRIMARY KEY", "keyword", "The column or columns that identify a row uniquely. Implies UNIQUE and NOT NULL.",
    "Usually creates the clustered index in SQL Server, which decides the physical row order for the whole table.");
  def("PRIMARY", "keyword", "Part of PRIMARY KEY.", "");
  def("KEY", "keyword", "Part of PRIMARY KEY / FOREIGN KEY / UNIQUE KEY. In MySQL, also a synonym for INDEX.", "");
  def("FOREIGN KEY", "keyword", "Requires that a value exists in another table's key. The cheapest bug prevention in the database.",
    "The child column should almost always be indexed too: it is not automatic outside MySQL, and without it every parent DELETE scans the child.");
  def("FOREIGN", "keyword", "Part of FOREIGN KEY.", "");
  def("REFERENCES", "keyword", "Names the parent table and column of a foreign key.", "");
  def("CASCADE", "keyword", "ON DELETE CASCADE / ON UPDATE CASCADE: propagate the change to child rows.",
    "Convenient and dangerous: one DELETE can remove a subtree you cannot see from the statement.");
  def("RESTRICT", "keyword", "Refuse the parent change while children exist. The safe default.", "");
  def("UNIQUE", "keyword", "No two rows may share this value.",
    "Implemented as an index, so it also speeds lookups. Most engines allow MANY NULLs in a unique column, because two NULLs are not equal — SQL Server allows only one.");
  def("CHECK", "keyword", "A boolean rule each row must satisfy: CHECK (quantity > 0).",
    "Evaluated per row on insert and update. A row where the expression is UNKNOWN (a NULL operand) PASSES — a check is only violated by a definite FALSE.");
  def("NOT NULL", "keyword", "The column must always have a value.",
    "The single most valuable constraint: it removes three-valued logic from every query that touches the column.");
  def("NULL", "literal", "The absence of a value. Not zero, not an empty string, and not equal to itself.",
    "Any arithmetic with NULL is NULL; any comparison with NULL is UNKNOWN. Only IS NULL can test it.");
  def("DEFAULT", "keyword", "The value used when an INSERT does not mention the column.",
    "Evaluated at insert time, so DEFAULT now() is the row's own insert moment, not the table's creation moment.");
  def("IDENTITY", "keyword", "SQL Server's auto-numbering column.",
    "Gaps are normal and are not a bug: a rolled-back transaction keeps the number it consumed.", "SQL Server");
  def("SEQUENCE", "keyword", "A standalone number generator, shareable between tables.",
    "Not transactional: numbers consumed by a rolled-back transaction are gone. Never use one as a gap-free invoice counter.");
  def("SERIAL", "type", "PostgreSQL shorthand for an integer column backed by a sequence.",
    "Modern code prefers GENERATED ALWAYS AS IDENTITY, which is the standard spelling.", "PostgreSQL");
  def("GENERATED", "keyword", "Part of GENERATED ALWAYS AS IDENTITY (auto-number) or GENERATED ALWAYS AS (expression) (computed column).", "");
  def("ALWAYS", "keyword", "In GENERATED ALWAYS: the value is the database's to assign, and an INSERT may not supply one.", "");
  def("STORED", "keyword", "A computed column whose value is physically written and can be indexed, rather than recomputed per read.", "");
  def("PERSISTED", "keyword", "SQL Server's word for STORED on a computed column.", "", "SQL Server");
  def("INDEX", "keyword", "A sorted, redundant copy of some columns that turns a scan into a seek.",
    "It costs write time and disk on every insert, update and delete of the indexed columns. Chapters 25 and 26 are about paying that cost deliberately.");
  def("INCLUDE", "keyword", "Adds non-key columns to an index's leaf level so a query can be answered from the index alone.",
    "Included columns are not sorted and cannot be searched — they exist to make the index COVERING.", "SQL Server / PostgreSQL");
  def("CLUSTERED", "keyword", "The index that IS the table: its leaf level holds the rows themselves, so there is only one per table.", "", "SQL Server");
  def("NONCLUSTERED", "keyword", "A secondary index: keys plus a pointer back to the row.", "", "SQL Server");
  def("VIEW", "keyword", "A stored query that behaves like a table.",
    "By default it stores no data and costs whatever its query costs, every time it is read.");
  def("MATERIALIZED", "keyword", "A view whose result IS stored, and therefore can be stale.",
    "PostgreSQL requires an explicit REFRESH; SQL Server's indexed views update synchronously and charge the writer for it.");
  def("SCHEMA", "keyword", "A namespace for tables. Also, loosely, the shape of the database.", "");
  def("DATABASE", "keyword", "The object kind in CREATE/BACKUP/RESTORE DATABASE.", "");
  def("TEMPORARY", "keyword", "A table that exists only for this session or transaction.", "");
  def("PRAGMA", "directive", "A compiler or engine directive. In SQLite it is the settings verb (PRAGMA foreign_keys = ON); in Oracle PL/SQL it tells the compiler something, as in PRAGMA EXCEPTION_INIT.",
    "Foreign keys are OFF by default in SQLite, per connection. A schema whose constraints are never enforced looks identical to one without them.",
    "SQLite");

  /* ======================================================== transactions === */

  def("BEGIN", "clause", "Starts a transaction, or opens a procedural block.",
    "Everything until COMMIT or ROLLBACK is one atomic unit: all of it happens, or none of it does.");
  def("TRANSACTION", "keyword", "The unit of atomicity, consistency, isolation and durability.", "");
  def("COMMIT", "clause", "Makes the transaction's changes permanent and visible to others.",
    "Returns only after the log record is durable on disk — which is why commit latency is disk latency, and why one commit per row is slow.");
  def("ROLLBACK", "clause", "Undoes everything since BEGIN.",
    "Identity and sequence values consumed are NOT given back. Gaps in an auto-number column are normal.");
  def("SAVEPOINT", "keyword", "A named point inside a transaction you can roll back to without losing the whole thing.", "");
  def("ISOLATION", "keyword", "Part of SET TRANSACTION ISOLATION LEVEL: how much of other transactions' work you are allowed to see.", "");
  def("LEVEL", "keyword", "Part of SET TRANSACTION ISOLATION LEVEL.", "");
  def("READ COMMITTED", "keyword", "The usual default: you never read uncommitted data, but the same query twice in one transaction can return different rows.", "");
  def("REPEATABLE READ", "keyword", "Rows you have read cannot change under you; new rows matching your filter can still appear.", "");
  def("SERIALIZABLE", "keyword", "The result must equal SOME serial order of the transactions.",
    "The only level with no anomalies. Costs concurrency, and in PostgreSQL it means your transaction can be aborted and must be retried by the application.");
  def("SNAPSHOT", "keyword", "Readers see a consistent point-in-time image and never block writers.",
    "SQL Server's READ COMMITTED SNAPSHOT is the single highest-value setting change for a blocking-heavy OLTP system.", "SQL Server");
  def("UNCOMMITTED", "keyword", "READ UNCOMMITTED — dirty reads. It is not 'a faster query', it is 'a query that may return data that never existed'.", "");
  def("NOLOCK", "hint", "SQL Server's table hint for READ UNCOMMITTED. Can return rows twice, skip rows, or read a half-written page.", "", "SQL Server");
  def("FOR UPDATE", "clause", "Locks the selected rows for writing until the transaction ends.",
    "The row-claiming pattern of chapter 24 — usually with SKIP LOCKED so workers do not queue behind each other.",
    "PostgreSQL / MySQL / Oracle");
  def("FOR", "keyword", "Part of FOR UPDATE, FOR JSON, FOR XML, and of procedural FOR loops.", "");
  def("SKIP LOCKED", "keyword", "Step over rows another transaction has locked instead of waiting for them.",
    "Turns a queue table into a work queue that scales with workers. Chapter 24.", "PostgreSQL / MySQL / Oracle");
  def("SKIP", "keyword", "Part of SKIP LOCKED.", "");
  def("LOCKED", "keyword", "Part of SKIP LOCKED.", "");
  def("NOWAIT", "keyword", "Fail immediately rather than wait for a lock.", "");
  def("UPDLOCK", "hint", "SQL Server hint: take an update lock while reading, so the row cannot change before you write it.", "", "SQL Server");
  def("READPAST", "hint", "SQL Server's SKIP LOCKED.", "", "SQL Server");
  def("HOLDLOCK", "hint", "SQL Server hint: hold the lock to the end of the transaction — SERIALIZABLE for one table.", "", "SQL Server");
  def("ROWLOCK", "hint", "SQL Server hint: prefer row-level locks over page or table locks.", "", "SQL Server");
  def("DEADLOCK_PRIORITY", "directive", "Which session the engine should choose as the deadlock victim.", "", "SQL Server");

  /* ========================================================== procedural === */

  def("PROCEDURE", "keyword", "A stored, named program that may take parameters and run several statements.", "");
  def("FUNCTION", "keyword", "A stored expression that returns a value.",
    "A SCALAR function in a WHERE clause is usually a per-row call and can turn a seek into a scan. Chapter 33.");
  def("RETURNS", "keyword", "Declares a function's return type.", "");
  def("RETURN", "keyword", "Produces a function's value and stops it.", "");
  def("TRIGGER", "keyword", "Code that runs automatically on insert, update or delete.",
    "It runs inside the writer's transaction, so its cost is the writer's cost, and its failure is the writer's failure.");
  def("AFTER", "keyword", "Trigger timing: run once the row change has been applied.", "");
  def("BEFORE", "keyword", "Trigger timing: run before the row change is applied, and able to alter it.", "");
  def("INSTEAD", "keyword", "INSTEAD OF trigger: replace the operation, typically to make a view writable.", "");
  def("DECLARE", "keyword", "Introduces a local variable or a cursor.", "");
  def("EXEC", "clause", "Runs a stored procedure or a dynamic SQL string.",
    "EXEC on a concatenated string is the injection hole of chapter 34. sp_executesql with parameters is not.", "SQL Server");
  def("EXECUTE", "clause", "The full spelling of EXEC. Also the PostgreSQL statement that runs a prepared plan.", "");
  def("WHILE", "keyword", "A procedural loop. In SQL, usually a sign that a set-based statement was available and was not found.", "");
  def("CURSOR", "keyword", "Row-at-a-time iteration over a result.",
    "Two to three orders of magnitude slower than the equivalent set-based statement. Justify it before you write it.");
  def("OPEN", "keyword", "Starts a cursor.", "");
  def("CLOSE", "keyword", "Releases a cursor's result.", "");
  def("DEALLOCATE", "keyword", "Frees a cursor's definition.", "", "SQL Server");
  def("FAST_FORWARD", "hint", "The cheapest cursor: read-only, forward-only.", "", "SQL Server");
  def("READ_ONLY", "hint", "A cursor that cannot be updated through.", "", "SQL Server");
  def("LOCAL", "keyword", "A cursor scoped to the batch that declared it, rather than the connection.", "", "SQL Server");
  def("THROW", "keyword", "Raises an error in T-SQL. Re-raises the current one when written bare inside CATCH.", "", "SQL Server");
  def("RAISERROR", "function", "The older T-SQL error verb, still needed for custom severities and formatted messages.", "", "SQL Server");
  def("TRY", "keyword", "BEGIN TRY: run this and jump to CATCH on error.", "", "SQL Server");
  def("CATCH", "keyword", "BEGIN CATCH: the error handler.",
    "It does NOT roll back on its own. Check XACT_STATE() and ROLLBACK explicitly, or the transaction stays open.", "SQL Server");
  def("EXCEPTION", "keyword", "The error-handling section of a PL/SQL or PL/pgSQL block.", "", "Oracle / PostgreSQL");
  def("OTHERS", "keyword", "The catch-all handler in a PL/SQL EXCEPTION block.", "", "Oracle");
  def("RAISE", "keyword", "Raises an error in PL/pgSQL or PL/SQL.", "", "PostgreSQL / Oracle");
  def("PACKAGE", "keyword", "Oracle's unit of grouped procedures and functions, with a separate specification and BODY.", "", "Oracle");
  def("BODY", "keyword", "The implementation half of an Oracle package.", "", "Oracle");
  def("LANGUAGE", "keyword", "Declares which procedural language a function body is written in.", "", "PostgreSQL");
  def("PLPGSQL", "keyword", "PostgreSQL's procedural language.", "", "PostgreSQL");
  def("GO", "directive", "Not SQL. A batch separator understood by SQL Server's client tools, which send everything above it as one batch.",
    "Variables do not survive it. A missing GO is why 'CREATE PROCEDURE must be the first statement in a batch' appears.", "SQL Server tooling");

  /* =============================================================== types ===
     Chapter 03 is the long version. What matters in a code block is: how wide
     is it, is it exact or approximate, and what does it silently convert to. */

  def("INT", "type", "A 4-byte whole number, roughly ±2.1 billion.",
    "Integer ÷ integer is INTEGER DIVISION in most engines: 7/2 is 3, not 3.5. Multiply by 1.0 first, or cast.");
  def("INTEGER", "type", "The same as INT. SQLite stores whole numbers up to 8 bytes under this name.",
    "In SQLite, INTEGER PRIMARY KEY is special: it becomes the rowid, the physical row identifier.");
  def("BIGINT", "type", "An 8-byte whole number. The right choice for a key that will outgrow 2.1 billion, and for money in the smallest unit.",
    "Widening INT to BIGINT is implicit and safe; narrowing is not, and can fail at runtime rather than at parse time.");
  def("SMALLINT", "type", "A 2-byte whole number, ±32 767.", "");
  def("TINYINT", "type", "A 1-byte whole number, 0–255 in SQL Server.", "", "SQL Server / MySQL");
  def("DECIMAL", "type", "An EXACT number with a fixed number of digits: DECIMAL(12,2) is ten digits before the point and two after.",
    "The only correct type for money. Arithmetic is exact; the scale of a result is derived by rules that can truncate, so declare enough scale.");
  def("NUMERIC", "type", "A synonym for DECIMAL in every engine that matters.", "");
  def("MONEY", "type", "SQL Server's fixed 4-decimal-place money type.",
    "Avoid it: its scale is fixed at 4, division rounds badly, and DECIMAL(19,4) says the same thing portably.", "SQL Server");
  def("FLOAT", "type", "An APPROXIMATE binary number.",
    "0.1 has no exact binary representation, so 0.1 + 0.2 <> 0.3 is TRUE. Never money, never a comparison key. Fine for measurements and averages.");
  def("REAL", "type", "A smaller approximate binary number. SQLite calls all its floats REAL.",
    "Same rounding story as FLOAT: exactness is not on offer.");
  def("DOUBLE", "type", "Double-precision approximate number — 8 bytes, about 15 significant digits.", "");
  def("PRECISION", "keyword", "Part of DOUBLE PRECISION; also the first argument of DECIMAL(p, s).", "");
  def("BIT", "type", "SQL Server's boolean: 0, 1 or NULL.", "", "SQL Server");
  def("BOOLEAN", "type", "TRUE, FALSE or NULL — three states, which is why boolean columns should usually be NOT NULL.",
    "SQL Server has no BOOLEAN type; it uses BIT. SQLite stores 0 and 1.");
  def("CHAR", "type", "Fixed-length text, space-padded to its full width.",
    "CHAR(10) holding 'AB' compares equal to 'AB' but occupies ten characters and can produce trailing-space surprises. Use it only for genuinely fixed codes.");
  def("VARCHAR", "type", "Variable-length text, one byte per character in a single-byte collation.",
    "VARCHAR(50) does not reserve 50 bytes; it stores what you put in plus a length. The number is a CONSTRAINT, not an allocation.");
  def("NVARCHAR", "type", "Variable-length Unicode text in SQL Server: two bytes per character (four for some emoji).",
    "Mixing VARCHAR and NVARCHAR in a predicate forces an implicit conversion that can disable an index seek. Chapter 07.", "SQL Server");
  def("TEXT", "type", "Unbounded text. SQLite's only string type; deprecated in SQL Server in favour of VARCHAR(MAX).",
    "Often stored off-row, so selecting it can cost an extra read even when you do not use the value.");
  def("MAX", "keyword", "In VARCHAR(MAX) / NVARCHAR(MAX): unbounded rather than a declared width. Also the aggregate MAX().", "", "SQL Server");
  def("DATE", "type", "A calendar date with no time and no timezone.", "");
  def("TIME", "type", "A time of day with no date.", "");
  def("DATETIME", "type", "Date and time, no timezone. SQL Server's legacy version rounds to about 3 milliseconds.",
    "Prefer DATETIME2 in SQL Server: DATETIME's rounding makes '23:59:59.999' become the next day.", "SQL Server / MySQL");
  def("DATETIME2", "type", "SQL Server's modern date-and-time type, with a chosen precision and no rounding surprise.", "", "SQL Server");
  def("TIMESTAMP", "type", "Date and time. In PostgreSQL, WITHOUT time zone unless you say otherwise; in SQL Server, TIMESTAMP is a ROW VERSION and not a time at all.",
    "One of the most dangerous portability traps in SQL. Say what you mean explicitly.");
  def("TIMESTAMPTZ", "type", "PostgreSQL's instant: stored as UTC, rendered in the session's timezone.",
    "It does not store a timezone — it stores a moment. Store UTC, convert at the edges. Chapter 17.", "PostgreSQL");
  def("DATETIMEOFFSET", "type", "SQL Server's instant, with the offset preserved.", "", "SQL Server");
  def("INTERVAL", "type", "A duration: INTERVAL '1 day'. Addable to a timestamp.", "", "PostgreSQL / Oracle / MySQL");
  def("ZONE", "keyword", "Part of WITH/WITHOUT TIME ZONE and of AT TIME ZONE.", "");
  def("AT TIME ZONE", "operator", "Converts an instant into a named timezone, honouring daylight saving.",
    "Use the IANA name ('Europe/Rome'), never a fixed offset: an offset is wrong for half the year.");
  def("AT", "keyword", "Part of AT TIME ZONE.", "");
  def("UUID", "type", "A 128-bit identifier. PostgreSQL's name for it.",
    "As a clustered primary key it is a write-performance problem: random values scatter inserts across every page. Chapter 26.", "PostgreSQL");
  def("UNIQUEIDENTIFIER", "type", "SQL Server's UUID.", "", "SQL Server");
  def("JSON", "type", "Text validated as JSON. In PostgreSQL it keeps the original text; JSONB parses and can be indexed.",
    "Excellent for genuinely variable attributes, terrible as a substitute for columns you filter on. Chapter 18.");
  def("JSONB", "type", "PostgreSQL's parsed, indexable binary JSON.",
    "Supports GIN indexes and the containment operator; loses key order and duplicate keys.", "PostgreSQL");
  def("XML", "type", "The previous generation's JSON, still everywhere in SQL Server estates.", "", "SQL Server");
  def("BLOB", "type", "Binary large object.", "");
  def("VARBINARY", "type", "Variable-length binary data.", "", "SQL Server");
  def("SYSNAME", "type", "SQL Server's type for object names — NVARCHAR(128). The right parameter type for dynamic SQL that takes a table name.", "", "SQL Server");
  def("ENUM", "type", "MySQL's fixed value list on a column. A CHECK constraint or a lookup table is more portable.", "", "MySQL");
  def("ARRAY", "type", "PostgreSQL's array column.", "", "PostgreSQL");
  def("NUMBER", "type", "Oracle's single numeric type, exact and arbitrary-precision.", "", "Oracle");
  def("VARCHAR2", "type", "Oracle's VARCHAR.", "", "Oracle");
  def("TRUE", "literal", "The boolean true.", "");
  def("FALSE", "literal", "The boolean false.", "");
  def("UNKNOWN", "literal", "The third truth value, produced by any comparison with NULL.",
    "WHERE keeps only TRUE, so UNKNOWN behaves like FALSE there — but NOT UNKNOWN is still UNKNOWN, which is where the surprises live.");

  /* =========================================================== functions ===
     Aggregates first, because their NULL behaviour is the most-tested corner of
     the whole language. */

  def("COUNT", "function", "Counts rows.",
    "COUNT(*) counts ROWS and is never NULL. COUNT(col) counts NON-NULL VALUES of that column. COUNT(DISTINCT col) counts distinct non-null values. Returns 0 over no rows.");
  def("SUM", "function", "Adds values.",
    "IGNORES NULLs, and returns NULL — not 0 — when every input is NULL or there are no rows. Wrap it in COALESCE when a total must be a number.");
  def("AVG", "function", "The mean of the non-null values.",
    "The divisor is the count of NON-NULL values, not the number of rows. AVG over integers does integer division in some engines: AVG(x * 1.0) is the safe spelling.");
  def("MIN", "function", "The smallest non-null value.", "Comparison uses the column's type rules: text by collation, numbers by value, dates chronologically.");
  def("MAX", "function", "The largest non-null value.", "Returns NULL over an empty set, like every aggregate but COUNT.");
  def("STRING_AGG", "function", "Concatenates values from many rows into one delimited string.", "", "SQL Server / PostgreSQL");
  def("GROUP_CONCAT", "function", "MySQL's and SQLite's STRING_AGG.", "", "MySQL / SQLite");
  def("ARRAY_AGG", "function", "Collects values from many rows into an array.", "", "PostgreSQL");
  def("GROUPING", "function", "Tells a real NULL from a ROLLUP subtotal marker: returns 1 for the subtotal row.", "");

  def("ROW_NUMBER", "function", "Numbers rows 1, 2, 3 … inside each partition, with no ties.",
    "Returns BIGINT. Two identical rows still get different numbers, so the ORDER BY needs a tie-breaker or the numbering is arbitrary between runs.");
  def("RANK", "function", "Ranks with ties sharing a number, then SKIPPING: 1, 1, 3.", "Returns BIGINT.");
  def("DENSE_RANK", "function", "Ranks with ties sharing a number and NO gap: 1, 1, 2.",
    "The right function for 'the second highest salary', which means the second distinct VALUE.");
  def("NTILE", "function", "Splits the partition into n buckets and labels each row with its bucket.", "");
  def("LAG", "function", "The value from a previous row of the same partition.",
    "Returns NULL at the first row unless a third argument gives a default: LAG(x, 1, 0). That NULL is why period-on-period growth needs NULLIF.");
  def("LEAD", "function", "The value from a following row of the same partition.", "NULL at the last row, for the same reason.");
  def("FIRST_VALUE", "function", "The first value in the frame.",
    "Frame-sensitive: with the default RANGE frame it means 'first so far', which is usually what you wanted. LAST_VALUE with the same default is usually not.");
  def("LAST_VALUE", "function", "The last value in the frame.",
    "Almost always needs an explicit ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING, or it just returns the current row.");
  def("NTH_VALUE", "function", "The nth value in the frame.", "");
  def("PERCENT_RANK", "function", "The row's relative rank as a fraction between 0 and 1.", "");
  def("CUME_DIST", "function", "The cumulative distribution: what fraction of rows are at or before this one.", "");

  def("COALESCE", "function", "Returns the first argument that is not NULL.",
    "Standard, variadic, and short-circuits. The result type is the widest of the arguments, so COALESCE(int_col, 'n/a') is a conversion error, not a fallback.");
  def("NULLIF", "function", "Returns NULL when the two arguments are equal, otherwise the first.",
    "The idiomatic division guard: x / NULLIF(y, 0) yields NULL instead of raising a divide-by-zero.");
  def("ISNULL", "function", "SQL Server's two-argument COALESCE.",
    "Not the same: its result type is the FIRST argument's, so ISNULL(varchar5_col, 'unknown') silently truncates to five characters.", "SQL Server");
  def("IFNULL", "function", "MySQL's and SQLite's two-argument COALESCE.", "", "MySQL / SQLite");
  def("IIF", "function", "SQL Server's inline if. A two-branch CASE with a shorter spelling.", "", "SQL Server");

  def("CAST", "function", "Converts a value to another type: CAST(x AS DECIMAL(12,2)).",
    "Standard and portable. It RAISES an error on a value it cannot convert — which is a feature: silent conversion failures are worse.");
  def("CONVERT", "function", "SQL Server's CAST, with a style number for dates: CONVERT(varchar, d, 23).", "", "SQL Server");
  def("TRY_CAST", "function", "CAST that returns NULL instead of raising when the value will not convert.", "", "SQL Server / PostgreSQL 16+");
  def("TRY_CONVERT", "function", "CONVERT that returns NULL instead of raising.", "", "SQL Server");
  def("PARSE", "function", "Culture-aware text-to-value conversion in SQL Server. Slow; avoid it in a WHERE clause.", "", "SQL Server");

  def("ROUND", "function", "Rounds to a number of decimal places.",
    "Rounding a FLOAT cannot fix a FLOAT: the value was never exact. Round DECIMALs, and round once, at the edge of the system.");
  def("CEIL", "function", "Rounds up to a whole number.", "");
  def("CEILING", "function", "Rounds up to a whole number. SQL Server's spelling.", "");
  def("FLOOR", "function", "Rounds down to a whole number.", "");
  def("ABS", "function", "Absolute value.", "");
  def("POWER", "function", "Raises to a power.", "");
  def("SQRT", "function", "Square root.", "");
  def("MOD", "function", "Remainder after division. The operator % says the same thing in most engines.", "");
  def("SIGN", "function", "-1, 0 or 1 according to the sign of the argument.", "");
  def("RANDOM", "function", "A pseudo-random number. Non-deterministic, so it cannot be used in a computed column or an index.", "", "PostgreSQL / SQLite");
  def("RAND", "function", "SQL Server's RANDOM.", "", "SQL Server / MySQL");
  def("NEWID", "function", "A random UUID in SQL Server. Random ordering, so as a clustered key it scatters writes.", "", "SQL Server");
  def("NEWSEQUENTIALID", "function", "A UUID that increases, so inserts stay at the end of the index instead of scattering.", "", "SQL Server");
  def("GEN_RANDOM_UUID", "function", "PostgreSQL's random UUID generator.", "", "PostgreSQL");

  def("LOWER", "function", "Lower-cases text.",
    "LOWER(email) = 'x' in a WHERE clause is NOT SARGABLE: the index is on email, not on LOWER(email). Store the case you want, or index the expression.");
  def("UPPER", "function", "Upper-cases text. Same sargability warning as LOWER.", "");
  def("TRIM", "function", "Removes leading and trailing whitespace, or a named character.", "");
  def("LTRIM", "function", "Removes leading whitespace.", "");
  def("RTRIM", "function", "Removes trailing whitespace.", "");
  def("LENGTH", "function", "The number of characters. SQLite and PostgreSQL spell it LENGTH.",
    "Characters, not bytes — LENGTH('è') is 1 while its UTF-8 encoding is 2 bytes.");
  def("LEN", "function", "SQL Server's LENGTH. It IGNORES trailing spaces, which LENGTH does not.", "", "SQL Server");
  def("SUBSTRING", "function", "A slice of a string, 1-indexed: SUBSTRING(s, 1, 120).",
    "SQL is 1-indexed here, unlike every language you write the application in.");
  def("SUBSTR", "function", "SQLite's and Oracle's SUBSTRING.", "", "SQLite / Oracle");
  def("LEFT", "function", "The first n characters. (In a join, LEFT is a keyword, not this function.)", "");
  def("RIGHT", "function", "The last n characters.", "");
  def("REPLACE", "function", "Replaces every occurrence of a substring.", "");
  def("CONCAT", "function", "Joins strings, treating NULL as an empty string.",
    "That is the difference from ||: 'a' || NULL is NULL, while CONCAT('a', NULL) is 'a'.");
  def("CONCAT_WS", "function", "CONCAT with a separator between the parts.", "");
  def("POSITION", "function", "The index of a substring, 1-based, 0 when absent.", "");
  def("CHARINDEX", "function", "SQL Server's POSITION, with the arguments the other way round.", "", "SQL Server");
  def("LPAD", "function", "Pads on the left to a given width.", "", "PostgreSQL / MySQL / Oracle");
  def("FORMAT", "function", "Formats a value as text by a pattern. Also FORMAT TEXT/JSON in PostgreSQL's EXPLAIN.",
    "In SQL Server it is notoriously slow per row: fine for a dozen rows, not for a million.");
  def("QUOTENAME", "function", "Wraps an identifier in brackets and escapes it. The ONLY safe way to put a table or column NAME into dynamic SQL.",
    "It does not make VALUES safe — those still need parameters. Chapter 34.", "SQL Server");
  def("UNNEST", "function", "Expands an array into rows.", "", "PostgreSQL");
  def("CARDINALITY", "function", "The number of elements in an array.", "", "PostgreSQL");
  def("GENERATE_SERIES", "function", "Produces a series of numbers or timestamps as rows. The calendar-table generator.", "", "PostgreSQL");

  def("NOW", "function", "The current timestamp. In PostgreSQL it is the TRANSACTION's start time, not the statement's.", "", "PostgreSQL / MySQL");
  def("CURRENT_TIMESTAMP", "function", "The standard spelling of NOW().", "");
  def("CURRENT_DATE", "function", "Today's date.", "");
  def("GETDATE", "function", "SQL Server's local server time. Prefer SYSUTCDATETIME().", "", "SQL Server");
  def("GETUTCDATE", "function", "SQL Server's UTC time, at DATETIME's ~3 ms precision.", "", "SQL Server");
  def("SYSUTCDATETIME", "function", "SQL Server's UTC time at full DATETIME2 precision. The right default for a stored timestamp.", "", "SQL Server");
  def("SYSDATETIME", "function", "SQL Server's local time at full precision.", "", "SQL Server");
  def("SYSTIMESTAMP", "function", "Oracle's current timestamp with timezone.", "", "Oracle");
  def("DATEADD", "function", "Adds an interval to a date: DATEADD(day, -7, d).", "", "SQL Server");
  def("DATEDIFF", "function", "Counts BOUNDARIES crossed between two dates, not elapsed time.",
    "DATEDIFF(year, '2025-12-31', '2026-01-01') is 1, one day apart. Rarely the answer to 'how old is this'.", "SQL Server / MySQL");
  def("DATEPART", "function", "Extracts one component of a date.", "", "SQL Server");
  def("DATE_TRUNC", "function", "Truncates a timestamp down to a unit: date_trunc('month', t).",
    "The sargable way to group by month: it appears in SELECT and GROUP BY, and the WHERE clause still uses a plain range on the raw column.",
    "PostgreSQL");
  def("EXTRACT", "function", "The standard component extractor: EXTRACT(YEAR FROM t).", "");
  def("YEAR", "function", "The year part of a date. As a WHERE predicate — WHERE YEAR(d) = 2026 — it disables the index on d.", "");
  def("MONTH", "function", "The month part of a date. Same sargability warning as YEAR().", "");
  def("DAY", "function", "The day part of a date.", "");
  def("STRFTIME", "function", "SQLite's date formatter and extractor: strftime('%Y-%m', t) gives '2026-03'.",
    "Returns TEXT, always. Grouping by it groups by a string, which sorts correctly only because ISO-8601 was designed that way.", "SQLite");
  def("JULIANDAY", "function", "SQLite's days-since-4713-BC number, which makes date arithmetic subtraction.",
    "Returns REAL. julianday(a) - julianday(b) is a difference in days, fractions included.", "SQLite");
  def("DATE_FN", "function", "SQLite's date() — truncates a timestamp to its date part and returns TEXT.", "", "SQLite");
  def("DATETIME_FN", "function", "SQLite's datetime() — normalises and formats a timestamp as TEXT.", "", "SQLite");

  def("JSON_VALUE", "function", "Extracts a SCALAR from JSON by path.",
    "Returns text; CAST it before comparing to a number, or the comparison is a string comparison and the index will not help.", "SQL Server / Oracle");
  def("JSON_QUERY", "function", "Extracts an OBJECT or ARRAY from JSON by path. Returns NULL for a scalar, which is the difference from JSON_VALUE.", "", "SQL Server");
  def("ISJSON", "function", "Tests whether text is valid JSON. The basis of a CHECK constraint on a JSON column.", "", "SQL Server");
  def("OPENJSON", "function", "Turns JSON into rows and columns in SQL Server, with a WITH clause declaring the shape.", "", "SQL Server");
  def("JSON_MODIFY", "function", "Returns JSON with one path changed. It returns a new document; it does not edit in place.", "", "SQL Server");
  def("JSON_EXTRACT", "function", "SQLite's and MySQL's JSON path extractor; the -> and ->> operators are shorthand for it.", "", "SQLite / MySQL");
  def("JSON_ARRAY_LENGTH", "function", "The number of elements in a JSON array.", "", "SQLite");
  def("JSONB_ARRAY_LENGTH", "function", "The number of elements in a JSONB array.", "", "PostgreSQL");
  def("JSONB_ARRAY_ELEMENTS_TEXT", "function", "Expands a JSONB array into one text row per element.", "", "PostgreSQL");
  def("JSON_BUILD_OBJECT", "function", "Builds a JSON object from alternating keys and values.", "", "PostgreSQL");
  def("JSON_EACH", "function", "Expands a JSON object or array into rows.", "", "SQLite / PostgreSQL");
  def("ORDINALITY", "keyword", "WITH ORDINALITY adds the element's position when expanding an array or JSON into rows.", "", "PostgreSQL");
  def("PATH", "keyword", "In OPENJSON … WITH, the JSON path a column is read from. Also FOR JSON PATH.", "", "SQL Server");
  def("EMPTY", "keyword", "Part of PostgreSQL's JSON_TABLE / xmltable error handling, and of 'ON EMPTY' clauses.", "");
  def("WITHOUT_ARRAY_WRAPPER", "directive", "FOR JSON option: emit a single object rather than an array of one.", "", "SQL Server");

  /* =========================================================== operators ===
     Written as they appear in code. codex.js matches these separately from
     words, because a symbol has no word boundary to anchor on. */

  def("=", "operator", "Equality. In UPDATE … SET it is assignment instead.",
    "Comparing anything to NULL yields UNKNOWN, never TRUE — that is why x = NULL never matches.");
  def("<>", "operator", "Not equal. The standard spelling.", "UNKNOWN when either side is NULL, so a <> b does NOT return rows where b is null.");
  def("!=", "operator", "Not equal. Accepted everywhere, standard nowhere.", "");
  def("<", "operator", "Less than.", "");
  def(">", "operator", "Greater than.", "");
  def("<=", "operator", "Less than or equal.", "");
  def(">=", "operator", "Greater than or equal.",
    "A half-open range — >= start AND < end — is the correct way to filter a day or a month, and stays index-friendly.");
  def("+", "operator", "Addition. In SQL Server, also string concatenation.",
    "Adding an INT and a DECIMAL widens to DECIMAL. Adding anything to NULL gives NULL.");
  def("-", "operator", "Subtraction, or unary minus.", "Date minus date is a number of days in PostgreSQL and an INTERVAL-like value elsewhere; engines differ, so check.");
  def("*", "operator", "Multiplication. In SELECT *, the wildcard 'every column'.",
    "SELECT * in production code is a defect: the column set changes under you, and it defeats covering indexes.");
  def("/", "operator", "Division.",
    "INTEGER ÷ INTEGER truncates in SQL Server, PostgreSQL and MySQL: 7/2 is 3. total_cents/100 loses the cents; total_cents/100.0 does not, because one REAL operand widens the whole expression.");
  def("%", "operator", "Modulo — the remainder. Inside a LIKE pattern it is the multi-character wildcard instead.", "");
  def("||", "operator", "String concatenation in the standard, PostgreSQL, SQLite and Oracle.",
    "NULL || anything is NULL. Use CONCAT() when a NULL should behave as an empty string.");
  def("::", "operator", "PostgreSQL's short cast: value::numeric.", "Identical in effect to CAST(value AS numeric).", "PostgreSQL");
  def("->", "operator", "JSON member access returning JSON.", "Chains: doc -> 'a' -> 'b'. The result is still JSON, so compare it to JSON, not to text.", "PostgreSQL / MySQL / SQLite");
  def("->>", "operator", "JSON member access returning TEXT.",
    "This is the one you compare against a string. Cast it before comparing to a number.", "PostgreSQL / MySQL / SQLite");
  def("@>", "operator", "JSONB containment: does the left document contain the right one?",
    "The operator a GIN index can accelerate, which is why it is the right way to filter JSONB.", "PostgreSQL");
  def("@@", "variable", "The prefix of T-SQL's global session variables — @@ROWCOUNT, @@TRANCOUNT, @@FETCH_STATUS.", "", "SQL Server");
  def("@", "variable", "The prefix of a T-SQL variable or parameter — and, in application code, of a bound PARAMETER.",
    "A parameter is not string interpolation: the value never becomes part of the SQL text, which is why parameters end SQL injection rather than merely discouraging it.");
  def(":", "variable", "The named-parameter prefix in Oracle, PostgreSQL drivers and JDBC.", "");
  def("?", "variable", "The positional parameter placeholder in ODBC, JDBC and SQLite drivers.", "");
  def(";", "punctuation", "Ends a statement. Required between statements in a script, and good practice everywhere.", "");
  def("--", "comment", "A comment to the end of the line. The annotation style used throughout this course.", "");
  def("/*", "comment", "Opens a block comment, closed by */.", "");

  /* ==================================================== plans & diagnosis === */

  def("EXPLAIN", "clause", "Shows the plan the optimiser chose, without running the query.",
    "A plan is an ESTIMATE until you run it: the row counts are the optimiser's guesses. Compare estimated with actual — a large gap is the diagnosis.");
  def("ANALYZE", "keyword", "In PostgreSQL's EXPLAIN, actually RUN the query and report real timings and row counts. As a statement of its own, refresh a table's statistics.",
    "EXPLAIN ANALYZE executes the statement. Never run it on an UPDATE or DELETE outside a transaction you intend to roll back.");
  def("BUFFERS", "keyword", "EXPLAIN option: report how many pages came from cache and how many from disk.", "", "PostgreSQL");
  def("QUERY PLAN", "keyword", "SQLite's EXPLAIN QUERY PLAN: says SCAN or SEARCH, and which index.",
    "SCAN means every row was read. SEARCH … USING INDEX means the engine jumped straight to the rows. That difference is the whole of chapter 07.",
    "SQLite");
  def("QUERY", "keyword", "Part of EXPLAIN QUERY PLAN.", "", "SQLite");
  def("PLAN", "keyword", "Part of EXPLAIN QUERY PLAN, and of 'execution plan' generally.", "");
  def("STATISTICS", "keyword", "SET STATISTICS IO, TIME ON: logical reads and CPU per statement. Often diagnosis enough on its own.",
    "Logical reads count 8 KB pages touched. It is the one number that does not vary with cache warmth or a busy server.", "SQL Server");
  def("IO", "keyword", "Part of SET STATISTICS IO.", "", "SQL Server");
  def("SHOWPLAN_ALL", "directive", "SQL Server: return the estimated plan as rows instead of executing.", "", "SQL Server");
  def("DBCC", "clause", "SQL Server's database console commands — SHOW_STATISTICS, CHECKDB, FREEPROCCACHE.", "", "SQL Server");
  def("SHOW_STATISTICS", "directive", "DBCC SHOW_STATISTICS: the histogram the optimiser is actually using.", "", "SQL Server");
  def("FULLSCAN", "keyword", "Update statistics by reading every row rather than sampling.", "", "SQL Server");
  def("RECOMPILE", "hint", "Compile a fresh plan for this execution instead of reusing a cached one. The targeted fix for parameter sniffing.", "", "SQL Server");
  def("OPTIMIZE", "hint", "OPTION (OPTIMIZE FOR …): compile as though a parameter had a stated value.", "", "SQL Server");
  def("OPTION", "keyword", "Introduces a query hint in T-SQL: OPTION (RECOMPILE).", "", "SQL Server");
  def("MAXDOP", "hint", "Caps the degree of parallelism for a statement.", "", "SQL Server");
  def("SHOW", "clause", "MySQL's introspection verb — SHOW ENGINE INNODB STATUS, SHOW INDEX.", "", "MySQL");
  def("ENGINE", "keyword", "Part of SHOW ENGINE INNODB STATUS, and of MySQL's table ENGINE= clause.", "", "MySQL");
  def("INNODB", "keyword", "MySQL's transactional storage engine. Its status output holds the last deadlock.", "", "MySQL");
  def("STATUS", "keyword", "Part of SHOW ENGINE INNODB STATUS.", "", "MySQL");
  def("DBMS_XPLAN", "function", "Oracle's plan display package: DBMS_XPLAN.DISPLAY.", "", "Oracle");
  def("DISPLAY", "function", "The DBMS_XPLAN procedure that prints the plan.", "", "Oracle");
  def("PG_STAT_STATEMENTS", "tool", "PostgreSQL's per-statement aggregate: calls, total time, rows.",
    "Sort by TOTAL time, never by mean: the query that runs ten thousand times at 8 ms is the problem, not the one that runs nightly at 4 s.", "PostgreSQL");
  def("PG_BLOCKING_PIDS", "function", "Which sessions are blocking this one.", "", "PostgreSQL");
  def("PG_RELATION_SIZE", "function", "The size of a table or index in bytes.", "", "PostgreSQL");
  def("PG_SIZE_PRETTY", "function", "Formats a byte count as human-readable text.", "", "PostgreSQL");
  def("PG_LOCKS", "tool", "PostgreSQL's live lock view.", "", "PostgreSQL");
  def("SYS", "keyword", "The SQL Server schema holding the system views and dynamic management views.", "", "SQL Server");
  def("DM_OS_WAIT_STATS", "tool", "SQL Server: what the server has been WAITING on since the last restart. The first question in any performance triage.", "", "SQL Server");
  def("DM_EXEC_REQUESTS", "tool", "SQL Server: what is running right now, and who is blocked by whom.", "", "SQL Server");
  def("DM_EXEC_SQL_TEXT", "function", "SQL Server: the statement text behind a handle. Used with CROSS APPLY.", "", "SQL Server");
  def("DM_EXEC_QUERY_STATS", "tool", "SQL Server: aggregate cost per cached plan.", "", "SQL Server");
  def("DM_DB_INDEX_USAGE_STATS", "tool", "SQL Server: which indexes are read, and which are only ever written to.", "", "SQL Server");
  def("DB_NAME", "function", "The database name for an id.", "", "SQL Server");
  def("DB_ID", "function", "The id for a database name.", "", "SQL Server");
  def("OBJECT_NAME", "function", "The object name for an id.", "", "SQL Server");
  def("SP_EXECUTESQL", "function", "SQL Server's parameterised dynamic SQL. The safe half of chapter 34.",
    "It takes a parameter DECLARATION string and the values separately, so the values never enter the SQL text.", "SQL Server");
  def("SP_WHO2", "tool", "SQL Server's who-is-connected list. Superseded by the DMVs but still the fastest first look.", "", "SQL Server");

  /* ============================================================ security === */

  def("GRANT", "clause", "Gives a privilege to a role or user.",
    "Grant to ROLES, never to people: a role survives the leaver, and it is the only version you can audit.");
  def("REVOKE", "clause", "Takes a privilege away.", "");
  def("ROLE", "keyword", "A named bundle of privileges that users are added to.", "");
  def("SECURITY", "keyword", "Part of CREATE SECURITY POLICY (row-level security) and of SECURITY DEFINER functions.", "");
  def("POLICY", "keyword", "The object that binds a row-level-security predicate to a table.", "");
  def("PREDICATE", "keyword", "In row-level security, the function deciding which rows a session may see.", "");
  def("MASKED", "keyword", "Dynamic data masking: show a redacted value to users without the unmask privilege.",
    "It hides a value on the way out. It is not encryption and not a permission boundary.", "SQL Server");
  def("SUSER_SNAME", "function", "The current login name in SQL Server. The audit column's default.", "", "SQL Server");
  def("CURRENT_USER", "function", "The current database user.", "");
  def("SESSION_USER", "function", "The session's user, which can differ from CURRENT_USER inside a SECURITY DEFINER function.", "");
  def("CURRENT_SETTING", "function", "Reads a session setting in PostgreSQL — how an application passes a tenant id into a row-level-security policy.", "", "PostgreSQL");
  def("SET_CONFIG", "function", "Writes a session setting in PostgreSQL.", "", "PostgreSQL");
  def("HASHBYTES", "function", "SQL Server's hash function. For passwords, a general-purpose hash is the wrong tool — use a slow KDF outside the database.", "", "SQL Server");
  def("MD5", "function", "A hash function. Fine as a checksum, unacceptable for passwords or signatures.", "");

  /* =================================================== backup and uptime === */

  def("BACKUP", "clause", "Writes a copy of the database or its log to a device.",
    "A backup you have never restored is a hypothesis. Chapter 41.", "SQL Server");
  def("RESTORE", "clause", "Rebuilds a database from backups.",
    "The order is full, then differential, then every log to the target moment — every step but the last WITH NORECOVERY.", "SQL Server");
  def("DISK", "keyword", "The device clause of BACKUP/RESTORE: TO DISK = '…'.", "", "SQL Server");
  def("NORECOVERY", "keyword", "Leave the database in a restoring state so more backups can be applied.",
    "Forget it on an intermediate step and the restore chain is broken: you start again from the full backup.", "SQL Server");
  def("RECOVERY", "keyword", "Finish the restore and open the database. Also the RECOVERY MODEL — FULL, BULK_LOGGED or SIMPLE.", "", "SQL Server");
  def("DIFFERENTIAL", "keyword", "A backup of everything changed since the last FULL backup.", "", "SQL Server");
  def("STOPAT", "keyword", "Point-in-time recovery: replay the log only up to this moment. The undo for a mistaken DELETE.", "", "SQL Server");
  def("LOG", "keyword", "The write-ahead log: the durability mechanism, and what point-in-time recovery replays.", "");
  def("CHECKPOINT", "keyword", "Flushes dirty pages to the data file so the log can be reused or truncated.", "");
  def("RPO", "keyword", "Recovery Point Objective — how much data you accept losing. It is a business decision, and it dictates the backup schedule.", "");
  def("RTO", "keyword", "Recovery Time Objective — how long you accept being down. It dictates the restore ARCHITECTURE, not the backup.", "");
  def("PARTITION", "keyword", "Splits one table into physical parts by a key range. Also PARTITION BY in a window function.",
    "The operational win is SWITCH/DETACH: dropping a month becomes a metadata change instead of a DELETE of millions of rows.");
  def("SWITCH", "keyword", "Moves a partition between tables as a metadata operation — instant, and no logged deletes.", "", "SQL Server");
  def("DETACH", "keyword", "Removes a partition from a partitioned table, leaving it as a table of its own.", "", "PostgreSQL");
  def("ATTACH", "keyword", "Adds an existing table as a partition. Also SQLite's ATTACH DATABASE.", "");
  def("REFRESH", "clause", "REFRESH MATERIALIZED VIEW: recompute a stored view's data.",
    "CONCURRENTLY keeps it readable while it rebuilds, and requires a unique index on the view.", "PostgreSQL");
  def("CONCURRENTLY", "keyword", "Build or refresh without taking a blocking lock. Slower, and the only version safe on a live table.", "", "PostgreSQL");
  def("VACUUM", "clause", "PostgreSQL's space reclaimer and statistics updater.", "", "PostgreSQL");
  def("REINDEX", "clause", "Rebuilds an index.", "");
  def("REBUILD", "keyword", "Rebuilds an index, optionally ONLINE.", "", "SQL Server");
  def("ONLINE", "keyword", "Perform the operation without blocking readers and writers. Editions and engines differ on what qualifies.", "");

  /* ============================================ application-side tokens ===
     A few chapters show the code on the OTHER side of the boundary. These are
     here so those blocks get the same treatment as the SQL ones. */

  def("VAR", "keyword", "C#: a local variable whose type the compiler infers.", "", "C#");
  def("FOREACH", "keyword", "C#: iterate a collection. Around a database call, it is usually the N+1 of chapter 38.", "", "C#");
  def("TOLIST", "function", "LINQ: run the query NOW and materialise the rows.",
    "Until this call the query is an expression tree, not SQL. Where you place it decides what runs on the server and what runs in memory.", "EF Core / LINQ");
  def("WHERE_LINQ", "function", "LINQ .Where(): adds a predicate to the expression tree, translated to SQL WHERE — if it can be translated.", "", "EF Core / LINQ");
  def("INCLUDE_LINQ", "function", "EF Core .Include(): eager-load a navigation property.",
    "Two .Include()s on sibling collections produce ONE query with two joins — the fan-out of chapter 08, over the wire. AsSplitQuery() is the fix.", "EF Core");
  def("ASNOTRACKING", "function", "EF Core: skip change tracking for a read-only query. Less memory, no accidental writes.", "", "EF Core");
  def("ASSPLITQUERY", "function", "EF Core: fetch each included collection as its own query instead of one fanned-out join.", "", "EF Core");
  def("FROMSQL", "function", "EF Core: drop to raw SQL, parameterised. The escape hatch chapter 38 argues for.", "", "EF Core");
  def("CONSOLE", "keyword", "C#'s console class; Console.WriteLine prints a line.", "", "C#");

  root.SYNTAX = S;
  root.SYNTAX_PHRASES = null;   /* built lazily, once, by codex.js */
})(self);
