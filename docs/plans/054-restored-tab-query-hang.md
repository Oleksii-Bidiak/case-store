# Plan 054 — Restored-Tab Query Hang (TASK-120)

> **RESOLUTION (2026-06-25):** The reported symptom — reopen browser → `/products`
> spins on skeletons — was diagnosed (via Playwright) as a **Next 16 / Turbopack
> DEV-mode artifact**, NOT app code. A `next start` PRODUCTION build hydrates and
> fetches correctly (20/20 cold + authenticated + back/forward headless loads), and
> the reporter confirmed the hang is absent on the prod build. Extension noise
> (crypto-wallet `code 4900`, adblock) and the auth/CSRF bootstrap were red herrings.
> **No production bug.** The bfcache root-cause analysis below (`refreshPromise`/
> `csrfPromise` singletons, `pageshow`/`resume`/`wasDiscarded` handlers, blanket
> invalidate) was NOT implemented — it over-fit a mechanism the live symptom did not
> exhibit. What shipped instead is a single small _defensive_ hook,
> `useRecoverStrandedQueries` (`shared/lib`, wired in `providers.tsx`): on
> `visibilitychange → visible`, if any query is still `pending`, `cancelQueries()` +
> `refetchQueries({ type: "active" })`. It guards a genuine but separate bfcache
> wedged-query mode (proven by simulation) and is a no-op on a normal tab switch.
> The analysis below is retained as investigation history only — treat it as
> superseded by this banner.
>
> **Status:** Done (code) — manual session-restore QA (TASK-120-E) pending
> **Phase:** Phase A — Stabilize & close out (QA pass triage — priority bugs)
> **Created:** 2026-06-24
> **Last Updated:** 2026-06-25
> **Parent task:** TASK-120
>
> **Done 2026-06-24 (A–D):** `pageshow`/`persisted` reset of the Axios singletons + an
> `AuthProvider` re-bootstrap effect; `ProductList` intentionally left ungated (comment added).
> +2 RTL tests (restore re-fires refresh + invalidates cart; `persisted:false` is a no-op) —
> verified Red→Green. Full gate green: typecheck, lint, 66 tests, clean `.next` build (SSR-safe).
> No backend/Orval changes. The bfcache timing itself still needs real-browser QA (TASK-120-E).
>
> **Follow-up 2026-06-25 (TASK-120-E repro failed — two gaps closed):** user reproduced the hang
> via a **full browser close → reopen** (session restore), which the A–D fix did **not** cover:
>
> 1. **Trigger gap** — that path thaws the tab via Page Lifecycle **`resume`** (and `pageshow`
>    with `persisted: false`), so the bfcache-only `persisted` gate never fired. Added a `resume`
>    listener in both `instance.ts` (singleton reset) and `auth.context.tsx` (recover).
> 2. **Recovery gap** — even when the handler fired, it only invalidated the **cart** query; the
>    wedged **public `useProductControllerFindAll`** (stuck in `fetching` with a dead promise) was
>    never retried → infinite skeleton. Restore now runs a blanket `queryClient.invalidateQueries()`
>    that cancels every dead in-flight fetch and re-issues it live; cart is still re-invalidated
>    after a successful refresh for the authed identity.
>    +2 RTL tests (blanket invalidate on restore; `resume` recover). Gate green: typecheck, lint,
>    68 tests. Redis ruled out by the reporter. Still needs real-browser session-restore QA.

---

## Overview

After reopening the browser (session-restore / bfcache restore), the `/products` page
displays skeleton loaders indefinitely. A manual reload (F5) resolves the hang immediately.
Reproduced on Chrome and Edge. No network error is observed in DevTools — requests are either
never sent, or they are sent and pending forever.

The symptom was first observed during the manual QA pass on HEAD `296b498`, immediately after
the TASK-118 changes (plan 052) were merged. TASK-118 touched `providers.tsx` (provider
nesting swap) and `auth.context.tsx` (added `useQueryClient()` + post-refresh cart
invalidation). Both changes are directly in the bootstrap path and must be considered when
reasoning about this regression.

---

## Root-Cause Analysis

### Confirmed findings (code-visible, high confidence)

#### Finding 1 — `refreshPromise` is a module-level singleton that survives bfcache restore

`apps/store-client/src/shared/api/instance.ts` defines:

```ts
let refreshPromise: Promise<string | null> | null = null;
```

This is a module-level variable. When the browser performs a normal page **reload** (F5),
the JavaScript module is re-evaluated: `refreshPromise` initialises to `null`, and everything
works correctly.

When the browser performs a **bfcache restore** (the page was frozen and is now thawed —
this is the mechanism used by "reopen last session" and tab restore), the JavaScript VM state
is **preserved exactly as it was at freeze time**. Module initialisation does NOT re-run. If a
`refreshPromise` was in-flight (non-null) at the moment of freeze, the variable still points to
that same `Promise` object after restore. The underlying network request was aborted by the
browser when the tab was frozen, so that `Promise` will **never settle**. Its `.finally()` that
resets `refreshPromise = null` will never execute.

Consequence: after bfcache restore, `refreshAccessToken()` always returns the hung promise.
Any Axios response-interceptor path that calls `refreshAccessToken()` (i.e. any 401 response)
will `await` forever. React Query retries mark the query as loading indefinitely.

This is the primary root cause of the "spins forever, reload fixes it" symptom.

#### Finding 2 — `csrfPromise` has the identical problem

`apps/store-client/src/shared/api/instance.ts` also defines:

```ts
let csrfPromise: Promise<string | null> | null = null;
```

Same singleton pattern. If the CSRF prefetch was in-flight at freeze time, `csrfPromise`
is left pointing to a hung promise. Any subsequent mutating request without an access token
(e.g. the bootstrap `POST /api/auth/refresh` itself on restore) will call
`ensureCsrfToken()`, which returns the hung promise, blocking the entire request.

This means `isInitializing` in `AuthProvider` can also get stuck `true` — the bootstrap
`api.post("/api/auth/refresh")` never resolves because its own request interceptor is
waiting for `csrfPromise` to settle. This is a secondary path to the same symptom.

#### Finding 3 — `ProductList` has no `isInitializing` gate (unlike cart queries)

`apps/store-client/src/widgets/product-list/ui/product-list.tsx`:

```ts
const { data, isPending, isError } = useProductControllerFindAll(params);
```

No `enabled` option. This is correct in isolation — `GET /api/products` is a public endpoint
that does not require authentication. Under normal conditions it resolves quickly regardless of
`isInitializing`.

However, after bfcache restore + a stuck `refreshPromise`, if any 401 is encountered anywhere
in the Axios response pipeline, the entire response interceptor chain blocks. More directly:
if the products query fires while `isInitializing` is stuck `true` (because the bootstrap
refresh is itself blocked by a stuck `csrfPromise` — Finding 2), and the products endpoint
happens to return a 401 (unlikely but possible for authenticated variants), the response
interceptor will deadlock.

The more likely path: products queries resolve fine from the network, but because cart and
other queries share the same `QueryClient`, the hung auth bootstrap (stuck `isInitializing`)
makes the page _appear_ to spin because cart widgets, the header badge, `CheckoutView`, and
`OrderConfirmationView` are all gated on `!isInitializing`. The page is blocked waiting for a
bootstrap that never completes.

#### Finding 4 — `AuthProvider` `useEffect` cleanup (`active = false`) does NOT protect against bfcache restore

The `useEffect` in `auth.context.tsx` returns a cleanup (`active = false`) that prevents
stale state updates after unmount. On bfcache restore, React components are **not unmounted
and remounted** — the existing component tree is thawed from the frozen state. The `useEffect`
does not re-run; the `active` variable retains its prior value (could be `true` or `false`
depending on timing at freeze). `isInitializing` retains whatever value it had at freeze
(likely `true` if the refresh was in-flight).

A proper bfcache restore handler requires listening to the `pageshow` event with
`event.persisted === true`, which the current code does not do.

#### Finding 5 — `Axios.CancelToken` (deprecated) used in `customInstance`

`customInstance` creates an `Axios.CancelToken.source()` per request. This is the old
cancellation API (deprecated in Axios 0.22+). On bfcache restore, any `CancelToken`-based
requests from the prior lifecycle that were cancelled by the browser will have their
`cancel()` method inert (they are already settled). This is not the primary cause of the hang,
but it creates orphaned cancel-token instances and is a hygiene issue. Modern Axios supports
`AbortController` / `signal` natively and should be used instead.

---

### Candidate suspects not fully ruled out without a running stack (medium confidence)

| Suspect                                                                                   | Analysis                                                                                                                                                                                                | Confidence without live repro                                                   |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `refreshPromise` module singleton stuck after bfcache                                     | Mechanism is fully visible in code; bfcache behaviour is well-documented. The "reload fixes it" invariant matches exactly: F5 re-evaluates the module, clearing the singleton.                          | HIGH — code proves the mechanism; live repro would confirm triggering condition |
| `csrfPromise` module singleton stuck after bfcache                                        | Same reasoning as above, secondary path. Would block `POST /api/auth/refresh` itself.                                                                                                                   | HIGH                                                                            |
| `isInitializing` stuck `true` after bfcache freeze mid-refresh                            | Follows from Finding 2 (csrfPromise stuck → bootstrap POST never resolves → `finally` never sets `isInitializing = false`). Explains why all `isInitializing`-gated queries spin.                       | HIGH                                                                            |
| `pageshow`/bfcache not handled anywhere                                                   | No `addEventListener('pageshow', ...)` found in any source file. This is a confirmed gap.                                                                                                               | HIGH — grep confirmed absence                                                   |
| Product query appearing stuck because OTHER components gated on `isInitializing`          | Even if `GET /api/products` resolves, the page may appear entirely broken because of cart badge / header / layout components stuck in init.                                                             | MEDIUM — depends on layout rendering                                            |
| Race between TASK-118's `queryClient.invalidateQueries(cartQueryKey)` and bfcache restore | On restore, `queryClient` instance is the same object as at freeze. Invalidations queued in the prior lifecycle may replay or be lost depending on React Query's internal state. Requires live testing. | MEDIUM                                                                          |

---

### TASK-118 Interaction Assessment

TASK-118 (plan 052) is **implicated as a contributing factor, not the root cause**:

1. **Provider nesting swap** (`QueryClientProvider` wraps `AuthProvider`): this change is
   correct and safe. It does not affect the bfcache path.

2. **`AuthProvider` now calls `useQueryClient()`** and invalidates the cart after a
   successful refresh: this is also correct. However, it adds a new asynchronous side-effect
   (`void queryClient.invalidateQueries(...)`) that fires from within the bootstrap `useEffect`.
   On bfcache restore, if the bootstrap effect does not re-run (which it does not), this
   invalidation never fires. This is expected behaviour given the underlying bfcache gap, not
   a defect introduced by TASK-118 itself.

3. **The `isInitializing` gate on cart queries** (TASK-118-A/B): this is what makes the
   symptom visible for cart queries. But the same gate should NOT be applied to the products
   query (products are public) — the products query spinning confirms the bfcache + stuck
   `csrfPromise`/`refreshPromise` path is in play for other reasons.

**Conclusion:** TASK-118 did not introduce the bfcache deadlock (the singleton pattern predates
it), but TASK-118's `isInitializing` gate means that the stuck-`isInitializing` path from
Finding 3/4 now also blocks cart queries that previously would have fired as guests and at
least partially resolved. The bug was latent before TASK-118 and is now more visible.

---

## Dependencies

| Dependency                              | Status | Notes                                                                                                                                                                  |
| --------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TASK-118 (plan 052, guest-cart merge)   | Done   | Directly touched `providers.tsx` + `auth.context.tsx`; must not be regressed                                                                                           |
| TASK-119 (plan 053, checkout redirect)  | Done   | No shared files; no conflict                                                                                                                                           |
| TASK-122 (store-admin logout-on-reload) | To Do  | Admin `auth.context.tsx` has the same `refreshPromise`-free structure but may need the same `pageshow` handler; co-investigate                                         |
| TASK-112 (store-admin path fix)         | Done   | Known-good pattern: `api.post("/api/auth/refresh")` with correct path; no singleton issue in admin because `refreshPromise` is in the store-client `shared/api` module |

---

## Scope

### In Scope

- Fix the `refreshPromise` and `csrfPromise` module-level singletons so they cannot get stuck
  after a bfcache restore (reset them on `pageshow` with `event.persisted`).
- Add a `pageshow` event listener in `AuthProvider` to re-trigger the bootstrap effect on
  bfcache restore (so `isInitializing` resets and the refresh fires again with a clean state).
- Add a `pageshow` listener to `instance.ts` to reset the singleton promise variables on restore.
- Regression tests covering the reset behaviour where testable (unit tests on the reset logic).
- Manual QA checklist for cold-tab-restore in Chrome and Edge (cannot be fully automated).

### Out of Scope

- Migrating `customInstance` from deprecated `Axios.CancelToken` to `AbortController` / `signal`
  (tracked as a separate hygiene task; not blocking).
- Applying the same fix to `store-admin` (TASK-122 owns that investigation; cross-reference this
  plan if the fix pattern applies there).
- Any changes to the backend.
- Orval regeneration — no new API endpoints.
- Changes to the `isInitializing` gate itself (it is correct; the problem is that it can get
  stuck, not that it exists).

---

## User Stories

1. As a storefront visitor, I want product listings and the cart to load correctly when I
   reopen the browser after a previous session, so that I do not have to manually refresh the
   page to use the store.

2. As a developer, I want the authentication bootstrap to recover automatically after a
   bfcache/session-restore event, so that module-level promise singletons in the Axios instance
   can never remain hung from a prior page lifecycle.

---

## Technical Design

### Root fix — reset singletons and re-run bootstrap on bfcache restore

#### Part A: Reset `refreshPromise` and `csrfPromise` on `pageshow` (instance.ts)

Add a `pageshow` listener to `instance.ts` that fires when the browser restores the page from
the back-forward cache (`event.persisted === true`). On restore, null both singletons so the
next caller creates a fresh promise against the live network:

```ts
// apps/store-client/src/shared/api/instance.ts — add after singleton declarations

if (typeof window !== "undefined") {
  window.addEventListener("pageshow", (event: PageTransitionEvent) => {
    if (event.persisted) {
      // Page was restored from bfcache. Any in-flight singleton promises from
      // the prior lifecycle will never settle (their requests were cancelled by
      // the browser during freeze). Reset them so the next request creates a
      // fresh one against the live network.
      refreshPromise = null;
      csrfPromise = null;
    }
  });
}
```

This is safe because:

- The listener is added once at module initialisation.
- On bfcache restore, the module is NOT re-evaluated (it is thawed), so the listener from the
  prior lifecycle is still registered, and fires on the `pageshow` event.
- On a normal reload (F5), the module IS re-evaluated, the singletons are already `null`, and
  a fresh listener is registered.
- The `typeof window !== "undefined"` guard prevents SSR errors.

#### Part B: Re-run AuthProvider bootstrap on bfcache restore (auth.context.tsx)

On bfcache restore, React's `useEffect` does not re-run. The `isInitializing` state is frozen
at whatever value it had before freeze (likely `true` if the refresh was in-flight). Add a
`pageshow` listener inside `AuthProvider` via a second `useEffect` that resets `isInitializing`
to `true` and re-fires the refresh:

```tsx
// apps/store-client/src/entities/session/model/auth.context.tsx

// Existing bootstrap effect (unchanged except for the `active` dependency on a ref):
useEffect(() => {
  // ... existing code, no changes needed here
}, [setTokens, queryClient]);

// NEW: re-bootstrap on bfcache restore
useEffect(() => {
  const handlePageShow = (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    // The singleton promises have already been reset by instance.ts's pageshow
    // handler (which fires in the same event loop turn). Re-run the bootstrap.
    setIsInitializing(true);
    void (async () => {
      try {
        const res = await api.post<{ data?: { accessToken?: string } }>(
          "/api/auth/refresh",
        );
        const token = res.data?.data?.accessToken;
        if (token) {
          setTokens(token);
          void queryClient.invalidateQueries({
            queryKey: getGetCartQueryKey(),
          });
        }
      } catch {
        // Guest on restore — no-op.
      } finally {
        setIsInitializing(false);
      }
    })();
  };

  window.addEventListener("pageshow", handlePageShow);
  return () => window.removeEventListener("pageshow", handlePageShow);
}, [setTokens, queryClient]);
```

Note: the `pageshow` handler does not use an `active` flag because bfcache restores are
synchronous re-activations — there is no unmount between freeze and restore. The cleanup
`removeEventListener` fires on actual unmount (component tree torn down).

#### Part C: Consider whether `ProductList` needs an `isInitializing` guard

Currently `ProductList` has no `enabled` gate. Under the fixed code:

- `GET /api/products` is public and will always resolve once the network is live.
- `isInitializing` will be temporarily `true` on restore but will settle within one
  refresh round-trip (~100–300 ms).

Adding `enabled: !isInitializing` to the products query would prevent the skeleton from
resolving until auth bootstrap completes, which is unnecessary and undesirable for a public
endpoint. The correct fix is Parts A+B above. Do NOT add an auth gate to the products query.

#### Part D: Regression tests

Since bfcache restore cannot be simulated in Jest, tests focus on the testable unit:
the `pageshow` handler logic that resets singletons and re-triggers the bootstrap.

Test approach for `auth.context.tsx`:

- Dispatch a synthetic `pageshow` event with `persisted: true` on `window` and assert that
  `isInitializing` transitions to `true` then back to `false` after the mock refresh resolves.
- Assert that `invalidateQueries` is called after a successful restore refresh.

Test approach for `instance.ts`:

- Directly test the exported reset path: expose a `__resetSingletonsForTest()` function
  (dev/test only) OR test indirectly by dispatching `pageshow` events in the module's scope.
  The simpler approach is to wrap the singleton variables in getter/setter functions for
  testability without polluting the public API (the pattern used by `getAccessToken` /
  `setAccessToken` already in the file).

---

## Sub-Tasks

### TASK-120-A: Reset `refreshPromise` and `csrfPromise` on bfcache restore in instance.ts

**Type:** fix
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No (unit-testable but the primary validation is manual bfcache repro)
**Depends on:** none

**Acceptance Criteria:**

- [x] A `pageshow` event listener is added to `window` inside `instance.ts` with an
      `if (typeof window !== "undefined")` SSR guard.
- [x] When `event.persisted` is `true`, both `refreshPromise` and `csrfPromise` are set to
      `null`.
- [x] When `event.persisted` is `false` (normal navigation), the listener is a no-op.
- [x] `npm run lint -w apps/store-client` passes with no new warnings.
- [x] `npm run typecheck -w apps/store-client` passes.
- [x] `npm run build -w apps/store-client` succeeds (SSR safety check) — all routes generated.

**Files to create/modify:**

- `apps/store-client/src/shared/api/instance.ts` — add `pageshow` singleton reset

---

### TASK-120-B: Re-run AuthProvider bootstrap on bfcache restore

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No (see TASK-120-D for tests)
**Depends on:** TASK-120-A (singleton reset must fire before bootstrap re-runs)

**Acceptance Criteria:**

- [x] A second `useEffect` in `AuthProvider` adds a `pageshow` listener on mount and removes
      it on unmount.
- [x] When `event.persisted` is `true`, `setIsInitializing(true)` is called immediately and
      the bootstrap `POST /api/auth/refresh` is re-executed asynchronously.
- [x] After the restore refresh succeeds, `setTokens(newToken)` is called and the cart query
      is invalidated (matching the existing bootstrap effect's success path).
- [x] After the restore refresh fails (no cookie), `isInitializing` is set to `false`
      (matching the existing bootstrap effect's failure path).
- [x] The new `useEffect` has a proper cleanup (`removeEventListener`).
- [x] The existing bootstrap `useEffect` is unchanged.
- [x] `npm run lint -w apps/store-client` passes.
- [x] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/entities/session/model/auth.context.tsx` — add bfcache restore effect

---

### TASK-120-C: Confirm `ProductList` needs no `isInitializing` gate (code review + comment)

**Type:** refactor (comment only — no logic change)
**Scope:** store-client
**Complexity:** S (30 min)
**TDD Required:** No
**Depends on:** none (can be done in parallel)

**Acceptance Criteria:**

- [x] A short inline comment in `product-list.tsx` explains that `useProductControllerFindAll`
      intentionally has no `enabled` gate because `GET /api/products` is a public endpoint
      that does not depend on auth state.
- [x] No logic changes are made to `product-list.tsx`.
- [x] `npm run lint -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — add explanatory comment

---

### TASK-120-D: Regression tests for bfcache restore paths

**Type:** test
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** Yes (write failing tests first, then implement fixes in 120-A/B, then verify green)
**Depends on:** TASK-120-A, TASK-120-B

**Acceptance Criteria:**

- [x] Appended a bfcache `describe` block to existing `auth.context.test.tsx`:
  - `pageshow` with `persisted: true` re-fires the refresh; on success `invalidateQueries` is
    called with the cart query key and `isInitializing` settles back to `false` (probe "ready").
    **Verified Red→Green**: fails with the `pageshow` listener disabled, passes with it on.
  - `pageshow` with `persisted: false` is a no-op (refresh count stays 1, no invalidation).
- [~] Direct `instance.ts` singleton-reset unit test: **not added** — the singletons are
  module-private `let`s with no test seam, and exposing one purely for tests would pollute
  the API. The reset is covered indirectly (the restore refresh would hang without it) and
  by the manual bfcache QA (TASK-120-E). Documented as manual-only per the plan's allowance.
- [x] Tests use the RTL + MSW setup from `shared/test/`.
- [x] `npm run test -w apps/store-client` passes — **66 tests / 15 suites** (run `--runInBand`).
- [x] `npm run lint -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/entities/session/model/auth.context.test.tsx` — extend with bfcache cases
  OR new file `auth.context.bfcache.test.tsx`

---

### TASK-120-E: Manual QA — bfcache restore repro in Chrome + Edge

**Type:** test (manual)
**Scope:** store-client
**Complexity:** S (1h, on a running stack)
**TDD Required:** No
**Depends on:** TASK-120-A, TASK-120-B, TASK-120-C, TASK-120-D

**Acceptance Criteria:**

- [ ] Session-restore repro steps executed in Chrome (see QA Checklist below).
- [ ] Session-restore repro steps executed in Edge.
- [ ] `/products` page loads correctly after bfcache restore (no infinite skeleton).
- [ ] Cart badge and cart page load correctly after bfcache restore.
- [ ] Checkout and account pages load correctly after bfcache restore (isInitializing-gated).
- [ ] Manual reload (F5) still works as expected (no regression from the pageshow handler).
- [ ] Incognito / fresh session (no prior cookies) works without errors.

**Files to create/modify:**

- None — manual validation step only.

---

## Execution Order

```
TASK-120-A (instance.ts reset)
    └──> TASK-120-B (AuthProvider restore effect)  ─────> TASK-120-D (tests)
TASK-120-C (comment — parallel)                                  │
                                                                  └──> TASK-120-E (manual QA)
```

Recommended implementation order:

1. TASK-120-C — no logic change, quick win, documents intent.
2. TASK-120-A — the singleton reset (foundational fix).
3. TASK-120-B — the bootstrap re-trigger (depends on A being in place first so tests pass).
4. TASK-120-D — regression tests (TDD: write the pageshow test first, confirm it fails on the
   unfixed code, then apply the fixes and verify green).
5. TASK-120-E — manual QA on a running stack with Chrome/Edge session-restore.

---

## Risks & Mitigations

| Risk                                                                                                                                                                        | Likelihood                                                                                                                                            | Mitigation                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pageshow` listener in `instance.ts` fires on normal page navigations (SPA route changes) in addition to bfcache restores                                                   | Low — the `event.persisted` flag is only `true` for actual bfcache/session restores; normal SPA navigation does not fire `pageshow`                   | Verify via manual QA that SPA navigation does not trigger the reset                                                       |
| Double bootstrap on restore if both the frozen `useEffect` and the new `pageshow` handler fire                                                                              | Low — the frozen `useEffect` does NOT re-run on bfcache restore (React does not remount); only the `pageshow` handler fires                           | Confirmed by React/bfcache documented behaviour; add an assertion in the D tests                                          |
| `setIsInitializing(true)` on restore triggers a flash of skeleton even when the user had a healthy session                                                                  | Medium                                                                                                                                                | The skeleton flash lasts one refresh round-trip (~100–300 ms). Acceptable UX trade-off against infinite spin.             |
| The `pageshow` handler fires on the initial page load (`event.persisted === false`) and runs the no-op branch — adds one extra listener per mount                           | Low                                                                                                                                                   | `removeEventListener` in the `useEffect` cleanup handles this. The no-op branch (`if (!event.persisted) return`) is safe. |
| Fix can only be fully validated on a running stack with actual bfcache behaviour                                                                                            | High — bfcache restore is timing/browser-specific and cannot be simulated in Jest                                                                     | TASK-120-E is a mandatory manual QA step. Add to the Pending manual QA list in BACKLOG.md.                                |
| Store-admin has the same bfcache gap (TASK-122) but a different `auth.context.tsx`                                                                                          | Medium — admin has no `refreshPromise` issue (no response interceptor), but `isInitializing` can still get stuck if its own bootstrap hangs at freeze | Investigate as part of TASK-122; cross-reference this plan.                                                               |
| React Query `refetchOnWindowFocus` fires on bfcache restore (the browser emits a focus event) and may create a stampede of refetches simultaneously with the pageshow reset | Low — with the 5-minute `staleTime` in `providers.tsx`, most queries are considered fresh and `refetchOnWindowFocus` is a no-op                       | Monitor during TASK-120-E QA                                                                                              |

---

## Manual QA Checklist (TASK-120-E, on a running stack)

### Prerequisites

- Running stack: API on `:3001`, store-client on `:3000`.
- Chrome v120+ or Edge v120+ (bfcache support is reliable in these versions).
- At least one product in the database.

### Repro steps (session-restore / "Reopen closed tabs")

1. Open `http://localhost:3000/products`. Confirm products load.
2. Close the browser (Chrome/Edge: File → Close, or Ctrl+Shift+W for all windows).
3. Reopen the browser. Select "Restore tabs" / last session. The products tab should be
   restored from bfcache.
4. **Before fix:** skeleton spinners are visible and never resolve.
5. **After fix:** products load within ~1 second of restore.

### Repro steps (back-forward cache — F5 vs Back button)

1. Open `/products`. Navigate to a product detail page (`/products/[slug]`).
2. Click the browser Back button. The products page is restored from bfcache (not a full reload).
3. **After fix:** products, cart badge, and header load correctly without any skeleton hang.

### Repro steps (manual reload control)

1. Open `/products` as a logged-in user. Confirm products and cart badge show correctly.
2. Press F5 (full reload). Products should load correctly (regression check — must not break).
3. Open `/products` as a guest. Press F5. Products should load (no auth required).

### Repro — gated pages after restore

1. As a logged-in user, open `/account` and close/reopen browser.
2. **After fix:** account page loads (or redirects to login if the session cookie expired);
   it does NOT spin indefinitely.
3. As a logged-in user, open the cart page and close/reopen browser.
4. **After fix:** cart loads correctly (isInitializing resolves via the restore bootstrap).

### Regression — TASK-118 behaviours must still pass

- Guest cart merge (guest adds items → login → items present without reload).
- Reload while logged in (cart correct, not empty).
- These are already in the TASK-118 manual QA checklist (plan 052).

---

## Notes

- The `pageshow` event is the correct and standards-compliant way to detect bfcache restores.
  The MDN-recommended pattern is: `window.addEventListener('pageshow', e => { if (e.persisted) { ... } })`.
  Chrome DevTools Application → Back/Forward Cache can be used to verify eligibility and
  debug restore failures.
- The `active` cleanup flag in the existing `AuthProvider` `useEffect` guards against the
  normal unmount-while-async-in-flight case. It does not need to be changed. The new
  `pageshow` effect is separate.
- The `store-admin` app has its own `apps/store-admin/src/shared/api/instance.ts`. That
  instance should be checked for the same singleton pattern when TASK-122 is investigated.
  If it has a `refreshPromise` equivalent, apply the same `pageshow` reset there.
- The `Axios.CancelToken` deprecation in `customInstance` is tracked separately as a hygiene
  item. Migrating to `AbortController`/`signal` would also help with bfcache by allowing
  React Query to abort in-flight requests via `signal` before they enter the response
  interceptor, but this is not required for the fix here.
- Plan 052 (TASK-118) risk table explicitly flagged "restored-tab queries" as a related risk:
  _"The `isInitializing` window is the single `/api/auth/refresh` round-trip (~50–200 ms)."_
  That risk materialised: the window is infinite on bfcache restore, not 50–200 ms.
