-- LAB 05 · Make the load idempotent
--
-- Covered in: site/chapters/20-upsert-and-idempotency.html
--
-- A nightly job loads payments from a partner file. It failed halfway last night
-- and somebody re-ran it. There are now duplicate payments.
--
-- Two tasks:
--   1. Make the load safe to run twice.
--   2. Make it IMPOSSIBLE for a future load to duplicate, whatever the code does.

.headers on
.mode column

DROP TABLE IF EXISTS staging_payments;
CREATE TABLE staging_payments (
  order_id     INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  method       TEXT    NOT NULL,
  external_ref TEXT    NOT NULL
);

-- Three rows, one of which is ALREADY in payments.
INSERT INTO staging_payments VALUES
  (5,   12345, 'card',     'PAY-LAB-0001'),
  (7,   67890, 'transfer', 'PAY-LAB-0002'),
  (5,   12345, 'card',     'PAY-LAB-0001');   -- the redelivered one

-- ---------------------------------------------------------------------------
-- YOUR TURN. Write ONE statement that loads staging_payments into payments and
-- is safe to run any number of times.
--
-- INSERT INTO payments (order_id, amount_cents, method, external_ref)
-- SELECT ... FROM staging_payments
-- ...;
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- ASSERTION ---
-- Run this file TWICE. It must PASS both times.
SELECT CASE
  WHEN (SELECT COUNT(*) FROM payments WHERE external_ref LIKE 'PAY-LAB-%') = 0
    THEN 'FAIL: nothing loaded — the exercise is not attempted'
  WHEN (SELECT COUNT(*) FROM payments WHERE external_ref LIKE 'PAY-LAB-%') <> 2
    THEN 'FAIL: expected exactly 2 rows, found '
         || (SELECT COUNT(*) FROM payments WHERE external_ref LIKE 'PAY-LAB-%')
  ELSE 'PASS'
END AS result;

-- Then answer, in a comment: which line of 01-schema.sql already prevents the
-- duplicate, and what would have happened without it?
