/* ---------------------------------------------------------------------------
   config.mjs — configuration, VALIDATED AT STARTUP.

   Everything has a working default. The service must run with no configuration
   at all: `node api/server.mjs` and it works.

   The one exception is the JWT signing key outside development, and the failure
   is deliberately loud — a missing key stops the process at boot rather than
   producing a service that boots green and fails at the first sign-in. Validate
   configuration at startup, not at first use.

   NOTE WHAT IS NOT HERE: a chapter count. The mastery denominator has exactly
   one source — the server counts the manifest it serves. In the platform this
   was modelled on there were two, they drifted (47 in the site, 39 in the API
   config), and the leaderboard silently reported a higher mastery than the
   dashboard for the same profile. tools/doctor.mjs fails the build if anything
   under api/ hard-codes one.

   Covered in: site/chapters/35-security-and-gdpr.html
--------------------------------------------------------------------------- */

import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const num = (v, d) => (v === undefined || v === "" || isNaN(Number(v)) ? d : Number(v));

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || "development";
  const isDev = nodeEnv === "development";
  const dataDir = env.QF_DATA_DIR || join(ROOT, "api", "App_Data");

  const cfg = {
    nodeEnv,
    isDev,
    port: num(env.PORT, 5057),
    host: env.QF_HOST || "127.0.0.1",

    /* SQLite by default, so the service needs no setup at all. */
    dbFile: env.QF_DB || join(dataDir, "accounts.db"),
    dataDir,

    /* The site this API also serves. Static files ABOVE routing — see server.mjs. */
    siteDir: env.QF_SITE_DIR || join(ROOT, "site"),

    accessTokenSeconds: num(env.QF_ACCESS_TTL, 15 * 60),        // short: a JWT cannot be revoked
    refreshTokenSeconds: num(env.QF_REFRESH_TTL, 30 * 86400),   // long: stateful and revocable
    resetTokenSeconds: num(env.QF_RESET_TTL, 15 * 60),

    lockoutThreshold: num(env.QF_LOCKOUT_AFTER, 8),             // per ACCOUNT
    lockoutSeconds: num(env.QF_LOCKOUT_SECONDS, 15 * 60),
    authRequestsPerMinute: num(env.QF_AUTH_RPM, 10),            // per IP

    minPasswordLength: num(env.QF_MIN_PASSWORD, 10),
    maxDocumentBytes: num(env.QF_MAX_DOC_BYTES, 1024 * 1024),   // 1 MiB

    /* `null` is the Origin a file:// page sends, and the whole site is designed
       to be openable from disk — so it is allowed by default, in development. */
    allowedOrigins: (env.QF_ORIGINS ||
      "http://localhost:4321,http://127.0.0.1:4321,http://localhost:5057,http://127.0.0.1:5057,null")
      .split(",").map((s) => s.trim()).filter(Boolean),

    jwtSecret: env.QF_JWT_SECRET || "",
  };

  if (!cfg.jwtSecret) {
    if (isDev) {
      /*  Generated on first run and kept in a git-ignored file, so restarting
          the dev server does not sign everybody out.
          NO KEY IS EVER COMMITTED: anyone holding it can mint a token for any
          user, which is not a theoretical concern in a public repository.   */
      const keyFile = join(dataDir, "jwt.key");
      if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
      if (existsSync(keyFile)) cfg.jwtSecret = readFileSync(keyFile, "utf8").trim();
      else {
        cfg.jwtSecret = randomBytes(48).toString("base64");
        writeFileSync(keyFile, cfg.jwtSecret, { mode: 0o600 });
        console.warn(`  ! generated a development JWT key at ${keyFile} (git-ignored)`);
      }
    } else {
      throw new Error(
        "QF_JWT_SECRET is required outside development.\n" +
        "  Generate one with:  node -e \"console.log(require('crypto').randomBytes(48).toString('base64'))\"\n" +
        "  A service that boots green and fails at the first sign-in is worse than one that does not boot.");
    }
  }

  if (cfg.jwtSecret.length < 32)
    throw new Error("QF_JWT_SECRET must be at least 32 characters.");
  if (cfg.minPasswordLength < 8)
    throw new Error("QF_MIN_PASSWORD below 8 is not a configuration, it is a mistake.");

  return cfg;
}
