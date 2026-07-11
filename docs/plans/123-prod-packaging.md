# Plan 123 — Production Packaging (Dockerfiles + prod compose)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 2** (Деплой (staging рано) + аналітика паралельно)
> **Origin:** `docs/handoff-2026-07-07.md` Блок H «CI/CD: тест-сервер замовника + прод», lines
> 311–355 (TASK-270 detail lines 319–331)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-270
> **Depends on:** — (first task of Block H; TASK-271/plan 124 depends on this plan's output)

## Overview

Per the handoff: CI is strong (`typecheck/lint/build/unit/e2e/int`, Playwright non-blocking) but
**nothing exists yet to actually run this application anywhere but a developer's machine** — no
Dockerfile for any of the three apps, no production compose file, no reverse proxy. The owner's
target topology is two environments on a single family of infrastructure: ① production, ② a
"test server" (staging) the owner reviews before anything reaches customers. Both are **VPS +
Docker Compose** (owner decision, locked — no managed cloud). Staging is being stood up in the
same wave as production packaging specifically so the owner can start reviewing real deployments
early (per the handoff's own Хвиля 2 title: "Деплой (staging рано)").

This plan is the packaging layer only: three multi-stage Dockerfiles, a production Compose file
that wires them together with the existing infra plus a Caddy reverse proxy, and a single
consolidated `.env.production.example`. It does **not** deploy anything — TASK-271 (plan 124,
depends on this plan) is the CI/CD pipeline that actually pushes images and runs them on a real
server. The first real "does this boot on a clean VM" verification is explicitly a manual-QA item
here (no VPS exists in this sandbox); everything else — that each image builds, that the compose
file is structurally valid, that the three apps boot and talk to each other locally — is
locally verifiable and is this plan's actual bar for "done."

## Scope

### In Scope

- `apps/store-api/Dockerfile`, `apps/store-client/Dockerfile`, `apps/store-admin/Dockerfile` —
  multi-stage, non-root runtime user, Next.js apps build with `output: "standalone"`.
- `apps/store-client/next.config.ts` / `apps/store-admin/next.config.ts` — add
  `output: "standalone"` + `outputFileTracingRoot` (monorepo root).
- One root `.dockerignore` (the Docker build **context** for all three images is the monorepo
  root — see Design Decision 1 — so one shared ignore file is correct, not three).
- `docker-compose.prod.yml` — the three built apps + the existing dev infra shape
  (Postgres/Redis/Meilisearch) reproduced for production + a `umami` service mirroring TASK-261's
  dev one (this plan only **references** the `NEXT_PUBLIC_UMAMI_SRC`/`NEXT_PUBLIC_UMAMI_WEBSITE_ID`
  env-var **names** as build-args for `store-client` — it does not create the storefront tracking
  itself, see the ownership note below) + Caddy as the reverse proxy.
- `Caddyfile` — automatic HTTPS, three domains (storefront root domain, `admin.<domain>`,
  `api.<domain>`).
- `.env.production.example` at the repo root — every key `docker-compose.prod.yml` and the three
  Dockerfiles' build-args need, consolidated in one file with inline comments.
- Named volumes so Postgres/Meilisearch/uploaded-image data survive a redeploy.
- Healthchecks on every service.

### Out of Scope

- Any actual deployment, GitHub Actions workflow, SSH, or GHCR push — TASK-271/plan 124.
- Creating the storefront's Umami tracking (script tag, facade, event calls) — TASK-261/plan 125;
  this plan's `umami` compose service and `store-client` build-args only need to agree on the two
  env-var **names**, not implement anything storefront-side.
- A clean squashed Prisma migration baseline / switching `migrate deploy` on for any environment —
  explicitly deferred to TASK-272 (production deploy, future wave); this plan's compose file does
  not run any migration command at all (that is a _deploy-time_ step, TASK-271's job, not a
  build/packaging concern).
- TLS certificate provisioning beyond "Caddy does it automatically" — no manual cert files, no
  Cloudflare-specific DNS-01 config (out of scope unless the owner's actual DNS provider requires
  it, to be revisited once a real domain/DNS is chosen).
- Kubernetes, container orchestration beyond `docker compose`, or any managed-cloud service — ruled
  out by the owner's VPS decision.

## User Stories

1. As the store owner, I want the whole application (storefront, admin, API, and its supporting
   infrastructure) packaged so a single `docker compose up` on a VPS I control brings up a working
   store, so I'm not dependent on a specific developer's laptop or a managed platform I don't
   control.
2. As the developer maintaining this store, I want uploaded product images and the database to
   survive a redeploy, so shipping a new version doesn't wipe out the owner's catalog photos or
   data.
3. As the store owner, I want HTTPS on my domain, my admin subdomain, and my API subdomain without
   manually managing certificates, so the site is secure by default with minimal ongoing effort.

## Technical Design

### Design Decision 1 — Docker build context is the monorepo root, not each `apps/*` folder

All three apps depend on hoisted `node_modules` from the unified npm-workspaces lockfile
(`package-lock.json` at the repo root) and on the three `packages/*` workspace packages
(`@store/eslint-config`, `@store/orval-config`, `@store/typescript-config`). A Dockerfile that only
sees its own `apps/<name>` subtree as build context cannot run `npm ci` correctly. Every Dockerfile
in this plan is therefore built with the **repo root** as context:

```
docker build -f apps/store-api/Dockerfile -t store-api .
docker build -f apps/store-client/Dockerfile -t store-client .
docker build -f apps/store-admin/Dockerfile -t store-admin .
```

— exactly what `docker-compose.prod.yml`'s `build: { context: ., dockerfile: apps/<name>/Dockerfile }`
does per service. This is why `.dockerignore` is a single root-level file (Docker only honors one
`.dockerignore`, at the build context root) rather than one per app.

### Design Decision 2 — `store-api` Dockerfile: base image, Prisma-on-Alpine, non-root, uploads path

- **Base:** `node:20-alpine` throughout every stage (matches CI's `node-version: 20`; using the
  **same** base for the build and runtime stages — not cross-compiling from a different base —
  is what lets Prisma's `generate` step (run once, at build time) produce the correct
  `linux-musl`-family engine binary for the exact runtime the container will actually use).
- **Alpine + Prisma + `sharp` risk:** Alpine ships without OpenSSL by default; Prisma's musl query
  engine needs it at both generate-time and runtime, and `sharp` (already a `store-api` dependency,
  used by the TASK-093 image pre-optimization pipeline) needs its musl-prebuilt binary resolved
  during `npm ci` on the same platform it will run on. Both stages therefore run
  `apk add --no-cache openssl libc6-compat` before `npm ci`/`prisma generate`. This repo's Prisma
  setup (`prisma.config.ts`) uses the `@prisma/adapter-pg` **driver adapter** — confirmed (Prisma
  docs) that driver adapters do **not** remove the native query engine or the platform-specific
  binary requirement, so this mitigation is still needed, not optional.
- **Stages:** `deps` (copy every workspace `package.json` — root, `apps/*/package.json`,
  `packages/*/package.json` — preserving directory structure, then `npm ci`) → `build` (copy full
  source respecting `.dockerignore`, `npx prisma generate --schema=apps/store-api/prisma/schema.prisma`
  matching the exact command CI already runs, then `npm run build -w apps/store-api`) → `runner`
  (non-root, minimal).
- **Image-size tradeoff, accepted for v1:** because this is one unified npm-workspaces lockfile,
  the hoisted root `node_modules` installed for `store-api` also contains dependency trees pulled
  in by `store-client`/`store-admin` (Next.js, React, etc. are not referenced by `store-api`'s own
  code, but a plain `npm ci` at the workspace root cannot cleanly install "only this workspace's
  dependency subset" the way `pnpm`/Turborepo pruning can). `npm prune --omit=dev` after the build
  step removes **devDependencies** at least; the residual cross-app production-dependency bloat is
  accepted as a v1 tradeoff — a single small-store VPS is not size-constrained enough for this to
  matter today. Noted as a possible future improvement (Notes), not a blocking criterion.
- **Working directory:** the final `runner` stage's `WORKDIR` is `/app/apps/store-api` (not
  `/app`) — this mirrors local/CI behavior exactly: an `npm run start:dev -w apps/store-api`
  invocation already runs with `process.cwd()` equal to `apps/store-api`, which is why
  `UPLOAD_DEST`'s documented default (`./uploads`, resolved relative to CWD in
  `local-disk-storage.service.ts`) lands at `apps/store-api/uploads` today. Node's module
  resolution walks up parent directories looking for `node_modules`, so `require()` calls from
  `/app/apps/store-api` correctly resolve up to a hoisted `/app/node_modules` copied alongside it —
  no symlink trickery needed.
- **CMD:** `node dist/main.js` (matches the existing `start:prod` script, `dist/` is `nest build`'s
  output directory relative to `apps/store-api`).
- **Copied into the runner stage:** pruned `node_modules` (hoisted, from `/app`), `dist/`,
  `package.json`, `prisma/schema.prisma` **and** `prisma.config.ts` (kept — TASK-271's deploy step
  runs `prisma db push` **inside this same image**, which needs the schema file and Prisma's config
  present at runtime, not just the already-generated client).
- **Non-root user:** `addgroup -S nodejs && adduser -S nestjs -G nodejs`; the uploads directory
  (`/app/apps/store-api/uploads`) is created and `chown`'d to that user **before** the final
  `USER nestjs` switch, since the app writes new files there at runtime.
- **`EXPOSE`/listen port:** `main.ts` defaults `PORT` to `3001` (confirmed by reading `main.ts` —
  note this is the actual runtime default; `apps/store-api/.env.example`'s own comment says `4000`,
  a pre-existing, harmless documentation drift this plan does not attempt to fix, see Notes).
  `docker-compose.prod.yml` sets `PORT` explicitly via `.env.production` regardless, so the
  default only matters if that var is left unset.
- **Healthcheck:** `HEALTHCHECK CMD wget -qO- http://localhost:${PORT}/health || exit 1` — reuses
  the existing, already-unauthenticated `GET /health` route (`app.controller.ts`), which
  `app.setGlobalPrefix('api', { exclude: ['health'] })` deliberately keeps outside the `/api`
  prefix.

### Design Decision 3 — `store-client`/`store-admin` Dockerfiles: `output: "standalone"` + `outputFileTracingRoot`

Confirmed against Next.js's own documentation (`output`/File Tracing reference):

- `output: "standalone"` produces a `.next/standalone` folder containing a minimal `server.js` plus
  only the `node_modules` files actually traced as needed — but **while tracing in monorepo
  setups, the project directory (`apps/store-client`) is used as the tracing root by default, and
  files outside it are excluded.** Both `next.config.ts` files therefore add:

  ```ts
  outputFileTracingRoot: path.join(__dirname, "../../"),
  ```

  (two levels up from `apps/store-client`/`apps/store-admin` → the monorepo root), exactly the
  documented monorepo pattern, so the trace correctly reaches the hoisted root `node_modules` and
  the `packages/*` workspace packages both apps depend on at build time.

- **Consequence for the Dockerfile's final `COPY`/`CMD`:** tracing from the monorepo root means
  `.next/standalone` is emitted **nested** at `.next/standalone/apps/store-client/` (mirroring the
  traced directory structure), with a hoisted `.next/standalone/node_modules` at the traced root
  alongside it — **not** a flat `.next/standalone/server.js`. The runner stage's `CMD` is therefore
  `node apps/store-client/server.js` (equivalently `apps/store-admin/server.js`), with `WORKDIR`
  set to the copied standalone root. **The build agent implementing this task should verify the
  exact emitted folder shape against the installed Next.js version's docs (Next 16.2.4 per
  `package.json`) before finalizing the `COPY`/`CMD` paths** — this is the plan's single most
  novel piece of Docker plumbing and is worth a final confirmation pass at implementation time,
  not just trusted from this plan.
- Standalone mode **deliberately excludes** the `public/` folder and `.next/static` (per Next's own
  docs: these "should ideally be handled by a CDN instead"). The Dockerfile must `COPY` them
  manually into `standalone/apps/store-client/public` and
  `standalone/apps/store-client/.next/static` — omitting this step is the single most common
  "standalone build looks fine but every static asset 404s" mistake with this feature.
- **Build-time env (build-args), not runtime env:** `NEXT_PUBLIC_*` vars are baked into the
  JavaScript bundle at `next build` time, not read at container start. Each Dockerfile declares
  `ARG`s for every `NEXT_PUBLIC_*` var the app reads (`store-client`:
  `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CURRENCY`,
  `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`,
  **and** `NEXT_PUBLIC_UMAMI_SRC`/`NEXT_PUBLIC_UMAMI_WEBSITE_ID` — this plan only needs to know
  these two _names_ exist, per TASK-261's contract, to pass them through as build-args; it does not
  implement anything with them; `store-admin`: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`,
  `NEXT_PUBLIC_ADMIN_URL`, the three Sentry vars), re-exposes each as an `ENV` of the same name for
  the `next build` step to read, and `docker-compose.prod.yml` passes them via `build.args:` sourced
  from `.env.production`.
- **Critical, named risk — `NEXT_PUBLIC_API_URL` is baked, not runtime-configurable:**
  `apps/store-client/next.config.ts` derives `next/image`'s whitelisted remote origin _from_
  `NEXT_PUBLIC_API_URL` at build time (`new URL(process.env.NEXT_PUBLIC_API_URL ?? ...)` — read
  directly from the existing file). This means **a single built image is tied to one API domain**:
  the same `store-client` image cannot be "promoted" from staging to production by just changing a
  runtime env var — a production deploy needs its **own** image, built with production's
  `NEXT_PUBLIC_API_URL` as a build-arg. This directly shapes TASK-271/plan 124's design (each
  environment's pipeline builds and tags its own image) and must be spelled out in
  `.env.production.example`'s comments so a future maintainer doesn't assume runtime overrides work.
- **Healthcheck:** `wget -qO- http://localhost:3000/ || exit 1` (root path; the standalone server
  responds to any valid route, no dedicated health endpoint exists in Next.js).
- Non-root user, same pattern as `store-api`.

### Design Decision 4 — `docker-compose.prod.yml` topology

Services (all on one bridge network, mirroring the dev compose's `store_network` shape):

| Service        | Source                                                                       | Notes                                                                                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `postgres`     | `postgres:17-alpine` (same pinned tag as dev)                                | Named volume `postgres_prod_data`; healthcheck identical to dev                                                                                                                                               |
| `redis`        | `redis:7-alpine`                                                             | Named volume `redis_prod_data`; `REDIS_PASSWORD` **required** (not optional as in dev)                                                                                                                        |
| `meilisearch`  | `getmeili/meilisearch:v1.10`                                                 | Named volume `meili_prod_data`; `MEILI_ENV=production` (Meili itself then **requires** a real ≥16-char master key, already enforced by Meili)                                                                 |
| `umami`        | mirrors TASK-261's dev service (Design Decision 1 of plan 125)               | Same Postgres-image variant, own `umami` DB in this compose's `postgres` service; this compose only _references_ the shared env-var names, creating no storefront-facing code                                 |
| `store-api`    | built from `apps/store-api/Dockerfile`                                       | `depends_on`: postgres/redis/meilisearch healthy; named volume `uploads_data:/app/apps/store-api/uploads` (see Design Decision 5); healthcheck via `/health`                                                  |
| `store-client` | built from `apps/store-client/Dockerfile`, build-args from `.env.production` | `depends_on: store-api` (not health-gated — the storefront should still boot and show a degraded state if the API is briefly down, not refuse to start)                                                       |
| `store-admin`  | built from `apps/store-admin/Dockerfile`, build-args from `.env.production`  | Same as `store-client`                                                                                                                                                                                        |
| `caddy`        | `caddy:2-alpine`                                                             | Mounts the repo's `Caddyfile`; named volumes `caddy_data`/`caddy_config` (persist ACME certs across redeploy — losing these on every redeploy would hit Let's Encrypt's rate limits); ports `80:80`/`443:443` |

- **`REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` vs `REDIS_URL` — reconciled here.** The root dev
  `.env.example` documents a `REDIS_URL` var that, on inspection, **nothing in `store-api` actually
  reads** (`apps/store-api/src/config/env.validation.ts` only validates `REDIS_HOST`/`REDIS_PORT`/
  `REDIS_PASSWORD`/`REDIS_CACHE_TTL_SECONDS`) — it appears to be a vestigial/aspirational var in
  that dev file. `docker-compose.prod.yml` and `.env.production.example` standardize on
  `REDIS_HOST=redis`, `REDIS_PORT=6379`, `REDIS_PASSWORD=<strong password>` — the contract
  `env.validation.ts` actually implements — and do **not** introduce a `REDIS_URL` var. (The dev
  root `.env.example`'s stale `REDIS_URL` is left untouched; it's a separate file this plan doesn't
  own, called out as a small drift worth a future cleanup — see Notes.)
- No service in this compose file runs a database migration command — that's exclusively a
  _deploy-time_ step (TASK-271), keeping this file a pure "here is how the images run together"
  artifact.

### Design Decision 5 — uploads volume

`LocalDiskStorageService` (`apps/store-api/src/storage/local-disk-storage.service.ts`) resolves
`UPLOAD_DEST` (default `./uploads`) relative to `process.cwd()` and writes product images under
`<UPLOAD_DEST>/products/`; `AppModule`'s `ServeStaticModule` serves that same root at `/uploads`.
Per Design Decision 2, the runtime `WORKDIR` is `/app/apps/store-api`, so with the default
`UPLOAD_DEST`, files land at `/app/apps/store-api/uploads`. `docker-compose.prod.yml` mounts a
named volume there:

```
volumes:
  - uploads_data:/app/apps/store-api/uploads
```

so a redeploy (new image, same volume) never loses previously uploaded product photos — the exact
requirement the handoff calls out ("вони мають переживати редеплой").

### Design Decision 6 — Caddyfile

Three site blocks, using Caddy's built-in `{$DOMAIN}` env-var substitution (sourced from
`.env.production`'s `DOMAIN=` var) so the file itself needs no per-environment templating:

- `{$DOMAIN}` → `reverse_proxy store-client:3000`
- `admin.{$DOMAIN}` → `reverse_proxy store-admin:3002` (matches `store-admin`'s own `start -p
3002` script)
- `api.{$DOMAIN}` → `reverse_proxy store-api:{$PORT}` (matches `store-api`'s configured `PORT`)

Caddy automatically provisions and renews Let's Encrypt certificates for all three, provided DNS
A-records point at the VPS and ports 80/443 are reachable — no manual certbot/nginx config, matching
the handoff's explicit preference ("Caddy — автоматичний HTTPS, найпростіший для соло-власника").

### Design Decision 7 — `.env.production.example`

One consolidated file at the repo root (mirroring how the existing root `.env.example` already
feeds the dev `docker-compose.yml`, just a superset covering all three apps + every service),
covering:

- Infra: `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`, `REDIS_HOST`/`REDIS_PORT`/
  `REDIS_PASSWORD` (per Design Decision 4's reconciliation), `MEILI_MASTER_KEY`/`MEILI_ENV`,
  `UMAMI_APP_SECRET`, `DOMAIN` (for Caddy).
- `store-api` runtime: `NODE_ENV=production`, `PORT`, `DATABASE_URL`, `JWT_SECRET`/
  `JWT_REFRESH_SECRET`/`JWT_EXPIRATION`/`JWT_REFRESH_EXPIRATION`, `CORS_ORIGINS` (the real
  storefront + admin domains), `MAIL_ENABLED`/`SMTP_*`, `NP_API_KEY`/`NP_SENDER_CITY_REF`,
  `MEILI_HOST`, `SENTRY_DSN`, `UMAMI_ORIGIN` (per plan 125's Design Decision 5), and the two
  **prod-only vars this plan adds documentation for**: `PUBLIC_BASE_URL` (absolute origin used to
  build uploaded-image URLs — must be the real `api.<domain>` origin in production, or served
  images link back to `localhost`) and `CSRF_SECRET` (`CsrfService` already warns at boot when this
  is unset in production — a real, non-default 32+ character value is required here).
- `store-client`/`store-admin` build-args: every `NEXT_PUBLIC_*` var from Design Decision 3,
  including the two Umami keys (values, not just names — this file is what an operator actually
  fills in), plus `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` for source-map upload.
- Every key carries an inline comment following this repo's existing `.env.example` convention
  (purpose, default, "leave empty to disable X" where applicable).

## API Contract

No changes. This plan adds no endpoint, DTO, or schema field — it packages the existing API
unchanged. **No Orval regen.**

## Tasks

### TASK-270-A: `apps/store-api/Dockerfile` + root `.dockerignore`

**Type:** feat
**Scope:** store-api / shared
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-api/Dockerfile` implements the `deps` → `build` → `runner` stages exactly per
      Design Decision 2 (Alpine + OpenSSL/`libc6-compat`, `prisma generate` at build time,
      `npm prune --omit=dev`, `WORKDIR /app/apps/store-api`, non-root `nestjs` user, `HEALTHCHECK`
      on `/health`, `CMD ["node", "dist/main.js"]`)
- [ ] Root `.dockerignore` excludes `node_modules`, `.next`, `dist`, `coverage`, `.git`, `*.env`
      (all envs, never bake secrets into a build context), `apps/store-*/uploads` (local dev
      uploads should not leak into an image layer)
- [ ] Local-verifiable: `docker build -f apps/store-api/Dockerfile -t store-api-test .` (context =
      repo root) succeeds; `docker run --rm store-api-test node -e "require('.prisma/client')"` (or
      equivalent) confirms the generated Prisma client is present and loadable inside the final
      image without a dev-only dependency
- [ ] Local-verifiable: `docker run` the built image against a locally reachable Postgres (e.g. the
      existing dev `docker compose up -d postgres` on the default network) with a valid
      `DATABASE_URL`/`JWT_SECRET`/`NODE_ENV=production` and confirm `curl http://localhost:$PORT/health`
      returns 200
- [ ] Image runs as a non-root user (`docker run --rm store-api-test whoami` does not print `root`)

**Files to create/modify:**

- `apps/store-api/Dockerfile` — new
- `.dockerignore` — new (root)

---

### TASK-270-B: `apps/store-client/Dockerfile` + standalone output config

**Type:** feat
**Scope:** store-client
**Complexity:** L (4-8h — the standalone/monorepo-tracing plumbing from Design Decision 3 is the
most novel part of this whole plan and should be budgeted generously)
**TDD Required:** No
**Depends on:** TASK-270-A (reuses the same `.dockerignore`; not a hard technical dependency, just
convenient sequencing)

**Acceptance Criteria:**

- [ ] `apps/store-client/next.config.ts` gains `output: "standalone"` and
      `outputFileTracingRoot: path.join(__dirname, "../../")`, preserving the existing
      `images.remotePatterns`/`env`/Sentry-wrap config unchanged
- [ ] `apps/store-client/Dockerfile` implements the multi-stage build per Design Decision 3: build
      stage accepts every `NEXT_PUBLIC_*` `ARG` listed there, runs `next build`; runner stage copies
      `.next/standalone` (nested path — verified against the actual emitted folder shape at
      implementation time, not assumed), plus **manually** copies `public/` and `.next/static` into
      their expected standalone subfolders (the most common standalone-mode mistake — explicitly
      checked here)
- [ ] Non-root user; `HEALTHCHECK` on `/`; `CMD` points at the correct nested `server.js` path
- [ ] Local-verifiable: `docker build -f apps/store-client/Dockerfile --build-arg
NEXT_PUBLIC_API_URL=http://localhost:3001 --build-arg NEXT_PUBLIC_APP_URL=http://localhost:3000
-t store-client-test .` succeeds
- [ ] Local-verifiable: `docker run -p 3000:3000 store-client-test` serves the homepage (`curl
http://localhost:3000/` returns 200 HTML) **and** at least one static asset under `/_next/static/`
      resolves (200, not 404) — the explicit regression check for the manual-copy step above
- [ ] `npm run typecheck`/`build` still clean for store-client outside Docker (confirms the config
      change doesn't regress the plain `next build`/dev workflow)

**Files to create/modify:**

- `apps/store-client/next.config.ts` — `output`/`outputFileTracingRoot`
- `apps/store-client/Dockerfile` — new

---

### TASK-270-C: `apps/store-admin/Dockerfile` + standalone output config

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h — same pattern as B, smaller app, no `next/image` remote-pattern nuance)
**TDD Required:** No
**Depends on:** TASK-270-B (mirrors its exact pattern; sequenced after so any lesson learned from
B's standalone-path verification carries over directly)

**Acceptance Criteria:**

- [ ] `apps/store-admin/next.config.ts` gains `output: "standalone"` +
      `outputFileTracingRoot: path.join(__dirname, "../../")`, preserving the existing `env`/
      Sentry-wrap config unchanged
- [ ] `apps/store-admin/Dockerfile` mirrors TASK-270-B's structure (its own `ARG`/`ENV` set:
      `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_ADMIN_URL`, the three Sentry vars);
      `CMD` at port `3002` (matches the existing `start -p 3002` script)
- [ ] Local-verifiable: `docker build`/`docker run` smoke identical in shape to TASK-270-B's (homepage
      200 + static asset 200); admin login page (`/login` or equivalent) renders
- [ ] `npm run typecheck`/`build` still clean for store-admin outside Docker

**Files to create/modify:**

- `apps/store-admin/next.config.ts` — `output`/`outputFileTracingRoot`
- `apps/store-admin/Dockerfile` — new

---

### TASK-270-D: `docker-compose.prod.yml` + `Caddyfile`

**Type:** feat
**Scope:** shared
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-270-A, TASK-270-B, TASK-270-C

**Acceptance Criteria:**

- [ ] `docker-compose.prod.yml` implements the full topology from Design Decision 4 (9 services:
      postgres, redis, meilisearch, umami, store-api, store-client, store-admin, caddy — 8 listed,
      recount: postgres/redis/meilisearch/umami/store-api/store-client/store-admin/caddy = 8),
      every service healthchecked, named volumes per Design Decision 4/5
      (`postgres_prod_data`/`redis_prod_data`/`meili_prod_data`/`uploads_data`/`caddy_data`/
      `caddy_config`)
- [ ] `Caddyfile` implements the three reverse-proxy blocks from Design Decision 6
- [ ] `store-client`/`store-admin` services pass their `NEXT_PUBLIC_*` build-args explicitly under
      `build.args:`, sourced from `.env.production` variable interpolation
- [ ] Local-verifiable: `docker compose -f docker-compose.prod.yml config` produces valid,
      fully-interpolated YAML with no errors (using a locally-filled copy of
      `.env.production.example`, not real secrets)
- [ ] Local-verifiable: `docker compose -f docker-compose.prod.yml up -d postgres redis meilisearch
  umami store-api` (the non-Next.js-build-arg-dependent subset, skipping Caddy's TLS
      requirement) boots cleanly on this machine; `curl http://localhost:$PORT/health` (mapped
      port) returns 200; `docker compose -f docker-compose.prod.yml down -v` cleans up fully
- [ ] `docker compose -f docker-compose.prod.yml up -d --build` (full stack, all 8 services,
      `DOMAIN=localhost` or similar in a local `.env.production` copy) boots without a crash-loop on
      any service — Caddy's automatic HTTPS for `localhost`/an unresolvable fake domain is expected
      to either use Caddy's internal CA (self-signed, browser-untrusted but functional over HTTPS)
      or fail to obtain a public cert; either outcome is acceptable for this local check as long as
      the container itself stays up and the three app containers underneath it are independently
      reachable on their mapped ports

**Files to create/modify:**

- `docker-compose.prod.yml` — new
- `Caddyfile` — new

---

### TASK-270-E: `.env.production.example`

**Type:** docs
**Scope:** shared
**Complexity:** M (2-4h — consolidating ~40 keys across 3 apps + infra with correct comments)
**TDD Required:** No
**Depends on:** TASK-270-D (needs the final compose file's exact var names to cross-check against)

**Acceptance Criteria:**

- [ ] `.env.production.example` (repo root, new) contains every key enumerated in Design Decision
      7, each with an inline comment (purpose + any default/format constraint), grouped under the
      same `# ─── Section ──` heading convention already used in `apps/store-api/.env.example`
- [ ] Explicitly includes `PUBLIC_BASE_URL` and `CSRF_SECRET` with comments flagging both as
      **required** in production (unlike their optional status in the dev-facing
      `apps/store-api/.env.example`)
- [ ] Explicitly includes a comment on `NEXT_PUBLIC_API_URL` (and the other two apps' equivalent
      vars) warning that changing it requires **rebuilding the image**, not just restarting the
      container (per Design Decision 3's baked-build-arg risk)
- [ ] Cross-checked line-by-line against `docker-compose.prod.yml`'s actual `${VAR}`/`${VAR:-default}`
      references and each Dockerfile's declared `ARG`s — no var referenced by either is missing from
      this file, and no key in this file goes unused (a stale-key check)
- [ ] `docker compose -f docker-compose.prod.yml config` (from TASK-270-D) re-run against a copy of
      this file renamed to `.env.production` stays error-free

**Files to create/modify:**

- `.env.production.example` — new

---

### TASK-270-F: Local verification pass + manual-QA handoff

**Type:** test
**Scope:** shared
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-270-D, TASK-270-E

**Acceptance Criteria (all locally verifiable, no VPS needed):**

- [ ] All three `docker build` commands (TASK-270-A/B/C) re-run clean from a fresh `git clone`-style
      checkout (no stray local `node_modules`/`.next` polluting the build context — confirms
      `.dockerignore` is sufficient)
- [ ] `docker compose -f docker-compose.prod.yml config` clean against `.env.production.example`
- [ ] Full local `docker compose -f docker-compose.prod.yml up -d --build` smoke: `curl` 200 from
      `store-api`'s `/health`, `store-client`'s `/`, and `store-admin`'s `/` on their mapped ports
      (bypassing Caddy, hitting each container's own port directly — Caddy's real-domain HTTPS path
      is the manual-QA item below)
- [ ] `npm run build`/`lint`/`typecheck` still clean for all three workspaces outside Docker
      (confirms none of this plan's `next.config.ts`/Dockerfile changes regressed the existing dev
      workflow or CI)

**Acceptance Criteria (manual-qa — needs a real VPS + DNS the owner has not provisioned yet;
append to `docs/manual-qa-pending.md`, not a blocker for marking this plan's code done):**

- [ ] Clean-VM smoke exactly per the handoff's own bar: `docker compose -f docker-compose.prod.yml
  up` on a fresh VPS brings up a working store; walk the homepage, log into the admin panel,
      and create one order end-to-end
- [ ] Caddy successfully obtains real Let's Encrypt certificates for all three real domains once
      DNS is pointed at the VPS
- [ ] A redeploy (`docker compose pull && up -d` with no volume removal) confirms uploaded product
      images and the database survive — the specific risk Design Decision 5 exists to prevent

**Files to create/modify:**

- `docs/manual-qa-pending.md` — one new "Хвиля 2 — Prod packaging" entry with the three manual bullets above

## Dependencies & Sequencing

- **Internal:** A (independent) → B → C (B/C share the standalone pattern, sequenced so lessons
  from B carry into C) → D (needs all three Dockerfiles to exist) → E (needs D's final var names)
  → F (needs D+E). A could technically run in parallel with B/C since they touch entirely different
  files, but is listed first since it's this plan's smallest, most self-contained task and a good
  first PR to land the shared `.dockerignore`.
- **External — feeds TASK-271 (plan 124) directly:** the staging deploy pipeline builds and pushes
  the exact three images this plan defines; TASK-271 cannot meaningfully start its own build/push
  steps until at least TASK-270-A/B/C/D/E are done (its own plan states this dependency explicitly).
- **File-ownership contract with TASK-261 (plan 125) and TASK-271 (plan 124), all three running in
  parallel worktrees:** this plan owns `apps/*/Dockerfile`, `.dockerignore`,
  `apps/store-client/next.config.ts` + `apps/store-admin/next.config.ts` (the `output`/
  `outputFileTracingRoot` addition only — TASK-261 never touches either file), `docker-compose.prod.yml`,
  `Caddyfile`, `.env.production.example`. It does **not** touch `docker-compose.yml` (dev, TASK-261's
  file), any `apps/store-client/src/**` application code (TASK-261's), `apps/store-api/src/**`
  (TASK-261-D's CSP change or TASK-271's workflow file), or `.github/workflows/*` (TASK-271's). No
  file is shared with either sibling plan.

## Risks & Mitigations

| Risk                                                                                                                                                                           | Mitigation                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `outputFileTracingRoot`'s emitted nested folder shape is assumed rather than empirically verified in this planning pass                                                        | TASK-270-B's acceptance criteria explicitly require confirming the actual emitted path against the installed Next 16.2.4 docs before finalizing `COPY`/`CMD`, plus a live static-asset-200 check as a concrete regression guard              |
| Alpine + Prisma driver-adapter + `sharp` native-binary interplay is a known class of Docker gotcha even though this specific combination hasn't been built before in this repo | Same-base multi-stage (no cross-compiling), explicit `openssl`/`libc6-compat` install in both build and runtime stages, and a concrete acceptance criterion that loads the generated Prisma client inside the built image                    |
| `NEXT_PUBLIC_API_URL` baked at build time means staging and production **cannot share the same built image** — breaks the usual "build once, promote everywhere" CI/CD pattern | Accepted, explicitly documented (Design Decision 3) — each environment's own pipeline stage builds and tags its own image; `.env.production.example`'s comments call this out so a future maintainer doesn't assume a runtime override works |
| `apps/store-api/.env.example`'s documented `PORT=4000` default doesn't match `main.ts`'s actual `3001` default                                                                 | Pre-existing, unrelated file this plan doesn't own; `docker-compose.prod.yml` always sets `PORT` explicitly regardless, so the drift is cosmetic for this plan's purposes — flagged in Notes as a tiny, separate future cleanup              |
| Image-size bloat from the unified npm-workspaces lockfile hoisting all three apps' dependencies into `store-api`'s runtime image                                               | Accepted v1 tradeoff (Design Decision 2) — `npm prune --omit=dev` removes devDependencies at minimum; a VPS-hosted small store is not size-constrained enough for the residual bloat to matter today                                         |
| Caddy losing its ACME certificate cache on every redeploy would repeatedly hit Let's Encrypt's rate limits                                                                     | `caddy_data`/`caddy_config` named volumes persist certs across `docker compose up -d` (no volume removal on a normal redeploy)                                                                                                               |
| No VPS/DNS exists yet to fully exercise the clean-VM smoke test                                                                                                                | Explicitly split into a manual-qa bucket per the owner's own instruction — not a blocker for this plan's code being considered done; recorded in `docs/manual-qa-pending.md` for whenever the owner provisions the server                    |

## Notes

- This plan intentionally runs **no** database migration command anywhere — `prisma db push`
  (staging, TASK-271) and the future squashed-baseline `migrate deploy` (production, TASK-272) are
  both deploy-time concerns, not packaging concerns; keeping them out of the image/compose layer
  means the same built image works under either strategy.
- The `apps/store-api/.env.example` `PORT=4000` vs. `main.ts`'s actual `3001` default drift, and
  the dev root `.env.example`'s unused `REDIS_URL` var, are both small, pre-existing inconsistencies
  discovered while researching this plan — noted here rather than silently fixed, since neither file
  is otherwise in scope for this plan; a trivial follow-up chore either could clean up separately.
- A future, more disciplined dependency-pruning approach (migrating to pnpm workspaces, or a
  Turborepo `prune` step) would shrink `store-api`'s image meaningfully — not pursued here to keep
  this plan's blast radius to "package what already exists," not "change the package manager."

## Follow-up із handoff-seo §SEO-9

`docs/handoff-seo.md` (2026-07-07) flags a Caddy hygiene item that overlaps this plan's
`Caddyfile` (Design Decision 6): **301 redirects for `www.<domain>` → apex, `http://` →
`https://`, and no trailing-slash duplicates**. This plan's current `Caddyfile` (three
`{$DOMAIN}` / `admin.{$DOMAIN}` / `api.{$DOMAIN}` reverse-proxy blocks) does not yet include an
explicit `www` block or a trailing-slash `strip_prefix`/redirect rule — Caddy's automatic HTTPS
already covers `http→https` for any site block it manages, but `www`→apex and trailing-slash
normalization need their own explicit blocks. Action: verify/add these when the `Caddyfile` is
next touched (e.g. alongside TASK-271/TASK-272 deploy work), not blocking this plan's own
acceptance criteria. Tracked at the BACKLOG level under TASK-272's scope note (Етап 7, TASK-285's
sibling item SEO-9 is folded into TASK-270/272 per the handoff, not a separate task).
