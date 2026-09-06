-- DEMO 03 · The same query, scan then seek
-- Covered in: site/chapters/25-how-an-index-works.html
--             site/chapters/07-predicates-and-sargability.html

.headers on
.mode column

DROP INDEX IF EXISTS ix_demo_total;

-- (1) No index: SCAN.
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE total_cents = 123400;

-- (2) With an index: SEARCH ... USING INDEX.
CREATE INDEX ix_demo_total ON orders (total_cents);
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE total_cents = 123400;

-- (3) Same index, non-sargable predicate: back to a SCAN. The index still
--     exists; the query threw it away.
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE total_cents + 0 = 123400;

-- (4) Covering: the index has everything the query needs, so the table is
--     never touched. Look for "USING COVERING INDEX".
DROP INDEX IF EXISTS ix_demo_cov;
CREATE INDEX ix_demo_cov ON orders (status, placed_at, customer_id);
EXPLAIN QUERY PLAN
SELECT customer_id FROM orders WHERE status = 'shipped' ORDER BY placed_at;

-- (5) And the ORDER BY that needs no sort, because the index is already in that
--     order. The absence of "USE TEMP B-TREE FOR ORDER BY" is the win.
EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE customer_id = 7 ORDER BY placed_at DESC;

DROP INDEX IF EXISTS ix_demo_total;
DROP INDEX IF EXISTS ix_demo_cov;
