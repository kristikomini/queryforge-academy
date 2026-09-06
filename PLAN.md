# QueryForge Academy — build plan

Derived from `BLUEPRINT.md` (the LogiFlow/.NET → PHP spec), with **SQL** as the subject.

## The one decision the blueprint forces me to make first

The blueprint's principle #6 says *"the accounts service is written in the language being taught,
and doubles as portfolio code."* SQL is not a general-purpose application language, so a literal
port is impossible. The honest adaptation, and the one this build takes:

> **The accounts service keeps its logic in SQL.** Every endpoint is a named, parameterised
> statement in `api/sql/*.sql`. The schema — constraints, indexes, generated columns, a view that
> the leaderboard reads, optimistic concurrency done with `WHERE revision = ?` — is the portfolio
> piece. The host process (Node, **zero dependencies**, `node:sqlite`) is deliberately thin glue
> and says so in its own comments. A SQL developer's portfolio is a schema and a query catalogue,
> not a routing table.

That decision is written up in `api/README.md`, not hidden.

## Subject mapping

| Blueprint (.NET / PHP) | This build (SQL) |
| --- | --- |
| One real job advert | Real Italian *SQL / Database Developer* adverts (Indeed, Glassdoor, Experis, Jooble, Sep 2026) |
| C# language chapters | Relational model, dialect differences, T-SQL / PL-SQL / PostgreSQL |
| EF Core / ORM chapters | The ORM boundary — what it generates and when to drop to SQL |
| ASP.NET pipeline | The query pipeline: parse → bind → optimise → execute |
| Reference app (`src/`) | Reference **database** (`reference/`) — the same order-fulfilment domain, as a schema |
| `LAWS-OF-CSHARP.md` | `LAWS-OF-SQL.md` |
| Architecture tests | Schema-integrity tests: every FK indexed, no `float` money, no nullable-without-reason |

## Deliverables

```
site/            THE PLATFORM.   Static HTML + vanilla JS. No build step. Works on file://
api/             THE SERVICE.    Node zero-dep host + SQLite; ALL logic in api/sql/*.sql
course/          THE DEPTH.      Markdown modules + GOLDEN-RULES.md + LAWS-OF-SQL.md
reference/       THE SYSTEM.     A commented order-fulfilment database, labs, demos, benchmarks
tools/           THE GATE.       doctor.mjs — the eleven checks + quiz-id lockfile
.github/         CI.             Six jobs that fail for six different reasons
```

## Numbers to hit

| Thing | Target |
| --- | --- |
| Site chapters | 52 |
| Quiz questions | 8–14 per chapter |
| Golden rules / viva cards | one card per module, ~10 claims each |
| Course modules | 24 |
| Badges | 21 |
| Levels | 8 |
| API endpoints | 14 |
| API tables | 4 |
| Integrity checks | 11 |

## Phases (each ends with something that works)

1. **Adverts → manifest.** `site/assets/chapters.js`, every entry carrying `req` or `extra`. ✅
2. **The shell.** `style.css`, `learn.css`, `site.js`, `index.html`. Sidebar, TOC, pager, search,
   theme, Simple/Pro switch — working from `file://`.
3. **The engine.** `store.js`, `quiz.js`, `learn.js`, `notes.js` + `dashboard/review/exam/notes`.
4. **Content in bulk.** 52 chapters and their question banks.
5. **The deep course.** Modules in the five-part shape + `GOLDEN-RULES.md`.
6. **The viva.** Deck generator, `viva.html`, `simulate.html`.
7. **The accounts service.** Contract §5.2, schema §5.3, decisions §5.4, tests §5.6.
8. **Offline.** `sw.js`, `manifest.webmanifest`.
9. **The gate.** Eleven checks, lockfile, CI. Built early, not last.

## Deliberately not reproduced (blueprint §11)

- The mastery denominator has **one** source: the server counts the manifest it serves.
- The counts check is **inverted** — it finds every number adjacent to a counted noun and
  requires it to match, with an explicit allowlist.
- The service-worker cache name is **derived from a content hash** by the gate, not hand-bumped.
