# Plan 121 — Admin Mobile Shell

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 (CRM, аналітика, контент/SEO-зручність,
> адаптив, CI/CD) — **Хвиля 1** (CRM-ядро + quick-win контент-мапа + мобільний доступ)
> **Created:** 2026-07-07
> **Last Updated:** 2026-07-07
> **BACKLOG task:** TASK-257

## Overview

The store-admin shell (`AdminSidebar` + `AdminHeader` + `main`) is a fixed desktop layout: a
static `w-64` `<aside>` sidebar always in the DOM, a `h-16` header with no collapse affordance,
and `main` padded at a flat `p-6`. Below `lg` (1024px) there is no way to reach the sidebar's
navigation at all — the owner cannot manage the panel from a phone, which the 2026-07-07 handoff
flags as the one **H-severity** item in an otherwise design/responsive-polish wave (owner priority
note: "TASK-257 (admin mobile shell) is H — owner manages the panel from a phone").

TASK-248 (already merged, develop @ 847a1fb) added count badges to `AdminSidebar` next to
«Замовлення» (new orders) and «Відгуки» (pending reviews), alongside the pre-existing
«Повідомлення» (unread contact messages) badge. Any mobile-shell solution must keep all three
badges reachable — they are the sidebar's only "what needs my attention" signal on a phone, where
the dashboard widget itself (also TASK-248) may be several taps away.

This plan turns the sidebar into a shadcn `Sheet` drawer below `lg`, adds a burger trigger to
`AdminHeader`, and adjusts `main`/header padding so the shell fits comfortably at 360–430px. It is
a **shell-only** change — no table, form, or dashboard-card responsiveness work (that is TASK-258,
already filed separately in Wave 5).

## Scope

### In Scope

- Convert `AdminSidebar`'s static `<aside>` into a `hidden lg:flex` desktop-only rail.
- Add a `<lg` mobile nav drawer (shadcn `Sheet`, `side="left"`) that renders the exact same nav
  body (all `navItems` + `bottomNavItems`, including the TASK-248 count badges) as the desktop
  aside — extracted into one shared component so nav items/badge logic are defined once.
- Add a burger trigger to `AdminHeader` (left of the title, `lg:hidden`) that opens the drawer.
- Close-on-navigate: clicking any nav link inside the drawer closes it (TASK-204 pattern —
  `onNavigate` prop threaded into each `Link`'s `onClick`), plus a route-change effect as a
  belt-and-braces backstop.
- `main` padding: `p-6` → `p-4 lg:p-6`.
- `AdminHeader` fits 360–430px viewports without horizontal overflow (title truncates
  defensively, admin-identity label already collapses below `sm`, burger + logout stay icon-only).
- Cross-viewport smoke pass at 360 / 390 / 768 / 1024px across every admin section, confirming no
  page-level horizontal scroll (a table scrolling inside its own bounded container is fine and
  explicitly out of scope here).

### Out of Scope

- Any table/form/dashboard-card responsive layout work (card/column-priority tables, single-column
  forms, sticky submit bars, recharts responsiveness) — tracked separately as **TASK-258**
  (Wave 5), which explicitly waits for this shell to land first.
- Fixing the dead `bottomNavItems` `href: "#"` "Settings" entry — tracked separately as
  **TASK-184** (Wave 3, "nav dead links"); this plan carries that entry through the extraction
  unchanged (still inert, still excluded from active-route matching).
- Any API/Orval/Prisma change — this is a pure frontend shell refactor, `store-api` is untouched.
- Restyling the sidebar/header visually beyond what responsiveness requires (colors, spacing
  scale, icon set) — no design-token changes.
- Adding a burger→X morph animation or a toggle affordance — the burger only _opens_ the drawer;
  closing goes through the Sheet's own affordances (X close button, overlay click, Esc, or a
  nav-link click), mirroring how `store-client`'s header `SheetTrigger` behaves today (its `Menu`
  icon doesn't morph either).

## User Stories

1. As the store owner, I want to open the full admin navigation from my phone via a single burger
   button, so I can jump between sections (products, orders, reviews, messages, settings) without
   a desktop in front of me.
2. As the store owner triaging "what needs my attention" from my phone, I want the same count
   badges next to «Замовлення»/«Відгуки»/«Повідомлення» to be visible inside the mobile drawer that
   I already see on desktop, so I don't lose the at-a-glance signal just because I'm on a small
   screen.
3. As the store owner browsing any admin page on a 360–430px phone, I want the header and page
   content to fit the screen width with no sideways scrolling, so the panel feels usable rather
   than broken on mobile.

## Technical Design

### Component structure

```
AdminShellGuard                              (unchanged — auth gate)
  AdminShell                                 (NEW — "use client", owns state)
    useState mobileNavOpen
    usePathname() → close-on-route-change effect
    <div className="flex h-screen overflow-hidden">
      <AdminSidebar />                       (desktop-only <aside>, hidden lg:flex)
        <AdminNavList />                      (no onNavigate — desktop never auto-closes)
      <MobileNavDrawer
        open={mobileNavOpen}
        onOpenChange={setMobileNavOpen}
      />                                      (Sheet, side="left")
        <AdminNavList onNavigate={() => setMobileNavOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <AdminHeader
          mobileNavOpen={mobileNavOpen}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">{children}</main>
      </div>
    </div>
```

`apps/store-admin/src/app/(dashboard)/layout.tsx` becomes a thin Server Component:
`<AdminShellGuard><AdminShell>{children}</AdminShell></AdminShellGuard>`. Passing Server Component
`children` into the new client `AdminShell` wrapper is the standard Next.js App Router
Server-in-Client composition pattern (children are not "client-ized" by being handed to a Client
Component as a prop) — the same thing already happens today, just one level shallower (`layout.tsx`
currently renders `{children}` directly inside a plain `<main>`, not through an intermediate client
wrapper).

### State ownership — where the drawer's open state lives

`AdminHeader` (burger trigger) and `AdminSidebar`/`MobileNavDrawer` (drawer content) are siblings
under `layout.tsx`, so the open/close state can't live in either leaf component alone. **Decision:
lift it to a new, small client wrapper component (`AdminShell`)** rather than a React Context:

- `AdminShell` owns `const [mobileNavOpen, setMobileNavOpen] = useState(false)` and passes it down
  as plain props — `mobileNavOpen`/`onOpenMobileNav` to `AdminHeader`, `open`/`onOpenChange` to
  `MobileNavDrawer`. This is a 3-component tree with one level of prop-drilling, which doesn't
  justify a Context provider (no deep nesting, no many-consumers problem) — a plain lifted
  `useState` in the nearest common parent is the simplest correct solution and matches how
  `store-client`'s `Header` already owns its own mobile-menu `useState` (the difference here is
  only that the trigger and the content are _not_ co-located in one component, which is why the
  state needs to live one level up instead of inside a single `Header`-equivalent).
- **`MobileNavDrawer` is a fully-controlled `Sheet`** (`open`/`onOpenChange` passed in as props) —
  **no `SheetTrigger` is used**. Radix's `Dialog.Root` (which `Sheet` wraps) supports fully
  controlled usage with no `Trigger` at all; the burger `Button` inside `AdminHeader` just calls
  `onOpenMobileNav` (`() => setMobileNavOpen(true)`) directly. This avoids needing the trigger and
  the content in the same component tree, which is not possible here since they're siblings.

### Close-on-navigate (TASK-204 pattern)

Mirrors `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` (`onNavigate?: () => void` prop,
called from the rendered `<Link>`'s `onClick`) and `apps/store-client/src/widgets/header/ui/header.tsx`
(each mobile nav `<Link onClick={() => setMenuOpen(false)}>`):

- `AdminNavList` accepts an optional `onNavigate?: () => void` prop and calls it from every
  `<Link>`'s `onClick` (both `navItems` and `bottomNavItems`).
- `AdminSidebar` renders `<AdminNavList />` with no `onNavigate` (desktop nav never needs to
  auto-close anything).
- `MobileNavDrawer` renders `<AdminNavList onNavigate={() => onOpenChange(false)} />`.
- Backstop: `AdminShell` also runs `useEffect(() => setMobileNavOpen(false), [pathname])` (from
  `usePathname()`) so any navigation that doesn't go through a rendered `<Link>` click inside the
  drawer (e.g. the browser back/forward button, or a future `router.push` call from inside a
  drawer-rendered control) still closes the drawer. This is a backstop, not the primary
  mechanism — the primary mechanism is the per-link `onNavigate` handler, exactly as on the
  storefront.

### Avoiding duplicated nav/badge logic

`AdminNavList` (new) becomes the single place that defines `navItems`, `bottomNavItems`,
`isNavItemActive`, and the three count-badge blocks (messages/orders/reviews) — moved verbatim
out of the current `admin-sidebar.tsx` (~L33–172). Both mount points (`AdminSidebar`'s desktop
`<aside>` and `MobileNavDrawer`'s `SheetContent`) render `<AdminNavList />`, so there is exactly
one place that defines the nav structure and badge rendering, per the grounding brief's explicit
instruction.

`AdminNavList` is self-contained: it calls `usePathname()`, `useAdminContactUnreadCount()`, and
`useAdminDashboardControllerGetNeedsAction()` itself (not passed in as props). Both mounted
instances therefore issue the same TanStack Query calls independently — see Risks for why this is
safe (cache dedup) rather than a real duplicate-network-call problem.

### Breakpoint

`lg` (Tailwind default, `min-width: 1024px`) is the existing cutover already implied by the
BACKLOG line ("On `<lg`: sidebar → drawer") and matches the smoke-test matrix (360/390/768 all
`<lg` → drawer mode; 1024 itself is exactly the `lg` breakpoint → desktop rail). No new breakpoint
is introduced.

### Accessibility

- Focus trap, initial focus, Esc-to-close, overlay-click-to-close, and focus-return-to-trigger are
  all handled by the existing `shared/ui/sheet.tsx` (Radix `Dialog` under the hood) — this plan
  does not write any custom focus-management code, it only reuses the same shared component
  `store-client`'s header already relies on for the identical purpose.
- Burger button gets `aria-label={dict.header.openMenu}` (new dictionary key) and
  `aria-expanded={mobileNavOpen}` (reflects the controlled drawer state for assistive tech).
- `MobileNavDrawer`'s `SheetContent` gets `aria-describedby={undefined}` (no `SheetDescription` is
  rendered) to suppress Radix's dev-only "Missing Description" warning — same convention as
  `store-client`'s header `SheetContent`.
- `SheetContent` renders a visible `SheetHeader`/`SheetTitle` reusing the same brand row (Package
  icon + "MobileStore") the desktop `<aside>` already shows, satisfying Radix's requirement for an
  accessible dialog title without inventing new copy.
- No duplicate-landmark risk: `hidden lg:flex` fully removes the desktop `<aside>` from the
  accessibility tree (`display: none`) below `lg`, so only one `<nav>` is ever reachable by
  keyboard/AT at a given viewport width, regardless of whether the drawer is open.

### Frontend (Next.js — FSD)

#### shared/ui

- No new base components — `Sheet`/`SheetTrigger`/`SheetContent`/`SheetHeader`/`SheetTitle`,
  `Button`, and `Badge` are already implemented and barrel-exported from
  `apps/store-admin/src/shared/ui/index.ts`.

#### entities

- No changes — `useAdminContactUnreadCount` (`@/entities/contact`) and
  `useAdminDashboardControllerGetNeedsAction` (`@/entities/dashboard`) are reused as-is (already
  shipped by TASK-248).

#### widgets (`admin-shell`)

- `admin-nav-list.tsx` — **new**: extracted nav body (`navItems`, `bottomNavItems`,
  `isNavItemActive`, the three badge blocks), `onNavigate?: () => void` prop.
- `admin-sidebar.tsx` — **modified**: becomes the desktop-only `<aside className="hidden h-screen
w-64 flex-col border-r border-border bg-card shadow-card lg:flex">` wrapper around the brand
  block + `<AdminNavList />`.
- `mobile-nav-drawer.tsx` — **new**: fully-controlled `Sheet` (`open`/`onOpenChange` props),
  `SheetContent side="left"` with the brand `SheetHeader`/`SheetTitle` + `<AdminNavList
onNavigate={...} />`.
- `admin-shell.tsx` — **new**: owns `mobileNavOpen` state + the route-change close effect,
  composes `AdminSidebar` + `MobileNavDrawer` + `AdminHeader` + `<main>`.
- `admin-header.tsx` — **modified**: `mobileNavOpen`/`onOpenMobileNav` props, burger `Button`
  (left of the title, `lg:hidden`), title gets `truncate`, header padding `px-6` → `px-4 lg:px-6`.
- `index.ts` — **modified**: barrel-export `AdminShell`, `AdminNavList`, `MobileNavDrawer`
  alongside the existing `AdminSidebar`/`AdminHeader`/`AdminShellGuard` exports.

#### app (pages)

- `app/(dashboard)/layout.tsx` — **modified**: renders `<AdminShellGuard><AdminShell>{children}
</AdminShell></AdminShellGuard>` instead of the current inline flex/`<aside>`/`<main>` markup.

#### shared/config

- `dictionary.ts` — **modified**: new `dict.header.openMenu: "Відкрити меню"` (burger
  `aria-label`). No `closeMenu` key is needed — the Sheet's built-in close button already uses
  `dict.common.close`, and the drawer otherwise closes via nav-link click/overlay/Esc.

### API Contract

No changes. No new endpoint, no DTO change, no Orval regen in any app — this is a UI-only shell
refactor.

## Tasks

### TASK-257-A: Extract `AdminNavList` from `AdminSidebar` (no behavior change)

**Type:** refactor
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No — pure extraction refactor; existing/migrated tests must stay green.
**Depends on:** —

**Acceptance Criteria:**

- [ ] `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` created: `navItems`,
      `bottomNavItems`, `isNavItemActive`, and the three badge blocks (messages/orders/reviews)
      moved verbatim from `admin-sidebar.tsx` (~L33–172); component accepts an optional
      `onNavigate?: () => void` prop, called from every rendered `<Link>`'s `onClick` (both nav
      groups)
- [ ] `admin-sidebar.tsx` renders `<AdminNavList />` (no `onNavigate`) in place of the two inline
      `<nav>` blocks; the `<aside>` itself, its brand block, and its exact current classes are
      otherwise **unchanged** in this task (the `hidden lg:flex` responsive class change is
      deliberately deferred to TASK-257-B, keeping this task a zero-visual-diff refactor)
- [ ] `admin-nav-list.test.tsx` created — migrates the existing badge-rendering assertions from
      `admin-sidebar.test.tsx` (renders count badges for orders/reviews/messages when counts > 0;
      omits them at zero) onto `AdminNavList` directly, plus a new case asserting `onNavigate`
      fires exactly once per link click (mirrors
      `apps/store-client/src/widgets/cart/ui/cart-item-row.test.tsx`'s
      `"notifies onNavigate when a product link is clicked"` case)
- [ ] `admin-sidebar.test.tsx` updated: either kept as a thin smoke test (renders `<AdminSidebar/>`,
      asserts the nav/badges are still reachable through it) or removed if fully superseded by
      `admin-nav-list.test.tsx` — no duplicate assertions across the two files
- [ ] `index.ts` barrel-exports `AdminNavList` alongside the existing exports
- [ ] `npm run typecheck`/`lint` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.tsx` — new, extracted nav body
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — delegates to `AdminNavList`
- `apps/store-admin/src/widgets/admin-shell/admin-nav-list.test.tsx` — new, migrated + `onNavigate`
  test
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.test.tsx` — trimmed or removed
- `apps/store-admin/src/widgets/admin-shell/index.ts` — export `AdminNavList`

---

### TASK-257-B: Mobile nav drawer + header burger + responsive shell

**Type:** feat
**Scope:** store-admin
**Complexity:** M (2-4h)
**TDD Required:** No — UI shell/layout work, covered by RTL tests per the acceptance criteria
below.
**Depends on:** TASK-257-A (needs `AdminNavList` to exist so both mount points share it)

**Acceptance Criteria:**

- [ ] `admin-sidebar.tsx`'s `<aside>` gains `hidden ... lg:flex` (desktop-only; fully removed from
      the DOM's rendered layout and the accessibility tree below `lg` via `display: none`)
- [ ] `mobile-nav-drawer.tsx` created: fully-controlled `Sheet` (`open`/`onOpenChange` props, no
      `SheetTrigger`), `SheetContent side="left"` with `aria-describedby={undefined}`, a
      `SheetHeader`/`SheetTitle` reusing the brand row (Package icon + "MobileStore"), and
      `<AdminNavList onNavigate={() => onOpenChange(false)} />`
- [ ] `admin-shell.tsx` created ("use client"): owns `useState mobileNavOpen`, a
      `useEffect(() => setMobileNavOpen(false), [pathname])` route-change backstop (via
      `usePathname()`), and composes `<AdminSidebar/>` + `<MobileNavDrawer/>` +
      `<AdminHeader mobileNavOpen onOpenMobileNav/>` + `<main className="flex-1 overflow-y-auto
p-4 lg:p-6">{children}</main>` inside the existing `flex h-screen overflow-hidden` wrapper
- [ ] `admin-header.tsx`: accepts `mobileNavOpen: boolean` + `onOpenMobileNav: () => void` props;
      renders a `Button variant="ghost" size="icon" className="shrink-0 lg:hidden"
  aria-label={dict.header.openMenu} aria-expanded={mobileNavOpen} onClick={onOpenMobileNav}`
      (lucide `Menu` icon) to the left of the `<h1>`; header row gets `px-4 lg:px-6` (was `px-6`)
      and the left group gets `min-w-0 flex-1`; `<h1>` gains `truncate`
- [ ] `apps/store-admin/src/app/(dashboard)/layout.tsx` simplifies to
      `<AdminShellGuard><AdminShell>{children}</AdminShell></AdminShellGuard>`
- [ ] `dictionary.ts` gains `dict.header.openMenu: "Відкрити меню"`
- [ ] `index.ts` barrel-exports `AdminShell` and `MobileNavDrawer`
- [ ] New `admin-shell.test.tsx` (or `mobile-nav-drawer.test.tsx`): burger click opens the drawer
      (drawer content becomes visible, e.g. the "MobileStore" `SheetTitle` and nav links appear);
      clicking a nav link inside the open drawer closes it (drawer content disappears); pressing
      Esc while the drawer is open closes it (mirrors the existing Radix-based Esc-close precedent
      in `apps/store-client/src/shared/ui/account-dropdown.test.tsx`)
- [ ] `admin-header.test.tsx` (new): burger renders with `aria-label`/`aria-expanded` reflecting
      the passed `mobileNavOpen` prop; clicking it calls `onOpenMobileNav`
- [ ] TASK-248's three count badges (messages/orders/reviews) render inside the open drawer when
      their counts are > 0 (reuses the `admin-nav-list.test.tsx` mocked-counter setup from
      TASK-257-A, asserted once more with the drawer open)
- [ ] `npm run build`/`lint`/`typecheck` clean for store-admin
- [ ] Tests pass: `npm run test -w apps/store-admin`

**Files to create/modify:**

- `apps/store-admin/src/widgets/admin-shell/mobile-nav-drawer.tsx` — new
- `apps/store-admin/src/widgets/admin-shell/admin-shell.tsx` — new
- `apps/store-admin/src/widgets/admin-shell/admin-sidebar.tsx` — `hidden lg:flex`
- `apps/store-admin/src/widgets/admin-shell/admin-header.tsx` — burger + props + responsive
  padding/truncate
- `apps/store-admin/src/widgets/admin-shell/index.ts` — export `AdminShell`, `MobileNavDrawer`
- `apps/store-admin/src/app/(dashboard)/layout.tsx` — use `AdminShell`
- `apps/store-admin/src/shared/config/dictionary.ts` — `dict.header.openMenu`
- `apps/store-admin/src/widgets/admin-shell/admin-shell.test.tsx` (or `mobile-nav-drawer.test.tsx`)
  — new
- `apps/store-admin/src/widgets/admin-shell/admin-header.test.tsx` — new

---

### TASK-257-C: Cross-viewport smoke pass (360/390/768/1024) + no-horizontal-scroll audit

**Type:** test
**Scope:** store-admin
**Complexity:** S (1-2h)
**TDD Required:** No.
**Depends on:** TASK-257-B

**Acceptance Criteria:**

- [ ] Manual smoke pass (store-admin has no Playwright/e2e harness — see Risks; browser devtools
      device toolbar or a real phone) at **360, 390, 768, and 1024px** across every admin section
      reachable from the nav: Dashboard, Товари, Групи товарів, Категорії, Бренди, Пристрої,
      Промокоди, Сторінки, Блог, Банери, Замовлення, Відгуки, Повідомлення, Користувачі,
      Підписники, Контакти (`/settings/contact`), SEO (`/settings/seo`), FAQ
- [ ] At 360/390/768 (all `<lg`): sidebar is not present as a static rail; the burger opens the
      drawer; the drawer shows all nav items with the TASK-248 badges visible when counts are > 0;
      clicking a link closes the drawer and navigates
- [ ] At 1024 (the `lg` cutover): the static desktop `<aside>` renders instead of the drawer/burger
      (burger is `lg:hidden`, hidden at this width)
- [ ] At every width in the matrix, `document.documentElement.scrollWidth <=
  document.documentElement.clientWidth` (no page-level horizontal scrollbar) on every section
      listed above — a data table scrolling **inside its own bounded container** is acceptable and
      not a failure (that's TASK-258's remit); a page-level sideways scroll is a failure
- [ ] `AdminHeader` does not overflow at 360px on any section — title truncates instead of wrapping
      or pushing the logout button off-screen
- [ ] One Network-tab spot-check (any single section, drawer open): `useAdminContactUnreadCount`
      and `useAdminDashboardControllerGetNeedsAction` each fire **once**, not twice, confirming the
      two `AdminNavList` mount points (desktop aside + drawer) share one TanStack Query cache entry
      rather than doubling real requests
- [ ] Any residual finding that is genuinely out of this plan's shell-only scope (e.g. a specific
      table overflowing on some section — TASK-258's remit) is logged to
      `docs/manual-qa-pending.md` rather than blocking this task; any finding that **is** in scope
      (header/drawer/badge regressions) is fixed before this task is marked done
- [ ] `npm run build` clean for store-admin (confirms the shell change doesn't break the prod
      build)

**Files to create/modify:**

- `docs/manual-qa-pending.md` — append any genuinely out-of-scope residual finding discovered
  during the sweep (only if one is found; no entry needed otherwise)

## Dependencies & Sequencing

- **Internal:** TASK-257-A → TASK-257-B → TASK-257-C, strictly sequential (each depends on the
  previous: the extraction must land before the drawer can reuse it; the drawer must exist before
  it can be smoke-tested).
- **External:** No dependency on any other open Wave-1 task. TASK-248 (sidebar badges) is already
  merged (develop @ 847a1fb) and is a hard prerequisite in the sense that its badges must already
  exist for this plan to "preserve" them — confirmed present in the current `admin-sidebar.tsx`
  (orders/reviews/messages badge blocks, ~L115–143).
- **No shared files with TASK-249** (dashboard metrics v2 — Wave 1, concurrent): that task only
  touches `entities/dashboard`'s metrics DTO/hooks and dashboard-specific widgets/pages, not
  `widgets/admin-shell/*` or `app/(dashboard)/layout.tsx`. Safe to run fully in parallel.
- **No shared files with TASK-264** (content-map — Wave 1, concurrent): that's a new sidebar entry
  - a new `/content-map` page, not a shell-structure change; a merge conflict is possible only if
    TASK-264 also touches `navItems` in the same window (add its entry to whichever version of
    `admin-nav-list.tsx`/`admin-sidebar.tsx` exists at merge time — trivial to resolve either order).
- **Feeds TASK-258** (Wave 5, mobile admin tables & forms): TASK-258 is explicitly scoped to build
  on top of this shell (table/form responsiveness), so it should not start implementation before
  this plan's TASK-257-B lands, though it can be planned in parallel.

## Risks & Mitigations

| Risk                                                                                                                                                                                                   | Mitigation                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hydration mismatch from `usePathname()`/controlled `Sheet` state differing between server and client render                                                                                            | `mobileNavOpen` defaults to `false` identically on both server and client (server has no concept of it at all — `AdminShell` is a client component); Radix's `Dialog.Content` isn't rendered while `open={false}`, so there is no server-vs-client markup to diverge on for the drawer itself                                      |
| Custom focus-trap/keyboard code introduces a regression vs. today's zero-mobile-nav state                                                                                                              | No custom focus code is written — 100% delegated to `shared/ui/sheet.tsx` (Radix `Dialog`), the same component `store-client`'s header already uses successfully for the identical purpose                                                                                                                                         |
| Two mounted `AdminNavList` instances (desktop aside + drawer) double the badge-count network requests app-wide                                                                                         | Both call the exact same Orval-generated hooks (identical TanStack Query cache key) — React Query dedupes concurrent/duplicate subscriptions to one shared cache entry and one in-flight request, not two; spot-checked once in TASK-257-C's Network-tab check                                                                     |
| TASK-257-A's extraction accidentally changes desktop nav behavior while "just" refactoring                                                                                                             | Scoped explicitly as a zero-visual-diff task — the `<aside>`'s classes stay untouched in 257-A (only the `hidden lg:flex` responsive change, in 257-B, is a real behavior change); the existing/migrated badge tests must pass unmodified in assertions, only their render target changes                                          |
| A live window resize past the `lg` breakpoint while the drawer is open (rare, but possible on a foldable/resizable browser) could show the drawer and the now-visible desktop `<aside>` simultaneously | Accepted, documented edge case (see Notes) — not fixed by this plan; real mobile devices don't live-resize their viewport, and a desktop user resizing a window while the drawer happens to be open is exceedingly unlikely since the burger that opens it is itself `lg:hidden`                                                   |
| `store-admin` has no Playwright/e2e harness, so the 360/390/768/1024 sweep can't be a fully automated regression test                                                                                  | Accepted — RTL/jsdom covers the structural/behavioral contract (drawer opens/closes, badges render, `onNavigate` fires, Esc closes); the actual pixel-level viewport sweep is a one-time manual QA pass per TASK-257-C, same convention this project already uses for other viewport-dependent checks (see `manual-qa-pending.md`) |

## Notes

- This plan is deliberately **shell-only**: no table, form, or dashboard-card responsive work.
  TASK-258 (Wave 5) is the follow-on that makes the _content_ inside `<main>` mobile-friendly; this
  plan only guarantees the chrome around it (sidebar/drawer, header, `main`'s own padding) doesn't
  block reaching that content on a phone.
- The dead `bottomNavItems` "Settings" (`href: "#"`) entry is carried through the `AdminNavList`
  extraction unchanged — fixing it is TASK-184's job, not this plan's.
- No `dict.header.closeMenu` key is added — the Sheet's own close button already has a label
  (`dict.common.close`), and this plan does not add any additional manual close control beyond
  what `shared/ui/sheet.tsx` already provides.
- The known live-resize edge case (drawer open + window resized past `lg`) is intentionally left
  unhandled — see Risks — since it doesn't correspond to any realistic device usage pattern for an
  admin panel.
