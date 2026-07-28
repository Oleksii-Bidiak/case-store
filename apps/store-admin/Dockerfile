# syntax=docker/dockerfile:1

# ============================================================================
# store-admin (admin panel) — multi-stage production image (TASK-270)
#
# Build context is the MONOREPO ROOT (npm workspaces):
#   docker build -f apps/store-admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ... -t store-admin .
#
# Same base-image, API-contract, and standalone/monorepo rationale as
# store-client (see that Dockerfile's header for the full version). glibc
# `node:22-slim`, not alpine, because the lockfile pins the `*-linux-x64-gnu`
# native addons and not the musl ones; node 22, not 20, because orval requires
# >= 22.18. The Orval hooks are regenerated during the build from the COMMITTED
# apps/store-api/swagger.json (TASK-325), so it is always in the build context.
# Smaller app: no next/image remote-pattern nuance. Runs on port 3002 to match
# the `start -p 3002` script. Caddy routing.
# ============================================================================

# ─── deps ────────────────────────────────────────────────────────────────────
FROM node:22-slim AS deps
ENV HUSKY=0
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/store-api/package.json apps/store-api/
COPY apps/store-client/package.json apps/store-client/
COPY apps/store-admin/package.json apps/store-admin/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/orval-config/package.json packages/orval-config/
COPY packages/typescript-config/package.json packages/typescript-config/

RUN npm ci

# ─── build ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS build
ENV HUSKY=0
WORKDIR /app

# Copy BOTH the hoisted root node_modules AND store-admin's workspace-local
# node_modules (npm workspaces keeps version-conflicting deps, e.g. this app's
# own typescript, under apps/store-admin/node_modules rather than hoisting).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/store-admin/node_modules ./apps/store-admin/node_modules
COPY . .

# Regenerate the typed API client from the OpenAPI contract in the context
# (offline — orval reads apps/store-api/swagger.json; no running server needed).
RUN npm run generate:api -w apps/store-admin

# The runner copies public/ into the standalone bundle; guarantee the dir exists
# (this app ships no static public assets today, so it is not committed).
RUN mkdir -p apps/store-admin/public

# Build-time public config, baked into the admin bundle. ARG *and* ENV, always
# both: an ARG alone is only a build-time substitution and `next build` reads
# process.env, while a compose build arg for a name this file never declares is
# discarded with only a BuildKit warning. See the longer note in
# apps/store-client/Dockerfile — NEXT_PUBLIC_UMAMI_DASHBOARD_URL below was
# exactly that hole until TASK-348, and `scripts/env-check.js --audit` now fails
# when a compose build arg has no ARG+ENV pair here.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ADMIN_URL
# Canonical storefront origin, shared with store-client. The SEO-health section
# links out to the storefront's /robots.txt, /sitemap.xml and /llms.txt, and
# shared/config/site.ts falls back to NEXT_PUBLIC_APP_URL when this is empty —
# so a deployment that sets the two to different values silently sent the owner
# to the wrong host until this ARG existed.
ARG NEXT_PUBLIC_SITE_URL
# Deep link to this store's website view in Umami's own dashboard UI. Empty →
# the dashboard's traffic card renders muted and linkless (never dead-links).
ARG NEXT_PUBLIC_UMAMI_DASHBOARD_URL
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
# Source-map upload (optional — skipped with a warning when unset).
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_ADMIN_URL=${NEXT_PUBLIC_ADMIN_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_UMAMI_DASHBOARD_URL=${NEXT_PUBLIC_UMAMI_DASHBOARD_URL} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w apps/store-admin

# ─── runner ──────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3002
ENV HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=build --chown=node:node /app/apps/store-admin/.next/standalone ./
COPY --from=build --chown=node:node /app/apps/store-admin/.next/static ./apps/store-admin/.next/static
COPY --from=build --chown=node:node /app/apps/store-admin/public ./apps/store-admin/public

USER node

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3002)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "apps/store-admin/server.js"]
