# =============================================================================
#  The WHOLE platform in one container: the static site AND the accounts API.
#
#  The static hosts (docs/DEPLOY.md) deploy site/ alone, which is everything
#  except sign-in, cross-device sync and the leaderboard. This image is the
#  other option — one process serving both, for any host that runs a container:
#  Fly.io, Render, Railway, Koyeb, a VPS, or your own laptop.
#
#      docker build -t queryforge .
#      docker run --rm -p 5057:5057 \
#        -e NODE_ENV=production -e QF_JWT_SECRET="$(openssl rand -hex 32)" \
#        -v queryforge-data:/data queryforge
#
#  TWO THINGS THAT MATTER, and both are failure modes rather than preferences:
#
#  1. QF_JWT_SECRET. The service REFUSES TO START in production without it —
#     deliberately, because a service that boots green and fails at the first
#     sign-in is worse than one that does not boot. Generate it once and keep
#     it: changing it signs everybody out.
#
#  2. THE VOLUME. /data holds the SQLite file. Without a volume the container's
#     filesystem is ephemeral, so every deploy silently deletes every account.
#     That is the single most common way to lose data on a PaaS free tier.
#
#  No build step, no dependencies, no package.json. Node 22+ and it runs.
# =============================================================================

FROM node:22-alpine

# Not root. The process needs to write only to /data, and this makes that true
# rather than merely intended.
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Everything the running service reads: the API, the site it serves, and the
# reference schema the playground database is generated from. Nothing else.
COPY --chown=app:app api  ./api
COPY --chown=app:app site ./site

# The data directory is a volume, so the database survives a redeploy.
RUN mkdir -p /data && chown app:app /data
VOLUME ["/data"]

ENV NODE_ENV=production \
    QF_DATA_DIR=/data \
    QF_HOST=0.0.0.0 \
    PORT=5057

EXPOSE 5057
USER app

# The service already answers /api/health; use it rather than inventing a check.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5057)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "api/server.mjs"]
