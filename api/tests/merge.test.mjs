/* ---------------------------------------------------------------------------
   merge.test.mjs — the two-device merge, field by field.

   The merge lives in the BROWSER (site/assets/account.js), not in the API. It is
   tested here because this is what CI runs, and because it is the single piece
   of logic in the whole platform where a bug is unrecoverable: losing a month of
   study to a sync bug cannot be undone, while having a stale note can.

   THE RULE THE WHOLE THING IS BUILT ON: nothing is ever removed by the merge.

   account.js is a browser script, so it is loaded here with the minimum stubs it
   asks for. That is deliberately cheap — the alternative is either a headless
   browser in CI or an untested merge, and neither is acceptable.
--------------------------------------------------------------------------- */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./harness.mjs";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "site");

/* Load account.js with just enough of a browser for it to define LFAccount. */
function loadMerge() {
  const listeners = {};
  const win = {
    LF: {
      profile: {},
      emit() {}, on(n, f) { (listeners[n] ||= []).push(f); },
      replace() {},
    },
    localStorage: {
      _s: {},
      getItem(k) { return this._s[k] ?? null; },
      setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
    },
    location: { protocol: "http:", origin: "http://localhost:5057" },
    addEventListener() {},
    fetch: () => Promise.reject(new Error("no network in this test")),
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  win.window = win;
  const src = readFileSync(join(SITE, "assets", "account.js"), "utf8");
  new Function("window", "localStorage", "location", "fetch", "setTimeout", "clearTimeout", src)(
    win, win.localStorage, win.location, win.fetch, win.setTimeout, win.clearTimeout);
  if (!win.LFAccount) throw new Error("account.js did not define LFAccount");
  return win.LFAccount.merge;
}

const merge = loadMerge();

/* Two devices, the same account, edited independently. */
const laptop = {
  xp: 400, examBest: 0.9, examCount: 2,
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-09-06T11:30:00Z", name: "Laptop Name",
  chapters: {
    "08-joins": { read: true, readAt: "2026-09-01T10:00:00Z", best: 0.91, attempts: 3,
                  lastAt: "2026-09-06T11:00:00Z", seconds: 900, perfect: false },
  },
  cards: { "08-joins#0": { ease: 2.6, interval: 10, reps: 3, lapses: 1, due: "2026-09-16", last: "2026-09-06", grade: 2 } },
  viva: {},
  notes: [{ id: "n1", ch: "08-joins", text: "laptop note", updatedAt: "2026-09-06T11:00:00Z" }],
  badges: { "first-test": "2026-09-06T11:00:00Z", "perfect": "2026-09-06T11:30:00Z" },
  attempts: [{ ch: "08-joins", at: "2026-09-06T11:00:00Z", correct: 10, total: 11, s: 300 }],
  history: { "2026-09-06": { xp: 200, cards: 10, answers: 11, correct: 10, minutes: 15, cardXp: 50, viva: 0 } },
  streak: { count: 5, best: 9, lastDay: "2026-09-06" },
  goals: { dailyXp: 60, dailyCards: 20 },
};

const phone = {
  xp: 350, examBest: 0.7, examCount: 5,
  createdAt: "2025-12-01T00:00:00Z", updatedAt: "2026-09-06T12:00:00Z", name: "Phone Name",
  chapters: {
    "08-joins": { read: true, readAt: "2026-08-20T09:00:00Z", best: 0.82, attempts: 5,
                  lastAt: "2026-09-06T12:00:00Z", seconds: 400, perfect: false },
    "24-concurrency-patterns": { read: true, readAt: "2026-09-06T12:00:00Z", best: 1, attempts: 1,
                                 lastAt: "2026-09-06T12:00:00Z", seconds: 240, perfect: true },
  },
  /* The SAME card, reviewed LATER on the phone. */
  cards: { "08-joins#0": { ease: 2.2, interval: 4, reps: 2, lapses: 3, due: "2026-09-11", last: "2026-09-07", grade: 1 } },
  viva: {},
  notes: [{ id: "n2", ch: "24-concurrency-patterns", text: "phone note", updatedAt: "2026-09-06T12:00:00Z" }],
  badges: { "first-test": "2026-09-05T08:00:00Z", "streak-3": "2026-09-06T12:00:00Z" },
  attempts: [{ ch: "24-concurrency-patterns", at: "2026-09-06T12:00:00Z", correct: 9, total: 9, s: 240 }],
  history: { "2026-09-06": { xp: 150, cards: 14, answers: 8, correct: 7, minutes: 9, cardXp: 70, viva: 3 } },
  streak: { count: 6, best: 7, lastDay: "2026-09-07" },
  goals: { dailyXp: 60, dailyCards: 20 },
};

export const tests = {

  "xp, examBest and examCount take the MAXIMUM": () => {
    const m = merge(laptop, phone);
    assert.equal(m.xp, 400);
    assert.equal(m.examBest, 0.9);
    assert.equal(m.examCount, 5);
  },

  "createdAt takes the EARLIER, updatedAt the NEWER": () => {
    const m = merge(laptop, phone);
    assert.equal(m.createdAt, "2025-12-01T00:00:00Z");
    assert.equal(m.updatedAt, "2026-09-06T12:00:00Z");
  },

  "name comes from whichever side has the newer updatedAt": () => {
    assert.equal(merge(laptop, phone).name, "Phone Name");
    assert.equal(merge(phone, laptop).name, "Phone Name", "and it is symmetric");
  },

  "a chapter merges field by field: read OR, readAt EARLIER, best/attempts/seconds MAX": () => {
    const c = merge(laptop, phone).chapters["08-joins"];
    assert.equal(c.read, true);
    assert.equal(c.readAt, "2026-08-20T09:00:00Z", "you read it THEN, not now");
    assert.equal(c.best, 0.91);
    assert.equal(c.attempts, 5);
    assert.equal(c.seconds, 900);
    assert.equal(c.lastAt, "2026-09-06T12:00:00Z");
  },

  "a chapter that exists on only one device survives": () => {
    const m = merge(laptop, phone);
    assert.ok(m.chapters["24-concurrency-patterns"], "nothing is ever removed by the merge");
    assert.equal(m.chapters["24-concurrency-patterns"].perfect, true);
  },

  "the DEVICE THAT REVIEWED MOST RECENTLY owns the card's schedule": () => {
    const c = merge(laptop, phone).cards["08-joins#0"];
    /* The phone reviewed on the 7th; the laptop on the 6th. The phone's answer
       is the one the schedule should be based on. */
    assert.equal(c.interval, 4);
    assert.equal(c.due, "2026-09-11");
    assert.equal(c.ease, 2.2);
    assert.equal(c.grade, 1);
    assert.equal(c.last, "2026-09-07");
  },

  "but reps and lapses take the MAXIMUM, because both reviews really happened": () => {
    const c = merge(laptop, phone).cards["08-joins#0"];
    assert.equal(c.reps, 3);
    assert.equal(c.lapses, 3,
      "forgetting a lapse would make a weak card look strong, which is the one direction that matters");
  },

  "badges are a union, and keep the EARLIER timestamp": () => {
    const b = merge(laptop, phone).badges;
    assert.deep(Object.keys(b).sort(), ["first-test", "perfect", "streak-3"]);
    assert.equal(b["first-test"], "2026-09-05T08:00:00Z", "once earned, earned");
  },

  "notes are a union by id, and nothing is deleted": () => {
    const ids = merge(laptop, phone).notes.map((n) => n.id).sort();
    assert.deep(ids, ["n1", "n2"]);
  },

  "the newer version of the same note wins": () => {
    const a = { ...laptop, notes: [{ id: "n1", text: "older", updatedAt: "2026-09-01T00:00:00Z" }] };
    const b = { ...phone, notes: [{ id: "n1", text: "newer", updatedAt: "2026-09-08T00:00:00Z" }] };
    assert.equal(merge(a, b).notes[0].text, "newer");
    assert.equal(merge(b, a).notes[0].text, "newer", "and it is symmetric");
  },

  "history takes a per-field MAXIMUM, never a sum": () => {
    const h = merge(laptop, phone).history["2026-09-06"];
    /*  A sum would double-count: the same session is pushed from one device,
        pulled by the other, and added to a row that already contains it. */
    assert.equal(h.xp, 200, "200 and 150 must not become 350");
    assert.equal(h.cards, 14);
    assert.equal(h.answers, 11);
    assert.equal(h.correct, 10);
    assert.equal(h.minutes, 15);
    assert.equal(h.cardXp, 70);
    assert.equal(h.viva, 3);
  },

  "streak count and lastDay come from the later day; best is the maximum": () => {
    const s = merge(laptop, phone).streak;
    assert.equal(s.count, 6);
    assert.equal(s.lastDay, "2026-09-07");
    assert.equal(s.best, 9);
  },

  "attempts concatenate, deduplicate on (ch, at) and stay in time order": () => {
    const m = merge(laptop, phone);
    assert.equal(m.attempts.length, 2);
    assert.ok(m.attempts[0].at <= m.attempts[1].at, "sorted by time");

    /* The same attempt seen from both devices must appear once. */
    const dup = merge(laptop, { ...phone, attempts: laptop.attempts.slice() });
    assert.equal(dup.attempts.length, 1);
  },

  "attempts are capped at 400": () => {
    const many = Array.from({ length: 600 }, (_, i) => ({
      ch: "c" + i, at: "2026-01-01T00:00:" + String(i % 60).padStart(2, "0") + "Z",
      correct: 1, total: 1, s: 1,
    }));
    assert.equal(merge({ ...laptop, attempts: many }, phone).attempts.length, 400);
  },

  "THE INVARIANT: the merge never removes anything": () => {
    const m = merge(laptop, phone);
    for (const side of [laptop, phone]) {
      for (const id of Object.keys(side.chapters))
        assert.ok(m.chapters[id], `chapter ${id} disappeared`);
      for (const id of Object.keys(side.cards))
        assert.ok(m.cards[id], `card ${id} disappeared`);
      for (const id of Object.keys(side.badges))
        assert.ok(m.badges[id], `badge ${id} disappeared`);
      for (const n of side.notes)
        assert.ok(m.notes.some((x) => x.id === n.id), `note ${n.id} disappeared`);
      for (const d of Object.keys(side.history))
        assert.ok(m.history[d], `history for ${d} disappeared`);
    }
  },

  "merging is idempotent: merging a result with itself changes nothing": () => {
    const once = merge(laptop, phone);
    const twice = merge(once, once);
    assert.equal(JSON.stringify(twice), JSON.stringify(once),
      "a sync that runs twice must not drift — this is what makes the 4-second coalesced loop safe");
  },

  "merging with an empty remote returns the local profile intact": () => {
    const m = merge(laptop, {});
    assert.equal(m.xp, laptop.xp);
    assert.equal(Object.keys(m.chapters).length, 1);
  },

  "a null or non-object remote is ignored rather than throwing": () => {
    assert.equal(merge(laptop, null).xp, 400);
    assert.equal(merge(laptop, undefined).xp, 400);
    assert.equal(merge(laptop, "nonsense").xp, 400);
  },
};
