-- LAB 04 · Gaps and islands
--
-- Covered in: site/chapters/14-frames-and-islands.html
--
-- Find every run of CONSECUTIVE CALENDAR DAYS on which at least one order was
-- placed. Return the first day, the last day and the length, longest first.
--
-- The classic technique: number the distinct days in order, subtract the row
-- number from the day, and group by the difference — it is constant within a run.

.headers on
.mode column

-- The raw material:
SELECT date(placed_at) AS d, COUNT(*) AS n
FROM orders GROUP BY d ORDER BY d LIMIT 10;

-- ---------------------------------------------------------------------------
-- YOUR TURN.
DROP VIEW IF EXISTS runs;
CREATE VIEW runs AS
  SELECT date(placed_at) AS run_start, date(placed_at) AS run_end, 1 AS days
  FROM orders;              -- ← replace this
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- ASSERTION ---
-- Every day that has an order must fall inside exactly one run, and no two runs
-- may be adjacent (or they would be one run).
SELECT CASE
  WHEN EXISTS (
        SELECT 1 FROM (SELECT DISTINCT date(placed_at) d FROM orders) x
        WHERE NOT EXISTS (SELECT 1 FROM runs r WHERE x.d BETWEEN r.run_start AND r.run_end))
    THEN 'FAIL: some order day is not inside any run'
  WHEN EXISTS (
        SELECT 1 FROM runs a JOIN runs b
        ON date(a.run_end, '+1 day') = b.run_start)
    THEN 'FAIL: two runs are adjacent — they should be one run'
  WHEN (SELECT SUM(days) FROM runs)
     <> (SELECT COUNT(DISTINCT date(placed_at)) FROM orders)
    THEN 'FAIL: the run lengths do not add up to the number of distinct days'
  ELSE 'PASS'
END AS result;
