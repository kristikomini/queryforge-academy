#!/usr/bin/env node
/* ===========================================================================
   server.mjs — the HTTP host.

   THIS FILE IS DELIBERATELY THIN, and that is the design, not an omission.
   The service's logic lives in api/sql/*.sql: the schema and a catalogue of
   named statements. A SQL developer's portfolio is a schema and a query
   catalogue, not a routing table — see api/README.md.

   What IS here, because it is behaviour rather than plumbing, is the pipeline
   order:

     exception handler → static files → routing → CORS
       → rate limiter (before auth: rejecting a flood should be cheap)
       → authentication → endpoints → catch-all 404 (anonymous)

   STATIC FILES ABOVE ROUTING. This was a bug before it was a decision. In the
   framework the original was written in, the routing step was inserted at the
   top of the pipeline, so the catch-all 404 route matched "/" before the
   static-file handler ever saw it — and the home page 404ed while every other
   page worked. Serving static files first fixes it and is better anyway: the
   tutorial is public, so a stylesheet should never pay for route matching,
   token validation or a rate-limit permit.

   Zero dependencies. Node 22+.
   =========================================================================== */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { randomUUID } from "node:crypto";

import { loadConfig } from "./src/config.mjs";
import { openDb } from "./src/db.mjs";
import { makeHandlers, Problem } from "./src/handlers.mjs";
import { loadChapterIds } from "./src/mastery.mjs";

/* ---------------------------------------------------------------- clock --- */

/*  TWO CLOCKS ARE ONE CLOCK. Time is injected rather than "now" being called in
    six places, because token expiry, lockout windows and streaks are all
    time-dependent — and a test that has to wait fifteen real minutes to prove a
    token expired is a test nobody runs. api/tests uses FrozenClock.          */
export const systemClock = { now: () => Date.now() };

/* --------------------------------------------------------------- helpers -- */

const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ico": "image/x-icon",
  ".md": "text/plain; charset=utf-8", ".sql": "text/plain; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  const payload = body === undefined ? "" : (typeof body === "string" ? body : JSON.stringify(body));
  res.writeHead(status, {
    "content-type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    /* Cheap, universally sensible, and none of them need configuration. */
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(payload);
}

/* RFC 9457 Problem Details, with a traceId extension so a user can quote a
   reference and it can be found in the log. */
function sendProblem(res, status, title, detail, traceId, extra = {}) {
  const payload = JSON.stringify({
    type: "about:blank", title, status, detail, traceId, ...extra,
  });
  res.writeHead(status, {
    "content-type": "application/problem+json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "x-content-type-options": "nosniff",
  });
  res.end(payload);
}

async function readBody(req, limitBytes) {
  const chunks = [];
  let n = 0;
  for await (const c of req) {
    n += c.length;
    if (n > limitBytes) {
      const e = new Problem(413, "Payload Too Large", "The request body is too large.");
      throw e;
    }
    chunks.push(c);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  try { return JSON.parse(text); }
  catch { throw new Problem(400, "Bad Request", "The request body is not valid JSON."); }
}

/* ============================================================== the app === */

export function createApp({ cfg, store, clock = systemClock }) {
  const chapterIds = loadChapterIds(cfg.siteDir);
  const h = makeHandlers({ store, cfg, clock, chapterIds });

  /*  The route table. Static, ordered, and small enough to read — which is the
      point: a reader can see every entry point to this service at once.      */
  const ROUTES = [
    ["POST",   "/api/auth/register",        h.register,          { anon: true,  limited: true }],
    ["POST",   "/api/auth/login",           h.login,             { anon: true,  limited: true }],
    ["POST",   "/api/auth/refresh",         h.refresh,           { anon: true,  limited: true }],
    ["POST",   "/api/auth/logout",          h.logout,            { anon: true,  limited: true }],
    ["POST",   "/api/auth/forgot-password", h.forgotPassword,    { anon: true,  limited: true }],
    ["POST",   "/api/auth/reset-password",  h.resetPassword,     { anon: true,  limited: true }],
    ["POST",   "/api/auth/recovery-code",   h.newRecoveryCode,   { anon: false, limited: true }],
    ["GET",    "/api/auth/me",              h.me,                { anon: false }],
    ["GET",    "/api/profile",              h.getProfile,        { anon: false }],
    ["PUT",    "/api/profile",              h.putProfile,        { anon: false }],
    ["GET",    "/api/leaderboard",          h.leaderboard,       { anon: false }],
    ["PUT",    "/api/me/leaderboard",       h.setVisibility,     { anon: false }],
    ["DELETE", "/api/me",                   h.deleteMe,          { anon: false }],
    /* /api/health is NOT limited. See handlers.mjs. */
    ["GET",    "/api/health",               h.health,            { anon: true }],
  ];

  /* ------------------------------------------------------- rate limiter -- */

  /*  Per IP, on /api/auth/* only. This is a DIFFERENT defence from the
      per-account lockout and neither substitutes for the other: lockout stops
      credential stuffing against one login, the limiter stops a spray across
      many accounts.
      It runs BEFORE authentication, because rejecting a flood should be cheap.  */
  let lastPurge = 0;
  function rateLimited(ip) {
    const minute = new Date(clock.now()).toISOString().slice(0, 16);
    store.q("rate_hit").run(ip, minute);
    const row = store.q("rate_count").get(ip, minute);

    if (clock.now() - lastPurge > 60000) {
      lastPurge = clock.now();
      const cutoff = new Date(clock.now() - 5 * 60000).toISOString().slice(0, 16);
      try { store.q("purge_rate_limits").run(cutoff); } catch {}
    }
    return row && row.hits > cfg.authRequestsPerMinute;
  }

  function clientIp(req) {
    /* Trust the socket. X-Forwarded-For is spoofable unless you are behind a
       proxy you control and are counting hops — and pretending otherwise turns
       the limiter into decoration. If this ever runs behind a real proxy, that
       is a configuration decision to make explicitly. */
    return req.socket.remoteAddress || "unknown";
  }

  /* --------------------------------------------------------- static ------ */

  async function tryStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") return false;
    let rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, "");
    if (rel.startsWith("..")) return false;
    if (rel === "" ) rel = "index.html";
    if (rel.endsWith("/")) rel += "index.html";

    const file = join(cfg.siteDir, rel);
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) return false;

    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      "content-length": body.length,
      "cache-control": rel.endsWith(".wasm") ? "public, max-age=604800" : "no-cache",
      "x-content-type-options": "nosniff",
      "service-worker-allowed": "/",
    });
    res.end(req.method === "HEAD" ? undefined : body);
    return true;
  }

  /* ----------------------------------------------------------- handler --- */

  return async function handle(req, res) {
    const traceId = randomUUID();
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    try {
      /* -- CORS ---------------------------------------------------------- */
      const origin = req.headers.origin;
      if (origin && cfg.allowedOrigins.includes(origin)) {
        res.setHeader("access-control-allow-origin", origin);
        res.setHeader("vary", "Origin");
        res.setHeader("access-control-allow-headers", "content-type,authorization");
        res.setHeader("access-control-allow-methods", "GET,POST,PUT,DELETE,OPTIONS");
        res.setHeader("access-control-max-age", "600");
      }
      if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

      /* -- STATIC FILES, ABOVE ROUTING ----------------------------------- */
      if (!url.pathname.startsWith("/api/")) {
        if (await tryStatic(req, res, url.pathname)) return;
      }

      /* -- ROUTING ------------------------------------------------------- */
      const route = ROUTES.find(([m, p]) => m === req.method && p === url.pathname);
      if (!route) {
        /*  The catch-all 404 is ANONYMOUS. An unknown path must be a 404, not a
            401: a 401 on an unknown route tells an attacker that something
            exists there, and it makes every typo look like a permissions
            problem. A test asserts this.                                     */
        return sendProblem(res, 404, "Not Found", "No such endpoint.", traceId);
      }

      const [, , fn, opts = {}] = route;

      /* -- RATE LIMITER, before authentication --------------------------- */
      if (opts.limited && rateLimited(clientIp(req))) {
        return sendProblem(res, 429, "Too Many Requests",
          `More than ${cfg.authRequestsPerMinute} authentication requests in a minute from this address.`,
          traceId, { retryAfterSeconds: 60 });
      }

      /* -- BODY ----------------------------------------------------------- */
      const body = (req.method === "POST" || req.method === "PUT")
        ? await readBody(req, cfg.maxDocumentBytes + 4096)
        : {};

      /* -- ENDPOINT ------------------------------------------------------- */
      const out = await fn(req, body, url);
      if (!out || out.status === 204) { res.writeHead(204); res.end(); return; }
      return send(res, out.status || 200, out.body);

    } catch (e) {
      if (e instanceof Problem)
        return sendProblem(res, e.status, e.title, e.detail, traceId, e.extra || {});

      /*  An unexpected error is logged WITH the trace id and reported WITHOUT
          the detail. The user gets a reference they can quote; the internals
          stay internal.                                                      */
      console.error(`[${traceId}]`, e);
      return sendProblem(res, 500, "Internal Server Error",
        "Something went wrong. Quote the trace id if you report this.", traceId);
    }
  };
}

/* ================================================================= main === */

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop());

if (isMain) {
  const cfg = loadConfig();
  const store = openDb(cfg.dbFile, { verbose: true });
  const app = createApp({ cfg, store });

  createServer((req, res) => { app(req, res); }).listen(cfg.port, cfg.host, () => {
    console.log(`\n  QueryForge accounts service`);
    console.log(`  ${"─".repeat(52)}`);
    console.log(`  http://${cfg.host}:${cfg.port}/            the site`);
    console.log(`  http://${cfg.host}:${cfg.port}/api/health  liveness`);
    console.log(`  env: ${cfg.nodeEnv} · db: ${cfg.dbFile}`);
    console.log(`  ${"─".repeat(52)}\n`);
  });

  const bye = () => { store.close(); process.exit(0); };
  process.on("SIGINT", bye);
  process.on("SIGTERM", bye);
}
