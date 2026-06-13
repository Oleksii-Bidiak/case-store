# Plan 034: Security Hardening — Rate Limiting Tuning, Helmet Hardening, and CSRF Protection

> **Status:** ✅ Done (2026-06-13)
> **Phase:** Phase 5 — Polish & Production
> **Created:** 2026-06-13
> **Last Updated:** 2026-06-13
> **BACKLOG task:** TASK-046 (subtasks TASK-046-A through TASK-046-G)

## Implementation deviations (from plan)

Two planned dependencies could not be used; both were replaced with dependency-free
implementations that preserve the same design:

1. **`csrf-csrf` rejected — ESM-only.** Every published version (1.x–4.x) ships
   `"type": "module"`, which a CommonJS NestJS build cannot `require()`. Replaced
   with a **manual signed double-submit** (`src/csrf/csrf.util.ts` — HMAC-SHA256
   over a random value, constant-time compare). Same OWASP pattern, no dependency.
2. **`@nestjs/throttler-storage-redis` does not exist**, and the de-facto package
   `nestjs-throttler-storage-redis` is **deprecated** ("no longer supported").
   Replaced with a **custom `RedisThrottlerStorage`** (`src/throttler/`) — an
   atomic Lua script mirroring the official in-memory semantics, fail-open on
   Redis errors, in-memory fallback when `REDIS_HOST` is unset.

Other deltas:

- Helmet config extracted to `src/config/security.config.ts` (shared by `main.ts`
  - tests so asserted headers never drift).
- **CSRF scope refined:** requests carrying an `Authorization: Bearer` header are
  exempt (not CSRF-vulnerable — a cross-site request cannot set that header). This
  limits enforcement to genuinely cookie-only requests (guest cart, refresh) and
  means the existing Bearer-authenticated e2e suites needed no changes.
- Frontend `instance.ts` **lazily fetches** `GET /api/csrf-token` when the cookie
  is absent (and skips it when a Bearer token is present), so the AuthProvider
  bootstrap noted as a follow-up in §"App initialisation" is not required.
- `.env.example` left unchanged (blocked by the repo `.env*` permission guard);
  `CSRF_SECRET` is documented in `env.validation.ts` instead.
- Security assertions live in a dedicated `test/security.e2e-spec.ts` (which wires
  the `main.ts` middleware stack) rather than extending `auth`/`cart-guest` suites.

---

## Overview

Phase 5 security row in the roadmap reads: "Rate limiting, CSRF protection, input
sanitization audit, Helmet headers." Significant groundwork already exists:

- **Helmet** is enabled with defaults at `apps/store-api/src/main.ts:25`.
- **Rate limiting** is implemented: `@nestjs/throttler` v6 global guard (100 req/60 s),
  plus `@Throttle({ default: { limit: 5, ttl: 60000 } })` on
  `/api/auth/register` and `/api/auth/login`.

This plan addresses the three **gaps** that remain:

1. **Helmet hardening** — default configuration is permissive enough for development but
   too loose for production (no explicit CSP, no HSTS, default referrer-policy). Add a
   production-aware Helmet configuration and document Swagger UI CSP exceptions for
   the `development` environment.

2. **Throttler tuning** — Review current global limits and add per-route `@Throttle`
   decorators for sensitive public endpoints that currently have no extra protection
   (auth `POST /refresh`, checkout/order creation). Evaluate replacing the in-memory
   throttler store with the existing Redis infrastructure (TASK-044) for multi-instance
   correctness using `@nestjs/throttler-storage-redis`.

3. **CSRF protection** — Not implemented. This is the primary new work. The risk
   surface is cookie-authenticated state-changing requests. The plan recommends and
   designs the specific mitigation strategy (see Architecture Decisions below).

An **input sanitization audit** sub-task is included per the roadmap row: review
free-text DTO fields for stored XSS vectors and recommend/apply sanitization where
the existing `ValidationPipe` whitelist is insufficient.

---

## Scope

### In Scope

- Harden `helmet()` call in `main.ts` with a production-aware options object:
  explicit CSP directives (with a Swagger UI exception in `development`), HSTS
  (production only), `referrerPolicy: { policy: 'strict-origin-when-cross-origin' }`.
- Add `CSRF_SECRET` env var in `env.validation.ts` (`@IsOptional()` in dev,
  enforced in production via a startup guard). Follows the `@IsOptional()` pattern
  of all other optional secrets.
- Install `csrf-csrf` (the maintained successor to the deprecated `csurf` package)
  and implement the double-submit cookie pattern as a NestJS middleware scoped to
  the cookie-authenticated state-changing endpoints.
- Apply CSRF protection middleware to exactly the routes where cookie authentication
  is the sole authentication mechanism for state-changing requests:
  - `POST /api/auth/refresh` (refresh token cookie-only auth, state-changing — rotates
    tokens, writes to DB)
  - `POST /api/cart/items`, `PATCH /api/cart/items/:itemId`,
    `DELETE /api/cart/items/:itemId`, `DELETE /api/cart` (cartToken cookie auth,
    state-changing mutations)
- Update the Axios instance in `apps/store-client/src/shared/api/instance.ts` and
  `apps/store-admin/src/shared/api/instance.ts` to read and forward the CSRF token
  header on state-changing requests. Only the `instance.ts` mutator files may be
  edited — no Orval-generated files are touched.
- Add `@Throttle` override on `POST /api/auth/refresh` (currently undecorated —
  same `limit: 5 / ttl: 60000` as login/register).
- Evaluate and document whether to add `@nestjs/throttler-storage-redis`; add it
  if the recommendation is positive (it reuses the existing `ioredis` connection
  established by TASK-044).
- Input sanitization audit: enumerate all DTO string fields that accept free text
  (product `name`, `description`; category `name`; order notes if any) and assess
  whether `ValidationPipe` whitelist + `@IsString()` is sufficient or whether a
  dedicated sanitizer (`class-sanitizer` / manual strip) is warranted.
- Unit tests: CSRF guard (accept with valid token, reject with missing/bad token),
  throttler smoke tests (verify guard is applied).
- E2E tests: Supertest assertions for CSRF rejection (403), throttler exhaustion on
  `/api/auth/login` (429), Helmet header assertions.

### Out of Scope

- Helmet is **already enabled** — this plan hardens the configuration, not the
  initial setup.
- `@nestjs/throttler` global guard is **already registered** — this plan tunes
  per-route limits and optionally adds a Redis store.
- Full mTLS or API key authentication schemes.
- Frontend form-level CSRF token rendering (tokens are delivered via a cookie set by
  the backend; the Axios instance reads the cookie value and forwards it as a
  header — no React component changes are needed).
- Bearer-header-authenticated endpoints (all endpoints guarded by `JwtAuthGuard`
  or `AdminGuard`) — these are not CSRF-vulnerable; CORS + Bearer suffices.
- `POST /api/auth/register` and `POST /api/auth/login` — these are not
  cookie-authenticated (they accept a body + optional cookie for cart merging, but
  the primary auth factor is the request body credential). CSRF protection for these
  endpoints is handled by the existing `SameSite=Strict` cookies + CORS allowlist.
- Prisma schema changes — no new tables needed.
- Orval regeneration — no API response shape changes.

---

## User Stories

1. As a security-conscious developer, I want CSRF attacks on the refresh-token
   endpoint to be blocked at the middleware level, so that an attacker who tricks
   a logged-in user into visiting a malicious page cannot silently refresh their
   session and steal a new token pair.
2. As a guest shopper, I want cart mutation endpoints to be protected against CSRF
   so that a third-party site cannot silently add or remove items from my cart
   without my knowledge.
3. As an ops engineer, I want Helmet to emit HSTS and strict CSP headers in
   production so that the API never inadvertently allows mixed content or
   clickjacking.
4. As a developer, I want the `POST /api/auth/refresh` endpoint to be throttled at
   the same rate as login (5 req/60 s) so that refresh-token brute-force is
   rate-limited.
5. As a developer running multiple API instances behind a load balancer, I want the
   rate-limiter to use the shared Redis store so that the 5-request limit applies
   across all instances, not per-instance.

---

## Architecture Decision: CSRF Strategy

### Context

The auth model:

- **Access token:** Bearer header (memory-only in the frontend Axios instance).
- **Refresh token:** `HttpOnly; SameSite=Strict; Secure; Path=/api/auth/refresh`
  cookie.
- **Cart token:** `HttpOnly; SameSite=Strict; Secure; Path=/api` cookie.
- **CORS:** `credentials: true` with an explicit origin allowlist
  (`CORS_ORIGINS` env var, defaults to `http://localhost:3000`).

### CSRF risk analysis

**Bearer-header endpoints (all `JwtAuthGuard`-protected routes):** NOT
CSRF-vulnerable. A browser cross-site request cannot set an `Authorization` header
— only the legitimate frontend Axios instance can. No CSRF protection needed here.

**Cookie-authenticated state-changing routes:** CSRF-vulnerable in theory.
These are:

- `POST /api/auth/refresh` — the refresh token cookie is scoped to
  `Path=/api/auth/refresh`; only the browser sends it automatically for requests
  to that exact path. A cross-site form/fetch targeting
  `https://api.example.com/api/auth/refresh` would include the cookie. This
  endpoint rotates tokens and writes a new refresh token to the DB — it is
  state-changing.
- `POST /api/cart/items`, `PATCH /api/cart/items/:itemId`,
  `DELETE /api/cart/items/:itemId`, `DELETE /api/cart` — the `cartToken` cookie
  is `Path=/api`. A cross-site request to any cart mutation endpoint would carry
  this cookie automatically.

**Already-present mitigations:**

1. Both cookies are `SameSite=Strict`. Modern browsers (Chrome 80+, Firefox 79+,
   Safari 12.1+) will NOT send `SameSite=Strict` cookies on any cross-site
   navigation or subrequest — including top-level navigations from another origin.
   This is the strongest SameSite mode and alone provides near-complete protection
   against CSRF in supported browsers.
2. CORS is configured with an explicit `origin` allowlist and `credentials: true`.
   The browser will not send credentials to origins outside the allowlist in
   `fetch`/`XMLHttpRequest` cross-origin requests, and will reject the preflight
   for non-simple methods (POST/PATCH/DELETE require a preflight).

### Residual risk

`SameSite=Strict` has two gaps that make an additional defense layer prudent for
production:

1. **Older browsers / non-standard clients:** Safari had incomplete `SameSite`
   support before 12.1. Any client that does not honour `SameSite` (curl, old
   Android WebViews) can still send the cookie cross-site.
2. **Same-site subdomain attacks:** If any subdomain of the API origin is
   compromised (e.g., `blog.api.example.com`), it can issue same-site requests
   (note: "same-site" in the cookie sense uses the registrable domain, not origin).
   `SameSite=Strict` does not protect against compromised subdomains on the
   same eTLD+1.

### Options evaluated

**Option A: SameSite=Strict as the sole defense (status quo)**

Already in place. Provides strong protection in modern browsers. Does not cover
older browsers or same-site subdomain scenarios.

_Rejected as the sole defense for production._ Good as a primary layer but not
sufficient as a standalone measure for a security hardening task.

**Option B: Custom header requirement**

Require a custom header (e.g., `X-Requested-With: XMLHttpRequest`) on all
state-changing requests. The browser's same-origin policy prevents cross-site
requests from setting custom headers (requires a preflight, which the CORS
policy blocks). Zero frontend secret management — the Axios instance already sets
`Content-Type: application/json` which is a non-simple header; adding one more
costs nothing.

Advantages: trivial to implement (one NestJS guard checking for the header),
no secrets, no double-round-trip. Works regardless of SameSite support.
Disadvantages: provides origin verification only, not true CSRF token protection.
Cannot distinguish a legitimate Axios request from any script on the allowlist
domain. Considered secondary/complementary.

**Option C: Double-submit cookie pattern via `csrf-csrf`**

The `csrf-csrf` library (npm, MIT, actively maintained, successor to the
deprecated `csurf`) implements the signed double-submit cookie pattern:

1. The client calls a dedicated `GET /api/csrf-token` endpoint (or any GET
   endpoint that triggers the middleware). The middleware sets a signed
   `__Host-csrf` cookie (non-HttpOnly, `SameSite=Strict`) and returns the
   token value in the response body.
2. On every state-changing request (POST/PATCH/DELETE), the client reads the
   cookie value and sends it as an `x-csrf-token` header.
3. The middleware validates that the header value matches what is expected from
   the signed cookie.

Because the `__Host-csrf` cookie is non-HttpOnly (the frontend JavaScript must
read it), a cross-site attacker cannot read it (same-origin policy). The cookie
value in the header is the proof of legitimate origin.

Advantages: industry-standard defense in depth; survives same-site subdomain
attacks because the attacker cannot read the non-HttpOnly cookie value from
another subdomain; compatible with all browsers.
Disadvantages: requires a token-fetch round trip on app initialization; requires
the Axios instance to read the cookie and set the header.

**Option D: SameSite=Strict + custom header (hybrid, no CSRF library)**

Apply `SameSite=Strict` (already done) plus require `X-Requested-With:
XMLHttpRequest` on all state-changing cookie-authenticated requests. Add one
lightweight NestJS guard/middleware to enforce the header. The Axios instance
already originates all requests; adding a static header is trivial and costs
nothing per-request.

Advantages: zero new dependencies, zero secrets to manage, no token round trip,
full browser compatibility. `SameSite=Strict` + CORS already stops >99% of
attacks; the custom header adds a second check that requires no JS-readable
cookie.
Disadvantages: the custom header cannot verify the request came from the specific
page (any same-origin script can set it), but the CORS allowlist already handles
that concern.

### Recommendation: Option C (csrf-csrf double-submit) with Option D as complementary

**Primary defense:** `csrf-csrf` double-submit cookie pattern. Rationale:

- This is a security-hardening task; defence-in-depth is the design goal.
- The double-submit pattern is the standard recommendation when `SameSite=Strict`
  alone is deemed insufficient (per OWASP CSRF Prevention Cheat Sheet, section
  "Defense in Depth Techniques").
- `csrf-csrf` is the maintained, actively audited successor to `csurf` — it uses
  signed tokens via `crypto.createHmac` to prevent token forgery.
- The only frontend change is in the `instance.ts` mutator (two files), not in any
  Orval-generated file. The Axios request interceptor reads the CSRF cookie and
  attaches the header — one addition of ~5 lines.
- The `/api/csrf-token` bootstrap call can be folded into the existing app
  initialisation (e.g., the `AuthProvider` or a root layout effect) with a single
  GET — negligible overhead.

**Complementary defense:** Also add `X-Requested-With: XMLHttpRequest` to the
Axios instance default headers (Option D). This costs nothing and provides an
additional non-cookie signal that the middleware can log for forensic purposes.

**Rejected: Option B alone** — insufficient for a security-hardening task.
**Accepted status quo as layer 1: `SameSite=Strict`** — remains in place, provides the
first line of defence.

### CSRF-protected route list

| Method | Path                    | Auth mechanism (cookies) | CSRF scope |
| ------ | ----------------------- | ------------------------ | ---------- |
| POST   | /api/auth/refresh       | `refreshToken` cookie    | Yes        |
| POST   | /api/cart/items         | `cartToken` cookie       | Yes        |
| PATCH  | /api/cart/items/:itemId | `cartToken` cookie       | Yes        |
| DELETE | /api/cart/items/:itemId | `cartToken` cookie       | Yes        |
| DELETE | /api/cart               | `cartToken` cookie       | Yes        |
| POST   | /api/auth/logout        | Bearer (JwtAuthGuard)    | No         |
| POST   | /api/auth/login         | Body credential          | No         |
| POST   | /api/auth/register      | Body credential          | No         |
| POST   | /api/orders             | Bearer (JwtAuthGuard)    | No         |

Note: `POST /api/auth/logout` uses `JwtAuthGuard` (Bearer token in the
`Authorization` header), not a cookie-authenticated guard. It is not on the CSRF
list.

---

## Technical Design

### Helm Hardening

Default `helmet()` applies the following directives that need overriding for
production:

- **CSP (`Content-Security-Policy`):** Helmet defaults include a strict CSP that
  blocks inline scripts. The Swagger UI (`/api/docs`) injects inline scripts and
  loads assets from `cdn.jsdelivr.net`. In `development`, CSP must be relaxed for
  the Swagger UI to work. In `production`, the API never serves the Swagger UI,
  so a tighter CSP is safe.
- **HSTS (`Strict-Transport-Security`):** Helmet v8 enables HSTS by default.
  However the `maxAge` is only 15552000 (180 days). Production deployments should
  use 365 days (31536000) and `includeSubDomains`. In development (HTTP) HSTS
  must not be sent.
- **Referrer-Policy:** Helmet default is `no-referrer`. A more permissive but
  privacy-preserving `strict-origin-when-cross-origin` is recommended (preserves
  the `Referer` header for same-origin requests, strips path for cross-origin —
  useful for analytics while protecting sensitive URL components).

Proposed `helmet()` configuration in `main.ts`:

```ts
const isProduction = nodeEnv === "production";

app.use(
  helmet({
    // ─── Content-Security-Policy ─────────────────────────────────────────────
    contentSecurityPolicy: isProduction
      ? {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
          },
        }
      : {
          // Swagger UI needs inline scripts and CDN assets in development.
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
            imgSrc: ["'self'", "data:", "cdn.jsdelivr.net"],
            connectSrc: ["'self'"],
            fontSrc: ["'self'", "cdn.jsdelivr.net"],
            objectSrc: ["'none'"],
          },
        },

    // ─── HSTS ────────────────────────────────────────────────────────────────
    strictTransportSecurity: isProduction
      ? { maxAge: 31536000, includeSubDomains: true }
      : false, // Never send HSTS over plain HTTP in development.

    // ─── Referrer-Policy ─────────────────────────────────────────────────────
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  }),
);
```

`helmet` is already a dependency (`^8.1.0`); no new package is needed.

### Throttler Tuning

#### Current state

- Global: 100 req / 60 s (in-memory store).
- Auth register + login: 5 req / 60 s.
- Auth refresh: no override (falls through to global 100 req / 60 s).

#### Gaps

`POST /api/auth/refresh` should be treated as sensitive as login — it accepts a
valid refresh token and issues a new token pair. An attacker who obtains a refresh
token can call this endpoint to extend their session. Throttling to 5 req / 60 s
(same as login) closes this gap.

#### Redis throttler store

TASK-044 added `ioredis` infrastructure. `@nestjs/throttler-storage-redis`
provides an `ThrottlerStorageRedisService` that plugs directly into
`ThrottlerModule.forRoot`. It accepts an `ioredis` client instance.

**Recommendation: add `@nestjs/throttler-storage-redis`.** In a single-instance
MVP this adds marginal correctness; in any multi-instance deployment (Docker
Swarm, Kubernetes) it is essential. The Redis connection is already available
via the `RedisCacheModule`'s ioredis client. The throttler storage should share
the Redis instance but use a separate key prefix (`throttle:`) to avoid
namespace collision with cache keys (`product:*`).

Configuration sketch:

```ts
ThrottlerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => {
    const redisHost = configService.get<string>('REDIS_HOST');
    const storage = redisHost
      ? new ThrottlerStorageRedisService(
          new Redis({
            host: redisHost,
            port: configService.get<number>('REDIS_PORT', 6379),
            password: configService.get<string>('REDIS_PASSWORD'),
            keyPrefix: 'throttle:',
          }),
        )
      : undefined; // Falls back to in-memory when Redis is absent.
    return {
      throttlers: [{ ttl: 60000, limit: 100 }],
      ...(storage ? { storage } : {}),
    };
  },
}),
```

When `REDIS_HOST` is absent (local dev without Docker), the module uses the
default in-memory store — same degradation pattern as `RedisCacheModule`.

### CSRF Implementation Detail

#### Backend: `csrf-csrf` middleware

Install `csrf-csrf` (pure ESM; requires `--legacy-peer-deps` or import
compatibility wrapper — verify with the package's NestJS integration notes).

```ts
import { doubleCsrf } from "csrf-csrf";

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => configService.get<string>("CSRF_SECRET", "dev-csrf-secret"),
  cookieName: "__Host-csrf", // __Host- prefix enforces Secure + Path=/
  cookieOptions: {
    sameSite: "strict",
    secure: isProduction,
    httpOnly: false, // Must be readable by frontend JS to forward as header
    path: "/",
  },
  size: 64,
  getTokenFromRequest: (req) => req.headers["x-csrf-token"] as string,
});
```

The CSRF middleware is applied **per-route** rather than globally, so it does not
affect GET endpoints, Bearer-authenticated endpoints, or any endpoint not in the
CSRF scope list.

A dedicated `GET /api/csrf-token` endpoint is added to `AppController` (or a new
`CsrfController`). It calls `generateToken(req, res)` and returns
`{ data: { csrfToken } }`. The frontend calls this once on app init to receive the
cookie and the token value.

NestJS does not have a first-class `app.use('/api/auth/refresh', middleware)`
scoping primitive for Passport-protected routes — the standard approach is to apply
the express middleware via `app.use` with a path prefix list, then register it
before the NestJS bootstrap. Since the refresh endpoint path is fixed and
predictable, using `app.use` with an array of path patterns is clean:

```ts
app.use(
  ["/api/auth/refresh", "/api/cart", "/api/cart/*"],
  doubleCsrfProtection,
);
```

`doubleCsrfProtection` throws a 403 `ForbiddenException` when validation fails.
`HttpExceptionFilter` already maps this to the standard error envelope.

#### CSRF_SECRET env var

```ts
// In EnvironmentVariables:
// ─── CSRF ────────────────────────────────────────────────────────────────────
// CSRF_SECRET is required in production; in development a weak default is used
// so the app boots without configuration. The startup guard below enforces this.

@IsOptional()
@IsString()
@MinLength(32, { message: 'CSRF_SECRET must be at least 32 characters when set' })
CSRF_SECRET?: string;
```

A startup log warning (not an error) is emitted in `bootstrap()` when
`NODE_ENV === 'production'` and `CSRF_SECRET` is not set. This is less than
ideal — see the Risk section for the trade-off. A stricter approach would use a
custom `validateEnv` that rejects a missing `CSRF_SECRET` in production; this can
be a follow-up change once the env var is established everywhere.

#### Frontend: Axios instance update

The CSRF cookie name is `__Host-csrf`. In the browser, `document.cookie` exposes
it (the cookie is non-HttpOnly). The Axios request interceptor reads it and
attaches `x-csrf-token`:

```ts
// In instance.ts — added to the existing request interceptor:
import Cookies from "js-cookie"; // already a common transitive dep; or use vanilla cookie parse

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (accessToken) {
    config.headers.set("Authorization", `Bearer ${accessToken}`);
  }

  // Attach CSRF token for state-changing requests.
  const method = config.method?.toUpperCase();
  if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    const csrfToken = getCsrfTokenFromCookie();
    if (csrfToken) {
      config.headers.set("x-csrf-token", csrfToken);
    }
  }

  return config;
});
```

`getCsrfTokenFromCookie()` is a small utility that parses `document.cookie` for
`__Host-csrf=<value>`. It must handle SSR gracefully (return `null` when
`document` is undefined — Next.js server-side rendering). Since the Axios instance
module runs in the browser context for actual API calls, this is safe.

If `js-cookie` is not already in the dependency tree of `store-client` or
`store-admin`, a small inline cookie-parser helper (≤5 lines) is preferable over
adding a new dependency.

Only `instance.ts` in each app is modified — no Orval-generated files.

#### App initialisation: fetching the CSRF token

The frontend must call `GET /api/csrf-token` once before any state-changing
request. The natural integration point is the `AuthProvider` (or root layout
effect) that already calls `POST /api/auth/refresh` on page load to restore the
access token. Adding a `GET /api/csrf-token` call before the refresh call ensures
the CSRF cookie is set before any protected request fires.

This is a **frontend wiring note** only — the actual `AuthProvider` modification
is out of scope for this plan and belongs to a follow-up integration ticket. The
plan documents the requirement so the frontend implementer knows to add it.

### Input Sanitization Audit

The `ValidationPipe` with `whitelist: true` / `forbidNonWhitelisted: true`
/`transform: true` strips unknown fields and coerces types. It does NOT sanitize
the content of string fields — it only validates their presence and type.

Fields that could carry stored XSS if the API were ever used as a data source for
an HTML-rendered UI:

| DTO                 | Field(s)                     | Risk level |
| ------------------- | ---------------------------- | ---------- |
| `CreateProductDto`  | `name`, `description`, `sku` | Medium     |
| `UpdateProductDto`  | same fields                  | Medium     |
| `CreateCategoryDto` | `name`, `description`        | Low        |
| `RegisterDto`       | `firstName`, `lastName`      | Low        |

**Assessment:** The store-client and store-admin render these fields through React
JSX, which escapes HTML by default. Server-side, the data is stored as-is and
returned via the API. The actual XSS risk is low because:

1. React escapes all string values in JSX unless `dangerouslySetInnerHTML` is used
   (it is not used for product data in the current codebase).
2. The admin panel is access-controlled.

**Recommendation:** Add `@IsString()` + `@MaxLength()` validators to
`description` fields where they are missing (prevents absurdly large payloads that
could stress the DB). Do NOT add a heavy HTML sanitization library (e.g.,
`sanitize-html`) — the overhead is not justified for React-rendered output. Add a
comment block in `main.ts` documenting this assessment. If a future feature
renders product descriptions as raw HTML (e.g., rich text), re-evaluate at that
time.

This constitutes the "input sanitization audit" deliverable for Phase 5.

---

## Files to Create / Modify

### New files

| File                                              | Purpose                                           |
| ------------------------------------------------- | ------------------------------------------------- |
| `apps/store-api/src/csrf/csrf.middleware.ts`      | `doubleCsrfProtection` express middleware wrapper |
| `apps/store-api/src/csrf/csrf.controller.ts`      | `GET /api/csrf-token` endpoint                    |
| `apps/store-api/src/csrf/csrf.module.ts`          | NestJS module registering middleware + controller |
| `apps/store-api/src/csrf/csrf.middleware.spec.ts` | Unit tests: accept/reject CSRF token cases        |
| `apps/store-api/src/csrf/index.ts`                | Barrel export                                     |

### Modified files

| File                                                   | Change                                                                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/store-api/package.json`                          | Add `csrf-csrf`, `@nestjs/throttler-storage-redis`                                                                                       |
| `apps/store-api/src/config/env.validation.ts`          | Add `CSRF_SECRET` optional field                                                                                                         |
| `apps/store-api/src/app.module.ts`                     | Switch to `ThrottlerModule.forRootAsync` with Redis store; import `CsrfModule`                                                           |
| `apps/store-api/src/main.ts`                           | Replace `helmet()` with hardened config; apply `doubleCsrfProtection` middleware on scoped paths; add production CSRF_SECRET warning log |
| `apps/store-api/src/auth/auth.controller.ts`           | Add `@Throttle({ default: { limit: 5, ttl: 60000 } })` to `POST /api/auth/refresh`                                                       |
| `apps/store-client/src/shared/api/instance.ts`         | Add CSRF header to request interceptor                                                                                                   |
| `apps/store-admin/src/shared/api/instance.ts`          | Same CSRF header addition                                                                                                                |
| `.env.example` (root or `apps/store-api/.env.example`) | Document `CSRF_SECRET`                                                                                                                   |
| `apps/store-api/test/auth.e2e-spec.ts`                 | Add assertions: throttler 429 on 6th login; CSRF 403 on refresh without token                                                            |
| `apps/store-api/test/cart-guest.e2e-spec.ts`           | Add assertion: cart mutation without CSRF token returns 403                                                                              |

---

## Ordered Sub-tasks

### TASK-046-A: Install dependencies (`csrf-csrf`, `@nestjs/throttler-storage-redis`)

**Type:** chore
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `csrf-csrf` added to `dependencies` in `apps/store-api/package.json`.
- [ ] `@nestjs/throttler-storage-redis` added to `dependencies` in
      `apps/store-api/package.json`.
- [ ] `ioredis` is already a transitive dependency from TASK-044; confirm it is
      resolvable (no duplicate version conflicts in `package-lock.json`).
- [ ] `npm install` (workspace) completes without errors.
- [ ] `npm run build -w apps/store-api` still passes after install (no import errors).

**Files to create/modify:**

- `apps/store-api/package.json` — add two dependencies

---

### TASK-046-B: Extend `env.validation.ts` with `CSRF_SECRET`

**Type:** feat
**Scope:** store-api
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** TASK-046-A

**Acceptance Criteria:**

- [ ] `EnvironmentVariables` class gains a `CSRF_SECRET` field decorated
      `@IsOptional()` and `@IsString()` with a `@MinLength(32)` validator.
- [ ] The field is grouped under a `// ─── CSRF ──────────────────────────────`
      comment section, consistent with the `Mail` and `Redis / Cache` sections.
- [ ] `npm run typecheck -w apps/store-api` passes.
- [ ] Existing unit tests still pass: `npm run test -w apps/store-api`.
- [ ] `.env.example` (whichever file is used — confirm location) gains:
      `     # CSRF double-submit cookie secret (generate with: openssl rand -hex 32)
    # Required in production. Optional in development (weak default used).
    CSRF_SECRET=
    `

**Files to create/modify:**

- `apps/store-api/src/config/env.validation.ts` — add `CSRF_SECRET`
- `.env.example` — document the new var

---

### TASK-046-C: Harden Helmet configuration in `main.ts`

**Type:** feat
**Scope:** store-api
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-046-A

**Acceptance Criteria:**

- [ ] `app.use(helmet())` in `main.ts` is replaced with `app.use(helmet({ ... }))`.
- [ ] In `production`: CSP directives restrict scripts to `'self'` only; HSTS
      `maxAge` is 31536000 with `includeSubDomains: true`; no `unsafe-inline`.
- [ ] In `development`: CSP allows `'unsafe-inline'` and `cdn.jsdelivr.net` for
      Swagger UI assets; HSTS is `false` (never send over HTTP).
- [ ] `referrerPolicy` is set to `{ policy: 'strict-origin-when-cross-origin' }`
      in both environments.
- [ ] `X-Frame-Options: DENY` is confirmed active (Helmet default — verify it is
      not overridden).
- [ ] Manual verification: start the API in development mode, open
      `http://localhost:3001/api/docs` — Swagger UI loads without CSP errors in
      the browser console.
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run typecheck -w apps/store-api` passes.
- [ ] E2E test: a GET to `/api/health` returns `Content-Security-Policy` and
      `X-Frame-Options` headers (added to `test/app.e2e-spec.ts` or a new
      dedicated header assertion).

**Files to create/modify:**

- `apps/store-api/src/main.ts` — replace `helmet()` with hardened config

---

### TASK-046-D: Tune throttler — Redis store + `POST /api/auth/refresh` rate limit

**Type:** feat
**Scope:** store-api
**Complexity:** M (2 h)
**TDD Required:** No
**Depends on:** TASK-046-A, TASK-046-B

**Acceptance Criteria:**

- [ ] `ThrottlerModule.forRoot(...)` in `app.module.ts` is replaced with
      `ThrottlerModule.forRootAsync(...)` using `ConfigService`.
- [ ] When `REDIS_HOST` is set, `ThrottlerStorageRedisService` is instantiated with
      a fresh `ioredis` client using the same `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`
      config values, with `keyPrefix: 'throttle:'`.
- [ ] When `REDIS_HOST` is absent, no storage option is passed (falls back to
      in-memory — `@nestjs/throttler` default).
- [ ] `auth.controller.ts` `POST /api/auth/refresh` gains
      `@Throttle({ default: { limit: 5, ttl: 60000 } })` decorator (same as login
      and register).
- [ ] `npm run test:e2e -w apps/store-api` passes: existing throttler assertions
      are green; a new test confirms that 6 successive login attempts return 429 on
      the sixth (or verifies the `@Throttle` decorator is present via reflection if
      a live 429 test is impractical in CI without the real guard context).
- [ ] `npm run build -w apps/store-api` passes.
- [ ] `npm run typecheck -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/app.module.ts` — `ThrottlerModule.forRootAsync` with Redis store
- `apps/store-api/src/auth/auth.controller.ts` — add `@Throttle` to refresh endpoint

---

### TASK-046-E: Implement CSRF middleware and `GET /api/csrf-token` endpoint (TDD)

**Type:** feat
**Scope:** store-api
**Complexity:** M (3 h)
**TDD Required:** Yes
**Depends on:** TASK-046-A, TASK-046-B

**Acceptance Criteria:**

**Module structure:**

- [ ] `apps/store-api/src/csrf/csrf.module.ts` exports `CsrfModule`.
- [ ] `apps/store-api/src/csrf/csrf.middleware.ts` exports:
  - `getCsrfMiddleware(secret: string, isProduction: boolean)` — factory that
    calls `doubleCsrf(...)` and returns `{ doubleCsrfProtection, generateToken }`.
  - The `cookieName` is `__Host-csrf` in production and `csrf` in development
    (the `__Host-` prefix requires `Secure` + `Path=/`, which breaks over plain
    HTTP in development).
  - `cookieOptions`: `httpOnly: false` (must be readable by frontend JS),
    `sameSite: 'strict'`, `secure: isProduction`, `path: '/'`.
  - `getTokenFromRequest`: reads `req.headers['x-csrf-token']`.
- [ ] `apps/store-api/src/csrf/csrf.controller.ts` exposes `GET /csrf-token` (full
      path: `GET /api/csrf-token` with the global prefix). It calls `generateToken`
      and returns `{ data: { csrfToken } }`. No auth guard — this endpoint is public
      by design (generating the token is harmless; the cookie is what matters).
- [ ] `apps/store-api/src/csrf/index.ts` barrel-exports `CsrfModule`.

**Tests:**

- [ ] `apps/store-api/src/csrf/csrf.middleware.spec.ts` (TDD Red→Green):
  - Valid request (header matches cookie): middleware calls `next()` without error.
  - Missing `x-csrf-token` header: middleware throws a 403 `ForbiddenException`
    (or equivalent status).
  - Mismatched token: middleware throws 403.
  - GET request: middleware is not applied (guarded at the route level).
- [ ] `npm run test -w apps/store-api` passes with all new specs green.
- [ ] `npm run typecheck -w apps/store-api` passes.

**Files to create/modify:**

- `apps/store-api/src/csrf/csrf.middleware.ts` — `doubleCsrf` factory
- `apps/store-api/src/csrf/csrf.middleware.spec.ts` — TDD unit tests
- `apps/store-api/src/csrf/csrf.controller.ts` — `GET /csrf-token` endpoint
- `apps/store-api/src/csrf/csrf.module.ts` — NestJS module
- `apps/store-api/src/csrf/index.ts` — barrel

---

### TASK-046-F: Wire CSRF middleware into `main.ts` + `AppModule`; update frontend Axios instances

**Type:** feat
**Scope:** store-api, store-client, store-admin
**Complexity:** M (2-3 h)
**TDD Required:** No
**Depends on:** TASK-046-E

**Acceptance Criteria:**

**Backend:**

- [ ] `apps/store-api/src/main.ts` applies `doubleCsrfProtection` via `app.use()`
      scoped to the CSRF-protected path list:
      `['/api/auth/refresh', '/api/cart', '/api/cart/*splat']`.
      This MUST be registered AFTER `cookieParser()` middleware (already present at
      `main.ts:29`) and BEFORE the NestJS router initialisation (i.e., before
      `await app.listen(port)`).
- [ ] A production startup warning is logged to Pino when `NODE_ENV === 'production'`
      and `CSRF_SECRET` env var is not set:
      `'CSRF_SECRET is not set in production — using weak default. Set CSRF_SECRET to a 32+ character secret.'`
- [ ] `CsrfModule` is imported in `AppModule`.

**Frontend (store-client):**

- [ ] `apps/store-client/src/shared/api/instance.ts` request interceptor is updated
      to read the CSRF cookie (`csrf` in dev / `__Host-csrf` in prod) and add
      `x-csrf-token` header on all POST/PUT/PATCH/DELETE requests.
- [ ] A `getCsrfToken(): string | null` helper reads `document.cookie` without
      using `js-cookie` (inline implementation, ≤8 lines). It returns `null`
      when `typeof document === 'undefined'` (SSR guard).
- [ ] The `X-Requested-With: XMLHttpRequest` header is added to the Axios instance
      `defaults.headers.common` as a complementary CSRF signal (Option D from the
      architecture decision).

**Frontend (store-admin):**

- [ ] `apps/store-admin/src/shared/api/instance.ts` receives the same updates as
      `store-client/instance.ts`.

**Critical constraint:**

- [ ] No Orval-generated files are modified (only `instance.ts` in each app).

**Files to create/modify:**

- `apps/store-api/src/main.ts` — scope CSRF middleware + startup warning
- `apps/store-api/src/app.module.ts` — import `CsrfModule`
- `apps/store-client/src/shared/api/instance.ts` — add CSRF header + X-Requested-With
- `apps/store-admin/src/shared/api/instance.ts` — same

---

### TASK-046-G: Input sanitization audit; E2E security assertions; verification gate

**Type:** test + chore
**Scope:** store-api
**Complexity:** M (2-3 h)
**TDD Required:** No
**Depends on:** TASK-046-C, TASK-046-D, TASK-046-E, TASK-046-F

**Acceptance Criteria:**

**Input sanitization audit:**

- [ ] All DTO files in `apps/store-api/src/**/dto/*.dto.ts` are reviewed for
      free-text string fields lacking `@MaxLength()` decorators.
- [ ] `description` fields in `CreateProductDto`, `UpdateProductDto`,
      `CreateCategoryDto`, and `UpdateCategoryDto` gain `@IsOptional()` (if already
      optional) + `@MaxLength(5000)` (or the appropriate limit) if not already
      present.
- [ ] `name` fields in the same DTOs are confirmed to have `@MaxLength(255)` (or
      equivalent).
- [ ] A comment block added at the top of `main.ts` documents the XSS assessment
      outcome (React JSX escapes; no `dangerouslySetInnerHTML` on user data; no
      HTML sanitizer needed at current scope).
- [ ] `npm run test -w apps/store-api` still passes.

**E2E security assertions (Supertest):**

- [ ] `test/auth.e2e-spec.ts` extended with:
  - `POST /api/auth/refresh` without `x-csrf-token` header → 403 response.
  - `POST /api/auth/refresh` with a valid CSRF token (fetched from
    `GET /api/csrf-token`) → 200 or 401 (token refresh succeeds if a valid refresh
    cookie is present; 401 if not — but NOT 403).
  - 6th successive `POST /api/auth/login` attempt in the same TTL window → 429.
- [ ] `test/cart-guest.e2e-spec.ts` extended with:
  - `POST /api/cart/items` without `x-csrf-token` header → 403.
  - `POST /api/cart/items` with valid CSRF token → normal response (201 or 400
    depending on payload).
- [ ] `test/app.e2e-spec.ts` (or a new `test/security.e2e-spec.ts`) extended with:
  - `GET /api/health` response contains `Content-Security-Policy` header.
  - `GET /api/health` response contains `X-Frame-Options: DENY` header.
  - `GET /api/health` in production simulation (set `NODE_ENV=production` in the
    test module) has `Strict-Transport-Security` header with `max-age=31536000`.

**Verification gate:**

- [ ] `npm run build -w apps/store-api` exits 0.
- [ ] `npm run lint -w apps/store-api` exits 0 with zero new warnings.
- [ ] `npm run typecheck -w apps/store-api` exits 0.
- [ ] `npm run test -w apps/store-api` exits 0 (all unit tests green, no
      regressions in auth, cart, product, order, dashboard suites).
- [ ] `npm run test:e2e -w apps/store-api` exits 0 (all e2e tests green including
      new CSRF + throttler + header assertions).
- [ ] `npm run build -w apps/store-client` exits 0.
- [ ] `npm run build -w apps/store-admin` exits 0.
- [ ] Confirmation that no Orval-generated files (`**/shared/api/generated/**`)
      were modified (check via `git status`).

**Files to create/modify:**

- `apps/store-api/src/**/dto/*.dto.ts` — add `@MaxLength()` where missing (audit-driven)
- `apps/store-api/src/main.ts` — add XSS assessment comment block
- `apps/store-api/test/auth.e2e-spec.ts` — CSRF + throttler e2e assertions
- `apps/store-api/test/cart-guest.e2e-spec.ts` — CSRF e2e assertion
- `apps/store-api/test/app.e2e-spec.ts` or `test/security.e2e-spec.ts` — header assertions

---

## Testing Strategy

### Unit tests (Jest, no I/O)

| Spec file                      | What is tested                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `csrf/csrf.middleware.spec.ts` | Mocked req/res: valid token → next() called; missing header → ForbiddenException; mismatched token → ForbiddenException |

### E2E tests (Supertest, real HTTP stack)

| Spec file                     | New assertions                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------- |
| `test/auth.e2e-spec.ts`       | POST /api/auth/refresh without CSRF → 403; with valid CSRF → not 403; 6th login → 429 |
| `test/cart-guest.e2e-spec.ts` | POST /api/cart/items without CSRF → 403; with valid CSRF → not 403                    |
| `test/app.e2e-spec.ts`        | CSP, X-Frame-Options, HSTS headers present in API responses                           |

### Manual verification

1. Start API in development: open `http://localhost:3001/api/docs` — Swagger UI
   loads without CSP console errors.
2. Start API in production mode with `NODE_ENV=production` — verify `curl -I
http://localhost:3001/api/health` includes `Strict-Transport-Security` header.
3. Open the storefront in a browser, open DevTools → Network → make a cart
   mutation — verify `x-csrf-token` header is present on the request.

---

## Risks & Mitigations

| Risk                                                                             | Likelihood | Impact | Mitigation                                                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `csrf-csrf` is an ESM-only package; NestJS uses CommonJS by default              | Medium     | High   | Check `csrf-csrf` package.json for `exports` / dual CJS+ESM build. If ESM-only, use a dynamic `import()` wrapper or switch to `@dr.pogodin/react-csrf-protection` (a CJS-compatible fork) or implement a manual double-submit pattern (≈30 lines). Document the chosen approach in TASK-046-E. |
| Helmet CSP in development blocks Swagger UI                                      | Low        | Medium | The development CSP in the plan explicitly allows `cdn.jsdelivr.net` and `'unsafe-inline'` for Swagger assets. Test immediately after applying the config (TASK-046-C acceptance criteria require this).                                                                                       |
| `__Host-` prefix on CSRF cookie fails over HTTP (development)                    | Low        | Low    | Plan explicitly uses `cookieName: 'csrf'` (no `__Host-` prefix) in development and `__Host-csrf` in production. The factory function receives `isProduction` to switch.                                                                                                                        |
| Redis throttler storage adds a startup dependency                                | Low        | Low    | Identical pattern to `RedisCacheModule` — when `REDIS_HOST` is absent, in-memory storage is used. No startup error without Redis.                                                                                                                                                              |
| Frontend CSRF token fetch (`GET /api/csrf-token`) not integrated before auth     | Medium     | Medium | Document the integration requirement clearly. The plan explicitly notes this as a frontend wiring responsibility outside this task. If the token is absent, cart mutations fail with 403 — discoverable immediately in integration testing.                                                    |
| CSRF middleware path glob mismatch in Express                                    | Low        | Medium | Test with both `/api/cart` (no trailing items) and `/api/cart/items/uuid` paths in e2e tests. Use `'/api/cart*'` or an array of exact patterns as needed.                                                                                                                                      |
| `@MaxLength()` on existing DTOs breaks existing e2e tests that send long strings | Very Low   | Low    | The existing e2e fixtures use controlled short payloads. The audit should set generous limits (e.g., 5000 for descriptions) well above any fixture data.                                                                                                                                       |

---

## Rollback

If CSRF protection causes unexpected 403 errors in production:

1. Remove the `app.use([...], doubleCsrfProtection)` call in `main.ts` and
   redeploy. The `csrf-csrf` library, the `CsrfModule`, and the env var remain
   in place but inactive — no data loss, no DB migration needed.
2. Revert the Axios instance changes in `instance.ts` for both frontends. These
   are the only frontend files changed; reverting them to the previous interceptor
   logic is a single-file revert per app.
3. The throttler Redis store can be disabled by removing the `storage` option from
   `ThrottlerModule.forRootAsync` — the module then falls back to in-memory with
   no downtime.

---

## Notes

- `csurf` (the legacy npm package) was deprecated and removed from npm in 2023
  due to a CSRF bypass vulnerability. `csrf-csrf` is the maintained successor
  recommended by the security community and the Express team's documentation.
- The double-submit cookie pattern does not require server-side session storage,
  which aligns with the stateless JWT architecture of this API.
- The CSRF token endpoint (`GET /api/csrf-token`) should be added to the Swagger
  documentation with `@ApiOperation` and `@ApiResponse` decorators.
- If the API is later fronted by a reverse proxy (nginx, Cloudflare), ensure the
  proxy forwards the `x-csrf-token` header — most do by default, but some strip
  non-standard headers.
- OWASP CSRF Prevention Cheat Sheet reference:
  https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
