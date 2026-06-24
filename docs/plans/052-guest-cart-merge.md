# Plan 052 — Guest→User Cart Merge Fix (TASK-118)

**Phase:** Phase A — Stabilize & close out (QA pass triage — critical bugs)
**Status:** Done (code) — manual reload/login QA pending
**Created:** 2026-06-24
**Last Updated:** 2026-06-24
**Parent task:** TASK-118

---

## Overview

When a guest accumulates a cart (tracked by the `cartToken` HttpOnly cookie) and then logs in
or registers, the expectation is that the guest cart items are merged into the user's server-side
cart. The symptom is:

1. Immediately after login: the old guest cart is still visible (stale React Query cache).
2. After a full page reload: the cart is empty (user's cart appears to have no items).

The backend merge logic (`CartService.mergeGuestCart`, invoked inside
`AuthController.mergeGuestCartIfPresent`) is already implemented and correct. The bug is
entirely in the frontend — two distinct failure points.

---

## Root-Cause Analysis

### Failure 1 — Stale guest-cart cache visible immediately after login

`login-form.tsx` and `register-form.tsx` call `queryClient.invalidateQueries(...)` in the
mutation `onSuccess` callback. This marks the `["/api/cart"]` cache entry as stale and schedules
a background refetch, but it does **not** `await` the refetch. `router.push()` fires
immediately afterward, navigating to a new route. If the receiving page (`/` or the redirect
target) also renders the cart widget (e.g. header badge), it reads the stale guest-cart data from
the cache before the background refetch has completed and the merged user cart has arrived. The
user sees the old item list for a brief moment (or for the entire render cycle if the refetch is
slow).

### Failure 2 — Cart empty after full page reload (the critical path)

On page reload the following sequence occurs:

1. `AuthProvider` mounts and fires a silent `POST /api/auth/refresh` to restore the session from
   the HttpOnly refresh cookie. While this request is in-flight `isInitializing` is `true`.
2. **At the same time**, `CartView` (and/or the header cart badge) mount and `useGetCart`
   fires immediately — **there is no `isInitializing` guard**. Because the in-memory access
   token has not yet been set (the refresh call has not resolved), the `GET /api/cart` request
   goes out as a **guest** with no `Authorization` header.
3. At this point the `cartToken` cookie has already been cleared by the login response
   (server set `maxAge: 0` in the login/register response's Set-Cookie header). The
   `CartIdentityInterceptor` finds neither a valid JWT nor a `cartToken` cookie, so it
   generates a **brand-new UUID guest token**, sets it as the new `cartToken` cookie, and
   returns an empty cart.
4. `AuthProvider` completes the refresh, calls `setTokens(newToken)`, and the in-memory access
   token is updated. But React Query considers the `["/api/cart"]` cache entry **fresh** (it
   just populated it in step 3). No automatic re-fetch is triggered.
5. The user sees an empty cart. The merged items are in the user's server-side cart but are
   never fetched because nothing invalidates the now-stale guest-empty-cart result.

### Why the Backend Is Not at Fault

`AuthController.mergeGuestCartIfPresent` is `await`ed before the response is returned. By the
time the login/register response reaches the browser, the guest cart items have been moved into
the user cart and the `cartToken` cookie has been cleared. The service-layer merge
(`CartService.mergeGuestCart`, including the transactional repository call) is also complete and
tested.

### No Backend Work Required

No new backend endpoints, DTOs, services, or migrations are needed for this fix.

---

## Dependencies

| Dependency                                                 | Status   | Notes                                                   |
| ---------------------------------------------------------- | -------- | ------------------------------------------------------- |
| TASK-116 (cart stepper sync + `useDebouncedCallback`)      | ✅ Done  | Patterns for optimistic cache writes already in place   |
| TASK-121 (post-registration redirect)                      | ⬜ To Do | Shares `register-form.tsx`; fix must not conflict       |
| `AuthProvider` (`entities/session/model/auth.context.tsx`) | Exists   | Needs to expose or act on successful refresh completion |
| `useGetCart` / `getGetCartQueryKey` (`entities/cart`)      | Exists   | Cart query key already exported                         |

---

## Scope

### In Scope

- Gate the initial `useGetCart` call on `AuthProvider.isInitializing: false` in `CartView`
  (and, if applicable, in the header cart badge component).
- After a successful silent refresh on mount, invalidate the cart query so the authenticated
  user's cart is fetched. This is done in `AuthProvider` after the refresh resolves.
- Ensure `login-form.tsx` and `register-form.tsx` `onSuccess` handlers use `invalidateQueries`
  after `setTokens` (already present, but ordering must be verified as correct).
- Add regression tests for the reload path (unit test for `AuthProvider` post-refresh
  invalidation) and for the `CartView` initialization guard.

### Out of Scope

- TASK-121 (post-registration redirect) — a separate task; this plan only fixes the cart.
- TASK-119 (checkout redirect bug) — unrelated.
- Any changes to the backend cart merge, repository, or service layer.
- Orval re-generation — no new API endpoints are added.

---

## User Stories

**As a guest shopper**, I want the items I added before logging in to be available in my cart
immediately after login — without having to reload the page or re-add them.

**As a returning user**, I want my cart to be correct when I land on any page after a full reload —
without seeing an empty cart that disappears or requires a manual refresh.

---

## Technical Design

### Fix A — Gate `useGetCart` on auth bootstrap completion (Failure 2)

`CartView` (and any other component that calls `useGetCart`) must not fire the query before
`AuthProvider` has finished its mount-time refresh attempt. The fix is to pass
`enabled: !isInitializing` to the query:

```tsx
// apps/store-client/src/widgets/cart/ui/cart-view.tsx
const { isInitializing } = useAuth();
const { data, isLoading, isError, refetch } = useGetCart({
  query: { enabled: !isInitializing },
});
```

While `isInitializing` is true, `useGetCart` will not fire. Once `AuthProvider` sets
`isInitializing: false` (regardless of whether the refresh succeeded or failed), the query
becomes enabled and fires with the correct identity — either as an authenticated user (token now
in memory) or as a guest (no token, gets a fresh guest cart).

The header cart badge (`header-cart-badge.tsx`) must receive the same treatment if it also
calls `useGetCart`.

### Fix B — Invalidate cart cache after successful silent refresh (belt-and-suspenders)

As an additional guard: when `AuthProvider`'s mount-time refresh succeeds and returns an access
token (the page-reload path), it should invalidate the cart query so that even if `CartView`
already rendered (race), a refetch with the correct identity is forced.

This requires `AuthProvider` to call `queryClient.invalidateQueries` after `setTokens`. Because
`AuthProvider` does not currently hold a reference to the `QueryClient`, it needs to either:

- Receive `invalidateQueries` as a prop/callback, or
- Be refactored to use `useQueryClient()` internally (safe since `AuthProvider` is already a
  client component inside `<QueryClientProvider>`).

The simpler, cleaner approach is to add `useQueryClient()` inside `AuthProvider` and call
`queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` after a successful token
restore — identical to what `login-form.tsx` already does in its `onSuccess`.

> **Implementation correction (2026-06-24):** the plan assumed `AuthProvider` already sat inside
> `<QueryClientProvider>`. It did NOT — `app/providers.tsx` had `AuthProvider` as the _outer_
> wrapper, so `useQueryClient()` inside it would throw "No QueryClient set". Fixed by swapping the
> nesting (`QueryClientProvider` outermost — the conventional order). Safe: the access token is
> shared via the `setAccessToken` module singleton in `shared/api`, not via context, so provider
> order does not affect token propagation. `getGetCartQueryKey` is imported from the generated
> module (`@/shared/api/generated/cart/cart`) — a downward (entities → shared) import, avoiding a
> cross-entity dependency on `@/entities/cart`.

### Fix C — Verify login/register onSuccess ordering (Failure 1 mitigation)

Both `login-form.tsx` and `register-form.tsx` already call `invalidateQueries` after
`setTokens`. The ordering is correct. The remaining issue is the navigation (`router.push`) fires
before the refetch completes. This is acceptable — React Query will serve the stale cache, then
update in the background. The visual flash of the stale guest cart (if the cache is still warm)
is acceptable UX, as long as the merge result arrives quickly. No code change is required for
this specific sub-issue provided Fix A ensures the reload path is covered.

However, the `register-form.tsx` does not currently redirect to `/` after `setTokens` if
`isAuthenticated` is already truthy — it only has the `useEffect` guard in `login-form.tsx`. This
is tracked by TASK-121 and is out of scope here. The `invalidateQueries` call in
`register-form.tsx` `onSuccess` is already present and correct.

### Fix D — Add component tests for the initialization guard

Following the RTL + MSW pattern established in TASK-105-B (`cart-view.test.tsx`), add test
scenarios that verify:

1. `CartView` renders a loading skeleton (or nothing) while `isInitializing: true`.
2. `CartView` renders the correct merged cart once `isInitializing` becomes `false` and the
   authenticated cart query resolves.

---

## Sub-Tasks

### TASK-118-A: Gate cart query on auth initialization in CartView

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No (covered in TASK-118-D tests)
**Depends on:** none

**Acceptance Criteria:**

- [x] `CartView` reads `isInitializing` from `useAuth()`.
- [x] `useGetCart` is called with `query: { enabled: !isInitializing }`.
- [x] While `isInitializing` is true, `CartView` renders `<CartSkeleton />` (`isInitializing ||
    isLoading` guard) rather than making an API call.
- [x] `npm run lint -w apps/store-client` passes with no new warnings.
- [x] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-view.tsx` — add `isInitializing` guard ✅

---

### TASK-118-B: Gate cart query on auth initialization in header-cart-badge

**Type:** fix
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-118-A

**Acceptance Criteria:**

- [x] `header-cart-badge.tsx` reads `isInitializing` from `useAuth()`.
- [x] `useGetCart` is called with `query: { enabled: !isInitializing }`.
- [x] The badge shows nothing while auth is bootstrapping (count defaults to 0, badge hidden).
- [x] `npm run lint -w apps/store-client` passes.
- [x] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-cart-badge.tsx` — add `isInitializing` guard ✅

---

### TASK-118-C: Invalidate cart query in AuthProvider after successful silent refresh

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** none (can be done in parallel with TASK-118-A)

**Acceptance Criteria:**

- [x] `AuthProvider` calls `useQueryClient()` to obtain the React Query client.
- [x] After a successful `POST /api/auth/refresh` on mount (the session-restore path), the
      provider calls `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })`.
- [x] After a failed refresh (guest user — `catch` branch), no invalidation is triggered.
- [x] `AuthProvider` does not call `invalidateQueries` on logout (unchanged — no change there).
- [x] `npm run lint -w apps/store-client` passes.
- [x] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/entities/session/model/auth.context.tsx` — add `useQueryClient()` +
  post-refresh invalidation ✅
- `apps/store-client/src/app/providers.tsx` — swap nesting so `QueryClientProvider` wraps
  `AuthProvider` (required for `useQueryClient()`; see Fix B correction note) ✅

---

### TASK-118-D: Add regression tests — CartView initialization guard + auth post-refresh cart fetch

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** Yes (write tests first to confirm the bug, then verify the fix)
**Depends on:** TASK-118-A, TASK-118-C

**Acceptance Criteria:**

- [x] New test file `cart-view-auth-init.test.tsx` covers:
  - Loading skeleton shown (no cart title / empty heading) when `isInitializing: true`.
  - Does NOT call `GET /api/cart` while `isInitializing: true` (counting handler asserts 0).
  - Renders cart items + summary once `isInitializing: false` and the handler returns the cart.
- [x] New `auth.context.test.tsx` covers:
  - `AuthProvider` calls `invalidateQueries({ queryKey: getGetCartQueryKey() })` after a
    successful mount-time refresh.
  - `AuthProvider` does NOT call `invalidateQueries` on refresh failure (401 → guest).
- [x] Tests use the RTL + MSW setup from `shared/test/` (TASK-105-A/B).
- [x] `npm run test -w apps/store-client` passes — **60 tests, 14 suites green** (+4 new).
- [x] `npm run lint -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-view-auth-init.test.tsx` — new ✅
- `apps/store-client/src/entities/session/model/auth.context.test.tsx` — new ✅

> **Done 2026-06-24.** Implemented in suggested order (C → A → B → D). All store-client gates green
> (lint, typecheck, 60 tests). Backend untouched, as designed. Pending: manual reload/login QA
> (see checklist below) on a running stack.

---

## Execution Order

```
TASK-118-A  ──────────────────────────────────────────────────┐
                                                               ├──> TASK-118-D (tests)
TASK-118-B (after A)                                           │
                                                               │
TASK-118-C  ──────────────────────────────────────────────────┘
```

Suggested implementation order: TASK-118-C first (pure context change, easy to isolate), then
TASK-118-A, then TASK-118-B, then TASK-118-D (tests written in TDD style: write a failing test
that reproduces the bug described in TASK-118-A, confirm it fails, then apply the fix and confirm
it passes).

---

## Risks & Mitigations

| Risk                                                                                  | Likelihood | Mitigation                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Adding `useQueryClient()` to `AuthProvider` couples the session entity to React Query | Low        | `AuthProvider` already imports from `@tanstack/react-query` (no new dep). Cart invalidation is a documented side-effect of authentication — acceptable coupling at the entities layer boundary. |
| `enabled: false` + skeleton flash on every cold load (even for guests)                | Medium     | The `isInitializing` window is the single `/api/auth/refresh` round-trip (~50-200 ms). The skeleton is already used for the loading state; the extra 50-200 ms is imperceptible.                |
| TASK-121 (register redirect) may conflict with `register-form.tsx` changes            | Low        | TASK-118 does not modify `register-form.tsx`. The `onSuccess` call to `invalidateQueries` is already correct. TASK-121 only adds a `router.replace("/")` redirect on the register success path. |
| MSW test for `AuthProvider` is hard to isolate (context wraps children)               | Medium     | Use the RTL `renderHook` pattern from `shared/test/render.tsx`; wrap with a minimal `QueryClientProvider` + `AuthProvider` fixture.                                                             |

---

## Manual QA Checklist (post-implementation, on a running stack)

- [ ] Guest adds 2 items to cart. Navigates to `/login`. Logs in. Cart badge + cart page shows
      the 2 guest items (merged). No reload required.
- [ ] Same flow but register (`/register` → new account). Same expectation.
- [ ] Guest adds items, closes tab, reopens (new session, `cartToken` still valid). Logs in.
      Items present.
- [ ] Reload the page while logged in. Cart still shows the correct items (not empty).
- [ ] Log out. Cart resets to empty / new guest cart. Log back in. Any items added as guest
      after logout are present (new merge cycle works).
- [ ] Open cart page directly as a fresh guest (no prior items). No flash of wrong data; empty
      cart state is shown correctly without a reload.

---

## Notes

- The `cartToken` cookie uses `path: '/api'` and `sameSite: 'strict'` (see
  `apps/store-api/src/cart/cart-identity.types.ts`). The cookie is sent with the login/register
  POST and is cleared by the backend in the same response. No frontend cookie manipulation is
  needed.
- The `CartService.mergeGuestCart` method is already fully tested in
  `apps/store-api/src/cart/cart.service.spec.ts`. No additional backend unit tests are required.
- This plan does NOT modify any backend code. The `@nestjs/cart` and `@nestjs/auth` modules are
  confirmed correct.
- For TASK-076 (wishlist/favorites, future), the same `isInitializing` pattern will need to be
  applied to the wishlist query — reference this plan.
