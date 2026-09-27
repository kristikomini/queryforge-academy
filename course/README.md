# The deep course

The site explains a topic well enough to hold a conversation about it. The course
is meant to make you **dangerous** with it: fewer topics, much further in, with a
lab you have to actually solve.

> **Read a chapter to understand a topic. Work the module to be dangerous with
> it.**

Markdown, read in an editor, not served by the site. That is deliberate: this
half is read the way you read a book, with the repository open beside it.

---

## What is here

| File | What it is |
| --- | --- |
| **[GOLDEN-RULES.md](GOLDEN-RULES.md)** | All 518 rules from every chapter's card, in chapter order, with two priority tiers at the top. **Generated** — do not edit it. |
| **[TIERS.md](TIERS.md)** | The only hand-curated input: which twelve rules decide interviews and which six separate a senior candidate. |
| **[LAWS-OF-SQL.md](LAWS-OF-SQL.md)** | The same knowledge reorganised **by concept** into twelve books, so that when something surprises you it is findable by *what kind of thing it was*. |
| **[SOLUTIONS.md](SOLUTIONS.md)** | Worked answers to the labs, with the reasoning. |
| **[modules/](modules/)** | The deep modules, in the five-part shape below. |

---

## The five-part shape

Every module has the same five sections, in the same order, and the order is the
argument:

1. **The idea** — what the concept is and what problem it solves.
2. **In this codebase** — the exact files that use it, by path. Reading the code
   and reading its explanation should be one gesture, not two.
3. **Do it** — a lab, a deliberate breakage to observe, or a measurement to take.
   Not optional. This is the part that does the work.
4. **Golden rules** — the module compressed into a dozen sentences. These are the
   same cards the site's chapters carry, and the viva drills them.
5. **Interview questions** — what you will actually be asked, with the answer
   sketched rather than scripted.

---

## The modules

All twenty-four are written, against the plan in
[`PLAN.md`](../PLAN.md). Each carries the five-part shape above, and each one's
golden-rules card is checked against [GOLDEN-RULES.md](GOLDEN-RULES.md) by
[`tools/doctor.mjs`](../tools/doctor.mjs) — so a rule reworded in a chapter breaks
the build here rather than leaving a module quietly teaching the old wording.

The **Covers** column gives the site chapter numbers each module goes deeper
into, and the grouping is the site's own part structure. Module numbers are in
the order the modules were written, so they do not run consecutively down the
table: a module id is the stable name of a directory, and renumbering it would
break every link that already points there.

**Part 1 — The relational foundation**

| Module | Covers |
| --- | --- |
| [01 · Reading a query plan](modules/module-01-reading-plans/README.md) | 25, 26, 27, 29 |
| [02 · Modelling a real domain](modules/module-02-modelling/README.md) | 02, 03, 04, 05 |
| [05 · The engine underneath](modules/module-05-the-engine/README.md) | 01 |
| [06 · How a SELECT is really evaluated](modules/module-06-select-evaluation/README.md) | 06 |

**Part 2 — Querying**

| Module | Covers |
| --- | --- |
| [07 · Predicates, dates and the half-open range](modules/module-07-predicates-and-dates/README.md) | 07, 17 |
| [08 · The join and the fan-out](modules/module-08-joins-and-fanout/README.md) | 08, 11 |
| [09 · NULL and three-valued logic](modules/module-09-null-logic/README.md) | 09, 16 |
| [10 · Aggregation, grain and set operations](modules/module-10-aggregation-and-grain/README.md) | 10, 15, 16 |
| [11 · CTEs and recursive queries](modules/module-11-ctes-and-recursion/README.md) | 12 |
| [12 · Window functions](modules/module-12-window-functions/README.md) | 13 |
| [13 · Frames, gaps and islands](modules/module-13-frames-and-islands/README.md) | 14 |
| [14 · JSON and semi-structured data](modules/module-14-json/README.md) | 18 |

**Part 3 — Changing data**

| Module | Covers |
| --- | --- |
| [03 · Concurrency you can defend](modules/module-03-concurrency/README.md) | 21, 22, 23, 24 |
| [04 · Making a load idempotent](modules/module-04-idempotency/README.md) | 19, 20, 40 |

**Part 4 — Fast at scale**

| Module | Covers |
| --- | --- |
| [15 · Statistics, cardinality and parameter sniffing](modules/module-15-statistics-and-sniffing/README.md) | 28 |
| [16 · Pagination that scales](modules/module-16-pagination/README.md) | 30 |
| [17 · Big tables and pre-aggregation](modules/module-17-big-tables/README.md) | 31, 32 |

**Part 5 — Building it properly**

| Module | Covers |
| --- | --- |
| [18 · Views, procedures, functions and triggers](modules/module-18-views-procs-triggers/README.md) | 33, 45 |
| [19 · Dynamic SQL and SQL injection](modules/module-19-injection/README.md) | 34 |
| [20 · Least privilege and GDPR](modules/module-20-security-and-gdpr/README.md) | 35 |
| [21 · Migrations under load](modules/module-21-migrations/README.md) | 36 |
| [22 · Testing SQL against a real engine](modules/module-22-testing-sql/README.md) | 37 |
| [23 · The ORM boundary](modules/module-23-orm-boundary/README.md) | 38 |

**Part 6 — Data at work**

| Module | Covers |
| --- | --- |
| [24 · Dimensional modelling for reporting](modules/module-24-dimensional-modelling/README.md) | 39, 46 |

---

## Honesty about this half

The site is finished: 62 chapters, 639 questions, every cross-reference checked
by [`tools/doctor.mjs`](../tools/doctor.mjs). The modules are finished too, and
the honest part is **what they deliberately do not cover**.

The module set is the *technical core*. It does not add a module for Part 0's ten
introductory chapters, which are already the gentlest thing here and have nothing
to go deeper into; nor for the operational and human chapters — backup and
restore, diagnosing production, NoSQL, the dialects, and chapters 47 to 51 on
tickets, teamwork, your CV and the interview. Those are carried by the site, by
[GOLDEN-RULES.md](GOLDEN-RULES.md) and by the viva, all of which cover all 62
chapters.

That is a scope decision rather than an omission, and the reason is the one this
half opens with: a module exists to make you *dangerous* with something, and it
earns its place only when there is a lab to solve or a measurement to take. "Read
the chapter and then rehearse the answer out loud" is what the viva and the
simulator are for, and wrapping those chapters in a module with no lab in it
would be ceremony.

If you are reading this repository as portfolio code, the claim is therefore
narrow and checkable: every module is written, every module's rules card is
verified against the generated rule set, every lab in
[`reference/labs/`](../reference/labs/) is the exercise of at least one module,
and the chapters with no module are listed above rather than left for you to
notice.
