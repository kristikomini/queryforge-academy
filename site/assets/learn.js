/* ===========================================================================
   learn.js — wires the engine to the page.

   Adds the progress pill, the streak and the review badge to the top bar;
   writes per-chapter status marks into the sidebar; mounts the chapter test;
   shows XP and badge toasts; and decides when a chapter counts as READ.

   It never assumes an element exists. Any page can leave a hook out and the
   rest still works — which is what keeps 52 hand-written files from becoming
   52 things that can break.
   =========================================================================== */

(function () {
  "use strict";
  if (!window.LF) return;

  var LF = window.LF;
  var ROOT = window.LF_ROOT || "";
  var chId = document.body.getAttribute("data-chapter") || "";
  var el = function (t, c, x) {
    var e = document.createElement(t);
    if (c) e.className = c;
    if (x != null) e.textContent = x;
    return e;
  };

  /* ================================================================ toasts */

  var toastHost = null;
  function toast(cls, icon, title, sub, ms) {
    if (!toastHost) {
      toastHost = el("div", "lf-toasts");
      document.body.appendChild(toastHost);
    }
    var t = el("div", "lf-toast " + cls);
    t.appendChild(el("span", "ic", icon));
    var b = el("div");
    b.appendChild(document.createTextNode(title));
    if (sub) b.appendChild(el("small", "", sub));
    t.appendChild(b);
    toastHost.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .3s, transform .3s";
      t.style.opacity = "0";
      t.style.transform = "translateY(6px)";
      setTimeout(function () { t.remove(); }, 320);
    }, ms || 2600);
  }

  /* XP toasts are coalesced: answering ten cards should not stack ten pills. */
  var xpPending = 0, xpTimer = null, xpWhy = "";
  LF.on("xp", function (d) {
    xpPending += d.amount;
    xpWhy = d.why || xpWhy;
    clearTimeout(xpTimer);
    xpTimer = setTimeout(function () {
      if (xpPending > 0) toast("xp", "✨", "+" + xpPending + " XP", xpWhy);
      xpPending = 0; xpWhy = "";
    }, 700);
  });

  LF.on("badges", function (list) {
    list.forEach(function (b, n) {
      setTimeout(function () { toast("badge", b.icon, b.name, b.hint, 4200); }, n * 500);
    });
  });

  /* ========================================================== top-bar chrome */

  function paintTopbar() {
    var slot = document.getElementById("lf-slot");
    if (!slot) return;
    slot.innerHTML = "";

    var m = LF.mastery();
    var lvl = LF.level();

    var a = el("a", "lf-pill");
    a.href = ROOT + "dashboard.html";
    a.title = lvl.name + " · " + LF.profile.xp + " XP" +
      (lvl.next ? " · " + lvl.toNext + " to " + lvl.next.name : "");
    var bar = el("span", "lf-bar");
    var fill = el("i");
    fill.style.width = m + "%";
    bar.appendChild(fill);
    a.appendChild(bar);
    var b = el("b", "", m + "%");
    a.appendChild(b);
    slot.appendChild(a);

    var s = LF.profile.streak;
    var st = el("a", "lf-pill");
    st.href = ROOT + "dashboard.html";
    var dot = el("span", "dot" + (LF.streakAlive() ? "" : " cold"));
    st.appendChild(dot);
    st.appendChild(el("b", "", String(s.count || 0)));
    st.title = LF.streakAlive()
      ? "Streak: " + s.count + " day" + (s.count === 1 ? "" : "s") + " · best " + s.best
      : "Streak is cold. Any answer today restarts it.";
    slot.appendChild(st);

    var dueN = LF.due().length;
    var vDue = LF.vivaDue().length;
    if (dueN + vDue > 0) {
      var r = el("a", "lf-pill due");
      r.href = ROOT + (dueN >= vDue ? "review.html" : "viva.html");
      r.appendChild(document.createTextNode("🔁"));
      r.appendChild(el("b", "", String(dueN + vDue)));
      r.title = dueN + " card" + (dueN === 1 ? "" : "s") + " and " + vDue + " rule" + (vDue === 1 ? "" : "s") + " due";
      slot.appendChild(r);
    }
  }

  /* ========================================================== sidebar marks */

  function paintSidebar() {
    document.querySelectorAll(".sb-link .mark[data-ch]").forEach(function (m) {
      var id = m.getAttribute("data-ch");
      var c = LF.profile.chapters[id];
      if (!c) { m.textContent = ""; m.title = ""; return; }
      if (c.best >= 1) { m.textContent = "💯"; m.title = "Perfect score"; }
      else if (c.best >= 0.8) { m.textContent = "✅"; m.title = "Passed (" + Math.round(c.best * 100) + "%)"; }
      else if (c.attempts) { m.textContent = "◔"; m.title = "Best " + Math.round(c.best * 100) + "%"; }
      else if (c.read) { m.textContent = "•"; m.title = "Read, not tested"; }
      else { m.textContent = ""; m.title = ""; }
    });
  }

  LF.on("change", function () { paintTopbar(); paintSidebar(); });
  LF.on("nav", paintSidebar);

  /* ======================================================= read detection */

  /*  A chapter counts as read when the learner has scrolled to within 400px of
      the bottom, OR spent 120 seconds on the page. Neither alone is honest:
      scrolling fast is not reading, and sitting on a tab is not either — but
      one of the two is a fair floor, and reading is only worth 25% anyway.  */
  var READ_PX = 400, READ_MS = 120000;
  var landed = Date.now();

  function watchRead() {
    if (!chId) return;
    if (LF.profile.chapters[chId] && LF.profile.chapters[chId].read) { trackTime(); return; }

    var fired = false;
    function done() {
      if (fired) return;
      fired = true;
      if (LF.markRead(chId)) toast("xp", "📖", "Chapter read", "+10 XP · scroll test unlocked");
      window.removeEventListener("scroll", onScroll);
      clearTimeout(timer);
    }
    function onScroll() {
      var left = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      if (left < READ_PX) done();
    }
    var timer = setTimeout(done, READ_MS);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    trackTime();
  }

  function trackTime() {
    window.addEventListener("beforeunload", function () {
      var s = (Date.now() - landed) / 1000;
      if (s > 5 && s < 3600 && chId) LF.addSeconds(chId, s);
    });
  }

  /* ========================================================== chapter test */

  function mountChapterTest() {
    if (!chId || !window.LFQuiz) return;
    var host = document.getElementById("chapter-quiz");
    if (!host) return;

    var qs = window.LFQuiz.forChapter(chId);
    if (!qs.length) {
      host.appendChild(el("p", "muted", "Questions for this chapter are not written yet."));
      return;
    }

    var started = Date.now();
    window.LFQuiz.mount(host, {
      title: "Test yourself",
      questions: window.LFQuiz.shuffle(qs),
      onGrade: function (q, grade) {
        /* Every answered question enters the spaced-repetition schedule, which
           is why the chapter test is not a one-off: it seeds the deck. */
        LF.review(q.id, grade);
      },
      onDone: function (r) {
        var res = LF.recordTest(chId, r.correct, r.total, r.seconds);
        if (res.firstPerfect) toast("badge", "💯", "Perfect", "+25 XP", 3600);
        else if (res.firstPass) toast("badge", "✅", "Chapter passed", "+50 XP", 3600);
        paintTopbar();
        paintSidebar();
      },
    });
  }

  /* ================================================================== boot */

  function boot() {
    paintTopbar();
    paintSidebar();
    watchRead();
    mountChapterTest();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  window.LFLearn = { toast: toast, paintTopbar: paintTopbar, paintSidebar: paintSidebar };
})();
