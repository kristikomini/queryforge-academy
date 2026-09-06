/* ===========================================================================
   notes.js — select a sentence, press "📌 Note this", write in your own words.

   Two decisions worth keeping:

   1. Notes are positioned against the DOCUMENT, not the viewport. x is stored
      as a fraction of the column width and y as an absolute document offset,
      so a note pinned beside a paragraph is still beside that paragraph
      tomorrow, at a different window size, on a different machine.

   2. A note carries the QUOTE and the learner's OWN WORDS. The paraphrase is
      what does the work; the quote is only there so the paraphrase has
      something to be a paraphrase of.

   Below 980px the drag layer is hidden entirely (see learn.css) and notes
   become a plain list in notes.html. Dragging paper around a phone screen is
   not a feature.
   =========================================================================== */

(function () {
  "use strict";
  if (!window.LF) return;

  var LF = window.LF;
  var chId = document.body.getAttribute("data-chapter") || "";
  if (!chId) return;

  var main = document.querySelector(".main");
  if (!main) return;

  var chTitle = (document.querySelector(".main h1") || {}).textContent || chId;
  var COLORS = ["yellow", "blue", "green", "pink"];

  function el(t, c, x) {
    var e = document.createElement(t);
    if (c) e.className = c;
    if (x != null) e.textContent = x;
    return e;
  }

  /* The layer is a child of .main so document coordinates are column-relative. */
  var layer = el("div", "note-layer");
  main.style.position = main.style.position || "relative";
  main.appendChild(layer);

  /* ---------------------------------------------------- selection popup --- */

  var pop = null;
  function hidePop() { if (pop) { pop.remove(); pop = null; } }

  document.addEventListener("mouseup", function (e) {
    if (e.target.closest && (e.target.closest(".note") || e.target.closest(".note-pop"))) return;
    setTimeout(function () {
      var sel = window.getSelection();
      var text = sel ? String(sel).trim() : "";
      hidePop();
      if (!text || text.length < 4) return;
      if (!main.contains(sel.anchorNode)) return;

      var r = sel.getRangeAt(0).getBoundingClientRect();
      var mr = main.getBoundingClientRect();

      pop = el("button", "note-pop", "📌 Note this");
      pop.style.left = (r.left + r.width / 2 - mr.left) + "px";
      pop.style.top = (r.top - mr.top - 8) + "px";
      pop.onclick = function () {
        var y = Math.max(0, r.top - mr.top + window.scrollY - (main.offsetTop || 0));
        create(text, y);
        hidePop();
        if (sel.removeAllRanges) sel.removeAllRanges();
      };
      layer.appendChild(pop);
    }, 10);
  });

  document.addEventListener("scroll", hidePop, { passive: true });

  /* ------------------------------------------------------------- create --- */

  function create(quote, y) {
    var n = LF.addNote({
      ch: chId, chTitle: chTitle, quote: quote.slice(0, 280),
      text: "", color: COLORS[LF.notesFor(chId).length % COLORS.length],
      x: 0.62, y: Math.round(y),
    });
    var node = draw(n);
    var tx = node.querySelector(".tx");
    if (tx) tx.focus();
  }

  /* --------------------------------------------------------------- draw --- */

  function draw(n) {
    var node = el("div", "note");
    node.setAttribute("data-color", n.color);
    node.setAttribute("data-id", n.id);
    place(node, n);

    var hd = el("div", "hd");
    var grip = el("div", "grip");
    hd.appendChild(grip);

    var col = el("button", "", "🎨");
    col.title = "Colour";
    col.onclick = function () {
      var next = COLORS[(COLORS.indexOf(n.color) + 1) % COLORS.length];
      n.color = next;
      node.setAttribute("data-color", next);
      LF.updateNote(n.id, { color: next });
    };
    hd.appendChild(col);

    var del = el("button", "", "✕");
    del.title = "Delete";
    del.onclick = function () {
      if (n.text && !confirm("Delete this note?")) return;
      LF.removeNote(n.id);
      node.remove();
    };
    hd.appendChild(del);
    node.appendChild(hd);

    if (n.quote) node.appendChild(el("div", "quote", "“" + n.quote + "”"));

    var tx = el("div", "tx");
    tx.contentEditable = "true";
    tx.spellcheck = false;
    tx.textContent = n.text || "";
    tx.setAttribute("data-ph", "In your own words…");
    tx.addEventListener("input", function () { LF.updateNote(n.id, { text: tx.textContent }); });
    tx.addEventListener("blur", function () { LF.updateNote(n.id, { text: tx.textContent }); });
    node.appendChild(tx);

    dragify(node, hd, n);
    layer.appendChild(node);
    return node;
  }

  function place(node, n) {
    var w = main.clientWidth || 800;
    node.style.left = Math.round(Math.min(Math.max(n.x, 0), 0.92) * w) + "px";
    node.style.top = n.y + "px";
  }

  /* --------------------------------------------------------------- drag --- */

  function dragify(node, handle, n) {
    var sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;

    function down(e) {
      if (e.target.tagName === "BUTTON") return;
      dragging = true;
      node.classList.add("dragging");
      var p = point(e);
      sx = p.x; sy = p.y;
      ox = parseFloat(node.style.left) || 0;
      oy = parseFloat(node.style.top) || 0;
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
      document.addEventListener("touchmove", move, { passive: false });
      document.addEventListener("touchend", up);
      e.preventDefault();
    }
    function move(e) {
      if (!dragging) return;
      var p = point(e);
      node.style.left = Math.max(0, ox + p.x - sx) + "px";
      node.style.top = Math.max(0, oy + p.y - sy) + "px";
      e.preventDefault();
    }
    function up() {
      if (!dragging) return;
      dragging = false;
      node.classList.remove("dragging");
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      document.removeEventListener("touchmove", move);
      document.removeEventListener("touchend", up);
      var w = main.clientWidth || 800;
      LF.updateNote(n.id, {
        x: (parseFloat(node.style.left) || 0) / w,     // fraction: survives a resize
        y: Math.round(parseFloat(node.style.top) || 0), // absolute: stays beside its paragraph
      });
    }
    function point(e) {
      var t = e.touches && e.touches[0];
      return { x: t ? t.clientX : e.clientX, y: t ? t.clientY : e.clientY };
    }
    handle.addEventListener("mousedown", down);
    handle.addEventListener("touchstart", down, { passive: false });
  }

  /* --------------------------------------------------------------- boot --- */

  function boot() {
    LF.notesFor(chId).forEach(draw);
    window.addEventListener("resize", function () {
      layer.querySelectorAll(".note").forEach(function (node) {
        var n = LF.notesFor(chId).filter(function (x) { return x.id === node.getAttribute("data-id"); })[0];
        if (n) place(node, n);
      });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
