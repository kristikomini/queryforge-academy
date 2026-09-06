/* ===========================================================================
   quiz.js — ONE renderer for three of the five retrieval surfaces.

   The chapter test, the review session and the mock exam are the same thing
   with different question sources, so they share this. The viva and the
   simulator are genuinely different exercises and have their own pages.

   Contract:  window.LFQuiz.mount(host, opts)

     opts.questions  [{ id, ch, q, code, a:[...], c:0|[0,2], why }]
     opts.mode       "chapter" | "review" | "exam"
     opts.title      heading text
     opts.seconds    time limit, or 0 for untimed
     opts.onGrade    (question, grade) — called once per answered question
     opts.onDone     (result) — { correct, total, seconds, score }
     opts.passMark   0.8 by default

   Interaction is three clicks or fewer per question:
     pick an option -> feedback appears IMMEDIATELY AND ALWAYS
     -> say how it felt ("I was sure" / "I half-guessed")
     -> next.
   A wrong answer needs no confidence button: it graded itself.
   =========================================================================== */

(function () {
  "use strict";

  var LETTERS = "ABCDE";

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }
  function isMulti(q) { return Array.isArray(q.c); }
  function correctSet(q) { return isMulti(q) ? q.c.slice().sort() : [q.c]; }
  function sameSet(a, b) {
    if (a.length !== b.length) return false;
    a = a.slice().sort(); b = b.slice().sort();
    return a.every(function (v, i) { return v === b[i]; });
  }
  function fmtClock(s) {
    s = Math.max(0, Math.round(s));
    return Math.floor(s / 60) + ":" + (s % 60 < 10 ? "0" : "") + (s % 60);
  }

  function mount(host, opts) {
    if (!host) return null;
    opts = opts || {};
    var qs = (opts.questions || []).slice();
    if (!qs.length) {
      host.innerHTML = "";
      host.appendChild(el("p", "muted", "No questions for this page yet."));
      return null;
    }

    var passMark = typeof opts.passMark === "number" ? opts.passMark : 0.8;
    var showOptions = opts.showOptions !== false;
    var i = 0, correct = 0, started = Date.now(), finished = false;
    var results = [];                     // one entry per question: true/false
    var deadline = opts.seconds ? Date.now() + opts.seconds * 1000 : 0;
    var clockTimer = null;

    host.innerHTML = "";
    host.className = "quiz";

    var head = el("div", "quiz-head");
    var h = el("h2", "", opts.title || "Test yourself");
    h.id = "quiz";
    head.appendChild(h);
    var meta = el("span", "meta");
    head.appendChild(meta);
    if (opts.seconds) {
      var clock = el("span", "q-clock", fmtClock(opts.seconds));
      head.appendChild(clock);
    }
    host.appendChild(head);

    var prog = el("div", "q-prog");
    host.appendChild(prog);

    var card = el("div", "q-card");
    host.appendChild(card);

    if (opts.seconds) {
      clockTimer = setInterval(function () {
        var left = (deadline - Date.now()) / 1000;
        clock.textContent = fmtClock(left);
        clock.classList.toggle("low", left <= 60);
        if (left <= 0) { clearInterval(clockTimer); finish(true); }
      }, 250);
    }

    function drawProgress() {
      prog.innerHTML = "";
      qs.forEach(function (_, n) {
        var b = el("i");
        if (n < results.length) b.className = results[n] ? "right" : "wrong";
        else if (n === i) b.className = "now";
        prog.appendChild(b);
      });
      meta.textContent = Math.min(i + 1, qs.length) + " / " + qs.length;
    }

    function render() {
      drawProgress();
      card.innerHTML = "";
      var q = qs[i];
      var picked = [];
      var locked = false;

      var stem = el("p", "q-stem");
      stem.innerHTML = q.q;            // stems may carry <code>; content is ours
      card.appendChild(stem);

      if (q.code) {
        var pre = el("pre");
        pre.appendChild(el("code", "", q.code));
        card.appendChild(pre);
      }

      var opts_ = el("div", "q-opts");
      card.appendChild(opts_);

      if (!showOptions) {
        /* The simulator asks bank questions WITHOUT their options, which turns
           a recognition item into a recall item at no content cost. */
        var ta = el("textarea", "viva-ans");
        ta.placeholder = "Say it out loud, then type what you said…";
        opts_.appendChild(ta);
      } else {
        q.a.forEach(function (text, n) {
          var b = el("button", "q-opt");
          b.type = "button";
          b.appendChild(el("span", "lt", LETTERS[n]));
          var tx = el("span", "tx");
          tx.innerHTML = text;
          b.appendChild(tx);
          b.onclick = function () {
            if (locked) return;
            if (isMulti(q)) {
              var at = picked.indexOf(n);
              if (at >= 0) picked.splice(at, 1); else picked.push(n);
              b.classList.toggle("picked");
              submitBtn.disabled = picked.length === 0;
            } else {
              picked = [n];
              grade();
            }
          };
          opts_.appendChild(b);
        });
      }

      var why = el("div", "q-why");
      why.style.display = "none";
      card.appendChild(why);

      var foot = el("div", "q-foot");
      card.appendChild(foot);

      var submitBtn = el("button", "btn", isMulti(q) ? "Check (select all that apply)" : "Check");
      if (isMulti(q) || !showOptions) {
        submitBtn.disabled = isMulti(q);
        submitBtn.onclick = function () {
          if (!showOptions) { picked = correctSet(q); }   // self-marked; see below
          grade();
        };
        foot.appendChild(submitBtn);
      }
      if (isMulti(q)) foot.appendChild(el("span", "q-hint", "More than one answer is correct."));

      function grade() {
        if (locked) return;
        locked = true;
        var right = sameSet(picked, correctSet(q));
        if (right) correct++;
        results[i] = right;

        if (showOptions) {
          opts_.querySelectorAll(".q-opt").forEach(function (b, n) {
            b.disabled = true;
            var isC = correctSet(q).indexOf(n) >= 0;
            var isP = picked.indexOf(n) >= 0;
            b.classList.remove("picked");
            if (isC) b.classList.add("right");
            else if (isP) b.classList.add("wrong");
          });
        }

        /* `why` is shown on CORRECT answers too. Feedback that only appears on
           failure teaches people to guess and check. */
        why.style.display = "";
        why.className = "q-why " + (right ? "right" : "wrong");
        why.innerHTML = "";
        why.appendChild(el("b", "", right ? "Correct" : "Not quite"));
        var p = el("p");
        p.style.margin = "0";
        p.innerHTML = q.why || "";
        why.appendChild(p);

        foot.innerHTML = "";
        if (right) {
          /* The only signal the scheduler cannot derive for itself. */
          var sure = el("button", "btn", "I was sure →");
          sure.onclick = function () { done(2); };
          var half = el("button", "btn quiet", "I half-guessed →");
          half.onclick = function () { done(1); };
          foot.appendChild(sure);
          foot.appendChild(half);
        } else {
          var nx = el("button", "btn", i + 1 < qs.length ? "Next →" : "Finish →");
          nx.onclick = function () { done(0); };
          foot.appendChild(nx);
        }
        foot.appendChild(el("span", "grow"));
        var mark = el("span", "q-hint", right ? "✅ right" : "❌ wrong");
        foot.appendChild(mark);
        drawProgress();

        if (window.LF) window.LF.checkBadges();
      }

      function done(grade) {
        if (opts.onGrade) { try { opts.onGrade(q, grade); } catch (e) { console.error(e); } }
        i++;
        if (i >= qs.length) finish(false);
        else render();
      }
    }

    function finish(timedOut) {
      if (finished) return;
      finished = true;
      if (clockTimer) clearInterval(clockTimer);
      var seconds = (Date.now() - started) / 1000;
      var total = qs.length;
      var score = total ? correct / total : 0;

      card.innerHTML = "";
      var done = el("div", "q-done");
      var s = el("div", "q-score " + (score >= passMark ? "pass" : "fail"), Math.round(score * 100) + "%");
      done.appendChild(s);
      done.appendChild(el("p", "", correct + " of " + total + " in " + fmtClock(seconds) +
        (timedOut ? " — time ran out, the rest counted as wrong." : "")));

      var msg = score >= 1 ? "Perfect. Come back when the schedule says so, not before."
        : score >= passMark ? "Passed. The questions you missed are already in tomorrow's review."
        : "Not yet. Reread the sections behind the misses — the explanations above each say which.";
      done.appendChild(el("p", "muted", msg));

      var row = el("div", "row");
      row.style.justifyContent = "center";
      var again = el("button", "btn ghost", "Try again");
      again.onclick = function () {
        i = 0; correct = 0; results = []; finished = false; started = Date.now();
        if (opts.seconds) { deadline = Date.now() + opts.seconds * 1000; }
        card.className = "q-card";
        render();
        if (opts.seconds) {
          clockTimer = setInterval(function () {
            var left = (deadline - Date.now()) / 1000;
            clock.textContent = fmtClock(left);
            clock.classList.toggle("low", left <= 60);
            if (left <= 0) { clearInterval(clockTimer); finish(true); }
          }, 250);
        }
      };
      row.appendChild(again);
      done.appendChild(row);
      card.appendChild(done);

      drawProgress();
      if (opts.onDone) {
        try { opts.onDone({ correct: correct, total: total, seconds: seconds, score: score, timedOut: timedOut }); }
        catch (e) { console.error(e); }
      }
    }

    render();
    return { finish: finish };
  }

  /* --------------------------------------------------------------- pools --- */

  /* Flatten the bank into question objects that carry their own id. The id is
     "<chapter-id>#<index>" and the index IS the array position — which is why
     the bank is append-only. See tools/quiz-ids.lock. */
  function all() {
    var out = [];
    var bank = window.QUIZZES || {};
    Object.keys(bank).forEach(function (ch) {
      (bank[ch] || []).forEach(function (q, n) {
        out.push(Object.assign({}, q, { id: ch + "#" + n, ch: ch }));
      });
    });
    return out;
  }
  function forChapter(ch) {
    return ((window.QUIZZES || {})[ch] || []).map(function (q, n) {
      return Object.assign({}, q, { id: ch + "#" + n, ch: ch });
    });
  }
  function byId(id) {
    var ch = id.split("#")[0], n = parseInt(id.split("#")[1], 10);
    var q = ((window.QUIZZES || {})[ch] || [])[n];
    return q ? Object.assign({}, q, { id: id, ch: ch }) : null;
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function count() { return all().length; }

  window.LFQuiz = { mount: mount, all: all, forChapter: forChapter, byId: byId, shuffle: shuffle, count: count };
})();
