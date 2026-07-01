# Plan: Storefront chrome redesign — Header, Footer, Product Card

> **Status:** ✅ Done (TASK-167-A/B/C) — pending manual visual QA on a running stack
> **Phase:** Tier 3 — UX polish · storefront design rollout
> **Parent task:** TASK-167 (design-system rollout) · relates to TASK-082, TASK-089, TASK-154
> **Created:** 2026-07-01
> **Last Updated:** 2026-07-01

## Overview

Align the **shared storefront chrome** with the Claude Design import
(`Homepage.dc.html` / `SiteHeader.dc.html` / `SiteFooter.dc.html`) the same way
TASK-162 did the homepage body: rework the **existing** `store-client` widgets in
place, decompose per FSD, reuse `@/shared/ui` primitives, keep all copy in `dict`,
and never hardcode hex — style with the semantic tokens already in `globals.css`.

The design system **is** the project's own published `@store/store-client` library,
so the shared primitives (`ProductCard`, `Badge`, `Button`, `Sheet`, `Select`) already
match the mockups. The gap is in the composite widgets that assemble them —
**Header** (largest delta), **Footer** (medium), and a small **Product Card** audit.

Logic that has no backend yet is built as **static UI now** (per the owner: "логіка
буде будуватись все з готовим ui"); the real wiring is tracked as follow-ups.

## Scope decisions (locked with owner)

1. **Header top bar** — _message + phone only_. Announcement row (free-shipping +
   same-day) and the support phone; **no** city / language / currency selectors yet.
2. **Catalog mega-menu** — _real-category panel_. "Каталог" button + dropdown panel
   populated from the live **root categories** (`useCategoryControllerGetRootCategories`,
   the hook already used by the hero sidebar). Subcategory columns / full tree stay
   parked under **TASK-082**.
3. **Footer trust strip** — _keep it_ (restyled for the dark footer), even though the
   homepage also has a `TrustStrip` section.
4. **Product card** — _audit + polish + wishlist heart only_. **No** quick-view /
   comparison (those stay parked: TASK-086 / TASK-085).

## In Scope

- **Header:** static announcement bar (message + phone); logo mark treatment; wide
  search with a "Каталог" trigger + submit affordance (reusing the existing
  `SearchAutocomplete` feature for the input + suggestions); a **catalog dropdown**
  populated from real root categories; the action cluster restyled to the design's
  labelled-icon layout (Акції / Обране / Кабінет / Кошик) with live badges + cart
  total; mobile Sheet updated to match.
- **Footer:** dark theme (`bg-foreground` / `text-background`); restructured columns
  (Brand+socials / Каталог / Інформація / Контакти); `/info/[slug]` links where those
  pages exist (TASK-153); payment methods as bordered **text pills**; **keep** the
  trust strip (restyled) and the admin-managed contact block (`SiteContactSettings`
  via ISR — already wired).
- **Product card:** audit every card render surface (PopularRail, product-list,
  product-related, recently-viewed) for the **wishlist heart**; add it where missing;
  minor spacing/typography/focus-ring polish against the mockup.

## Out of Scope

- Mega-menu subcategory columns / full catalog tree (**TASK-082**, stays parked).
- City / language / currency selectors in the top bar.
- Quick-view modal (**TASK-086**) and product comparison (**TASK-085**).
- Real destinations/data for "Акції", promo pages, newsletter signup (**TASK-166**).
- Renaming the store brand — keep the current brand name, adopt only the visual
  logo treatment.

## User Stories

1. As a visitor I see a slim top bar with the free-shipping message and a tappable
   support phone above the header.
2. As a shopper I click **Каталог** and get a dropdown of the real store categories,
   each linking to its filtered listing.
3. As a shopper the header shows my wishlist count, cart count **and** cart total at a
   glance, with clear labelled actions.
4. As a visitor the footer gives me organised catalog/info/contact columns, social
   links and recognised payment methods, matching the site's visual language.
5. As a shopper every product card — wherever it appears — lets me add to favourites
   with one tap.

## Technical Design

### A. Header — `widgets/header/`

Current: `header.tsx` (logo, desktop `SearchAutocomplete`, one nav link, wishlist/cart/
auth badges, mobile Sheet) + `header-auth.tsx`, `header-cart-badge.tsx`,
`header-wishlist-badge.tsx`.

New / changed components (FSD: widget composes `shared/ui` + the `search` feature +
the `category` entity hook):

- **`announcement-bar.tsx`** (new, server) — `bg-foreground text-background`, left:
  success-dot + free-shipping/same-day copy; right: `tel:` phone (mono). Non-sticky
  (scrolls away); header stays sticky. Copy → `dict.header.announcement`.
- **`catalog-menu.tsx`** (new, client) — the "Каталог" button (`aria-expanded`) +
  dropdown panel listing **real root categories** via
  `useCategoryControllerGetRootCategories({ isActive:true, sortBy:'sortOrder' })`;
  each item → `/products?categoryId=${id}`; skeleton while pending, error/empty
  fallbacks; closes on outside-click, `Esc`, and route change. Deep subcategory
  columns explicitly deferred (TASK-082).
- **Search block** — keep `SearchAutocomplete` for the input + suggestion dropdown
  (already matches the mockup); wrap it with the `catalog-menu` trigger on the left
  and a primary submit button on the right inside the bordered pill.
- **Action cluster** — restyle the existing `HeaderWishlistBadge` / `HeaderCartBadge`
  / `HeaderAuth` to the labelled-icon layout; add an "Акції" link (→ `/products` for
  now, real target = TASK-166); surface the **cart total** text in `HeaderCartBadge`
  (data already available). No new session/cart logic.
- **Mobile Sheet** — add the announcement message + the catalog categories into the
  existing slide-out; keep current auth/logout wiring.

Dict: extend `dict.header` (`announcement`, `catalog`, `promoLink`, action labels).

### B. Footer — `widgets/footer/ui/footer.tsx`

Keep the async Server Component + ISR `SiteContactSettings` fetch and the
`dict.footer.*` fallbacks. Re-theme + restructure:

- Container → `bg-foreground text-background` (tokens; dark in light mode, per design).
- **Keep** the trust strip (restyled for the dark surface).
- Columns: **Brand** (logo mark + name + tagline + social square-buttons, driven by the
  admin `SiteContactSettings` links — satisfies TASK-089), **Каталог**, **Інформація**
  (link to `/info/[slug]` where TASK-153 pages exist), **Контакти** (large mono phone,
  "Безкоштовно по Україні · hours", email — from `SiteContactSettings`).
- Bottom bar: © year + payment methods as **bordered text pills**
  (Visa / Mastercard / Apple Pay / Google Pay / Privat24) instead of the icon row.

Dict: extend `dict.footer` for the new Каталог/Інформація link sets + payment labels.

### C. Product Card — `shared/ui/product-card.tsx` + card render sites

`ProductCard` already matches the design (sale/New badges, rating, "from" price +
`ColorDots`, quick-add overlay, wishlist slot). Work is an **audit for wishlist-heart
consistency** across render sites:

- PopularRail (`product-grid.tsx`) — injects `wishlist` ✅.
- Catalog (`product-list.tsx`) — injects `wishlist` ✅.
- `product-related.tsx` — verify; inject `WishlistToggleButton` if missing.
- `recently-viewed.tsx` — bespoke compact markup over `RecentlyViewedItem`
  (localStorage), not `PublicProductEntity`, so it can't reuse `ProductCard` directly;
  add a lightweight `WishlistToggleButton` (needs only `productId` + `productName`,
  both present) pinned to the thumbnail.
- Minor token/spacing/focus-ring polish where it drifts from the mockup.

## Tasks

Break out as sub-tasks of TASK-167 (shared-chrome slice):

- **TASK-167-A — Header** · announcement bar, logo treatment, catalog dropdown (real
  root categories), search block wiring, restyled action cluster (+ cart total, Акції
  link), mobile Sheet. Delivers the header slice of TASK-167 + the root-category
  portion of TASK-082 + the phone portion of TASK-089.
- **TASK-167-B — Footer** · dark re-theme, restructured columns with `/info` links,
  social square-buttons + contact from `SiteContactSettings`, payment text-pills,
  kept/restyled trust strip. Delivers the footer slice of TASK-167 + TASK-089.
- **TASK-167-C — Product card audit** · wishlist-heart consistency across all render
  sites + minor polish.

## Acceptance Criteria

- Top bar renders the free-shipping message + a working `tel:` phone; no city/lang/
  currency controls.
- "Каталог" opens a dropdown of the **real** root categories; each navigates to the
  filtered listing; keyboard + `Esc` + outside-click close; `aria-expanded` correct.
- Header shows wishlist count, cart count **and** cart total; "Акції" link present;
  mobile Sheet exposes the same navigation.
- Footer is dark, four-column, with `/info/[slug]` links where pages exist, social
  buttons + contact from `SiteContactSettings`, payment text-pills, and the trust strip.
- Every storefront card surface shows the wishlist heart; toggling persists (existing
  guest-cookie wishlist).
- All storefront gates green: `lint`, `typecheck`, `test -w apps/store-client`, and a
  clean prod build. No raw hex in markup (tokens only); no manual `fetch`/`axios` for
  API data (Orval hooks / the existing ISR contact fetch only).

## Testing

- RTL: catalog dropdown opens/closes (click, `Esc`, outside-click) and lists categories
  from a mocked `useCategoryControllerGetRootCategories`; header renders cart total +
  counts; footer renders columns + falls back to `dict` when `SiteContactSettings` is
  null; recently-viewed card exposes a wishlist control.
- Keep existing `header-auth.test.tsx` green; extend as needed.
- Manual QA (running stack): sticky header + non-sticky top bar; dropdown over hero;
  dark footer contrast in light/dark mode; wishlist toggle on every card surface.

## Addendum (2026-07-01) — header search pill + auth slide-out

During implementation the header slice (TASK-167-A) grew two design-faithful pieces
beyond the original "restyle the action cluster" scope:

- **Unified search pill** — the mockup's search is one bordered pill
  `[≡ Каталог | input | 🔍 primary]`, with "Каталог" as the **left segment** (not a
  detached button). Built `header-search.tsx` merging the mega-menu trigger (real root
  categories), the input (typo-tolerant suggestions), and a primary submit; both
  dropdowns anchor to the pill and are mutually exclusive. Replaced the standalone
  `catalog-menu.tsx` (deleted) + desktop `SearchAutocomplete`; mobile Sheet keeps
  `SearchAutocomplete`.
- **Auth slide-out** — the guest "Кабінет" trigger opens a right `Sheet`
  (`features/auth/AuthSheet`) with Вхід/Реєстрація tabs, reusing the existing
  `LoginForm`/`RegisterForm` in **slide-out mode** (new optional props:
  close-on-success instead of navigate; tab-switch instead of `<Link>`). Register gains
  a **required terms-consent checkbox**; login gains the mockup's "Забули пароль?" +
  Google/Apple buttons as **stubs** (toast). Real social OAuth = **TASK-168**, password
  reset = **TASK-169** (both backend features, parked). The `/login` + `/register`
  pages are unchanged (page mode) and still back deep links + the mobile menu.
- **Mini-cart slide-out** — the header cart button now opens a right `Sheet`
  (`widgets/cart/CartSheet`) instead of navigating: reuses the cached `useGetCart`
  query and the existing `CartItemRow` (optimistic qty + remove), with a footer
  total, "Оформити замовлення" → `/checkout`, "Перейти в кошик" → `/cart`, and
  loading/empty/error states. The full `/cart` page is unchanged and still reachable.

## References

- Design: `Homepage.dc.html` (top bar + header lines 27–135, footer 393–443),
  `SiteHeader.dc.html`, `SiteFooter.dc.html`.
- Related: TASK-082 (deep mega-menu — parked), TASK-089 (contact/social — this plan
  delivers it), TASK-154 (`SiteContactSettings`), TASK-153 (`/info/[slug]` pages),
  TASK-166 (real promo/newsletter destinations).
