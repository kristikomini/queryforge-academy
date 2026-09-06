-- =============================================================================
--  QueryForge accounts service — SCHEMA
--
--  Four tables. This file, together with queries.sql, IS the service: the Node
--  process around it is deliberately thin glue and says so in its own comments.
--  A SQL developer's portfolio is a schema and a query catalogue, not a routing
--  table — see api/README.md for why that decision was made.
--
--  Applied on first run when the table list is empty. That is create-if-missing,
--  NOT migrations, and the trade is right *here* and wrong almost everywhere
--  else: a single instance, a small schema, no upgrade history worth preserving.
--  In a multi-instance deployment the same shortcut races on startup and forces
--  the runtime account to hold schema-altering permissions. If this ever grows a
--  second instance, the fix is real migrations run as a separate pipeline step.
--
--  Covered in: site/chapters/36-migrations.html
--              site/chapters/35-security-and-gdpr.html
-- =============================================================================

PRAGMA journal_mode = WAL;      -- readers do not block the writer
PRAGMA foreign_keys = ON;       -- SQLite does not enforce them unless you ask
PRAGMA busy_timeout = 5000;     -- wait rather than fail instantly on a lock

-- ------------------------------------------------------------------- users --

CREATE TABLE IF NOT EXISTS users (
  id                    TEXT    PRIMARY KEY,   -- UUID v7: time-ordered, so inserts
                                               -- stay at the end of the index instead
                                               -- of scattering. See chapter 03.
  -- THERE IS NO EMAIL COLUMN, AND THAT IS THE POINT.
  -- An address this service could never send to could never be verified, never
  -- be written to and never recover an account — so storing one would be
  -- personal data collected for no purpose, which is exactly what GDPR's
  -- data-minimisation principle exists to stop. See chapter 35.
  username              TEXT    NOT NULL,      -- stored ALREADY NORMALISED: trimmed,
                                               -- lower-cased. Normalising on read
                                               -- means the unique index is on the
                                               -- wrong thing.
  display_name          TEXT    NOT NULL,

  -- Password verifier. The algorithm and its parameters are stored INSIDE the
  -- string (scrypt$N$r$p$salt$hash), so raising the cost later does not
  -- invalidate existing accounts: an old hash still verifies against its own
  -- parameters and is silently re-hashed on the next successful sign-in.
  -- That is why there is no separate salt or iterations column.
  password_hash         TEXT    NOT NULL,

  -- Only the SHA-256 of the recovery code is stored. Note the asymmetry with
  -- the password, and keep it: this secret is ~100 bits of CSPRNG output, so a
  -- fast hash costs an attacker nothing to begin with. A slow hash only ever
  -- buys anything against a low-entropy, human-chosen secret.
  recovery_code_hash    TEXT    NOT NULL,
  recovery_code_at      TEXT    NOT NULL,

  created_at            TEXT    NOT NULL,
  last_sign_in_at       TEXT    NULL,

  -- Lockout is a PER-ACCOUNT defence: it stops credential stuffing against one
  -- login. The rate limiter is a PER-IP defence: it stops a spray across many
  -- accounts. Neither substitutes for the other. See chapter 35.
  failed_attempts       INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT    NULL,

  -- Opt-OUT, not opt-in. You are visible by default and one click removes you.
  show_on_leaderboard   INTEGER NOT NULL DEFAULT 1,

  CONSTRAINT uq_users_username    UNIQUE (username),
  CONSTRAINT ck_users_username    CHECK (LENGTH(username) BETWEEN 3 AND 32),
  CONSTRAINT ck_users_display     CHECK (LENGTH(display_name) BETWEEN 1 AND 60),
  CONSTRAINT ck_users_attempts    CHECK (failed_attempts >= 0),
  CONSTRAINT ck_users_leaderboard CHECK (show_on_leaderboard IN (0, 1))
);

-- ---------------------------------------------------------------- profiles --

CREATE TABLE IF NOT EXISTS profiles (
  user_id           TEXT    PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

  -- THE WHOLE PROGRESS DOCUMENT, AS A BLOB. Deliberately.
  -- Its shape is owned by the browser and changes with every learning feature —
  -- a new badge, a new counter, a different card field. Modelling it relationally
  -- means a migration per badge, for data that is never queried by its parts:
  -- the server only ever reads and writes the whole thing.
  document          TEXT    NOT NULL,

  -- Optimistic concurrency, hand-written. Every write is
  --   UPDATE ... WHERE user_id = ? AND revision = ?
  -- and zero rows affected means somebody else got there first -> 409 carrying
  -- the current document. See chapter 24.
  revision          INTEGER NOT NULL DEFAULT 1,

  client_updated_at TEXT    NOT NULL,   -- the client's own stamp, used by its merge
  updated_at        TEXT    NOT NULL,

  -- The four figures the leaderboard ORDERS BY, denormalised from the document
  -- on every write. Querying inside a JSON column across two engines is exactly
  -- the sort of cleverness that stops working when somebody switches engine.
  --
  -- They are RE-DERIVED SERVER-SIDE, never trusted from a client summary: the
  -- document is the learner's own data and there is no point policing it, but
  -- the leaderboard is shared, and a number appearing beside other people's
  -- names should not be one the browser simply asserted.
  -- The document remains the source of truth; these are copies.
  xp                INTEGER NOT NULL DEFAULT 0,
  mastery_percent   REAL    NOT NULL DEFAULT 0,
  streak_days       INTEGER NOT NULL DEFAULT 0,
  chapters_passed   INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT ck_profiles_revision CHECK (revision > 0),
  CONSTRAINT ck_profiles_xp       CHECK (xp >= 0),
  -- Clamped, because a hand-edited profile must not be able to show 4000%.
  CONSTRAINT ck_profiles_mastery  CHECK (mastery_percent BETWEEN 0 AND 100),
  CONSTRAINT ck_profiles_streak   CHECK (streak_days >= 0),
  CONSTRAINT ck_profiles_passed   CHECK (chapters_passed >= 0)
);

-- The leaderboard's only query is "top 50 by xp, among users who have not opted
-- out". The visibility flag lives on `users`, so it cannot be a partial index
-- here; this index supplies the ORDER BY so the query is a short index scan
-- rather than a sort of every profile. See chapter 26.
CREATE INDEX IF NOT EXISTS ix_profiles_leaderboard ON profiles (xp DESC);

-- ----------------------------------------------------------- refresh tokens --

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id                     TEXT    PRIMARY KEY,
  user_id                TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Only the SHA-256 is stored. A refresh token is a BEARER credential, so a
  -- stolen database dump must not hand over working sessions.
  token_hash             TEXT    NOT NULL,

  expires_at             TEXT    NOT NULL,
  created_at             TEXT    NOT NULL,
  revoked_at             TEXT    NULL,
  -- Rotation trail. If a token that was already used turns up again, the server
  -- cannot tell a thief from a client that lost a response — so it revokes
  -- EVERY session for that user. See api/README.md, decision 4.
  replaced_by_token_hash TEXT    NULL,

  CONSTRAINT uq_refresh_hash UNIQUE (token_hash)
);
-- The index a foreign key does NOT create for you. Without it, deleting a user
-- scans this table. See chapter 04.
CREATE INDEX IF NOT EXISTS ix_refresh_user ON refresh_tokens (user_id);

-- ---------------------------------------------------- password reset tokens --

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         TEXT    PRIMARY KEY,
  user_id    TEXT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL,
  expires_at TEXT    NOT NULL,
  created_at TEXT    NOT NULL,
  used_at    TEXT    NULL,          -- single use: spent, not deleted, so a replay
                                    -- is distinguishable from an unknown token

  CONSTRAINT uq_reset_hash UNIQUE (token_hash)
);
CREATE INDEX IF NOT EXISTS ix_reset_user ON password_reset_tokens (user_id);

-- ------------------------------------------------------------- rate limits --

-- A small table keyed by (ip, minute). Per-IP, on /api/auth/* only.
-- /api/health is deliberately outside the limiter: a liveness probe that can be
-- rate-limited is a liveness probe that reports an outage it caused.
CREATE TABLE IF NOT EXISTS rate_limits (
  ip     TEXT    NOT NULL,
  minute TEXT    NOT NULL,          -- 'YYYY-MM-DDTHH:MM'
  hits   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (ip, minute)
);
