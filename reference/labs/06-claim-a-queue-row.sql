-- LAB 06 · Claim a queue row
--
-- Covered in: site/chapters/24-concurrency-patterns.html
--
-- The outbox worker must claim ONE unpublished message atomically. Two workers
-- running at the same time must never claim the same row.
--
-- NOTE: SQLite has a single writer, so it cannot DEMONSTRATE the race. Write the
-- statement for PostgreSQL and for SQL Server, and explain in a comment which
-- clause does the work in each. This lab is graded on the explanation.

.headers on
.mode column

SELECT COUNT(*) AS pending FROM outbox WHERE published_at IS NULL;

-- ---------------------------------------------------------------------------
-- (a) PostgreSQL. Fill in the blanks.
--
--   UPDATE outbox
--   SET    claimed_at = now(), claimed_by = $1, attempts = attempts + 1
--   WHERE  id = (
--     SELECT id FROM outbox
--     WHERE  published_at IS NULL
--       AND (claimed_at IS NULL OR claimed_at < now() - INTERVAL '5 minutes')
--     ORDER  BY created_at
--     ______________              -- ← which two words, and why?
--     LIMIT  1
--   )
--   RETURNING id, topic, payload;
--
-- (b) SQL Server. Which two table hints replace them?
--
--   UPDATE TOP (1) o SET ... FROM outbox o WITH (______, ______) WHERE ...;
--
-- (c) Name the THREE things this queue still needs to be production-grade, and
--     what each one prevents. They are all in the schema already — find them.
-- ---------------------------------------------------------------------------

-- ------------------------------------------------------------- ASSERTION ---
-- The partial index that makes the worker's query stay cheap must exist.
SELECT CASE
  WHEN NOT EXISTS (SELECT 1 FROM sqlite_master
                   WHERE type = 'index' AND name = 'ix_outbox_pending')
    THEN 'FAIL: the partial index is missing'
  ELSE 'PASS (the SQL above is graded by a human, not by this file)'
END AS result;
