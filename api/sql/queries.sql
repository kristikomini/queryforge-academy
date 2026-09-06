-- =============================================================================
--  QueryForge accounts service — THE QUERY CATALOGUE
--
--  Every statement the service runs, named, in one file. The Node process looks
--  them up by name; it does not build SQL. There is no string concatenation
--  anywhere in this service, which is not a coding-style preference — it is the
--  reason SQL injection is structurally impossible here rather than merely
--  avoided. See site/chapters/34-dynamic-sql-and-injection.html.
--
--  Format:  -- name: some_name
--           SELECT ...;
--  Parsed by api/src/db.mjs. It is the yesql / pugsql / sqlc pattern: SQL lives
--  in .sql files where it can be read, diffed, linted and run by hand.
--
--  Covered in: api/README.md
-- =============================================================================


-- ============================================================ users =========

-- name: user_by_username
-- The username is stored already normalised, so this is a plain equality seek
-- on the unique index. Normalising on read would mean the index is on the wrong
-- thing and every login becomes a scan.
SELECT * FROM users WHERE username = ?;

-- name: user_by_id
SELECT * FROM users WHERE id = ?;

-- name: insert_user
INSERT INTO users (id, username, display_name, password_hash,
                   recovery_code_hash, recovery_code_at, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?);

-- name: touch_sign_in
-- One statement resets the lockout state and records the sign-in. Doing it as
-- three separate updates would leave windows where the account is signed in but
-- still counted as failing.
UPDATE users
SET last_sign_in_at = ?, failed_attempts = 0, locked_until = NULL
WHERE id = ?;

-- name: record_failure
-- The lockout decision is made HERE, in SQL, not in the application. The
-- increment and the threshold test are one atomic statement, so two concurrent
-- wrong passwords cannot both read 7 and both write 8.
UPDATE users
SET failed_attempts = failed_attempts + 1,
    locked_until = CASE WHEN failed_attempts + 1 >= ? THEN ? ELSE locked_until END
WHERE id = ?;

-- name: update_password
UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL
WHERE id = ?;

-- name: update_recovery_code
UPDATE users SET recovery_code_hash = ?, recovery_code_at = ? WHERE id = ?;

-- name: set_leaderboard_visibility
UPDATE users SET show_on_leaderboard = ? WHERE id = ?;

-- name: delete_user
-- Everything else cascades: profiles, refresh_tokens and password_reset_tokens
-- all declare ON DELETE CASCADE. This is the one place in either schema where
-- cascade is right, because none of those rows has any existence independent of
-- the user. See site/chapters/04-ddl-and-constraints.html.
DELETE FROM users WHERE id = ?;


-- ========================================================= profiles =========

-- name: profile_by_user
SELECT document, revision, updated_at FROM profiles WHERE user_id = ?;

-- name: insert_profile
INSERT INTO profiles (user_id, document, revision, client_updated_at, updated_at,
                      xp, mastery_percent, streak_days, chapters_passed)
VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?);

-- name: update_profile
-- OPTIMISTIC CONCURRENCY, and the row count is the answer.
-- One row affected: committed. Zero rows: somebody else wrote since the caller
-- read, so the caller gets a 409 carrying the CURRENT document — which costs one
-- round trip instead of a refetch-and-guess.
-- See site/chapters/24-concurrency-patterns.html.
UPDATE profiles
SET document = ?, revision = revision + 1, client_updated_at = ?, updated_at = ?,
    xp = ?, mastery_percent = ?, streak_days = ?, chapters_passed = ?
WHERE user_id = ? AND revision = ?;

-- name: profile_revision
SELECT revision FROM profiles WHERE user_id = ?;


-- ====================================================== leaderboard =========

-- name: leaderboard
--  THE MASTERY FORMULA IS IMPLEMENTED TWICE — here and in mastery() in
--  site/assets/store.js — because the browser needs it to draw a dashboard and
--  the server needs it to ORDER BY. Two implementations of one formula is
--  exactly how two systems come to disagree, so:
--
--    * rounding is HALF-UP in both. SQLite's round() is half-up and JavaScript's
--      Math.round is half-up. .NET's default is banker's rounding, which is why
--      the original of this service had to ask for AwayFromZero explicitly.
--    * the DENOMINATOR has ONE source. The server counts the chapters it serves
--      rather than keeping its own configured number. In the platform this was
--      modelled on those two drifted — the site had 47 chapters and the API
--      config still said 39 — so the leaderboard reported a higher mastery than
--      the dashboard for the same profile. tools/doctor.mjs now fails the build
--      if anything under api/ hard-codes a chapter count.
--
--  The four figures below are read from the denormalised columns, which were
--  computed server-side from the document on write. They are not trusted from
--  the client.
SELECT u.id,
       u.display_name,
       p.xp,
       p.mastery_percent,
       p.streak_days,
       p.chapters_passed
FROM profiles p
JOIN users u ON u.id = p.user_id
WHERE u.show_on_leaderboard = 1
ORDER BY p.xp DESC, u.created_at ASC     -- tie-break, so the order is stable
LIMIT 50;


-- =================================================== refresh tokens =========

-- name: insert_refresh
INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at)
VALUES (?, ?, ?, ?, ?);

-- name: refresh_by_hash
SELECT * FROM refresh_tokens WHERE token_hash = ?;

-- name: revoke_refresh
UPDATE refresh_tokens SET revoked_at = ?, replaced_by_token_hash = ?
WHERE token_hash = ? AND revoked_at IS NULL;

-- name: revoke_all_for_user
-- Called when an already-used refresh token is presented again. The server
-- cannot tell a thief from a client that lost a response, so it assumes the
-- worse case and ends every session for that user.
UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL;

-- name: purge_expired_refresh
DELETE FROM refresh_tokens WHERE expires_at < ?;


-- ============================================== password reset tokens =======

-- name: insert_reset
INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
VALUES (?, ?, ?, ?, ?);

-- name: reset_by_hash
SELECT * FROM password_reset_tokens WHERE token_hash = ?;

-- name: spend_reset
-- Single use, enforced by the WHERE clause rather than by reading then writing.
-- Zero rows affected means it was already spent — which is a replay, and is
-- reported differently from an unknown token.
UPDATE password_reset_tokens SET used_at = ?
WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?;


-- ====================================================== rate limits =========

-- name: rate_hit
-- One statement: insert the counter or increment it. No check-then-act, so two
-- concurrent requests cannot both read 9 and both write 10.
-- See site/chapters/20-upsert-and-idempotency.html.
INSERT INTO rate_limits (ip, minute, hits) VALUES (?, ?, 1)
ON CONFLICT (ip, minute) DO UPDATE SET hits = hits + 1;

-- name: rate_count
SELECT hits FROM rate_limits WHERE ip = ? AND minute = ?;

-- name: purge_rate_limits
DELETE FROM rate_limits WHERE minute < ?;


-- ============================================================ health ========

-- name: table_count
-- Used ONLY by the create-if-missing check at startup. /api/health deliberately
-- does NOT run this or anything else against the database: a liveness probe that
-- fails when the database is briefly busy reports an outage it invented.
SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';
