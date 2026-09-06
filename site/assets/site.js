/* ===========================================================================
   site.js — the chrome. Top bar, sidebar, search, TOC, pager, copy buttons,
   theme, the Both/Simple/Pro switch, and the keyboard map.

   Runs on every page, chapter or not, and assumes nothing exists. Any page is
   allowed to leave a hook out and the rest must still work — that is what
   keeps 52 hand-written files from becoming 52 things that can break.

   Everything here works from file://. There is no build step and no router:
   the only thing that varies is whether the page sits in site/ or in
   site/chapters/, which ROOT resolves once.
   =========================================================================== */

(function () {
  "use strict";

  var CH = window.CHAPTERS || [];
  var PARTS = window.PARTS || [];

  /* file:// safe path prefix. A chapter page is one directory deeper. */
  var inChapters = /\/chapters\//.test(location.pathname);
  var ROOT = inChapters ? "../" : "";
  window.LF_ROOT = ROOT;

  var currentId = document.body.getAttribute("data-chapter") || "";
  var page = document.body.getAttribute("data-page") || "";

  function href(ch) { return ROOT + "chapters/" + ch.id + ".html"; }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* ====================================================== theme + explain */

  var THEME_KEY = "queryforge.theme";
  var EXPLAIN_KEY = "queryforge.explain";

  function readPref(k, fallback) {
    try { return localStorage.getItem(k) || fallback; } catch (e) { return fallback; }
  }
  function writePref(k, v) {
    try { localStorage.setItem(k, v); } catch (e) {}
  }

  function applyTheme(t) {
    var root = document.documentElement;
    if (t === "light" || t === "dark") root.setAttribute("data-theme", t);
    else root.removeAttribute("data-theme");

    /* The two <meta name="theme-color"> tags carry a `media` attribute so the
       OS bar follows prefers-color-scheme by default. An explicit choice has
       to override that, so we flip the media queries rather than the colours:
       the chosen one matches everything, the other matches nothing. */
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    if (metas.length === 2) {
      var light = metas[0], dark = metas[1];
      if (t === "light") { light.media = "all"; dark.media = "not all"; }
      else if (t === "dark") { light.media = "not all"; dark.media = "all"; }
      else {
        light.media = "(prefers-color-scheme: light)";
        dark.media = "(prefers-color-scheme: dark)";
      }
    }
  }

  function applyExplain(mode) {
    document.documentElement.setAttribute("data-explain", mode);
  }

  applyTheme(readPref(THEME_KEY, "auto"));
  applyExplain(readPref(EXPLAIN_KEY, "both"));

  /* ============================================================== top bar */

  function buildTopbar() {
    if (document.querySelector(".topbar")) return;
    var bar = el("div", "topbar");

    var menu = el("button", "tb-btn menu-btn", "☰");
    menu.setAttribute("aria-label", "Menu");
    menu.onclick = function () { document.body.classList.toggle("nav-open"); };
    bar.appendChild(menu);

    /* Simple / Both / Pro. The switch is what turns a chapter into a
       self-test: read the simple one, produce the professional one. */
    var seg = el("div", "seg");
    seg.setAttribute("role", "group");
    seg.setAttribute("aria-label", "Explanation level");
    [["both", "Both"], ["kid", "🧒 Simple"], ["pro", "🎓 Pro"]].forEach(function (o) {
      var b = el("button", "", o[1]);
      b.setAttribute("aria-pressed", readPref(EXPLAIN_KEY, "both") === o[0] ? "true" : "false");
      b.onclick = function () {
        writePref(EXPLAIN_KEY, o[0]);
        applyExplain(o[0]);
        seg.querySelectorAll("button").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", "true");
      };
      seg.appendChild(b);
    });
    bar.appendChild(seg);

    bar.appendChild(el("div", "spacer"));

    var slot = el("div", "row");
    slot.id = "lf-slot";              // learn.js fills this with progress chrome
    bar.appendChild(slot);

    var theme = el("button", "tb-btn", themeIcon());
    theme.title = "Theme: light / dark / auto";
    theme.setAttribute("aria-label", "Toggle theme");
    theme.onclick = function () {
      var order = ["auto", "light", "dark"];
      var next = order[(order.indexOf(readPref(THEME_KEY, "auto")) + 1) % 3];
      writePref(THEME_KEY, next);
      applyTheme(next);
      theme.textContent = themeIcon();
    };
    bar.appendChild(theme);

    document.body.appendChild(bar);
  }
  function themeIcon() {
    var t = readPref(THEME_KEY, "auto");
    return t === "light" ? "☀" : t === "dark" ? "🌙" : "◐";
  }

  /* ============================================================== sidebar */

  function buildSidebar() {
    var host = document.getElementById("sidebar");
    if (!host) return;
    host.innerHTML = "";

    var brand = el("a", "brand");
    brand.href = ROOT + "index.html";
    var mark = el("div", "mark", "⌗");
    brand.appendChild(mark);
    var wrap = el("div");
    wrap.appendChild(document.createTextNode("QueryForge"));
    wrap.appendChild(el("small", "", "SQL, for the job you want"));
    brand.appendChild(wrap);
    host.appendChild(brand);

    var sb = el("div", "sb-search");
    var input = el("input");
    input.type = "search";
    input.placeholder = "Search chapters…  ( / )";
    input.id = "sb-q";
    input.setAttribute("aria-label", "Search chapters");
    sb.appendChild(input);
    host.appendChild(sb);

    var scroll = el("div", "sb-scroll");
    scroll.id = "sb-scroll";
    host.appendChild(scroll);

    renderNav("");
    input.addEventListener("input", function () { renderNav(input.value); });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { input.value = ""; renderNav(""); input.blur(); }
      if (e.key === "Enter") {
        var first = scroll.querySelector(".sb-link");
        if (first) location.href = first.href;
      }
    });
  }

  function renderNav(q) {
    var scroll = document.getElementById("sb-scroll");
    if (!scroll) return;
    scroll.innerHTML = "";
    q = (q || "").trim().toLowerCase();

    var list = CH.filter(function (c) {
      if (!q) return true;
      return (c.n + " " + c.title + " " + c.blurb + " " + (c.tags || "")).toLowerCase().indexOf(q) >= 0;
    });

    if (!list.length) {
      scroll.appendChild(el("p", "sb-empty", "Nothing matches “" + q + "”."));
      return;
    }

    /* Extra links live at the top and are always shown; they are the tools,
       not the content, and hiding them behind a search for "review" is silly. */
    if (!q) {
      var tools = el("div");
      [["dashboard.html", "📊", "Dashboard"], ["review.html", "🔁", "Review"],
       ["viva.html", "🗣", "Viva"], ["exam.html", "📝", "Mock exam"],
       ["simulate.html", "⏱", "Simulator"], ["playground.html", "⌗", "SQL playground"]]
        .forEach(function (t) {
          var a = el("a", "sb-link" + (page === t[0].replace(".html", "") ? " active" : ""));
          a.href = ROOT + t[0];
          a.appendChild(el("span", "num", t[1]));
          a.appendChild(document.createTextNode(t[2]));
          tools.appendChild(a);
        });
      scroll.appendChild(tools);
    }

    var seenPart = {};
    PARTS.forEach(function (part) {
      var inPart = list.filter(function (c) { return c.part === part; });
      if (!inPart.length) return;
      seenPart[part] = true;

      var head = el("div", "sb-part");
      head.appendChild(el("span", "", part.replace(/^Part \d+ — /, "")));
      var bar = el("span", "bar");
      var fill = el("i");
      if (window.LF) fill.style.width = window.LF.partMastery(part) + "%";
      bar.appendChild(fill);
      head.appendChild(bar);
      scroll.appendChild(head);

      inPart.forEach(function (c) {
        var a = el("a", "sb-link" + (c.id === currentId ? " active" : ""));
        a.href = href(c);
        a.appendChild(el("span", "num", c.n));
        a.appendChild(document.createTextNode(c.title));
        var mk = el("span", "mark");
        mk.setAttribute("data-ch", c.id);       // learn.js writes the status glyph
        a.appendChild(mk);
        scroll.appendChild(a);
      });
    });

    if (window.LF) window.LF.emit("nav", null);
  }

  /* ================================================================== toc */

  function buildToc() {
    var host = document.getElementById("toc");
    if (!host) return;
    var hs = document.querySelectorAll(".main h2[id]");
    if (hs.length < 3) { host.remove(); return; }

    host.innerHTML = "";
    host.appendChild(el("b", "", "On this page"));
    var ol = el("ol");
    hs.forEach(function (h) {
      var li = el("li");
      var a = el("a", "", h.textContent.replace(/\s*[¶#]\s*$/, ""));
      a.href = "#" + h.id;
      li.appendChild(a);
      ol.appendChild(li);
    });
    host.appendChild(ol);
  }

  /* ================================================================ pager */

  function buildPager() {
    var host = document.getElementById("pager");
    if (!host || !currentId) return;
    var i = CH.findIndex(function (c) { return c.id === currentId; });
    if (i < 0) return;
    host.innerHTML = "";
    var prev = CH[i - 1], next = CH[i + 1];

    if (prev) {
      var a = el("a", "prev");
      a.href = href(prev);
      a.appendChild(el("span", "", "← " + (prev.n ? prev.n + " · Previous" : "Previous")));
      a.appendChild(document.createTextNode(prev.title));
      host.appendChild(a);
    }
    if (next) {
      var b = el("a", "next");
      b.href = href(next);
      b.appendChild(el("span", "", (next.n ? next.n + " · Next" : "Next") + " →"));
      b.appendChild(document.createTextNode(next.title));
      host.appendChild(b);
    }
  }

  /* ========================================================= copy buttons */

  function buildCopy() {
    document.querySelectorAll("pre").forEach(function (pre) {
      if (pre.querySelector(".copy-btn")) return;
      var b = el("button", "copy-btn", "Copy");
      b.type = "button";
      b.onclick = function () {
        var code = pre.querySelector("code") || pre;
        var text = code.innerText;
        var done = function () {
          b.textContent = "Copied";
          b.classList.add("done");
          setTimeout(function () { b.textContent = "Copy"; b.classList.remove("done"); }, 1400);
        };
        if (navigator.clipboard && location.protocol !== "file:") {
          navigator.clipboard.writeText(text).then(done, fallback);
        } else fallback();

        function fallback() {
          /* file:// has no clipboard API in most browsers, and this site is
             meant to be openable from a USB stick. execCommand still works. */
          var ta = document.createElement("textarea");
          ta.value = text;
          ta.style.position = "fixed";
          ta.style.opacity = "0";
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand("copy"); done(); } catch (e) { b.textContent = "Ctrl+C"; }
          ta.remove();
        }
      };
      pre.appendChild(b);
    });
  }

  /* ============================================================== keyboard */

  var chord = null, chordTimer = null;

  function keyboard(e) {
    var t = e.target;
    var typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT");

    if (e.key === "/" && !typing) {
      var q = document.getElementById("sb-q");
      if (q) { e.preventDefault(); document.body.classList.add("nav-open"); q.focus(); q.select(); }
      return;
    }
    if (e.key === "Escape") {
      document.body.classList.remove("nav-open");
      return;
    }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

    if (chord === "g") {
      var map = {
        d: "dashboard.html", r: "review.html", v: "viva.html", e: "exam.html",
        s: "simulate.html", i: "italiano.html", c: "cv.html", n: "notes.html",
        l: "glossary.html", h: "index.html", p: "playground.html", a: "account.html",
      };
      chord = null;
      clearTimeout(chordTimer);
      if (map[e.key]) { e.preventDefault(); location.href = ROOT + map[e.key]; }
      return;
    }
    if (e.key === "g") {
      chord = "g";
      clearTimeout(chordTimer);
      chordTimer = setTimeout(function () { chord = null; }, 1200);
      return;
    }

    if (!currentId) return;
    var i = CH.findIndex(function (c) { return c.id === currentId; });
    if (i < 0) return;
    if (e.key === "ArrowLeft" && CH[i - 1]) { e.preventDefault(); location.href = href(CH[i - 1]); }
    if (e.key === "ArrowRight" && CH[i + 1]) { e.preventDefault(); location.href = href(CH[i + 1]); }
  }

  /* ================================================================== boot */

  function boot() {
    buildTopbar();
    buildSidebar();
    buildToc();
    buildPager();
    buildCopy();
    document.addEventListener("keydown", keyboard);

    /* Close the mobile drawer when a link inside it is followed. */
    document.addEventListener("click", function (e) {
      var a = e.target.closest ? e.target.closest(".sidebar a") : null;
      if (a) document.body.classList.remove("nav-open");
      else if (document.body.classList.contains("nav-open") && !e.target.closest(".sidebar") && !e.target.closest(".menu-btn")) {
        document.body.classList.remove("nav-open");
      }
    });

    if (window.LF) window.LF.on("change", function () { renderNav(document.getElementById("sb-q") ? document.getElementById("sb-q").value : ""); });
  }

  window.LFSite = { ROOT: ROOT, href: href, renderNav: renderNav, el: el, currentId: currentId, page: page };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  /* Service workers only run over http(s). Checking the protocol keeps the
     console clean when the site is opened straight off the disk. */
  if ("serviceWorker" in navigator && (location.protocol === "http:" || location.protocol === "https:")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register(ROOT + "sw.js").catch(function () {});
    });
  }
})();
