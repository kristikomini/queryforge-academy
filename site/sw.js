/* ===========================================================================
   sw.js — offline, and installable.

   THE CACHE NAME IS THE VERSION. A new name rebuilds everything and deletes the
   old; there is no partial invalidation and you do not want one. Forget to
   change it and returning visitors keep last month's chapters with no error
   anywhere — the single most common service-worker bug.

   So it is NOT hand-maintained here. `tools/stamp-sw.mjs` writes it from a hash
   of the actual file contents, and `tools/doctor.mjs` fails the build when the
   stamp is stale. That is the fix for a known failure mode in the platform this
   was modelled on, where the bump was manual and nothing enforced it.

   The precache list is the hard-coded shell PLUS every chapter, generated from
   the manifest via importScripts. That is why chapters.js assigns to `self` and
   not to `window`: there is no `window` in a worker, and a second hand-written
   list of 62 chapters would go stale on the first rename.
   =========================================================================== */

const CACHE = "queryforge-v63edceac978d";   /* STAMPED by tools/stamp-sw.mjs */

/* Everything that is not a chapter. If a name here is wrong the install still
   completes — see the caught rejection below — so a typo cannot make the site
   un-upgradeable. It is logged instead. */
const SHELL = [
  "./",
  "index.html",
  "dashboard.html",
  "review.html",
  "exam.html",
  "viva.html",
  "simulate.html",
  "notes.html",
  "glossary.html",
  "italiano.html",
  "cv.html",
  "account.html",
  "leaderboard.html",
  "playground.html",
  "manifest.webmanifest",
  "favicon.svg",

  "assets/style.css",
  "assets/learn.css",

  "assets/chapters.js",
  "assets/quizzes-1.js",
  "assets/quizzes-2.js",
  "assets/quizzes-3.js",
  "assets/rules.js",
  "assets/glossary.js",
  "assets/italiano.js",
  "assets/italiano-panel.js",
  "assets/store.js",
  "assets/site.js",
  "assets/syntax.js",
  "assets/codex.js",
  "assets/quiz.js",
  "assets/learn.js",
  "assets/notes.js",
  "assets/account.js",
  "assets/cv.js",
  "assets/forge-db.js",

  /* The playground's engine. 700 KB, vendored rather than fetched from a CDN,
     so the whole site works from a USB stick with the network unplugged. */
  "vendor/sql.js/sql-wasm.js",
  "vendor/sql.js/sql-wasm.wasm",
];

/* The chapters come from the manifest, never from a second list. */
importScripts("assets/chapters.js");
const CHAPTER_URLS = (self.CHAPTERS || []).map((c) => `chapters/${c.id}.html`);

const PRECACHE = SHELL.concat(CHAPTER_URLS);

/* ------------------------------------------------------------------ install */

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* Added INDIVIDUALLY with a caught rejection. cache.addAll() is atomic: one
       404 anywhere and the whole install fails, so a single typo in the shell
       list would make the site permanently un-upgradeable for everyone who
       already has an old worker. The failures are logged and the install
       completes. */
    const failed = [];
    await Promise.all(PRECACHE.map(async (url) => {
      try {
        await cache.add(new Request(url, { cache: "reload" }));
      } catch (e) {
        failed.push(url);
      }
    }));
    if (failed.length) console.warn("[sw] not precached:", failed);
    console.info(`[sw] ${CACHE}: ${PRECACHE.length - failed.length}/${PRECACHE.length} cached`);
    await self.skipWaiting();
  })());
});

/* ----------------------------------------------------------------- activate */

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/* -------------------------------------------------------------------- fetch */

self.addEventListener("fetch", (event) => {
  const req = event.request;

  /* Never touch anything that needs the network to be truthful. */
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;      // another origin
  if (url.pathname.includes("/api/")) return;           // the accounts service

  /*  Sign-in, sync and the leaderboard MUST fail honestly without a network.
      A cached 200 for "here is your profile" would be a lie with somebody's
      progress attached, and the merge would then run against stale data and
      push the result back. That is how you lose a month of study.            */

  event.respondWith((async () => {
    const cached = await caches.match(req);

    /*  CACHE-FIRST WITH A BACKGROUND REFRESH (stale-while-revalidate).
        The reasoning is specific: this is a COURSE, not a feed. A chapter one
        version old is fine to read and a spinner is not. Network-first would be
        right where staleness is a correctness problem; it is not right here. */
    const network = fetch(req).then((res) => {
      if (res && res.ok && res.type === "basic") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    }).catch(() => null);

    if (cached) return cached;

    const fresh = await network;
    if (fresh) return fresh;

    /* Offline and never seen: a navigation falls back to the home page, which
       is precached, so the app shell still opens and the sidebar still works. */
    if (req.mode === "navigate") {
      const home = await caches.match("index.html");
      if (home) return home;
    }
    return new Response("Offline, and this page was never cached.", {
      status: 504, headers: { "content-type": "text/plain; charset=utf-8" },
    });
  })());
});
