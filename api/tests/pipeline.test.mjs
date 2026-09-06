/* ---------------------------------------------------------------------------
   pipeline.test.mjs — the middleware ORDER is behaviour, not taste.

   The one that matters most: EVERY PUBLIC PAGE AND ASSET IS SERVED ANONYMOUSLY.
   This was a bug before it was a decision — the routing step sat above the
   static-file handler, so the catch-all 404 route matched "/" first and the home
   page 404ed while every other page worked. These tests keep it fixed.
--------------------------------------------------------------------------- */

import { assert, withServer } from "./harness.mjs";
import { parseCatalogue } from "../src/db.mjs";

const ENV = { QF_AUTH_RPM: "10000" };

export const tests = {

  /* ============================================ static files above routing */

  "the home page is served anonymously at /": () =>
    withServer(async (api) => {
      const r = await api.get("/");
      assert.equal(r.status, 200,
        "this is the bug: a routing step above static files makes the catch-all 404 match / first");
      assert.match(r.text, /QueryForge/);
    }, { env: ENV }),

  "every public page and asset is served anonymously": () =>
    withServer(async (api) => {
      const pages = [
        "/index.html", "/dashboard.html", "/review.html", "/exam.html",
        "/viva.html", "/simulate.html", "/notes.html", "/glossary.html",
        "/italiano.html", "/cv.html", "/account.html", "/leaderboard.html",
        "/playground.html",
        "/assets/style.css", "/assets/learn.css",
        "/assets/chapters.js", "/assets/store.js", "/assets/rules.js",
        "/manifest.webmanifest", "/favicon.svg", "/sw.js",
        "/chapters/00-the-job-posting.html",
        "/chapters/51-the-interview.html",
      ];
      for (const p of pages) {
        const r = await api.get(p);
        assert.equal(r.status, 200, `${p} must be public — got ${r.status}`);
      }
    }, { env: ENV }),

  "a stylesheet does not pay for routing, auth or a rate-limit permit": () =>
    withServer(async (api) => {
      /* The limiter is set to 1/minute. If static files were below routing and
         the limiter, the second request would be throttled. */
      for (let i = 0; i < 20; i++) {
        const r = await api.get("/assets/style.css");
        assert.equal(r.status, 200, `request ${i + 1} for a public asset was refused`);
      }
    }, { env: { QF_AUTH_RPM: "1" } }),

  "the service worker is served with a scope header that allows the root": () =>
    withServer(async (api) => {
      const r = await api.get("/sw.js");
      assert.equal(r.status, 200);
      assert.equal(r.headers.get("service-worker-allowed"), "/");
    }, { env: ENV }),

  /* ================================================== 404, not 401 or 500 */

  "an unknown path is a 404, not a 401": () =>
    withServer(async (api) => {
      const r = await api.get("/api/does-not-exist");
      assert.equal(r.status, 404,
        "a 401 on an unknown route tells an attacker that something exists there");
    }, { env: ENV }),

  "an unknown static path is a 404": () =>
    withServer(async (api) => {
      const r = await api.get("/no-such-page.html");
      assert.equal(r.status, 404);
    }, { env: ENV }),

  "path traversal cannot escape the site directory": () =>
    withServer(async (api) => {
      for (const p of ["/../api/server.mjs", "/..%2fapi%2fserver.mjs", "/assets/../../package.json"]) {
        const r = await api.get(p);
        assert.notEqual(r.status, 200, `${p} must not be served`);
      }
    }, { env: ENV }),

  "the wrong method on a known path is a 404, not a 405 that leaks the route": () =>
    withServer(async (api) => {
      const r = await api.del("/api/auth/login");
      assert.equal(r.status, 404);
    }, { env: ENV }),

  /* ============================================================== health */

  "health is 200 and does not touch the database": () =>
    withServer(async (api) => {
      /* Close the database underneath it. A liveness probe that fails when the
         database is briefly busy reports an outage it invented. */
      api.store.close();
      const r = await api.get("/api/health");
      assert.equal(r.status, 200);
      assert.equal(r.body.status, "ok");
    }, { env: ENV }),

  /* ======================================================= problem details */

  "errors are RFC 9457 problem details with a traceId": () =>
    withServer(async (api) => {
      const r = await api.get("/api/profile");
      assert.equal(r.status, 401);
      assert.match(r.headers.get("content-type"), /application\/problem\+json/);
      assert.ok(r.body.title, "title");
      assert.ok(r.body.detail, "detail");
      assert.equal(r.body.status, 401);
      assert.match(r.body.traceId, /^[0-9a-f-]{36}$/,
        "a trace id the user can quote and support can find in the log");
    }, { env: ENV }),

  "a malformed JSON body is a 400, not a 500": () =>
    withServer(async (api) => {
      const res = await fetch(api.base + "/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{ this is not json",
      });
      assert.equal(res.status, 400);
    }, { env: ENV }),

  /* ================================================================= CORS */

  "an allowed origin gets CORS headers; an unknown one does not": () =>
    withServer(async (api) => {
      const allowed = await api.get("/api/health", { headers: { origin: "http://localhost:4321" } });
      assert.equal(allowed.headers.get("access-control-allow-origin"), "http://localhost:4321");

      const evil = await api.get("/api/health", { headers: { origin: "https://evil.example" } });
      assert.equal(evil.headers.get("access-control-allow-origin"), null);
    }, { env: ENV }),

  "the null origin is allowed, because that is what a file:// page sends": () =>
    withServer(async (api) => {
      const r = await api.get("/api/health", { headers: { origin: "null" } });
      assert.equal(r.headers.get("access-control-allow-origin"), "null",
        "the whole site is designed to be openable from disk");
    }, { env: ENV }),


  /* ============================================== the service-worker precache */

  /*  Offline behaviour cannot be asserted from Node — there is no service worker
      here. What CAN be asserted, and is the part that actually breaks, is that
      every URL sw.js promises to precache is really servable. A precache list
      with one dead entry logs a warning nobody reads and leaves that file
      permanently uncached.                                                    */
  "every URL in the service worker's precache list is served with a 200": () =>
    withServer(async (api) => {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const sw = await readFile(join(api.cfg.siteDir, "sw.js"), "utf8");

      const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/"([^"]+)"/g)]
        .map((m) => m[1]);

      const scope = {};
      new Function("self", await readFile(join(api.cfg.siteDir, "assets/chapters.js"), "utf8"))(scope);
      const chapters = scope.CHAPTERS.map((c) => `chapters/${c.id}.html`);

      const all = [...shell, ...chapters];
      assert.ok(all.length > 60, `expected the whole site, got ${all.length} entries`);

      const dead = [];
      for (const rel of all) {
        const r = await api.get("/" + (rel === "./" ? "" : rel));
        if (r.status !== 200) dead.push(`${rel} -> ${r.status}`);
      }
      assert.equal(dead.length, 0, "dead precache entries: " + dead.join(", "));
    }, { env: ENV }),

  "the service worker's cache name is content-derived, not a hand-typed version": () =>
    withServer(async (api) => {
      const { readFile } = await import("node:fs/promises");
      const { join } = await import("node:path");
      const sw = await readFile(join(api.cfg.siteDir, "sw.js"), "utf8");
      const m = sw.match(/const CACHE = "([^"]+)"/);
      assert.ok(m, "sw.js must declare a cache name");
      assert.match(m[1], /^queryforge-v[0-9a-f]{12}$/,
        "a hand-bumped cache name is the single most common service-worker bug; " +
        "tools/stamp-sw.mjs derives it from a hash of every precached file");
    }, { env: ENV }),

  /* ====================================== the catalogue and configuration */

  "the query catalogue parses into named statements": () => {
    const cat = parseCatalogue(`
-- name: one
SELECT 1;

-- not a name
-- name: two
SELECT 2;
`);
    assert.equal(cat.size, 2);
    assert.equal(cat.get("one"), "SELECT 1;");
    assert.match(cat.get("two"), /SELECT 2;/);
  },

  "every prepared statement in the catalogue is actually reachable by name": () =>
    withServer(async (api) => {
      /* If a statement is in queries.sql and nothing calls it, that is dead SQL
         — and dead SQL is where a schema change stops being caught. This test
         does not assert that; it asserts the weaker, checkable thing: that every
         name in the file prepared successfully at startup. */
      for (const name of api.store.catalogue.keys())
        assert.ok(api.store.q(name), `"${name}" did not prepare`);
    }, { env: ENV }),

  "the service refuses to start outside development without a signing key": async () => {
    const { loadConfig } = await import("../src/config.mjs");
    await assert.throws(
      () => loadConfig({ NODE_ENV: "production", QF_JWT_SECRET: "" }),
      "a service that boots green and fails at the first sign-in is worse than one that does not boot");
  },

  "a short signing key is refused": async () => {
    const { loadConfig } = await import("../src/config.mjs");
    await assert.throws(() => loadConfig({ NODE_ENV: "production", QF_JWT_SECRET: "tooshort" }));
  },
};
