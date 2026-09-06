/* ===========================================================================
   cv.js — an Italian CV and cover letter built from stored fields, then LINTED
   against the rules in chapter 49.

   BE CLEAR ABOUT WHAT THIS IS. It is not an AI that writes your CV. It can only
   tell you when a bullet contains no facts, when the GDPR consent line is
   missing, when a language level is not CEFR, or when the whole thing will not
   fit on one page. Every warning below traces to a specific paragraph of
   site/chapters/49-your-cv.html, and if it cannot cite one it should not exist.

   Covered in: site/chapters/49-your-cv.html
   =========================================================================== */

(function () {
  "use strict";

  var KEY = "queryforge.cv.v1";

  var BLANK = {
    name: "", role: "Database Developer", city: "", email: "", phone: "",
    github: "", linkedin: "",
    profile: "",
    skills: [
      { group: "SQL", items: "" },
      { group: "Motori", items: "" },
      { group: "Modellazione", items: "" },
      { group: "Strumenti", items: "" },
    ],
    projects: [{ title: "", url: "", bullets: ["", "", ""] }],
    experience: [{ title: "", org: "", period: "", bullets: [""] }],
    education: [{ title: "", org: "", period: "" }],
    languages: [{ lang: "Italiano", level: "madrelingua" }, { lang: "Inglese", level: "B2" }],
    driving: true,
    consent: true,
    letter: { company: "", why: "", match: "", close: "" },
  };

  function load() {
    try {
      var s = localStorage.getItem(KEY);
      var doc = s ? JSON.parse(s) : null;
      if (!doc) return JSON.parse(JSON.stringify(BLANK));
      for (var k in BLANK) if (!(k in doc)) doc[k] = BLANK[k];
      return doc;
    } catch (e) { return JSON.parse(JSON.stringify(BLANK)); }
  }
  function save(doc) {
    try { localStorage.setItem(KEY, JSON.stringify(doc)); } catch (e) {}
  }

  /* ==================================================================== LINT */

  var CONSENT = "Autorizzo il trattamento dei miei dati personali ai sensi del Regolamento UE 2016/679 (GDPR) e del D.Lgs. 196/2003 come modificato dal D.Lgs. 101/2018.";

  var CEFR = /^(A1|A2|B1|B2|C1|C2|madrelingua|native)\b/i;

  /* A bullet "contains a fact" if it has a number with a unit or a scale, or a
     before/after comparison. That is a crude test and it is stated as such —
     it cannot judge whether the fact is interesting. */
  function hasNumber(s) {
    return /\d/.test(s) && !/^\s*\d+\s*$/.test(s);
  }
  function looksLikePresence(s) {
    return /^(utilizzo|uso|conoscenza|gestione|supporto|partecipazione|collaborazione)\b/i.test(s.trim());
  }

  function lint(doc) {
    var out = [];
    function err(m, ch) { out.push({ level: "error", msg: m, ref: ch }); }
    function warn(m, ch) { out.push({ level: "warn", msg: m, ref: ch }); }
    function ok(m) { out.push({ level: "ok", msg: m }); }

    /* --- identity ------------------------------------------------------- */
    if (!doc.name.trim()) err("No name. The file should also be named CV_Nome_Cognome.pdf.", "49#italian");
    if (!doc.email.trim()) err("No email address.", "49#italian");
    if (!doc.city.trim()) warn("No city. Recruiters filter on location, hard.", "49#linkedin");

    /* --- the consent line ------------------------------------------------ */
    if (!doc.consent)
      err("The GDPR consent line is missing. Strictly it is not legally required for a CV you sent voluntarily — but its absence is read as unfamiliarity with local convention, and it costs one line.", "49#italian");
    else ok("GDPR consent line present.");

    /* --- profile --------------------------------------------------------- */
    var pw = doc.profile.trim().split(/\s+/).filter(Boolean).length;
    if (!pw) warn("No profile paragraph. Three lines: what you do, one concrete thing you built, what you are looking for.", "49#structure");
    else if (pw > 70) warn("The profile is " + pw + " words. Three lines is about 45. Anything longer is not read.", "49#structure");
    else ok("Profile is " + pw + " words.");

    /* --- bullets: the main check ----------------------------------------- */
    var bullets = [];
    (doc.projects || []).forEach(function (p) { (p.bullets || []).forEach(function (b) { if (b.trim()) bullets.push({ b: b, where: "project " + (p.title || "untitled") }); }); });
    (doc.experience || []).forEach(function (e) { (e.bullets || []).forEach(function (b) { if (b.trim()) bullets.push({ b: b, where: (e.title || "experience") }); }); });

    if (!bullets.length) err("No bullets at all. A CV with no bullets has nothing for the interviewer to ask about.", "49#bullets");

    var withNumbers = 0;
    bullets.forEach(function (x) {
      if (hasNumber(x.b)) withNumbers++;
      else if (looksLikePresence(x.b))
        warn("“" + x.b.slice(0, 60) + "…” (" + x.where + ") describes PRESENCE, not a result. What changed, and by how much?", "49#bullets");
      else
        warn("“" + x.b.slice(0, 60) + "…” (" + x.where + ") contains no number. Row counts, timings before and after, table counts — any quantity beats every adjective.", "49#bullets");
      if (x.b.trim().length > 200)
        warn("A bullet in " + x.where + " is " + x.b.trim().length + " characters. Two lines maximum, or it is a paragraph.", "49#bullets");
    });
    if (bullets.length) {
      if (withNumbers === 0)
        err("Not one bullet contains a number. This is the single most common weakness in a junior CV.", "49#bullets");
      else ok(withNumbers + " of " + bullets.length + " bullets contain a number.");
    }

    /* --- projects -------------------------------------------------------- */
    var realProjects = (doc.projects || []).filter(function (p) { return p.title.trim(); });
    if (!realProjects.length)
      err("No projects. For a junior this section is the answer to “you have no commercial experience” and belongs BEFORE experience.", "49#project");
    realProjects.forEach(function (p) {
      if (!p.url.trim())
        warn("Project “" + p.title + "” has no link. Interviewers do look, and the ones who do are the ones you want.", "49#project");
    });

    /* --- languages ------------------------------------------------------- */
    (doc.languages || []).forEach(function (l) {
      if (!l.level.trim()) return;
      if (!CEFR.test(l.level.trim()))
        err("Language level “" + l.level + "” for " + l.lang + " is not a CEFR level. Use A1–C2 or “madrelingua”; “buono” means nothing to the form on the other side.", "49#italian");
    });
    var hasEnglish = (doc.languages || []).some(function (l) { return /ingl/i.test(l.lang); });
    if (!hasEnglish) warn("English is not listed. Nearly every advert asks for technical English.", "49#italian");

    /* --- skills ---------------------------------------------------------- */
    var skillText = (doc.skills || []).map(function (s) { return s.items; }).join(" ");
    if (!skillText.trim()) warn("No technical skills listed. Group them and put the level next to each.", "49#structure");
    if (/\b(\d{1,3})\s*%/.test(skillText) || /★|⭐/.test(skillText))
      err("A self-rating (percentage or stars) is in the skills. It communicates nothing — eighty per cent of what? — and it invites the interviewer to disprove it.", "49#structure");

    /* --- one page -------------------------------------------------------- */
    var lines = estimateLines(doc);
    if (lines > 52)
      warn("This is roughly " + lines + " lines — likely more than one page. For a junior, one page. Cut the oldest and the least relevant.", "49#italian");
    else ok("Roughly " + lines + " lines: one page.");

    return out;
  }

  function estimateLines(doc) {
    var n = 8;                                   // header + spacing
    n += Math.ceil(doc.profile.length / 95);
    n += (doc.skills || []).filter(function (s) { return s.items.trim(); }).length;
    (doc.projects || []).forEach(function (p) {
      if (!p.title.trim()) return;
      n += 2 + (p.bullets || []).filter(function (b) { return b.trim(); })
        .reduce(function (a, b) { return a + Math.ceil(b.length / 95); }, 0);
    });
    (doc.experience || []).forEach(function (e) {
      if (!e.title.trim()) return;
      n += 2 + (e.bullets || []).filter(function (b) { return b.trim(); })
        .reduce(function (a, b) { return a + Math.ceil(b.length / 95); }, 0);
    });
    n += (doc.education || []).filter(function (e) { return e.title.trim(); }).length * 2;
    n += 3;                                      // languages, driving, consent
    return n;
  }

  /* ================================================================== RENDER */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderCv(doc) {
    var h = [];
    h.push('<div class="cv-doc">');
    h.push('<h1 class="cv-name">' + esc(doc.name || "Nome Cognome") + "</h1>");
    var contact = [doc.role, doc.city, doc.email, doc.phone, doc.github, doc.linkedin]
      .filter(function (x) { return x && x.trim(); }).map(esc).join(" &nbsp;·&nbsp; ");
    h.push('<p class="cv-contact">' + contact + "</p>");

    if (doc.profile.trim()) {
      h.push("<h2>Profilo</h2><p>" + esc(doc.profile) + "</p>");
    }

    var skills = (doc.skills || []).filter(function (s) { return s.items.trim(); });
    if (skills.length) {
      h.push("<h2>Competenze tecniche</h2><table class='cv-skills'>");
      skills.forEach(function (s) {
        h.push("<tr><th>" + esc(s.group) + "</th><td>" + esc(s.items) + "</td></tr>");
      });
      h.push("</table>");
    }

    var projects = (doc.projects || []).filter(function (p) { return p.title.trim(); });
    if (projects.length) {
      h.push("<h2>Progetti</h2>");
      projects.forEach(function (p) {
        h.push("<h3>" + esc(p.title) + (p.url ? ' <span class="cv-url">' + esc(p.url) + "</span>" : "") + "</h3><ul>");
        (p.bullets || []).filter(function (b) { return b.trim(); })
          .forEach(function (b) { h.push("<li>" + esc(b) + "</li>"); });
        h.push("</ul>");
      });
    }

    var exp = (doc.experience || []).filter(function (e) { return e.title.trim(); });
    if (exp.length) {
      h.push("<h2>Esperienza</h2>");
      exp.forEach(function (e) {
        h.push("<h3>" + esc(e.title) + (e.org ? " — " + esc(e.org) : "") +
               (e.period ? ' <span class="cv-url">' + esc(e.period) + "</span>" : "") + "</h3><ul>");
        (e.bullets || []).filter(function (b) { return b.trim(); })
          .forEach(function (b) { h.push("<li>" + esc(b) + "</li>"); });
        h.push("</ul>");
      });
    }

    var edu = (doc.education || []).filter(function (e) { return e.title.trim(); });
    if (edu.length) {
      h.push("<h2>Formazione</h2><ul>");
      edu.forEach(function (e) {
        h.push("<li>" + esc(e.title) + (e.org ? " — " + esc(e.org) : "") +
               (e.period ? " (" + esc(e.period) + ")" : "") + "</li>");
      });
      h.push("</ul>");
    }

    var langs = (doc.languages || []).filter(function (l) { return l.lang.trim(); });
    if (langs.length) {
      h.push("<h2>Lingue</h2><p>" + langs.map(function (l) {
        return esc(l.lang) + ": " + esc(l.level);
      }).join(" &nbsp;·&nbsp; ") + (doc.driving ? " &nbsp;·&nbsp; Patente B" : "") + "</p>");
    }

    if (doc.consent) h.push('<p class="cv-consent">' + esc(CONSENT) + "</p>");
    h.push("</div>");
    return h.join("\n");
  }

  function renderLetter(doc) {
    var l = doc.letter || {};
    var h = [];
    h.push('<div class="cv-doc">');
    h.push("<p>Spett.le " + esc(l.company || "[Azienda]") + ",</p>");
    h.push("<p>" + esc(l.why || "[Why this company — one specific, checkable sentence proving you read something about them.]") + "</p>");
    h.push("<p>" + esc(l.match || "[Why you — the one or two requirements you match best, with the evidence.]") + "</p>");
    h.push("<p>" + esc(l.close || "[Availability and a clear closing line.]") + "</p>");
    h.push("<p>Cordiali saluti,<br>" + esc(doc.name || "Nome Cognome") + "</p>");
    h.push("</div>");
    return h.join("\n");
  }

  function lintLetter(doc) {
    var out = [];
    var l = doc.letter || {};
    var words = [l.why, l.match, l.close].join(" ").trim().split(/\s+/).filter(Boolean).length;
    if (!l.company || !l.company.trim())
      out.push({ level: "error", msg: "No company named. A letter that could be sent to anybody demonstrates the thing it claims to disprove.", ref: "49#letter" });
    if (words > 220)
      out.push({ level: "warn", msg: "The letter is " + words + " words. Under 200 — three short paragraphs.", ref: "49#letter" });
    else if (words > 0)
      out.push({ level: "ok", msg: "The letter is " + words + " words." });
    if (l.why && !/\b(vostr|azienda|prodotto|annuncio|posizione|sito|gestional|settore)/i.test(l.why))
      out.push({ level: "warn", msg: "The first paragraph does not mention anything specific about them. That is the paragraph that decides whether the rest is read.", ref: "49#letter" });
    return out;
  }

  window.LFCv = {
    load: load, save: save, blank: function () { return JSON.parse(JSON.stringify(BLANK)); },
    lint: lint, lintLetter: lintLetter,
    renderCv: renderCv, renderLetter: renderLetter,
    CONSENT: CONSENT, KEY: KEY,
  };
})();
