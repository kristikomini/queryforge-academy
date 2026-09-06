-- LAB 01 · Find the fan-out
--
-- Covered in: site/chapters/08-joins.html
--
-- THE TICKET: "The invoice summary shows order 3 as EUR 141.00 but the invoice
-- itself says EUR 47.00. The report has been wrong since we added payments."
--
-- Run this file. The assertion at the bottom FAILS until you fix the query.
--   sqlite3 reference/forge.db < reference/labs/01-find-the-fanout.sql

.headers on
.mode column

-- The broken report. Do not change this one; it is the evidence.
SELECT 'BROKEN' AS which,
       o.id,
       SUM(l.quantity * l.unit_price_cents) / 100.0 AS line_total_eur,
       SUM(p.amount_cents) / 100.0                  AS paid_eur
FROM orders o
JOIN order_lines l ON l.order_id = o.id
JOIN payments    p ON p.order_id = o.id
WHERE o.id = 3
GROUP BY o.id;

-- How many rows is that join actually producing, and why?
SELECT 'DIAGNOSIS' AS which,
       (SELECT COUNT(*) FROM order_lines WHERE order_id = 3) AS lines,
       (SELECT COUNT(*) FROM payments    WHERE order_id = 3) AS payments,
       (SELECT COUNT(*) FROM order_lines l JOIN payments p ON p.order_id = l.order_id
        WHERE l.order_id = 3)                                AS rows_in_the_join;

-- ---------------------------------------------------------------------------
-- YOUR TURN. Rewrite the report so both totals are correct for EVERY order.
--
-- Rules:
--   * DISTINCT is not a fix. It removes duplicate rows and leaves the sums wrong.
--   * Orders with no payments must still appear, with 0.
--   * One statement.
--
-- Replace the SELECT inside fixed_report below.
-- ---------------------------------------------------------------------------

DROP VIEW IF EXISTS fixed_report;
CREATE VIEW fixed_report AS
  SELECT o.id                                          AS order_id,
         SUM(l.quantity * l.unit_price_cents) / 100.0  AS line_total_eur,
         SUM(p.amount_cents) / 100.0                   AS paid_eur
  FROM orders o
  JOIN order_lines l ON l.order_id = o.id
  JOIN payments    p ON p.order_id = o.id
  GROUP BY o.id;
  -- ^^^ still wrong. This is the exercise.

-- ------------------------------------------------------------- ASSERTION ---
-- v_order_totals in the schema is correct. Your view must agree with it for
-- every order, and must not lose any orders.
SELECT CASE
  WHEN (SELECT COUNT(*) FROM fixed_report) <> (SELECT COUNT(*) FROM orders)
    THEN 'FAIL: your report has ' || (SELECT COUNT(*) FROM fixed_report)
         || ' rows, there are ' || (SELECT COUNT(*) FROM orders) || ' orders'
  WHEN EXISTS (
        SELECT 1 FROM fixed_report f
        JOIN v_order_totals t ON t.order_id = f.order_id
        WHERE ABS(f.line_total_eur - t.line_total_cents / 100.0) > 0.005
           OR ABS(f.paid_eur       - t.paid_cents      / 100.0) > 0.005)
    THEN 'FAIL: totals disagree with v_order_totals'
  ELSE 'PASS'
END AS result;
