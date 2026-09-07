# QueryForge Academy

**A free, offline-capable SQL course that starts at &ldquo;what is a database&rdquo;
and ends at a screening test — built backwards from real Italian job adverts, with
every line of every code example commented and a learning engine that measures
whether you can recall the material rather than whether you scrolled past it.**

**Live: [kristi2002.github.io/queryforge-academy](https://kristi2002.github.io/queryforge-academy/)**
— everything except the accounts service, which needs a server. The site detects
that and says so rather than failing quietly.

```bash
node tools/serve.mjs          # the site alone           → http://localhost:4321
node api/server.mjs           # the site + accounts API  → http://127.0.0.1:5057
node tools/doctor.mjs         # the integrity gate       (12 checks)
node api/tests/run.mjs        # the API test suite       (75 tests)
```

No install, no build step, no dependencies. Node 22+ and it runs. Every page is a
real `.html` file — you can also just open `site/index.html` from disk.

---

## What is here

| Deliverable | What it is |
| --- | --- |
| **`site/`** | The platform. 62 chapters, 639 questions, 518 golden rules, a spaced-repetition engine, a viva, a timed mock interview, a real SQL playground, an Italian language layer, a glossary and a CV linter. Static HTML and vanilla JS. Works from `file://`. |
| **`api/`** | The accounts service. Zero-dependency Node host over SQLite, with **all of its logic in `api/sql/*.sql`**. Carries progress between devices, and doubles as portfolio code. |
| **`reference/`** | A commented order-fulfilment **database** — state machine, optimistic concurrency, transactional outbox — plus graded labs and runnable demos. |
| **`course/`** | The golden rules, the priority tiers, and worked solutions to the labs. |
| **`tools/`** | The integrity gate and the generators. |
| **`docs/DEPLOY.md`** | How to publish it: Vercel, Cloudflare, Netlify, Pages, or a container with the accounts service. |

### The numbers

| | |
| --- | --- |
| Chapters | **62**, across nine parts |
| Questions | **639**, 10–12 per chapter |
| Golden rules | **518**, of which 12 are tier one and 6 are tier two |
| Glossary terms | **128** |
| Italian chapter panels | **50** of 62, deliberately |
| Labs and demos | 7 + 4 |
| API endpoints | 14 |
| Annotated code examples | **223**, every line commented |
| Explained SQL tokens | **485** in the dictionary |
| Tests | 75 API + 12 integrity checks |
| Dependencies | **0** |

---

## The eight decisions that carry the design

Drop any one of these and it becomes an ordinary tutorial site.

**1 · Built from real job adverts, and honest about coverage.** Every chapter
declares either the advert line it answers (`req`) or why it exists although none
asked (`extra`). The home page renders both as tables, so the claim *"nothing in
the adverts is uncovered"* is verifiable rather than asserted. See
[`docs/ADVERTS.md`](docs/ADVERTS.md).

**2 · Every concept explained twice.** A 🧒 box — the version you would give a
child — and a 🎓 box — the version you would give an interviewer. A switch in the
top bar hides one, which turns any chapter into a self-test: read the simple one,
produce the professional one from memory.

**3 · It starts at zero, and says so.** Part 0 is ten chapters that assume
nothing: what a database is, how to get one in front of you, what a table is, then
`SELECT`, `WHERE`, `ORDER BY`, expressions and types, `INSERT`/`UPDATE`/`DELETE`,
a first join and a first `GROUP BY`. They are numbered 0A–0J rather than
renumbered into the existing sequence, because a chapter id is the key a learner's
progress, notes and review schedule are stored under — and renumbering would
silently reassign somebody's history to a different chapter.

**4 · Every line of every code example is commented, and every token is
explained.** Not as a promise: as a build failure. `tools/doctor.mjs` reads all
223 code blocks and fails if a line has no comment, if a block has no caption, or
if it uses a keyword, function, operator or type that is not in
[`site/assets/syntax.js`](site/assets/syntax.js). Under each block the site then
generates a **syntax anatomy** — what each token is, what it does here, and what
it does to *types*, including every implicit conversion — from that one
dictionary, so the explanation of `COALESCE` is the same sentence in every
chapter and correcting it corrects it everywhere. Runnable examples carry a
button that opens them in the playground.

**5 · Progress is measured by retrieval, never by scrolling.** A chapter is worth
25% for reading and 75% for the test score. Read every chapter and answer nothing
and you are capped at 25%.

**6 · Recognition and recall are different skills, drilled separately.** Multiple
choice measures recognition; an interview measures recall. So there is a
[viva](site/viva.html) that hides the answer until you have committed to one, and
a [simulator](site/simulate.html) that adds a clock and takes the options away.

**7 · No server, no build step, no network.** Every page is a real file, the
shared navigation is generated by a plain `<script>` so it works from `file://`,
and the SQL playground runs a **real SQLite engine vendored locally** — 700 KB of
WebAssembly, no CDN. Save the folder to a USB stick and all of it still works.

**8 · The accounts service keeps its logic in SQL.** Every statement it runs is a
named entry in [`api/sql/queries.sql`](api/sql/queries.sql); the schema is the
portfolio piece and the Node process is deliberately thin glue. A consequence
worth noticing: there is no string concatenation anywhere in that service, so
injection is structurally impossible rather than merely avoided.

---

## The integrity gate

Almost everything valuable here is a **cross-reference**, and a cross-reference
is the one kind of content that rots without a symptom. A broken build shouts. A
link to a chapter renamed six weeks ago says nothing at all, to anybody, ever.

```
node tools/doctor.mjs
```

| Check | What it couples |
| --- | --- |
| `site/manifest` | Manifest entries ⇄ chapter files, and `data-chapter` ⇄ filename |
| `site/links` | Every relative link and in-page anchor resolves |
| `site/quiz-bank` | Every chapter has questions; every answer index is inside its own options array |
| `site/quiz-ids` | Question ids against a lockfile — **catches a reordered or deleted question** |
| `viva/deck` | `rules.js` is in step with `GOLDEN-RULES.md` |
| `course/golden-rules` | Each chapter's card ⇄ the collected page |
| `docs/links` | Every markdown link resolves |
| `site/generated` | `forge-db.js` ⇄ the schema, and the service-worker cache name ⇄ a content hash |
| `code/covered-in` | Every `Covered in:` comment points at a file that exists |
| `reference/labs` | Every lab is listed in its README |
| `docs/counts` | **Every number adjacent to a counted noun** matches reality — digits and words alike, within one sentence |
| `site/code-anatomy` | **Every code line carries a comment**, every block has a caption and a language, and every token it uses is in the syntax dictionary |

Three of these are deliberate improvements on the design this was ported from, and
both fix documented bugs in it:

- **The counts check is inverted.** The original matched a fixed list of sentence
  patterns, so any prose stating a count in wording nobody had registered was
  simply not checked — and three such sentences had drifted. This version finds
  *every* number next to a counted noun and requires it to match, with an
  allowlist where each entry carries a reason. It reads **words as well as
  digits**, which it did not at first: after Part 0 landed, the home page still
  greeted visitors with the old count spelled out as "Fifty-two", and the check
  walked straight past it. The same lesson the inversion was for, in a new
  spelling — found by looking at the deployed site rather than by the gate.
- **The service-worker cache name is derived from a content hash**, not bumped by
  hand. Forgetting that bump is the single most common service-worker bug:
  returning visitors keep last month's chapters and nothing reports an error.
- **The code annotation is enforced rather than promised.** &ldquo;Every line is
  commented&rdquo; is the kind of claim that is true on the day it is written and
  false six edits later, silently — so it is a check. The same check requires
  every token to exist in the dictionary, which is what stops the generated
  anatomy from being quietly incomplete.

---

## Known limits, stated rather than hidden

- **The mastery percentage** is a fact about your scores on *these* questions. It
  is not a fact about your ability and certainly not about whether anyone will
  hire you.
- **The viva and the simulator are self-marked.** That is the weakest link in the
  platform and it is mitigated, not solved: your own words stay on screen beside
  the model answer, and the rule's code terms are matched literally so *"you
  never mentioned `SKIP LOCKED`"* is at least a fact. It cannot tell whether you
  were right.
- **The leaderboard is a nudge, not an audit.** Your progress document lives in
  your browser and you can edit it. The server re-derives the figures rather than
  trusting the browser's summary, which raises the effort slightly and proves
  nothing.
- **A lost recovery code is a lost account.** There is no email address on file,
  so there is no way round it.
- **The seed data is synthetic** — deterministic arithmetic, not a real business.
  Plausible, and not real.
- **SQLite cannot demonstrate everything.** Chapters 22 and 23 need a server
  engine for isolation and locking, and say so, with the Docker one-liner.
- **Offline is verified** on the live deployment: the worker registers, precaches
  the whole site — every chapter, plus the 660 KB WebAssembly engine, 88 entries
  in all — serves a page it never navigated to straight from the cache, and
  caches nothing under `/api/`. It could not be tested during development, since
  the browser available there disables service workers including a one-line one,
  so this was confirmed against GitHub Pages instead.
- **The adverts date fast.** If you are using this to get a job, collect current
  postings and check them against the coverage table. Where they disagree, the
  postings are right.

---

## Repository layout

```
site/                     the platform — static HTML + vanilla JS, no build step
  chapters/*.html           62 hand-written chapters
  assets/chapters.js        THE MANIFEST — the single source of truth
  assets/quizzes-{1,2,3}.js the question bank, append-only
  assets/rules.js           GENERATED viva deck
  assets/syntax.js          THE TOKEN DICTIONARY — every keyword, function and type
  assets/codex.js           renders the syntax anatomy under every code example
  assets/store.js           the learning engine; the only file that touches storage
  assets/forge-db.js        GENERATED from reference/schema/*.sql
  vendor/sql.js/            a real SQLite engine, vendored, for the playground
  sw.js                     offline; the cache name is stamped from a content hash

api/                      the accounts service
  sql/schema.sql            four tables, every decision commented in place
  sql/queries.sql           THE QUERY CATALOGUE — every statement, named
  src/, server.mjs          deliberately thin glue
  tests/                    75 tests against a real engine

reference/                the reference database
  schema/                   order fulfilment: state machine, concurrency, outbox
  labs/                     graded exercises, deliberately red
  demos/                    runnable demonstrations of invisible behaviour

course/                   GOLDEN-RULES.md (generated), TIERS.md, SOLUTIONS.md
tools/                    doctor.mjs, viva-deck.mjs, stamp-sw.mjs, serve.mjs
docs/ADVERTS.md           where the requirements came from
docs/DEPLOY.md            how to publish it, and what each host needs

vercel.json               Vercel      — static, no build step
wrangler.jsonc            Cloudflare  — static assets, plus worker.mjs
worker.mjs                four lines: serve /index.html at /, without a redirect
netlify.toml              Netlify     — static, no build step
Dockerfile                the WHOLE platform, site + accounts API, in one container
```

### Adding a chapter

1. Add an entry to `site/assets/chapters.js` with a `req` or an `extra`.
2. `node tools/new-chapter.mjs` — stamps the skeleton. It never touches an
   existing file.
3. Write the body. The `<div class="rules">` card is picked up by the viva deck.
   Every code example goes in a `<figure class="codex" data-lang="…">` with a
   `<figcaption>`, a comment on every line, and `data-run` if it runs against the
   reference database. Any token the dictionary does not know fails the gate —
   add it to `site/assets/syntax.js` rather than deleting the check.
4. Add its questions to a `quizzes-*.js` file. **Append only, never reorder** —
   the index is the key a learner's review schedule is stored under.
5. `node tools/viva-deck.mjs && node tools/stamp-sw.mjs && node tools/doctor.mjs --fix-lock`

Nothing else enumerates chapters: not the sidebar, not the pager, not the
coverage tables, not the service worker's precache list.

---

## Deploying it

```bash
npx vercel deploy --prod            # Vercel      — reads vercel.json
npx wrangler deploy                 # Cloudflare  — reads wrangler.jsonc
npx netlify deploy --prod           # Netlify     — reads netlify.toml
git push                            # GitHub Pages — .github/workflows/pages.yml
```

All four publish `site/`, which is the course and everything that runs in the
browser. There is no build step to configure and nothing to install.

Two of them are wired to `git push`: `.github/workflows/pages.yml` publishes to
GitHub Pages, and `.github/workflows/cloudflare.yml` publishes to Workers once a
`CLOUDFLARE_API_TOKEN` secret exists — and skips itself with a notice until it
does. Both refuse to publish unless the integrity gate passes.

The accounts service is the exception: it needs a persistent process and a
writable disk, so it is not a static deployment. The `Dockerfile` serves the site
**and** the API from one process, for any host that takes a container.

[`docs/DEPLOY.md`](docs/DEPLOY.md) has the details, including the one setting on
each host that matters — every one of them is a variation on *do not redirect
`.html` URLs*, because the service worker precaches explicit paths and a redirect
breaks that quietly.

---

## Provenance and licence

Written as a port of a `.NET`→`PHP` platform blueprint, with SQL as the subject.
The machinery is the blueprint's; the subject matter, the reference database, the
query catalogue and the two integrity improvements above are this build's.

**There is no `LICENSE` file yet, so the default applies: all rights reserved.**
That is deliberate rather than an oversight — choosing a licence is the author's
decision, not the builder's. If you want people to be able to use, adapt or
teach from this, add one; MIT is the conventional choice for a repository like
this, and Creative Commons (CC BY-SA) is the usual choice when the *prose* is the
point.

The one dependency-shaped thing here is vendored, not installed:
[`site/vendor/sql.js`](site/vendor/sql.js) is [sql.js](https://github.com/sql-js/sql.js)
1.13.0, MIT licensed, redistributed with its
[LICENSE](site/vendor/sql.js/LICENSE) intact.
