-- DEMO 02 · One NULL, and NOT IN returns nothing
-- Covered in: site/chapters/09-null-and-three-valued-logic.html

.headers on
.mode column

DROP TABLE IF EXISTS demo_null;
CREATE TABLE demo_null (id INTEGER, ref INTEGER);
INSERT INTO demo_null VALUES (1, 10), (2, 20), (3, NULL);   -- ← the one null

-- Correct: three customers exist whose ids are not 10 or 20.
SELECT 'NOT IN over non-null values' AS which, COUNT(*) AS rows_returned
FROM customers WHERE id NOT IN (SELECT ref FROM demo_null WHERE ref IS NOT NULL);

-- The same question, with the null left in. NOT an error — an EMPTY RESULT.
SELECT 'NOT IN with one NULL' AS which, COUNT(*) AS rows_returned
FROM customers WHERE id NOT IN (SELECT ref FROM demo_null);

-- NOT EXISTS is null-safe and gives the right answer either way.
SELECT 'NOT EXISTS' AS which, COUNT(*) AS rows_returned
FROM customers c WHERE NOT EXISTS (SELECT 1 FROM demo_null d WHERE d.ref = c.id);

-- Why: x NOT IN (10, 20, NULL) expands to
--   x <> 10 AND x <> 20 AND x <> NULL
-- and the last term is UNKNOWN, so the conjunction can never be TRUE.
SELECT 1 = NULL AS eq, 1 <> NULL AS neq, (1 = NULL) IS NULL AS both_are_unknown;

-- And the aggregate difference, on the same rows:
SELECT COUNT(*) AS count_star, COUNT(ref) AS count_column,
       SUM(ref) AS sum_, AVG(ref) AS avg_  -- AVG divides by 2, not 3
FROM demo_null;

DROP TABLE demo_null;
