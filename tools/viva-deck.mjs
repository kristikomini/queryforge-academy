#!/usr/bin/env node
/* ===========================================================================
   viva-deck.mjs — the golden-rules pipeline.

       site/chapters/*.html  (the .rules cards — where the rules were WRITTEN)
                 │
                 ├──▶ course/GOLDEN-RULES.md   (collected, with priority tiers)
                 │
                 └──▶ site/assets/rules.js     (the viva deck the site drills)

   Both outputs are GENERATED. Never hand-edit either of them — edit the rules
   card in the chapter, then re-run this. tools/doctor.mjs fails the build if
   they are out of step, because a stale deck quietly drills the old wording and
   nothing anywhere reports an error.

   The ONE hand-written input is course/TIERS.md, which nominates the twelve and
   the six by distinctive substring. A substring matching zero or several rules
   is an error here, so rewording a tier-one rule breaks the build rather than
   silently dropping it out of the tier.

       node tools/viva-deck.mjs
   =========================================================================== */

import { readFile, writeFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");

/* ------------------------------------------------------------- manifest --- */

const manifestSrc = await readFile(join(SITE, "assets/chapters.js"), "utf8");
const scope = {};
new Function("self", manifestSrc)(scope);
const { CHAPTERS } = scope;

/* --------------------------------------------------------------- helpers -- */

/* The rules cards are hand-written HTML. We want the claim as PLAIN TEXT for
   the markdown file and as light markup for the deck, so keep <code> and turn
   everything else into text. */
function toText(html) {
  return html
    .replace(/<code>([^<]*)<\/code>/g, "`$1`")
    .replace(/<\/?(strong|b|em|i)>/g, "")
    .replace(/<a [^>]*>([^<]*)<\/a>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&rsaquo;/g, "›")
    .replace(/\s+/g, " ")
    .trim();
}

/*  The id is derived from the CLAIM TEXT, not from its position. So reordering
    the rules costs nothing, and REWORDING one resets that single card's
    schedule — which is correct, because it is now a different claim.        */
function idFor(claim) {
  const slug = claim.toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .split("-").slice(0, 9).join("-");
  const h = createHash("sha256").update(claim).digest("hex").slice(0, 6);
  return `${slug}-${h}`;
}

/*  Checkpoints are the rule's own code terms, matched literally against what
    the learner wrote and shown as hit or missed. It cannot tell whether they
    were right — but "you never mentioned SKIP LOCKED" is a fact, and facts are
    harder to mark generously than feelings.                                 */
function checkpointsFor(html) {
  const codes = [...html.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1].trim());
  const caps = [...toText(html).matchAll(/\b([A-Z]{2,}(?:\s[A-Z]{2,})*)\b/g)].map((m) => m[1]);
  return [...new Set([...codes, ...caps])]
    .filter((t) => t.length > 1 && t.length < 40)
    .slice(0, 5);
}

/* ------------------------------------------------------------ collection -- */

const rules = [];
for (const ch of CHAPTERS) {
  let html;
  try { html = await readFile(join(SITE, "chapters", ch.id + ".html"), "utf8"); }
  catch { continue; }

  const card = html.match(/<div class="rules">([\s\S]*?)<\/div>/);
  if (!card) {
    console.warn(`  ! ${ch.id} has no .rules card`);
    continue;
  }
  const items = [...card[1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
  for (const item of items) {
    const claim = toText(item);
    if (!claim) continue;
    rules.push({
      id: idFor(claim),
      kind: "explain",
      tier: "",
      chapter: ch.id,
      n: ch.n,
      part: ch.part,
      title: ch.title,
      claim,
      checkpoints: checkpointsFor(item),
      refs: [ch.n],
    });
  }
}

/* ----------------------------------------------------------------- tiers -- */

const tiersMd = await readFile(join(ROOT, "course/TIERS.md"), "utf8");
function tierList(heading) {
  const section = tiersMd.split(new RegExp(`^##\\s+${heading}\\s*$`, "mi"))[1];
  if (!section) return [];
  return section.split(/^##\s/m)[0].split("\n")
    .filter((l) => /^\s*-\s/.test(l))
    .map((l) => toText(l.replace(/^\s*-\s*/, "")))
    .filter(Boolean);
}

let tierErrors = 0;
function applyTier(heading, tier) {
  for (const needle of tierList(heading)) {
    const hits = rules.filter((r) => r.claim.includes(needle));
    if (hits.length === 0) {
      console.error(`  ERROR  TIERS.md "${needle}" matches no rule — was it reworded?`);
      tierErrors++;
    } else if (hits.length > 1) {
      console.error(`  ERROR  TIERS.md "${needle}" matches ${hits.length} rules — make it more specific`);
      tierErrors++;
    } else {
      hits[0].tier = tier;
    }
  }
}
applyTier("The twelve that decide interviews", "twelve");
applyTier("The six that separate a senior candidate", "six");

if (tierErrors) {
  console.error(`\n  ${tierErrors} tier error(s). Fix course/TIERS.md and re-run.\n`);
  process.exit(1);
}

/* -------------------------------------------------- course/GOLDEN-RULES.md */

const byPart = {};
for (const r of rules) (byPart[r.part] ||= []).push(r);

const twelve = rules.filter((r) => r.tier === "twelve");
const six = rules.filter((r) => r.tier === "six");

let md = `# The golden rules

**GENERATED by \`tools/viva-deck.mjs\` from the \`.rules\` cards in \`site/chapters/*.html\`.
Do not edit this file.** Edit the rules card in the chapter and re-run the tool;
\`tools/doctor.mjs\` fails the build if this file is out of step.

${rules.length} rules, from ${CHAPTERS.length} chapters. The two tiers below are
the only hand-curated part, nominated in [TIERS.md](TIERS.md).

The site drills these as a [viva](../site/viva.html): the claim is shown, the
justification is hidden until you have committed to an answer, and then your own
words are placed beside the model answer with the rule's code terms matched
literally as hit or missed. That last part is a mitigation, not a solution —
self-marking is the weakest link in the whole platform and it is not worth
pretending otherwise.

---

## The twelve that decide interviews

`;
twelve.forEach((r, i) => { md += `${i + 1}. **${r.claim}**  \n   <sub>chapter ${r.n} · ${r.title}</sub>\n`; });

md += `
## The six that separate a senior candidate

`;
six.forEach((r, i) => { md += `${i + 1}. **${r.claim}**  \n   <sub>chapter ${r.n} · ${r.title}</sub>\n`; });

md += `
---

## All rules, in chapter order

`;
for (const part of scope.PARTS) {
  const list = byPart[part];
  if (!list || !list.length) continue;
  md += `### ${part}\n\n`;
  let lastCh = null;
  for (const r of list) {
    if (r.chapter !== lastCh) {
      md += `\n**${r.n} · ${r.title}**\n\n`;
      lastCh = r.chapter;
    }
    md += `- ${r.claim}\n`;
  }
  md += "\n";
}

await writeFile(join(ROOT, "course/GOLDEN-RULES.md"), md, "utf8");

/* --------------------------------------------------- site/assets/rules.js */

const goldenHash = createHash("sha256").update(md).digest("hex").slice(0, 16);

const js = `/* GENERATED by tools/viva-deck.mjs — DO NOT EDIT.
   source: course/GOLDEN-RULES.md
   source sha256: ${goldenHash}
   ${rules.length} rules · ${twelve.length} tier-one · ${six.length} tier-two

   \`id\` is derived from the claim TEXT, so reordering rules costs nothing and
   rewording one resets that single card's schedule — which is correct, because
   it is now a different claim. */
window.RULES = ${JSON.stringify(rules.map((r) => ({
  id: r.id, kind: r.kind, tier: r.tier, chapter: r.chapter,
  n: r.n, part: r.part, title: r.title,
  claim: r.claim, checkpoints: r.checkpoints, refs: r.refs,
})), null, 1)};
`;
await writeFile(join(SITE, "assets/rules.js"), js, "utf8");

const dupes = rules.length - new Set(rules.map((r) => r.id)).size;
console.log(`  wrote course/GOLDEN-RULES.md   ${rules.length} rules`);
console.log(`  wrote site/assets/rules.js     ${twelve.length} tier-one, ${six.length} tier-two, ${dupes} duplicate id(s)`);
if (dupes) console.warn("  ! duplicate ids mean two rules share a claim — they will share a schedule");
