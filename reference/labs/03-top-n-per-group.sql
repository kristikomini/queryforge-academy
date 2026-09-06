-- LAB 03 · Top-N per group, deterministically
--
-- Covered in: site/chapters/13-window-functions.html
--
-- Return the MOST RECENT order for each customer: exactly one row per customer
-- that has any orders, and the result must be the SAME on every run.
--
-- The naive version below is wrong in two different ways. Find both.

.headers on
.mode column

-- Wrong version 1: MAX() does not carry the rest of the row with it.
SELECT customer_id, MAX(placed_at) AS latest, id, total_cents
FROM orders GROUP BY customer_id LIMIT 5;
-- ^ which id is that? SQLite picks one. Standard SQL rejects the query entirely.

-- ---------------------------------------------------------------------------
-- YOUR TURN.
DROP VIEW IF EXISTS latest_order;
CREATE VIEW latest_order AS
  SELECT customer_id, id AS order_id, placed_at, total_cents
  FROM orders;              -- ← replace this
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- ASSERTION ---
SELECT CASE
  WHEN (SELECT COUNT(*) FROM latest_order)
     <> (SELECT COUNT(DISTINCT customer_id) FROM orders)
    THEN 'FAIL: expected exactly one row per customer with orders'
  WHEN EXISTS (
        SELECT 1 FROM latest_order lo
        JOIN orders o ON o.customer_id = lo.customer_id
        WHERE o.placed_at > lo.placed_at)
    THEN 'FAIL: some customer has a later order than the one you returned'
  ELSE 'PASS'
END AS result;

-- And then answer this, in a comment: if two orders share the exact same
-- placed_at, what guarantees your query returns the same one tomorrow?
