# Module 02 · Modelling a real domain

> Site chapters: [02](../../../site/chapters/02-relational-model.html) ·
> [03](../../../site/chapters/03-data-types.html) ·
> [04](../../../site/chapters/04-ddl-and-constraints.html) ·
> [05](../../../site/chapters/05-normalisation.html)

---

## 1 · The idea

Modelling is not drawing boxes. It is **deciding which states of the world are
representable**, and then making the rest impossible to write down.

Every model is a claim about the business, and the useful test of a claim is what
it *forbids*. "An order has a status" forbids nothing. "An order's status is one
of six values, and it can never go from `shipped` to `cancelled`" forbids
something, and forbidding it is where the value is — because the alternative is
that somebody, some day, writes that row, and then every report and every
integration downstream has to cope with a state nobody designed for.

Three ideas do most of the work:

1. **A constraint is an invariant enforced where it cannot be bypassed.**
   Application validation is the same rule written somewhere the import job, the
   hotfix and the second application do not go through.
2. **Normalise to remove redundancy, and know which "duplicates" are not
   redundancy at all.** The price on an order line is not a copy of the product
   price; it is a different fact that happens to look like one.
3. **The type is part of the model.** `FLOAT` for money is not a performance
   decision made carelessly, it is a modelling error: it says the value is an
   approximation, and money is not.

---

## 2 · In this codebase

Read [`reference/schema/01-schema.sql`](../../../reference/schema/01-schema.sql)
top to bottom. It is 180 lines and every non-obvious decision has its reason
beside it. In particular:

| Lines | The decision |
| --- | --- |
| `regions`, `cities` | Split out because `city → region` is transitive on the customer key. Textbook 3NF, in a place where it actually matters. |
| `customers.vat_number` | Nullable **on purpose** — a private customer has none — and still `UNIQUE`. Multiple nulls are permitted in SQLite, PostgreSQL, Oracle and MySQL, and **one** in SQL Server. That divergence is a real portability trap. |
| `customers.deleted_at` | Soft delete, with a partial index on the live rows. The comment says why cascade would be wrong here. |
| `products.list_price_cents` | Integer minor units, with the unit in the column name. |
| `orders` `CHECK` constraints | The state machine, plus "shipped implies a ship date not before the order date". Three lines that make a whole class of row unwritable. |
| `order_lines.unit_price_cents` | The point-in-time capture. Read the comment; this is the one people get wrong. |
| `stock` `CHECK` | `reserved <= on_hand` and both non-negative. The last-unit race becomes an error rather than a negative stock level. |

---

## 3 · Do it

### a) Try to write the impossible rows

```sql
-- Each of these SHOULD fail. Run them one at a time and read the error.
UPDATE orders SET status = 'teleported' WHERE id = 1;
INSERT INTO order_lines (order_id, line_no, product_id, quantity, unit_price_cents)
  VALUES (1, 99, 1, -5, 1000);
UPDATE stock SET reserved = on_hand + 1 WHERE product_id = 1;
INSERT INTO payments (order_id, amount_cents, method, external_ref)
  VALUES (1, 100, 'card', 'PAY-00000001');
UPDATE orders SET status = 'shipped', shipped_at = NULL WHERE id = 1;
```

Then ask, for each: **which layer would have caught this if the constraint were
not there, and what would the symptom have been three months later?**

### b) Find the transitive dependency you would have missed

Add a `customer_region` column to `orders` and populate it. Now change one
customer's city to a different region and observe that the orders table is
lying. Then delete the column. That is the whole of 3NF in ninety seconds, and
it is more convincing than the definition.

### c) Prove the point-in-time capture matters

```sql
-- What order 3 was actually charged:
SELECT sku, quantity, unit_price_cents FROM order_lines l
JOIN products p ON p.id = l.product_id WHERE order_id = 3;

-- Now "normalise away" the stored price and reprice from the product table:
UPDATE products SET list_price_cents = list_price_cents * 2;
SELECT sku, quantity, p.list_price_cents FROM order_lines l
JOIN products p ON p.id = l.product_id WHERE order_id = 3;
```

Last year's invoice just doubled. Roll it back. This is the argument to make when
somebody calls the stored price redundant.

### d) The exercise

Run [`reference/labs/schema-invariants.sql`](../../../reference/labs/schema-invariants.sql),
then deliberately break each of the four invariants (the SQL is in
[SOLUTIONS.md](../../SOLUTIONS.md)) and confirm each one fires. A check you have
never seen fail is a check you do not know works.

---

## 4 · Golden rules

- A table is an unordered set. Without `ORDER BY` there is no order, no matter what you observed in testing.
- If position is part of the meaning, it is a column, not an artefact of storage.
- A candidate key is minimal and unique; a primary key is the candidate key you nominated, and is also `NOT NULL`.
- Use a surrogate primary key and a `UNIQUE` constraint on the natural key. Choosing one instead of the other is the mistake.
- Declare `NOT NULL` unless there is a real business state where the value is unknown.
- One-to-many is a foreign key; many-to-many is always a third table, and that table earns its own columns.
- Never `FLOAT` for money. `DECIMAL(p, s)` or integer minor units, and put the unit in the column name.
- A `VARCHAR` length is a business constraint, not a performance tuning knob.
- Collation decides equality as well as sort order, so it is a correctness setting. Mixing collations across a join costs you the index.
- A constraint is an invariant that holds no matter who is writing. Application validation is the same rule in a bypassable place.
- Foreign keys do not index the child column. Index it yourself, or deletes on the parent will scan the child.
- Default to `RESTRICT`; use `CASCADE` only where the child cannot exist alone.
- Name every constraint. The generated name differs per environment and tells nobody anything.
- Normalisation removes redundancy; redundancy is what makes update, insertion and deletion anomalies possible.
- 3NF is the practical target for transactional schemas. Go further only for a reason you can state.
- A value captured at a point in time — the price charged, the address shipped to — is a different fact, not redundancy.
- Denormalise only after measuring, and always name the mechanism that keeps the copy true.

---

## 5 · Interview questions

**“How would you model orders and products?”**
Do not start with tables. Start with the questions: does an order line need the
price at the time of sale (yes), can an order exist without lines (yes, as a
draft), what states can an order be in and which transitions are forbidden. Then
the tables fall out, and every constraint you write has a sentence behind it.

**“Natural key or surrogate key?”**
Surrogate as the primary key so foreign keys stay narrow and never change, plus a
unique constraint on the natural key so the business rule is still enforced. The
failure mode of surrogate-only is duplicate customers; the failure mode of
natural-only is a VAT number correction cascading through six tables.

**“Is storing the unit price on the order line a normalisation violation?”**
No — it is a different fact. `products.list_price` is the current price;
`order_lines.unit_price` is what was charged that day. Normalising it away means
reprinting an old invoice reprices it, which is wrong and in some jurisdictions
illegal.

**“Where should business rules live?”**
Invariants — things that must never be false about the data — in the database,
because it is the only layer every writer passes through. Policy that changes
with the business or needs a human-readable error, in the application. "A
quantity is never negative" is a constraint; "gold customers get free shipping
over €50" is not.
