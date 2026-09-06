# The accounts service

Small enough to read in one sitting, and it contains — in about six files — most
of the list a junior database advert asks about: a schema with real constraints,
optimistic concurrency, a query catalogue, authentication, token rotation,
password hashing, middleware order, CORS, rate limiting and a documented
denormalisation.

It references nothing else in this repository and nothing references it. Two
systems sharing a repository and nothing else.

```bash
node api/server.mjs          # http://127.0.0.1:5057 — serves the site too
node api/tests/run.mjs       # 75 tests, against a real engine
```

No configuration, no install, no dependencies. Node 22+ and it runs.

---

## The decision this whole thing turns on

The blueprint this platform was built from says *"the accounts service is written
in the language being taught, and doubles as portfolio code."* SQL is not a
general-purpose application language, so a literal reading is impossible. The
honest adaptation:

> **The service keeps its logic in SQL.** Every statement it runs is a named
> entry in [`sql/queries.sql`](sql/queries.sql). The schema in
> [`sql/schema.sql`](sql/schema.sql) — constraints, indexes, cascade rules, a
> deliberate denormalisation, optimistic concurrency done with
> `WHERE revision = ?` — is the portfolio piece. The Node process is deliberately
> thin glue.

The consequence worth noticing: **there is no string concatenation anywhere in
this service.** `q("user_by_username").get(name)` looks up a statement written in
a `.sql` file. SQL injection is not *avoided* here, it is structurally
impossible — and the same property makes every query readable, diffable in
review, and runnable by hand in any client.

It is the yesql / pugsql / sqlc pattern, and it is what a SQL developer's
portfolio should look like.

---

## The endpoint contract

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/auth/register` | — | Create an account, sign in, return the **one-time recovery code** |
| `POST` | `/api/auth/login` | — | Sign in with a **username** and password |
| `POST` | `/api/auth/refresh` | — | Exchange a refresh token for a new pair |
| `POST` | `/api/auth/logout` | — | Revoke one refresh token |
| `POST` | `/api/auth/forgot-password` | — | Username + recovery code → a single-use reset ticket |
| `POST` | `/api/auth/reset-password` | — | Spend the ticket, set the password, get a fresh code |
| `POST` | `/api/auth/recovery-code` | Bearer | Replace the recovery code with a new one |
| `GET` | `/api/auth/me` | Bearer | The signed-in user |
| `GET` | `/api/profile` | Bearer | The stored progress document (**204** when there is none yet) |
| `PUT` | `/api/profile` | Bearer | Store it (**409** carrying the current document when the revision is stale) |
| `GET` | `/api/leaderboard` | Bearer | Top fifty who have not opted out |
| `PUT` | `/api/me/leaderboard?visible=` | Bearer | Show or hide yourself |
| `DELETE` | `/api/me` | Bearer | Delete the account, its progress and its sessions |
| `GET` | `/api/health` | — | Liveness. **Deliberately does not touch the database** |

Payloads are camelCase JSON both ways. Errors are
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) Problem Details with a
`traceId` extension: `401` for bad credentials, `409` for a taken username or a
stale revision, `413` for an oversized document, `423` for a locked account,
`429` for rate limiting.

```jsonc
// POST /api/auth/register  { username, displayName?, password }  → 201
{ "accessToken": "eyJ…", "refreshToken": "…", "expiresInSeconds": 900,
  "user": { "id": "uuid-v7", "username": "…", "displayName": "…" },
  "recoveryCode": "DX6TT-2GG21-NBPW4-5X61Y"   // ONLY on register and a completed reset
}

// PUT /api/profile  { data: {…}, updatedAt: "ISO", baseRevision: 7 }
//   200 → { data, updatedAt, revision }
//   409 → the same shape, carrying the CURRENT document
```

---

## The six decisions worth reading

### 1 · There is no email address, anywhere

The login is a username. There is no `email` column and no mail transport, and
those two facts are the same decision: **an address this service could never send
to could never be verified, never be written to and never recover an account** —
so storing one would be personal data collected for no purpose, which is
precisely what GDPR's data-minimisation principle exists to stop.

Which leaves the obvious question: how do you reset a password with no email?
Not by asking for the username and believing the answer — that is an account
takeover with a form around it. Every account is issued a **recovery code** at
registration: 20 characters of Crockford base32 (~100 bits), grouped in fives,
shown exactly once, stored only as a SHA-256 hash. Presenting it mints the reset
ticket an emailed link would otherwise have carried. It is spent on use and
replaced, and a learner who still has access can swap it for a new one at any
time. Normalisation is forgiving: case-insensitive, dashes and spaces stripped,
`I`/`L` → `1`, `O` → `0`, because somebody is typing it off paper.

What it honestly is **not** is proof that anyone can still reach you — an email
loop also confirms the mailbox works. **A lost code is a lost account**, and
[`account.html`](../site/account.html) says so in those words rather than
pretending there is a way round it.

### 2 · Passwords: scrypt, with the parameters inside the hash

Memory-hard, in the standard library, minimum ten characters. A plain fast hash
is the trap — strong *and fast*, and fast is the wrong property when the attacker
has a GPU and the secret was chosen by a human.

The stored form is `scrypt$N$r$p$salt$hash`, so the cost parameters travel with
the hash. Raising them later does not invalidate existing accounts: an old hash
still verifies against its own parameters and is silently re-hashed on the next
successful sign-in. That is the same decision as a per-user iteration count,
better expressed — and it is why there is no separate salt or iterations column.
Comparison is constant-time.

### 3 · A wrong password and an unknown account are indistinguishable

Same message, same status — and on the unknown-account path the server **burns
equivalent scrypt work** against a real dummy hash, so the timing does not leak
either. The login form must not be an account-enumeration oracle. The same
applies to `forgot-password`: a wrong recovery code and an unknown username fail
identically. Both are tested.

### 4 · Refresh tokens: hashed at rest, rotated, and a replay kills the family

32 random bytes, base64url. Only the SHA-256 is stored — a refresh token is a
bearer credential, so a stolen database dump must not hand over working sessions.
Every refresh issues a new token, marks the old one used, and records *which
token replaced it*. **If a used token turns up again**, the server cannot tell a
thief from a client that lost a response, so it revokes **every** session for
that user.

Note the asymmetry with the password, and keep it: a **fast** hash here where the
password needed a **slow** one. The reason is entropy. This token is 256 random
bits, so a fast hash costs an attacker nothing to begin with; scrypt's slowness
only ever buys anything against a low-entropy, human-chosen secret. The recovery
code follows the same rule.

### 5 · Lockout and rate limiting are different defences

Eight consecutive failures lock the account for fifteen minutes — **per account**,
which stops credential stuffing against one login. Ten requests a minute per IP on
`/api/auth/*` — **per IP**, which stops a spray across many accounts. Neither
substitutes for the other.

The lockout decision is made **in SQL**, in one statement:

```sql
UPDATE users
SET failed_attempts = failed_attempts + 1,
    locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END
WHERE id = ?;
```

Read-then-write would let two concurrent wrong passwords both read 7 and both
write 8. `/api/health` is deliberately outside the limiter: a liveness probe that
can be rate-limited reports an outage it caused.

### 6 · Static files above routing

This was a bug before it was a decision. Static-file middleware stands aside once
an endpoint has been matched, and the framework the original was written in
inserted its routing step at the *top* of the pipeline — so the catch-all `404`
route matched `/` first and **the home page 404ed while every other page worked**.

Serving static files **before** routing fixes it and is better anyway: the
tutorial is public, so a stylesheet should never pay for route matching, token
validation or a rate-limit permit. Three tests keep it that way, including one
that sets the limiter to 1/minute and then requests a stylesheet twenty times.

Pipeline order, which is behaviour, not taste:

```
exception handler → static files → routing → CORS
  → rate limiter (before auth: rejecting a flood should be cheap)
  → authentication → endpoints → catch-all 404 (anonymous)
```

**Two clocks are one clock.** Time is injected rather than `Date.now()` being
called in six places, because token expiry, lockout windows and streaks are all
time-dependent — and a test that has to wait fifteen real minutes to prove a token
expired is a test nobody runs. `api/tests/harness.mjs` supplies a `frozenClock`.

---

## The mastery formula, which exists twice

`mastery()` in [`site/assets/store.js`](../site/assets/store.js) and
[`src/mastery.mjs`](src/mastery.mjs) implement the same arithmetic, because the
browser needs it to draw a dashboard offline and the server needs it to
`ORDER BY`. Two implementations of one formula is exactly how two systems come to
disagree, so:

- **Rounding is half-up in both.** JavaScript's `Math.round` is half-up; .NET's
  default is banker's rounding, which is why the original had to ask for
  `MidpointRounding.AwayFromZero`. There is a test asserting 6.25 → 6.3.
- **The denominator has one source.** The server counts the chapters it serves.
  In the platform this was modelled on there were two — 47 in the site, 39 in an
  API config key — they drifted, and the leaderboard silently reported a higher
  mastery than the dashboard for the same profile.
  `tools/doctor.mjs` fails the build if anything under `api/` hard-codes a
  chapter count.
- **Everything is clamped.** The document is client-supplied; a hand-edited
  profile must not be able to show 4000%.

**Every read of the document is defensive.** It was produced by a browser that
may be running an older version of the site, so a missing or wrongly-typed
property is expected input, not an error. A malformed profile produces zeroes,
never a 500 — and it is stored back verbatim, because it is the learner's data
and the server is not in the business of correcting it.

The server **re-derives** the four leaderboard figures rather than trusting a
client summary. The document is the learner's own data and there is no point
policing it — but the leaderboard is shared, and a number appearing next to other
people's names should not be one the browser simply asserted. It is still not a
ranking of record, and [`leaderboard.html`](../site/leaderboard.html) says so.

---

## What the tests assert

75 tests against a **real** SQLite database in memory, through the real driver,
with the real schema applied — not a fake. An in-memory *fake* cheerfully passes
tests that fail against anything you would deploy.

Beyond the happy paths:

- a wrong password and an unknown account produce the **same** message
- a forged signature is rejected, and `alg: none` cannot select the algorithm
- a used refresh token cannot be replayed, and replaying one revokes the whole family
- a stale `baseRevision` gets a 409 **carrying the current document**, and the losing write changes nothing
- one learner cannot read another's profile
- a malformed progress document produces zeroes rather than a 500
- a mastery percentage cannot be inflated past 100 by a hand-edited profile
- rounding is half-up, and 6.25 becomes 6.3
- the rate limiter throttles repeated sign-ins **and leaves `/api/health` alone**
- every public page and asset is served anonymously, and every unknown path is a 404, not a 401
- path traversal cannot escape the site directory
- the two-device merge never removes anything, and is idempotent
- every URL the service worker precaches is really servable

---

## Configuration

Everything has a working default.

| Variable | Default | Notes |
| --- | --- | --- |
| `PORT` | `5057` | |
| `QF_DB` | `api/App_Data/accounts.db` | SQLite, created on first run |
| `QF_SITE_DIR` | `site/` | The static site this also serves |
| `QF_JWT_SECRET` | generated in development | **Required** elsewhere; startup fails without it |
| `QF_ACCESS_TTL` | `900` | 15 min — short, because a JWT cannot be revoked |
| `QF_REFRESH_TTL` | `2592000` | 30 days — stateful and revocable |
| `QF_LOCKOUT_AFTER` | `8` | Per account |
| `QF_AUTH_RPM` | `10` | Per IP, on `/api/auth/*` |
| `QF_MAX_DOC_BYTES` | `1048576` | 1 MiB |
| `QF_ORIGINS` | localhost ports + `null` | `null` is the origin a `file://` page sends |

The development signing key is generated on first run into a git-ignored file, so
restarting does not sign everybody out. **No key is committed** — anyone holding
it can mint a token for any user, which is not a theoretical concern in a public
repository.

---

## Known limits, stated rather than hidden

1. **Create-if-missing, not migrations.** Right *here* — a single instance, a
   small schema, no upgrade history worth preserving — and wrong almost
   everywhere else: the same shortcut races on startup with two instances and
   forces the runtime account to hold schema-altering permissions. The service
   detects a database that predates a schema change and fails with an
   instruction (including *export your profile first*) rather than a stack trace.

2. **SQLite is single-writer.** Correct and fully transactional, and the wrong
   choice for a concurrent write workload. At this scale it is the right trade
   and it needs no setup at all, which is worth more here than headroom nobody
   will use.

3. **The rate limiter trusts the socket address.** `X-Forwarded-For` is spoofable
   unless you are behind a proxy you control and are counting hops, and
   pretending otherwise turns the limiter into decoration. Running this behind a
   real proxy is a configuration decision to make explicitly.

4. **Offline behaviour is verified on the deployed site**, not here. The
   precache list is checked entry by entry against the running server and the
   cache name is derived from a content hash, but a service worker needs a real
   browser on a secure origin — and the one available during development
   disables them, including a one-line worker. Confirmed against GitHub Pages:
   the worker registers, precaches the whole site, serves a page from cache, and
   caches nothing under `/api/`, which is the part that matters here — a cached
   200 for "here is your profile" would be a lie with somebody's progress
   attached.
