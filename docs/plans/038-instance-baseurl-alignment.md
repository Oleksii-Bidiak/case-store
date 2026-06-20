# Plan: Align baseURL Convention in store-client and store-admin `instance.ts`

> **Status:** ✅ Code done (TASK-059, TASK-059-A) · ⬜ Manual QA pending (TASK-059-B)
> **Phase:** Tech Debt & Architecture Review (cross-cutting)
> **Created:** 2026-06-16
> **Last Updated:** 2026-06-16
> **Origin:** TASK-054-D (workspace-boundary audit, finding D-4)
> **Priority:** Low — security-sensitive, must not regress auth or CSRF flows

> **Implementation note (2026-06-16):** The recommended change (align store-admin to the
> store-client convention) was applied and is correct, BUT the plan's Axios-resolution
> reasoning below ("Axios resolves a leading-`/` path against the origin only, discarding
> the baseURL path, per RFC 3986") is **factually wrong for the installed Axios (1.16.0)**.
> Verified against `node_modules/axios/lib/helpers/combineURLs.js`: Axios does **naive
> string concatenation** — `baseURL.replace(/\/?\/$/,'') + '/' + path.replace(/^\/+/,'')`
> — and `isAbsoluteURL` treats a single-leading-slash path as _relative_. So a path is
> always appended to the full baseURL (path segment included), never resolved against the
> origin alone. The conclusion still holds (store-client convention is the only
> self-consistent one, because every generated URL already starts with `/api/`), but the
> mechanism is concatenation, not RFC resolution.
>
> **CRITICAL DEPLOYMENT CONSEQUENCE (verify before/at deploy):** Because Axios concatenates,
> store-admin's `NEXT_PUBLIC_API_URL` **must be the bare origin with NO `/api` suffix**
> (e.g. `http://host:3001`). If that env var still ends in `/api`, EVERY request becomes
> `…/api/api/…` (double prefix → 404) — not just CSRF/refresh, but all Orval-generated
> calls too. `.env*` files are git-ignored/hook-blocked and could not be inspected during
> implementation; this must be confirmed in each store-admin environment (local `.env.local`,
> CI, staging, prod) as part of TASK-059-B / deployment.

---

## Overview

`apps/store-client/src/shared/api/instance.ts` and
`apps/store-admin/src/shared/api/instance.ts` are hand-written Axios mutators that
configure the same logical thing — an HTTP client that talks to `store-api` — but encode
the `/api` prefix in two incompatible ways. This is a maintenance hazard: a developer
who copies a path from one app into the other will silently build a wrong URL. The goal
of this plan is to pick one convention, align both files to it, and confirm that no
Orval-generated file changes and that all runtime request paths remain correct.

---

## Scope

### In Scope

- Aligning the `baseURL` default value, `CSRF_TOKEN_PATH` constant, and the
  `refreshAccessToken` hardcoded path in both `instance.ts` files so they follow
  the same convention.
- Updating the `NEXT_PUBLIC_API_URL` documentation/env migration note.
- Verifying zero diff in `**/shared/api/generated/**` after the change.
- Verifying all hand-written auth/CSRF request paths continue to resolve to the
  correct absolute URL.

### Out of Scope

- Any change to Orval-generated files (these must remain byte-identical).
- Any change to the `orval.config.ts` files (covered by TASK-058).
- Changes to `.env*` files (git-ignored; blocked by pre-commit hook).
- Changes to the NestJS backend, its `setGlobalPrefix`, or the OpenAPI spec.
- Any new feature work.

---

## Existing State — Full Diff

Both files are structurally near-identical. The meaningful differences are:

| Point of divergence                       | store-client                                             | store-admin                                                                                  |
| ----------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `baseURL` default                         | `"http://localhost:3001"` (no `/api`)                    | `"http://localhost:3001/api"` (includes `/api`)                                              |
| `CSRF_TOKEN_PATH` constant                | `"/api/csrf-token"`                                      | `"/csrf-token"`                                                                              |
| Refresh call path in `refreshAccessToken` | `.post("/api/auth/refresh")`                             | `.post("/auth/refresh")`                                                                     |
| Comment on baseURL JSDoc                  | "defaults to http://localhost:3001"                      | "defaults to http://localhost:3001/api"; note that endpoint paths are written without `/api` |
| Comment on `CSRF_TOKEN_PATH`              | notes that baseURL has no `/api`, so the path carries it | notes that baseURL already includes `/api`, so the path is written without it                |

No other meaningful differences exist: the interceptor logic, `customInstance`,
`getAccessToken`/`setAccessToken`, `isAuthEndpoint`, `ErrorType`, `BodyType`,
`CSRF_COOKIE_NAMES`, `MUTATING_METHODS`, and the `csrfPromise`/`refreshPromise`
de-duplication pattern are identical in both files.

---

## Critical Context: Why the Current State Works (Despite the Divergence)

### How `setGlobalPrefix` affects generated URLs

`apps/store-api/src/main.ts` calls `app.setGlobalPrefix('api', { exclude: ['health'] })`.
Because NestJS routes are declared without a `/api` prefix in controllers (e.g.,
`@Controller('auth')`), the global prefix makes them available at `/api/auth/*`.

### What Orval generates

Both `apps/store-client/src/shared/api/generated/auth/auth.ts` and the identical file in
`apps/store-admin` contain paths such as:

```
url: `/api/auth/register`
url: `/api/auth/login`
url: `/api/auth/refresh`
url: `/api/auth/logout`
```

Orval derives these from the OpenAPI spec's operation paths, which already include the
`/api` prefix because the spec is exported from the running NestJS server (or
`swagger:export`) after `setGlobalPrefix` has been applied. The generated paths therefore
ALWAYS start with `/api/...`.

### How Axios resolves `url` against `baseURL`

Axios distinguishes two cases:

1. When `url` starts with `/` (an absolute-path URL), Axios resolves it relative to the
   **origin** of `baseURL`, ignoring any path segment in `baseURL`. For example:
   - `baseURL = "http://localhost:3001/api"`, `url = "/api/auth/register"`
   - Resolved: `http://localhost:3001/api/auth/register` (the `/api` in `baseURL` is
     discarded; only the origin is kept).
2. When `url` does NOT start with `/`, Axios appends it to `baseURL` directly.

This means **both conventions currently produce correct absolute URLs for Orval-generated
calls** because the generated paths all start with `/api/...`, and Axios's absolute-path
resolution strips the `baseURL` path segment before joining.

The hand-written paths (CSRF and refresh) are also correct under each respective
convention: store-client writes `/api/csrf-token` (needed, since baseURL has no path),
and store-admin writes `/csrf-token` (correct, since Axios resolves `/csrf-token` against
the origin as `http://localhost:3001/csrf-token` — which would be WRONG; but see below).

**IMPORTANT NOTE on store-admin hand-written paths:**
When `baseURL = "http://localhost:3001/api"` and `url = "/csrf-token"`, Axios resolves
this as `http://localhost:3001/csrf-token` — which is incorrect, because the actual
backend route is `GET /api/csrf-token`. Similarly, `.post("/auth/refresh")` resolves to
`http://localhost:3001/auth/refresh`, not `http://localhost:3001/api/auth/refresh`.

This means the store-admin's hand-written CSRF and refresh paths are **currently broken
in production** (they would hit `http://localhost:3001/csrf-token` and
`http://localhost:3001/auth/refresh` instead of the `/api/` prefixed routes). This is a
pre-existing bug introduced by the divergent convention, not caused by this refactor.

The store-client convention (no `/api` in `baseURL`; hand-written paths carry `/api`)
is the only convention under which BOTH Orval-generated calls AND hand-written calls
produce correct URLs.

---

## Recommended Convention

**Target: store-client convention**

`baseURL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"` (no `/api` suffix).
All paths — both Orval-generated (already `/api/...`) and hand-written (CSRF, refresh) —
carry the full `/api/...` prefix.

**Reason:** This is the only convention under which both Orval-generated calls (whose
paths start with `/api/...`) and hand-written calls (CSRF token fetch, auth refresh)
resolve to the correct absolute URL without relying on Axios's origin-only resolution
behaviour. The store-admin convention is demonstrably wrong for the hand-written paths.

---

## `NEXT_PUBLIC_API_URL` Environment Variable Migration Note

**IMPORTANT — deployment config change required for store-admin.**

After this refactor, the `NEXT_PUBLIC_API_URL` environment variable in store-admin must
be set to the API origin WITHOUT the `/api` suffix.

| App          | Before this refactor                    | After this refactor                         |
| ------------ | --------------------------------------- | ------------------------------------------- |
| store-client | `http://your-api-host:3001` (no change) | `http://your-api-host:3001` (unchanged)     |
| store-admin  | `http://your-api-host:3001/api`         | `http://your-api-host:3001` (remove `/api`) |

Any deployment environment (Docker Compose, CI, staging, production) that has
`NEXT_PUBLIC_API_URL` set for store-admin must have the `/api` suffix removed from the
value. Failure to do so would cause all requests from store-admin to hit
`http://your-api-host:3001/api/api/auth/...` (double `/api`), which would return 404.

The store-client value is unchanged.

---

## User Stories

1. As a developer maintaining both frontend apps, I want both `instance.ts` files to
   follow the same `/api`-prefix convention, so that paths are predictable regardless of
   which app I am working in.
2. As an ops engineer, I want clear documentation of what `NEXT_PUBLIC_API_URL` must be
   set to for each app after this change, so that deployments do not break.

---

## Technical Design

### No backend changes

The NestJS backend (`setGlobalPrefix`, controllers, and the OpenAPI spec export) is
unchanged. The Orval-generated files are unchanged.

### store-admin `instance.ts` changes

Three changes required in `apps/store-admin/src/shared/api/instance.ts`:

1. `baseURL` default: `"http://localhost:3001/api"` → `"http://localhost:3001"`
2. `CSRF_TOKEN_PATH`: `"/csrf-token"` → `"/api/csrf-token"`
3. Refresh call path: `.post("/auth/refresh")` → `.post("/api/auth/refresh")`
4. Update both the JSDoc comment and the inline comment on `CSRF_TOKEN_PATH` to match
   the store-client wording (remove the "baseURL already includes `/api`" note).

### store-client `instance.ts` changes

No changes to the logic. The store-client is already correct. Its comments may be
reviewed for clarity (optional cosmetic pass).

### Verification gates

See tasks below for the full gate sequence.

---

## API Contract

No API contract changes. Endpoint paths are unchanged. `npm run generate:api` must
produce zero diff in `**/shared/api/generated/**`.

---

## Risks & Mitigations

| Risk                                                                  | Severity | Mitigation                                                                                                                                                                         |
| --------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Auth refresh flow breaks in store-admin (token not refreshed on 401)  | CRITICAL | Manual verification: log in as admin, let access token expire, perform an action — confirm silent refresh succeeds (200, not redirect to login)                                    |
| CSRF protection breaks in store-admin (mutations rejected with 403)   | CRITICAL | Manual verification: perform a state-changing operation (product update, order status change) in store-admin while logged in without a Bearer token context — confirm 200, not 403 |
| `NEXT_PUBLIC_API_URL` not updated in deployment                       | HIGH     | Document the migration note in this plan; add a deployment checklist item; the build/typecheck gate will not catch this at CI time                                                 |
| Regression introduced in store-client (which was already correct)     | MEDIUM   | Run build + typecheck + lint + unit tests for store-client after the change; confirm no Orval-generated files changed                                                              |
| Orval-generated files accidentally modified                           | HIGH     | Run `npm run generate:api` after the change and assert `git diff -- '**/shared/api/generated/**'` is empty                                                                         |
| isAuthEndpoint guard in store-admin skips retry for wrong URL pattern | LOW      | Verify `isAuthEndpoint` is identical in both files (it is: `url.includes("/auth/")`) — no change needed                                                                            |

---

## Tasks

### TASK-059: Align `instance.ts` baseURL convention — store-admin

**Type:** refactor
**Scope:** store-admin
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** none

**Acceptance Criteria:**

- [ ] `baseURL` default in `apps/store-admin/src/shared/api/instance.ts` is
      `"http://localhost:3001"` (no `/api` suffix).
- [ ] `CSRF_TOKEN_PATH` is `"/api/csrf-token"` (matching store-client).
- [ ] The refresh call in `refreshAccessToken` uses `"/api/auth/refresh"` (matching
      store-client).
- [ ] The JSDoc comment on `api` creation and the inline `CSRF_TOKEN_PATH` comment are
      updated to remove the "baseURL already includes `/api`" language and align with
      store-client wording.
- [ ] `apps/store-client/src/shared/api/instance.ts` is NOT modified (it is already
      correct).
- [ ] `npm run generate:api` produces zero diff in `**/shared/api/generated/**` (both
      apps). Run `git diff -- "apps/store-client/src/shared/api/generated/**"
"apps/store-admin/src/shared/api/generated/**"` to confirm.
- [ ] `npm run typecheck` passes for all workspaces.
- [ ] `npm run build -w apps/store-admin` passes.
- [ ] `npm run lint -w apps/store-admin` passes.
- [ ] `npm run test -w apps/store-api` passes (296 unit + 170 e2e green — no backend
      change, but confirm the gate).
- [ ] Manual verification of store-admin auth refresh flow is documented (see
      TASK-059-B).
- [ ] Manual verification of store-admin CSRF protection is documented (see TASK-059-B).
- [ ] Deployment migration note for `NEXT_PUBLIC_API_URL` is understood and tracked.

**Files to create/modify:**

- `apps/store-admin/src/shared/api/instance.ts` — update `baseURL` default,
  `CSRF_TOKEN_PATH`, refresh path, and related comments. No logic changes.

---

### TASK-059-A: Zero-diff gate — confirm generated files unchanged

**Type:** chore
**Scope:** store-client, store-admin
**Complexity:** S (15 min)
**TDD Required:** No
**Depends on:** TASK-059

**Acceptance Criteria:**

- [ ] `npm run generate:api` is run in a clean working tree after TASK-059.
- [ ] `git diff -- "apps/store-client/src/shared/api/generated/**"` is empty.
- [ ] `git diff -- "apps/store-admin/src/shared/api/generated/**"` is empty.
- [ ] If any diff is found, STOP — do not commit. Investigate before proceeding.

**Files to create/modify:**

- None (this is a verification-only step).

---

### TASK-059-B: Manual verification — store-admin auth refresh and CSRF flows

**Type:** test
**Scope:** store-admin
**Complexity:** S (30 min — requires a running stack)
**TDD Required:** No
**Depends on:** TASK-059, TASK-059-A

**Note:** This task requires `docker compose up` (PostgreSQL), a running `store-api` dev
server, and a running `store-admin` dev server. It cannot be automated in CI without an
integration environment. Do NOT skip this task — the CSRF and refresh flows are
security-critical and are exercised exclusively through the hand-written paths that were
changed in TASK-059.

**Acceptance Criteria:**

- [ ] Admin login succeeds: navigate to `/login` in store-admin, enter valid admin
      credentials, confirm redirect to dashboard (200 from POST `/api/auth/login`).
- [ ] Auth refresh succeeds silently: after access token expires (or simulate by clearing
      the in-memory token from a test harness), perform an authenticated action (e.g., open
      the products list page) and confirm the request succeeds without redirecting to login
      (the 401 interceptor called POST `/api/auth/refresh` and got a new token).
- [ ] CSRF token is fetched correctly: open browser DevTools Network tab, perform a
      state-changing request (e.g., update a product or change an order status), confirm
      that a GET request to `http://localhost:3001/api/csrf-token` was made (not
      `http://localhost:3001/csrf-token`) and the mutation returned 200.
- [ ] CSRF protected mutation is not rejected: the mutation in the above step returns
      200, not 403, confirming the `x-csrf-token` header was correctly populated.
- [ ] Logout succeeds: click logout in store-admin, confirm redirect to login page.
- [ ] Findings are noted as a comment or annotation on the BACKLOG entry for TASK-059-B.

**Files to create/modify:**

- None (manual QA step — findings documented in BACKLOG or a `docs/manual-qa/` note).

---

## Migration Steps

1. Ensure `main` and `develop` are clean and CI is green before starting.
2. Create a branch: `git checkout -b fix/059-instance-baseurl-alignment`.
3. Complete TASK-059: edit `apps/store-admin/src/shared/api/instance.ts` only.
4. Complete TASK-059-A: run `npm run generate:api`, assert zero diff.
5. Run the full static gate: `npm run typecheck && npm run build && npm run lint && npm run test && npm run test:e2e`.
6. Commit with message: `refactor(admin): align instance.ts baseURL — no /api suffix, paths carry /api prefix`.
7. Complete TASK-059-B: manual verification with a running stack.
8. Update `DEPLOYMENT.md` (if it exists) or `.env.example` commentary with the
   `NEXT_PUBLIC_API_URL` migration note for store-admin.
9. Open PR against `develop`; request review with attention to the security risk callout.
10. After merge, update any staging/production deployment configs to remove `/api` from
    the store-admin `NEXT_PUBLIC_API_URL` value before deploying.

---

## Notes

### Why the store-admin hand-written paths are currently incorrect

When `baseURL = "http://localhost:3001/api"`, Axios resolves a path that starts with `/`
relative to the **origin only** (RFC 3986 §5.2). For example:

- `baseURL = "http://localhost:3001/api"`, `url = "/csrf-token"`
- Origin = `http://localhost:3001`, resolved = `http://localhost:3001/csrf-token`

This does NOT reach the backend's `GET /api/csrf-token` endpoint — it hits a non-existent
route. The backend returns 404 for that path, so `ensureCsrfToken` silently falls back to
`null` (the `.catch(() => null)` in the implementation), meaning CSRF protection for
guest cart mutations in store-admin was never actually applied. This is a pre-existing
security gap. The fix in TASK-059 corrects it.

Similarly, `.post("/auth/refresh")` resolves to `http://localhost:3001/auth/refresh`
(404), meaning the 401-retry interceptor in store-admin was always silently failing and
immediately clearing the access token. Users were effectively logged out on every token
expiry in store-admin rather than getting a silent refresh. This is also a pre-existing
bug that TASK-059 corrects as a side effect.

### Why Orval-generated paths are unaffected

Orval generates absolute-path URLs (`/api/auth/register`, etc.) from the OpenAPI spec.
Under both the old and new `baseURL`, Axios resolves these to the correct origin +
`/api/...` path because the leading `/` in the Orval-generated URL discards the `baseURL`
path segment. The generated files themselves are identical in both apps (same spec, same
Orval config factory). Therefore this refactor touches only the three hand-written path
values and their comments, and produces zero diff in `**/shared/api/generated/**`.

### Relation to TASK-058

TASK-058 (orval-config consolidation) is complete. This plan explicitly does NOT touch
`orval.config.ts` or any generated file.
