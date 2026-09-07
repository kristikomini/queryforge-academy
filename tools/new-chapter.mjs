/* ---------------------------------------------------------------------------
   new-chapter.mjs — stamp the skeleton for any chapter in the manifest that
   has no file yet.

   This is a SCAFFOLDER, not a build step. It runs once per chapter, writes a
   real static .html file, and never touches a file that already exists. After
   it has run, the chapter is a hand-written page like any other: edit the HTML,
   not a template. Nothing in site/ depends on this script existing.

   The reason it exists at all is that the <head>, the script order and the
   layout wrapper are a CONTRACT (see site/README.md) and copying a contract by
   hand 62 times is how contracts drift.

     node tools/new-chapter.mjs            # every missing chapter
     node tools/new-chapter.mjs 07 12 13   # only these numbers
--------------------------------------------------------------------------- */

import { readFile, writeFile, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");

// The manifest is plain JS that assigns onto `self`; give it a `self` and run it.
const src = await readFile(join(SITE, "assets/chapters.js"), "utf8");
const scope = {};
new Function("self", src)(scope);
const { CHAPTERS } = scope;

const only = process.argv.slice(2);
const wanted = only.length
  ? CHAPTERS.filter((c) => only.includes(c.n) || only.includes(c.id))
  : CHAPTERS;

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function page(c) {
  const advert = c.req
    ? `<div class="box note">
  <div class="box-title">From the advert</div>
  <p style="margin-bottom:0"><em>&ldquo;${esc(c.req)}&rdquo;</em> &mdash; TODO: one sentence on what
  that line is really asking for.</p>
</div>`
    : `<div class="box note">
  <div class="box-title">No advert asked for this</div>
  <p style="margin-bottom:0">${esc(c.extra)}</p>
</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(c.n)} &middot; ${esc(c.title)} &mdash; QueryForge Academy</title>
<link rel="icon" href="../favicon.svg" type="image/svg+xml">
<link rel="manifest" href="../manifest.webmanifest">
<meta name="theme-color" content="#f6f7fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#101320" media="(prefers-color-scheme: dark)">
<link rel="stylesheet" href="../assets/style.css">
<link rel="stylesheet" href="../assets/learn.css">
</head>
<body data-chapter="${c.id}">
<a class="skip" href="#main">Skip to content</a>
<div class="layout">
<aside class="sidebar" id="sidebar"></aside>
<main class="main" id="main">

<p class="crumbs">${esc(c.part)} <span>&rsaquo;</span> Chapter ${esc(c.n)}</p>
<h1>${esc(c.title)}</h1>
<p class="lede">${esc(c.blurb)}</p>

${advert}

<nav id="toc"></nav>

<!-- BODY -->

<div id="chapter-quiz"></div>
<div id="pager"></div>

</main>
</div>

<script src="../assets/chapters.js"></script>
<script src="../assets/quizzes-1.js"></script>
<script src="../assets/quizzes-2.js"></script>
<script src="../assets/quizzes-3.js"></script>
<script src="../assets/store.js"></script>
<script src="../assets/site.js"></script>
<script src="../assets/quiz.js"></script>
<script src="../assets/learn.js"></script>
<script src="../assets/notes.js"></script>
<script src="../assets/account.js"></script>
<script src="../assets/italiano.js"></script>
<script src="../assets/italiano-panel.js"></script>
</body>
</html>
`;
}

let made = 0, kept = 0;
for (const c of wanted) {
  const file = join(SITE, "chapters", c.id + ".html");
  try {
    await access(file);
    kept++;
    continue;                       // never clobber a written chapter
  } catch {}
  await writeFile(file, page(c), "utf8");
  made++;
  console.log("  +", c.n, c.id);
}
console.log(`\n${made} created, ${kept} already existed.`);
