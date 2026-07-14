# syntax=docker/dockerfile:1

# ============================================================================
# store-api — multi-stage production image (TASK-270)
#
# Build context is the MONOREPO ROOT (npm workspaces): the unified
# package-lock.json and the packages/* workspaces are only reachable from there.
#   docker build -f apps/store-api/Dockerfile -t store-api .
#
# Alpine + Prisma + sharp note: Alpine ships without OpenSSL, but Prisma's musl
# query engine needs it at both generate- and run-time, and `sharp` resolves its
# musl prebuilt binary during `npm ci`. Using the SAME node:20-alpine base for
# every stage (matching CI's node-version: 20) is what lets the build-time
# `prisma generate` emit the exact engine the runtime container actually uses;
# `libc6-compat` covers glibc-linked native deps.
# ============================================================================

# ─── deps: install the full workspace dependency tree once ──────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache openssl libc6-compat
# Skip Husky's git-hook install during `npm ci` — there is no .git in the image.
ENV HUSKY=0
WORKDIR /app

# Copy every workspace manifest (root + apps/* + packages/*) preserving the
# directory layout so `npm ci` resolves the workspaces graph against the
# committed lockfile.
COPY package.json package-lock.json ./
COPY apps/store-api/package.json apps/store-api/
COPY apps/store-client/package.json apps/store-client/
COPY apps/store-admin/package.json apps/store-admin/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/orval-config/package.json packages/orval-config/
COPY packages/typescript-config/package.json packages/typescript-config/

RUN npm ci

# ─── build: prisma generate + nest build, then drop devDependencies ─────────
FROM node:20-alpine AS build
RUN apk add --no-cache openssl libc6-compat
ENV HUSKY=0
WORKDIR /app

# Copy BOTH the hoisted root node_modules AND store-api's workspace-local
# node_modules — npm workspaces keeps version-conflicting deps (here @nestjs/cli,
# which provides the `nest` build binary, and store-api's own typescript) under
# apps/store-api/node_modules rather than hoisting them.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/store-api/node_modules ./apps/store-api/node_modules
COPY . .

# Generate the Prisma client (musl engine) — identical to the command CI runs.
# No DB connection is needed at generate time.
RUN npx prisma generate --schema=apps/store-api/prisma/schema.prisma

# Compile TypeScript -> dist/ (nest build, output relative to apps/store-api).
RUN npm run build -w apps/store-api

# Strip devDependencies from both the root and workspace-local node_modules. The
# already-generated Prisma client lives in node_modules/.prisma/client (a
# generated directory, not an npm package), so prune leaves it in place. Then
# guarantee the workspace-local dir still exists for the runner COPY below.
RUN npm prune --omit=dev && mkdir -p /app/apps/store-api/node_modules

# ─── runner: minimal non-root runtime ───────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl libc6-compat
ENV NODE_ENV=production
ENV PORT=3001

# Non-root runtime user.
RUN addgroup -S nodejs && adduser -S nestjs -G nodejs

# WORKDIR mirrors local/CI: `start -w apps/store-api` runs with cwd
# apps/store-api, which is why UPLOAD_DEST's `./uploads` default resolves to
# apps/store-api/uploads. Node walks up to the hoisted /app/node_modules.
WORKDIR /app/apps/store-api

# Production node_modules (root-owned, world-readable — the app only needs read
# access). Both the hoisted root tree and store-api's workspace-local tree are
# copied so Node resolves every dependency from apps/store-api up to /app.
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/store-api/node_modules ./node_modules
# Compiled output + runtime manifest.
COPY --from=build /app/apps/store-api/dist ./dist
COPY --from=build /app/apps/store-api/package.json ./package.json
# Prisma schema + migration history + config kept so a deploy-time
# `prisma migrate deploy` (TASK-303) can run inside this same image, not just the
# already-generated client. The migrations directory is what makes that possible —
# without it the image could only `db push`, which reshapes the schema in place.
COPY --from=build /app/apps/store-api/prisma ./prisma
COPY --from=build /app/apps/store-api/prisma.config.ts ./prisma.config.ts

# Uploads dir must exist and be writable by the app user BEFORE dropping root;
# docker-compose mounts a named volume here so product images survive redeploys.
RUN mkdir -p /app/apps/store-api/uploads && chown -R nestjs:nodejs /app/apps/store-api/uploads

USER nestjs

EXPOSE 3001

# Reuse the unauthenticated GET /health route (kept outside the /api prefix).
# busybox `wget` ships in the alpine base.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD wget -qO- "http://localhost:${PORT}/health" || exit 1

# Matches the `start:prod` script: node dist/main(.js).
CMD ["node", "dist/main.js"]
