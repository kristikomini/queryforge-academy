/* ---------------------------------------------------------------------------
   handlers.mjs — the fourteen endpoints.

   Every one of them is: validate input, run one or more NAMED statements from
   api/sql/queries.sql, shape the response. There is no SQL in this file, on
   purpose — the logic that matters lives where a SQL developer would look for
   it, and can be read, diffed and run by hand.

   Errors are RFC 9457 Problem Details with a traceId extension.
--------------------------------------------------------------------------- */

import {
  uuidv7, hashPassword, verifyPassword, needsRehash, burnEquivalentWork,
  newRecoveryCode, hashRecoveryCode, newOpaqueToken, hashToken,
  signJwt, verifyJwt,
} from "./auth.mjs";
import { deriveStats } from "./mastery.mjs";

/* ------------------------------------------------------------- problems --- */

export class Problem extends Error {
  constructor(status, title, detail, extra = {}) {
    super(detail || title);
    this.status = status;
    this.title = title;
    this.detail = detail;
    this.extra = extra;
  }
}
const bad = (d) => new Problem(400, "Bad Request", d);
const unauthorised = (d = "Invalid credentials.") => new Problem(401, "Unauthorized", d);

/* ---------------------------------------------------------------- input --- */

const USERNAME = /^[a-z0-9._-]{3,32}$/;

function normaliseUsername(raw) {
  return String(raw || "").trim().toLowerCase();
}
function requireString(body, field, { min = 1, max = 4096 } = {}) {
  const v = body?.[field];
  if (typeof v !== "string") throw bad(`"${field}" is required and must be a string.`);
  const t = v.trim();
  if (t.length < min) throw bad(`"${field}" must be at least ${min} characters.`);
  if (t.length > max) throw bad(`"${field}" must be at most ${max} characters.`);
  return v;
}

/* ============================================================ factory ===== */

export function makeHandlers({ store, cfg, clock, chapterIds }) {
  const { q, tx } = store;
  const nowIso = () => new Date(clock.now()).toISOString();

  /* ------------------------------------------------------------ helpers -- */

  function issueSession(user) {
    const access = signJwt({ sub: user.id, name: user.username }, cfg.jwtSecret,
      { expiresInSeconds: cfg.accessTokenSeconds, now: clock.now() });

    const refresh = newOpaqueToken();
    q("insert_refresh").run(
      uuidv7(clock.now()), user.id, hashToken(refresh),
      new Date(clock.now() + cfg.refreshTokenSeconds * 1000).toISOString(),
      nowIso());

    return {
      accessToken: access,
      refreshToken: refresh,
      expiresInSeconds: cfg.accessTokenSeconds,
      user: { id: user.id, username: user.username, displayName: user.display_name },
      recoveryCode: null,
    };
  }

  function currentUser(req) {
    const auth = req.headers["authorization"] || "";
    if (!auth.startsWith("Bearer ")) throw new Problem(401, "Unauthorized", "A bearer token is required.");
    const claims = verifyJwt(auth.slice(7), cfg.jwtSecret, { now: clock.now() });
    if (!claims) throw new Problem(401, "Unauthorized", "The token is invalid or has expired.");
    const user = q("user_by_id").get(claims.sub);
    if (!user) throw new Problem(401, "Unauthorized", "The token is invalid or has expired.");
    return user;
  }

  function isLocked(user) {
    return user.locked_until && Date.parse(user.locked_until) > clock.now();
  }

  /* ========================================================== endpoints == */

  return {

    /* -- POST /api/auth/register ----------------------------------------- */
    async register(req, body) {
      const username = normaliseUsername(requireString(body, "username", { max: 32 }));
      if (!USERNAME.test(username))
        throw bad("A username is 3–32 characters: lower-case letters, digits, dot, dash or underscore.");
      const password = requireString(body, "password", { min: cfg.minPasswordLength, max: 200 });
      const displayName = (typeof body.displayName === "string" && body.displayName.trim())
        ? body.displayName.trim().slice(0, 60) : username;

      if (q("user_by_username").get(username))
        throw new Problem(409, "Conflict", "That username is taken.");

      const code = newRecoveryCode();
      const user = {
        id: uuidv7(clock.now()), username, display_name: displayName,
      };

      try {
        q("insert_user").run(user.id, username, displayName,
          hashPassword(password), hashRecoveryCode(code), nowIso(), nowIso());
      } catch (e) {
        /* The unique constraint is the real defence against the race between the
           check above and this insert. Check-then-insert is a race; the
           constraint is what makes it safe. See chapter 20. */
        if (/UNIQUE/i.test(e.message)) throw new Problem(409, "Conflict", "That username is taken.");
        throw e;
      }

      const session = issueSession(user);
      session.recoveryCode = code;   // shown ONCE, and never stored anywhere else
      return { status: 201, body: session };
    },

    /* -- POST /api/auth/login -------------------------------------------- */
    async login(req, body) {
      const username = normaliseUsername(requireString(body, "username", { max: 32 }));
      const password = requireString(body, "password", { max: 200 });

      const user = q("user_by_username").get(username);

      /*  A WRONG PASSWORD AND AN UNKNOWN ACCOUNT ARE INDISTINGUISHABLE.
          Same message, same status — and the unknown path burns equivalent
          scrypt work so the timing does not leak either. A login form must not
          be an account-enumeration oracle.                                  */
      if (!user) {
        burnEquivalentWork(password);
        throw unauthorised();
      }

      if (isLocked(user))
        throw new Problem(423, "Locked",
          "Too many failed attempts. Try again later.",
          { lockedUntil: user.locked_until });

      if (!verifyPassword(password, user.password_hash)) {
        q("record_failure").run(
          cfg.lockoutThreshold,
          new Date(clock.now() + cfg.lockoutSeconds * 1000).toISOString(),
          user.id);
        throw unauthorised();
      }

      /* Silently upgrade the hash if the cost parameters have been raised. */
      if (needsRehash(user.password_hash))
        q("update_password").run(hashPassword(password), user.id);

      q("touch_sign_in").run(nowIso(), user.id);
      return { status: 200, body: issueSession(user) };
    },

    /* -- POST /api/auth/refresh ------------------------------------------ */
    async refresh(req, body) {
      const token = requireString(body, "refreshToken", { max: 200 });
      const row = q("refresh_by_hash").get(hashToken(token));
      if (!row) throw unauthorised("Unknown refresh token.");

      /*  REPLAY KILLS THE FAMILY.
          If a token that has already been used or revoked turns up again, the
          server cannot tell a thief from a client that lost a response — so it
          assumes the worse case and revokes every session for that user.    */
      if (row.revoked_at) {
        q("revoke_all_for_user").run(nowIso(), row.user_id);
        throw unauthorised("That refresh token has already been used. All sessions have been ended.");
      }
      if (Date.parse(row.expires_at) <= clock.now())
        throw unauthorised("The refresh token has expired.");

      const user = q("user_by_id").get(row.user_id);
      if (!user) throw unauthorised();

      /* Rotation: issue a new pair, mark the old one used, and record WHICH
         token replaced it — that trail is what makes replay detectable. */
      const session = issueSession(user);
      q("revoke_refresh").run(nowIso(), hashToken(session.refreshToken), hashToken(token));
      return { status: 200, body: session };
    },

    /* -- POST /api/auth/logout ------------------------------------------- */
    async logout(req, body) {
      const token = typeof body?.refreshToken === "string" ? body.refreshToken : "";
      if (token) q("revoke_refresh").run(nowIso(), null, hashToken(token));
      /* 204 whether or not it existed: this endpoint must not report whether a
         token was valid. */
      return { status: 204 };
    },

    /* -- POST /api/auth/forgot-password ---------------------------------- */
    async forgotPassword(req, body) {
      const username = normaliseUsername(requireString(body, "username", { max: 32 }));
      const code = requireString(body, "recoveryCode", { max: 60 });

      const user = q("user_by_username").get(username);
      if (!user || user.recovery_code_hash !== hashRecoveryCode(code)) {
        /* Same failure for an unknown user and a wrong code. */
        throw unauthorised("That username and recovery code do not match.");
      }

      const reset = newOpaqueToken();
      q("insert_reset").run(uuidv7(clock.now()), user.id, hashToken(reset),
        new Date(clock.now() + cfg.resetTokenSeconds * 1000).toISOString(), nowIso());

      return { status: 200, body: { resetToken: reset, expiresInSeconds: cfg.resetTokenSeconds } };
    },

    /* -- POST /api/auth/reset-password ----------------------------------- */
    async resetPassword(req, body) {
      const token = requireString(body, "resetToken", { max: 200 });
      const password = requireString(body, "newPassword", { min: cfg.minPasswordLength, max: 200 });

      const hash = hashToken(token);
      const row = q("reset_by_hash").get(hash);
      if (!row) throw unauthorised("That reset ticket is not valid.");

      /* Spend it with a conditional UPDATE, not a read-then-write: zero rows
         affected means it was already used or has expired, and there is no
         window in which two requests can both spend it. */
      const spent = q("spend_reset").run(nowIso(), hash, nowIso());
      if (spent.changes === 0) throw unauthorised("That reset ticket has already been used or has expired.");

      const user = q("user_by_id").get(row.user_id);
      if (!user) throw unauthorised();

      /* A completed reset issues a FRESH recovery code — the old one is spent,
         and leaving the account with no way back would be worse than the
         problem we just solved. */
      const code = newRecoveryCode();
      tx(() => {
        q("update_password").run(hashPassword(password), user.id);
        q("update_recovery_code").run(hashRecoveryCode(code), nowIso(), user.id);
        /* Changing a password ends every existing session. */
        q("revoke_all_for_user").run(nowIso(), user.id);
      });

      const session = issueSession(user);
      session.recoveryCode = code;
      return { status: 200, body: session };
    },

    /* -- POST /api/auth/recovery-code ------------------------------------ */
    async newRecoveryCode(req) {
      const user = currentUser(req);
      const code = newRecoveryCode();
      q("update_recovery_code").run(hashRecoveryCode(code), nowIso(), user.id);
      return { status: 200, body: { recoveryCode: code } };
    },

    /* -- GET /api/auth/me ------------------------------------------------ */
    async me(req) {
      const user = currentUser(req);
      return { status: 200, body: { id: user.id, username: user.username, displayName: user.display_name } };
    },

    /* -- GET /api/profile ------------------------------------------------ */
    async getProfile(req) {
      const user = currentUser(req);
      const row = q("profile_by_user").get(user.id);
      if (!row) return { status: 204 };     // no profile yet — NOT an error
      return {
        status: 200,
        body: { data: JSON.parse(row.document), updatedAt: row.updated_at, revision: row.revision },
      };
    },

    /* -- PUT /api/profile ------------------------------------------------ */
    async putProfile(req, body) {
      const user = currentUser(req);

      const data = body?.data;
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw bad("\"data\" must be a JSON object.");

      const json = JSON.stringify(data);
      if (Buffer.byteLength(json, "utf8") > cfg.maxDocumentBytes)
        throw new Problem(413, "Payload Too Large",
          `The progress document exceeds ${cfg.maxDocumentBytes} bytes.`);

      /*  Re-derive the four leaderboard figures from the document rather than
          trusting a client summary. Defensively: a malformed profile must
          produce zeroes, never a 500. See mastery.mjs.                      */
      const stats = deriveStats(data, chapterIds);
      const clientUpdated = typeof body.updatedAt === "string" ? body.updatedAt : nowIso();
      const base = Number.isInteger(body.baseRevision) ? body.baseRevision : 0;

      const existing = q("profile_revision").get(user.id);

      if (!existing) {
        try {
          q("insert_profile").run(user.id, json, clientUpdated, nowIso(),
            stats.xp, stats.masteryPercent, stats.streakDays, stats.chaptersPassed);
        } catch (e) {
          if (!/UNIQUE|PRIMARY/i.test(e.message)) throw e;
          /* Two first-writes raced. Fall through to the conflict path so the
             caller gets the current document rather than an opaque 500. */
          return conflict(user);
        }
        return {
          status: 200,
          body: { data, updatedAt: nowIso(), revision: 1 },
        };
      }

      const res = q("update_profile").run(json, clientUpdated, nowIso(),
        stats.xp, stats.masteryPercent, stats.streakDays, stats.chaptersPassed,
        user.id, base);

      /*  Zero rows affected IS the conflict signal — no separate read, no
          window between checking and writing. And the 409 carries the CURRENT
          document, so resolving it costs one round trip rather than a
          refetch-and-guess.                                                 */
      if (res.changes === 0) return conflict(user);

      return { status: 200, body: { data, updatedAt: nowIso(), revision: existing.revision + 1 } };

      function conflict(u) {
        const cur = q("profile_by_user").get(u.id);
        throw new Problem(409, "Conflict",
          "The stored profile has changed since you read it. Merge the document in this response and retry.",
          { data: JSON.parse(cur.document), updatedAt: cur.updated_at, revision: cur.revision });
      }
    },

    /* -- GET /api/leaderboard -------------------------------------------- */
    async leaderboard(req) {
      const user = currentUser(req);
      const rows = q("leaderboard").all();
      return {
        status: 200,
        body: rows.map((r) => ({
          displayName: r.display_name,
          xp: r.xp,
          masteryPercent: r.mastery_percent,
          streakDays: r.streak_days,
          chaptersPassed: r.chapters_passed,
          isYou: r.id === user.id,
        })),
      };
    },

    /* -- PUT /api/me/leaderboard?visible= --------------------------------- */
    async setVisibility(req, body, url) {
      const user = currentUser(req);
      const raw = url.searchParams.get("visible");
      if (raw !== "true" && raw !== "false")
        throw bad("The ?visible= parameter must be true or false.");
      q("set_leaderboard_visibility").run(raw === "true" ? 1 : 0, user.id);
      return { status: 204 };
    },

    /* -- DELETE /api/me --------------------------------------------------- */
    async deleteMe(req) {
      const user = currentUser(req);
      /* Profiles, refresh tokens and reset tokens all cascade. */
      q("delete_user").run(user.id);
      return { status: 204 };
    },

    /* -- GET /api/health --------------------------------------------------
       DELIBERATELY DOES NOT TOUCH THE DATABASE, and is outside the rate
       limiter. A liveness probe that fails when the database is briefly busy
       reports an outage it invented, and one that can be rate-limited reports
       an outage it caused.                                                  */
    async health() {
      return { status: 200, body: { status: "ok", time: nowIso() } };
    },
  };
}
