-- =============================================================================
--  QueryForge reference database — SEED
--
--  Deliberately DETERMINISTIC. No random(): the same file always produces the
--  same database, so a lab exercise can assert an exact answer and the integrity
--  gate can check that the answers in course/SOLUTIONS.md are still right.
--  Pseudo-randomness comes from arithmetic on the row number, which is
--  reproducible on every engine.
--
--  Volume: ~40 customers, 24 products, ~1 800 orders, ~4 400 order lines,
--  ~1 500 payments, 731 calendar days. Small enough to load in a browser in
--  under a second; large enough that a missing index is visible in a plan.
-- =============================================================================

-- ------------------------------------------------------------------ geography
INSERT INTO regions (id, name) VALUES
  (1,'Emilia-Romagna'), (2,'Lombardia'), (3,'Veneto'), (4,'Toscana'), (5,'Piemonte');

INSERT INTO cities (id, name, region_id) VALUES
  (1,'Bologna',1), (2,'Modena',1), (3,'Parma',1), (4,'Reggio Emilia',1), (5,'Rimini',1),
  (6,'Milano',2), (7,'Bergamo',2), (8,'Brescia',2),
  (9,'Venezia',3), (10,'Verona',3), (11,'Padova',3),
  (12,'Firenze',4), (13,'Pisa',4),
  (14,'Torino',5), (15,'Novara',5);

-- ------------------------------------------------------------------- products
INSERT INTO products (id, sku, name, list_price_cents, discontinued) VALUES
  (1,'CNC-100','Fresa CNC 3 assi',              1249000, 0),
  (2,'CNC-200','Fresa CNC 5 assi',              2899000, 0),
  (3,'TRN-050','Tornio da banco',                489000, 0),
  (4,'BLT-010','Nastro trasportatore 2 m',       159000, 0),
  (5,'BLT-020','Nastro trasportatore 5 m',       329000, 0),
  (6,'PLC-001','Controllore PLC compatto',        89900, 0),
  (7,'PLC-002','Controllore PLC modulare',       184900, 0),
  (8,'SNS-100','Sensore di prossimità',            4900, 0),
  (9,'SNS-200','Sensore di temperatura',           7900, 0),
  (10,'SNS-300','Encoder rotativo',                12900, 0),
  (11,'MTR-050','Motore passo-passo NEMA 23',      15900, 0),
  (12,'MTR-100','Servomotore 750 W',              129000, 0),
  (13,'CBL-001','Cavo schermato 10 m',              3900, 0),
  (14,'CBL-002','Cavo schermato 25 m',              8900, 0),
  (15,'PNL-001','Quadro elettrico IP54',           74900, 0),
  (16,'PNL-002','Quadro elettrico IP66',          109000, 0),
  (17,'VLV-010','Elettrovalvola 1/4"',             11900, 0),
  (18,'VLV-020','Elettrovalvola 1/2"',             16900, 0),
  (19,'PMP-100','Pompa idraulica 5 kW',           229000, 0),
  (20,'FLT-001','Filtro aria industriale',         21900, 0),
  (21,'GRB-100','Pinza pneumatica',                45900, 0),
  (22,'RBT-001','Braccio robotico 6 assi',       3450000, 0),
  (23,'OLD-001','Fresa CNC 2 assi (fuori catalogo)', 799000, 1),
  (24,'OLD-002','PLC serie precedente',             59900, 1);

INSERT INTO stock (product_id, on_hand, reserved)
SELECT id,
       CASE WHEN discontinued = 1 THEN 0 ELSE 12 + (id * 7) % 90 END,
       CASE WHEN discontinued = 1 THEN 0 ELSE (id * 3) % 5 END
FROM products;

-- ------------------------------------------------------------------ customers
-- Deliberately imperfect data, because real data is: two customers with no VAT
-- number (private buyers), one soft-deleted, and a spread of cities that makes
-- GROUP BY interesting.
INSERT INTO customers (id, vat_number, email, name, city_id, created_at, deleted_at)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 40)
SELECT
  n,
  CASE WHEN n IN (17, 33) THEN NULL
       ELSE 'IT' || printf('%011d', 12345678900 + n * 137) END,
  'cliente' || n || '@esempio.it',
  CASE n % 8
    WHEN 0 THEN 'Rossi Meccanica SpA'   WHEN 1 THEN 'Bianchi Automazione Srl'
    WHEN 2 THEN 'Verdi Impianti Srl'    WHEN 3 THEN 'Ferrari Componenti SpA'
    WHEN 4 THEN 'Conti Robotica Srl'    WHEN 5 THEN 'Galli Sistemi SpA'
    WHEN 6 THEN 'Marchetti Utensili Srl' ELSE 'Lombardi Tecnologie Srl'
  END || ' ' || printf('%02d', n),
  1 + (n * 7) % 15,          -- 7 is coprime with 15, so all 15 cities are used
  date('2024-01-01', '+' || ((n * 9) % 400) || ' days') || 'T09:00:00Z',
  CASE WHEN n = 29 THEN '2026-04-11T14:20:00Z' ELSE NULL END
FROM seq;

-- ------------------------------------------------------------------ employees
-- A four-level hierarchy, for the recursive CTE chapter and its labs.
INSERT INTO employees (id, name, manager_id, hired_at, salary_cents) VALUES
  (1,'Giulia Ferrero',   NULL, '2018-03-01', 9500000),
  (2,'Marco Bianchi',       1, '2019-06-17', 6800000),
  (3,'Elena Rossi',         1, '2019-09-02', 7100000),
  (4,'Davide Conti',        2, '2020-01-13', 4900000),
  (5,'Sara Galli',          2, '2021-04-06', 4600000),
  (6,'Luca Marchetti',      3, '2020-11-23', 5200000),
  (7,'Chiara Lombardi',     3, '2022-02-14', 4300000),
  (8,'Paolo Neri',          4, '2022-09-05', 3400000),
  (9,'Francesca Gatti',     4, '2023-01-09', 3400000),
  (10,'Alessandro Fabbri',  5, '2023-05-22', 3200000),
  (11,'Martina Riva',       6, '2023-10-02', 3600000),
  (12,'Stefano Colombo',    6, '2024-03-11', 3300000),
  (13,'Anna Serra',         7, '2024-07-01', 3100000),
  (14,'Roberto Villa',      8, '2025-02-17', 2900000),
  (15,'Ilaria Costa',      11, '2025-09-08', 2950000);

-- ------------------------------------------------------------------- dim_date
-- 2025-01-01 to 2026-12-31, generated rather than typed. Italian public holidays
-- are marked because "sales per working day" is a real reporting requirement and
-- Ferragosto is not a normal Friday.
INSERT INTO dim_date (d, year, month, day, quarter, iso_week, day_of_week, is_weekend, is_holiday, holiday_name)
WITH RECURSIVE cal(d) AS (
  SELECT '2025-01-01'
  UNION ALL
  SELECT date(d, '+1 day') FROM cal WHERE d < '2026-12-31'
)
SELECT
  d,
  CAST(strftime('%Y', d) AS INTEGER),
  CAST(strftime('%m', d) AS INTEGER),
  CAST(strftime('%d', d) AS INTEGER),
  (CAST(strftime('%m', d) AS INTEGER) + 2) / 3,
  CAST(strftime('%W', d) AS INTEGER),
  CAST(strftime('%w', d) AS INTEGER),
  CASE WHEN strftime('%w', d) IN ('0','6') THEN 1 ELSE 0 END,
  CASE WHEN strftime('%m-%d', d) IN
    ('01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26')
    THEN 1 ELSE 0 END,
  CASE strftime('%m-%d', d)
    WHEN '01-01' THEN 'Capodanno'          WHEN '01-06' THEN 'Epifania'
    WHEN '04-25' THEN 'Liberazione'        WHEN '05-01' THEN 'Festa del Lavoro'
    WHEN '06-02' THEN 'Festa della Repubblica' WHEN '08-15' THEN 'Ferragosto'
    WHEN '11-01' THEN 'Ognissanti'         WHEN '12-08' THEN 'Immacolata'
    WHEN '12-25' THEN 'Natale'             WHEN '12-26' THEN 'Santo Stefano'
    ELSE NULL END
FROM cal;

-- --------------------------------------------------------------------- orders
-- ~1 800 orders across two years, weighted so recent months have more, and with
-- a realistic status mix: most delivered, some in flight, a few cancelled.
INSERT INTO orders (id, customer_id, status, placed_at, shipped_at, delivered_at, total_cents, version)
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1800),
base AS (
  SELECT n,
         1 + (n * 17) % 40                                   AS customer_id,
         date('2025-01-01', '+' || ((n * 397) % 700) || ' days') AS d,
         (n * 31) % 100                                      AS roll
  FROM seq
)
SELECT
  n,
  customer_id,
  CASE WHEN roll < 6  THEN 'cancelled'
       WHEN roll < 12 THEN 'draft'
       WHEN roll < 20 THEN 'submitted'
       WHEN roll < 32 THEN 'confirmed'
       WHEN roll < 48 THEN 'shipped'
       ELSE 'delivered' END,
  d || 'T' || printf('%02d', 8 + (n % 10)) || ':' || printf('%02d', (n * 7) % 60) || ':00Z',
  CASE WHEN roll >= 32 THEN date(d, '+' || (1 + n % 4) || ' days') || 'T10:00:00Z' END,
  -- Delivery is derived FROM the ship offset, not computed independently, or
  -- ck_orders_delivered rejects the rows where the two happen to cross. A seed
  -- that has to be loaded with constraints disabled is not testing the schema.
  CASE WHEN roll >= 48 THEN date(d, '+' || (1 + n % 4 + 2 + n % 5) || ' days') || 'T14:00:00Z' END,
  0,    -- filled in below, from the lines. See the UPDATE at the end.
  1
FROM base;

-- ---------------------------------------------------------------- order lines
-- One to four lines per order. The unit price is the list price adjusted by a
-- small per-order discount, so historical prices genuinely differ from current
-- ones — which is the whole point of storing them. See chapter 05.
INSERT INTO order_lines (order_id, line_no, product_id, quantity, unit_price_cents)
WITH RECURSIVE ln(order_id, line_no, max_lines) AS (
  SELECT id, 1, 1 + (id * 13) % 4 FROM orders
  UNION ALL
  SELECT order_id, line_no + 1, max_lines FROM ln WHERE line_no < max_lines
)
SELECT
  ln.order_id,
  ln.line_no,
  p.id,
  1 + (ln.order_id * 7 + ln.line_no * 3) % 5,
  -- 0%, 3%, 5% or 8% off the list price, deterministically.
  p.list_price_cents - (p.list_price_cents * (CASE (ln.order_id * 7 + ln.line_no) % 4
                                                WHEN 0 THEN 0 WHEN 1 THEN 3
                                                WHEN 2 THEN 5 ELSE 8 END)) / 100
FROM ln
JOIN products p
  -- 13 and 5 are both coprime with 22, so all 22 live products appear.
  -- (11 and 29 are not: 11*k mod 22 only ever yields 0 or 11.)
  ON p.id = 1 + ((ln.order_id * 13 + ln.line_no * 5) % 22)   -- 1..22: never the discontinued two
WHERE NOT EXISTS (
  -- Respect uq_lines_product: skip a line that would duplicate a product on the
  -- same order. A seed that violates its own constraints is not a seed.
  SELECT 1 FROM order_lines x
  WHERE x.order_id = ln.order_id
    AND x.product_id = 1 + ((ln.order_id * 13 + ln.line_no * 5) % 22)
);

-- Denormalised total, written from the lines it is derived from.
-- This is a deliberate, NAMED denormalisation: orders.total_cents is a cached
-- aggregate of order_lines, maintained here at load time and by the application
-- on every line change. A denormalised column with no stated mechanism is a bug
-- that has not happened yet. See chapter 05.
UPDATE orders
SET total_cents = COALESCE(
  (SELECT SUM(quantity * unit_price_cents) FROM order_lines l WHERE l.order_id = orders.id), 0);

-- ------------------------------------------------------------------- payments
-- Only orders past 'confirmed' are paid, and a few are part-paid, so the
-- outstanding-balance view has something to say.
INSERT INTO payments (id, order_id, amount_cents, method, paid_at, external_ref)
SELECT
  ROW_NUMBER() OVER (ORDER BY o.id),
  o.id,
  CASE WHEN o.id % 11 = 0 THEN o.total_cents / 2 ELSE o.total_cents END,
  CASE o.id % 4 WHEN 0 THEN 'transfer' WHEN 1 THEN 'card'
                WHEN 2 THEN 'transfer' ELSE 'credit' END,
  date(substr(o.placed_at, 1, 10), '+' || (1 + o.id % 5) || ' days') || 'T11:30:00Z',
  'PAY-' || printf('%08d', o.id)
FROM orders o
WHERE o.status IN ('confirmed','shipped','delivered')
  AND o.total_cents > 0;

-- --------------------------------------------------------------------- events
-- One row per state transition the order has actually been through. Written in
-- the same transaction as the transition in the real system; generated here.
INSERT INTO order_events (order_id, from_status, to_status, at, actor)
SELECT id, NULL, 'draft', placed_at, 'system' FROM orders
UNION ALL
SELECT id, 'draft', 'submitted', placed_at, 'customer' FROM orders
  WHERE status NOT IN ('draft','cancelled')
UNION ALL
SELECT id, 'submitted', 'confirmed', placed_at, 'sales' FROM orders
  WHERE status IN ('confirmed','shipped','delivered')
UNION ALL
SELECT id, 'confirmed', 'shipped', shipped_at, 'warehouse' FROM orders
  WHERE status IN ('shipped','delivered')
UNION ALL
SELECT id, 'shipped', 'delivered', delivered_at, 'courier' FROM orders
  WHERE status = 'delivered'
UNION ALL
SELECT id, 'submitted', 'cancelled', placed_at, 'sales' FROM orders
  WHERE status = 'cancelled';

-- --------------------------------------------------------------------- outbox
-- A handful of pending messages, so the "claim a queue row" lab has something
-- to claim. See chapter 24.
INSERT INTO outbox (topic, payload, created_at)
SELECT 'order.shipped',
       '{"orderId":' || id || ',"customerId":' || customer_id || '}',
       shipped_at
FROM orders
WHERE status = 'shipped'
LIMIT 25;
