#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   stamp-sw.mjs — derive the service-worker cache name from the site's contents.

   The cache name IS the version: a new name rebuilds everything and deletes the
   old. Forget to change it and returning visitors keep last month's chapters,
   with no error reported anywhere. In the platform this was modelled on that
   bump was manual and nothing enforced it, which is a documented bug.

   Here it is a hash of every file the worker precaches, so it is impossible to
   change the content without changing the version.

       node tools/stamp-sw.mjs           # stamp it
       node tools/stamp-sw.mjs --check   # exit 1 if stale (CI)
--------------------------------------------------------------------------- */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SITE = join(ROOT, "site");
const SW = join(SITE, "sw.js");

const src = await readFile(SW, "utf8");

/* The shell list, read out of sw.js itself rather than duplicated here. */
const shellBlock = src.match(/const SHELL = \[([\s\S]*?)\];/);
if (!shellBlock) {
  console.error("Could not find the SHELL array in sw.js");
  process.exit(1);
}
const shell = [...shellBlock[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
  .filter((p) => p !== "./");

/* Plus every chapter, from the manifest — the same source the worker uses. */
const scope = {};
new Function("self", await readFile(join(SITE, "assets/chapters.js"), "utf8"))(scope);
const chapters = scope.CHAPTERS.map((c) => `chapters/${c.id}.html`);

const files = [...shell, ...chapters].sort();

const h = createHash("sha256");
let missing = [];
for (const rel of files) {
  const p = join(SITE, rel);
  if (!existsSync(p)) { missing.push(rel); continue; }
  h.update(rel);
  h.update(await readFile(p));
}
/* sw.js's own logic is part of the version too — but not its cache-name line,
   or the hash would depend on itself. */
h.update(src.replace(/const CACHE = "[^"]*";/, ""));

const version = "queryforge-v" + h.digest("hex").slice(0, 12);
const stamped = src.replace(/const CACHE = "[^"]*";/, `const CACHE = "${version}";`);

if (missing.length) {
  console.error("  ERROR  sw.js precaches files that do not exist:");
  missing.forEach((m) => console.error("           " + m));
  process.exit(1);
}

if (process.argv.includes("--check")) {
  if (stamped !== src) {
    console.error(`site/sw.js cache name is stale. Run: node tools/stamp-sw.mjs`);
    process.exit(1);
  }
  console.log(`sw.js is current (${version}, ${files.length} files)`);
} else {
  await writeFile(SW, stamped, "utf8");
  console.log(`stamped site/sw.js  ${version}  (${files.length} files precached)`);
}
