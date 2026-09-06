/* ---------------------------------------------------------------------------
   profile.test.mjs — the progress document, optimistic concurrency, isolation
   between users, and the mastery formula that is written twice.
--------------------------------------------------------------------------- */

import { assert, withServer } from "./harness.mjs";
import { deriveStats } from "../src/mastery.mjs";

const ENV = { QF_AUTH_RPM: "10000" };   // these tests are not about rate limiting

function profileDoc(over = {}) {
  return {
    v: 1, id: "guest", name: "Mario", xp: 500,
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-09-06T09:00:00.000Z",
    chapters: {}, cards: {}, viva: {}, notes: [], badges: {}, attempts: [],
    history: {}, streak: { count: 4, best: 9, lastDay: "2026-09-06" },
    goals: { dailyXp: 60, dailyCards: 20 },
    remote: { userId: "", syncedAt: "", dirty: false },
    ...over,
  };
}

export const tests = {

  /* ================================================== the empty-profile case */

  "GET /api/profile is 204 when there is no profile yet, not 404": () =>
    withServer(async (api) => {
      const s = await api.user();
      const r = await api.get("/api/profile", { token: s.accessToken });
      assert.equal(r.status, 204,
        "no profile yet is a normal state for a new account, not an error");
      assert.equal(r.text, "");
    }, { env: ENV }),

  "the first PUT creates the profile at revision 1": () =>
    withServer(async (api) => {
      const s = await api.user();
      const r = await api.put("/api/profile",
        { data: profileDoc(), updatedAt: "2026-09-06T09:00:00.000Z", baseRevision: 0 },
        { token: s.accessToken });
      assert.equal(r.status, 200);
      assert.equal(r.body.revision, 1);
    }, { env: ENV }),

  /* ================================================= optimistic concurrency */

  "a stale baseRevision gets a 409 CARRYING THE CURRENT DOCUMENT": () =>
    withServer(async (api) => {
      const s = await api.user();
      const tok = { token: s.accessToken };

      await api.put("/api/profile", { data: profileDoc({ xp: 100 }), baseRevision: 0 }, tok);
      await api.put("/api/profile", { data: profileDoc({ xp: 200 }), baseRevision: 1 }, tok);

      /* A second device that still thinks it is on revision 1. */
      const stale = await api.put("/api/profile",
        { data: profileDoc({ xp: 150 }), baseRevision: 1 }, tok);

      assert.equal(stale.status, 409);
      assert.ok(stale.body.data, "the 409 must carry the current document");
      assert.equal(stale.body.data.xp, 200);
      assert.equal(stale.body.revision, 2);
      /* Carrying it is what makes a conflict cost ONE round trip instead of a
         refetch-and-guess. */
    }, { env: ENV }),

  "a conflicting write does not clobber the stored document": () =>
    withServer(async (api) => {
      const s = await api.user();
      const tok = { token: s.accessToken };
      await api.put("/api/profile", { data: profileDoc({ xp: 100 }), baseRevision: 0 }, tok);
      await api.put("/api/profile", { data: profileDoc({ xp: 999 }), baseRevision: 1 }, tok);
      await api.put("/api/profile", { data: profileDoc({ xp: 1 }), baseRevision: 1 }, tok);

      const now = await api.get("/api/profile", tok);
      assert.equal(now.body.data.xp, 999, "the losing write must change nothing");
      assert.equal(now.body.revision, 2);
    }, { env: ENV }),

  /* ==================================================== isolation and limits */

  "one learner cannot read another's profile": () =>
    withServer(async (api) => {
      const a = await api.user("mario", "correct-horse-battery");
      const b = await api.user("luigi", "correct-horse-battery");

      await api.put("/api/profile", { data: profileDoc({ xp: 4242 }), baseRevision: 0 },
        { token: a.accessToken });

      const asB = await api.get("/api/profile", { token: b.accessToken });
      assert.equal(asB.status, 204, "luigi has no profile; he must not see mario's");
    }, { env: ENV }),

  "an anonymous request for a profile is 401": () =>
    withServer(async (api) => {
      const r = await api.get("/api/profile");
      assert.equal(r.status, 401);
    }, { env: ENV }),

  "a document over the size limit is a 413": () =>
    withServer(async (api) => {
      const s = await api.user();
      const huge = profileDoc({ notes: [{ id: "n1", text: "x".repeat(2 * 1024 * 1024) }] });
      const r = await api.put("/api/profile", { data: huge, baseRevision: 0 },
        { token: s.accessToken });
      assert.ok(r.status === 413, `expected 413, got ${r.status}`);
    }, { env: ENV }),

  "data that is not a JSON object is a 400": () =>
    withServer(async (api) => {
      const s = await api.user();
      for (const bad of [null, 42, "a string", [1, 2, 3]]) {
        const r = await api.put("/api/profile", { data: bad, baseRevision: 0 },
          { token: s.accessToken });
        assert.equal(r.status, 400, `data: ${JSON.stringify(bad)} should be rejected`);
      }
    }, { env: ENV }),

  /* ===================================================== malformed documents */

  "a MALFORMED progress document produces zeroes, not a 500": () =>
    withServer(async (api) => {
      const s = await api.user();
      /* Every field is the wrong type. This is EXPECTED INPUT: the document was
         produced by a browser that may be running an older version of the site. */
      const junk = {
        xp: "lots", chapters: "not an object", streak: 42,
        cards: null, notes: "nope",
      };
      const r = await api.put("/api/profile", { data: junk, baseRevision: 0 },
        { token: s.accessToken });
      assert.equal(r.status, 200, "a malformed profile must never be able to fail a sync");

      /* Assert on the OBSERVABLE result — what the leaderboard shows — rather
         than on the row, because the row is an implementation detail and
         `profile_by_user` deliberately does not select the denormalised
         columns. */
      const lb = await api.get("/api/leaderboard", { token: s.accessToken });
      assert.equal(lb.body.length, 1);
      assert.equal(lb.body[0].xp, 0, "\"lots\" is not a number");
      assert.equal(lb.body[0].masteryPercent, 0);
      assert.equal(lb.body[0].streakDays, 0);
      assert.equal(lb.body[0].chaptersPassed, 0);

      /* And it round-trips: the junk is stored verbatim, because the document is
         the learner's own data and the server is not in the business of
         correcting it. */
      const back = await api.get("/api/profile", { token: s.accessToken });
      assert.equal(back.body.data.xp, "lots");
    }, { env: ENV }),

  /* ================================================== the mastery formula */

  "mastery cannot be inflated past 100 by a hand-edited profile": () => {
    const ids = ["a", "b", "c", "d"];
    const evil = {
      xp: 1e15,
      chapters: {
        a: { read: true, best: 40 },      // best is meant to be 0..1
        b: { read: true, best: 1e9 },
        c: { read: true, best: -5 },
        d: { read: true, best: 1 },
      },
      streak: { count: -3 },
    };
    const s = deriveStats(evil, ids);
    assert.ok(s.masteryPercent <= 100, `mastery was ${s.masteryPercent}`);
    assert.ok(s.masteryPercent >= 0);
    assert.ok(s.streakDays >= 0);
    assert.ok(s.chaptersPassed <= ids.length);
  },

  "the server formula matches the browser formula": () => {
    /* The same arithmetic as mastery() in site/assets/store.js:
         per chapter  0.25 if read  +  0.75 x min(1, best)
         mastery %  =  (sum / chapterCount) x 100, rounded half-up to 1 dp    */
    const ids = ["a", "b", "c", "d"];

    /* Read everything, answer nothing: capped at exactly 25%. That cap is a
       product decision, not an accident, and it is worth a test. */
    const readOnly = { chapters: Object.fromEntries(ids.map((i) => [i, { read: true, best: 0 }])) };
    assert.equal(deriveStats(readOnly, ids).masteryPercent, 25);

    /* One chapter read and passed perfectly, out of four: (0.25+0.75)/4 = 25%. */
    const onePerfect = { chapters: { a: { read: true, best: 1 } } };
    assert.equal(deriveStats(onePerfect, ids).masteryPercent, 25);

    /* Everything read and perfect: 100%. */
    const all = { chapters: Object.fromEntries(ids.map((i) => [i, { read: true, best: 1 }])) };
    assert.equal(deriveStats(all, ids).masteryPercent, 100);

    /* Nothing at all. */
    assert.equal(deriveStats({}, ids).masteryPercent, 0);
    assert.equal(deriveStats(null, ids).masteryPercent, 0);
  },

  "rounding is HALF-UP, matching JavaScript's Math.round": () => {
    /*  Banker's rounding would give 6.2 where this must give 6.3. That
        difference is exactly how two implementations of one formula come to
        disagree, and it is why this test exists. */
    const ids = Array.from({ length: 16 }, (_, i) => "c" + i);
    const doc = { chapters: { c0: { read: true, best: 1 } } };   // 1/16 = 6.25%
    assert.equal(deriveStats(doc, ids).masteryPercent, 6.3,
      "6.25 must round to 6.3 (half-up), not 6.2 (banker's)");
  },

  "a chapter counts as passed at exactly 0.8": () => {
    const ids = ["a", "b"];
    assert.equal(deriveStats({ chapters: { a: { read: true, best: 0.8 } } }, ids).chaptersPassed, 1);
    assert.equal(deriveStats({ chapters: { a: { read: true, best: 0.79 } } }, ids).chaptersPassed, 0);
  },

  "chapters in the document that are not in the manifest are ignored": () => {
    /*  A learner who synced from an older version of the site has progress on a
        chapter that has since been renamed. It must not inflate the numerator
        against a smaller denominator. */
    const ids = ["a", "b"];
    const doc = { chapters: { a: { read: true, best: 1 }, "gone-away": { read: true, best: 1 } } };
    assert.equal(deriveStats(doc, ids).masteryPercent, 50);
  },

  /* ============================================================ leaderboard */

  "the leaderboard shows the SERVER's figures, not the client's claims": () =>
    withServer(async (api) => {
      const s = await api.user("mario", "correct-horse-battery");

      /* The client asserts a summary. The server must ignore it and re-derive. */
      const doc = profileDoc({ xp: 300, masteryPercent: 99.9, chaptersPassed: 52 });
      await api.put("/api/profile", { data: doc, baseRevision: 0 }, { token: s.accessToken });

      const lb = await api.get("/api/leaderboard", { token: s.accessToken });
      assert.equal(lb.status, 200);
      assert.equal(lb.body.length, 1);
      assert.equal(lb.body[0].xp, 300, "xp is a real field and is re-derived from it");
      assert.equal(lb.body[0].masteryPercent, 0,
        "the client's masteryPercent claim must be ignored — no chapters are read");
      assert.equal(lb.body[0].chaptersPassed, 0);
      assert.ok(lb.body[0].isYou);
    }, { env: ENV }),

  "opting out removes you from the leaderboard": () =>
    withServer(async (api) => {
      const s = await api.user("mario", "correct-horse-battery");
      await api.put("/api/profile", { data: profileDoc(), baseRevision: 0 }, { token: s.accessToken });

      let lb = await api.get("/api/leaderboard", { token: s.accessToken });
      assert.equal(lb.body.length, 1, "visible by default — it is opt-OUT");

      await api.put("/api/me/leaderboard?visible=false", undefined, { token: s.accessToken });
      lb = await api.get("/api/leaderboard", { token: s.accessToken });
      assert.equal(lb.body.length, 0);
    }, { env: ENV }),

  /* ============================================================== deletion */

  "deleting an account removes the profile and the sessions": () =>
    withServer(async (api) => {
      const s = await api.user("mario", "correct-horse-battery");
      await api.put("/api/profile", { data: profileDoc(), baseRevision: 0 }, { token: s.accessToken });

      const del = await api.del("/api/me", { token: s.accessToken });
      assert.equal(del.status, 204);

      /* Cascades: the profile is gone. */
      const gone = await api.get("/api/auth/me", { token: s.accessToken });
      assert.equal(gone.status, 401, "the token must stop working once the user row is gone");

      /* And the refresh token cannot resurrect the session. */
      const refresh = await api.post("/api/auth/refresh", { refreshToken: s.refreshToken });
      assert.equal(refresh.status, 401);
    }, { env: ENV }),
};
