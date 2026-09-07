/* ===========================================================================
   codex.js — THE SYNTAX ANATOMY RENDERER.

   Every code example in this course is wrapped in

       <figure class="codex" data-lang="sql" data-run>
         <figcaption>…what the example is for…</figcaption>
         <pre><code>… code, with a comment on EVERY line …</code></pre>
         <div class="cx-conv">…optional hand-written conversion notes…</div>
       </figure>

   and this file adds, underneath it:

       · the CLAUSE ORDER — the clauses present in the block, listed in the
         order the engine runs them rather than the order they are written.
         Chapter 06 argues that this single reordering explains most of the
         confusing errors a beginner meets; it is worth repeating under every
         query rather than once in a chapter they may not have read yet.

       · the SYNTAX ANATOMY — one row per keyword, operator, function and type
         that actually appears in the block, with what it does and what it does
         to TYPES, from assets/syntax.js.

       · a RUN button, for blocks marked data-run, which opens the example in
         the playground. Learning SQL without running it is learning to swim
         from a book.

   WHY GENERATED AND NOT WRITTEN
   A hand-written token table under each example would be a second copy of the
   dictionary, and second copies rot: the example gets edited and the table does
   not, so the reader is told something that stopped being true. Deriving the
   table means the explanation of COALESCE is the same sentence in chapter 09
   and chapter 16, and correcting it corrects it everywhere.

   tools/doctor.mjs enforces the other half: a token in any example that is NOT
   in the dictionary fails the build, so "every token is explained" is checked
   rather than claimed.
   =========================================================================== */

(function () {
  "use strict";

  var DICT = self.SYNTAX || {};
  var PREF_KEY = "qf.anatomy";           /* "open" | "closed", per reader */

  /* -------------------------------------------------------------- helpers */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Multi-word keys ("GROUP BY", "IS NOT NULL") must be matched before their
     own first word, or "IS NOT NULL" comes out as three unrelated rows. Built
     once, longest first. */
  function phrases() {
    if (self.SYNTAX_PHRASES) return self.SYNTAX_PHRASES;
    var list = [];
    for (var k in DICT) if (k.indexOf(" ") > 0) list.push(k);
    list.sort(function (a, b) { return b.length - a.length; });
    self.SYNTAX_PHRASES = list;
    return list;
  }

  /* Symbols, longest first, so "->>" is never read as "->" followed by ">". */
  var SYMBOLS = ["->>", "@>", "::", "||", "<>", "!=", "<=", ">=", "->",
                 "=", "<", ">", "+", "*", "/", "%", "@", "?", "$"];

  /* Some tokens mean a different thing on the application side of the
     boundary. .Where() is not the WHERE clause; .Include() is not INCLUDE. */
  var LANG_ALIAS = {
    csharp: { WHERE: "WHERE_LINQ", INCLUDE: "INCLUDE_LINQ" }
  };

  /* -------------------------------------------------------------- stripping
     Comments and string literals are removed BEFORE tokenising, so the word
     "select" inside a comment does not produce a row, and a date inside
     '2026-03-01' does not produce a "-" operator. */

  function stripNoise(code, lang) {
    var out = code;
    if (lang === "csharp" || lang === "js" || lang === "json") {
      out = out.replace(/\/\/[^\n]*/g, " ");
    }
    if (lang === "bash" || lang === "yaml" || lang === "ini") {
      out = out.replace(/#[^\n]*/g, " ");
    }
    out = out.replace(/--[^\n]*/g, " ");            /* SQL line comment      */
    out = out.replace(/\/\*[\s\S]*?\*\//g, " ");    /* block comment         */
    out = out.replace(/'(?:[^'\\\n]|\\.|'')*'/g, " '…' ");  /* text literal  */
    out = out.replace(/"(?:[^"\\\n]|\\.)*"/g, ' "…" ');     /* quoted ident  */
    return out;
  }

  /* -------------------------------------------------------------- tokenise
     Returns the dictionary keys that genuinely appear, in order of first
     appearance. A key appears at most once however often it is written: the
     table explains the token, not each occurrence of it. */

  function tokenise(code, lang) {
    var text = stripNoise(code, lang);
    var upper = text.toUpperCase();
    var found = [];
    var seen = {};
    var claimed = new Array(upper.length);   /* character positions already used */

    function take(key, at, len) {
      for (var i = at; i < at + len; i++) if (claimed[i]) return false;
      for (var j = at; j < at + len; j++) claimed[j] = true;
      if (!seen[key]) { seen[key] = true; found.push({ key: key, at: at }); }
      return true;
    }

    /* 1 · multi-word phrases, longest first */
    phrases().forEach(function (p) {
      var re = new RegExp("(^|[^A-Z0-9_])" + p.replace(/ /g, "\\s+") + "([^A-Z0-9_]|$)", "g");
      var m;
      while ((m = re.exec(upper)) !== null) {
        take(p, m.index + m[1].length, m[0].length - m[1].length - m[2].length);
        re.lastIndex = m.index + m[0].length - m[2].length;
      }
    });

    /* 2 · single words. A word followed by "(" is a CALL, so a function entry
       wins over a keyword of the same name — date() the function, not DATE the
       type. */
    var alias = LANG_ALIAS[lang] || {};
    var wre = /[A-Za-z_][A-Za-z_0-9]*/g, w;
    while ((w = wre.exec(text)) !== null) {
      var word = w[0].toUpperCase();
      var isCall = /^\s*\(/.test(text.slice(w.index + w[0].length));
      var key = null;
      if (alias[word] && DICT[alias[word]]) key = alias[word];
      else if (isCall && DICT[word + "_FN"]) key = word + "_FN";
      else if (DICT[word]) key = word;
      if (key) take(key, w.index, w[0].length);
    }

    /* 3 · symbols */
    for (var s = 0; s < SYMBOLS.length; s++) {
      var sym = SYMBOLS[s], from = 0, at;
      while ((at = text.indexOf(sym, from)) !== -1) {
        take(sym, at, sym.length);
        from = at + sym.length;
      }
    }

    found.sort(function (a, b) { return a.at - b.at; });
    return found.map(function (f) { return f.key; });
  }

  /* ------------------------------------------------------------ clause order
     The engine's order, not the writing order. Only the clauses actually
     present in this block are listed — a list of clauses the reader cannot see
     teaches nothing. */

  var RUN_ORDER = [
    ["FROM", "reads the rows"],
    ["JOIN", "pairs them"],
    ["INNER JOIN", "pairs them"],
    ["LEFT JOIN", "pairs them, keeping unmatched left rows"],
    ["CROSS JOIN", "pairs every row with every row"],
    ["WHERE", "throws rows away"],
    ["GROUP BY", "collapses them into groups"],
    ["HAVING", "throws whole groups away"],
    ["SELECT", "works out the columns"],
    ["DISTINCT", "removes duplicate rows"],
    ["UNION", "stacks the two results"],
    ["UNION ALL", "stacks the two results"],
    ["ORDER BY", "sorts"],
    ["LIMIT", "cuts the list short"],
    ["OFFSET", "skips the first rows"],
    ["TOP", "cuts the list short"]
  ];

  function clauseOrder(keys) {
    var have = {};
    keys.forEach(function (k) { have[k] = true; });
    var steps = [];
    RUN_ORDER.forEach(function (pair) {
      if (!have[pair[0]]) return;
      /* One "pairs them" step is enough however many joins there are. */
      if (steps.length && steps[steps.length - 1].why === pair[1]) return;
      steps.push({ name: pair[0], why: pair[1] });
    });
    return steps.length >= 2 ? steps : null;
  }

  /* ------------------------------------------------------------------ render */

  var KIND_ORDER = { clause: 0, keyword: 1, operator: 2, function: 3, type: 4,
                     literal: 5, variable: 6, hint: 7, directive: 8, tool: 9,
                     comment: 10, punctuation: 11 };

  function buildAnatomy(code, lang) {
    var keys = tokenise(code, lang);
    if (!keys.length) return null;

    var box = el("details", "cx-anatomy");
    var sum = el("summary");
    sum.appendChild(el("span", "cx-sum-t", "Syntax anatomy"));
    sum.appendChild(el("span", "cx-sum-n",
      keys.length + (keys.length === 1 ? " token explained" : " tokens explained")));
    box.appendChild(sum);

    /* the engine's running order, when there is one worth showing */
    var steps = clauseOrder(keys);
    if (steps) {
      var flow = el("div", "cx-flow");
      flow.appendChild(el("b", "", "The engine runs it in this order:"));
      var ol = el("ol");
      steps.forEach(function (s) {
        var li = el("li");
        li.appendChild(el("code", "", s.name));
        li.appendChild(document.createTextNode(" — " + s.why));
        ol.appendChild(li);
      });
      flow.appendChild(ol);
      box.appendChild(flow);
    }

    /* one row per token, grouped by kind but stable within a group */
    var rows = keys.map(function (k, i) { return { key: k, e: DICT[k], i: i }; })
                   .filter(function (r) { return r.e; });
    rows.sort(function (a, b) {
      var ka = KIND_ORDER[a.e.k] == null ? 99 : KIND_ORDER[a.e.k];
      var kb = KIND_ORDER[b.e.k] == null ? 99 : KIND_ORDER[b.e.k];
      return ka - kb || a.i - b.i;
    });

    var wrap = el("div", "table-wrap");
    var t = el("table", "cx-table");
    var thead = el("thead");
    var htr = el("tr");
    ["Token", "What it is", "What it does here", "Types and conversions"]
      .forEach(function (h) { htr.appendChild(el("th", "", h)); });
    thead.appendChild(htr);
    t.appendChild(thead);

    var tb = el("tbody");
    rows.forEach(function (r) {
      var tr = el("tr");
      var c1 = el("td");
      c1.appendChild(el("code", "", displayKey(r.key)));
      tr.appendChild(c1);

      var c2 = el("td");
      c2.appendChild(el("span", "cx-kind cx-k-" + r.e.k, r.e.k));
      if (r.e.d) c2.appendChild(el("span", "cx-dial", r.e.d));
      tr.appendChild(c2);

      tr.appendChild(el("td", "", r.e.w));
      tr.appendChild(el("td", "cx-types", r.e.t || "—"));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    wrap.appendChild(t);
    box.appendChild(wrap);
    return box;
  }

  /* The dictionary uses a few disambiguating keys — DATE_FN for SQLite's
     date(), WHERE_LINQ for LINQ's .Where() — that are not what the reader
     typed. Show what they typed. */
  function displayKey(k) {
    return k.replace(/_FN$/, "()").replace(/_LINQ$/, "()");
  }

  /* ------------------------------------------------------------ run button */

  function runHref(code) {
    /* The playground reads #q= on load. encodeURIComponent keeps newlines and
       quotes intact, and the whole thing stays inside the page — nothing is
       sent anywhere, which is the point of a local engine. */
    var depth = /\/chapters\//.test(location.pathname) ? "../" : "";
    return depth + "playground.html#q=" + encodeURIComponent(code);
  }

  /* --------------------------------------------------------------- prefer */

  function preference() {
    try { return localStorage.getItem(PREF_KEY) || "closed"; } catch (e) { return "closed"; }
  }
  function remember(v) {
    try { localStorage.setItem(PREF_KEY, v); } catch (e) { /* private mode */ }
  }

  /* ----------------------------------------------------------------- main */

  function render(root) {
    var open = preference() === "open";
    var figs = (root || document).querySelectorAll("figure.codex");

    Array.prototype.forEach.call(figs, function (fig) {
      if (fig.dataset.cxDone) return;
      fig.dataset.cxDone = "1";

      var pre = fig.querySelector("pre");
      if (!pre) return;
      var code = (pre.querySelector("code") || pre).textContent;
      var lang = fig.dataset.lang || "sql";

      /* the toolbar: line count, and the run button when the example runs */
      var bar = el("div", "cx-bar");
      var lines = code.replace(/\s+$/, "").split("\n").length;
      bar.appendChild(el("span", "cx-meta", lang.toUpperCase() + " · " + lines +
        (lines === 1 ? " line" : " lines") + ", every one commented"));
      bar.appendChild(el("span", "cx-grow"));

      if ("run" in fig.dataset) {
        var a = el("a", "cx-run", "▶ Run this in the playground");
        a.href = runHref(code);
        bar.appendChild(a);
      }
      fig.appendChild(bar);

      var anat = buildAnatomy(code, lang);
      if (anat) {
        anat.open = open;
        anat.addEventListener("toggle", function () {
          remember(anat.open ? "open" : "closed");
        });
        fig.appendChild(anat);
      }
    });
  }

  self.QFCodex = { render: render };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { render(); });
  else render();
})();
