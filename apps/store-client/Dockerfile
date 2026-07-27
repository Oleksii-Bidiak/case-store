# syntax=docker/dockerfile:1

# ============================================================================
# store-client (storefront) — multi-stage production image (TASK-270)
#
# Build context is the MONOREPO ROOT (npm workspaces):
#   docker build -f apps/store-client/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ... -t store-client .
#
# BASE IMAGE — node:22-slim (Debian/glibc), NOT alpine. The committed
# package-lock.json is generated on a glibc platform (CI runs ubuntu), so it
# resolves the `*-linux-x64-gnu` native optional deps the Next build needs
# (lightningcss, @tailwindcss/oxide, @next/swc). The matching `*-linux-musl`
# binaries are NOT in the lockfile, so an alpine (musl) `npm ci` fails at
# `next build` with "Cannot find module '../lightningcss.linux-x64-musl.node'".
# glibc matches CI's platform and sidesteps that gap. Node 22 (not 20) because
# the in-build codegen tool orval@8.9.1 requires node >=22.18.0; the native
# addons above are napi (node-ABI-stable), so the bump is safe for them.
#
# API CONTRACT — the Orval hooks under src/shared/api/generated are gitignored
# codegen output; this image regenerates them during the build. Their input,
# apps/store-api/swagger.json, IS committed (TASK-325), so any checkout — and
# therefore any build context — already carries it. Producing that spec needs a
# booted AppModule and a live database, which is why it is committed rather than
# generated here; `npm run swagger:export -w apps/store-api` refreshes it, and
# the `contract-freshness` CI job fails if it drifts from the API source.
#
# NEXT_PUBLIC_* vars are baked into the JS bundle at `next build` time (NOT read
# at container start), so they are passed as build-args. NEXT_PUBLIC_API_URL
# also fixes next/image's whitelisted remote origin — a built image is tied to
# ONE API domain and cannot be promoted across environments by a runtime env
# change; each environment builds its own image.
#
# `output: "standalone"` + `outputFileTracingRoot` (monorepo root) emit the
# server nested at `.next/standalone/apps/store-client/server.js` with a hoisted
# `.next/standalone/node_modules` alongside it (verified against Next 16 docs).
# ============================================================================

# ─── deps: install the full workspace dependency tree once ──────────────────
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

# ─── build: generate API hooks + next build (standalone output) ─────────────
FROM node:22-slim AS build
ENV HUSKY=0
WORKDIR /app

# Copy BOTH the hoisted root node_modules AND store-client's workspace-local
# node_modules (npm workspaces keeps version-conflicting deps, e.g. this app's
# own typescript, under apps/store-client/node_modules rather than hoisting).
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/store-client/node_modules ./apps/store-client/node_modules
COPY . .

# Regenerate the typed API client from the OpenAPI contract in the context
# (offline — no running server needed; orval reads apps/store-api/swagger.json).
RUN npm run generate:api -w apps/store-client

# The runner copies public/ into the standalone bundle; guarantee the dir exists.
# public/ now ships committed brand assets (icons/, brand/og-fallback.png —
# TASK-279); the mkdir stays as a guard in case the dir is ever emptied again.
RUN mkdir -p apps/store-client/public

# Build-time public config (baked into the client bundle). Every NEXT_PUBLIC_*
# var store-client reads is declared here and re-exposed as ENV so `next build`
# picks it up. The two Umami vars are TASK-261's contract — this image only
# passes their names through.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CURRENCY
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE
ARG NEXT_PUBLIC_UMAMI_SRC
ARG NEXT_PUBLIC_UMAMI_WEBSITE_ID
# Source-map upload (optional — skipped with a warning when unset).
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ARG SENTRY_AUTH_TOKEN

ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    NEXT_PUBLIC_CURRENCY=${NEXT_PUBLIC_CURRENCY} \
    NEXT_PUBLIC_SENTRY_DSN=${NEXT_PUBLIC_SENTRY_DSN} \
    NEXT_PUBLIC_SENTRY_ENVIRONMENT=${NEXT_PUBLIC_SENTRY_ENVIRONMENT} \
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=${NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE} \
    NEXT_PUBLIC_UMAMI_SRC=${NEXT_PUBLIC_UMAMI_SRC} \
    NEXT_PUBLIC_UMAMI_WEBSITE_ID=${NEXT_PUBLIC_UMAMI_WEBSITE_ID} \
    SENTRY_ORG=${SENTRY_ORG} \
    SENTRY_PROJECT=${SENTRY_PROJECT} \
    SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN} \
    NEXT_TELEMETRY_DISABLED=1

RUN npm run build -w apps/store-client

# ─── runner: minimal non-root standalone server ─────────────────────────────
FROM node:22-slim AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Standalone server reads PORT + HOSTNAME; bind to all interfaces for Caddy.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# node:22-slim ships a non-root `node` user (uid 1000) — use it.
WORKDIR /app

# Standalone bundle (nested: contains ./node_modules and ./apps/store-client/).
COPY --from=build --chown=node:node /app/apps/store-client/.next/standalone ./
# Standalone deliberately excludes .next/static and public/ — copy them manually
# into the nested app dir, or every static asset 404s.
COPY --from=build --chown=node:node /app/apps/store-client/.next/static ./apps/store-client/.next/static
COPY --from=build --chown=node:node /app/apps/store-client/public ./apps/store-client/public

USER node

EXPOSE 3000

# Node-based healthcheck (slim ships no wget/curl). Any <500 response = healthy.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

# server.js is emitted at the nested monorepo path.
CMD ["node", "apps/store-client/server.js"]
