-- DEMO 01 · Money is never a float
-- Covered in: site/chapters/03-data-types.html
--
--   sqlite3 reference/forge.db < reference/demos/01-float-money.sql

.headers on
.mode column

-- Not a trick. This is how binary floating point works.
SELECT 0.1 + 0.2                AS sum_,
       0.1 + 0.2 = 0.3          AS equals_point_three,
       printf('%.20f', 0.1+0.2) AS what_it_really_is;

-- Accumulate the error a thousand times, as a nightly job would.
WITH RECURSIVE n(i, f) AS (
  SELECT 1, 0.0 UNION ALL SELECT i+1, f + 0.01 FROM n WHERE i < 1000
)
SELECT 'float'   AS kind, printf('%.10f', f) AS after_1000_additions FROM n WHERE i = 1000
UNION ALL
SELECT 'integer cents', printf('%.10f', 1000 * 1 / 100.0);

-- The reference schema stores integer minor units, so this cannot happen:
SELECT id, total_cents, total_cents / 100.0 AS eur FROM orders LIMIT 3;
-- The division happens ONCE, on display. Never in the accumulation.
