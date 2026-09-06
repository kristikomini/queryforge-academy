-- =============================================================================
--  QueryForge reference database — SCHEMA
--
--  An order-fulfilment system, written to be READ. Every non-obvious decision is
--  commented where it was made, not in a document nobody opens.
--
--  Dialect: written for SQLite so the in-browser playground can run it unchanged.
--  Where a production engine would spell something differently, the comment says
--  so. The DESIGN is dialect-independent; see reference/README.md for the
--  PostgreSQL and SQL Server variants of the three places it matters.
--
--  Covered in: site/chapters/04-ddl-and-constraints.html
--              site/chapters/24-concurrency-patterns.html
--              course/module-02-modelling/README.md
-- =============================================================================

PRAGMA foreign_keys = ON;   -- SQLite does NOT enforce FKs unless you ask. See ch. 04.

-- ---------------------------------------------------------------- geography --
-- Split out because city -> region is a transitive dependency on the customer
-- key, which is exactly what 3NF forbids. See chapter 05.

CREATE TABLE regions (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  CONSTRAINT uq_regions_name UNIQUE (name)
);

CREATE TABLE cities (
  id         INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  region_id  INTEGER NOT NULL REFERENCES regions(id),
  CONSTRAINT uq_cities_name_region UNIQUE (name, region_id)
);
-- The index a foreign key does NOT create for you. Without it, deleting a region
-- scans every city to prove nothing references it — and holds locks while it does.
CREATE INDEX ix_cities_region ON cities (region_id);

-- ---------------------------------------------------------------- customers --

CREATE TABLE customers (
  id          INTEGER PRIMARY KEY,           -- surrogate: stable, narrow, meaningless
  vat_number  TEXT    NULL,                  -- NULL is legitimate: private customers have none
  email       TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  city_id     INTEGER NOT NULL REFERENCES cities(id),
  created_at  TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  deleted_at  TEXT    NULL,                  -- soft delete: see the note below

  -- The natural keys, still enforced. A surrogate id INSTEAD of these constraints
  -- is the actual mistake people make, and it is how you get two rows for one
  -- customer. See chapter 02.
  CONSTRAINT uq_customers_email UNIQUE (email),
  CONSTRAINT uq_customers_vat   UNIQUE (vat_number),   -- multiple NULLs are allowed
  CONSTRAINT ck_customers_email CHECK (email LIKE '%_@_%.__%')
);
CREATE INDEX ix_customers_city ON customers (city_id);
-- Partial index: only live customers, which is what almost every query wants,
-- and it keeps the index small. PostgreSQL and SQL Server spell this the same way.
CREATE INDEX ix_customers_live ON customers (name) WHERE deleted_at IS NULL;

-- WHY SOFT DELETE. "Delete the customer" almost never means "destroy seven years
-- of invoices", and in Italy a tax authority would have opinions. ON DELETE
-- CASCADE would let one statement remove rows from tables it does not name, with
-- a row count that gives no clue about the damage. See chapter 04.

-- ----------------------------------------------------------------- products --

CREATE TABLE products (
  id                INTEGER PRIMARY KEY,
  sku               TEXT    NOT NULL,
  name              TEXT    NOT NULL,
  -- MONEY IS NEVER A FLOAT. Integer minor units: exact, comparable, fast, and the
  -- unit is in the column name so nobody has to guess. See chapter 03.
  list_price_cents  INTEGER NOT NULL,
  discontinued      INTEGER NOT NULL DEFAULT 0,   -- SQLite has no BOOLEAN; 0/1 with a CHECK

  CONSTRAINT uq_products_sku       UNIQUE (sku),
  CONSTRAINT ck_products_price     CHECK (list_price_cents >= 0),
  CONSTRAINT ck_products_disc_bool CHECK (discontinued IN (0, 1))
);

CREATE TABLE stock (
  product_id  INTEGER PRIMARY KEY REFERENCES products(id),
  on_hand     INTEGER NOT NULL,
  reserved    INTEGER NOT NULL DEFAULT 0,
  -- The invariant that makes overselling impossible. Two sessions reserving the
  -- last unit is the classic race; this constraint means the loser gets an error
  -- rather than a negative stock level. See chapter 24.
  CONSTRAINT ck_stock_nonneg    CHECK (on_hand >= 0 AND reserved >= 0),
  CONSTRAINT ck_stock_reservable CHECK (reserved <= on_hand)
);

-- ------------------------------------------------------------------- orders --
--
--  The state machine:
--
--      draft -> submitted -> confirmed -> shipped -> delivered
--        |          |            |
--        +----------+------------+--> cancelled
--
--  Note what is NOT there: shipped -> cancelled. Once it is on a lorry, "cancel"
--  is a returns process with different accounting, not a status change. Encoding
--  that refusal is the difference between a state machine and a status column.

CREATE TABLE orders (
  id            INTEGER PRIMARY KEY,
  customer_id   INTEGER NOT NULL REFERENCES customers(id),
  status        TEXT    NOT NULL DEFAULT 'draft',
  placed_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  shipped_at    TEXT    NULL,
  delivered_at  TEXT    NULL,
  total_cents   INTEGER NOT NULL DEFAULT 0,

  -- OPTIMISTIC CONCURRENCY. Every write does
  --     UPDATE orders SET ..., version = version + 1
  --      WHERE id = ? AND version = ?
  -- and zero rows affected means somebody else got there first -> 409, retry.
  -- Cheaper than holding a lock across a user's thinking time, and it does not
  -- deadlock. In SQL Server this would be a `rowversion`; in PostgreSQL an
  -- `xmin` comparison also works. See chapter 24.
  version       INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT ck_orders_status CHECK (status IN
    ('draft','submitted','confirmed','shipped','delivered','cancelled')),
  CONSTRAINT ck_orders_total  CHECK (total_cents >= 0),
  -- Shipped implies a ship date, and it cannot precede the order.
  CONSTRAINT ck_orders_shipped CHECK (
    status NOT IN ('shipped','delivered')
    OR (shipped_at IS NOT NULL AND shipped_at >= placed_at)),
  CONSTRAINT ck_orders_delivered CHECK (
    status <> 'delivered'
    OR (delivered_at IS NOT NULL AND delivered_at >= shipped_at))
);
CREATE INDEX ix_orders_customer  ON orders (customer_id);
-- Composite, in this order, because the common query is "this customer's recent
-- orders". (customer_id, placed_at) supports that AND "this customer's orders";
-- (placed_at, customer_id) supports neither well. See chapter 26.
CREATE INDEX ix_orders_cust_date ON orders (customer_id, placed_at DESC);
CREATE INDEX ix_orders_status    ON orders (status, placed_at);

CREATE TABLE order_lines (
  order_id          INTEGER NOT NULL REFERENCES orders(id),
  line_no           INTEGER NOT NULL,
  product_id        INTEGER NOT NULL REFERENCES products(id),
  quantity          INTEGER NOT NULL,
  -- NOT a normalisation violation. products.list_price_cents is the CURRENT price;
  -- this is the price this customer was actually charged on that day. Normalise it
  -- away and reprinting last year's invoice silently reprices it. See chapter 05.
  unit_price_cents  INTEGER NOT NULL,

  -- line_no is an explicit column because a relation has no order. See chapter 02.
  PRIMARY KEY (order_id, line_no),
  CONSTRAINT ck_lines_qty   CHECK (quantity > 0),
  CONSTRAINT ck_lines_price CHECK (unit_price_cents >= 0),
  CONSTRAINT uq_lines_product UNIQUE (order_id, product_id)   -- one line per product
);
CREATE INDEX ix_lines_product ON order_lines (product_id);

CREATE TABLE payments (
  id            INTEGER PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id),
  amount_cents  INTEGER NOT NULL,
  method        TEXT    NOT NULL,
  paid_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  -- The idempotency key. An ETL job or a payment webhook that is re-delivered
  -- must not create a second payment. UNIQUE turns "did we already do this?"
  -- from a race into a constraint violation you can catch. See chapter 20.
  external_ref  TEXT    NOT NULL,

  CONSTRAINT uq_payments_ref    UNIQUE (external_ref),
  CONSTRAINT ck_payments_amount CHECK (amount_cents > 0),
  CONSTRAINT ck_payments_method CHECK (method IN ('card','transfer','cash','credit'))
);
CREATE INDEX ix_payments_order ON payments (order_id);

-- ------------------------------------------------------------------- events --
-- Domain events, written inside the same transaction as the state change they
-- describe. That is what makes them trustworthy: there is no window in which the
-- order moved but the event did not.

CREATE TABLE order_events (
  id          INTEGER PRIMARY KEY,
  order_id    INTEGER NOT NULL REFERENCES orders(id),
  from_status TEXT    NULL,          -- NULL on creation: there was no previous status
  to_status   TEXT    NOT NULL,
  at          TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  actor       TEXT    NOT NULL DEFAULT 'system'
);
CREATE INDEX ix_events_order ON order_events (order_id, at);

-- THE TRANSACTIONAL OUTBOX.
-- The problem: "save the order AND send the email" spans two systems, and there
-- is no transaction across both. Send first and the save may fail; save first and
-- the send may fail. The outbox makes the message part of the SAME transaction as
-- the data, and a separate worker delivers it afterwards — at-least-once, so the
-- consumer must be idempotent. See chapter 24 and course/module-08-outbox.
CREATE TABLE outbox (
  id            INTEGER PRIMARY KEY,
  topic         TEXT    NOT NULL,
  payload       TEXT    NOT NULL,          -- JSON. See chapter 18 for why it is a blob here
  created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  claimed_at    TEXT    NULL,
  claimed_by    TEXT    NULL,
  published_at  TEXT    NULL,
  attempts      INTEGER NOT NULL DEFAULT 0
);
-- The worker's query is "unpublished, oldest first". A partial index on exactly
-- that predicate stays tiny however large the table grows, because published rows
-- leave the index entirely. See chapter 26.
CREATE INDEX ix_outbox_pending ON outbox (created_at) WHERE published_at IS NULL;

-- ---------------------------------------------------------------- employees --
-- Present so the course has a real hierarchy to run recursive CTEs against.

CREATE TABLE employees (
  id          INTEGER PRIMARY KEY,
  name        TEXT    NOT NULL,
  manager_id  INTEGER NULL REFERENCES employees(id),   -- self-referencing; NULL = the root
  hired_at    TEXT    NOT NULL,
  salary_cents INTEGER NOT NULL,
  CONSTRAINT ck_employees_salary CHECK (salary_cents > 0),
  CONSTRAINT ck_employees_not_own_manager CHECK (manager_id <> id)
);
CREATE INDEX ix_employees_manager ON employees (manager_id);

-- --------------------------------------------------------------- dim_date ----
-- The calendar table nobody teaches and every reporting system needs. Working
-- days and holidays are DATA, not arithmetic you reimplement in each query.
-- See chapter 17.

CREATE TABLE dim_date (
  d            TEXT    PRIMARY KEY,          -- 'YYYY-MM-DD'
  year         INTEGER NOT NULL,
  month        INTEGER NOT NULL,
  day          INTEGER NOT NULL,
  quarter      INTEGER NOT NULL,
  iso_week     INTEGER NOT NULL,
  day_of_week  INTEGER NOT NULL,             -- 0 = Sunday, SQLite's %w
  is_weekend   INTEGER NOT NULL,
  is_holiday   INTEGER NOT NULL DEFAULT 0,
  holiday_name TEXT    NULL,
  CONSTRAINT ck_dim_date_flags CHECK (is_weekend IN (0,1) AND is_holiday IN (0,1))
);
CREATE INDEX ix_dim_date_ym ON dim_date (year, month);

-- ------------------------------------------------------------------- views ---
-- A view is an API over the schema: it lets the tables change underneath without
-- every report changing with them. It is NOT a performance feature — the query is
-- expanded into whatever uses it. See chapter 33.

CREATE VIEW v_order_totals AS
SELECT
  o.id                AS order_id,
  o.customer_id,
  o.status,
  o.placed_at,
  -- Pre-aggregated per branch, so joining lines AND payments cannot fan out.
  -- See chapter 08.
  COALESCE(l.line_total_cents, 0) AS line_total_cents,
  COALESCE(p.paid_cents, 0)       AS paid_cents,
  COALESCE(l.line_total_cents, 0) - COALESCE(p.paid_cents, 0) AS outstanding_cents
FROM orders o
LEFT JOIN (SELECT order_id, SUM(quantity * unit_price_cents) AS line_total_cents
           FROM order_lines GROUP BY order_id) l ON l.order_id = o.id
LEFT JOIN (SELECT order_id, SUM(amount_cents) AS paid_cents
           FROM payments GROUP BY order_id)    p ON p.order_id = o.id;

CREATE VIEW v_orders_geo AS
SELECT o.*, c.name AS customer_name, ci.name AS city, r.name AS region
FROM orders o
JOIN customers c ON c.id = o.customer_id
JOIN cities    ci ON ci.id = c.city_id
JOIN regions   r ON r.id = ci.region_id;
