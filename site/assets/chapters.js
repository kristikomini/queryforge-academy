/* ---------------------------------------------------------------------------
   chapters.js — THE SINGLE SOURCE OF TRUTH.

   This one array drives: the sidebar, the home-page cards, the prev/next pager,
   both coverage tables, the sidebar search index, and the service worker's
   precache list. Nothing else in the repository enumerates chapters.

   `self` and not `window` is load-bearing: sw.js does importScripts() on this
   file so the offline precache list is generated from the manifest rather than
   being a second copy that goes stale. There is no `window` in a worker.

   Every entry carries EITHER `req` (the line of a real job advert it answers)
   OR `extra` (why it is here although no advert asked for it). The home page
   renders those as two separate tables, which is what makes the claim
   "nothing in the adverts is uncovered" checkable instead of asserted.

   The advert lines below are quoted from real Italian SQL / Database Developer
   postings collected in September 2026. See docs/ADVERTS.md for the sources.
--------------------------------------------------------------------------- */

const PARTS = [
  "Start here",
  "Part 0 — From absolute zero",
  "Part 1 — The relational foundation",
  "Part 2 — Querying",
  "Part 3 — Changing data",
  "Part 4 — Fast at scale",
  "Part 5 — Building it properly",
  "Part 6 — Data at work",
  "Part 7 — What the market actually runs",
  "Part 8 — The human requirements",
];

const CHAPTERS = [
  {
    n: "00", id: "00-the-job-posting", part: PARTS[0],
    title: "The job posting, decoded",
    blurb: "Five real Italian SQL adverts, line by line, with the chapter that answers each one.",
    tags: "advert annuncio requisiti job posting coverage requirements decoded",
    req: "Ricerchiamo un SQL / Database Developer",
  },

  /* ---------------- Part 0 — From absolute zero ----------------
     These ten chapters assume NOTHING. No database installed, no SQL ever
     written, no idea what a table is. They exist because the rest of the course
     was written for somebody who already knew what a SELECT was, and a course
     that starts at chapter 01 is a course for people who do not need it.

     They are numbered 0A–0J rather than renumbered into the 01–51 sequence on
     purpose: a chapter id is the key a learner's progress, notes and review
     schedule are stored under, so renumbering fifty-two chapters to make room
     would silently reassign somebody's history to a different chapter. */
  {
    n: "0A", id: "00a-what-is-a-database", part: PARTS[1],
    title: "What a database actually is",
    blurb: "Why not a spreadsheet, what the engine does for you, and the words everyone else will assume you know.",
    tags: "database what is dbms engine spreadsheet excel csv table row column rdbms server client beginner start",
    extra: "No advert asks for it, because every advert assumes it. Skip this chapter only if you can already say what a database gives you that a spreadsheet does not.",
  },
  {
    n: "0B", id: "00b-run-your-first-query", part: PARTS[1],
    title: "Getting a database in front of you",
    blurb: "Four ways to have a working SQL engine in under a minute, and your first statement run in each.",
    tags: "install setup playground sqlite docker postgres sql server express ssms dbeaver psql first query beginner",
    extra: "Nobody hires you for installing a database. But a course you cannot run is a book, and the single biggest reason beginners stop is that nothing ever ran.",
  },
  {
    n: "0C", id: "00c-tables-rows-columns", part: PARTS[1],
    title: "Tables, rows, columns and the shape of an answer",
    blurb: "The four words the rest of the course is written in — and what a result set is, exactly.",
    tags: "table row column result set schema field record grid shape cell value beginner vocabulary",
    extra: "Every later chapter uses these words in sentences. Getting them precisely right once costs ten minutes and saves fifty pages of confusion.",
  },
  {
    n: "0D", id: "00d-select-and-from", part: PARTS[1],
    title: "Your first query: SELECT and FROM",
    blurb: "Two keywords, one statement, and every token in it explained — including the semicolon.",
    tags: "select from first query columns star asterisk alias as semicolon keyword identifier literal beginner",
    extra: "The first statement anybody writes. Written out token by token here so that nothing in it is ever a mystery again.",
  },
  {
    n: "0E", id: "00e-where-filtering", part: PARTS[1],
    title: "WHERE: asking for less",
    blurb: "Comparison operators, AND, OR, NOT, IN, BETWEEN, LIKE — and the first place NULL will surprise you.",
    tags: "where filter predicate comparison operator equals and or not in between like null beginner condition",
    extra: "A query with no WHERE clause reads the whole table. Learning to say what you actually want is the first performance lesson, disguised as a syntax lesson.",
  },
  {
    n: "0F", id: "00f-order-by-and-limit", part: PARTS[1],
    title: "ORDER BY and LIMIT: reading a result you can trust",
    blurb: "Rows have no order until you ask for one — and every dialect spells “just the first ten” differently.",
    tags: "order by sort ascending descending limit top fetch first offset ties deterministic beginner",
    extra: "The most common beginner belief about SQL — that rows come back in the order they were inserted — is false, and nothing reports an error when you rely on it.",
  },
  {
    n: "0G", id: "00g-expressions-and-types", part: PARTS[1],
    title: "Expressions, literals and the types you can see",
    blurb: "Arithmetic in a SELECT, text and date literals, integer division, and CAST when the engine guesses wrong.",
    tags: "expression literal arithmetic integer division cast convert concat type conversion string number date beginner",
    extra: "Integer division silently returning 0 is the single most common wrong number in a beginner's first report. It gets its own chapter for that reason.",
  },
  {
    n: "0H", id: "00h-create-insert-update-delete", part: PARTS[1],
    title: "Your own table: CREATE, INSERT, UPDATE, DELETE",
    blurb: "Making a table, putting rows in it, changing them, removing them — and the two habits that prevent the worst day.",
    tags: "create table insert update delete drop values ddl dml crud beginner rows transaction rollback safety",
    extra: "Reading data is half the job. This is the other half, at the smallest possible scale, before chapters 19 to 24 do it properly.",
  },
  {
    n: "0I", id: "00i-your-first-join", part: PARTS[1],
    title: "Your first join: two tables, one question",
    blurb: "Why the data is split up in the first place, and how to put it back together for one answer.",
    tags: "join first inner left on foreign key relationship two tables beginner match rows connect",
    extra: "Chapter 08 covers joins properly and assumes you have written one. This is the one you write first.",
  },
  {
    n: "0J", id: "00j-your-first-group-by", part: PARTS[1],
    title: "Counting things: your first GROUP BY",
    blurb: "From “list the orders” to “how many orders per customer” — the step where SQL stops being a filter.",
    tags: "group by count sum avg min max aggregate per each summary beginner totals grouping",
    extra: "Every reporting question is a GROUP BY. Chapter 10 covers the traps; this one covers the idea.",
  },

  /* ---------------- Part 1 — The relational foundation ---------------- */
  {
    n: "01", id: "01-engines-and-storage", part: PARTS[2],
    title: "What a database engine actually is",
    blurb: "Pages, the buffer pool, the write-ahead log, and why “the database is slow” is usually about disk.",
    tags: "engine storage page buffer pool wal write ahead log durability checkpoint innodb heap fsync",
    req: "Solida conoscenza di MS SQL Server (versione >= 2008)",
  },
  {
    n: "02", id: "02-relational-model", part: PARTS[2],
    title: "The relational model: sets, keys and NULL",
    blurb: "Why a table is a set and not a list, what a key really guarantees, and where NULL came from.",
    tags: "relational model set tuple primary key foreign key candidate natural surrogate null codd cardinality",
    req: "Progettazione e modellazione di basi dati relazionali",
  },
  {
    n: "03", id: "03-data-types", part: PARTS[2],
    title: "Data types and what they cost",
    blurb: "Money is never a float. Also varchar vs nvarchar, dates, UUIDs as keys, and storage that becomes speed.",
    tags: "data types decimal numeric float real money varchar nvarchar char text date datetime timestamp uuid guid boolean enum",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "04", id: "04-ddl-and-constraints", part: PARTS[2],
    title: "DDL and constraints: the database defends itself",
    blurb: "PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, NOT NULL, DEFAULT — the cheapest bugs you will ever prevent.",
    tags: "ddl create table alter constraint primary foreign key unique check not null default identity sequence cascade",
    req: "Progettazione e modellazione di basi dati relazionali",
  },
  {
    n: "05", id: "05-normalisation", part: PARTS[2],
    title: "Normalisation, and denormalising on purpose",
    blurb: "1NF to BCNF in plain words, the anomaly each form removes, and when to break the rules deliberately.",
    tags: "normalisation normalization 1nf 2nf 3nf bcnf functional dependency anomaly denormalisation redundancy",
    req: "Progettazione e modellazione di basi dati relazionali",
  },
  {
    n: "06", id: "06-how-select-is-evaluated", part: PARTS[2],
    title: "How a SELECT is really evaluated",
    blurb: "FROM before WHERE before GROUP BY before SELECT. Nearly every beginner error is this one order.",
    tags: "logical query processing order from where group by having select distinct order by limit alias scope",
    req: "Ottima conoscenza del linguaggio SQL",
  },

  /* ---------------- Part 2 — Querying ---------------- */
  {
    n: "07", id: "07-predicates-and-sargability", part: PARTS[3],
    title: "Predicates, filtering and sargability",
    blurb: "WHERE, LIKE, IN, BETWEEN — and the one habit that quietly disables every index you own.",
    tags: "where predicate like in between sargable sargability function on column implicit conversion collation wildcard",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "08", id: "08-joins", part: PARTS[3],
    title: "JOINs, semi-joins and anti-joins",
    blurb: "INNER, LEFT, FULL, CROSS, self — plus the two joins that have no keyword and are asked about constantly.",
    tags: "join inner left right full outer cross self semi anti exists not exists on clause fan out duplication",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "09", id: "09-null-and-three-valued-logic", part: PARTS[3],
    title: "NULL and three-valued logic",
    blurb: "NULL is not a value, = NULL is never true, and NOT IN with a NULL returns nothing. All three bite in production.",
    tags: "null unknown three valued logic is null coalesce nullif not in aggregate count distinct unique index",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "10", id: "10-aggregation", part: PARTS[3],
    title: "Aggregation, GROUP BY and HAVING",
    blurb: "COUNT(*) vs COUNT(col), why HAVING is not a second WHERE, and the grouping error the engine will not catch.",
    tags: "aggregate group by having count sum avg min max distinct rollup cube grouping sets filter",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "11", id: "11-subqueries", part: PARTS[3],
    title: "Subqueries: EXISTS, IN and the correlated one",
    blurb: "Three ways to ask the same question, one of which is a trap the moment a NULL appears.",
    tags: "subquery scalar correlated exists in any all derived table lateral cross apply outer apply",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "12", id: "12-ctes-and-recursion", part: PARTS[3],
    title: "CTEs and recursive queries",
    blurb: "WITH for readability, WITH RECURSIVE for trees and hierarchies, and the optimisation fence that surprises people.",
    tags: "cte with common table expression recursive hierarchy tree bill of materials anchor materialized fence",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "13", id: "13-window-functions", part: PARTS[3],
    title: "Window functions",
    blurb: "ROW_NUMBER, RANK, DENSE_RANK and OVER(PARTITION BY …). The highest-leverage thing in modern SQL.",
    tags: "window function over partition by order by row_number rank dense_rank ntile analytic olap top n per group",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "14", id: "14-frames-and-islands", part: PARTS[3],
    title: "Frames, running totals, gaps and islands",
    blurb: "ROWS and RANGE are not the same thing. Plus LAG/LEAD and the classic interview problem, solved three ways.",
    tags: "frame rows range unbounded preceding current row lag lead first_value last_value running total gaps islands",
    extra: "No advert names it, but “find the consecutive runs” and “running balance” appear in most technical screens.",
  },
  {
    n: "15", id: "15-set-operations", part: PARTS[3],
    title: "Set operations and de-duplication",
    blurb: "UNION vs UNION ALL is a performance decision, not a style one. Plus four ways to delete duplicate rows.",
    tags: "union all intersect except minus distinct duplicate dedupe row_number delete ctid rowid",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "16", id: "16-case-and-pivot", part: PARTS[3],
    title: "CASE, COALESCE and conditional aggregation",
    blurb: "How to pivot without PIVOT, and why conditional aggregation beats five self-joins every single time.",
    tags: "case when coalesce nullif iif conditional aggregation pivot unpivot crosstab filter clause report",
    req: "Reporting con SSRS e Power BI",
  },
  {
    n: "17", id: "17-strings-dates-timezones", part: PARTS[3],
    title: "Strings, dates, times and time zones",
    blurb: "Date arithmetic that survives DST, why storing local time is a bug, and collation as a correctness problem.",
    tags: "string date time datetime timestamp timezone utc dst interval format collation concat trim substring",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "18", id: "18-json-in-sql", part: PARTS[3],
    title: "JSON and semi-structured data",
    blurb: "When a JSON column is the right answer, when it is a schema you refused to design, and how to index one.",
    tags: "json jsonb xml semi structured openjson json_value jsonpath generated column gin index document",
    extra: "Every engine grew JSON support and every legacy schema now has a “settings” column. Nobody advertises it; everybody meets it.",
  },

  /* ---------------- Part 3 — Changing data ---------------- */
  {
    n: "19", id: "19-insert-update-delete", part: PARTS[4],
    title: "INSERT, UPDATE, DELETE and RETURNING",
    blurb: "Bulk loading, UPDATE … FROM, the WHERE clause you forgot, and getting the changed rows back.",
    tags: "insert update delete returning output truncate bulk copy load data join update transaction wrapper",
    req: "Ottima conoscenza del linguaggio SQL",
  },
  {
    n: "20", id: "20-upsert-and-idempotency", part: PARTS[4],
    title: "UPSERT, MERGE and idempotent writes",
    blurb: "ON CONFLICT, ON DUPLICATE KEY, MERGE — and why “check then insert” is a race, not a pattern.",
    tags: "upsert merge on conflict do update duplicate key idempotent race condition unique violation retry etl",
    req: "Esperienza nello sviluppo ETL con SSIS",
  },
  {
    n: "21", id: "21-transactions", part: PARTS[4],
    title: "Transactions and ACID",
    blurb: "BEGIN, COMMIT, ROLLBACK, savepoints — and what each of the four letters actually buys you.",
    tags: "transaction acid atomicity consistency isolation durability commit rollback savepoint autocommit",
    req: "Esperienza su ambienti di produzione",
  },
  {
    n: "22", id: "22-isolation-levels", part: PARTS[4],
    title: "Isolation levels and the anomalies they allow",
    blurb: "Dirty read, non-repeatable read, phantom, lost update — each mapped to the level that still permits it.",
    tags: "isolation read uncommitted committed repeatable serializable snapshot mvcc dirty phantom lost update",
    req: "Esperienza su ambienti di produzione",
  },
  {
    n: "23", id: "23-locks-and-deadlocks", part: PARTS[4],
    title: "Locks, blocking and deadlocks",
    blurb: "Shared and exclusive, lock escalation, and the deadlock you fix by swapping the order of two statements.",
    tags: "lock shared exclusive update intent escalation blocking deadlock victim timeout nolock readpast",
    req: "Esperienza su ambienti di produzione",
  },
  {
    n: "24", id: "24-concurrency-patterns", part: PARTS[4],
    title: "Concurrency patterns that actually hold",
    blurb: "Optimistic vs pessimistic, SELECT … FOR UPDATE SKIP LOCKED, and a work queue in a table done properly.",
    tags: "optimistic pessimistic concurrency rowversion version column for update skip locked queue outbox claim worker",
    extra: "The reference database is built on these. They are also the fastest way to sound senior in an interview.",
  },

  /* ---------------- Part 4 — Fast at scale ---------------- */
  {
    n: "25", id: "25-how-an-index-works", part: PARTS[5],
    title: "How an index actually works",
    blurb: "A B-tree drawn out, clustered vs non-clustered, the heap, and the lookup that costs more than a scan.",
    tags: "index b-tree btree clustered nonclustered heap leaf page key lookup rid bookmark fill factor fragmentation",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "26", id: "26-index-design", part: PARTS[5],
    title: "Index design: order, covering, selectivity",
    blurb: "Why (a, b) is not (b, a), what INCLUDE is for, and the real cost of the index nobody uses.",
    tags: "composite index column order covering include selectivity cardinality filtered partial unique write amplification",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "27", id: "27-execution-plans", part: PARTS[5],
    title: "Reading an execution plan",
    blurb: "Scan vs seek, nested loops vs hash vs merge, and the two numbers to look at before anything else.",
    tags: "execution plan explain analyze estimated actual rows scan seek nested loop hash join merge sort spill warning",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "28", id: "28-statistics-and-sniffing", part: PARTS[5],
    title: "Statistics, cardinality and parameter sniffing",
    blurb: "Why the same query is fast for one customer and slow for another, and the four things you can do about it.",
    tags: "statistics histogram cardinality estimate parameter sniffing plan cache recompile optimize for local variable",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "29", id: "29-slow-query-patterns", part: PARTS[5],
    title: "The queries that are always slow",
    blurb: "A checklist of ten shapes. If a query is slow, it is almost certainly one of them.",
    tags: "slow query antipattern select star function on column implicit conversion or wildcard n+1 cursor scalar udf",
    req: "Ottimizzazione e tuning delle query",
  },
  {
    n: "30", id: "30-pagination", part: PARTS[5],
    title: "Pagination that scales",
    blurb: "OFFSET 100000 reads a hundred thousand rows in order to throw them away. Keyset pagination does not.",
    tags: "pagination offset limit fetch next keyset seek method cursor infinite scroll stable sort tie breaker",
    extra: "In no advert; in every application. Page 5 000 of a report is where OFFSET stops being acceptable.",
  },
  {
    n: "31", id: "31-big-tables", part: PARTS[5],
    title: "Big tables: partitioning, archiving, sharding",
    blurb: "Partition elimination, the sliding window, and the honest answer about when you need any of it.",
    tags: "partition partitioning range list hash elimination sliding window archive purge sharding vertical horizontal",
    extra: "Adverts say “grandi moli di dati” without saying what to do about it. This is what to do about it.",
  },
  {
    n: "32", id: "32-materialisation-and-caching", part: PARTS[5],
    title: "Materialised views, pre-aggregation and caching",
    blurb: "Trading freshness for speed on purpose, and the three questions to answer before you cache anything.",
    tags: "materialised materialized view indexed refresh incremental summary table pre aggregation cache invalidation staleness",
    req: "Reporting con SSRS e Power BI",
  },

  /* ---------------- Part 5 — Building it properly ---------------- */
  {
    n: "33", id: "33-views-procs-functions-triggers", part: PARTS[6],
    title: "Views, procedures, functions and triggers",
    blurb: "The four programmable objects, what each is genuinely for, and the one that causes most production incidents.",
    tags: "view stored procedure function scalar table valued trigger instead of after inline udf encapsulation",
    req: "Sviluppo di stored procedure, viste, funzioni e trigger",
  },
  {
    n: "34", id: "34-dynamic-sql-and-injection", part: PARTS[6],
    title: "Dynamic SQL and SQL injection",
    blurb: "How injection actually works, why parameters are not string escaping, and safe dynamic SQL when you must.",
    tags: "sql injection dynamic sql sp_executesql parameter binding prepared statement quotename escaping owasp",
    req: "Conoscenza dei principi di sicurezza dei dati e GDPR",
  },
  {
    n: "35", id: "35-security-and-gdpr", part: PARTS[6],
    title: "Users, roles, least privilege and GDPR",
    blurb: "GRANT and REVOKE, row-level security, encryption at rest vs in transit, and what GDPR asks of a schema.",
    tags: "grant revoke role least privilege row level security rls encryption tde masking gdpr pii retention audit",
    req: "Conoscenza dei principi di sicurezza dei dati e GDPR",
  },
  {
    n: "36", id: "36-migrations", part: PARTS[6],
    title: "Schema migrations and zero-downtime change",
    blurb: "Versioned migrations, the expand/contract pattern, and the ALTER that locks a table for eleven minutes.",
    tags: "migration flyway liquibase versioning expand contract backfill online ddl lock rollback forward only git",
    req: "Utilizzo di sistemi di versionamento (Git)",
  },
  {
    n: "37", id: "37-testing-sql", part: PARTS[6],
    title: "Testing SQL, and CI against a real engine",
    blurb: "Fixtures, transactional rollback, tSQLt and pgTAP, and why an in-memory fake is not a database.",
    tags: "test sql tsqlt pgtap unit test fixture seed transaction rollback testcontainers ci deterministic assertion",
    extra: "The thing that separates “writes SQL” from “ships SQL”. No junior advert asks. Every senior interview does.",
  },
  {
    n: "38", id: "38-the-orm-boundary", part: PARTS[6],
    title: "The ORM boundary",
    blurb: "What Hibernate, EF and Eloquent actually generate, N+1 seen from the database side, and when to drop to SQL.",
    tags: "orm hibernate entity framework eloquent doctrine n+1 lazy loading eager query log raw sql impedance",
    extra: "Most SQL you will be handed to fix was generated by an ORM. Reading it back is a distinct skill.",
  },

  /* ---------------- Part 6 — Data at work ---------------- */
  {
    n: "39", id: "39-oltp-vs-olap", part: PARTS[7],
    title: "OLTP vs OLAP and dimensional modelling",
    blurb: "Star schemas, fact and dimension tables, grain, and slowly changing dimensions type 1 and type 2.",
    tags: "oltp olap star schema snowflake fact dimension grain scd slowly changing surrogate key conformed kimball",
    req: "Reporting con SSRS e Power BI",
  },
  {
    n: "40", id: "40-etl-and-warehouses", part: PARTS[7],
    title: "ETL, ELT, warehouses and dbt",
    blurb: "SSIS in the Italian market, idempotent loads, watermarks, and why ELT won.",
    tags: "etl elt ssis dbt airflow pipeline staging incremental watermark cdc change data capture warehouse lakehouse",
    req: "Esperienza nello sviluppo ETL con SSIS",
  },
  {
    n: "41", id: "41-backup-restore-ha", part: PARTS[7],
    title: "Backup, restore, PITR and replication",
    blurb: "RPO and RTO in one sentence each, the backup nobody tested, and what replication does not protect you from.",
    tags: "backup full differential log restore point in time recovery rpo rto replication always on failover drill",
    req: "Gestione di backup, restore e manutenzione dei database",
  },
  {
    n: "42", id: "42-production-diagnosis", part: PARTS[7],
    title: "Diagnosing a slow database in production",
    blurb: "A method, not a guess: wait statistics, the top-ten list, blocking chains, and what to look at first.",
    tags: "wait statistics dmv pg_stat_statements slow log blocking chain top queries monitoring baseline incident triage",
    req: "Esperienza su ambienti di produzione",
  },
  {
    n: "43", id: "43-nosql-and-limits", part: PARTS[7],
    title: "NoSQL, and when relational is the wrong answer",
    blurb: "Document, key-value, column-family, graph — the honest trade, and how to say it in an interview.",
    tags: "nosql mongodb redis cassandra neo4j document key value column family graph cap theorem eventual consistency",
    req: "Competenze sui database piu richieste: SQL Server, Oracle e MongoDB",
  },

  /* ---------------- Part 7 — What the market actually runs ---------------- */
  {
    n: "44", id: "44-dialects", part: PARTS[8],
    title: "The dialects: SQL Server, Oracle, PostgreSQL, MySQL",
    blurb: "The same query in four dialects, the differences that matter, and how to answer “which do you know?”.",
    tags: "dialect t-sql pl/sql postgresql mysql mariadb oracle sqlite top limit rownum identity sequence isnull nvl",
    req: "Ottima conoscenza del linguaggio MS T-SQL",
  },
  {
    n: "45", id: "45-procedural-sql", part: PARTS[8],
    title: "Procedural SQL: T-SQL and PL/SQL",
    blurb: "Variables, control flow, cursors, error handling and packages — the two procedural dialects adverts name.",
    tags: "t-sql pl/sql declare begin end try catch raiserror throw exception cursor loop package anonymous block",
    req: "Esperienza in sviluppo PL/SQL a livello junior",
  },
  {
    n: "46", id: "46-italian-market", part: PARTS[8],
    title: "The Italian market: gestionali, ERP data and BI",
    blurb: "What an Emilia-Romagna software house actually asks a database developer to do on a Tuesday morning.",
    tags: "gestionale erp fatturazione elettronica sdi zucchetti teamsystem power bi report data warehouse italia",
    extra: "The single most useful chapter for actually getting hired here, and no advert can state it.",
  },

  /* ---------------- Part 8 — The human requirements ---------------- */
  {
    n: "47", id: "47-agile-and-rhythm", part: PARTS[9],
    title: "Agile, tickets and the daily rhythm",
    blurb: "Stand-up, sprint, backlog, estimate — what actually happens, and what to say when you are behind.",
    tags: "agile scrum sprint standup backlog estimate story point retrospective kanban ticket jira daily",
    req: "Metodologia Agile/Scrum",
  },
  {
    n: "48", id: "48-analysis-and-teamwork", part: PARTS[9],
    title: "Analysis, autonomy and teamwork",
    blurb: "How to turn “the report is wrong” into a specification, and how to ask for help without looking lost.",
    tags: "analysis requirements autonomy teamwork communication problem solving proattivita stakeholder question",
    req: "Eccellenti capacita di problem solving, proattivita e buon approccio al lavoro in team",
  },
  {
    n: "49", id: "49-your-cv", part: PARTS[9],
    title: "Your CV, LinkedIn and this project",
    blurb: "Italian CV conventions, the GDPR consent line, and how to write a bullet that contains a fact.",
    tags: "cv curriculum resume linkedin gdpr consenso cefr lingue bullet result portfolio github colloquio",
    extra: "The advert never asks for a good CV. The filter that reads it does.",
  },
  {
    n: "50", id: "50-the-screening-test", part: PARTS[9],
    title: "The screening test",
    blurb: "The take-home and the live exercise: what they really check, and the twelve queries that keep appearing.",
    tags: "screening test take home live coding exercise hackerrank whiteboard second highest salary duplicates top n",
    extra: "Written from the exercises actually set by Italian software houses for junior database roles.",
  },
  {
    n: "51", id: "51-the-interview", part: PARTS[9],
    title: "The interview",
    blurb: "Mi parli di lei, the technical round, the questions to ask them, and how to talk about money.",
    tags: "interview colloquio mi parli di lei domande ral stipendio negotiation technical round hr feedback",
    req: "Buone capacita comunicative",
  },
];

self.PARTS = PARTS;
self.CHAPTERS = CHAPTERS;
