#!/usr/bin/env node
/* ===========================================================================
   doctor.mjs — THE INTEGRITY GATE.

   Almost everything valuable in this repository is a CROSS-REFERENCE, and a
   cross-reference is the one kind of content that rots without a symptom.
   A broken build shouts. A link to a chapter renamed six weeks ago says nothing
   at all, to anybody, ever — and the reader who follows it concludes the
   repository is sloppy rather than that one line is.

   Eleven checks. Deliberately zero dependencies and deliberately outside the
   product's own build, so it runs on a machine with no database and no npm
   install.

       node tools/doctor.mjs            # report
       node tools/doctor.mjs --fix-lock # accept new quiz ids into the lockfile

   ERROR sets the exit code. WARNING does not — a gate people learn to ignore is
   worse than no gate at all.
   =========================================================================== */

import { readFile, writeFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname, resolve, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const FIX_LOCK = process.argv.includes("--fix-lock");

/* --------------------------------------------------------------- report --- */

const findings = [];
const err = (check, msg) => findings.push({ level: "ERROR", check, msg });
const warn = (check, msg) => findings.push({ level: "WARN", check, msg });
const checksRun = [];

/* ---------------------------------------------------------------- utils --- */

async function walk(dir, filter) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (["node_modules", ".git", "vendor", ".claude"].includes(e.name)) continue;
      out.push(...await walk(p, filter));
    } else if (!filter || filter(p)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const read = (p) => readFile(p, "utf8");

/* Load the manifest by running it with a fake `self`, exactly as sw.js does. */
async function loadManifest() {
  const src = await read(join(SITE, "assets/chapters.js"));
  const scope = {};
  new Function("self", src)(scope);
  return scope;
}

/* Load the three quiz banks the same way the browser does. */
async function loadQuizzes() {
  const scope = { QUIZZES: undefined };
  for (const n of [1, 2, 3]) {
    const src = await read(join(SITE, `assets/quizzes-${n}.js`));
    new Function("window", src)(scope);
  }
  return scope.QUIZZES || {};
}

/* ======================================================= 1 · site/manifest */

async function checkManifest(man) {
  checksRun.push("site/manifest");
  const files = (await readdir(join(SITE, "chapters")))
    .filter((f) => f.endsWith(".html"))
    .map((f) => f.replace(/\.html$/, ""));

  const ids = man.CHAPTERS.map((c) => c.id);

  for (const id of ids)
    if (!files.includes(id))
      err("site/manifest", `manifest lists "${id}" but site/chapters/${id}.html does not exist`);

  for (const f of files)
    if (!ids.includes(f))
      err("site/manifest", `site/chapters/${f}.html exists but is not in the manifest — it is unreachable`);

  const seen = new Set();
  for (const c of man.CHAPTERS) {
    if (seen.has(c.id)) err("site/manifest", `duplicate id "${c.id}"`);
    seen.add(c.id);
    if (!c.req && !c.extra)
      err("site/manifest", `"${c.id}" declares neither req nor extra — every chapter must justify itself`);
    if (!man.PARTS.includes(c.part))
      err("site/manifest", `"${c.id}" has part "${c.part}" which is not in PARTS`);
  }

  /* data-chapter must match the filename, or learn.js records progress against
     a chapter id that does not exist. Silent, and it loses the learner's work. */
  for (const id of ids) {
    const p = join(SITE, "chapters", id + ".html");
    if (!existsSync(p)) continue;
    const html = await read(p);
    const m = html.match(/<body[^>]*data-chapter="([^"]+)"/);
    if (!m) err("site/manifest", `${id}.html has no data-chapter attribute`);
    else if (m[1] !== id)
      err("site/manifest", `${id}.html declares data-chapter="${m[1]}" — must equal the filename`);
    const t = html.match(/<title>([^<]*)<\/title>/);
    const ch = man.CHAPTERS.find((c) => c.id === id);
    if (t && ch && ch.n && !t[1].includes(ch.n))
      warn("site/manifest", `${id}.html <title> does not contain the chapter number ${ch.n}`);
  }
}

/* ========================================================== 2 · site/links */

async function checkSiteLinks() {
  checksRun.push("site/links");
  const pages = await walk(SITE, (p) => p.endsWith(".html"));
  for (const page of pages) {
    const raw = await read(page);
    /* Strip <script> bodies before extracting links. Page scripts build hrefs by
       concatenation — href="chapters/' + id + '.html" — and those are not links,
       they are string fragments. Checking them produced three false errors and
       a false error is how a gate gets ignored. */
    const html = raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>");
    const links = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const href of links) {
      if (/^(https?:|mailto:|data:|#|javascript:)/.test(href)) continue;
      const [path] = href.split("#");
      if (!path) continue;
      const target = resolve(dirname(page), path);
      if (!existsSync(target))
        err("site/links", `${rel(page)} → "${href}" does not resolve`);
    }
    /* Anchors within the same page must exist, or the TOC lies. */
    const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
    for (const href of links) {
      if (!href.startsWith("#") || href === "#") continue;
      if (!ids.has(href.slice(1)))
        warn("site/links", `${rel(page)} → "${href}" has no matching id on the page`);
    }
  }
}

/* ====================================================== 3 · site/quiz-bank */

async function checkQuizBank(man, quizzes) {
  checksRun.push("site/quiz-bank");
  const ids = new Set(man.CHAPTERS.map((c) => c.id));

  for (const id of ids)
    if (!quizzes[id] || !quizzes[id].length)
      err("site/quiz-bank", `chapter "${id}" has no questions`);

  for (const ch of Object.keys(quizzes)) {
    if (!ids.has(ch))
      err("site/quiz-bank", `question bank for "${ch}" but no such chapter`);

    quizzes[ch].forEach((q, i) => {
      const at = `${ch}#${i}`;
      if (!q.q) err("site/quiz-bank", `${at} has no stem`);
      if (!Array.isArray(q.a) || q.a.length < 2 || q.a.length > 5)
        err("site/quiz-bank", `${at} must have 2–5 options, has ${q.a && q.a.length}`);
      const c = Array.isArray(q.c) ? q.c : [q.c];
      for (const k of c)
        if (typeof k !== "number" || k < 0 || !q.a || k >= q.a.length)
          err("site/quiz-bank", `${at} answer index ${k} is outside its own options array`);
      /* `why` is shown on correct answers too, so it is never optional. */
      if (!q.why) err("site/quiz-bank", `${at} has no "why" — feedback is shown on correct answers too`);
      if (q.q && /[<>]/.test(q.q.replace(/<\/?(code|em|strong|b|i)>/g, "")))
        warn("site/quiz-bank", `${at} stem contains a raw < or > — escape it, the stem is rendered as HTML`);
      /* A stem must stand alone two weeks later: each question is also a flashcard. */
      if (q.q && /^which of (these|the following) is (true|correct)/i.test(q.q))
        warn("site/quiz-bank", `${at} stem does not name its subject — it will be useless as a flashcard`);
    });
  }
}

/* ======================================================= 4 · site/quiz-ids */
/*  Question ids are "<chapter>#<index>" and the index IS the array position.
    That id keys a learner's spaced-repetition schedule, so reordering silently
    reassigns somebody's review history to a different question. The lockfile
    turns that into a build failure.                                          */

async function checkQuizIds(quizzes) {
  checksRun.push("site/quiz-ids");
  const lockPath = join(ROOT, "tools/quiz-ids.lock");

  /* Hash the STEM so that a reworded question is caught but a corrected typo in
     an explanation is not. The stem is what the learner is being asked. */
  const current = {};
  for (const ch of Object.keys(quizzes).sort())
    quizzes[ch].forEach((q, i) => {
      current[`${ch}#${i}`] = createHash("sha256").update(q.q || "").digest("hex").slice(0, 12);
    });

  if (!existsSync(lockPath) || FIX_LOCK) {
    await writeFile(lockPath,
      "# Generated by tools/doctor.mjs --fix-lock\n" +
      "# One line per question: <chapter-id>#<index> <sha256(stem) first 12>\n" +
      "# Append only. A removed or reordered id is a build failure, because that\n" +
      "# id is the key a learner's spaced-repetition schedule is stored under.\n" +
      Object.entries(current).map(([k, v]) => `${k} ${v}`).join("\n") + "\n", "utf8");
    console.log(existsSync(lockPath) && !FIX_LOCK
      ? "  created tools/quiz-ids.lock"
      : `  wrote tools/quiz-ids.lock (${Object.keys(current).length} questions)`);
    return;
  }

  const locked = {};
  for (const line of (await read(lockPath)).split("\n")) {
    if (!line.trim() || line.startsWith("#")) continue;
    const [id, hash] = line.trim().split(/\s+/);
    locked[id] = hash;
  }

  for (const id of Object.keys(locked))
    if (!(id in current))
      err("site/quiz-ids", `question ${id} has been DELETED. The bank is append-only: somebody's review schedule is keyed on that id`);

  for (const [id, hash] of Object.entries(current)) {
    if (!(id in locked)) continue;   // new question appended — fine
    if (locked[id] !== hash)
      err("site/quiz-ids", `question ${id} has a different stem than the lockfile. If it was REWORDED, run --fix-lock. If it was REORDERED, undo it — it has silently taken over another question's review history`);
  }

  const added = Object.keys(current).filter((k) => !(k in locked)).length;
  if (added) warn("site/quiz-ids", `${added} new question(s) appended; run --fix-lock to record them`);
}

/* =========================================================== 5 · viva/deck */

async function checkVivaDeck() {
  checksRun.push("viva/deck");
  const rulesPath = join(SITE, "assets/rules.js");
  const goldenPath = join(ROOT, "course/GOLDEN-RULES.md");
  if (!existsSync(rulesPath) || !existsSync(goldenPath)) {
    warn("viva/deck", "rules.js or course/GOLDEN-RULES.md not present yet");
    return;
  }
  const src = await read(rulesPath);
  const stamped = src.match(/GENERATED[\s\S]{0,400}?source sha256:\s*([0-9a-f]+)/);
  const actual = createHash("sha256").update(await read(goldenPath)).digest("hex").slice(0, 16);
  if (!stamped)
    err("viva/deck", "site/assets/rules.js has no generator stamp — it must be produced by tools/viva-deck.mjs, never hand-edited");
  else if (stamped[1] !== actual)
    err("viva/deck", `site/assets/rules.js is out of date with course/GOLDEN-RULES.md. Run: node tools/viva-deck.mjs`);
}

/* =================================================== 6 · course/golden-rules */
/*  Each module ends with its own golden-rules card. GOLDEN-RULES.md collects
    them. If a card is edited in one place and not the other, the viva teaches
    the old wording — silently.                                              */

async function checkGoldenRules() {
  checksRun.push("course/golden-rules");
  const goldenPath = join(ROOT, "course/GOLDEN-RULES.md");
  if (!existsSync(goldenPath)) { warn("course/golden-rules", "course/GOLDEN-RULES.md not present yet"); return; }
  const collected = await read(goldenPath);

  /* Only MODULES carry a card. course/README.md is an index. */
  const modules = (await walk(join(ROOT, "course"), (p) => p.endsWith("README.md")))
    .filter((p) => /modules[\\/]/.test(p));

  for (const m of modules) {
    const text = await read(m);
    /* The heading may be numbered — "## 4 · Golden rules" — so match on the
       words, not on an exact heading string. */
    const card = text.split(/^##\s+.*Golden rules\s*$/mi)[1];
    if (!card) { err("course/golden-rules", `${rel(m)} has no "Golden rules" section — every module must end with its card`); continue; }
    const claims = card.split(/^##\s/m)[0]
      .split("\n")
      .filter((l) => /^\s*[-*\d]/.test(l))
      .map((l) => l.replace(/^\s*(?:[-*]|\d+\.)\s*/, "").trim())
      .filter(Boolean);
    for (const claim of claims) {
      const needle = claim.replace(/\s+/g, " ").slice(0, 60);
      if (needle.length > 20 && !collected.replace(/\s+/g, " ").includes(needle))
        err("course/golden-rules", `${rel(m)}: card claim not found in GOLDEN-RULES.md — "${needle}…"`);
    }
  }
}

/* ========================================================== 7 · docs/links */

async function checkDocLinks() {
  checksRun.push("docs/links");
  const docs = await walk(ROOT, (p) => p.endsWith(".md"));
  for (const doc of docs) {
    const text = await read(doc);
    for (const m of text.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
      const href = m[1];
      if (/^(https?:|mailto:|#)/.test(href)) continue;
      const [path] = href.split("#");
      if (!path) continue;
      const target = resolve(dirname(doc), path);
      if (!existsSync(target))
        err("docs/links", `${rel(doc)} → "${href}" does not resolve`);
    }
  }
}

/* ================================================== 8 · site/playground-db */
/*  site/assets/forge-db.js is GENERATED from reference/schema/*.sql. It is the
    one place this repository knowingly keeps a second copy of something, so it
    gets a check rather than a comment.                                       */

async function checkGenerated() {
  checksRun.push("site/generated");
  const CHECK = "site/generated";

  /* (a) forge-db.js is generated from reference/schema/*.sql */
  const out = join(SITE, "assets/forge-db.js");
  if (!existsSync(out)) {
    err(CHECK, "site/assets/forge-db.js is missing. Run: node tools/build-playground-db.mjs");
  } else {
    const sources = ["reference/schema/01-schema.sql", "reference/schema/02-seed.sql"];
    const sql = (await Promise.all(sources.map((s) => read(join(ROOT, s))))).join("\n");
    const expected = createHash("sha256").update(sql).digest("hex").slice(0, 16);
    const found = (await read(out)).match(/sha256:\s*([0-9a-f]+)/);
    if (!found || found[1] !== expected)
      err(CHECK, "site/assets/forge-db.js is stale. Run: node tools/build-playground-db.mjs");
  }

  /*  (b) THE SERVICE-WORKER CACHE NAME.
      The cache name is the version, and in the platform this was modelled on it
      was bumped by hand with nothing enforcing it — so a content change could
      ship while returning visitors kept the old chapters, silently. Here it is
      derived from a hash of every precached file, and checked. */
  const stamp = await import("node:child_process");
  await new Promise((resolve) => {
    stamp.execFile(process.execPath, [join(ROOT, "tools/stamp-sw.mjs"), "--check"],
      { cwd: ROOT }, (e, stdout, stderr) => {
        if (e) err(CHECK, (stderr || stdout || "").trim().split("\n")[0]
          || "site/sw.js cache name is stale. Run: node tools/stamp-sw.mjs");
        resolve();
      });
  });
}

/* ======================================================= 9 · code/covered-in */
/*  Source files carry `Covered in: <path>` comments pointing at the chapter or
    module that explains them, so reading the code and reading its explanation
    is one gesture. A stale pointer is worse than none.                       */

/* Files that are GENERATED from another file are skipped: their contents are a
   copy, so any pointer inside them is already checked at the source, and a
   generated file that embeds SQL as a JSON string will match almost any regex
   you point at it. */
const GENERATED = [/site[\\/]assets[\\/]forge-db\.js$/, /site[\\/]assets[\\/]rules\.js$/];

async function checkCoveredIn() {
  checksRun.push("code/covered-in");
  const files = await walk(ROOT, (p) =>
    /\.(sql|mjs|js|md)$/.test(p) && !p.includes("node_modules") && !GENERATED.some((g) => g.test(p)));
  for (const f of files) {
    const text = await read(f);
    for (const m of text.matchAll(/Covered in:\s*([^\n*]+)/g)) {
      for (const raw of m[1].split(/[,\s]+/)) {
        const p = raw.trim().replace(/[.,)]+$/, "");
        /* Only treat a token as a path if it actually looks like one: a slash
           AND a known extension. Prose after "Covered in:" is common and must
           not be mistaken for a filename. */
        if (!/\//.test(p) || !/\.(html|md|sql|mjs|js)$/.test(p)) continue;
        if (!existsSync(join(ROOT, p)))
          err("code/covered-in", `${rel(f)} says "Covered in: ${p}" but that file does not exist`);
      }
    }
  }
}

/* ======================================================== 10 · reference/labs */
/*  Every lab or demo named in the course must exist and be listed in the
    reference README, or the exercise is a dead end for the reader.           */

async function checkLabs() {
  checksRun.push("reference/labs");
  const labsDir = join(ROOT, "reference/labs");
  if (!existsSync(labsDir)) { warn("reference/labs", "reference/labs is not present yet"); return; }
  const labs = (await readdir(labsDir)).filter((f) => f.endsWith(".sql"));
  const readmePath = join(ROOT, "reference/README.md");
  if (!existsSync(readmePath)) { warn("reference/labs", "reference/README.md is missing"); return; }
  const readme = await read(readmePath);
  for (const lab of labs)
    if (!readme.includes(lab))
      warn("reference/labs", `reference/labs/${lab} exists but is not listed in reference/README.md`);
}

/* ========================================================= 11 · docs/counts */
/*  INVERTED, deliberately.
    The original of this gate matched a fixed list of sentence patterns, so any
    prose stating a count in wording nobody had registered was simply not
    checked — and three such sentences had drifted. This version finds EVERY
    number adjacent to a counted noun and requires it to match, with an explicit
    allowlist for the ones that legitimately differ. A check that only sees the
    sentences you remembered to register gets weaker every time somebody writes
    a new one.                                                                */

/*  Each entry must be a sentence about WHY that number legitimately differs, not
    just a pattern that silences an error. Anything added here without a reason
    is how an inverted check turns back into the fixed-list one it replaced.

    An exemption applies to the numbers INSIDE ITS OWN MATCH, not to a window.
    Testing these against a window let "10–12 per chapter" silence a wrong count
    two table cells away — an exemption has to be about the number it exempts, or
    it is just a way of turning the check off near certain words.            */
const COUNT_ALLOW = [
  // Exam presets: a *selection* of n questions from the bank, not a bank size.
  /\bn:\s*\d+,\s*min:/,
  /label:\s*"\d+ questions/,
  /\bexam[^.]{0,60}\d+ questions/i,
  /\d+ questions? (?:·|\/|in) \d+ ?min/i,
  // Per-chapter volume, and option counts, which are ranges by design.
  /\d+[–-]\d+ per chapter/, /2[–-]5 options/,
  //  Cross-references to chapters BY NUMBER, not a count of them. The list form
  //  matters: "Chapters 22 and 23" must exempt both numbers, not only the first,
  //  and "Site chapters: [25] · [26] · [27]" must exempt all of them.
  /chapters?\s*[:·]?\s*\[?\d+\]?(?:\s*(?:,|and|–|-|to|&|·|\|)\s*\[?\d+\]?)*/i,
  /\bpart \d/i,
  // Sizes, durations, and counts of rows or columns inside a worked example.
  /\d+ (?:KB|MB|GB|TB|ms|s|µs|ns)\b/,
  /\d+ rows?/i, /\d+ columns?/i,
  //  "40 of 52": the number after "of" is a DENOMINATOR — how many chapters
  //  exist — not a count of the noun. This exempts the "of 52" half only, so
  //  the 40 is still checked. Exempting the whole phrase would let both drift.
  /\bof \d+\b/,
];

async function checkCounts(man, quizzes) {
  checksRun.push("docs/counts");
  const truth = {
    chapters: man.CHAPTERS.length,
    questions: Object.values(quizzes).reduce((n, l) => n + l.length, 0),
    rules: await countRules(),
    "glossary terms": await countArray("assets/glossary.js", "GLOSSARY"),
    panels: await countObject("assets/italiano.js", "IT_CHAPTERS"),
  };

  /*  BIDIRECTIONAL, and that is the whole point.
      The first version of this check matched only "N chapters", so
      "| Chapters | **52** |" in a table — the phrasing the README actually
      uses — went unchecked. Deliberately corrupting the README proved the
      check was vacuous for it. That is precisely the failure mode this check
      exists to prevent, reproduced by the check itself.
      Now: find every occurrence of the counted NOUN and inspect the numbers on
      BOTH sides of it within a short window.                                */
  /*  ORDER MATTERS. Nouns are matched in this order, so the more specific
      phrase must come first — otherwise "golden rules" is claimed by "rules"
      and "glossary terms" is never seen at all. */
  const NOUNS = [
    ["glossary terms", /\bglossary terms\b/gi],
    ["panels", /\b(?:language |italian chapter |chapter )?panels\b/gi],
    ["rules", /\bgolden rules\b|\brules\b/gi],
    ["chapters", /\bchapters\b/gi],
    ["questions", /\bquestions\b/gi],
  ];
  const WINDOW = 34;   // how far a number may sit from the noun it counts

  const files = [
    ...await walk(SITE, (p) => p.endsWith(".html")),
    ...await walk(ROOT, (p) => p.endsWith(".md")),
  ];

  for (const f of files) {
    /*  PROSE ONLY. Code says "LIMIT 20" and ".slice(0, 40)" near the word
        "rules" all the time, and none of it is a claim about how many there
        are. Blanking code rather than dropping it keeps every offset intact,
        so error messages still point at the right place. */
    const text = (await read(f))
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (s) => " ".repeat(s.length))
      .replace(/<pre\b[^>]*>[\s\S]*?<\/pre>/gi, (s) => " ".repeat(s.length))
      .replace(/<code\b[^>]*>[\s\S]*?<\/code>/gi, (s) => " ".repeat(s.length))
      .replace(/```[\s\S]*?```/g, (s) => " ".repeat(s.length))
      .replace(/`[^`\n]*`/g, (s) => " ".repeat(s.length))
      /*  And blank LINK TARGETS. "[24](../site/chapters/24-concurrency…)" puts
          the digits 24 within a few characters of the word "chapters" — in a
          path, not in a sentence. Seven false errors came from this alone, and
          a false error is how a gate gets ignored. */
      .replace(/\]\([^)\s]*\)/g, (s) => " ".repeat(s.length))
      .replace(/(?:href|src)="[^"]*"/gi, (s) => " ".repeat(s.length));

    /*  Exempt RANGES: the character spans covered by an allowlist pattern. A
        number is exempt only when it sits inside one of these, so an exemption
        can never reach past its own phrase. */
    const exempt = [];
    for (const a of COUNT_ALLOW) {
      const g = new RegExp(a.source, a.flags.includes("g") ? a.flags : a.flags + "g");
      for (const m of text.matchAll(g)) exempt.push([m.index, m.index + m[0].length]);
    }
    const isExempt = (s, e) => exempt.some(([a, b]) => s >= a && e <= b);

    /* Every occurrence of a counted noun, with its position. */
    const nouns = [];
    for (const [noun, re] of NOUNS)
      for (const m of text.matchAll(re))
        nouns.push({ noun, at: m.index, len: m[0].length, word: m[0] });
    if (!nouns.length) continue;

    /*  Then iterate over NUMBERS and bind each to its NEAREST noun. That
        ordering is what makes "52 chapters, 529 questions, 456 golden rules"
        work: each number belongs to one noun, not to all three. Binding nouns
        to numbers instead produced nine false errors on that single sentence. */
    for (const nm of text.matchAll(/(?<![\w.\/-])(\d{1,3}(?:[,  ]\d{3})*|\d+)(?![\w.\/%-])/g)) {
      const n = parseInt(nm[1].replace(/[\s,]/g, ""), 10);
      if (!Number.isFinite(n)) continue;

      /* Plausible "how many of these are there" range only. Anything else is a
         version, a duration, a page size — and demanding those match would be
         noise, which is how a gate gets ignored. */
      if (n < 20 || n > 20000) continue;
      if (n >= 1900 && n <= 2100) continue;              // a year, not a count

      const start = nm.index, end = nm.index + nm[1].length;
      let best = null, bestGap = Infinity;
      for (const nd of nouns) {
        const gap = nd.at >= end ? nd.at - end : start - (nd.at + nd.len);
        if (gap < 0 || gap > WINDOW) continue;
        if (gap < bestGap) { bestGap = gap; best = nd; }
      }
      if (!best) continue;

      if (isExempt(start, end)) continue;

      const flat = text.slice(Math.max(0, start - 70), end + 70).replace(/\s+/g, " ").trim();

      if (n !== truth[best.noun])
        err("docs/counts",
          `${rel(f)} has "${n}" beside "${best.word}" but there are ${truth[best.noun]} ${best.noun} — …${flat.slice(0, 130)}…`);
    }
  }

  async function countArray(rel, name) {
    const p = join(SITE, rel);
    if (!existsSync(p)) return 0;
    const scope = {};
    try { new Function("window", await read(p))(scope); } catch { return 0; }
    return (scope[name] || []).length;
  }
  async function countObject(rel, name) {
    const p = join(SITE, rel);
    if (!existsSync(p)) return 0;
    const scope = {};
    try { new Function("window", await read(p))(scope); } catch { return 0; }
    return Object.keys(scope[name] || {}).length;
  }

  async function countRules() {
    const p = join(SITE, "assets/rules.js");
    if (!existsSync(p)) return 0;
    const scope = {};
    try { new Function("window", await read(p))(scope); } catch { return 0; }
    return (scope.RULES || []).length;
  }

  /*  The mastery denominator had TWO sources of truth in the system this was
      ported from, and they drifted: the browser divided by the manifest length
      and the API by a config key, so the leaderboard reported a higher mastery
      than the dashboard. Fixed here by removing the second source — the server
      counts the chapters it serves — and checked here so it stays removed.  */
  const apiFiles = await walk(join(ROOT, "api"), (p) => /\.(mjs|js|sql|json)$/.test(p));
  for (const f of apiFiles) {
    const text = await read(f);
    if (/chapterCount\s*[:=]\s*\d+/.test(text))
      err("docs/counts",
        `${rel(f)} hard-codes a chapter count. The mastery denominator must have ONE source: the server counts the manifest it serves. See BLUEPRINT §11.1`);
  }
}

/* ================================================================== main */

console.log("\n  QueryForge doctor\n  " + "─".repeat(60));

const man = await loadManifest();
const quizzes = await loadQuizzes();

await checkManifest(man);
await checkSiteLinks();
await checkQuizBank(man, quizzes);
await checkQuizIds(quizzes);
await checkVivaDeck();
await checkGoldenRules();
await checkDocLinks();
await checkGenerated();
await checkCoveredIn();
await checkLabs();
await checkCounts(man, quizzes);

const errors = findings.filter((f) => f.level === "ERROR");
const warns = findings.filter((f) => f.level === "WARN");

const byCheck = {};
for (const f of findings) (byCheck[f.check] ||= []).push(f);

for (const check of checksRun) {
  const list = byCheck[check] || [];
  const e = list.filter((f) => f.level === "ERROR").length;
  const w = list.filter((f) => f.level === "WARN").length;
  const mark = e ? "✗" : w ? "!" : "✓";
  console.log(`  ${mark} ${check.padEnd(22)} ${e ? e + " error(s) " : ""}${w ? w + " warning(s)" : e ? "" : "ok"}`);
  for (const f of list.slice(0, 12))
    console.log(`      ${f.level === "ERROR" ? "ERROR" : "warn "}  ${f.msg}`);
  if (list.length > 12) console.log(`      … and ${list.length - 12} more`);
}

console.log("  " + "─".repeat(60));
console.log(`  ${checksRun.length} checks · ${errors.length} error(s) · ${warns.length} warning(s)`);
console.log(`  ${man.CHAPTERS.length} chapters · ${Object.values(quizzes).reduce((n, l) => n + l.length, 0)} questions\n`);

/* Only errors set the exit code. A gate people learn to ignore is worse than
   no gate, so "probably wrong" must not be able to fail a build. */
process.exit(errors.length ? 1 : 0);
