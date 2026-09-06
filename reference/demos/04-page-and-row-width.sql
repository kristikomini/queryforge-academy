-- DEMO 04 · Narrow rows are fast rows
-- Covered in: site/chapters/01-engines-and-storage.html

.headers on
.mode column

-- The engine reads PAGES, not rows. So the number of bytes per row decides how
-- many rows fit in one read.
DROP TABLE IF EXISTS demo_narrow;
DROP TABLE IF EXISTS demo_wide;

CREATE TABLE demo_narrow (id INTEGER PRIMARY KEY, v INTEGER);
CREATE TABLE demo_wide   (id INTEGER PRIMARY KEY, v INTEGER, padding TEXT);

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 20000)
INSERT INTO demo_narrow SELECT i, i % 997 FROM n;

WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i < 20000)
INSERT INTO demo_wide SELECT i, i % 997, hex(randomblob(350)) FROM n;

-- Same row count, same query, same answer. Different amount of disk to read.
SELECT 'narrow' AS t, COUNT(*) AS rows_, SUM(pgsize) AS bytes_on_disk
FROM dbstat WHERE name = 'demo_narrow'
UNION ALL
SELECT 'wide', COUNT(*), SUM(pgsize) FROM dbstat WHERE name = 'demo_wide';
-- (dbstat needs SQLITE_ENABLE_DBSTAT_VTAB; if it is unavailable, compare the
--  file size before and after instead — the point survives either way.)

SELECT 'A scan of demo_wide reads roughly the same rows and many times the pages.' AS note;

DROP TABLE demo_narrow;
DROP TABLE demo_wide;
