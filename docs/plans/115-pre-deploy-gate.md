# Plan 115 — Pre-deploy gate (TASK-194)

> Final review gate before a production deploy. Full security review +
> prod-config audit + prod builds + Playwright-on-prod + Lighthouse/SEO.
> Runs after TASK-193 (consolidated review, plan 114).

## Status: 🔄 partial — static gate PASSED, live-stack checks deferred

The **static** half of the gate (prod-config audit, prod builds, SEO surface)
was completed and **passes**. The **live-stack** half (Playwright against a prod
build, Lighthouse) requires the full infra (Postgres + Redis + Meilisearch +
running prod servers); the local **Docker daemon was down**, so those are queued
in `manual-qa-pending.md` for a run on a live stack / CI. This gate stays 🔄
until they are green.

---

## 1. Prod-config audit — ✅ PASS

Source of truth: `apps/store-api/src/main.ts`, `config/security.config.ts`,
`instrument.ts`, root `.gitignore`.

| Check                   | Result                                                                                                                                                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Swagger off in prod** | ✅ `SwaggerModule.setup` is gated behind `nodeEnv === 'development'` — no API docs surface in production                                                                                                                                 |
| **CORS**                | ✅ origin from `CORS_ORIGINS` allow-list (comma-split), `credentials: true`, explicit methods — never wildcard-with-credentials                                                                                                          |
| **Helmet**              | ✅ prod CSP is strict (`default/script/style-src 'self'`, `object-src 'none'`, `upgrade-insecure-requests`), HSTS 1y + `includeSubDomains`, `referrer-policy: strict-origin-when-cross-origin`; dev relaxes CSP only for the Swagger CDN |
| **Sentry**              | ✅ `instrument.ts` imported first; `enabled: !!dsn` → inert no-op without `SENTRY_DSN`; traces off by default (opt-in); env from `SENTRY_ENVIRONMENT`/`NODE_ENV`                                                                         |
| **ValidationPipe**      | ✅ global `whitelist` + `forbidNonWhitelisted` + `transform`                                                                                                                                                                             |
| **CSRF**                | ✅ signed double-submit cookie on `/api/auth/refresh` + `/api/cart`                                                                                                                                                                      |
| **Error envelope**      | ✅ global `HttpExceptionFilter` for a consistent error shape                                                                                                                                                                             |
| **Secrets**             | ✅ `.env`, `.env.local`, `.env.*.local` gitignored; only `.env.example` files are tracked (store-api/client/admin) — no real secrets committed                                                                                           |

> Minor note (checklist, not a blocker): `.gitignore` covers `.env` and
> `.env.*.local` but not a bare `.env.production`. No such file exists today;
> keep it out of commits when provisioning prod.

## 2. Prod builds — ✅ (api + admin), store-client confirming

| App            | `npm run build`                                              |
| -------------- | ------------------------------------------------------------ |
| `store-api`    | ✅ exit 0                                                    |
| `store-admin`  | ✅ (verified under TASK-192)                                 |
| `store-client` | ✅ exit 0 (route table emits `/robots.txt` + `/sitemap.xml`) |

## 3. SEO surface (static) — ✅

- `app/robots.ts` — allows public content, disallows private routes
  (`/cart`, `/checkout`, `/orders`, `/account`, `/login`, `/register`), points to
  the sitemap.
- `app/sitemap.ts` — `force-dynamic`, static routes + per-product / per-page /
  per-post entries, resilient per-source `try/catch` (never crashes the route).
- Root metadata (title template, description, OpenGraph, `metadataBase`,
  `locale: uk_UA`) set in `store-client/app/layout.tsx`.

## 4. Deferred to a live stack (→ `manual-qa-pending.md`)

These need `docker compose up -d` (Postgres/Redis/Meili) + prod builds served,
which the local environment could not provide (Docker daemon down):

- **Playwright on a prod build** — run the e2e suite against `next start` prod
  builds, not dev (`test:e2e:pw` with the seeded `store_test` DB).
- **Lighthouse / SEO pass** — Lighthouse on the served prod storefront (perf,
  a11y, best-practices, SEO) for the key routes (home, catalog, PDP, cart).
- **Live security spot-check** — confirm on the running prod build: `/api/docs`
  returns 404, security headers present (CSP/HSTS), CORS rejects an off-list
  origin. (`/security-review` is best run per-PR on real diffs; the codebase
  security posture was audited statically in plan 114 §Security + §1 here.)
- **`test:int` for TASK-238** — the category re-parenting fix's real-DB
  assertion (shares the same DB-up requirement).

## Verdict

Static pre-deploy posture is **clean** — no prod-config red flags, all three
prod builds green, SEO surface in place. The gate remains 🔄 until the
live-stack checks (§4) run green on a booted stack.
