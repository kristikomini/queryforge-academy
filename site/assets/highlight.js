/* ===========================================================================
   highlight.js — SYNTAX COLOUR, AND THE LINE THAT CARRIES THE LESSON.

   Two jobs, and the second is the one that matters.

   1 · COLOUR. Every example in this course carries a comment on EVERY line,
       which is the right decision and has one cost: half the characters on the
       screen are prose, competing with the SQL for attention in exactly the
       same shade of grey. So comments are dimmed and the code is coloured —
       the annotation stays available and stops shouting.

   2 · FOCUS. Most examples exist to make ONE point, and the line that makes it
       is somewhere in the middle with fifteen lines of equally-black text
       around it. A figure may name those lines:

           <figure class="codex" data-lang="sql" data-focus="3,7-9">

       and they get an accent bar, a tint and full-strength ink. One-based, to
       match the way anybody counts lines when reading.

   WHERE THE COLOURS COME FROM
   Not a keyword list of its own — assets/syntax.js, the same dictionary that
   generates the anatomy table under every block and that tools/doctor.mjs
   already forces every token in every example to appear in. So a token that is
   explained is a token that is coloured, and the two can never disagree about
   what a keyword is. Adding a word to the dictionary colours it everywhere.

   WHY THE TEXT IS NEVER TOUCHED
   This file only WRAPS existing characters in <span>s. It never inserts,
   removes or reorders a character, and every line span is display:inline with
   the newline left outside it as its own text node. That is deliberate and
   load-bearing: codex.js reads pre.textContent to build the anatomy table and
   the playground link, and the copy button reads code.innerText. Both must keep
   seeing byte-for-byte what the author wrote. Wrapping in inline spans is
   invisible to both; making the lines display:block, or moving the newline
   inside the span, would silently corrupt the copied SQL.
   =========================================================================== */

(function () {
  "use strict";

  var DICT = self.SYNTAX || {};

  /* The comment marker per language. This mirrors COMMENT_MARK in
     tools/doctor.mjs on purpose: the gate that requires a comment on every line
     and the renderer that dims them must agree about what a comment is. */
  var LINE_COMMENT = {
    sql: "--", tsql: "--", plsql: "--", plpgsql: "--",
    csharp: "//", js: "//", java: "//",
    bash: "#", yaml: "#", ini: "#", python: "#"
  };

  /* Blocks marked as output are a plan, a result set or an error message — data,
     not code. Colouring them would highlight words that are somebody's row
     values. They still get line spans, so they can still carry a focus line. */
  var PROSE = { output: 1, text: 1 };

  /* Dictionary kind -> class. The dictionary's own taxonomy, so a clause reads
     differently from a bare keyword without this file deciding which is which. */
  var KIND_CLASS = {
    clause: "hl-cl", keyword: "hl-kw", function: "hl-fn", type: "hl-ty",
    operator: "hl-op", literal: "hl-li", variable: "hl-va",
    hint: "hl-hi", directive: "hl-di", tool: "hl-to"
  };

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function wrap(cls, text) {
    if (!text) return "";
    return cls ? '<span class="' + cls + '">' + esc(text) + "</span>" : esc(text);
  }

  /*  MULTI-WORD KEYS FIRST, longest first — the same rule codex.js uses when it
      builds the anatomy table, and it is not a nicety. "LEFT" on its own is in
      the dictionary as the string function LEFT(), so a single-word pass paints
      the LEFT of "LEFT JOIN" as a function. Matching "LEFT JOIN" as one key
      gets it right, and does the same for NOT EXISTS, IS NOT NULL, PRIMARY KEY
      and the rest, which read as one idea and should look like one. */
  var PHRASES = null;
  function phrases() {
    if (PHRASES) return PHRASES;
    PHRASES = [];
    for (var k in DICT) {
      if (k.indexOf(" ") < 1) continue;
      PHRASES.push({
        key: k,
        /* One or more spaces between the words, so "GROUP   BY" still matches,
           and not followed by a word character, so "IN" never eats "INTO". */
        re: new RegExp("^" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ +/g, "\\s+") +
                       "(?![A-Za-z_0-9])", "i")
      });
    }
    PHRASES.sort(function (a, b) { return b.key.length - a.key.length; });
    return PHRASES;
  }

  /*  The dictionary calls both "AND" and "=" operators, which is correct and is
      not how they should read. A predicate's LOGIC — AND, OR, NOT, EXISTS, IN,
      IS NULL, LIKE — is what this course spends chapters 07 and 09 on, so it
      gets a colour of its own; the arithmetic and comparison symbols stay quiet
      so they do not speckle every line. */
  function classFor(entry, token) {
    if (!entry) return null;
    if (entry.k === "operator" && /^[A-Za-z]/.test(token)) return "hl-opw";
    return KIND_CLASS[entry.k] || null;
  }

  /* A word is looked up exactly as codex.js looks it up, including the _FN rule:
     a name followed by "(" is a CALL, so date() resolves to the function rather
     than the DATE type. Same rule in both files or the colour and the table
     would disagree about the same word. */
  function wordClass(word, isCall) {
    var up = word.toUpperCase(), e = null;
    if (isCall && DICT[up + "_FN"]) e = DICT[up + "_FN"];
    else if (DICT[up]) e = DICT[up];
    return classFor(e, word);
  }

  /* ------------------------------------------------------------- one line ---
     `state` carries the only thing that survives a line boundary: whether we
     are inside an unterminated /* block comment. */
  function tokenise(line, lang, state) {
    var out = "", i = 0, n = line.length;
    var lc = LINE_COMMENT[lang];
    var sqlish = lang === "sql" || lang === "tsql" || lang === "plsql" || lang === "plpgsql";

    if (state.block) {
      var close = line.indexOf("*/");
      if (close === -1) return wrap("hl-com", line);   /* still open */
      out += wrap("hl-com", line.slice(0, close + 2));
      i = close + 2;
      state.block = false;
    }

    while (i < n) {
      var ch = line.charAt(i);
      var rest = line.slice(i);

      /* line comment — before the operator pass, or "--" reads as two minuses */
      if (lc && rest.lastIndexOf(lc, 0) === 0) { out += wrap("hl-com", rest); break; }

      /* block comment */
      if (rest.lastIndexOf("/*", 0) === 0) {
        var end = rest.indexOf("*/", 2);
        if (end === -1) { out += wrap("hl-com", rest); state.block = true; break; }
        out += wrap("hl-com", rest.slice(0, end + 2));
        i += end + 2; continue;
      }

      /* text literal. '' is an escaped quote inside one, not the end of it. */
      if (ch === "'") {
        var j = i + 1;
        while (j < n) {
          if (line.charAt(j) === "'") {
            if (line.charAt(j + 1) === "'") { j += 2; continue; }
            j++; break;
          }
          j++;
        }
        out += wrap("hl-str", line.slice(i, j)); i = j; continue;
      }

      /* double quotes: a quoted IDENTIFIER in SQL, a string everywhere else.
         Chapter 0D makes exactly this distinction, so the colour should too. */
      if (ch === '"') {
        var k = i + 1;
        while (k < n && line.charAt(k) !== '"') { if (line.charAt(k) === "\\") k++; k++; }
        k = k < n ? k + 1 : n;
        out += wrap(sqlish ? "hl-id" : "hl-str", line.slice(i, k)); i = k; continue;
      }

      /* [bracketed identifier] — T-SQL only, because [ is ordinary punctuation
         in shell and YAML. */
      if (ch === "[" && lang === "tsql") {
        var b = line.indexOf("]", i);
        b = b === -1 ? n : b + 1;
        out += wrap("hl-id", line.slice(i, b)); i = b; continue;
      }

      /* @variable / @@ROWCOUNT */
      if (ch === "@") {
        var mv = rest.match(/^@{1,2}[A-Za-z_0-9]*/);
        out += wrap("hl-va", mv[0]); i += mv[0].length; continue;
      }

      /* number, but not the 1 in "customer1" */
      if (ch >= "0" && ch <= "9" && !/[A-Za-z_0-9]/.test(line.charAt(i - 1) || "")) {
        var mn = rest.match(/^\d+(?:\.\d+)?/);
        out += wrap("hl-num", mn[0]); i += mn[0].length; continue;
      }

      /* word — multi-word key first, then the single word */
      if (/[A-Za-z_]/.test(ch)) {
        var ps = phrases(), hit = null;
        for (var pi = 0; pi < ps.length; pi++) {
          var pm = rest.match(ps[pi].re);
          if (pm) { hit = { text: pm[0], cls: classFor(DICT[ps[pi].key], ps[pi].key) }; break; }
        }
        if (hit) { out += wrap(hit.cls, hit.text); i += hit.text.length; continue; }

        var mw = rest.match(/^[A-Za-z_][A-Za-z_0-9]*/);
        var w = mw[0];
        var isCall = /^\s*\(/.test(line.slice(i + w.length));
        out += wrap(wordClass(w, isCall), w);
        i += w.length; continue;
      }

      /* operators, longest first so ->> is never -> followed by > */
      var mo = rest.match(/^(?:->>|@>|::|\|\||<>|!=|<=|>=|->|[=<>+\-*\/%])/);
      if (mo) { out += wrap("hl-op", mo[0]); i += mo[0].length; continue; }

      out += esc(ch); i++;
    }
    return out;
  }

  /* ----------------------------------------------------------- focus lines ---
     "3", "3,9", "3-5", "1,4-6,11" — one-based and inclusive. A malformed part
     is ignored rather than throwing: a typo in an attribute should cost the
     emphasis, not the whole page's code. */
  function focusSet(spec) {
    if (!spec) return null;
    var set = {}, any = false;
    spec.split(",").forEach(function (part) {
      part = part.trim();
      var m = part.match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (m) {
        for (var i = +m[1]; i <= +m[2]; i++) { set[i] = 1; any = true; }
      } else if (/^\d+$/.test(part)) { set[+part] = 1; any = true; }
    });
    return any ? set : null;
  }

  /* ----------------------------------------------------------------- main ---*/

  function render(root) {
    var figs = (root || document).querySelectorAll("figure.codex");

    Array.prototype.forEach.call(figs, function (fig) {
      if (fig.dataset.hlDone) return;
      fig.dataset.hlDone = "1";

      var code = fig.querySelector("pre > code") || fig.querySelector("pre");
      if (!code) return;

      var lang = (fig.dataset.lang || "sql").toLowerCase();
      var focus = focusSet(fig.getAttribute("data-focus"));
      var prose = !!PROSE[lang];
      var state = { block: false };

      /* Split on \n, wrap each line, then JOIN ON \n again. The newline stays a
         text node between the spans, which is what keeps textContent and
         innerText identical to the source. See the header. */
      var html = code.textContent.split("\n").map(function (line, idx) {
        var body = prose ? esc(line) : tokenise(line, lang, state);
        var cls = focus && focus[idx + 1] ? "hl-ln hl-key" : "hl-ln";
        return '<span class="' + cls + '">' + body + "</span>";
      }).join("\n");

      code.innerHTML = html;
      if (focus) fig.classList.add("hl-has-focus");
    });
  }

  self.QFHighlight = { render: render };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", function () { render(); });
  else render();
})();
