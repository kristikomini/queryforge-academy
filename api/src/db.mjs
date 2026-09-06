/* ---------------------------------------------------------------------------
   db.mjs — the database, and the query catalogue loader.

   This is the whole data layer. It opens the database, applies schema.sql if the
   table list is empty, and parses queries.sql into named prepared statements.

   The service NEVER builds SQL. `q("user_by_username").get(name)` looks up a
   statement written in a .sql file; there is no string concatenation anywhere in
   this process. That is not a style preference — it is the reason injection is
   structurally impossible here rather than merely avoided.

   Zero dependencies: node:sqlite ships with Node 22+.
--------------------------------------------------------------------------- */

import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL_DIR = join(HERE, "..", "sql");

/* ------------------------------------------------------- the catalogue --- */

/*  Parse `-- name: xxx` blocks out of a .sql file. This is the yesql / pugsql /
    sqlc pattern, and the reason to use it is not cleverness: SQL that lives in a
    .sql file can be read, diffed in review, linted, and pasted straight into a
    client to run by hand. SQL assembled from string fragments in application
    code can be none of those things.                                        */
export function parseCatalogue(text) {
  const out = new Map();
  let name = null;
  let buf = [];
  const flush = () => {
    if (!name) return;
    /* Drop trailing blank and comment-only lines. Without this, a comment that
       introduces the NEXT section gets absorbed into the previous statement —
       harmless to execute, but it means the text stored under a name is not the
       statement, which makes the catalogue lie about itself. */
    const lines = buf.slice();
    while (lines.length && /^\s*(--.*)?$/.test(lines[lines.length - 1])) lines.pop();
    const sql = lines.join("\n").trim();
    if (sql) out.set(name, sql);
    buf = [];
  };
  for (const line of text.split("\n")) {
    const m = line.match(/^--\s*name:\s*([A-Za-z0-9_]+)\s*$/);
    if (m) { flush(); name = m[1]; continue; }
    if (name) buf.push(line);
  }
  flush();
  return out;
}

/* -------------------------------------------------------------- open ---- */

export function openDb(file, { verbose = false } = {}) {
  if (file !== ":memory:") {
    const dir = dirname(file);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  const db = new DatabaseSync(file);
  const schema = readFileSync(join(SQL_DIR, "schema.sql"), "utf8");

  /*  CREATE-IF-MISSING, not migrations. Every statement in schema.sql is
      IF NOT EXISTS, so this is idempotent — but it CANNOT alter an existing
      table. If the schema changes under a database that predates the change,
      the service must fail with an instruction rather than a stack trace.
      That check is below.                                                   */
  db.exec(schema);

  const catalogue = parseCatalogue(readFileSync(join(SQL_DIR, "queries.sql"), "utf8"));
  const prepared = new Map();

  /*  Prepare every statement AT STARTUP rather than lazily. A typo in a query
      used only by the password-reset path should stop the process at boot, not
      three weeks later at 2am when somebody finally uses it. Validate
      configuration and code at startup, not at first use.                    */
  const errors = [];
  for (const [name, sql] of catalogue) {
    try {
      prepared.set(name, db.prepare(sql));
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }
  if (errors.length) {
    throw new Error(
      "The query catalogue does not match the schema. This usually means the\n" +
      "database predates a schema change, and create-if-missing cannot alter an\n" +
      "existing table.\n\n" +
      "  Export your profile from the site's dashboard first, then delete the\n" +
      "  database file and restart. Nothing else in it is irreplaceable.\n\n" +
      "Statements that failed to prepare:\n  " + errors.join("\n  "));
  }

  function q(name) {
    const s = prepared.get(name);
    if (!s) throw new Error(`No such query: "${name}". Check api/sql/queries.sql.`);
    return s;
  }

  if (verbose) console.log(`  db: ${file} · ${prepared.size} statements prepared`);

  return {
    db, q,
    catalogue,
    /* A transaction helper, because "save the order AND the event" must be one
       unit. node:sqlite has no wrapper, so this is it. */
    tx(fn) {
      db.exec("BEGIN");
      try {
        const r = fn();
        db.exec("COMMIT");
        return r;
      } catch (e) {
        try { db.exec("ROLLBACK"); } catch {}
        throw e;
      }
    },
    close() { try { db.close(); } catch {} },
  };
}
