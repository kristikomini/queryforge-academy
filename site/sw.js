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

const CACHE = "queryforge-va5d060c87b9b";   /* STAMPED by tools/stamp-sw.mjs */

/* Everything that is not a chapter. Every name here is REQUIRED: a miss aborts
   the install, deliberately — see the note in install() below. tools/doctor.mjs
   and tools/stamp-sw.mjs both fail on a shell entry that does not exist, so a
   typo is caught long before a browser ever sees it. */
const SHELL = [
  "./",
  "index.html",
  "404.html",
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

    /* `cache: "reload"` bypasses the browser's HTTP cache, so a rebuild fetches
       what the server has now rather than what this browser saw last week. */
    const add = async (url) => {
      try { await cache.add(new Request(url, { cache: "reload" })); return true; }
      catch (e) { return false; }
    };

    /* THE SHELL IS REQUIRED, AND A FAILURE HERE MUST FAIL THE INSTALL.
       activate() below deletes every other cache wholesale, so a worker that
       activates over a half-filled cache has just thrown away the complete copy
       and put a worse one in its place. Rejecting instead leaves the OLD worker
       in charge of the OLD, complete cache, and the upgrade is retried on the
       next visit. Nothing is lost by refusing to upgrade; a great deal is lost
       by upgrading badly.

       The previous version logged the failures and carried on, so install always
       succeeded — one flaky response out of a hundred simultaneous requests was
       enough to activate a worker over an emptied cache, and from then on every
       page change fell through to the network. */
    const failed = [];
    await Promise.all(SHELL.map(async (url) => { if (!(await add(url))) failed.push(url); }));
    if (failed.length) {
      throw new Error("[sw] shell incomplete, install aborted: " + failed.join(", "));
    }

    /* Chapters are best-effort, by contrast. One chapter missing from the offline
       copy is a gap the fetch handler covers by going to the network; it is not
       worth refusing an upgrade over. */
    const missed = [];
    await Promise.all(CHAPTER_URLS.map(async (url) => { if (!(await add(url))) missed.push(url); }));
    if (missed.length) console.warn("[sw] chapters not precached:", missed);
    console.info(`[sw] ${CACHE}: ${PRECACHE.length - missed.length}/${PRECACHE.length} cached`);

    /* Only now, with the shell verified present. */
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
