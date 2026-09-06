/* ===========================================================================
   store.js — the learning engine. Everything lives behind one global: window.LF

   NO OTHER SCRIPT TOUCHES localStorage. That is the whole point of this file:
   a profile can live in three places (memory, localStorage, the server) and
   exactly one module should know that.

   Consumers must start with `if (!window.LF) return;` — this file is loaded
   before them on every page, but a page is allowed to leave a script out and
   the rest must still work.
   =========================================================================== */

(function () {
  "use strict";

  var KEY = "queryforge.profile.v1";
  var VERSION = 1;

  /* ---------------------------------------------------------------------
     Dates. A STUDY DAY IS LOCAL, NOT UTC.

     A 23:00 session in Italy must not count as tomorrow, so today() formats
     the local calendar day. Day arithmetic then parses "<day>T12:00:00Z" —
     midday UTC — which dodges every DST edge: no local midnight ever moves
     far enough to cross a different date from noon.
  --------------------------------------------------------------------- */

  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function dayMs(day) { return Date.parse(day + "T12:00:00Z"); }
  function addDays(day, n) {
    var d = new Date(dayMs(day) + n * 86400000);
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }
  function daysBetween(a, b) { return Math.round((dayMs(b) - dayMs(a)) / 86400000); }
  function nowIso() { return new Date().toISOString(); }

  /* ------------------------------------------------------------ storage --- */

  var memoryOnly = false;   // set when localStorage throws (private windows, embedded viewers)

  function readRaw() {
    try {
      var s = localStorage.getItem(KEY);
      return s ? JSON.parse(s) : null;
    } catch (e) {
      memoryOnly = true;
      return null;
    }
  }
  function writeRaw(obj) {
    if (memoryOnly) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(obj));
    } catch (e) {
      // Quota, private mode, or a locked-down embed. Downgrade rather than
      // taking the page down — a learner losing sync is bad, a blank chapter
      // is worse.
      memoryOnly = true;
    }
  }

  /* ------------------------------------------------------------- schema --- */

  function blank() {
    return {
      v: VERSION,
      id: "guest",
      name: "Guest",
      email: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      xp: 0,
      chapters: {},
      cards: {},
      viva: {},
      notes: [],
      badges: {},
      attempts: [],
      history: {},
      streak: { count: 0, best: 0, lastDay: "" },
      goals: { dailyXp: 60, dailyCards: 20 },
      remote: { userId: "", syncedAt: "", dirty: false },
    };
  }

  /* Forward-only. Never rename a field without one of these — somebody has a
     month of study in the old shape and no way to get it back. */
  function migrate(p) {
    if (!p || typeof p !== "object") return blank();
    var b = blank();
    for (var k in b) if (!(k in p)) p[k] = b[k];
    if (!p.streak) p.streak = { count: 0, best: 0, lastDay: "" };
    if (!p.goals) p.goals = { dailyXp: 60, dailyCards: 20 };
    if (!p.remote) p.remote = { userId: "", syncedAt: "", dirty: false };
    if (!Array.isArray(p.notes)) p.notes = [];
    if (!Array.isArray(p.attempts)) p.attempts = [];
    if (typeof p.xp !== "number" || !isFinite(p.xp)) p.xp = 0;
    p.v = VERSION;
    return p;
  }

  var profile = migrate(readRaw());

  /* ------------------------------------------------------------- events --- */

  var listeners = {};
  function on(name, fn) { (listeners[name] = listeners[name] || []).push(fn); }
  function emit(name, detail) {
    (listeners[name] || []).forEach(function (fn) {
      try { fn(detail); } catch (e) { console.error("[LF]", name, e); }
    });
    try { window.dispatchEvent(new CustomEvent("lf:" + name, { detail: detail })); } catch (e) {}
  }

  /* -------------------------------------------------------------- saving --- */

  /* Dragging a sticky note fires a save per pixel, so writes are debounced.
     beforeunload flushes, so a tab closing mid-debounce loses nothing. */
  var saveTimer = null;
  function save() {
    profile.updatedAt = nowIso();
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
    emit("change", profile);
  }
  function flush() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    writeRaw(profile);
  }
  window.addEventListener("beforeunload", flush);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") flush();
  });

  /* ---------------------------------------------------------------- meta --- */

  function chapterList() { return (window.CHAPTERS || self.CHAPTERS || []); }
  function chapterCount() { return chapterList().length; }

  /* ------------------------------------------------------------- mastery --- */

  /*  per chapter:  0.25 if read  +  0.75 x min(1, best test score)
      mastery %  =  ( sum of chapter points / chapterCount ) x 100, 1 decimal

      Reading every chapter and answering nothing caps you at 25%. That is the
      product decision: progress is measured by retrieval, never by scrolling.

      THIS FORMULA IS IMPLEMENTED TWICE — here and in api/sql/leaderboard.sql,
      because the leaderboard has to order by it server-side. Rounding must be
      HALF-UP in both. Keep the two in step; api/tests covers it.        */
  function chapterPoints(c) {
    if (!c) return 0;
    var pts = c.read ? 0.25 : 0;
    var best = typeof c.best === "number" && isFinite(c.best) ? c.best : 0;
    pts += 0.75 * Math.min(1, Math.max(0, best));
    return pts;
  }
  function mastery() {
    var n = chapterCount();
    if (!n) return 0;
    var sum = 0;
    chapterList().forEach(function (ch) { sum += chapterPoints(profile.chapters[ch.id]); });
    return Math.round((sum / n) * 1000) / 10;
  }
  function partMastery(part) {
    var list = chapterList().filter(function (c) { return c.part === part; });
    if (!list.length) return 0;
    var sum = 0;
    list.forEach(function (ch) { sum += chapterPoints(profile.chapters[ch.id]); });
    return Math.round((sum / list.length) * 1000) / 10;
  }
  function passed(id) {
    var c = profile.chapters[id];
    return !!(c && typeof c.best === "number" && c.best >= 0.8);
  }
  function chaptersPassed() {
    return chapterList().filter(function (c) { return passed(c.id); }).length;
  }

  /* ------------------------------------------------------------ xp/level --- */

  var LEVELS = [
    { xp: 0,     name: "Curioso" },
    { xp: 250,   name: "Stagista" },
    { xp: 700,   name: "Junior Database Developer" },
    { xp: 1500,  name: "Database Developer" },
    { xp: 2800,  name: "Mid Developer" },
    { xp: 4600,  name: "Senior Database Developer" },
    { xp: 7000,  name: "Data Lead" },
    { xp: 10000, name: "Architetto dei dati" },
  ];
  function level() {
    var cur = LEVELS[0], next = null;
    for (var i = 0; i < LEVELS.length; i++) {
      if (profile.xp >= LEVELS[i].xp) { cur = LEVELS[i]; next = LEVELS[i + 1] || null; }
    }
    var into = profile.xp - cur.xp;
    var span = next ? next.xp - cur.xp : 1;
    return {
      name: cur.name, index: LEVELS.indexOf(cur), next: next,
      progress: next ? Math.min(1, into / span) : 1,
      toNext: next ? next.xp - profile.xp : 0,
    };
  }

  var CARD_XP_CAP = 240;   // cards and viva SHARE this cap, see addXp()

  function todayRow() {
    var d = today();
    if (!profile.history[d]) {
      profile.history[d] = { xp: 0, cards: 0, answers: 0, correct: 0, minutes: 0, cardXp: 0, viva: 0 };
    }
    return profile.history[d];
  }

  /* `kind` is "card" for anything that counts against the daily card cap. */
  function addXp(n, kind, why) {
    n = Math.max(0, Math.round(n));
    if (!n) return 0;
    var row = todayRow();
    if (kind === "card") {
      var room = Math.max(0, CARD_XP_CAP - row.cardXp);
      n = Math.min(n, room);
      if (!n) return 0;
      row.cardXp += n;
    }
    profile.xp += n;
    row.xp += n;
    emit("xp", { amount: n, why: why || "", total: profile.xp });
    checkBadges();
    save();
    return n;
  }

  function touchStreak() {
    var d = today();
    var s = profile.streak;
    if (s.lastDay === d) return false;
    if (s.lastDay && daysBetween(s.lastDay, d) === 1) s.count += 1;
    else s.count = 1;
    s.lastDay = d;
    if (s.count > s.best) s.best = s.count;
    addXp(15, "day", "Streak: day " + s.count);
    return true;
  }
  function streakAlive() {
    var s = profile.streak;
    if (!s.lastDay) return false;
    return daysBetween(s.lastDay, today()) <= 1;
  }

  /* ------------------------------------------- spaced repetition (SM-2) --- */

  var MIN_EASE = 1.3, MAX_EASE = 3.2, MAX_INTERVAL = 180;

  function newCard() {
    return { ease: 2.5, interval: 0, reps: 0, lapses: 0, due: today(), last: "", grade: -1 };
  }

  /* grade: 0 = wrong, 1 = right but hesitant, 2 = right and certain.
     Grade 1 is the only signal the scheduler cannot derive for itself, and
     it is why this stays useful after a month: a right answer you had to dig
     for is not the same memory as one you knew. */
  function schedule(card, grade) {
    var c = card || newCard();
    if (grade === 0) {
      c.lapses += 1;
      c.reps = 0;
      c.interval = 1;
      c.ease = Math.max(MIN_EASE, c.ease - 0.2);   // small: one bad day must not bury a known card
    } else {
      c.reps += 1;
      if (c.reps === 1) c.interval = 1;
      else if (c.reps === 2) c.interval = grade === 2 ? 4 : 3;
      else c.interval = Math.round(c.interval * c.ease);

      if (grade === 1) {
        c.ease = Math.max(MIN_EASE, c.ease - 0.15);
        c.interval = Math.max(1, Math.round(c.interval * 0.7));
      } else {
        c.ease = Math.min(MAX_EASE, c.ease + 0.1);
      }
    }
    c.interval = Math.min(c.interval, MAX_INTERVAL);
    c.due = addDays(today(), Math.max(1, c.interval));
    c.last = today();
    c.grade = grade;
    return c;
  }

  /* Due selection is GLOBAL, not per chapter, so a session naturally mixes
     window functions with deadlocks with backup strategy. That is interleaving:
     harder, better retention, and exactly what an interview does to you. */
  function dueFrom(map, limit) {
    var t = today();
    var out = [];
    for (var id in map) {
      var c = map[id];
      if (!c || !c.due) continue;
      if (daysBetween(c.due, t) >= 0) out.push({ id: id, card: c, over: daysBetween(c.due, t) });
    }
    out.sort(function (a, b) {
      if (b.over !== a.over) return b.over - a.over;          // most overdue first
      return (b.card.lapses || 0) - (a.card.lapses || 0);     // then most lapsed
    });
    return limit ? out.slice(0, limit) : out;
  }
  function due(limit) { return dueFrom(profile.cards, limit); }
  function vivaDue(limit) { return dueFrom(profile.viva, limit); }

  function review(id, grade) {
    profile.cards[id] = schedule(profile.cards[id], grade);
    var row = todayRow();
    row.cards += 1;
    touchStreak();
    addXp(grade === 0 ? 2 : 5, "card", "Card reviewed");
    save();
    return profile.cards[id];
  }
  function vivaReview(id, grade) {
    profile.viva[id] = schedule(profile.viva[id], grade);
    var row = todayRow();
    row.viva += 1;
    touchStreak();
    addXp(grade === 0 ? 3 : 8, "card", "Rule recited");
    save();
    return profile.viva[id];
  }
  /* Seed a card at first sight without touching the schedule. */
  function seen(id) {
    if (!profile.cards[id]) { profile.cards[id] = newCard(); save(); }
  }

  function recall() {
    var ids = Object.keys(profile.cards);
    if (!ids.length) return 0;
    var strong = 0;
    ids.forEach(function (id) {
      var c = profile.cards[id];
      if (c.reps >= 2 && c.interval >= 4) strong++;
    });
    return Math.round((strong / ids.length) * 1000) / 10;
  }

  function weakest(n) {
    var byCh = {};
    for (var id in profile.cards) {
      var ch = id.split("#")[0];
      byCh[ch] = (byCh[ch] || 0) + (profile.cards[id].lapses || 0);
    }
    return Object.keys(byCh)
      .filter(function (k) { return byCh[k] > 0; })
      .map(function (k) { return { id: k, lapses: byCh[k] }; })
      .sort(function (a, b) { return b.lapses - a.lapses; })
      .slice(0, n || 5);
  }

  function vivaStats(total) {
    var ids = Object.keys(profile.viva);
    var t = today(), dueN = 0, strong = 0, lapsed = 0;
    ids.forEach(function (id) {
      var c = profile.viva[id];
      if (daysBetween(c.due, t) >= 0) dueN++;
      if (c.reps >= 2 && c.interval >= 4) strong++;
      if (c.lapses > 0) lapsed++;
    });
    return {
      seen: ids.length, total: total || 0, due: dueN,
      strong: strong, lapsed: lapsed, clean: ids.length - lapsed,
    };
  }

  /* ------------------------------------------------------------ chapters --- */

  function chapter(id) {
    if (!profile.chapters[id]) {
      profile.chapters[id] = { read: false, readAt: "", best: 0, attempts: 0, lastAt: "", seconds: 0, perfect: false };
    }
    return profile.chapters[id];
  }

  function markRead(id) {
    var c = chapter(id);
    if (c.read) return false;
    c.read = true;
    c.readAt = nowIso();
    touchStreak();
    addXp(10, "read", "Chapter read");
    save();
    return true;
  }

  function addSeconds(id, s) {
    if (!s || s < 1) return;
    var c = chapter(id);
    c.seconds += Math.round(s);
    todayRow().minutes = Math.round((todayRow().minutes || 0) + s / 60);
    save();
  }

  function recordTest(id, correct, total, seconds) {
    var c = chapter(id);
    var score = total ? correct / total : 0;
    var firstPass = score >= 0.8 && c.best < 0.8;
    var firstPerfect = score >= 1 && !c.perfect;

    c.attempts += 1;
    c.lastAt = nowIso();
    if (score > c.best) c.best = score;
    if (score >= 1) c.perfect = true;

    profile.attempts.push({ ch: id, at: nowIso(), correct: correct, total: total, s: Math.round(seconds || 0) });
    if (profile.attempts.length > 400) profile.attempts = profile.attempts.slice(-400);

    var row = todayRow();
    row.answers += total;
    row.correct += correct;

    touchStreak();
    if (firstPass) addXp(50, "test", "Chapter passed");
    if (firstPerfect) addXp(25, "test", "Perfect score");
    save();
    return { score: score, firstPass: firstPass, firstPerfect: firstPerfect, best: c.best };
  }

  function recordExam(correct, total, seconds) {
    var score = total ? correct / total : 0;
    if (!("examBest" in profile)) { profile.examBest = 0; profile.examCount = 0; }
    profile.examCount += 1;
    if (score > profile.examBest) profile.examBest = score;
    var row = todayRow();
    row.answers += total;
    row.correct += correct;
    profile.attempts.push({ ch: "@exam", at: nowIso(), correct: correct, total: total, s: Math.round(seconds || 0) });
    if (profile.attempts.length > 400) profile.attempts = profile.attempts.slice(-400);
    touchStreak();
    addXp(2 * correct, "exam", "Mock exam");
    save();
    return { score: score, best: profile.examBest, count: profile.examCount };
  }

  /* --------------------------------------------------------------- notes --- */

  function addNote(n) {
    var note = {
      id: "n" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      ch: n.ch || "", chTitle: n.chTitle || "", text: n.text || "",
      color: n.color || "yellow", x: typeof n.x === "number" ? n.x : 0.04,
      y: typeof n.y === "number" ? n.y : 24, pinned: false, quote: n.quote || "",
      createdAt: nowIso(), updatedAt: nowIso(),
    };
    profile.notes.push(note);
    save();
    checkBadges();
    return note;
  }
  function updateNote(id, patch) {
    var n = profile.notes.filter(function (x) { return x.id === id; })[0];
    if (!n) return null;
    for (var k in patch) n[k] = patch[k];
    n.updatedAt = nowIso();
    save();
    return n;
  }
  function removeNote(id) {
    profile.notes = profile.notes.filter(function (x) { return x.id !== id; });
    save();
  }
  function notesFor(ch) { return profile.notes.filter(function (n) { return n.ch === ch; }); }

  /* -------------------------------------------------------------- badges --- */

  var BADGES = [
    { id: "first-step",   icon: "👣", name: "First step",     hint: "Read one chapter",
      test: function (p) { return Object.keys(p.chapters).some(function (k) { return p.chapters[k].read; }); } },
    { id: "first-test",   icon: "✅", name: "First pass",     hint: "Pass any chapter test",
      test: function (p) { return Object.keys(p.chapters).some(function (k) { return p.chapters[k].best >= 0.8; }); } },
    { id: "perfect",      icon: "💯", name: "Perfect",        hint: "100% on a chapter test",
      test: function (p) { return Object.keys(p.chapters).some(function (k) { return p.chapters[k].perfect; }); } },
    { id: "perfect-five", icon: "🏅", name: "Five perfect",   hint: "100% on five chapters",
      test: function (p) { return Object.keys(p.chapters).filter(function (k) { return p.chapters[k].perfect; }).length >= 5; } },
    { id: "streak-3",     icon: "🔥", name: "Three days",     hint: "A three-day streak",
      test: function (p) { return p.streak.best >= 3; } },
    { id: "streak-7",     icon: "🔥", name: "A week",         hint: "A seven-day streak",
      test: function (p) { return p.streak.best >= 7; } },
    { id: "streak-30",    icon: "🏔", name: "A month",        hint: "A thirty-day streak",
      test: function (p) { return p.streak.best >= 30; } },
    { id: "cards-100",    icon: "🃏", name: "100 cards",      hint: "Review a hundred cards",
      test: function (p) { return totalReviews(p) >= 100; } },
    { id: "cards-500",    icon: "🎴", name: "500 cards",      hint: "Review five hundred cards",
      test: function (p) { return totalReviews(p) >= 500; } },
    { id: "faced-errors", icon: "🛠", name: "Faced it",       hint: "Every lapsed card back to a 4-day interval",
      test: function (p) {
        var lapsed = Object.keys(p.cards).filter(function (k) { return p.cards[k].lapses > 0; });
        return lapsed.length >= 5 && lapsed.every(function (k) { return p.cards[k].interval >= 4; });
      } },
    { id: "half",         icon: "🌗", name: "Halfway",        hint: "50% course mastery",
      test: function () { return mastery() >= 50; } },
    { id: "the-advert",   icon: "📋", name: "The advert",     hint: "Pass every chapter the adverts asked for",
      test: function () {
        var req = chapterList().filter(function (c) { return c.req; });
        return req.length > 0 && req.every(function (c) { return passed(c.id); });
      } },
    { id: "the-edge",     icon: "🧭", name: "The edge",       hint: "Pass every chapter no advert asked for",
      test: function () {
        var ex = chapterList().filter(function (c) { return c.extra; });
        return ex.length > 0 && ex.every(function (c) { return passed(c.id); });
      } },
    { id: "complete",     icon: "🎓", name: "Complete",       hint: "99% course mastery",
      test: function () { return mastery() >= 99; } },
    { id: "exam-pass",    icon: "📝", name: "Exam passed",    hint: "80% on a mock exam",
      test: function (p) { return (p.examBest || 0) >= 0.8; } },
    { id: "exam-ace",     icon: "🥇", name: "Exam aced",      hint: "95% on a mock exam",
      test: function (p) { return (p.examBest || 0) >= 0.95; } },
    { id: "note-taker",   icon: "📌", name: "Note taker",     hint: "Write ten notes",
      test: function (p) { return p.notes.length >= 10; } },
    { id: "viva-first",   icon: "🗣", name: "Said it out loud",hint: "Recite one rule",
      test: function (p) { return Object.keys(p.viva).length >= 1; } },
    { id: "viva-50",      icon: "🎙", name: "Fifty rules",    hint: "Recite fifty rules",
      test: function (p) { return Object.keys(p.viva).length >= 50; } },
    { id: "viva-twelve",  icon: "👑", name: "The twelve",     hint: "Grade all twelve tier-one rules 'certain'",
      test: function (p) {
        // window.RULES is only loaded on the viva page — which is exactly when
        // this can become true. Every other page leaves this badge alone.
        var rules = window.RULES;
        if (!rules) return false;
        var t12 = rules.filter(function (r) { return r.tier === "twelve"; });
        return t12.length > 0 && t12.every(function (r) { return p.viva[r.id] && p.viva[r.id].grade === 2; });
      } },
    { id: "night-owl",    icon: "🦉", name: "Night owl",      hint: "Answer something between 00:00 and 05:00",
      test: function () { var h = new Date().getHours(); return h >= 0 && h < 5; } },
  ];

  function totalReviews(p) {
    var n = 0;
    for (var d in p.history) n += (p.history[d].cards || 0) + (p.history[d].viva || 0);
    return n;
  }

  var badgeTick = null;
  function checkBadges() {
    if (badgeTick) return;             // coalesce into one pass per tick
    badgeTick = setTimeout(function () {
      badgeTick = null;
      var earned = [];
      BADGES.forEach(function (b) {
        if (profile.badges[b.id]) return;   // once earned, never revoked
        var ok = false;
        try { ok = !!b.test(profile); } catch (e) { ok = false; }
        if (ok) { profile.badges[b.id] = nowIso(); earned.push(b); }
      });
      if (earned.length) { emit("badges", earned); writeRaw(profile); }
    }, 0);
  }

  /* ------------------------------------------------------------- export --- */

  function replace(doc) {
    profile = migrate(doc);
    flush();
    emit("replace", profile);
    emit("change", profile);
  }
  function reset() {
    profile = blank();
    flush();
    emit("replace", profile);
    emit("change", profile);
  }

  window.LF = {
    /* raw access — read freely, mutate through the methods */
    get profile() { return profile; },
    get memoryOnly() { return memoryOnly; },
    KEY: KEY,
    BADGES: BADGES,
    LEVELS: LEVELS,
    CARD_XP_CAP: CARD_XP_CAP,

    /* dates */
    today: today, addDays: addDays, daysBetween: daysBetween,

    /* meta */
    chapterCount: chapterCount,

    /* progress */
    mastery: mastery, partMastery: partMastery, passed: passed,
    chaptersPassed: chaptersPassed, chapterPoints: chapterPoints,
    level: level, addXp: addXp, touchStreak: touchStreak, streakAlive: streakAlive,

    /* chapters */
    chapter: chapter, markRead: markRead, addSeconds: addSeconds,
    recordTest: recordTest, recordExam: recordExam,

    /* scheduling */
    newCard: newCard, schedule: schedule, due: due, vivaDue: vivaDue,
    review: review, vivaReview: vivaReview, seen: seen,
    recall: recall, weakest: weakest, vivaStats: vivaStats,

    /* notes */
    addNote: addNote, updateNote: updateNote, removeNote: removeNote, notesFor: notesFor,

    /* plumbing */
    save: save, flush: flush, on: on, emit: emit,
    replace: replace, reset: reset, checkBadges: checkBadges,
  };

  // The night-owl badge can be true the moment a page loads at 3am.
  checkBadges();
})();
