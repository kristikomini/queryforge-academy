-- LAB · Schema invariants
--
-- Covered in: site/chapters/37-testing-sql.html
--
-- Rules a schema should hold, asserted from the catalogue. These run in about a
-- second and catch the class of mistake code review misses. CI runs this file.
--
-- Written for SQLite so it runs with no install; the PostgreSQL and SQL Server
-- equivalents are in chapter 37.

.headers on
.mode column

-- 1 · Every table has a primary key. -----------------------------------------
SELECT 'no primary key' AS violation, m.name AS object
FROM sqlite_master m
WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
  AND NOT EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE pk > 0);

-- 2 · No monetary column is a floating-point type. ---------------------------
--     Covered in: site/chapters/03-data-types.html
SELECT 'float money' AS violation, m.name || '.' || p.name AS object
FROM sqlite_master m
JOIN pragma_table_info(m.name) p
WHERE m.type = 'table'
  AND (p.name LIKE '%price%' OR p.name LIKE '%amount%' OR p.name LIKE '%total%'
       OR p.name LIKE '%cents%' OR p.name LIKE '%salary%')
  AND UPPER(p.type) IN ('REAL', 'FLOAT', 'DOUBLE');

-- 3 · Every foreign key column has an index whose FIRST column is that column.
--     This is the one that matters most: without it, deleting a parent row
--     scans the whole child table and holds locks while it does.
--     Covered in: site/chapters/04-ddl-and-constraints.html
SELECT 'unindexed foreign key' AS violation, m.name || '.' || fk."from" AS object
FROM sqlite_master m
JOIN pragma_foreign_key_list(m.name) fk
WHERE m.type = 'table' AND m.name NOT LIKE 'sqlite_%'
  AND NOT EXISTS (
    SELECT 1
    FROM pragma_index_list(m.name) il
    JOIN pragma_index_info(il.name) ii ON ii.seqno = 0
    WHERE ii.name = fk."from")
  -- A column that is itself the first column of the primary key is already
  -- indexed by it.
  AND NOT EXISTS (
    SELECT 1 FROM pragma_table_info(m.name) ti
    WHERE ti.name = fk."from" AND ti.pk = 1);

-- 4 · Every CHECK-constrained status column is also NOT NULL. ----------------
--     A nullable status means the state machine has a state nobody named.
SELECT 'nullable status' AS violation, m.name || '.' || p.name AS object
FROM sqlite_master m
JOIN pragma_table_info(m.name) p
WHERE m.type = 'table' AND p.name = 'status' AND p."notnull" = 0;

-- --------------------------------------------------------------- SUMMARY ---
SELECT CASE WHEN (
  (SELECT COUNT(*) FROM sqlite_master m WHERE m.type='table' AND m.name NOT LIKE 'sqlite_%'
     AND NOT EXISTS (SELECT 1 FROM pragma_table_info(m.name) WHERE pk > 0))
) = 0 THEN 'PASS: every table has a primary key'
  ELSE 'FAIL: a table has no primary key' END AS result;
