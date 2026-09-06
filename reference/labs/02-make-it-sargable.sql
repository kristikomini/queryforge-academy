-- LAB 02 · Make it sargable
--
-- Covered in: site/chapters/07-predicates-and-sargability.html
--
-- Three predicates that cannot use an index. Rewrite each so it can, WITHOUT
-- changing which rows come back.
--
-- Use EXPLAIN QUERY PLAN to check: you want SEARCH ... USING INDEX, not SCAN.

.headers on
.mode column

CREATE INDEX IF NOT EXISTS ix_lab_orders_placed ON orders (placed_at);
CREATE INDEX IF NOT EXISTS ix_lab_cust_email    ON customers (email);

-- (a) ------------------------------------------------------------------------
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM orders WHERE strftime('%Y', placed_at) = '2026';
-- YOUR VERSION:
-- EXPLAIN QUERY PLAN
-- SELECT COUNT(*) FROM orders WHERE ...;

-- (b) ------------------------------------------------------------------------
EXPLAIN QUERY PLAN
SELECT COUNT(*) FROM orders WHERE total_cents / 100 > 5000;
-- YOUR VERSION:

-- (c) ------------------------------------------------------------------------
-- Careful: this one has TWO problems, and only one of them can be fixed by
-- rewriting the predicate. Say what the other one is in a comment.
EXPLAIN QUERY PLAN
SELECT id FROM customers WHERE LOWER(email) LIKE '%esempio.it';

-- ------------------------------------------------------------- ASSERTION ---
-- Each rewrite must return the SAME COUNT as the original.
SELECT 'a' AS q,
       (SELECT COUNT(*) FROM orders WHERE strftime('%Y', placed_at) = '2026') AS original,
       NULL AS yours,        -- ← put your rewritten COUNT here
       'FAIL: not attempted' AS result
UNION ALL
SELECT 'b',
       (SELECT COUNT(*) FROM orders WHERE total_cents / 100 > 5000),
       NULL,
       'FAIL: not attempted';
