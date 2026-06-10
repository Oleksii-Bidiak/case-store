# Plan 018: Storefront Auth (store-client)

> **Status:** To Do
> **Phase:** Phase 2 — Storefront & Cart
> **Created:** 2026-06-11
> **Last Updated:** 2026-06-11

## Overview

Add a complete, end-to-end authentication flow to `apps/store-client` — the customer-facing
Next.js storefront. This enables users to log in, register, and log out, and ensures that
all subsequent API calls attach the JWT access token transparently so authenticated cart
operations (and, in Phase 3, checkout) work without any changes to individual feature
components.

**Dependency on Plan 017:** This plan can only begin after TASK-051-J (Orval regeneration)
is complete. The regenerated hooks include updated auth response types, and the new cart
endpoints no longer require authentication — this means the CartPage (TASK-031) does not
depend on auth anymore for basic functionality. However, the frontend auth flow is still
needed so logged-in users see their user cart (merged from their guest cart) and so the
header shows the user's name/logout option.

**Key architectural decisions (fixed):**

1. **Access token storage: in-memory only.** The access token is stored in a React context
   variable (never in `localStorage` or `sessionStorage`). This eliminates XSS token theft.
   On a page refresh, the in-memory token is lost; the app silently calls
   `POST /api/auth/refresh` on load to restore the session from the HttpOnly refresh cookie.

2. **Refresh token: HttpOnly cookie (already implemented on backend).** The backend sets
   `refreshToken` in an HttpOnly cookie scoped to `/api/auth/refresh`. The Axios instance
   uses `withCredentials: true` (already set in `shared/api/instance.ts`) so this cookie
   is sent automatically on refresh calls.

3. **401 interceptor on the Axios instance.** When any API call returns 401, the interceptor
   calls `POST /api/auth/refresh`, stores the new access token in the auth context, and
   retries the original request once. If the refresh also fails (401), the user is logged out.

4. **Cart merge is handled by the backend** (TASK-051-H). The frontend does not need to call
   any merge endpoint. Calling `POST /api/auth/login` (or register) with the `cartToken`
   cookie automatically triggers the backend merge. After login, `queryClient.invalidateQueries`
   on the cart query key causes the CartPage to refetch — showing the merged user cart.

5. **Zod validation for forms.** Both login and register forms use zod schemas (not
   `class-validator`). React Hook Form (`react-hook-form`) with `@hookform/resolvers/zod`
   handles form state and validation messages.

## Current State

- `shared/api/instance.ts` has `withCredentials: true` but NO Authorization header interceptor.
- There is NO `AuthContext`, NO `useAuth` hook, NO session entity in `entities/`.
- Generated auth hooks exist: `useAuthControllerRegister`, `useAuthControllerLogin`,
  `useAuthControllerLogout`, `useAuthControllerRefresh` in
  `apps/store-client/src/shared/api/generated/auth/auth.ts`.
- No login/register pages, no header auth widget.
- The CartPage (TASK-031) assumes auth-optional cart endpoints after Plan 017; this plan
  adds the login/register UI so users can elevate from guest to authenticated.

## User Stories

1. As a guest visitor, I want to register with my email and password, so that I can have
   a persistent user account for future purchases.
2. As a registered user, I want to log in, so that my user cart (with previously merged
   guest items) is loaded and my session is maintained across page reloads.
3. As a logged-in user, I want to log out, so that my session is terminated and my access
   token is cleared.
4. As a logged-in user, I want my session to be automatically restored when I reload the
   page, so that I do not have to log in again on every visit.
5. As a visitor, I want to see a login/register option in the header, so that I can
   identify how to sign in.
6. As a logged-in user, I want to see my name (or email) in the header with a logout
   button, so that I can confirm I am signed in and easily sign out.

## Technical Design

### FSD Layer Structure

```
shared/
  api/
    instance.ts          — add Authorization interceptor + 401→refresh retry
entities/
  session/
    index.ts             — barrel: AuthContext, useAuth hook, auth types
    model/
      auth.context.tsx   — React Context + AuthProvider
      use-auth.ts        — useAuth() hook
features/
  auth/
    ui/
      login-form.tsx     — LoginForm component (zod + react-hook-form)
      register-form.tsx  — RegisterForm component
      logout-button.tsx  — LogoutButton component
    index.ts             — barrel
widgets/
  header/
    ui/
      header-auth.tsx    — auth state area in header (conditional login/user display)
    (already exists — update index.ts and header component)
app/
  (auth)/
    login/
      page.tsx           — /login route
    register/
      page.tsx           — /register route
```

### AuthContext and useAuth

```ts
// entities/session/model/auth.context.tsx
interface AuthState {
  accessToken: string | null;
  userId: string | null;
  role: string | null;
  isAuthenticated: boolean;
  isInitializing: boolean; // true while the initial refresh call is in-flight
}

interface AuthContextValue extends AuthState {
  setTokens: (accessToken: string) => void; // called after login/register
  clearTokens: () => void; // called after logout
}
```

`AuthProvider` is a `'use client'` component. On mount (in a `useEffect`), it calls
`POST /api/auth/refresh` to silently restore the session. While the refresh is in-flight,
`isInitializing` is `true` — the app renders a global loading state or skeleton.

The `accessToken` is decoded using a tiny JWT parser (no `jsonwebtoken` dependency; parse
the base64 payload to get `sub` and `role`) to populate `userId` and `role` in the context.
The decoded data is informational only — the server validates the real token on every call.

**Placement in the FSD hierarchy:** `AuthProvider` is registered in `app/providers.tsx` (or
the root `app/layout.tsx` providers wrapper), wrapping `QueryClientProvider`.

### shared/api/instance.ts — Interceptor Update

The Axios `api` instance gets a request interceptor and a response interceptor:

**Request interceptor:**

```ts
api.interceptors.request.use((config) => {
  const token = getAccessToken(); // reads from module-level variable
  if (token) {
    config.headers["Authorization"] = `Bearer ${token}`;
  }
  return config;
});
```

`getAccessToken()` and `setAccessToken(token: string | null)` are module-level functions
that wrap a module-level `let _accessToken: string | null = null`. This avoids coupling the
Axios instance to React Context while allowing the `AuthProvider` to call `setAccessToken`
after login/refresh.

**Response interceptor (401 retry):**

```ts
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as AxiosRequestConfig & {
      _retry?: boolean;
    };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await api.post("/api/auth/refresh"); // uses withCredentials
        const newToken = data?.data?.accessToken;
        if (newToken) {
          setAccessToken(newToken);
          originalRequest.headers = {
            ...originalRequest.headers,
            Authorization: `Bearer ${newToken}`,
          };
          return api(originalRequest); // retry once
        }
      } catch {
        setAccessToken(null);
        // Optionally: dispatch a "session expired" event / redirect to /login
      }
    }
    return Promise.reject(error);
  },
);
```

**Important:** The interceptor must NOT retry refresh calls themselves (the
`POST /api/auth/refresh` URL) — this would create an infinite loop. Gate with
`!originalRequest.url?.includes('/auth/refresh')`.

### features/auth — LoginForm

- Uses `react-hook-form` + `@hookform/resolvers/zod`
- Zod schema: `loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) })`
- On submit: calls `useAuthControllerLogin` mutation from `@/entities/session`
- On success: calls `authContext.setTokens(data.data.accessToken)`, then calls
  `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` to trigger cart
  refresh (so the merged user cart loads immediately), then calls `router.push('/')`
  (or the `redirect` query param if present)
- On error (401): shows "Invalid email or password" inline error
- On error (other): shows "Something went wrong. Please try again." inline error
- Accessible: labels linked to inputs via `htmlFor`/`id`; error messages use `role="alert"`;
  submit button shows loading state while `isPending`

### features/auth — RegisterForm

- Zod schema: `registerSchema = z.object({ email: z.string().email(), firstName: z.string().min(1), lastName: z.string().min(1), password: z.string().min(8), passwordConfirm: z.string() }).refine(data => data.password === data.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] })`
- On submit: calls `useAuthControllerRegister` mutation
- On success (201): same as login — `setTokens`, invalidate cart, `router.push('/')`
- On error (409): shows "Email already registered" inline error

### features/auth — LogoutButton

- Calls `useAuthControllerLogout` mutation
- On success: calls `authContext.clearTokens()`, then `queryClient.clear()` (clear all
  cached queries), then `router.push('/')`
- On error: still calls `clearTokens()` (best-effort logout)
- Renders a `<button>` styled as a secondary action

### widgets/header — HeaderAuth component

New sub-component `widgets/header/ui/header-auth.tsx` (`'use client'`):

```
isInitializing === true  → renders a small skeleton / spinner
isAuthenticated === false → renders <Link href="/login">Sign in</Link> + <Link href="/register">Register</Link>
isAuthenticated === true  → renders user identifier (email or firstName) + <LogoutButton />
```

This component is composed into the existing `Header` widget (or the header layout component
if one exists). It must be a `'use client'` component because it reads `useAuth()`.

### app/(auth)/login/page.tsx

- Route: `/login`
- Server Component: renders `<LoginForm>` inside a centred layout card
- Exports `metadata`: `{ title: 'Sign In | MobileStore', description: '...' }`
- If the user is already authenticated (checked client-side in `LoginForm`), redirect to `/`
- Renders a link to `/register` ("Don't have an account? Register")

### app/(auth)/register/page.tsx

- Route: `/register`
- Server Component: renders `<RegisterForm>` inside the same centred layout card
- Exports `metadata`: `{ title: 'Register | MobileStore', description: '...' }`
- Renders a link to `/login` ("Already have an account? Sign in")

### entities/session barrel

```ts
// entities/session/index.ts
export { AuthProvider } from "./model/auth.context";
export { useAuth } from "./model/use-auth";
export type { AuthContextValue } from "./model/auth.context";
export {
  useAuthControllerLogin,
  useAuthControllerRegister,
  useAuthControllerLogout,
  useAuthControllerRefresh,
} from "@/shared/api/generated/auth/auth";
export type {
  LoginDto,
  RegisterDto,
  AuthControllerLogin200,
  AuthControllerRegister201,
} from "@/shared/api/generated/models";
```

`entities/index.ts` is updated to add `export * from './session'`.

### Dependency Installation

The following packages are required if not already installed in `apps/store-client`:

- `react-hook-form` — form state management
- `@hookform/resolvers` — zod integration for react-hook-form
- `zod` — form schema validation (already used for backend DTOs; may already be in the root workspace)

Check `apps/store-client/package.json` before adding to confirm what's missing.

## Tasks

### TASK-052-A: Update shared/api/instance.ts with auth interceptors

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-051-J (Orval regenerated — 401 no longer on cart endpoints)

**Acceptance Criteria:**

- [ ] Module-level `_accessToken: string | null = null` added to `instance.ts`
- [ ] Exported functions `getAccessToken(): string | null` and `setAccessToken(token: string | null): void` added
- [ ] Request interceptor added to `api` instance: attaches `Authorization: Bearer <token>` when `getAccessToken()` is non-null
- [ ] Response interceptor added: on 401 (and NOT a refresh or login/register request),
      attempts one `POST /api/auth/refresh`, sets new token via `setAccessToken`, retries
      the original request
- [ ] If refresh also fails (401 or network error), calls `setAccessToken(null)` and
      rejects the original error (no infinite loop)
- [ ] Refresh calls (`/api/auth/refresh`, `/api/auth/login`, `/api/auth/register`) are
      explicitly excluded from the retry logic via URL check to prevent infinite loops
- [ ] `withCredentials: true` remains on the `api` instance (already set — unchanged)
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to modify:**

- `apps/store-client/src/shared/api/instance.ts` — add interceptors and token functions

---

### TASK-052-B: Create entities/session slice (AuthContext + useAuth)

**Type:** feat
**Scope:** store-client
**Complexity:** M (3-4h)
**TDD Required:** No
**Depends on:** TASK-052-A

**Acceptance Criteria:**

- [ ] `apps/store-client/src/entities/session/model/auth.context.tsx` created:
  - `AuthProvider` is a `'use client'` component
  - Provides `AuthContextValue` via React Context
  - On mount (`useEffect`), calls `POST /api/auth/refresh` using the raw `api` Axios instance
    (NOT the generated hook — the generated hook is a mutation, not suitable for one-shot
    initialization); if successful, calls `setAccessToken(newToken)` and populates context
    state; if failed, sets `isInitializing = false` with no token (guest state)
  - `setTokens(accessToken: string)` decodes the JWT payload (base64 decode of the middle
    segment) to extract `sub` (userId) and `role`; calls module-level `setAccessToken(token)`
    so the Axios interceptor picks it up; updates context state
  - `clearTokens()` calls `setAccessToken(null)` and clears context state
  - `isInitializing` is `true` until the initial refresh attempt completes (success or failure)

- [ ] `apps/store-client/src/entities/session/model/use-auth.ts` created:
  - `export function useAuth(): AuthContextValue` — reads `AuthContext` via `useContext`;
    throws a descriptive error if used outside `AuthProvider`

- [ ] `apps/store-client/src/entities/session/index.ts` barrel created (see Technical Design)

- [ ] `apps/store-client/src/entities/index.ts` updated: `export * from './session'`

- [ ] `AuthProvider` registered in `apps/store-client/src/app/providers.tsx` (or equivalent
      root providers file), wrapping `QueryClientProvider` as the outermost provider

- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/entities/session/model/auth.context.tsx` — new file
- `apps/store-client/src/entities/session/model/use-auth.ts` — new file
- `apps/store-client/src/entities/session/index.ts` — new barrel
- `apps/store-client/src/entities/index.ts` — add session export
- `apps/store-client/src/app/providers.tsx` — add `AuthProvider`

---

### TASK-052-C: Install form dependencies (react-hook-form, zod, resolvers)

**Type:** chore
**Scope:** store-client
**Complexity:** S (30min)
**TDD Required:** No
**Depends on:** none (can run in parallel with TASK-052-A)

**Acceptance Criteria:**

- [ ] Check `apps/store-client/package.json`: confirm which of the following are missing
      and install only what is needed:
  - `react-hook-form` ≥ 7.0
  - `@hookform/resolvers` ≥ 3.0
  - `zod` ≥ 3.0
- [ ] `npm install` succeeds in the workspace; lockfile updated
- [ ] `npm run build -w apps/store-client` still exits 0 (no breaking changes from new deps)
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to modify:**

- `apps/store-client/package.json` — add missing dependencies

---

### TASK-052-D: Create features/auth — LoginForm

**Type:** feat
**Scope:** store-client
**Complexity:** M (3-4h)
**TDD Required:** No
**Depends on:** TASK-052-B, TASK-052-C

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/auth/ui/login-form.tsx` is a `'use client'` component
- [ ] Uses `useForm` from `react-hook-form` with `zodResolver(loginSchema)`:
  - `loginSchema = z.object({ email: z.string().email('Valid email required'), password: z.string().min(1, 'Password is required') })`
- [ ] Calls `useAuthControllerLogin` (imported from `@/entities/session`)
- [ ] On success:
  1. `authContext.setTokens(data.data.accessToken)` — stores token in memory + context
  2. `queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() })` — triggers cart
     refresh so the backend-merged user cart loads in CartPage
  3. `router.push('/')` (or `router.push(redirectTo)` from `searchParams.get('redirect')`)
- [ ] On 401 error: inline message "Invalid email or password" (`role="alert"`)
- [ ] On other errors: inline message "Something went wrong. Please try again." (`role="alert"`)
- [ ] Submit button text: "Sign in"; while `isPending`: "Signing in..." + `disabled`
- [ ] Form fields: `<input type="email">` and `<input type="password">` with visible `<label>`
      elements linked via `htmlFor`/`id`
- [ ] A `<Link href="/register">` link below the form ("Don't have an account? Register")
- [ ] No raw hex colour values; all Tailwind classes use semantic design tokens
- [ ] No manual `fetch`/`axios` calls; uses Orval-generated hook only
- [ ] FSD import direction respected: `features/auth` imports from `entities/session` and
      `shared` only
- [ ] `apps/store-client/src/features/auth/index.ts` barrel created: exports `LoginForm`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/login-form.tsx` — new file
- `apps/store-client/src/features/auth/index.ts` — new barrel

---

### TASK-052-E: Create features/auth — RegisterForm

**Type:** feat
**Scope:** store-client
**Complexity:** M (3-4h)
**TDD Required:** No
**Depends on:** TASK-052-B, TASK-052-C

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/auth/ui/register-form.tsx` is a `'use client'` component
- [ ] Zod schema includes:
  - `email: z.string().email()`
  - `firstName: z.string().min(1, 'First name is required')`
  - `lastName: z.string().min(1, 'Last name is required')`
  - `password: z.string().min(8, 'Password must be at least 8 characters')`
  - `passwordConfirm: z.string()` + `.refine(data => data.password === data.passwordConfirm, { message: 'Passwords do not match', path: ['passwordConfirm'] })`
- [ ] Calls `useAuthControllerRegister` (imported from `@/entities/session`)
- [ ] On success (201): same flow as `LoginForm` — `setTokens`, invalidate cart, `router.push('/')`
- [ ] On 409 error: shows "Email already registered" inline error
- [ ] On 400 error: shows field-specific messages if available, else generic error
- [ ] Submit button: "Create account" / "Creating..." while pending
- [ ] A `<Link href="/login">` link below the form ("Already have an account? Sign in")
- [ ] `apps/store-client/src/features/auth/index.ts` updated to export `RegisterForm`
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/register-form.tsx` — new file
- `apps/store-client/src/features/auth/index.ts` — update barrel

---

### TASK-052-F: Create features/auth — LogoutButton

**Type:** feat
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** TASK-052-B

**Acceptance Criteria:**

- [ ] `apps/store-client/src/features/auth/ui/logout-button.tsx` is a `'use client'` component
- [ ] Calls `useAuthControllerLogout` (imported from `@/entities/session`)
- [ ] On success:
  1. `authContext.clearTokens()`
  2. `queryClient.clear()` — wipe all cached queries (cart, user data, etc.)
  3. `router.push('/')`
- [ ] On any error: still calls `authContext.clearTokens()` (best-effort; server logout is
      non-critical for UX — clearing local tokens is what matters)
- [ ] Button text: "Sign out"; while `isPending`: "Signing out..."
- [ ] `apps/store-client/src/features/auth/index.ts` updated to export `LogoutButton`
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/features/auth/ui/logout-button.tsx` — new file
- `apps/store-client/src/features/auth/index.ts` — update barrel

---

### TASK-052-G: Create widgets/header/HeaderAuth + wire into Header

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-052-D, TASK-052-E, TASK-052-F

**Acceptance Criteria:**

- [ ] `apps/store-client/src/widgets/header/ui/header-auth.tsx` is a `'use client'` component
- [ ] Uses `useAuth()` from `@/entities/session`
- [ ] Renders based on auth state:
  - `isInitializing === true` → a small skeleton placeholder (width of approx. 2 buttons)
    using `<Skeleton>` from `@/shared/ui`
  - `isAuthenticated === false` → two navigation links:
    - `<Link href="/login" className="...">Sign in</Link>`
    - `<Link href="/register" className="...">Register</Link>` (optional — can be one link
      to sign in with register as secondary)
  - `isAuthenticated === true` → displays `userId` or decodes first name from token if
    available + `<LogoutButton />` from `@/features/auth`
- [ ] FSD import direction respected: `widgets/header` imports from `features/auth` and
      `entities/session`; this is the correct downward direction (`widgets` → `features` → `entities`)
- [ ] The existing `Header` widget (or header layout component) is updated to render
      `<HeaderAuth />` in the appropriate position (top-right area)
- [ ] `widgets/header/index.ts` updated to export `HeaderAuth` if needed by the app layout
- [ ] `npm run typecheck -w apps/store-client` passes
- [ ] `npm run lint -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-auth.tsx` — new file
- `apps/store-client/src/widgets/header/ui/header.tsx` (or equivalent) — add `<HeaderAuth />`
- `apps/store-client/src/widgets/header/index.ts` — update if needed

---

### TASK-052-H: Create app/(auth)/login/page.tsx route

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-052-D

**Acceptance Criteria:**

- [ ] `apps/store-client/src/app/(auth)/login/page.tsx` created
- [ ] The `(auth)` route group has its own layout (`(auth)/layout.tsx`) that centres the
      auth card on the page (or the page itself handles centring)
- [ ] Exports `metadata`: `{ title: 'Sign In | MobileStore', description: 'Sign in to your account' }`
- [ ] Renders `<LoginForm />` from `@/features/auth` inside a centred card container
- [ ] The `/login` URL is accessible without authentication
- [ ] Visiting `/login` while already authenticated (detected by `useAuth()` in `LoginForm`)
      silently redirects to `/` (client-side redirect inside `LoginForm` — not a server-side redirect
      since auth state is client-only)
- [ ] `npm run build -w apps/store-client` exits 0
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/app/(auth)/login/page.tsx` — new route
- `apps/store-client/src/app/(auth)/layout.tsx` — new layout (centred card shell)

---

### TASK-052-I: Create app/(auth)/register/page.tsx route

**Type:** feat
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-052-E

**Acceptance Criteria:**

- [ ] `apps/store-client/src/app/(auth)/register/page.tsx` created
- [ ] Exports `metadata`: `{ title: 'Register | MobileStore', description: 'Create a new account' }`
- [ ] Renders `<RegisterForm />` from `@/features/auth` inside the same `(auth)` layout card
- [ ] `npm run build -w apps/store-client` exits 0
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to create/modify:**

- `apps/store-client/src/app/(auth)/register/page.tsx` — new route

---

### TASK-052-J: Update CartView (TASK-031-E) to remove 401 sign-in state

**Type:** refactor
**Scope:** store-client
**Complexity:** S (1h)
**TDD Required:** No
**Depends on:** TASK-031-E (CartView built), TASK-052-B (AuthContext exists)

**Note:** This task revisits the CartView orchestrator that was specified to show a
"Sign in to view your cart" state on 401. Since TASK-051 removes the 401 from cart
endpoints, this state is now unreachable. The CartView must be updated accordingly.

**Acceptance Criteria:**

- [ ] `CartView` 401-detection branch removed: the `isUnauthorized` check and the
      "Sign in to view your cart" state are deleted
- [ ] The error branch now handles only genuine API errors (network errors, 5xx responses)
- [ ] Empty cart state remains unchanged (items.length === 0)
- [ ] Populated cart state remains unchanged
- [ ] No new import of `useAuth` is needed in `CartView` — cart is now always accessible;
      auth state is shown in the header (TASK-052-G)
- [ ] If `CartView` was built with the 401 branch, the branch is removed; if not yet built,
      TASK-031-E acceptance criteria supersede (see plan 016 which has been revised)
- [ ] `npm run typecheck -w apps/store-client` passes

**Files to modify:**

- `apps/store-client/src/widgets/cart/ui/cart-view.tsx` — remove 401 branch

---

### TASK-052-K: Full integration verification

**Type:** test
**Scope:** store-client
**Complexity:** M (2-3h)
**TDD Required:** No
**Depends on:** TASK-052-G, TASK-052-H, TASK-052-I, TASK-052-J

**Acceptance Criteria:**

- [ ] `npm run build -w apps/store-client` exits 0 with no TypeScript errors
- [ ] `npm run lint -w apps/store-client` exits 0 with no warnings
- [ ] `npm run typecheck -w apps/store-client` exits 0

  **Manual smoke tests** (documented in this task for developer reference):
  - Guest flow: visit `/products` → add to cart (once TASK-032 AddToCart is done) →
    visit `/cart` → see items without logging in
  - Login flow: visit `/login` → sign in → verify header shows authenticated state →
    visit `/cart` → confirm user cart (with merged guest items) loads
  - Register flow: visit `/register` → create account → verify redirect to `/` → header
    shows authenticated state
  - Logout flow: click "Sign out" → header reverts to unauthenticated state → cart
    resets to guest (empty, new cookie issued on next cart visit)
  - Page reload: while logged in, reload page → `AuthProvider` silently calls
    `/api/auth/refresh` → access token restored → cart and header still show authenticated state
  - 401 retry: with expired access token (forced by waiting or manually clearing) → any
    cart call triggers the interceptor refresh → request retried → transparent to the user

- [ ] No `console.error` in the browser for any of the above flows

**Files to modify:** None (verification only)

## Migration Steps

Execute in this order:

1. **TASK-052-C** — Install dependencies (unblocks forms; no code changes)
2. **TASK-052-A** — Update `instance.ts` (unblocks AuthContext which needs token setter)
3. **TASK-052-B** — Create `entities/session` (AuthContext, useAuth, AuthProvider in root)
4. **TASK-052-D** and **TASK-052-E** in parallel — LoginForm and RegisterForm (both depend on B + C)
5. **TASK-052-F** — LogoutButton (depends on B only)
6. **TASK-052-G** — HeaderAuth widget (depends on D, E, F)
7. **TASK-052-H** and **TASK-052-I** in parallel — login and register routes
8. **TASK-052-J** — Patch CartView to remove 401 branch (can run any time after TASK-031-E)
9. **TASK-052-K** — Integration verification

## Risks and Mitigations

| Risk                                                                                                                                                                                                                                                              | Mitigation                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-memory token lost on page refresh** requires a working refresh endpoint and an HttpOnly cookie to be present. If the user's refresh cookie has expired (>7 days), they will see an unauthenticated state after reload.                                       | This is correct behaviour. The `isInitializing` flag prevents flash of incorrect state while the refresh is in-flight. Document 7-day session expiry in UX copy.                                                                |
| **Race condition:** two simultaneous 401 responses both trigger a refresh call.\*\*                                                                                                                                                                               | Implement a `refreshPromise` singleton in `instance.ts`: if a refresh is already in-flight, new 401s queue behind the same promise rather than firing a second refresh request. This is a known pattern for Axios interceptors. |
| **`setAccessToken` module variable couples `instance.ts` and `AuthProvider`.** The `AuthProvider` must call `setAccessToken` from `instance.ts`, creating an import dependency between `entities/session` and `shared/api`.                                       | This is the correct FSD direction: `entities` imports from `shared`. `instance.ts` exports `setAccessToken` as a utility — no React dependencies in `shared/api`.                                                               |
| **`AuthProvider.useEffect` fires after hydration** — brief moment where `isInitializing = false` and `isAuthenticated = false` before the refresh completes, causing a flash.                                                                                     | Set `isInitializing = true` as the initial state (default) so the auth area shows a skeleton until the first refresh attempt completes.                                                                                         |
| **Generated hook names may change after Orval regeneration** (TASK-051-J). Auth hooks currently use `useAuthControllerLogin`, `useAuthControllerRegister`, etc. (long `Controller` prefix). If operationIds on the auth controller change, hook names change too. | Read the regenerated `auth.ts` file before implementing TASK-052-D/E. The generated file is the source of truth.                                                                                                                |
| **`react-hook-form` version compatibility** with Next.js App Router / React 18 or 19.\*\*                                                                                                                                                                         | Use `react-hook-form` ≥ 7.51 which is compatible with React 19. Check `apps/store-client/package.json` for the React version before pinning.                                                                                    |
| **`(auth)` route group layout conflict with root layout.** The root layout provides `<main>` — the `(auth)/layout.tsx` must not add a second `<main>`.                                                                                                            | `(auth)/layout.tsx` renders only a centring wrapper `<div>`, not a new `<main>`.                                                                                                                                                |
