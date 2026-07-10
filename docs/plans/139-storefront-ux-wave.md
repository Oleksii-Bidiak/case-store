# Plan 139 — Storefront UX Wave 5 (TASK-259 + TASK-218)

> **Status:** ⬜ Not started
> **Phase:** Roadmap Етап 6 — Доробки після Етапу 5 · Хвиля 5 (Адаптив/дизайн + прев'ю контенту + хвости)
> **Origin:** `docs/handoff-2026-07-07.md` Блок D · audit plan `docs/plans/103-storefront-ux-audit.md`
> (TASK-225) §2 findings table + §6 "Пріоритезація — топ-10 для TASK-193"
> **Created:** 2026-07-10
> **Last Updated:** 2026-07-10
> **BACKLOG tasks:** TASK-259, TASK-218
> **Worktree:** `feature/139-storefront-ux` — both tasks land in the **same** worktree/branch,
> implemented **sequentially**: a designer agent does TASK-259 first (all of it), then a build
> agent does TASK-218 on top. This plan's sections are individually referenceable as
> «139 §TASK-259-X» / «139 §TASK-218-X» by either agent.

## Overview

This is a pure-`store-client` polish wave with no backend or Prisma changes. It closes out the
top-10 prioritized findings from the static UI/UX audit (plan 103, TASK-225 — 32 findings, 3H/18M/11L)
and ships the header-search enhancement that was blocked on the blog module (TASK-170, now shipped).

**TASK-259** fixes five systemic a11y/adaptive patterns (invisible keyboard focus on `sr-only`
inputs, no carousel pause/reduced-motion, an inconsistent button-cursor policy, hardcoded English
a11y strings, undersized touch targets, unlinked form-error messages) plus a scoped dark-theme
token pack (`color-scheme`, brand-correct reactive `theme-color`, and an owner-decided stable-dark
footer/announcement-bar) and two quick adaptive/nav fixes (promo link missing from the mobile
Sheet, a 1-column mobile catalog grid). Two audit items (F-17/F-18, placeholder links) turn out to
already be resolved by TASK-184/TASK-267 — verified, not re-implemented (see Notes).

**TASK-218** extends the desktop header search dropdown (`HeaderSearch`, currently product-only)
with up to 5 matching blog articles below the product suggestions, separated and independently
scrollable, using the blog module's **already-generated** `useBlogControllerFindAll` Orval hook —
no backend change, no Orval regen needed for this feature.

Both tasks are storefront UI/a11y/adaptive work, not cart/discount/inventory/auth business logic,
so neither is TDD-required per AGENTS.md's TDD scope — but both get RTL/unit test coverage per
their acceptance criteria (frontend-testing skill: jsdom RTL/MSW project).

## Scope

### In Scope

- TASK-259: F-01, F-02 (+F-09 dot hit-area, same file), F-03, F-04+F-05+F-06 (dark-theme pack),
  F-11…F-14 (a11y string localization), F-15 (`aria-describedby`), F-16, F-19, F-20 (remaining
  touch targets not already covered by F-09's slider fix).
- TASK-218: mixed product + blog suggestions in the desktop `HeaderSearch` dropdown.
- New shared `dict.common.close`, `dict.pagination`-ish additions under existing `dict.catalog.*`,
  `dict.checkout.*`, `dict.product.*`, `dict.search.*` slices (see each subtask).
- A verification-only pass confirming F-17/F-18 need no further code changes (Notes).

### Out of Scope

- F-07, F-08, F-10, F-21…F-32 (remaining audit findings, L/lower-priority M) — left for future
  passes per plan 103 §6 ("Решта … фонові чистки під час планових дотиків").
- F-21 (arbitrary Tailwind values) itself is **not** remediated wholesale here — TASK-260 (lint
  rule) is the next Wave-5 row and is explicitly sequenced _after_ this plan merges (its own
  BACKLOG note: "TASK-260 adds a lint rule right after this merges"). This plan must not introduce
  **new** arbitrary values (constraint below), but pre-existing ones outside the touched files are
  not swept.
- The mobile `SearchAutocomplete` (`features/search/ui/search-autocomplete.tsx`, used inside the
  header's Sheet menu) is **not** touched by TASK-218 — it is built on the generic `Combobox`
  primitive (single flat option list), and the BACKLOG task text scopes TASK-218 to the header
  search dropdown, which on this codebase means the desktop `HeaderSearch` widget specifically.
  Mixing blog suggestions into the mobile `Combobox`-based autocomplete would require reshaping a
  shared primitive used elsewhere and is left as a future follow-up if the owner wants parity.
- A dedicated `GET /api/blog/suggest` endpoint — the existing `GET /api/blog?q=&limit=` (via
  `useBlogControllerFindAll`) is sufficient for a capped 5-result dropdown list; do not add a new
  backend endpoint or touch `apps/store-api/src/blog/**`.
- Theme _switcher_ (manual light/dark toggle) — out of scope everywhere in this codebase per the
  audit's documented finding (`account-settings-section.tsx` stub explicitly says "слідуємо ОС").
  F-04/F-05/F-06 only fix the existing OS-driven `prefers-color-scheme` strategy, they do not add a
  toggle.

## User Stories

1. As a keyboard-only shopper, I want every custom checkbox/radio/toggle to show a visible focus
   ring, so I always know which control I'm about to activate (checkout payment method, cart
   add-on checkboxes, account notification toggles, wishlist filter checkboxes).
2. As a shopper with vestibular sensitivity (`prefers-reduced-motion`) or someone reading the hero
   banner, I want the homepage carousel to stop auto-advancing and to offer a pause control, so
   motion doesn't interrupt me and I can read a slide at my own pace.
3. As a screen-reader user browsing in Ukrainian, I want pagination, the image gallery, dialogs,
   and the checkout stepper to announce themselves in Ukrainian, not English.
4. As a mobile shopper on a 320–375px phone, I want the catalog to show two product cards per row
   (matching every other UA accessories shop) and to reach «Акції» from the hamburger menu, and I
   want every icon button (delete, wishlist heart, rating star) to have a comfortably tappable
   hit-area.
5. As the store owner, I want the footer and announcement bar to stay visually "dark" regardless
   of the visitor's OS theme, and I want the browser chrome's theme color to match the brand
   indigo instead of a generic blue, in both light and dark OS themes.
6. As a shopper typing into the header search box, I want to see matching blog articles alongside
   matching products, so I can find a buying-guide post without leaving the search box.

## Technical Design

### TASK-259 — design decisions per finding group

#### §TASK-259-A — F-01: visible focus on `sr-only` custom inputs

Five `<input className="sr-only">` controls across four files have no visible keyboard-focus
indicator today (confirmed: none of them carries `peer` and no `peer-focus-visible:`/
`has-[:focus-visible]:` utility exists anywhere in the codebase). Fix, applied identically at all
five spots: add `peer` to the `<input>`, and `peer-focus-visible:ring-2 peer-focus-visible:ring-ring
peer-focus-visible:ring-offset-2` to the adjacent `aria-hidden` visual `<span>`.

| #   | File                                                                                  | Control                                       |
| --- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | `apps/store-client/src/widgets/checkout/ui/checkout-payment-stub.tsx` (~line 42-48)   | payment-method `<input type="radio">`         |
| 2   | `apps/store-client/src/widgets/checkout/ui/checkout-payment-stub.tsx` (~line 80-85)   | "списати бонуси" `<input type="checkbox">`    |
| 3   | `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` (~line 329-334)             | add-on service `<input type="checkbox">`      |
| 4   | `apps/store-client/src/widgets/account/ui/account-settings-section.tsx` (~line 57-62) | notification `<input type="checkbox">` toggle |
| 5   | `apps/store-client/src/widgets/wishlist/ui/wishlist-filters.tsx` (~line 116-121)      | quick-filter `<input type="checkbox">`        |

No visual regression for mouse users — `peer-focus-visible` only activates on keyboard focus
(`:focus-visible`), never on click.

#### §TASK-259-B — F-02 + F-09: hero-slider pause + `prefers-reduced-motion` + dot hit-area

`apps/store-client/src/widgets/hero-banner/ui/hero-slider.tsx` autoplays every `AUTOPLAY_MS`
(7000ms, line 32/118) with zero pause affordance and zero `motion-reduce`/`prefers-reduced-motion`
gating anywhere in the file (confirmed: 0 matches for either across the whole `src` tree today).
Design:

- New shared hook `apps/store-client/src/shared/lib/use-reduced-motion.ts` — SSR-safe (`useState`
  seeded `false`, synced in a `useEffect` via `window.matchMedia('(prefers-color-scheme: reduce)')`
  — actual query string is `'(prefers-reduced-motion: reduce)'` — with a `change` listener,
  cleaned up on unmount). Mirrors the existing `use-debounced-callback.ts` module's placement and
  export style (a single default-exportable hook, direct-import convention). Testable: the global
  jsdom `window.matchMedia` stub in `shared/test/setup.ts` defaults `matches: false`, so a
  per-test `jest.spyOn`/reassignment of `window.matchMedia` drives both branches.
- `HeroSlider` reads `useReducedMotion()`. When `true`: the `setInterval` autoplay effect never
  arms (early return, mirroring the existing `if (count <= 1) return;` guard at line 117).
- New pause/play toggle button, placed in the same control cluster as the prev/next arrows
  (absolute-positioned, sits in the bottom-right near the dots or top-right corner — build agent's
  call on exact placement, must not overlap the CTA button or dots). `useState` local `paused`
  flag; autoplay effect also early-returns when `paused === true` or when the reduced-motion hook
  is `true`. Icon: `Pause`/`Play` from `lucide-react` (already a project dependency), `aria-label`
  from new `dict.home.hero.pauseAutoplay` / `dict.home.hero.resumeAutoplay` keys, `aria-pressed`
  reflecting `paused`.
- Pause/focus-within also pauses: `onMouseEnter`/`onFocus` on the slider's outer container sets a
  `hovered` flag (separate from the explicit `paused` toggle) that also gates the autoplay effect —
  satisfies the audit's "hover/focus-within" part of F-02 without needing a CSS-only trick, since
  the effect needs to actually skip re-arming the interval, not just visually freeze.
- Dot indicators (lines ~197-212): `h-1.5` visual dot stays the same size, but each `<button>`
  gains an invisible larger hit-area via padding (`p-2 -m-2` around the dot, or `min-h-11
min-w-11` on the button with the visual dot as a centered inner `<span>`) — closes F-09
  (currently 6-24px wide) to a 44px minimum tap target without changing the visual footprint.

#### §TASK-259-C — F-03: single button-cursor policy

Tailwind v4's preflight sets `cursor: default` on `<button>`; the base `Button`
(`apps/store-client/src/shared/ui/button.tsx`) does not override it, so 31 files patch
`cursor-pointer` ad hoc while the base component and roughly a dozen more raw `<button>`s do not —
an inconsistent arrow/hand cursor across the storefront. Fix (per plan 103 §2's own two options,
this plan picks the global-rule option since it fixes every current and future button with zero
per-file churn): add one rule to `apps/store-client/src/app/globals.css`'s "Base Styles" section:

```css
button:not(:disabled) {
  cursor: pointer;
}
```

This alone fixes every plain `<button>` site-wide (base `Button`, `Pagination` arrows, the
`ViewToggle`/`WishlistToggleButton`/star-rating buttons, etc.) without touching `buttonVariants`.
Opportunistic cleanup: remove the now-redundant `cursor-pointer` utility from the 31 files it was
manually patched onto (grep `cursor-pointer` across `apps/store-client/src`, drop the class where
the element is a plain `<button>` — leave it where it's on a non-button element like `<label>` or
a `<div role="button">`-style container that the global CSS rule doesn't reach).

#### §TASK-259-D — F-04 + F-05 + F-06: dark-theme token pack (owner decision F-06)

Three related fixes, one task since they touch the same handful of files:

1. **F-04 — `color-scheme`.** `apps/store-client/src/app/globals.css`: add `color-scheme: light;`
   inside the existing `:root { … }` block (light tokens), and `color-scheme: dark;` inside the
   existing `@media (prefers-color-scheme: dark) { :root { … } }` block. Fixes native-control
   theming (scrollbar chrome outside the custom WebKit styling, `<select>` popups, autofill,
   number-input spinners) without touching any component.
2. **F-05 — brand-correct, theme-reactive `theme-color`.**
   `apps/store-client/src/shared/config/theme.ts`: `PRIMARY_COLOR` is currently `#2563eb` (a
   generic blue, not the brand indigo `#4f46e5`/`#6366f1` from `globals.css`). Add
   `PRIMARY_COLOR_DARK = "#6366f1"` alongside the corrected `PRIMARY_COLOR = "#4f46e5"` (mirrors
   `--color-primary` light/dark exactly). `apps/store-client/src/app/layout.tsx`'s
   `export const viewport: Viewport` currently sets a single static `themeColor: PRIMARY_COLOR`
   (line 54) — change to Next's array form:
   ```ts
   themeColor: [
     { media: "(prefers-color-scheme: light)", color: PRIMARY_COLOR },
     { media: "(prefers-color-scheme: dark)", color: PRIMARY_COLOR_DARK },
   ],
   ```
3. **F-06 — stable-dark footer/announcement-bar (owner decision, already made): new semantic
   tokens, not a class swap.** `footer.tsx`/`announcement-bar.tsx` currently use
   `bg-foreground text-background` (+ `text-background/NN` opacity variants, `border-background/NN`,
   `focus-visible:ring-background`) — since `--color-foreground`/`--color-background` themselves
   flip between light and dark mode, this pattern inverts the footer to a light panel in dark mode
   (documented in plan 103 §3). Add two **theme-invariant** tokens to `globals.css`, defined once
   in `:root` and **not** overridden inside the dark media block (so they hold their light-mode
   values in both themes):
   ```css
   /* :root, light block — NOT redefined in the dark media query, by design (F-06). */
   --color-footer: #0f172a; /* = light-mode --color-foreground */
   --color-footer-foreground: #ffffff; /* = light-mode --color-background */
   ```
   Wire into `@theme inline` (`--color-footer: var(--color-footer); --color-footer-foreground:
var(--color-footer-foreground);`) so `bg-footer`/`text-footer-foreground` become valid Tailwind
   utilities. Then in `footer.tsx` and `announcement-bar.tsx`, replace every
   `bg-foreground`/`text-background`/`border-background`/`ring-background` occurrence with the
   `-footer`/`-footer-foreground` equivalent (`bg-footer`, `text-footer-foreground`,
   `text-footer-foreground/70`, `border-footer-foreground/10`, `focus-visible:ring-footer-foreground`,
   etc.) — an exhaustive find/replace within these two files only (do not touch any other file's
   `bg-foreground`/`text-background` usage, which is correct theme-reactive behavior everywhere
   else). Verifies visually as: footer/announcement-bar look identical to today in light mode, and
   stay the same dark panel in dark mode instead of inverting.

#### §TASK-259-E — F-16: «Акції» in the mobile Sheet menu

`apps/store-client/src/widgets/header/ui/header.tsx`: the desktop-only promo link (lines ~239-245,
`hidden … sm:flex`) has no mobile-Sheet counterpart — `NAV_LINKS` (lines 30-33) only lists
`/products` and `/blog`. Add a `/promo` entry to the Sheet's `<nav>` (either append to `NAV_LINKS`
using `dict.header.promoLabel`, or add a standalone `<Link>` styled like the existing cart/wishlist
rows at lines 129-142 — build agent's call, either satisfies the finding) so «Акції» is reachable
below 640px.

#### §TASK-259-F — F-11…F-14: a11y strings → `dict`

Four hardcoded-English spots, one dictionary pass:

| File                                                                                                            | Hardcoded string(s)                                                                                           | New dict key(s)                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/store-client/src/widgets/product-list/ui/pagination.tsx` (~lines 47, 56, 61, 102, 106)                    | `aria-label="Pagination"`, sr-only `"Previous"`/`"Next"`, `aria-label="Previous"`/`"Next"` on the live arrows | Reuse existing `dict.catalog.paginationAria` for the `<nav>`; add `dict.catalog.paginationPreviousAria` / `dict.catalog.paginationNextAria` (used as both the live-arrow `aria-label` and the disabled-arrow sr-only text)                                                                                               |
| `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` (~lines 138, 157)                   | ``aria-label={`Show image ${index + 1}`}``, ``alt={...`thumbnail ${index + 1}`}``                             | `dict.product.showImageAria(n: number)`, `dict.product.imageThumbnailAlt(n: number)` (function-style, matching the file's existing `dict.product.imageLoading` slice)                                                                                                                                                    |
| `apps/store-client/src/shared/ui/sheet.tsx` (~line 91), `apps/store-client/src/shared/ui/dialog.tsx` (~line 87) | `<span className="sr-only">Close</span>`                                                                      | New `dict.common.close: "Закрити"` — both files already import `dict` from `@/shared/config` elsewhere in this codebase (precedent: `color-dots.tsx`, `product-card.tsx`, `rating-stars.tsx` already do this same same-layer `shared/ui` → `shared/config` import), so this is a same-layer import, not an FSD violation |
| `apps/store-client/src/widgets/checkout/ui/checkout-step-indicator.tsx` (~line 19)                              | `aria-label="Checkout progress"`                                                                              | `dict.checkout.progressAria`                                                                                                                                                                                                                                                                                             |

#### §TASK-259-G — F-19: 2-column mobile catalog grid

`apps/store-client/src/widgets/product-list/ui/product-list.tsx` (~line 181) and
`apps/store-client/src/widgets/product-list/ui/product-list-skeleton.tsx` (~line 28) both use
`grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]`, which yields exactly
1 column at 320-375px (232px minimum doesn't fit two columns in that width) — contradicts
`docs/design-system.md` §4's explicit "2-up on mobile" benchmark
(`grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4`). Fix, preserving the existing
desktop/tablet auto-fill behavior (which the design-system's 3-tier breakpoint pattern doesn't
capture as-is — auto-fill scales past `lg` on wide screens) while forcing 2 columns below `sm`:

```
grid grid-cols-2 gap-[18px] sm:[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]
```

Apply identically to both files (the skeleton must mirror the real grid exactly, per this
codebase's established loading-skeleton convention, or the loading→loaded transition jumps).

#### §TASK-259-H — F-20: remaining 44px touch targets

F-09 (hero dots) is fixed in §TASK-259-B (same file as the pause button). The rest:

| File                                                                                                                                   | Current | Fix                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` (~line 264, delete button, `size-8`=32px)                                    | 32px    | `size-11` (44px) — icon stays `size-[18px]`, only the button hit-area grows                                                                                                                                              |
| `apps/store-client/src/features/toggle-wishlist/ui/wishlist-toggle-button.tsx` (~line 118, `overlay` variant, `size-9`=36px)           | 36px    | `size-11`; the `inline` variant is already `size-11` (line 119), leave it                                                                                                                                                |
| `apps/store-client/src/features/product-filters/ui/view-toggle.tsx` (~line 20, both buttons `size-9`=36px)                             | 36px    | `size-11`                                                                                                                                                                                                                |
| `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx` (~lines 114-133, star buttons `p-0.5` + `size-6` icon ≈ 28px) | ~28px   | Increase padding to reach 44px total (e.g. `p-2.5` around the `size-6` star, or wrap in a `min-h-11 min-w-11` flex-center button) — the visual star size (`size-6`) must stay unchanged, only the tappable padding grows |
| `apps/store-client/src/widgets/header/ui/header-wishlist-badge.tsx` (~line 26, `px-2 py-1.5` around a `size-[22px]` icon ≈ 34px tall)  | ~34px   | Bump vertical padding (`py-1.5` → `py-2.5` or similar) so the tappable height reaches 44px — must not visually grow the icon or unbalance the header action-cluster's height against `HeaderCartBadge` (already `h-11`)  |

Each fix is a hit-area change only (padding/sizing of the interactive element), never a change to
the visible icon glyph size — per the constraint given in the task description.

#### §TASK-259-I — F-15: `aria-describedby` on RHF form errors

Every RHF-driven form in the storefront renders its field error as a bare
`<p role="alert">{message}</p>` with no `aria-describedby` link back to the `<input>` — the
message is announced when it _appears_ (live-region-like via `role="alert"`), but a screen-reader
user tabbing back to a previously-erred field gets no indication that the field is still invalid
beyond the (already-present) `aria-invalid`. Fix pattern, applied uniformly: give the error
paragraph `id={`${id}-error`}` and add `aria-describedby={message ? `${id}-error` : undefined}` on
the corresponding `<Input>`/`<Controller>`-rendered input.

Files (all confirmed RHF forms rendering this exact `role="alert"` pattern today):

- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` (`renderField` helper,
  ~lines 65-84, plus the `phone` `Controller` block) — the reference implementation; the
  `renderField` helper already computes `id`/`message` locally, so this is close to a one-line
  change plus the same pattern applied to the `phone` field's inline JSX.
- `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx` (rating error at
  ~lines 136-140, plus any other field-level errors further down the file — grep
  `role="alert"` within this file for the full list).
- `apps/store-client/src/features/apply-discount/**` (grep `role="alert"` — the coupon-code input).
- Account profile / contact forms — grep `role="alert"` across `apps/store-client/src/features/**`
  and `apps/store-client/src/widgets/account/**`/`widgets/contact/**` for every remaining RHF
  error-message site not already covered above; apply the same `id`/`aria-describedby` pairing to
  each.

No dict changes needed here — purely a wiring change (`id` + `aria-describedby`), no new strings.

### TASK-218 — mixed header-search suggestions

#### §TASK-218-A — `entities/blog` FSD wrapper

Today `store-client` has no `entities/blog` — blog data flows only through the server-side
`shared/api/blog-server.ts` ISR helper (`widgets/blog`'s consumption pattern). `HeaderSearch` is a
Client Component that needs a live `useBlogControllerFindAll` query, so — mirroring the existing
`entities/search/index.ts` re-export pattern exactly — add a new
`apps/store-client/src/entities/blog/index.ts`:

```ts
export type {
  BlogControllerFindAllParams,
  BlogPostEntity,
} from "@/shared/api/generated/models";

export {
  useBlogControllerFindAll,
  getBlogControllerFindAllQueryKey,
} from "@/shared/api/generated/blog/blog";
```

This is the only new file for this subtask — no Orval regen (the hook and models already exist,
shipped with TASK-170), no backend change. Widgets keep importing generated API access through the
`entities` layer (consistent with every other data-access import in `HeaderSearch` today —
`useSearchSuggest` from `@/entities/search`, `useCategoryControllerGetRootCategories` from
`@/entities/category`).

#### §TASK-218-B — mixed suggestions UI in `HeaderSearch`

`apps/store-client/src/widgets/header/ui/header-search.tsx` currently fetches only
`useSearchSuggest({ q: query }, …)` (line 43-46) and renders a single `<ul role="listbox">` (lines
239-282). Design:

- Add a second query reusing the **same** debounced `query` state (no new debounce timer):
  ```ts
  const { data: blogData, isFetching: blogFetching } = useBlogControllerFindAll(
    { q: query, limit: BLOG_SUGGEST_LIMIT },
    { query: { enabled: query.trim().length >= MIN_QUERY_LENGTH } },
  );
  const blogPosts = blogData?.data ?? [];
  ```
  `BLOG_SUGGEST_LIMIT = 5` as a module constant next to `MIN_QUERY_LENGTH`.
- Dropdown layout: keep the existing product `<ul id={LISTBOX_ID} role="listbox">` block as-is
  (including its own loading/empty states), then — only when `blogPosts.length > 0` — render a
  `<hr>`-style separator, a small non-interactive heading (`dict.search.blogSectionLabel`, e.g.
  "Статті блогу"), and a second `<ul role="listbox">` (`id="header-search-blog-listbox"`,
  `aria-label={dict.search.blogSectionLabel}`) listing up to 5 posts (title + optional cover
  thumbnail, mirroring the product row's `<Search icon> + truncated label` shape but with a small
  `coverImageUrl` thumbnail when present instead of the search icon).
- "Independently scrollable sections": give the product `<ul>` and the blog `<ul>` **each** their
  own `max-h-[...] overflow-y-auto` (e.g. `max-h-72` each, tune to fit ~6 rows) inside the shared
  outer dropdown `<div>` (lines 240), rather than one shared scroll region — so a shopper can
  scroll through all products without the blog section scrolling out of view underneath, and
  vice versa.
- Keyboard navigation spans **both** sections as one logical list: build a single combined array
  for `ArrowUp`/`ArrowDown`/`Enter` purposes — e.g.
  `type CombinedItem = { kind: "product"; slug: string } | { kind: "blog"; slug: string }`,
  concatenating `suggestions` then `blogPosts`, and reuse the existing `activeIndex` state against
  this combined array's length (`onInputKeyDown`, lines 98-120) instead of `suggestions.length`.
  `Enter` on the active item routes based on `kind`: products keep `router.push('/products/'+slug)`
  (existing `pick`), blog posts route to ``router.push(`/blog/${slug}`)`` (new `pickBlogPost`
  helper, mirroring `pick`). Visual highlight (`aria-selected`/`bg-muted` on hover/active) applies
  the same way in both `<ul>`s by deriving each item's index within the combined array.
- Empty/loading states: the existing "no suggestions" / "searching…" copy
  (`dict.search.empty`/`dict.search.loading`) stays scoped to the product section only — the blog
  section simply doesn't render at all when `blogPosts.length === 0` (no separate "no blog posts"
  empty state; avoids a confusing double-empty-state dropdown when a query matches nothing in
  either source — that case still falls through to the product section's existing empty copy).
- New dict keys (under `dict.search`): `blogSectionLabel` ("Статті блогу"), and reuse
  `dict.search.inputAria` for both listbox `aria-label`s is **not** appropriate (would be
  identical/confusing under a screen reader with two same-named regions) — so `blogSectionLabel`
  doubles as both the visible heading and the second listbox's `aria-label`.

#### API Contract (TASK-218 — unchanged, reused)

| Method | Path                   | Request                                  | Response                                                                                                                                        |
| ------ | ---------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/blog?q=&limit=5` | `BlogControllerFindAllParams` (existing) | `BlogPostListResponse` (existing) — no new fields needed by the dropdown (`slug`, `title`, `coverImageUrl` already present on `BlogPostEntity`) |

No Swagger/DTO changes, no Orval regen for this plan.

## Tasks

### TASK-259-A: F-01 — visible focus rings on `sr-only` custom inputs

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] All 5 `sr-only` inputs listed in §TASK-259-A get `peer` on the `<input>` and
      `peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2` on
      the adjacent visual `<span>`.
- [ ] Tabbing to each control with a keyboard shows a visible ring; clicking with a mouse does not
      (verified manually — `:focus-visible` semantics — and/or via an RTL test asserting the
      `peer` class is present, since jsdom cannot fully simulate `:focus-visible` heuristics).
- [ ] No visual regression to the unfocused/checked/hover states of any of the 5 controls.
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand` (existing tests for these
      4 widgets stay green; add/update assertions per the frontend-testing skill where a
      component already has a test file).

**Files to create/modify:**

- `apps/store-client/src/widgets/checkout/ui/checkout-payment-stub.tsx`
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
- `apps/store-client/src/widgets/account/ui/account-settings-section.tsx`
- `apps/store-client/src/widgets/wishlist/ui/wishlist-filters.tsx`

---

### TASK-259-B: F-02 + F-09 — hero-slider pause, reduced-motion, dot hit-area

**Type:** feat
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `apps/store-client/src/shared/lib/use-reduced-motion.ts` — SSR-safe hook, `false` on
      first render, syncs from `window.matchMedia('(prefers-reduced-motion: reduce)')` in an
      effect, listens for `change`, cleans up on unmount.
- [ ] `HeroSlider`: autoplay `setInterval` never arms when `useReducedMotion()` is `true`, when the
      new pause toggle is active, or while the pointer/focus is within the slider (hover or
      focus-within) — all three gates checked in the same effect that currently only checks
      `count <= 1`.
- [ ] New pause/play `<button>` with `aria-pressed` + `aria-label` from new
      `dict.home.hero.pauseAutoplay`/`resumeAutoplay` keys; visually placed without overlapping the
      CTA button, prev/next arrows, or dot row.
- [ ] Dot indicator buttons (currently 6-24px wide, `h-1.5`) get a ≥44px hit-area (invisible
      padding or a wrapping box) while the visible dot's pixel size is unchanged.
- [ ] New/updated RTL test (`hero-slider.test.tsx` — create if absent) asserting: (a) with
      `window.matchMedia` mocked to `matches: true` for the reduced-motion query, the slide does
      not auto-advance after `AUTOPLAY_MS` (fake timers); (b) clicking the pause button stops
      auto-advance and toggles `aria-pressed`; (c) the dot buttons render with the enlarged
      hit-area class.
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/shared/lib/use-reduced-motion.ts` — new
- `apps/store-client/src/shared/lib/use-reduced-motion.test.ts` — new
- `apps/store-client/src/widgets/hero-banner/ui/hero-slider.tsx`
- `apps/store-client/src/widgets/hero-banner/ui/hero-slider.test.tsx` — new/updated
- `apps/store-client/src/shared/config/dictionary.ts` — `home.hero.pauseAutoplay`/`resumeAutoplay`

---

### TASK-259-C: F-03 — single button-cursor policy

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `globals.css` gains a `button:not(:disabled) { cursor: pointer; }` rule in the "Base Styles"
      section.
- [ ] Redundant per-file `cursor-pointer` utilities on plain `<button>` elements are removed
      opportunistically (grep `cursor-pointer` across `apps/store-client/src`, drop the class only
      where the element is a `<button>` — leave it on non-button elements, e.g. `<label>` rows,
      where the global rule doesn't apply and the utility is still load-bearing).
- [ ] Spot-check: base `Button` (`shared/ui/button.tsx`), `Pagination` arrows, `ViewToggle`,
      `WishlistToggleButton`, submit-review star buttons all show a hand cursor on hover, with no
      component-level `cursor-pointer` class remaining on any of them.
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean; no test behavior changes expected
      (cursor CSS isn't asserted in RTL) — full suite stays green as a regression guard.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/app/globals.css`
- Any of the ~31 files carrying a redundant `cursor-pointer` on a plain `<button>` (grep-driven,
  exact list determined at implementation time)

---

### TASK-259-D: F-04 + F-05 + F-06 — dark-theme token pack

**Type:** fix
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `globals.css`: `color-scheme: light;` added inside `:root`'s light-token block;
      `color-scheme: dark;` added inside the `@media (prefers-color-scheme: dark) { :root { … } }`
      block.
- [ ] `shared/config/theme.ts`: `PRIMARY_COLOR` corrected to `#4f46e5` (was the non-brand
      `#2563eb`); new `PRIMARY_COLOR_DARK = "#6366f1"` exported alongside it, both with a comment
      cross-referencing the matching `--color-primary` light/dark values in `globals.css`.
- [ ] `app/layout.tsx`: `viewport.themeColor` becomes the two-entry array (light/dark media query
      pair) specified in Technical Design, using both exported constants.
- [ ] `globals.css`: new `--color-footer` / `--color-footer-foreground` tokens defined once in the
      light `:root` block (`#0f172a` / `#ffffff`) and **not** redefined inside the dark media
      block; both mapped in `@theme inline` as `--color-footer` / `--color-footer-foreground`.
- [ ] `footer.tsx` and `announcement-bar.tsx`: every `bg-foreground`/`text-background`/
      `border-background/*`/`focus-visible:ring-background` occurrence replaced with the
      `-footer`/`-footer-foreground` equivalent (exhaustive within these two files only — no other
      file's use of `bg-foreground`/`text-background` is touched).
- [ ] Visual check (manual, OS dark-mode toggle): footer and announcement bar render identically
      to today in light mode; in dark mode they stay the same dark panel instead of inverting to a
      light-gray panel — flagged for `manual-qa-pending.md` (this plan cannot assert
      `prefers-color-scheme` rendering in an automated test).
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean; any existing footer/announcement-bar
      RTL test still passes reading the new class names.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/app/globals.css`
- `apps/store-client/src/shared/config/theme.ts`
- `apps/store-client/src/app/layout.tsx`
- `apps/store-client/src/widgets/footer/ui/footer.tsx`
- `apps/store-client/src/widgets/header/ui/announcement-bar.tsx`

---

### TASK-259-E: F-16 — «Акції» in the mobile Sheet menu

**Type:** fix
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] The mobile Sheet's `<nav>` (`header.tsx`) includes a `/promo` link using
      `dict.header.promoLabel`, positioned sensibly among the existing top-level links (products /
      blog / cart / wishlist).
- [ ] Clicking it closes the Sheet (`onClick={() => setMenuOpen(false)}`, matching every other
      Sheet nav link's existing pattern).
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand` (update `header.test.tsx` /
      equivalent if one exists and asserts the Sheet's link set).

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header.tsx`

---

### TASK-259-F: F-11…F-14 — a11y strings → `dict`

**Type:** fix
**Scope:** store-client
**Complexity:** S (1-2h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `pagination.tsx`: `aria-label="Pagination"` → `dict.catalog.paginationAria` (existing key,
      currently unused by this file); the two disabled-arrow sr-only spans and the two live-arrow
      `aria-label`s all read from new `dict.catalog.paginationPreviousAria` /
      `paginationNextAria`.
- [ ] `product-image-gallery.tsx`: thumbnail `aria-label` and `alt` fallback read from new
      `dict.product.showImageAria(n)` / `dict.product.imageThumbnailAlt(n)`.
- [ ] `sheet.tsx` and `dialog.tsx`: the sr-only "Close" span reads from new
      `dict.common.close`.
- [ ] `checkout-step-indicator.tsx`: `aria-label="Checkout progress"` → new
      `dict.checkout.progressAria`.
- [ ] No English string remains hardcoded in any of these five files (grep-verifiable).
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand` (any test asserting the old
      English strings by exact text is updated to the new Ukrainian copy).

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/pagination.tsx`
- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx`
- `apps/store-client/src/shared/ui/sheet.tsx`
- `apps/store-client/src/shared/ui/dialog.tsx`
- `apps/store-client/src/widgets/checkout/ui/checkout-step-indicator.tsx`
- `apps/store-client/src/shared/config/dictionary.ts` — new keys under `common`, `catalog`,
  `product`, `checkout`

---

### TASK-259-G: F-19 — 2-column mobile catalog grid

**Type:** fix
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `product-list.tsx`'s grid class changes from
      `grid gap-[18px] [grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]` to
      `grid grid-cols-2 gap-[18px] sm:[grid-template-columns:repeat(auto-fill,minmax(232px,1fr))]`.
- [ ] `product-list-skeleton.tsx`'s grid-view branch gets the identical class change, so the
      loading skeleton matches the loaded grid's column count at every breakpoint.
- [ ] At a 320-375px viewport, the catalog renders 2 columns (verified via an RTL/DOM test checking
      the computed class list, plus flagged for a manual 320/375px device check in
      `manual-qa-pending.md`).
- [ ] Desktop/tablet layout (`≥sm`) is visually unchanged (still the auto-fill responsive column
      count).
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-list/ui/product-list.tsx`
- `apps/store-client/src/widgets/product-list/ui/product-list-skeleton.tsx`

---

### TASK-259-H: F-20 — remaining 44px touch targets

**Type:** fix
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** TASK-259-B (avoids re-touching `hero-slider.tsx`'s dot markup twice)

**Acceptance Criteria:**

- [ ] `cart-item-row.tsx` delete button: `size-8` → `size-11`; icon stays `size-[18px]`.
- [ ] `wishlist-toggle-button.tsx` `overlay` variant: `size-9` → `size-11`; `inline` variant
      unchanged (already 44px).
- [ ] `view-toggle.tsx` both segmented buttons: `size-9` → `size-11`.
- [ ] `submit-review-form.tsx` star buttons: padding increased so the tappable area reaches
      ≥44px×44px while the visible `size-6` star glyph is unchanged.
- [ ] `header-wishlist-badge.tsx`: vertical padding increased so the tappable height reaches
      ≥44px, without visually growing the icon or unbalancing the header action-cluster's row
      height against `HeaderCartBadge` (`h-11`).
- [ ] No layout overflow/clipping introduced in the header action cluster, cart row, or catalog
      toolbar at 320-1440px (spot-checked; flagged for a manual pass in
      `manual-qa-pending.md` if any of these interact with tightly-packed rows).
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand` (update any RTL test asserting
      the old `size-*` classes on these five components).

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx`
- `apps/store-client/src/features/toggle-wishlist/ui/wishlist-toggle-button.tsx`
- `apps/store-client/src/features/product-filters/ui/view-toggle.tsx`
- `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx`
- `apps/store-client/src/widgets/header/ui/header-wishlist-badge.tsx`

---

### TASK-259-I: F-15 — `aria-describedby` on RHF form errors

**Type:** fix
**Scope:** store-client
**Complexity:** M (2-4h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] `checkout-address-form.tsx`: every field's error `<p role="alert">` gets
      `id={`${id}-error`}`; the paired input gets `aria-describedby={message ? `${id}-error` :
    undefined}` — applied to both the `renderField` helper's output and the inline `phone`
      `Controller` block.
- [ ] Every other RHF form found via a `role="alert"` grep across `apps/store-client/src/features/**`
      and the account/contact widgets (submit-review, apply-discount, account profile, contact)
      gets the identical `id`/`aria-describedby` pairing.
- [ ] No visual change — this is a pure ARIA-wiring change (`aria-invalid` behavior, already
      present on every field, is untouched).
- [ ] New/updated RTL assertions (at least one form, e.g. `checkout-address-form.test.tsx`) that a
      field with a validation error renders its input with
      `aria-describedby` pointing at the error paragraph's `id`.
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx`
- `apps/store-client/src/features/submit-review/ui/submit-review-form.tsx`
- `apps/store-client/src/features/apply-discount/**` (exact file determined via grep)
- Any additional account/contact form file surfaced by the `role="alert"` grep sweep

---

### TASK-218-A: `entities/blog` FSD wrapper

**Type:** feat
**Scope:** store-client
**Complexity:** S (< 1h)
**TDD Required:** No
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `apps/store-client/src/entities/blog/index.ts` re-exports `useBlogControllerFindAll`,
      `getBlogControllerFindAllQueryKey` (from `@/shared/api/generated/blog/blog`) and
      `BlogControllerFindAllParams`, `BlogPostEntity` (from `@/shared/api/generated/models`),
      mirroring `entities/search/index.ts`'s existing re-export shape exactly.
- [ ] No Orval regen — both the hook and the models already exist (shipped with TASK-170); this
      task only adds the entities-layer re-export.
- [ ] `npm run typecheck -w apps/store-client` clean.

**Files to create/modify:**

- `apps/store-client/src/entities/blog/index.ts` — new

---

### TASK-218-B: mixed product + blog suggestions in `HeaderSearch`

**Type:** feat
**Scope:** store-client
**Complexity:** L (4-8h)
**TDD Required:** No
**Depends on:** TASK-218-A

**Acceptance Criteria:**

- [ ] `HeaderSearch` fetches `useBlogControllerFindAll({ q: query, limit: 5 }, { query: { enabled:
    query.trim().length >= MIN_QUERY_LENGTH } })` alongside the existing `useSearchSuggest` call,
      reusing the same debounced `query` state (no second debounce timer).
- [ ] When `blogPosts.length > 0`, a separator + `dict.search.blogSectionLabel` heading + a second
      `role="listbox"` (own `id`, `aria-label={dict.search.blogSectionLabel}`) render below the
      product listbox inside the same dropdown container, each list capped at 5 blog posts.
- [ ] The product `<ul>` and the blog `<ul>` each scroll independently (separate
      `max-h-* overflow-y-auto` on each list, not one shared scroll region).
- [ ] `ArrowUp`/`ArrowDown`/`Enter` navigate a single combined product+blog list in visual order
      (products first, then blog posts); `Enter` on a highlighted blog item navigates to
      `` `/blog/${slug}` ``, on a highlighted product to the existing `/products/${slug}`.
      `Escape` and outside-click close both sections together (reuses the existing
      `searchOpen`/`activeIndex` state — no new top-level state beyond what's needed for the
      combined-index math).
- [ ] Mouse hover/click on a blog row updates `activeIndex` and navigates identically to how
      product rows already behave.
- [ ] When `blogPosts.length === 0`, no blog section renders at all (product section's existing
      loading/empty copy is unaffected and unchanged).
- [ ] New `dict.search.blogSectionLabel` key ("Статті блогу" or equivalent) added.
- [ ] New/updated RTL test (`header-search.test.tsx` — create if absent, MSW mocking both
      `GET /api/search/suggest` and `GET /api/blog`) asserting: product-only results still work
      unchanged; a query matching both sources renders both listboxes with the correct item
      counts and the separator/heading; arrow-key navigation moves through products then into blog
      items; `Enter` on a blog item calls `router.push('/blog/<slug>')`; a query matching zero blog
      posts renders no blog section.
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean.
- [ ] Tests pass: `npm run test -w apps/store-client -- --runInBand`.

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-search.tsx`
- `apps/store-client/src/widgets/header/ui/header-search.test.tsx` — new/updated
- `apps/store-client/src/shared/config/dictionary.ts` — `search.blogSectionLabel`

## Migration Steps

1. TASK-259-A (F-01 focus rings) — no dependencies, safe to start first.
2. TASK-259-B (F-02/F-09 hero slider) — no dependencies; do before TASK-259-H so the dot hit-area
   isn't touched twice.
3. TASK-259-C (F-03 cursor policy) — no dependencies; touches many files, best done once the
   focus-ring/hero changes above have already landed to minimize merge noise within the same
   worktree.
4. TASK-259-D (F-04/05/06 dark-theme pack) — no dependencies.
5. TASK-259-E (F-16 promo Sheet link) — no dependencies, quick.
6. TASK-259-F (F-11…F-14 a11y strings) — no dependencies.
7. TASK-259-G (F-19 2-col mobile grid) — no dependencies.
8. TASK-259-H (F-20 touch targets) — depends on TASK-259-B.
9. TASK-259-I (F-15 aria-describedby) — no dependencies; do last among the TASK-259 subtasks since
   the grep sweep benefits from the codebase being otherwise settled.
10. Run the full store-client verification suite (lint/typecheck/`npm run test --runInBand`) once
    all TASK-259 subtasks land, before starting TASK-218.
11. TASK-218-A (`entities/blog` wrapper) — depends on nothing from TASK-259, could in principle run
    in parallel, but this plan sequences it after TASK-259 per the worktree hand-off (designer
    agent finishes TASK-259, then the build agent picks up TASK-218 in the same branch).
12. TASK-218-B (mixed suggestions UI) — depends on TASK-218-A.
13. Final full-suite verification (lint/typecheck/build/`test --runInBand` across the whole
    worktree) before handing the branch back for review/merge.

## Risks & Mitigations

| Risk                                                                                                                                                                                                                                                                          | Mitigation                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `:focus-visible` behavior (F-01) can't be fully asserted in jsdom (no real focus-visible heuristic)                                                                                                                                                                           | RTL tests assert the `peer`/`peer-focus-visible:*` classes are present; the actual visible-ring behavior is a manual keyboard-tab spot-check, noted in `manual-qa-pending.md`                                |
| The global `button:not(:disabled) { cursor: pointer }` rule (F-03) could regress a spot where a `<button>` is deliberately non-interactive-looking (e.g. a disabled-styled toggle that isn't actually `disabled`)                                                             | Grep sweep in TASK-259-C explicitly spot-checks the handful of components most likely to be affected (segmented toggles, pagination arrows) before considering the task done                                 |
| New `--color-footer`/`--color-footer-foreground` tokens (F-06) must be found by every `bg-foreground`/`text-background` occurrence _specific to_ `footer.tsx`/`announcement-bar.tsx` — an easy miss (leaving one occurrence un-migrated) reintroduces a partial inversion bug | Acceptance criteria call for an exhaustive grep within exactly these two files; a stray `bg-foreground`/`text-background` left in either file after this task is a regression, not a stylistic choice        |
| Combined keyboard-navigation index math in TASK-218-B (products + blog as one list) is easy to get off-by-one on at the products/blog boundary                                                                                                                                | Dedicated RTL test asserts arrow-key traversal crosses from the last product into the first blog item and back                                                                                               |
| `prefers-reduced-motion`/dark-mode visual outcomes (TASK-259-B, TASK-259-D) cannot be asserted by an automated jsdom test beyond mocking `matchMedia`/class presence                                                                                                          | Both flagged for `manual-qa-pending.md` (reduced-motion via OS/DevTools emulation, dark-theme footer via OS toggle) per the task description's own "Constraints to encode"                                   |
| F-21 (arbitrary Tailwind values) lint rule (TASK-260) lands _after_ this plan merges — any **new** arbitrary value introduced by this plan's own work becomes lint debt the moment TASK-260 ships                                                                             | Every new class added by this plan uses the existing token/utility scale (`size-11`, `p-2.5`, `max-h-72`, etc.) — no new `text-[Npx]`/`p-[Npx]`-style values are introduced anywhere in TASK-259 or TASK-218 |

## Notes

- **F-17/F-18 verification (no code change).** The audit (plan 103, written before TASK-184 and
  TASK-267 shipped) flagged the footer «Інформація» column linking every item to `/products` as a
  placeholder (F-17) and the newsletter social `href="#"` links as dead (F-18). Both are confirmed
  resolved by this plan's own read of the current `footer.tsx` (dynamic `/legal/<slug>` +
  `/info#about` + `/info#faq` + `/blog` links, zero `href="#"` stubs) and by the BACKLOG rows for
  TASK-184 ("Closes F-17") and TASK-267 ("Closes F-18", honest `toast` "скоро" affordance on the
  genuinely-dead social anchors in `newsletter.tsx`/`blog-newsletter`). No subtask is scheduled for
  either finding in this plan — flagged here so a future reader doesn't wonder why plan 103's F-17/
  F-18 rows aren't represented as TASK-259 subtasks.
- **Why TASK-218 doesn't touch the mobile `SearchAutocomplete`.** See "Out of Scope" above — it's a
  `Combobox`-based single-list primitive shared with other call sites; reshaping it for two
  sections is a larger, separate change than this plan's BACKLOG scope ("Header search mixed
  suggestions" — header, singular, matches the desktop `HeaderSearch` widget specifically).
- **Sequencing inside one worktree.** Both BACKLOG tasks share `feature/139-storefront-ux` and are
  implemented by two different agent roles in sequence (designer → build), not in parallel, per
  the orchestrator's instructions — there is no file-disjointness constraint to document here (the
  way plan 135 had to document one for its concurrent-worktree sibling), since TASK-218 only
  touches `header-search.tsx`/`entities/blog`/dictionary, none of which TASK-259 touches.
- **`docs/manual-qa-pending.md`.** Per the task description, the implementing agent(s) append
  `## TASK-259` and `## TASK-218` sections at the end of that file (not edited by this planning
  pass) listing the visual-only checks flagged throughout this plan: reduced-motion carousel
  behavior, dark-theme footer/announcement-bar stability, 320/375px 2-column catalog + touch-target
  spot-checks, and mixed header-search suggestions on a real viewport.
- **`BACKLOG.md`.** Not edited by this planning pass — the orchestrator updates task status and the
  plan-reference column.
