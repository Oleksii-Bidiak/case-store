# Plan 115 — Pre-deploy gate (TASK-194)

> Final review gate before a production deploy. Full security review +
> prod-config audit + prod builds + Playwright-on-prod + Lighthouse/SEO.
> Runs after TASK-193 (consolidated review, plan 114).

## Status: ✅ PASSED — static + live-stack green (Lighthouse perf pass deferred)

Both halves ran green on a booted stack (Postgres + Redis + Meilisearch):

- **Static** — prod-config audit clean, all three prod builds green, SEO surface
  in place.
- **Live-stack** — full integration suite **32/32**, the TASK-238 fix verified
  **11/11** on real Postgres, Playwright e2e **4/4**, and a prod-mode security
  spot-check confirming Swagger is 404 and the strict CSP/HSTS headers are
  actually served.

The single remaining item is a **Lighthouse perf/SEO score** (needs `npx
lighthouse` + a served prod storefront + Chrome) — a non-blocking quality pass
left in `manual-qa-pending.md`. The SEO _surface_ (robots/sitemap/metadata) is
verified statically below.

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

## 2. Prod builds — ✅ all three green

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

## 4. Live-stack results (booted stack: Postgres + Redis + Meilisearch) — ✅

Ran after `docker compose up -d`; `store_test` schema pushed and in sync.

| Check                                                                  | Result                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Integration suite** (`test:int`, real DB)                            | ✅ 32/32 — cache/Redis, cart, dashboard raw-SQL, bestselling, rollup, category traversal                                                                                                                                                                                                              |
| **TASK-238 fix** (`category.repository.int-spec`)                      | ✅ 11/11 on real Postgres — incl. the 4 new `findDescendantIds` cases that threw on the old SQL                                                                                                                                                                                                       |
| **Playwright e2e** (`test:e2e:pw`, live stack on `store_test`)         | ✅ 4/4 — auth-flow (login, open checkout) + cart-flow (guest add, unauth checkout→login)                                                                                                                                                                                                              |
| **Prod security spot-check** (`NODE_ENV=production`, `node dist/main`) | ✅ `/api/docs` → 404 (Swagger off); served headers: strict CSP (`default-src 'self'`, `object-src 'none'`, `upgrade-insecure-requests`), HSTS `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, referrer-policy strict-origin; `/health` → 200 |

> Note: the Playwright scaffold boots the storefront/API via the **dev** servers
> (`webServer` uses `start:dev`/`next dev`), so this is a functional e2e on the
> live stack rather than against `next start` prod bundles. A true prod-bundle
> Playwright run would need a webServer swap — tracked as a follow-up, not a
> release blocker (the prod bundles themselves build clean, §2).

### Still deferred (non-blocking)

- **Lighthouse perf/SEO score** — needs `npx lighthouse` (not installed locally)
  - a served prod storefront + Chrome. Left in `manual-qa-pending.md` as a
    quality pass; the SEO surface (robots/sitemap/metadata) is verified in §3.

## Verdict

**Pre-deploy gate PASSED.** No prod-config red flags, all three prod builds
green, SEO surface in place, and every live-stack correctness/security/e2e check
green on a booted stack. The lone open item is a non-blocking Lighthouse perf
score. Cleared to deploy from a config/security/build/e2e standpoint.
