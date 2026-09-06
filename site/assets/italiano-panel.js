/* ===========================================================================
   italiano-panel.js — renders the per-chapter language panel.

   It appears ONLY where italiano.js has an entry for the chapter. Coverage is
   deliberately partial: a half-written translation teaches a sentence you would
   not want to say in a room, which is worse than teaching nothing. So the panel
   is absent rather than thin, and that absence is a decision, not a gap.

   The whole phrasebook is rendered by italiano.html, which reuses render() from
   here via window.LFItaliano.
   =========================================================================== */

(function () {
  "use strict";

  function el(t, c, x) {
    var e = document.createElement(t);
    if (c) e.className = c;
    if (x != null) e.textContent = x;
    return e;
  }

  function sayBlock(line) {
    var d = el("div", "it-say");
    d.appendChild(document.createTextNode("“" + line.it + "”"));
    d.appendChild(el("span", "en", line.en));
    if (line.note) {
      var n = el("span", "en");
      n.style.marginTop = "3px";
      n.style.fontStyle = "italic";
      n.textContent = line.note;
      d.appendChild(n);
    }
    return d;
  }

  function keepsBlock(keeps) {
    var wrap = el("div");
    wrap.appendChild(el("p", "small muted", "These stay in English, even in Italian:"));
    var row = el("div", "keeps");
    keeps.forEach(function (k) { row.appendChild(el("span", "keep", k)); });
    wrap.appendChild(row);
    return wrap;
  }

  /* --------------------------------------------------- the chapter panel -- */

  function mountChapterPanel() {
    var chId = document.body.getAttribute("data-chapter");
    if (!chId) return;
    var entry = (window.IT_CHAPTERS || {})[chId];
    if (!entry) return;                       // ← the deliberate absence

    var main = document.querySelector(".main");
    if (!main) return;

    var panel = el("div", "it-panel");
    var title = el("div", "box-title", "🇮🇹 Dirlo in italiano");
    panel.appendChild(title);

    (entry.say || []).forEach(function (line) { panel.appendChild(sayBlock(line)); });
    if (entry.keep && entry.keep.length) panel.appendChild(keepsBlock(entry.keep));

    var more = el("p", "small");
    more.style.margin = "10px 0 0";
    more.innerHTML = 'The whole phrasebook: <a href="' + (window.LF_ROOT || "") + 'italiano.html">italiano</a>' +
      ' · vocabulary: <a href="' + (window.LF_ROOT || "") + 'glossary.html">glossary</a>';
    panel.appendChild(more);

    /* Insert before the chapter test if there is one, otherwise before the
       pager, otherwise at the end. Any page may leave either out. */
    var anchor = document.getElementById("chapter-quiz") || document.getElementById("pager");
    if (anchor) main.insertBefore(panel, anchor);
    else main.appendChild(panel);
  }

  /* ------------------------------------------------- the whole phrasebook -- */

  function renderPhrasebook(host) {
    var PH = window.PHRASES || [];
    host.innerHTML = "";
    PH.forEach(function (g) {
      var h = el("h2", "", g.group);
      host.appendChild(h);
      var panel = el("div", "panel");
      g.lines.forEach(function (line, i) {
        if (i) {
          var hr = el("div");
          hr.style.borderTop = "1px solid var(--line-soft)";
          hr.style.margin = "12px 0";
          panel.appendChild(hr);
        }
        panel.appendChild(sayBlock(line));
      });
      host.appendChild(panel);
    });
  }

  function renderChapterIndex(host) {
    var CH = window.CHAPTERS || [], IT = window.IT_CHAPTERS || {};
    var covered = CH.filter(function (c) { return IT[c.id]; });
    host.innerHTML = "";

    var note = el("p", "small muted");
    note.textContent = covered.length + " of " + CH.length + " chapters have a language panel. "
      + "That is deliberate: there is an entry where there is something genuinely useful to say, "
      + "and no entry — rather than a thin one — everywhere else.";
    host.appendChild(note);

    covered.forEach(function (c) {
      var panel = el("div", "panel");
      panel.style.marginBottom = "14px";
      var h = el("h3");
      h.style.marginTop = "0";
      var a = el("a", "", c.n + " · " + c.title);
      a.href = "chapters/" + c.id + ".html";
      h.appendChild(a);
      panel.appendChild(h);
      (IT[c.id].say || []).forEach(function (line) { panel.appendChild(sayBlock(line)); });
      if (IT[c.id].keep) panel.appendChild(keepsBlock(IT[c.id].keep));
      host.appendChild(panel);
    });
  }

  window.LFItaliano = { renderPhrasebook: renderPhrasebook, renderChapterIndex: renderChapterIndex };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountChapterPanel);
  else mountChapterPanel();
})();
