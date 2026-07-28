# syntax=docker/dockerfile:1

# ============================================================================
# store-client (storefront) — multi-stage production image (TASK-270)
#
# Build context is the MONOREPO ROOT (npm workspaces):
#   docker build -f apps/store-client/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com ... -t store-client .
#
# BASE IMAGE — node:22-slim (Debian/glibc), NOT alpine.
#
# NATIVE ADDONS — read this before changing the base image or the lockfile.
# lightningcss and @tailwindcss/oxide ship their native addon as a set of
# per-platform optional packages and choose one at require() time. npm records
# in package-lock.json ONLY the ones that were installable on the machine that
# resolved the tree. This lockfile is maintained on Windows.
#
# An earlier version of this comment claimed the lockfile "is generated on a
# glibc platform (CI runs ubuntu)". That was never true, and the assumption is
# exactly what hid the bug: the lockfile held only `*-win32-x64-msvc`, `npm ci`
# here installed no addon at all, and this image could not be built —
# `next build` failed with "Cannot find module
# '../lightningcss.linux-x64-gnu.node'" (TASK-326).
#
# What actually makes it work now: root `optionalDependencies` in package.json
# pin `lightningcss-linux-x64-gnu` and `@tailwindcss/oxide-linux-x64-gnu` to
# their parents' exact versions, so those entries are in the lockfile regardless
# of who ran `npm install`; and the `lockfile-platform` CI job
# (scripts/check-lockfile-platforms.js) fails the build if they are ever pruned
# or drift out of version sync. (@next/swc, @swc/core and sharp need no pin —
# they already record every platform.)
#
# glibc, not musl: only the `-linux-x64-gnu` addons are pinned, so an alpine
# `npm ci` would fail the same way looking for `…linux-x64-musl.node`. x86-64,
# not arm64, for the same reason — an ARM host is NOT supported.
#
# Node 22 (not 20) because the in-build codegen tool orval requires
# node >= 22.18.0; the addons above are napi (node-ABI-stable), so the bump is
# safe for them.
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
#
# ARG *and* ENV, always both. An ARG alone is only a build-time substitution
# variable; `next build` reads process.env, so without the matching ENV line the
# value is accepted on the command line and then dropped. And a `--build-arg` (or
# a compose `build.args` entry) for a name this file never declares is discarded
# with nothing louder than a BuildKit warning nobody reads in CI. Both failure
# modes are silent, and NEXT_PUBLIC_* vars mostly degrade additively, so the
# result is a container that builds green and quietly behaves as if the operator
# had set nothing. That is precisely how NEXT_PUBLIC_IMAGE_HOSTS,
# NEXT_PUBLIC_PAYMENT_METHODS (compose passed it; this file did not take it, so
# card payment never appeared at checkout in ANY container build) and admin's
# NEXT_PUBLIC_UMAMI_DASHBOARD_URL went unnoticed until TASK-348.
# `scripts/env-check.js --audit` now fails when a compose build arg has no
# ARG+ENV pair here, so this list cannot silently fall behind again.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CURRENCY
# Extra hostnames allowed for category-tile images, comma-separated bare hosts
# (`cdn.mystore.ua,images.brand.com`). Empty → only the NEXT_PUBLIC_API_URL
# origin is optimizable and any other remote tile silently falls back.
ARG NEXT_PUBLIC_IMAGE_HOSTS
# Which payment methods the checkout offers (ON_DELIVERY,ONLINE,INSTALLMENTS).
# Empty → cash on delivery only, whatever LiqPay keys store-api holds.
ARG NEXT_PUBLIC_PAYMENT_METHODS
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
    NEXT_PUBLIC_IMAGE_HOSTS=${NEXT_PUBLIC_IMAGE_HOSTS} \
    NEXT_PUBLIC_PAYMENT_METHODS=${NEXT_PUBLIC_PAYMENT_METHODS} \
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
