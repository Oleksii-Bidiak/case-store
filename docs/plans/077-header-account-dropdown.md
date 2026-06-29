# Plan 077 — Header Account Dropdown (TASK-130)

**Phase:** Phase 5 — Polish & UX
**Roadmap context:** Tier 3 — UX, data & admin polish
**Branch:** feat/130-header-account-dropdown
**Wave:** Wave 1 (parallel with 131, 136, 137, 138 — independent; see `C:\Users\jioii\.claude\plans\eventual-launching-glacier.md`)
**Created:** 2026-06-29
**Status:** ⬜ To Do

> **Implementation note:** This is a **frontend-only, visually-polished** task.
> Use the **`designer`** agent for implementation and the **`fsd-component`** skill for placing
> new components within FSD layers. The `build` agent is a secondary option for non-visual
> sub-tasks (RTL tests, dict keys).

---

## Problem Statement

The storefront header currently renders the authenticated area as two separate inline elements:
a plain text link "Мий акаунт" (→ `/account`) and a `LogoutButton` sitting side by side with no
visual grouping. There is no user icon to signal the account area, the cabinet link is easy to
overlook, and the mobile slide-out menu contains **no account or logout entries at all** — a guest
cannot reach `/login` from the mobile menu either.

Goal: replace the inline text + button pair with a **user icon trigger + dropdown menu** that
groups all account actions (cabinet link, orders link, logout) in one discoverable place on both
desktop and mobile.

---

## Current state (baseline)

### `apps/store-client/src/widgets/header/ui/header-auth.tsx`

Three render branches:

| Branch                     | Current output                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `isInitializing`           | `<Skeleton className="h-8 w-32" />`                                                                     |
| Guest (`!isAuthenticated`) | `<Button variant="ghost">Увійти</Button>` + `<Button>Реєстрація</Button>`                               |
| Authenticated              | `<Button variant="ghost" asChild><Link href="/account">Мий акаунт</Link></Button>` + `<LogoutButton />` |

The authenticated branch is **the only one that changes** in this task.

### `apps/store-client/src/widgets/header/ui/header.tsx` — mobile Sheet

`SheetContent` lists `NAV_LINKS` (products) and a cart link only. No account links, no guest
links. A logged-in customer on mobile has no way to reach `/account` from the header.

---

## Auth state source

`useAuth()` from `@/entities/session` (`entities/session/model/use-auth.ts`) exposes:

```ts
{
  isAuthenticated: boolean,
  isInitializing: boolean,
  userId: string | null,   // from JWT sub claim
  role: string | null,     // from JWT role claim
  clearTokens: () => void,
}
```

**No display name or email is available in the auth context.** The JWT payload carries only `sub`
and `role`. Fetching the full profile (`useUserControllerGetProfile`) to display a name costs an
extra network call on every page; for this task the trigger shows a **user icon only** (lucide-react
`User` icon). Displaying a name inside the trigger is deferred to a future polish task.

The logout flow is already encapsulated in `features/auth/ui/logout-button.tsx`:

```ts
const logout = useAuthControllerLogout();
const finish = () => {
  clearTokens();
  queryClient.clear();
  router.push("/");
};
logout.mutate(undefined, { onSettled: finish });
```

The dropdown logout item **must reuse this identical logic** (same three calls, same `onSettled`
pattern) to avoid behavioural divergence. The `<LogoutButton />` component itself stays in
`features/auth` (other consumers might use it); it is simply no longer rendered from `HeaderAuth`.

---

## Dropdown primitive gap

`apps/store-client/src/shared/ui/` has no `DropdownMenu`, `Popover`, or `Menu` primitive.
The storefront does **not** use shadcn `DropdownMenu` (the admin panel does). A small,
zero-dependency `AccountDropdown` primitive must be created in `shared/ui`, following the same
zero-dep, WAI-ARIA pattern as `combobox.tsx` (built in TASK-080).

**WAI-ARIA pattern:** Menu Button (disclosure).

| Element                    | Role / attributes                                                                                    |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| Trigger `<button>`         | `aria-haspopup="menu"`, `aria-expanded={open}`, `aria-controls={menuId}`, `aria-label={triggerAria}` |
| Panel `<ul>`               | `role="menu"`, `id={menuId}`, `aria-label={menuAria}`                                                |
| Link / action items `<li>` | `role="menuitem"`, `tabIndex={-1}` (focus managed programmatically)                                  |
| Visual separator           | `<li role="separator" aria-hidden="true">`                                                           |

**Keyboard behaviour:**

| Key                          | Action                                                      |
| ---------------------------- | ----------------------------------------------------------- |
| `Enter` / `Space` on trigger | Open menu; move focus to first item                         |
| `ArrowDown`                  | Next item (wraps to first)                                  |
| `ArrowUp`                    | Previous item (wraps to last)                               |
| `Escape`                     | Close menu; return focus to trigger                         |
| `Tab`                        | Close menu; let natural tab order proceed (no focus-return) |
| `Enter` on item              | Activate item; close menu; return focus to trigger          |

**Click outside** closes the panel via a `mousedown` listener on `document` (same pattern as the
Combobox `onBlur` close guard; here done via `useEffect` with `document.addEventListener`).

---

## Dictionary changes

**Existing keys reused — no change required:**

| Usage in dropdown    | Existing key                                 |
| -------------------- | -------------------------------------------- |
| Cabinet link label   | `dict.header.myAccount` → "Мій акаунт"       |
| Orders link label    | `dict.account.ordersLink` → "Мої замовлення" |
| Logout item label    | `dict.auth.logout.signOut` → "Вийти"         |
| Logout pending label | `dict.auth.logout.signingOut` → "Виходимо…"  |
| Mobile "sign in"     | `dict.header.signIn` → "Увійти"              |
| Mobile "register"    | `dict.header.register` → "Реєстрація"        |

**New keys to add under `dict.header`:**

| Key                  | Value                     |
| -------------------- | ------------------------- |
| `accountTriggerAria` | `"Відкрити меню акаунту"` |
| `accountMenuAria`    | `"Меню акаунту"`          |

No other new strings are needed. The `Dictionary` type updates automatically via `as const`.

---

## Tasks

### TASK-130-A: Build `AccountDropdown` primitive in `shared/ui`

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** nothing (new standalone primitive)

**Acceptance Criteria:**

- [ ] File `apps/store-client/src/shared/ui/account-dropdown.tsx` created
- [ ] Two named exports: `AccountDropdown` (container + trigger wiring) and `AccountDropdownItem`
      (a single menu entry — can be a link or an action button)
- [ ] `AccountDropdown` props:
  - `triggerContent: React.ReactNode` — icon / button content (no built-in `<button>` wrapper;
    the component renders the `<button>` internally so trigger receives focus correctly)
  - `triggerAria: string` — `aria-label` for the trigger `<button>`
  - `menuAria: string` — `aria-label` for the `role="menu"` panel
  - `children: React.ReactNode` — `<AccountDropdownItem>` elements
- [ ] `AccountDropdownItem` props: `href?: string`, `onClick?: () => void`, `disabled?: boolean`,
      `children: React.ReactNode`; renders a Next.js `<Link>` when `href` is supplied, a `<button
    type="button">` otherwise
- [ ] WAI-ARIA attributes applied as specified in the primitive gap section above
- [ ] Keyboard: Enter/Space opens and focuses first item; Escape closes + returns focus to trigger;
      ArrowDown/ArrowUp cycle items; Tab closes (no return); Enter on item activates + closes +
      returns focus to trigger
- [ ] Click outside closes (document `mousedown` listener in a `useEffect`, cleaned up on unmount)
- [ ] Focus management: on open, focus moves to the first non-separator item; on Escape / item
      activation, focus returns to the trigger `<button>`
- [ ] Styling: panel floats right-aligned below the trigger via `absolute right-0 top-full mt-1`;
      uses only design-system tokens (`bg-background`, `border border-border`, `shadow-md`,
      `rounded-md`, `text-foreground`, `hover:bg-accent`, `focus-visible:ring-2 focus-visible:ring-ring`);
      no raw hex values
- [ ] Separator: rendered via `<li role="separator" aria-hidden="true" className="my-1 border-t border-border" />`
- [ ] Exported from `apps/store-client/src/shared/ui/index.ts`
- [ ] Zero external dependencies (no shadcn, no Radix UI, React only)
- [ ] `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/ui/account-dropdown.tsx` — new primitive (AccountDropdown + AccountDropdownItem)
- `apps/store-client/src/shared/ui/index.ts` — add `AccountDropdown` and `AccountDropdownItem` exports

---

### TASK-130-B: Add new dictionary keys

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** nothing (standalone dict change)

**Acceptance Criteria:**

- [ ] `accountTriggerAria: "Відкрити меню акаунту"` added under `dict.header`
- [ ] `accountMenuAria: "Меню акаунту"` added under `dict.header`
- [ ] No other keys added or removed; `as const` type inference updates `Dictionary` automatically
- [ ] `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/config/dictionary.ts` — append two keys inside the `header:` block

---

### TASK-130-C: Refactor `HeaderAuth` + update mobile Sheet in `header.tsx`

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-130-A, TASK-130-B

**Acceptance Criteria:**

Desktop `HeaderAuth` — authenticated branch:

- [ ] The `<Link href="/account">Мий акаунт</Link>` ghost button is replaced by an `AccountDropdown`
- [ ] Trigger content: lucide-react `User` icon (size `size-5`), aria-label from `dict.header.accountTriggerAria`
- [ ] Dropdown items (in order):
  1. `AccountDropdownItem href="/account"` — label `dict.header.myAccount` ("Мий акаунт")
  2. `AccountDropdownItem href="/orders"` — label `dict.account.ordersLink` ("Мої замовлення")
  3. Visual separator (`AccountDropdownItem` with `role="separator"` variant, or rendered directly
     as a non-interactive `<li role="separator">` inside `AccountDropdown.children`)
  4. `AccountDropdownItem onClick={handleLogout} disabled={logout.isPending}` — label
     `logout.isPending ? dict.auth.logout.signingOut : dict.auth.logout.signOut`
- [ ] Logout logic in `handleLogout` matches `LogoutButton` exactly:
      `logout.mutate(undefined, { onSettled: () => { clearTokens(); queryClient.clear(); router.push("/"); } })`
- [ ] `<LogoutButton />` import is removed from `HeaderAuth` (the component still exists in
      `features/auth` for possible future use; it is just no longer rendered here)
- [ ] `isInitializing` skeleton and guest branch are unchanged
- [ ] `accountMenuAria` from `dict.header` passed as `menuAria` prop

Mobile Sheet in `header.tsx`:

- [ ] `header.tsx` imports `useAuth` from `@/entities/session` and `useAuthControllerLogout` from the
      generated API (or re-exports from `@/entities/session`) to drive the mobile auth area
- [ ] Inside `SheetContent`, after the existing NAV_LINKS and cart link, add a conditional section:
  - When **authenticated**: "Мий акаунт" link (→ `/account`), "Мої замовлення" link (→ `/orders`),
    separator (`<hr className="my-1 border-border" />`), logout button (same logic as above)
  - When **guest**: "Увійти" link (→ `/login`), "Реєстрація" link (→ `/register`)
  - Each link calls `setMenuOpen(false)` on click (consistent with existing pattern)
  - All mobile items styled identically to existing nav links (same `rounded-md px-3 py-2 text-base font-medium` classes)
- [ ] No circular imports — `header.tsx` already is a client widget; `useAuth` comes from `entities/session` (FSD-compliant: widget → entity)
- [ ] `npm run typecheck -w apps/store-client` + `npm run lint -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-auth.tsx` — authenticated branch replaced with AccountDropdown; LogoutButton import removed
- `apps/store-client/src/widgets/header/ui/header.tsx` — import useAuth + useAuthControllerLogout; add auth links section to SheetContent

---

### TASK-130-D: RTL tests

**Type:** test
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-130-A, TASK-130-C

Use the **`frontend-testing`** skill patterns established in TASK-105 (Jest + RTL + MSW).

**Acceptance Criteria:**

`AccountDropdown` primitive tests (`account-dropdown.test.tsx`):

- [ ] Trigger button is rendered; menu panel is NOT present in the DOM initially (`aria-expanded="false"`)
- [ ] Click on trigger → panel appears (`aria-expanded="true"`); first item receives focus
- [ ] `Escape` key → panel disappears; focus returns to the trigger button
- [ ] `ArrowDown` on open panel → focus advances to the next `role="menuitem"`
- [ ] `ArrowUp` on the first item → wraps to the last item
- [ ] Click on an item → `onClick` spy called; panel closes; focus returns to trigger
- [ ] `mousedown` outside the panel → panel closes
- [ ] Separator `<li role="separator">` is in the DOM but is not focusable and is skipped by arrow-key navigation

`HeaderAuth` widget tests (`header-auth.test.tsx`):

- [ ] Guest state: `screen.getByRole("link", { name: dict.header.signIn })` present; no user icon button
- [ ] Loading state: skeleton element present; no auth links; no icon button
- [ ] Authenticated state: user icon trigger button with `aria-label={dict.header.accountTriggerAria}` present; no standalone logout button outside the dropdown
- [ ] Open dropdown: "Мий акаунт" item links to `/account`; "Мої замовлення" item links to `/orders`
- [ ] "Вийти" item click: calls the `useAuthControllerLogout` mutation (MSW handler for `POST /api/auth/logout` returns 200); `clearTokens` spy called
- [ ] Use `renderWithProviders` (AuthProvider + QueryClientProvider + Router) wrapper matching existing test pattern in the codebase

- [ ] All store-client tests pass: `npm run test -w apps/store-client`
- [ ] `npm run typecheck -w apps/store-client` + `npm run lint -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/ui/account-dropdown.test.tsx` — new RTL test file
- `apps/store-client/src/widgets/header/ui/header-auth.test.tsx` — new RTL test file (uses AuthProvider wrapper + MSW handlers)

---

## Execution order

```
TASK-130-B   (dict keys — no deps; do first, < 1h)
TASK-130-A   (AccountDropdown primitive — no deps; can run in parallel with B)
     ↓
TASK-130-C   (HeaderAuth + header.tsx refactor — depends on A + B)
     ↓
TASK-130-D   (RTL tests — depends on A + C)
```

TASK-130-A and TASK-130-B have no mutual dependency and can be developed in any order (B first
is a common pattern since dict strings are needed as prop values in A's storybook/tests).

---

## Verification

### Automated gates (must be green before PR)

```bash
npm run test -w apps/store-client       # all RTL tests pass (new + existing)
npm run typecheck -w apps/store-client  # zero TypeScript errors
npm run lint -w apps/store-client       # ESLint clean
```

### Manual smoke (on a running `npm run dev` stack)

| Scenario                         | Expected                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Guest, desktop**               | Header right area: "Увійти" (ghost) + "Реєстрація" buttons. No dropdown trigger.                                 |
| **Guest, mobile Sheet**          | "Увійти" and "Реєстрація" links present in the slide-out menu.                                                   |
| **Authenticated, desktop**       | Header right area: cart badge + user icon button only. No text link "Мий акаунт". No standalone logout button.   |
| **Click user icon**              | Dropdown opens with: "Мий акаунт", "Мої замовлення", separator line, "Вийти". Panel right-aligns below the icon. |
| **"Мий акаунт" in dropdown**     | Navigates to `/account` (customer cabinet). Dropdown closes.                                                     |
| **"Мої замовлення" in dropdown** | Navigates to `/orders`. Dropdown closes.                                                                         |
| **"Вийти" in dropdown**          | Button shows "Виходимо…" while pending; on completion navigates to `/`; header reverts to guest state.           |
| **Escape key**                   | Dropdown closes; keyboard focus returns to the user icon trigger.                                                |
| **ArrowDown / ArrowUp**          | Keyboard focus cycles through the three non-separator items (wraps at ends).                                     |
| **Click outside dropdown**       | Dropdown closes.                                                                                                 |
| **Tab from trigger**             | Dropdown does not open; focus moves to the next focusable header element.                                        |
| **Skeleton**                     | While `isInitializing`, the account area shows `h-8 w-32` skeleton (unchanged).                                  |
| **Authenticated, mobile Sheet**  | "Мий акаунт", "Мої замовлення", separator, "Вийти" present. Each nav link closes the Sheet.                      |

---

## Completion checklist

- [ ] TASK-130-A: `AccountDropdown` primitive built, WAI-ARIA correct, exported
- [ ] TASK-130-B: two new `dict.header` keys added
- [ ] TASK-130-C: `HeaderAuth` authenticated branch replaced; mobile Sheet updated
- [ ] TASK-130-D: RTL tests written; all store-client tests green
- [ ] `BACKLOG.md` TASK-130 row: status → ✅, plan link added
