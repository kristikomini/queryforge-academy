# The adverts this course was built from

Everything downstream of this file depends on it. The chapter manifest declares,
for every chapter, either the `req` line of an advert it answers or an `extra`
reason it exists although none did — and the home page renders those as two
tables, so *"nothing in the adverts is uncovered"* is checkable rather than
asserted.

**Collected September 2026** from Indeed Italia, Glassdoor Italia, Experis and
Jooble, searching for *SQL Developer*, *Database Developer*, *Programmatore SQL
Server* and *Sviluppatore PL/SQL* in Italy, with an Emilia-Romagna bias.

---

## Honesty about the sourcing

This matters more than the list, so it goes first.

- These are **requirement lines quoted from real postings**, aggregated across
  several adverts. They are not one advert reproduced verbatim, and no employer
  is named — reproducing a full posting is neither useful nor obviously
  permitted.
- Job adverts **date fast**. The technology mix here is what the Italian market
  was asking for in September 2026. The structural observations — that SQL Server
  dominates *gestionali*, that Oracle sits in banks and the public sector, that
  MySQL/MariaDB is the web tier — change much more slowly than the version
  numbers.
- **If you are using this course to get a job, redo this step.** Collect three to
  five current postings for the roles you are actually applying to and check them
  against the coverage table on the home page. Where they disagree, the postings
  are right and this file is old. That is not a caveat about the method; it *is*
  the method.
- Salary figures quoted in [chapter 46](../site/chapters/46-italian-market.html)
  and [chapter 51](../site/chapters/51-the-interview.html) are the fastest-dating
  content in the whole repository. Treat them as an order of magnitude.

---

## The requirement lines

Grouped by how often they appeared. The `req` strings in
[`site/assets/chapters.js`](../site/assets/chapters.js) are drawn from this list.

### In nearly every posting

| Line | Chapters |
| --- | --- |
| *Ottima conoscenza del linguaggio SQL* | 03, 06, 08, 09, 10, 11, 12, 13, 15, 17, 19 |
| *Ottimizzazione e tuning delle query* | 07, 25, 26, 27, 28, 29 |
| *Progettazione e modellazione di basi dati relazionali* | 02, 04, 05 |
| *Capacità di analisi e problem solving* | 48 |
| *Buone capacità comunicative e di lavoro in team* | 48, 51 |

### In most postings

| Line | Chapters |
| --- | --- |
| *Solida conoscenza di MS SQL Server (versione ≥ 2008)* | 01 |
| *Ottima conoscenza del linguaggio MS T-SQL* | 44 |
| *Sviluppo di stored procedure, viste, funzioni e trigger* | 33 |
| *Esperienza su ambienti di produzione* (usually "almeno 3 anni") | 21, 22, 23, 42 |
| *Metodologia Agile/Scrum* | 47 |
| *Buona conoscenza dell'inglese tecnico* | — (not a chapter; see below) |

### Common, and role-defining when present

| Line | Chapters |
| --- | --- |
| *Esperienza nello sviluppo ETL con SSIS* | 20, 40 |
| *Reporting con SSRS e Power BI* | 16, 32, 39 |
| *Esperienza in sviluppo PL/SQL a livello junior* | 45 |
| *Gestione di backup, restore e manutenzione dei database* | 41 |
| *Conoscenza dei principi di sicurezza dei dati e GDPR* | 34, 35 |
| *Le competenze sui database più richieste includono SQL Server, Oracle e MongoDB* | 43 |
| *Utilizzo di sistemi di versionamento (Git)* | 36 |

### Frequent, and deliberately not given a chapter

| Line | Why not |
| --- | --- |
| *Buona conoscenza dell'inglese tecnico* | Reading documentation. Almost nobody is tested on spoken English for these roles in Italy, and a chapter would be padding. |
| *Diploma o laurea in materie scientifiche* | Not something a course can supply. Worth knowing it filters CVs. |
| *Disponibilità a trasferte* | A logistics question, not a technical one. |
| *Conoscenza di ambienti cloud (Azure/AWS)* | Appears often but shallowly, and almost never as a real requirement for a junior database role. Named in [chapter 41](../site/chapters/41-backup-restore-ha.html) rather than given its own chapter — an honest call that could go the other way, and would if the next collection showed it hardening. |

---

## The ten chapters no advert asked for

These carry `extra` in the manifest instead of `req`. Each one has to justify
itself, and the justification is rendered on the home page.

| Ch. | Why it is here |
| --- | --- |
| 14 · Frames, running totals, gaps and islands | *"Find the consecutive runs"* and *"running balance"* appear in most technical screens. |
| 18 · JSON and semi-structured data | Every engine grew JSON support and every legacy schema now has a `settings` column. Nobody advertises it; everybody meets it. |
| 24 · Concurrency patterns | The reference database is built on these, and they are the fastest way to sound senior. |
| 30 · Pagination that scales | In no advert; in every application. Page 5 000 of a report is where `OFFSET` stops being acceptable. |
| 31 · Big tables | Adverts say *"grandi moli di dati"* without saying what to do about it. |
| 37 · Testing SQL | What separates *writes SQL* from *ships SQL*. No junior advert asks; every senior interview does. |
| 38 · The ORM boundary | Most SQL you will be handed to fix was generated by an ORM. |
| 46 · The Italian market | The single most useful chapter for actually getting hired here, and no advert can state it. |
| 49 · Your CV | The advert never asks for a good CV. The filter that reads it does. |
| 50 · The screening test | Written from the exercises Italian software houses actually set. |

---

## What the market looked like, in three observations

1. **SQL Server is the centre of gravity** for product companies and software
   houses selling *gestionali*, which is most of the employers in
   Emilia-Romagna. Oracle concentrates in banks, insurance and the public sector.
   PostgreSQL appears in newer product companies and almost never in a
   *gestionale*.

2. **"Tuning" is the most-repeated requirement after "SQL" itself**, and it is
   the clearest signal about what the job actually is: something is already slow,
   and the people who built it write application code. That is why Part 4 is the
   longest part of the course.

3. **The soft-skill lines are not filler.** *Problem solving*, *proattività* and
   *lavoro in team* appear as often as the technical requirements, and in Italian
   postings they are frequently the paragraph the hiring manager wrote themselves.
   [Chapter 48](../site/chapters/48-analysis-and-teamwork.html) takes them
   literally for that reason.

---

## Sources

The searches behind this collection:

- [Indeed Italia — Database Developer](https://it.indeed.com/q-database-developer-offerte-lavoro.html)
- [Indeed Italia — Programmatore SQL Server](https://it.indeed.com/offerte-lavoro-Programmatore-SQL-Server)
- [Indeed Italia — SQL](https://it.indeed.com/q-sql-offerte-lavoro.html)
- [Glassdoor Italia — SQL Developer](https://www.glassdoor.it/Lavoro/italia-sql-developer-lavori-SRCH_IL.0,6_IN120_KO7,20.htm)
- [Experis Italia — SQL Developer](https://www.experis.it/it/trova-lavoro/ict/sql-developer/1016391)
- [Jooble — conoscenza linguaggio SQL](https://it.jooble.org/lavoro-conoscenza-linguaggio-sql)
