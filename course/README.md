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
| **[GOLDEN-RULES.md](GOLDEN-RULES.md)** | All 456 rules from every chapter's card, in chapter order, with two priority tiers at the top. **Generated** — do not edit it. |
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

## Honesty about this half

The site is finished: 52 chapters, 529 questions, every cross-reference checked
by [`tools/doctor.mjs`](../tools/doctor.mjs). **The module set is not.** Four
modules are written, against a plan of roughly twenty.

That is stated here rather than implied by an empty directory, because a course
that quietly promises twenty modules and delivers four is exactly the kind of
thing this repository is supposed to refuse to do. The
[golden rules](GOLDEN-RULES.md) and [LAWS-OF-SQL.md](LAWS-OF-SQL.md) are complete
and cover all 52 chapters; the modules are the part still being written, and the
four that exist are the four whose labs already ship in
[`reference/labs/`](../reference/labs/).

| Module | State |
| --- | --- |
| [01 · Reading a query plan](modules/module-01-reading-plans/README.md) | written |
| [02 · Modelling a real domain](modules/module-02-modelling/README.md) | written |
| [03 · Concurrency you can defend](modules/module-03-concurrency/README.md) | written |
| [04 · Making a load idempotent](modules/module-04-idempotency/README.md) | written |
| Indexes end to end · Isolation in practice · The outbox · Testing SQL · Migrations under load · Dimensional modelling · … | planned |

If you are reading this repository as portfolio code, that table is the honest
part: the machinery is finished and checked, the deep course is a quarter
written, and pretending otherwise would undermine everything else it claims.
