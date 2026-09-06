#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   harness.mjs — assertions, a frozen clock, and a server-per-test.

   Tests run against a REAL SQLite database in memory, through the real driver,
   with the real schema applied — not a fake. An in-memory *fake* cheerfully
   passes tests that fail against anything you would deploy: different type
   coercion, different NULL and collation behaviour, different transaction
   semantics. Here the engine under test IS the engine in production, which is
   the only version of this claim that is honest.

   The clock is FROZEN and injected, because a test that has to wait fifteen real
   minutes to prove a token expired is a test nobody runs.

   The RUNNER is run.mjs. These are separate files because a runner that
   imports the tests, and tests that import the runner, is a circular import —
   and with top-level await in the runner that deadlocks rather than erroring.
--------------------------------------------------------------------------- */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { once } from "node:events";

import { openDb } from "../src/db.mjs";
import { createApp } from "../server.mjs";
import { loadConfig } from "../src/config.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------ assertions -- */

export class AssertionError extends Error {}

export const assert = {
  ok(v, m = "expected truthy") { if (!v) throw new AssertionError(`${m} (got ${JSON.stringify(v)})`); },
  notOk(v, m = "expected falsy") { if (v) throw new AssertionError(`${m} (got ${JSON.stringify(v)})`); },
  equal(a, b, m) {
    if (a !== b) throw new AssertionError(m || `expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
  notEqual(a, b, m) {
    if (a === b) throw new AssertionError(m || `expected something other than ${JSON.stringify(b)}`);
  },
  deep(a, b, m) {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    if (x !== y) throw new AssertionError(m || `expected ${y}, got ${x}`);
  },
  match(s, re, m) {
    if (!re.test(String(s))) throw new AssertionError(m || `expected ${re} to match ${JSON.stringify(s)}`);
  },
  async throws(fn, m = "expected it to throw") {
    try { await fn(); } catch { return; }
    throw new AssertionError(m);
  },
};

/* ----------------------------------------------------------- frozen clock -- */

export function frozenClock(startIso = "2026-09-06T09:00:00.000Z") {
  let t = Date.parse(startIso);
  return {
    now: () => t,
    advance(seconds) { t += seconds * 1000; return this; },
    set(iso) { t = Date.parse(iso); return this; },
  };
}

/* ------------------------------------------------------------- harness ---- */

/*  Each test gets its own server on an ephemeral port, its own in-memory
    database and its own frozen clock. Perfect isolation, and fast enough that
    nobody is tempted to share state between tests — which is where test suites
    go to die.                                                               */
export async function withServer(fn, { clock = frozenClock(), env = {} } = {}) {
  const cfg = loadConfig({
    NODE_ENV: "development",
    QF_JWT_SECRET: "test-secret-that-is-definitely-long-enough-0123456789",
    QF_SITE_DIR: join(HERE, "..", "..", "site"),
    QF_DB: ":memory:",
    ...env,
  });
  cfg.dbFile = ":memory:";

  const store = openDb(":memory:");
  const app = createApp({ cfg, store, clock });
  const server = createServer((req, res) => { app(req, res); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;

  const api = {
    base, cfg, store, clock,
    async call(method, path, { body, token, headers = {} } = {}) {
      const res = await fetch(base + path, {
        method,
        headers: {
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
          ...(token ? { authorization: "Bearer " + token } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json = null;
      try { json = text ? JSON.parse(text) : null; } catch {}
      return { status: res.status, body: json, text, headers: res.headers };
    },
    get(p, o) { return api.call("GET", p, o); },
    post(p, body, o) { return api.call("POST", p, { body, ...o }); },
    put(p, body, o) { return api.call("PUT", p, { body, ...o }); },
    del(p, o) { return api.call("DELETE", p, o); },

    /* Convenience: a registered, signed-in user. */
    async user(username = "mario", password = "correct-horse-battery") {
      const r = await api.post("/api/auth/register", { username, password, displayName: username });
      if (r.status !== 201) throw new Error("register failed: " + r.text);
      return r.body;
    },
  };

  try {
    await fn(api);
  } finally {
    server.close();
    store.close();
  }
}

