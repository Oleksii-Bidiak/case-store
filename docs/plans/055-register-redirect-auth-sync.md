# Plan: Post-Registration Redirect and Header Auth Sync (TASK-121)

> **Status:** Complete (manual QA passed — TASK-121-D ✅)
> **Phase:** Phase 1 — Foundation (Auth/Foundation storefront bug fix)
> **Created:** 2026-06-25
> **Last Updated:** 2026-06-25

## Resolution (implemented)

- **TASK-121-A:** Confirmed `customInstance` (`shared/api/instance.ts`) returns
  `response.data` via `.then(({ data }) => data)`, so `res` in `onSuccess` is the API
  envelope and `res?.data?.accessToken` is **correct** — no accessor bug. Documented the
  confirmed shape with an inline comment. The token extraction was **not** the cause.
- **TASK-121-B:** Root cause was the missing `useEffect`/`isAuthenticated` reactive guard.
  Mirrored login-form: added `useEffect` redirect on `isAuthenticated`, `useSearchParams`,
  `redirectTarget` with the open-redirect guard, and switched `router.push("/")` →
  `router.push(redirectTarget)`.
- **TASK-121-C:** Added `register-form.test.tsx` (6 scenarios). TDD Red reproduced 2
  failures (`?redirect=` + authenticated-mount); both green after TASK-121-B.
- Gates: `npx jest` 73/73 pass, `npm run typecheck` clean, `npm run lint` clean.
- **TASK-121-D:** Manual QA on a running stack passed — register redirects to `/` and the
  header flips to the authenticated state without a reload.

## Overview

After a successful account registration, the storefront does **not** reliably redirect to `/`
and the header remains in guest state (showing "Sign In / Register" links instead of "My
Account" + logout). Login works correctly. This plan diagnoses the root cause and aligns
`register-form.tsx` with the established `login-form.tsx` success path.

## Scope

### In Scope

- Diagnosis of why `register-form.tsx` succeeds at calling `setTokens` yet the header stays
  in guest state (or appears to).
- Verification that the register endpoint response envelope matches login (prime suspect:
  `res.data.accessToken` resolution).
- Alignment of the register success path with login: `useEffect`/`isAuthenticated` reactive
  redirect guard + `?redirect=` query-param support with open-redirect guard.
- RTL component test for the register success path (register form is in scope for component
  tests now that the TASK-105-A/B harness — RTL + MSW + jsdom — is live).

### Out of Scope

- Backend changes — the `POST /api/auth/register` controller is correct; it already returns
  `{ data: { accessToken } }` (same envelope as login) and handles guest cart merge.
- Changes to `AuthProvider`, `useAuth`, or `AuthContext` — the context is correct.
- `?redirect=` deep-link use-cases for `/register` (only added to be consistent with login;
  the primary flow is always redirect-to-`/`).

---

## User Stories

1. As a new customer, I want to be automatically redirected to the home page after
   registering, so that I can start browsing immediately without a manual reload.
2. As a new customer, I want the header to show my account controls immediately after
   registering, so that I can see I am logged in without reloading the page.

---

## Root-Cause Investigation

### Investigation Step 1 — Confirm backend response shape parity

The prime suspect is whether `res?.data?.accessToken` resolves to a truthy string in the
register mutation's `onSuccess` callback.

**What to verify:**

- The Orval-generated return type for `useAuthControllerRegister` is
  `AuthControllerRegister201`, defined as:

  ```ts
  // authControllerRegister201.ts
  export type AuthControllerRegister201 = AuthResponseEnvelope & {
    data?: AuthTokens;
  };
  ```

  where `AuthResponseEnvelope` is `{ [key: string]: unknown }` (index signature) and
  `AuthTokens` is `{ accessToken: string; refreshToken: string }`.

- The controller returns `{ data: { accessToken: tokens.accessToken } }` (HTTP 201).
  The `refreshToken` field is NOT in the body — it goes into a cookie. So
  `res.data.accessToken` should resolve correctly.

- However, because `AuthResponseEnvelope` is a plain index type and `data` is typed as
  `AuthTokens | undefined`, TypeScript sees `res?.data?.accessToken` as `string | undefined`.
  At runtime the accessor chain works — **but only if `res.data` itself is the nested
  `data` key, not the Axios response's `data` wrapper**.

  The `customInstance` (Orval's HTTP adapter) is expected to unwrap the Axios `response.data`
  layer and return the inner payload directly. **Confirm this is the case** — if it returns
  the raw Axios response, then `res.data` is the `{ data: { accessToken } }` envelope and
  `res.data.accessToken` is `undefined`.

**Conclusion to verify:** Open `apps/store-client/src/shared/api/instance.ts` and confirm
that `customInstance` returns `response.data` (the API envelope) not the full Axios object.
If it does, then `res.data.accessToken` in the register handler is looking one layer too deep.
The correct path would be `res?.accessToken` or `res?.data?.accessToken` depending on how
`customInstance` unwraps.

**Note:** In the existing MSW handler for register
(`apps/store-client/src/shared/test/msw-handlers.ts:140-145`):

```ts
http.post("*/api/auth/register", () =>
  HttpResponse.json(
    { data: { accessToken: "test.access.token" } },
    { status: 201 },
  ),
),
```

The mock returns `{ data: { accessToken } }`. If `customInstance` already strips the
outer `data` key, then `res` in `onSuccess` is already `{ accessToken }`, and the
register form must access `res?.accessToken` — yet the code says `res?.data?.accessToken`.
This discrepancy, if confirmed, is the primary bug: `token` is always `undefined`,
`setTokens` never fires, `isAuthenticated` stays `false`, and the header stays in guest state.
The `router.push("/")` still fires but the auth context never updates, so the header never
re-renders into the authenticated state.

**Compare with login:** `login-form.tsx` has the identical accessor `res?.data?.accessToken`
and works — so either (a) `customInstance` does NOT strip the outer layer (both work), or
(b) both forms have the same token-extraction bug but login _appears_ to work via the
`useEffect` that watches `isAuthenticated` on mount (it can fire on a prior session restore
race). This is the secondary question for the investigation.

### Investigation Step 2 — The missing `useEffect` / `isAuthenticated` reactive path

`login-form.tsx` has:

```ts
useEffect(() => {
  if (isAuthenticated) {
    router.replace(redirectTarget);
  }
}, [isAuthenticated, router, redirectTarget]);
```

`register-form.tsx` has none. This `useEffect` is what makes the header appear to "work"
on login: even if the imperative `router.push` fires before the React state update
propagates, the effect triggers a second render after `isAuthenticated` becomes `true`,
which causes `HeaderAuth` (which reads `isAuthenticated` from `useAuth()`) to re-render into
the authenticated state.

Without the `useEffect`, the navigation may complete before the context state update is
committed to the tree in a given render cycle, leaving the header stuck in guest state until
the next navigation event or page reload.

### Summary of Expected Root Cause

Two compounding issues, both from the missing parity with login:

1. **Missing `useEffect`** — the reactive re-render that ensures `HeaderAuth` and other
   consumers of `isAuthenticated` flip to authenticated state is absent. This is the
   **primary cause** of the header staying in guest state.
2. **Missing `?redirect=` support** — cosmetic/consistency gap, not a functional bug.

The token extraction path (`res?.data?.accessToken`) should be confirmed to be identical to
login; if both work or both are broken the `useEffect` fix resolves the symptom either way.

---

## Technical Design

### Frontend Only — No Backend Changes

#### What changes in `register-form.tsx`

1. Import `useEffect` from React.
2. Destructure `isAuthenticated` from `useAuth()` (it is already imported).
3. Add `useSearchParams` from `next/navigation` (already imported in login).
4. Compute `redirectTarget` with the same open-redirect guard used in login.
5. Add `useEffect(() => { if (isAuthenticated) router.replace(redirectTarget); }, [isAuthenticated, router, redirectTarget])`.
6. Update the `router.push` call in `onSuccess` to use `redirectTarget`.

#### Files to modify

| File                                                       | Change                                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `apps/store-client/src/features/auth/ui/register-form.tsx` | Mirror login's `useEffect`, `isAuthenticated` read, `useSearchParams`, `redirectTarget`, open-redirect guard |

#### Test file to create

| File                                                            | Description                                                                           |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `apps/store-client/src/features/auth/ui/register-form.test.tsx` | RTL component test (jsdom project) covering success redirect + header auth state flip |

---

## Tasks

### TASK-121-A: Confirm `customInstance` unwrapping and token-extraction path

**Type:** fix (investigation step, inline with implementation)
**Scope:** store-client
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] Read `apps/store-client/src/shared/api/instance.ts` and confirm whether `customInstance`
      returns `response.data` (the envelope) or the raw Axios response object.
- [ ] Confirm that `res?.data?.accessToken` in `onSuccess` is correct given the above; if
      the accessor path is wrong, correct it (e.g. to `res?.accessToken`) to match the actual
      return shape.
- [ ] After the check, the `token` variable in `onSuccess` must be a truthy string for a
      successful register response; add a `console.warn` or TypeScript assertion to document
      the expected shape as a comment.

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/register-form.tsx` — fix token accessor if needed

---

### TASK-121-B: Align register success path with login (core fix)

**Type:** fix
**Scope:** store-client
**Complexity:** S (1 h)
**TDD Required:** No
**Depends on:** TASK-121-A

**Acceptance Criteria:**

- [ ] `register-form.tsx` imports `useEffect` from `react` and `useSearchParams` from
      `next/navigation`.
- [ ] `useAuth()` destructures both `setTokens` **and** `isAuthenticated`.
- [ ] A `redirectTarget` variable is derived from `?redirect=` search param, guarded by a
      `startsWith("/")` check (open-redirect prevention), defaulting to `"/"`.
- [ ] A `useEffect` is present that calls `router.replace(redirectTarget)` whenever
      `isAuthenticated` becomes `true`, mirroring the login form exactly.
- [ ] `router.push` in `onSuccess` is updated to use `redirectTarget`.
- [ ] TypeScript `typecheck` passes: `npm run typecheck`.
- [ ] Lint passes: `npm run lint`.

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/register-form.tsx` — add `useEffect`, `isAuthenticated`, `useSearchParams`, `redirectTarget`

---

### TASK-121-C: Add RTL component test for register success/redirect path

**Type:** test
**Scope:** store-client
**Complexity:** M (2–3 h)
**TDD Required:** Yes (write test first — Red — then implement TASK-121-B — Green)
**Depends on:** TASK-121-A (token path confirmed); implement before TASK-121-B to drive it

**Test scenarios to cover:**

1. **Success — redirect fires:** Fill form, submit, MSW returns `{ data: { accessToken: "..." } }` with 201. Assert that `router.push` or `router.replace` is called with `"/"`. (Mock `useRouter` via Jest module mock; the component project uses jsdom.)
2. **Success — no `?redirect=`:** Confirm `redirectTarget` defaults to `"/"`.
3. **`?redirect=` same-origin:** Provide `?redirect=/checkout`, assert redirect lands on `/checkout`.
4. **`?redirect=` absolute URL (open-redirect attempt):** Provide `?redirect=https://evil.com`, assert redirect defaults to `"/"`.
5. **Conflict (409):** MSW returns 409, assert the Ukrainian conflict error string is rendered (`dict.auth.register.errorConflict`).
6. **Generic error:** MSW returns 500, assert the generic error string is rendered.

**Note on RTL setup:** The component test project (`*.test.tsx`, jsdom, RTL + MSW via
`@swc/jest`) is already live (TASK-105-A/B). The MSW handler for `POST */api/auth/register`
already exists in `msw-handlers.ts`. The test can use the existing `server.use(...)` pattern
to override per-scenario. `next/navigation` hooks (`useRouter`, `useSearchParams`) must be
mocked via `jest.mock("next/navigation", ...)` — the same pattern used in other component
tests in the project (verify by checking `src/features/checkout/` or `src/features/auth/`
if login-form tests exist).

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/auth/ui/register-form.test.tsx` exists.
- [ ] All 6 scenarios above are implemented and pass.
- [ ] Test file uses `server.use(...)` for per-test MSW overrides, not hand-mocked hooks.
- [ ] `npm run test -w apps/store-client` — all tests green (component project).

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/register-form.test.tsx` — new file

---

### TASK-121-D: Manual QA checklist

**Type:** test (manual)
**Scope:** store-client
**Complexity:** S (20 min on a running stack)
**TDD Required:** No
**Depends on:** TASK-121-B

**Manual QA steps (running stack required):**

1. Start the full stack (`docker compose up -d`, `npm run dev -w apps/store-api`, `npm run dev -w apps/store-client`).
2. Open an incognito window (no existing session).
3. Navigate to `/register`.
4. Fill in a unique email + valid first/last name + password (8+ chars) + confirm.
5. Click "Зареєструватися".
6. **Expected:** Browser navigates to `/` without a manual reload.
7. **Expected:** Header immediately shows "Мій акаунт" and the logout button — NOT "Увійти / Зареєструватися".
8. **Expected:** No full-page reload occurs between form submit and the authenticated header state appearing.
9. Reload the page (`F5`).
10. **Expected:** Header remains in authenticated state (session restored via refresh cookie).
11. Navigate to `/login?redirect=/checkout` and log in.
12. **Expected:** Redirect lands on `/checkout` (verify `?redirect=` works for login as baseline).
13. Register a fresh account at `/register?redirect=/account`.
14. **Expected:** Redirect lands on `/account` (verify new `?redirect=` support on register).
15. Open DevTools → Network. Confirm `POST /api/auth/register` returns HTTP 201 with `{ data: { accessToken: "..." } }` in the response body (confirms token extraction path).

---

## Migration Steps

No Prisma migration. No backend change. Execution order:

1. **TASK-121-A** — Read `instance.ts`, confirm/fix the token accessor path in `register-form.tsx`.
2. **TASK-121-C** (TDD Red) — Write the failing test before the fix.
3. **TASK-121-B** (TDD Green) — Apply the `useEffect` + `isAuthenticated` + `useSearchParams` + `redirectTarget` fix to make tests green.
4. Run `npm run test -w apps/store-client` — verify all tests pass.
5. Run `npm run typecheck` and `npm run lint` — no errors.
6. **TASK-121-D** — Manual QA on a running stack; move to _Pending manual QA_ if automated gates are green.

---

## Risks & Mitigations

| Risk                                                                                                                                         | Mitigation                                                                                                                                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `customInstance` returns the raw Axios response, making `res?.data?.accessToken` look one level too shallow (`res?.data?.data?.accessToken`) | Inspect `instance.ts` in TASK-121-A before writing any code; correct the accessor to match actual runtime shape                                                                                                                                                                                                                                        |
| The `useEffect` guard triggers a double-navigation (imperative `router.push` in `onSuccess` AND `router.replace` in `useEffect`)             | This is the same pattern login uses. The `useEffect` fires only when `isAuthenticated` becomes `true`, which is after `setTokens` commits; `router.push` in `onSuccess` fires first. In practice Next.js merges these into a single navigation. The login form has the same dual navigation; if login does not double-navigate, register won't either. |
| `useSearchParams` requires a `<Suspense>` boundary in Next.js App Router                                                                     | The `/register` page already renders within the root layout, which wraps the page tree in appropriate Suspense boundaries for `store-client`. Verify the register page renders without a build-time error; add a local `<Suspense>` wrapper if needed (same as login page).                                                                            |
| The component test for `useSearchParams` is hard to mock under RTL                                                                           | Use `jest.mock("next/navigation", () => ({ useRouter: jest.fn(), useSearchParams: jest.fn(), ... }))` at the top of the test file; provide a `URLSearchParams`-like stub per scenario.                                                                                                                                                                 |

---

## Notes

- `HeaderAuth` (`apps/store-client/src/widgets/header/ui/header-auth.tsx`) reads
  `isAuthenticated` and `isInitializing` from `useAuth()`. It renders the guest nav when
  `!isAuthenticated`. It is a client component and will re-render whenever the `AuthContext`
  value changes. The `useEffect` in `register-form.tsx` ensures the context has flushed
  before `router.replace` fires, giving `HeaderAuth` an opportunity to re-render with the
  authenticated state before the navigation completes.

- The MSW default handler for `POST */api/auth/register` in `msw-handlers.ts` already
  returns `{ data: { accessToken: "test.access.token" } }` with status 201. This matches
  what the backend returns. No change to handlers is needed for the happy-path test.

- The `AuthResponseEnvelope` generated type (`{ [key: string]: unknown }`) is overly
  permissive. If the token accessor bug (Investigation Step 1) is confirmed, consider
  opening a separate follow-up to tighten the Orval schema for the `AuthControllerRegister201`
  type — but that is out of scope for this fix.

- `docs/conventions/forms.md` (TASK-141): the `useEffect` added in TASK-121-B is a
  _navigation side-effect_ driven by auth state, not a form-field seed guard. It does not
  violate Rule 1 (no `useState` seeded from async server props). No form-state sync concern
  applies here.
