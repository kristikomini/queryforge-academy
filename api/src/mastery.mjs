/* ---------------------------------------------------------------------------
   mastery.mjs — the four figures the leaderboard shows, RE-DERIVED from the
   progress document rather than trusted from the browser.

   THE FORMULA IS IMPLEMENTED TWICE. The other copy is mastery() in
   site/assets/store.js, and it has to be: the browser needs it to draw a
   dashboard offline, and the server needs it to ORDER BY. Both copies carry a
   comment saying so, and api/tests/mastery.test.mjs is what catches them
   drifting apart.

   Three specific hazards, all of them real failures in the platform this was
   modelled on:

     1. ROUNDING. Round HALF-UP, matching JavaScript's Math.round. .NET's default
        is banker's rounding (6.25 -> 6.2 where JS gives 6.3), which is why the
        original had to specify MidpointRounding.AwayFromZero. Do not "improve"
        this.

     2. THE DENOMINATOR. It has ONE source: the chapter manifest the server
        actually serves. The original kept a separate config key, the two
        drifted — 47 chapters in the site, 39 in the API — and the leaderboard
        reported a higher mastery than the dashboard for the same profile.
        tools/doctor.mjs fails the build if anything under api/ hard-codes one.

     3. CLAMPING. The document is client-supplied. A hand-edited profile must
        not be able to show 4000%.

   And every read of the document is DEFENSIVE. It was produced by a browser that
   may be running an older version of the site, so a missing or wrongly-typed
   property is expected input, not an error. A malformed profile must produce
   ZEROES, never a 500.

   Covered in: site/chapters/39-oltp-vs-olap.html
--------------------------------------------------------------------------- */

import { readFileSync } from "node:fs";
import { join } from "node:path";

/*  Count the chapters by running the manifest the server serves, exactly as the
    browser and the service worker do. One source of truth, and it cannot drift
    because there is nothing to drift from.                                   */
export function loadChapterIds(siteDir) {
  const src = readFileSync(join(siteDir, "assets", "chapters.js"), "utf8");
  const scope = {};
  new Function("self", src)(scope);
  const list = scope.CHAPTERS || [];
  return list.map((c) => c.id);
}

const isNum = (v) => typeof v === "number" && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* Half-up, explicitly, to match JavaScript's Math.round in the browser copy. */
const round1 = (v) => Math.round(v * 10) / 10;

export function deriveStats(doc, chapterIds) {
  const out = { xp: 0, masteryPercent: 0, streakDays: 0, chaptersPassed: 0 };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return out;

  /* xp ------------------------------------------------------------------- */
  out.xp = isNum(doc.xp) ? clamp(Math.round(doc.xp), 0, 1e9) : 0;

  /* streak --------------------------------------------------------------- */
  const streak = doc.streak;
  if (streak && typeof streak === "object" && isNum(streak.count))
    out.streakDays = clamp(Math.round(streak.count), 0, 100000);

  /* mastery and chapters passed ------------------------------------------ */
  const chapters = doc.chapters;
  const n = chapterIds.length;
  if (!n) return out;

  let sum = 0;
  let passed = 0;
  if (chapters && typeof chapters === "object" && !Array.isArray(chapters)) {
    for (const id of chapterIds) {
      const c = chapters[id];
      if (!c || typeof c !== "object") continue;

      /* 0.25 for reading + 0.75 x min(1, best). Identical to store.js. */
      let pts = c.read ? 0.25 : 0;
      const best = isNum(c.best) ? clamp(c.best, 0, 1) : 0;
      pts += 0.75 * best;
      sum += pts;

      if (best >= 0.8) passed++;
    }
  }

  out.masteryPercent = clamp(round1((sum / n) * 100), 0, 100);
  out.chaptersPassed = clamp(passed, 0, n);
  return out;
}
