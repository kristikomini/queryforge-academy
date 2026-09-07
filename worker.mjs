/* ===========================================================================
   worker.mjs — the smallest possible Worker, and a note on why it exists.

   Cloudflare's asset server has one setting, `html_handling`, that decides two
   unrelated things at once:

     · whether "/" is served from "/index.html";  and
     · whether "/x.html" REDIRECTS to "/x".

   This site needs the first and must not have the second. Every link in it is
   an explicit .html path — the site is designed to open from a USB stick, where
   there is no server to rewrite anything — and the service worker precaches
   those exact paths. Under a redirecting mode the precache stores redirected
   responses, and a redirected response served for a navigation is an error the
   browser refuses outright, so the site stops working offline. That is the
   failure the worker exists to prevent, so it cannot be the price of fixing the
   home page.

   `html_handling: "none"` therefore stays, and this file supplies the missing
   half: a directory path is rewritten INTERNALLY to its index.html. A rewrite,
   not a redirect — the browser never learns it happened, and the URL does not
   change.

   IT RUNS ALMOST NEVER. With `main` and `assets` both configured, Cloudflare
   serves a request that matches a file directly and only invokes this Worker
   when nothing matched. Every chapter, script and stylesheet bypasses it
   entirely; "/" is the one URL on the site that reaches it.

   Covered in: docs/DEPLOY.md
   =========================================================================== */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    /* A directory: "/" or "/anything/". Serve its index.html, if it has one.
       Anything else that reached this Worker genuinely does not exist, and is
       passed through so the asset server can answer 404 for it. */
    if (url.pathname.endsWith("/")) {
      const index = new URL(url.pathname + "index.html", url.origin);
      const hit = await env.ASSETS.fetch(new Request(index, request));
      if (hit.status !== 404) return hit;
    }

    return env.ASSETS.fetch(request);
  },
};
