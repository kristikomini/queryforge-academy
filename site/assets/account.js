/* ===========================================================================
   account.js — the client half of the accounts service.

   An account is ONLY a way to move progress between devices. Nothing on this
   site is behind it, and signing out never touches local progress.

   Session state lives in localStorage under five keys, separate from the
   profile itself so that clearing a session cannot corrupt a month of study.

   The cycle is  pull -> merge -> push,  coalesced, four seconds after any
   profile change. The merge (bottom of this file) is deliberately conservative:
   NOTHING IS EVER REMOVED BY IT. Losing a month of study to a sync bug is
   unrecoverable; having a stale note is not.
   =========================================================================== */

(function () {
  "use strict";
  if (!window.LF) return;

  var LF = window.LF;
  var K = {
    base: "queryforge.api.base",
    token: "queryforge.api.token",
    refresh: "queryforge.api.refresh",
    user: "queryforge.api.user",
    revision: "queryforge.api.revision",
  };

  function get(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function set(k, v) { try { v ? localStorage.setItem(k, v) : localStorage.removeItem(k); } catch (e) {} }

  /* --------------------------------------------------------- API base ----
     Served over http(s): GUESS the same origin, then CHECK. Opened from
     file://: there is no origin to guess, so it stays empty until somebody
     types one into account.html. Changing it necessarily signs you out — the
     token in this browser was minted by the old server — but leaves local
     progress alone, which is what makes it safe to let anyone do.

     THE GUESS HAS TO BE CHECKED, because the site is deliberately hostable as
     plain static files — GitHub Pages, an S3 bucket, a USB stick — where there
     is no API at all. Assuming same-origin means one exists produces a stream
     of failed syncs and an error banner on a site that is working perfectly.
     So: probe /api/health once per session and remember the answer.          */
  var PROBE_KEY = "queryforge.api.absent";

  function sameOriginRuledOut() {
    try { return sessionStorage.getItem(PROBE_KEY) === "1"; } catch (e) { return false; }
  }
  function ruleOutSameOrigin() {
    try { sessionStorage.setItem(PROBE_KEY, "1"); } catch (e) {}
  }

  function base() {
    var b = get(K.base);
    if (b) return b.replace(/\/+$/, "");
    if (location.protocol !== "http:" && location.protocol !== "https:") return "";
    if (sameOriginRuledOut()) return "";
    return location.origin;
  }

  /*  One request, no retry, and it never touches the database on the server
      side — /api/health is deliberately outside the rate limiter and does not
      query anything. A 404 or a network error both mean "not served here". */
  function probeSameOrigin() {
    if (get(K.base) || sameOriginRuledOut()) return Promise.resolve();
    if (location.protocol !== "http:" && location.protocol !== "https:") return Promise.resolve();
    return fetch(location.origin + "/api/health", { method: "GET", credentials: "omit" })
      .then(function (r) { if (!r.ok) ruleOutSameOrigin(); })
      .catch(function () { ruleOutSameOrigin(); })
      .then(function () { LF.emit("account", state()); });
  }
  function setBase(b) {
    b = (b || "").trim().replace(/\/+$/, "");
    if (b === get(K.base)) return;
    set(K.base, b);
    signOutLocal();
    LF.emit("account", state());
  }

  function user() {
    try { return JSON.parse(get(K.user) || "null"); } catch (e) { return null; }
  }
  function signedIn() { return !!(get(K.token) && user()); }
  function state() {
    return {
      base: base(), configured: !!base(), signedIn: signedIn(),
      user: user(), revision: parseInt(get(K.revision) || "0", 10) || 0,
      syncedAt: syncedAt, syncing: syncing, lastError: lastError,
    };
  }
  function signOutLocal() {
    set(K.token, ""); set(K.refresh, ""); set(K.user, ""); set(K.revision, "");
  }

  /* ------------------------------------------------------------ transport */

  var syncedAt = "";      // in memory ONLY — see sync() for why
  var syncing = false;
  var lastError = "";

  function api(path, opts, retry) {
    var b = base();
    if (!b) return Promise.reject(new Error("No API address configured."));
    opts = opts || {};
    var headers = { "Accept": "application/json" };
    if (opts.body !== undefined) headers["Content-Type"] = "application/json";
    if (opts.auth !== false && get(K.token)) headers["Authorization"] = "Bearer " + get(K.token);

    return fetch(b + path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "omit",
      mode: "cors",
    }).then(function (res) {
      if (res.status === 401 && !retry && get(K.refresh) && opts.auth !== false) {
        /* One refresh, one retry, then give up. A refresh loop against a
           server that is simply rejecting us is a denial of service we would
           be running against ourselves. */
        return refresh().then(function () { return api(path, opts, true); });
      }
      if (res.status === 204) {
        /* Drain the body rather than abandoning it: an unread response shows
           up in the network panel as an aborted request, which looks like a
           bug and costs somebody twenty minutes. */
        return res.text().then(function () { return { status: 204, data: null }; });
      }
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var e = new Error((data && (data.detail || data.title)) || ("HTTP " + res.status));
          e.status = res.status;
          e.data = data;
          throw e;
        }
        return { status: res.status, data: data };
      });
    });
  }

  function adopt(auth) {
    set(K.token, auth.accessToken || "");
    set(K.refresh, auth.refreshToken || "");
    set(K.user, JSON.stringify(auth.user || null));
    LF.emit("account", state());
    return auth;
  }

  function refresh() {
    return api("/api/auth/refresh", { method: "POST", auth: false, body: { refreshToken: get(K.refresh) } })
      .then(function (r) { return adopt(r.data); })
      .catch(function (e) { signOutLocal(); LF.emit("account", state()); throw e; });
  }

  /* ---------------------------------------------------------------- auth */

  function register(username, displayName, password) {
    return api("/api/auth/register", { method: "POST", auth: false, body: { username: username, displayName: displayName, password: password } })
      .then(function (r) { adopt(r.data); return r.data; });   // carries recoveryCode ONCE
  }
  function login(username, password) {
    return api("/api/auth/login", { method: "POST", auth: false, body: { username: username, password: password } })
      .then(function (r) { adopt(r.data); return r.data; });
  }
  function logout() {
    var rt = get(K.refresh);
    signOutLocal();
    LF.emit("account", state());
    if (!rt) return Promise.resolve();
    return api("/api/auth/logout", { method: "POST", auth: false, body: { refreshToken: rt } }).catch(function () {});
  }
  function forgot(username, recoveryCode) {
    return api("/api/auth/forgot-password", { method: "POST", auth: false, body: { username: username, recoveryCode: recoveryCode } })
      .then(function (r) { return r.data; });
  }
  function resetPassword(resetToken, newPassword) {
    return api("/api/auth/reset-password", { method: "POST", auth: false, body: { resetToken: resetToken, newPassword: newPassword } })
      .then(function (r) { adopt(r.data); return r.data; });
  }
  function newRecoveryCode() {
    return api("/api/auth/recovery-code", { method: "POST" }).then(function (r) { return r.data; });
  }
  function me() { return api("/api/auth/me").then(function (r) { return r.data; }); }
  function deleteAccount() {
    return api("/api/me", { method: "DELETE" }).then(function () { signOutLocal(); LF.emit("account", state()); });
  }
  function leaderboard() { return api("/api/leaderboard").then(function (r) { return r.data || []; }); }
  function setVisible(v) { return api("/api/me/leaderboard?visible=" + (v ? "true" : "false"), { method: "PUT" }); }

  /* ---------------------------------------------------------------- sync */

  function pull() {
    return api("/api/profile").then(function (r) {
      if (r.status === 204) return null;
      return r.data;                                   // { data, updatedAt, revision }
    });
  }

  function push(doc, baseRevision) {
    return api("/api/profile", {
      method: "PUT",
      body: { data: doc, updatedAt: doc.updatedAt, baseRevision: baseRevision },
    }).then(function (r) { return r.data; });
  }

  var syncTimer = null;
  function schedule() {
    if (!signedIn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () { sync(); }, 4000);
  }
  LF.on("change", schedule);

  function sync() {
    if (!signedIn() || syncing) return Promise.resolve(null);
    syncing = true;
    lastError = "";
    LF.emit("account", state());

    return pull().then(function (remote) {
      var local = LF.profile;
      var merged = remote && remote.data ? mergeProfiles(local, remote.data) : local;
      var rev = remote ? remote.revision : 0;

      if (remote && remote.data && !same(merged, local)) LF.replace(merged);

      if (!remote || !remote.data || !same(merged, remote.data)) {
        return push(merged, rev).catch(function (e) {
          if (e.status === 409 && e.data) {
            /* The 409 carries the CURRENT document, so a conflict costs one
               round trip, not a refetch-and-guess. Merge again and retry once. */
            var again = mergeProfiles(LF.profile, e.data.data);
            LF.replace(again);
            return push(again, e.data.revision);
          }
          throw e;
        });
      }
      return remote;
    }).then(function (saved) {
      if (saved && typeof saved.revision === "number") set(K.revision, String(saved.revision));
      /* Stamped IN MEMORY, never persisted: persisting would go through
         save(), which emits change, which schedules another sync four seconds
         later, which stamps it again, forever. It is stamped even when nothing
         was sent, because a "last synced" that only moves when something
         changed is a clock that stops whenever you are up to date. */
      syncedAt = new Date().toISOString();
      return saved;
    }).catch(function (e) {
      lastError = e.message || String(e);
      return null;
    }).then(function (r) {
      syncing = false;
      LF.emit("account", state());
      return r;
    });
  }

  function same(a, b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (e) { return false; }
  }

  /* ================================================================ MERGE */

  /*  Two devices editing the same profile is the normal case, not the
      exception: you answer questions on a laptop and review cards on a phone.
      Last-write-wins silently throws one of them away.

      Field by field, and nothing is ever removed.                          */

  function newer(a, b) { return (a || "") > (b || "") ? a : b; }
  function earlier(a, b) {
    if (!a) return b;
    if (!b) return a;
    return a < b ? a : b;
  }
  function max(a, b) { return Math.max(a || 0, b || 0); }

  function mergeProfiles(local, remote) {
    if (!remote || typeof remote !== "object") return local;
    var out = JSON.parse(JSON.stringify(local));

    out.xp = max(local.xp, remote.xp);
    out.examBest = max(local.examBest, remote.examBest);
    out.examCount = max(local.examCount, remote.examCount);
    out.updatedAt = newer(local.updatedAt, remote.updatedAt);
    out.createdAt = earlier(local.createdAt, remote.createdAt);
    out.name = (remote.updatedAt || "") > (local.updatedAt || "") ? (remote.name || local.name) : local.name;

    /* chapters ------------------------------------------------------------ */
    out.chapters = {};
    Object.keys(local.chapters || {}).concat(Object.keys(remote.chapters || {})).forEach(function (id) {
      if (out.chapters[id]) return;
      var a = (local.chapters || {})[id] || {}, b = (remote.chapters || {})[id] || {};
      out.chapters[id] = {
        read: !!(a.read || b.read),
        readAt: earlier(a.readAt, b.readAt),          // earliest: you read it then, not now
        best: max(a.best, b.best),
        attempts: max(a.attempts, b.attempts),
        seconds: max(a.seconds, b.seconds),
        lastAt: newer(a.lastAt, b.lastAt),
        perfect: !!(a.perfect || b.perfect),
      };
    });

    /* cards and viva ------------------------------------------------------ */
    out.cards = mergeDecks(local.cards, remote.cards);
    out.viva = mergeDecks(local.viva, remote.viva);

    /* notes: union by id, newest updatedAt wins ---------------------------- */
    var notes = {};
    (local.notes || []).forEach(function (n) { notes[n.id] = n; });
    (remote.notes || []).forEach(function (n) {
      var cur = notes[n.id];
      if (!cur || (n.updatedAt || "") > (cur.updatedAt || "")) notes[n.id] = n;
    });
    out.notes = Object.keys(notes).map(function (k) { return notes[k]; });

    /* badges: union, keep the EARLIER stamp — once earned, earned ---------- */
    out.badges = {};
    Object.keys(local.badges || {}).concat(Object.keys(remote.badges || {})).forEach(function (id) {
      out.badges[id] = earlier((local.badges || {})[id], (remote.badges || {})[id]);
    });

    /* history: per-field MAXIMUM, never a sum ------------------------------
       The same session could otherwise be counted twice: it is pushed from
       one device, pulled by the other, and added to a row that already has it. */
    out.history = {};
    Object.keys(local.history || {}).concat(Object.keys(remote.history || {})).forEach(function (d) {
      if (out.history[d]) return;
      var a = (local.history || {})[d] || {}, b = (remote.history || {})[d] || {};
      out.history[d] = {
        xp: max(a.xp, b.xp), cards: max(a.cards, b.cards),
        answers: max(a.answers, b.answers), correct: max(a.correct, b.correct),
        minutes: max(a.minutes, b.minutes), cardXp: max(a.cardXp, b.cardXp),
        viva: max(a.viva, b.viva),
      };
    });

    /* streak -------------------------------------------------------------- */
    var ls = local.streak || {}, rs = remote.streak || {};
    var lead = (rs.lastDay || "") > (ls.lastDay || "") ? rs : ls;
    out.streak = { count: lead.count || 0, lastDay: lead.lastDay || "", best: max(ls.best, rs.best) };

    /* attempts: concatenate, dedupe on (ch, at), sort, keep the last 400 --- */
    var seen = {};
    out.attempts = (local.attempts || []).concat(remote.attempts || [])
      .filter(function (x) {
        var k = x.ch + "|" + x.at;
        if (seen[k]) return false;
        seen[k] = 1;
        return true;
      })
      .sort(function (a, b) { return (a.at || "") < (b.at || "") ? -1 : 1; })
      .slice(-400);

    out.goals = local.goals || remote.goals;
    return out;
  }

  /*  The device that reviewed MOST RECENTLY owns the schedule fields, because
      its answer is the one the schedule should be based on. But reps and
      lapses take the maximum: both reviews really did happen, and forgetting
      a lapse would make a weak card look strong.                            */
  function mergeDecks(a, b) {
    a = a || {}; b = b || {};
    var out = {};
    Object.keys(a).concat(Object.keys(b)).forEach(function (id) {
      if (out[id]) return;
      var x = a[id], y = b[id];
      if (!x) { out[id] = y; return; }
      if (!y) { out[id] = x; return; }
      var lead = (y.last || "") > (x.last || "") ? y : x;
      out[id] = {
        ease: lead.ease, interval: lead.interval, due: lead.due,
        grade: lead.grade, last: newer(x.last, y.last),
        reps: max(x.reps, y.reps), lapses: max(x.lapses, y.lapses),
      };
    });
    return out;
  }

  /* ------------------------------------------------------------------ api */

  window.LFAccount = {
    state: state, setBase: setBase, base: base, signedIn: signedIn, user: user,
    register: register, login: login, logout: logout,
    forgot: forgot, resetPassword: resetPassword, newRecoveryCode: newRecoveryCode,
    me: me, deleteAccount: deleteAccount,
    leaderboard: leaderboard, setVisible: setVisible,
    sync: sync, pull: pull, push: push, merge: mergeProfiles,
    probe: probeSameOrigin,
  };

  /*  Probe first, then sync. Doing it the other way round means the first sync
      on a static host fails visibly before we have established that there was
      never an API to sync with. */
  probeSameOrigin().then(function () {
    if (signedIn() && base()) setTimeout(sync, 800);
  });
})();
