# Deploying QueryForge Academy

The platform is two deliverables with two very different hosting stories, and
being clear about which is which saves an afternoon:

| | What it is | What it needs |
| --- | --- | --- |
| **`site/`** | The course. 62 chapters, the tests, the review engine, the viva, the simulator, the SQL playground, the glossary, the CV linter. | **Nothing.** Static files. Any host, every free tier, and it also works from a USB stick. |
| **`api/`** | The accounts service: sign-in, cross-device sync, the leaderboard. | A persistent Node process and a writable disk. Not a static host. |

Everything below is one of those two. Pick the first one unless you specifically
want accounts.

---

## The one-command answers

```bash
npx vercel deploy --prod            # Vercel      — reads vercel.json
npx wrangler deploy                 # Cloudflare  — reads wrangler.jsonc
npx netlify deploy --prod           # Netlify     — reads netlify.toml
git push                            # GitHub Pages — .github/workflows/pages.yml
```

All four publish `site/` and nothing else. The configuration files are in the
repository root and are commented; read the one for your host before the first
deploy, because each contains one setting that matters more than the rest.

---

## What works without the accounts service

Everything except three features, and the site says so rather than failing
quietly: `assets/account.js` probes `/api/health` once per session, and when
there is no API it reports it on the account page.

| Works | Needs the API |
| --- | --- |
| Every chapter, every test, the spaced-repetition review, the viva, the mock exam, the timed simulator, the notes, the glossary, the CV linter, the SQL playground | Sign-in, syncing progress between devices, the leaderboard |

Progress is stored in the browser either way. Without the API it stays in that
browser, which for a single learner on a single machine is the whole feature.

---

## Vercel

```bash
npx vercel deploy --prod
```

`vercel.json` sets `outputDirectory: "site"` and **no build command**, because
there is nothing to build. The setting worth knowing about is `cleanUrls`, and
it is deliberately **off**:

> `cleanUrls` rewrites `/chapters/08-joins.html` to `/chapters/08-joins`, with a
> redirect on the original. Every link in this site is an explicit `.html` path,
> and so is every entry in the service worker's precache list. Turning it on
> means precaching a list of redirects, which is precisely the failure the
> worker exists to prevent.

The same reasoning applies to `trailingSlash`, which is also pinned.

Deploying through the dashboard instead: import the repository, choose
**Other** as the framework preset, set the output directory to `site`, and leave
the build command empty.

---

## Cloudflare Workers

```bash
npx wrangler deploy
```

`wrangler.jsonc` declares an **assets-only** Worker: there is no `main`, so no
Worker code runs at all and every request is served by Cloudflare's asset
server. `html_handling` is set to `"none"` for exactly the reason `cleanUrls` is
off on Vercel — the friendlier `"auto-trailing-slash"` redirects `.html` paths.

Only changed files are uploaded: the asset store is content-addressed, so a
redeploy after editing one chapter moves one file, and a redeploy with nothing
changed uploads nothing at all. Deploying is safe to repeat.

Cloudflare **Pages** works too and needs no configuration file: set the build
command to empty and the output directory to `site`.

### Deploying it automatically

[`.github/workflows/cloudflare.yml`](../.github/workflows/cloudflare.yml)
publishes on every push to `main`, gated on `tools/doctor.mjs` exactly as the
Pages workflow is. It is a **second workflow rather than a job inside
pages.yml** on purpose: the two hosts fail for different reasons and should fail
separately, so a red X names its own cause.

It needs one secret, and **skips itself with a notice when that secret is
absent** — a fork gets a green run rather than a red X on every push:

1. Cloudflare dashboard → **My Profile → API Tokens → Create Token**, using the
   **Edit Cloudflare Workers** template. That is much narrower than the OAuth
   scopes `wrangler login` asks for, which include D1, queues, email routing and
   containers; this deploy needs none of them.
2. `gh secret set CLOUDFLARE_API_TOKEN` — or Settings → Secrets and variables →
   Actions.
3. Only if the token can see more than one account, also set
   `CLOUDFLARE_ACCOUNT_ID`. With a single account wrangler infers it.

Until then, `npx wrangler deploy` from a machine that has run `wrangler login`
is the manual equivalent.

---

## Netlify

```bash
npx netlify deploy --prod
```

`netlify.toml` publishes `site/`, skips post-processing, and turns
`pretty_urls` off — the same `.html` argument again. Through the dashboard:
publish directory `site`, build command empty.

---

## GitHub Pages

Already configured, and it is the deployment this repository's README links to.
`.github/workflows/pages.yml` runs on every push to `main`, and it **deploys
only if the integrity gate passes**:

```
node tools/doctor.mjs          # 12 checks
node tools/build-playground-db.mjs --check
node tools/stamp-sw.mjs --check
```

Publishing a site whose cross-references have rotted is worse than not
publishing it. Pages can only serve a branch from `/` or `/docs`, and the site
lives in `site/`, so the workflow uploads that directory as an artifact rather
than renaming every path in the repository to satisfy a hosting constraint.

---

## Any other static host

There is no build step and no framework. Copy `site/` to the web root:

```bash
rsync -a site/ user@host:/var/www/queryforge/
```

Three server-side details are worth setting, and none of them is required for
the site to work:

1. **Serve `.wasm` as `application/wasm`.** The playground's engine is a
   WebAssembly file. Most servers already do this; a very old one may not, and
   the symptom is the playground reporting that it could not start the engine.
2. **Do not redirect `.html` URLs.** See the Vercel section above.
3. **Do not cache `sw.js`.** If the service worker is served from an HTTP cache,
   a new version cannot take over. The provided configurations all set
   `no-cache` on it.

HTTPS is required for the service worker — that is a browser rule, not a choice
of this site — with `localhost` the standard exception. Without HTTPS the site
still works; it simply does not install and does not work offline.

---

## The accounts service

`api/server.mjs` serves **both** the site and `/api/*` from one process. It has
no dependencies, so there is nothing to install:

```bash
node api/server.mjs             # http://127.0.0.1:5057
```

For anything real, two things are not optional:

```bash
NODE_ENV=production \
QF_JWT_SECRET="$(openssl rand -hex 32)" \
QF_DATA_DIR=/var/lib/queryforge \
node api/server.mjs
```

- **`QF_JWT_SECRET`.** The service **refuses to start** in production without
  it. That is deliberate: a service that boots green and fails at the first
  sign-in is worse than one that does not boot. Keep the value — changing it
  signs everybody out.
- **`QF_DATA_DIR`.** Where the SQLite file lives. On a container platform this
  must be a **mounted volume**, or every deploy silently deletes every account.
  It is the most common way to lose data on a free tier.

### In a container

```bash
docker build -t queryforge .
docker run --rm -p 5057:5057 \
  -e NODE_ENV=production -e QF_JWT_SECRET="$(openssl rand -hex 32)" \
  -v queryforge-data:/data queryforge
```

The `Dockerfile` runs as a non-root user, declares `/data` as a volume, and
health-checks `/api/health` — which the service already answers, so the check
tests the service rather than the port.

This image runs on any host that takes a container: **Fly.io**, **Render**,
**Railway**, **Koyeb**, or a VPS. Free tiers change often enough that naming
today's limits would be wrong by the time you read this; what does not change is
the checklist:

- a **persistent volume** mounted at the data directory;
- `QF_JWT_SECRET` set as a secret, not as a plain environment variable in a
  dashboard screenshot;
- the health check pointed at `/api/health`;
- and a **backup of that one SQLite file**, because a backup you have never
  restored is a hypothesis ([chapter 41](../site/chapters/41-backup-restore-ha.html)).

### Serverless is the wrong shape for this API

Not because it could not be ported, but because of what it stores. The service
keeps its state in a SQLite file it writes to, and serverless functions get an
ephemeral filesystem and no shared one between invocations. Deploying it to
Vercel Functions or Cloudflare Workers as-is would produce a service that works
in testing and loses every account at the first cold start.

The honest options are the container above, or a rewrite against a hosted
database — Cloudflare D1, Turso, Neon — which is a real piece of work and not a
configuration change. The query catalogue in
[`api/sql/queries.sql`](../api/sql/queries.sql) is the part that would survive
it, which is one of the arguments for keeping the SQL there in the first place.

---

## Splitting the two

The static site and the API do not have to live on the same host. If the site is
on Pages and the API is on Fly, the browser has to be told where the API is, and
the API has to allow that origin:

- the site calls `/api/*` on **its own origin** by default, so a split
  deployment needs the API's base URL configured in the browser — the account
  page accepts one and stores it locally;
- the API's `QF_ORIGINS` must then include the site's origin, or every
  request is refused by CORS.

Keeping both on one host — the container image above serves the site as well —
avoids both settings, and is what this repository recommends unless you have a
reason.

---

## Verifying a deployment

Four checks, in the order that finds problems fastest:

1. **The home page loads and the sidebar lists every chapter.** If the sidebar
   is short, `assets/chapters.js` is being served stale — usually an HTTP cache
   or an old service worker.
2. **Open a chapter and press &ldquo;Run this in the playground&rdquo;.** That
   exercises the WebAssembly engine, the `#q=` handoff and the reference
   database in one click.
3. **Reload with the network off.** The service worker precaches the whole site,
   so a chapter you have never opened should still appear. If it does not, check
   that `sw.js` is served with `no-cache` and over HTTPS.
4. **Open the account page.** With no API it should say so plainly. With an API
   it should sign in, and the leaderboard should show figures the **server**
   derived rather than ones the browser claimed.
