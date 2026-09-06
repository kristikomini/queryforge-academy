#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   run.mjs — the test runner. Zero dependencies.

   It imports the test files; the test files import harness.mjs. Keeping those
   two apart is not tidiness — a runner that imports the tests while the tests
   import the runner is a circular import, and with top-level await in the
   runner that deadlocks silently instead of erroring.

       node api/tests/run.mjs           # everything
       node api/tests/run.mjs auth      # only files matching "auth"
--------------------------------------------------------------------------- */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
const files = (await readdir(HERE))
  .filter((f) => f.endsWith(".test.mjs"))
  .filter((f) => !only.length || only.some((o) => f.includes(o)))
  .sort();

let passed = 0, failed = 0;
const failures = [];

for (const file of files) {
  /* pathToFileURL, not a bare path: on Windows an absolute path like
     C:\... is read as a URL with the scheme "c:" and the ESM loader refuses it. */
  const mod = await import(pathToFileURL(join(HERE, file)).href);
  const tests = mod.tests || {};
  const names = Object.keys(tests);
  console.log(`\n  ${file}`);
  for (const name of names) {
    try {
      await tests[name]();
      passed++;
      console.log(`    ✓ ${name}`);
    } catch (e) {
      failed++;
      failures.push({ file, name, e });
      console.log(`    ✗ ${name}`);
      console.log(`        ${e.message.split("\n")[0]}`);
    }
  }
}

console.log(`\n  ${"─".repeat(60)}`);
console.log(`  ${passed} passed · ${failed} failed\n`);

if (failed) {
  for (const f of failures) {
    console.log(`  ${f.file} › ${f.name}`);
    console.log(`    ${f.e.stack.split("\n").slice(0, 4).join("\n    ")}\n`);
  }
  process.exit(1);
}
