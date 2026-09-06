/* ---------------------------------------------------------------------------
   serve.mjs — a static server for site/, for development only.

   The real deployment serves site/ from the accounts API (api/src/server.mjs),
   which is where the "static files ABOVE routing" decision lives. This file
   exists so you can look at the site without starting a database, and so that
   the service worker — which only runs over http(s) — can be tested at all.

   Zero dependencies. Node 18+.
--------------------------------------------------------------------------- */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("../site", import.meta.url)));
const PORT = Number(process.env.PORT || 4321);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".sql": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";

    // Reject traversal before touching the filesystem, not after.
    const rel = normalize(path).replace(/^([/\\])+/, "");
    if (rel.startsWith("..")) { res.writeHead(400).end("bad path"); return; }

    const file = join(ROOT, rel);
    const info = await stat(file).catch(() => null);
    if (!info || !info.isFile()) { res.writeHead(404).end("not found"); return; }

    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": TYPES[extname(file)] || "application/octet-stream",
      // A dev server that caches is a dev server that lies to you.
      "cache-control": "no-store",
      "service-worker-allowed": "/",
    });
    res.end(body);
  } catch (e) {
    res.writeHead(500).end(String(e));
  }
}).listen(PORT, () => {
  console.log(`site  ->  http://localhost:${PORT}/index.html`);
});
