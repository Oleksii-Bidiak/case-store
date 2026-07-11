# Plan 156 — Catalog UX Group D: Mobile Filter Drawer Polish + Product Quick-View (TASK-084 + TASK-086)

> **Status:** ⬜ To Do
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog), Group D of the late-wave-2
> orchestration (`docs/plans/152-late-wave-2-orchestration.md`)
> **Created:** 2026-07-11
> **Orchestration:** implemented in worktree `feature/084-catalog-ux` by the **designer** agent.
> `store-client` only. This branch is the **only** branch in the wave allowed to edit
> `apps/store-client/src/shared/ui/product-card.tsx`. Dictionary namespaces owned by this branch:
> `filters` (append at the END of the existing block) + a **new** `quickView` block (appended as a
> new top-level section at the end of `dictionary.ts`).
> **BACKLOG tasks:** TASK-084 (mobile filter drawer polish) + TASK-086 (quick-view modal) — two
> existing BACKLOG rows, no new task IDs minted by this plan.

## Overview

Two independent, small-to-medium storefront polish items that were deferred behind the Design
redesign (per `docs/plans/129-stub-audit.md` row 7 for quick-view; TASK-084 was flagged "deferred"
with no written-down scope). Both live on the product-discovery surfaces of `store-client`:

- **TASK-084** — the mobile filters drawer (`<Sheet side="left">` in
  `widgets/product-list/ui/product-list-view.tsx` L246–274) already works functionally (every
  filter writes live to the URL the instant it's toggled — there is no staged "apply" step), but
  its footer button is a static "Показати результати" label that does nothing but close the sheet,
  and the drawer's five stacked filter cards (search / brand / device / price / specs) can require a
  lot of scrolling on a small screen.
- **TASK-086** — no quick-view UI exists anywhere in the codebase (confirmed absence, plan 129).
  `ProductCard` (`shared/ui/product-card.tsx`) already has an unused, hover/focus-revealed image
  overlay slot (currently named `quickAdd`, zero real consumers anywhere in the app) plus the
  stretched-link pattern that lets overlay controls stay independently clickable — this is the ready
  seam quick-view plugs into.

Both tasks are frontend-only, additive, and touch no other in-flight branch's hotspot files
(`app/page.tsx` is TASK-139's; `header`/`category-nav`/`categories` are TASK-082/083's).

## Scope

### In Scope — TASK-084 (mobile filter drawer polish)

Deliberately bounded to three concrete, testable improvements (of the recon's three candidates,
all three are adopted — they're small and complementary, not alternatives):

1. **Live result count on the sticky footer button.** Replace the static "Показати результати"
   label with `dict.filters.mobileApply(n)` — a live count of how many products the _currently
   selected_ filters would return (Ukrainian-pluralized: "Показати 1 товар" / "Показати 3 товари" /
   "Показати 5 товарів"), or an explicit zero-result variant ("Немає товарів за цими фільтрами",
   button disabled) so a user isn't invited to tap into a guaranteed-empty grid.
2. **Per-section collapse inside the mobile drawer only.** The five `ProductFilters` cards
   (Пошук / Виробник / Пристрій / Ціна / Характеристики) become native `<details>/<summary>`
   disclosures when rendered inside the Sheet (`collapsible` prop, opt-in — the desktop sidebar
   keeps its current always-expanded layout, unchanged). A section defaults **open** when it
   currently holds an active filter value, and **closed** otherwise, so a returning user instantly
   sees what's already applied without extra taps, while an unfiltered drawer starts short.
3. **Scroll-chaining fix.** The drawer's scrollable body (`overflow-y-auto`) gets
   `overscroll-contain` so dragging past the top/bottom of the filter list on mobile doesn't
   rubber-band/scroll the page underneath (iOS Safari scroll-chaining) — Radix's own body scroll
   lock while the sheet is open is already correct and needs no change (verified, not a code task).

The wishlist page's own mobile filter drawer (`widgets/wishlist/ui/wishlist-view.tsx` L344–373)
shares the **same** `dict.filters.mobileApply` key. Changing that key's type from a plain string to
`(n: number) => string` is a compile-time-forced rider on that call site (`visible.length` is
already computed in `WishlistView` for the results grid — trivial one-line wire-up, no new query).
Collapsible sections and the scroll-chaining fix are **not** extended to the wishlist drawer's own
`WishlistFilters` in this pass — out of scope, noted below.

### Out of Scope — TASK-084

- Collapsible sections / scroll-chaining fix for `WishlistFilters`'s own mobile drawer (only the
  forced `mobileApply(n)` signature rider applies there — see above).
- Any change to desktop filter layout, sort/view toolbar, or the `CategoryChips` row.
- A staged "apply on confirm" filtering model — filters are deliberately live already (each toggle
  writes the URL instantly); this plan does not change that model, only the footer copy/behavior.
- A new `shared/ui/accordion.tsx` Radix primitive — native `<details>/<summary>` is used instead
  (zero new dependency, native keyboard/AT semantics, lower risk for a small polish item; see
  §Technical Design for the explicit rationale).

### In Scope — TASK-086 (product quick-view)

1. **New widget `widgets/product-quick-view/`** — an eye-icon trigger button
   (`ProductQuickViewTrigger`) + the `Dialog`-based quick-view surface itself
   (`ProductQuickView`) + a loading skeleton.
2. **`shared/ui/product-card.tsx` change (this branch's exclusive file):** rename the existing,
   zero-consumer `quickAdd` overlay prop to `hoverAction` (same DOM position/behavior — a
   hover/focus-revealed bottom-of-image slot, above the stretched link at `z-20`) with a
   generalized JSDoc — it is not, and never was, actually wired to "add to cart" anywhere; renaming
   it to what it actually is (a generic hover-revealed overlay slot) is a same-branch, zero-risk,
   zero-consumer rename that removes a misleading name before quick-view becomes its first real
   consumer.
3. **Wiring at every existing product-card render site** (both the `<ProductCard>` component and
   the list-row layout that composes the same sub-primitives without using it) — quick-view is a
   consistent affordance everywhere a product renders as a card, not just the `/products` catalog:
   `widgets/product-list/ui/product-list.tsx` (grid), `widgets/product-list/ui/product-list-item.tsx`
   (list row — its own layout, no `hoverAction` slot to plug into, gets a small persistent
   top-right icon on the thumbnail instead), `widgets/product-grid/ui/product-grid.tsx` (homepage
   PopularRail), `widgets/promo/ui/promo-deals.tsx`, `widgets/recently-viewed/ui/recently-viewed.tsx`,
   `widgets/search-results/ui/search-results-view.tsx`,
   `widgets/product-detail/ui/product-compatible.tsx`,
   `widgets/product-detail/ui/product-related.tsx`.
4. **Detail data fetch** — `useProductControllerFindBySlug(product.slug, { query: { enabled: open } })`
   (the same hook the PDP uses), gated on the dialog's own `open` state so nothing fetches until a
   user actually opens quick-view; a loading skeleton fills the dialog body until it resolves.
5. **Reused, exported primitives from `widgets/product-detail`** (both currently un-exported from
   that widget's `index.ts` — a two-line append, no behavior change):
   `ProductImageGallery` (main image + thumbnail strip) and `ProductStockIndicator`
   (colour-coded in-stock/low-stock/out-of-stock line) — avoids duplicating either.
6. **Content:** gallery, name (as `DialogTitle`), rating, SKU, price/compare-at-price
   (`onSale`/`discountPercent` computed the same way `ProductDetailView` does it), stock indicator,
   read-only colour dots from `variantSummary.colors` when the group has more than one colour (see
   §Technical Design for why variant _switching_ is explicitly not built here), the real
   `AddToCartButton`/`WishlistToggleButton` (both already work standalone off just a `productId`),
   and a "Переглянути повну сторінку товару" link to the real PDP (`/products/{slug}`).
7. **Focus management / a11y** — Radix `Dialog` (already used elsewhere, e.g. admin's
   `product-image-manager`) provides focus trap + return-focus-to-trigger + Escape-to-close for
   free; a real `DialogTitle` (the product name) plus a screen-reader-only `DialogDescription`
   summarizing the dialog's purpose (per the `dialog.tsx` convention: render one or the other, never
   neither — this plan renders one).
8. **Mobile behavior** — the _same_ `Dialog` primitive, styled responsively (fullscreen below the
   `sm` breakpoint via `max-sm:` Tailwind overrides, centered/sized-up card at `sm:` and above) — no
   second root primitive (`Sheet`) is introduced for this; see §Technical Design for the rationale.
9. **Coexistence with the stretched-link + the renamed `hoverAction` slot** — verified by construction
   (same z-20-above-the-pseudo-element mechanism already proven by the wishlist heart and, before
   the rename, documented for `quickAdd`) plus a dedicated RTL assertion that clicking the trigger
   does not navigate.

### Out of Scope — TASK-086

- Inline variant/colour **switching** inside the dialog (would require either navigating the page
  underneath an open modal — jarring — or duplicating `ProductSiblingNavigator`'s per-axis
  resolution logic into a non-navigating variant; not justified for a "quick" view). Read-only
  colour dots + a link to the PDP for real switching is the deliberate, cheap alternative — see
  §Technical Design.
- A quantity stepper inside quick-view — the PDP itself has none (`AddToCartButton` always adds
  `quantity=1`; the stepper lives on the cart page). Adding one only to quick-view would be a new,
  unreviewed UX pattern, not parity; explicitly deferred.
- Any backend change — quick-view consumes only the existing public `GET /api/products/:slug` (via
  the existing Orval hook) and the existing cart/wishlist mutation hooks.
- Product comparison, "buy in 1 click" — separate parked features (TASK-085, TASK-178), untouched.
- Extending quick-view to `widgets/wishlist` item cards — the wishlist page already renders a full
  row/card with its own remove/add-to-cart actions; adding a third interaction surface there is a
  separate, unscoped decision left for a future pass.

## User Stories

1. As a **mobile shopper**, when I open the filters drawer and start narrowing my search, I want to
   see how many products my filters currently match before I commit to closing the drawer, so I
   don't get surprised by an empty grid.
2. As a **mobile shopper**, I want the filters drawer to start short (only the sections I've already
   filtered by, expanded) so I'm not forced to scroll through five full cards to find the one I want.
3. As a **shopper browsing a grid** (catalog, homepage rail, search results, related products), I
   want to preview a product's photos, price, and availability without leaving the page I'm on, so I
   can compare several products quickly.
4. As a **shopper using quick-view**, I want a real "add to cart" and "save to wishlist" right there
   in the preview, and an obvious way to jump to the full product page if I want more detail (specs,
   reviews, variant switching).

## Technical Design

### TASK-084 — why native `<details>`, not a new Accordion primitive

`shared/ui` has no collapsible/accordion primitive today (`Tabs`, `Dialog`, `Sheet` exist, all thin
Radix wrappers). Introducing one for a single polish item is disproportionate: native
`<details>/<summary>` gives correct keyboard behavior (Space/Enter toggles, native focus outline)
and exposes expanded/collapsed state to assistive tech natively — no ARIA wiring needed, no new
runtime dependency, no new shared primitive to design/review/test in isolation. `ProductFilters`
gains one new, default-`false` prop (`collapsible?: boolean`), and only the Sheet call site in
`product-list-view.tsx` passes `collapsible` — the desktop `<aside>` call site is unchanged.

### TASK-084 — live count query

`ProductListView` does not currently call `useProductControllerFindAll` itself (only the nested
`ProductList` does, from `params`). Calling the same generated hook with the same `params` a second
time in `ProductListView` (gated so it only actually matters while `filtersOpen`, via
`{ query: { enabled: filtersOpen } }` — no need to fetch a count for a closed drawer) reuses React
Query's cache key deduplication: when the grid has already fetched for the current `params`, the
drawer's count reads the SAME cached response with zero extra network round trips; when the drawer
opens with params the grid hasn't fetched yet (rare — params are shared state), one extra request
fires exactly once per distinct filter combination, same as the grid's own request would. `meta.total`
from the response feeds `dict.filters.mobileApply(n)`. While the count is in flight after a filter
change, the previous count is kept on screen (React Query's default "stale data while refetching"
behavior for an already-cached key) rather than flashing to a loading state — no extra plumbing
needed since the query is not reset on every keystroke (it's on the already-debounced/committed
`params`, same value the grid itself reacts to).

### TASK-086 — why `Dialog`, not `Sheet`, for the mobile layout

Two Radix root primitives already exist in `shared/ui` (`Dialog`, `Sheet` — both are actually
`Dialog.Root` under the hood; `Sheet` is a slide-in-styled wrapper of the exact same primitive).
Rather than conditionally rendering a `Sheet` on mobile and a `Dialog` on desktop (two code paths,
two sets of focus-trap/ESC/overlay behavior to keep in sync, two component trees to test), this plan
uses **one** `Dialog` styled responsively: `max-sm:inset-0 max-sm:top-0 max-sm:left-0 max-sm:h-dvh
max-sm:max-h-dvh max-sm:w-screen max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0
max-sm:rounded-none max-sm:overflow-y-auto` (fullscreen below `sm`) vs. the default centered card
widened for a two-column layout (`sm:max-w-2xl lg:max-w-3xl`, overriding `DialogContent`'s default
`sm:max-w-lg`). One a11y implementation, one set of tests, one set of `data-state` animations,
matching how `dialog.tsx`'s own JSDoc already documents its `aria-describedby` convention that this
plan follows.

### TASK-086 — why not inline variant switching

`ProductSiblingNavigator` (used on the real PDP) resolves a clicked swatch to a sibling **slug** and
calls `router.push(...)` — a full page navigation. Reusing it verbatim inside an open `Dialog` would
navigate the page underneath the still-open modal, a broken/confusing interaction the owner has not
asked for and that would need its own design pass (does the modal re-fetch and stay open? close and
land on the new PDP? neither is "quick"). The cheap, correct alternative for a _preview_ surface:
render the resolved colours read-only via the existing `ColorDots` primitive (same one `ProductCard`
already uses, sourced straight from `product.variantSummary.colors` — available on the list entity,
no detail fetch needed for this part) with a caption pointing at the PDP for real switching. This
keeps quick-view's job honest: preview + fast add-to-cart, not a full PDP replacement.

### TASK-086 — data shape: list entity vs. detail fetch

`PublicProductEntity` (the type every product-card call site already has in hand) already carries
price, `compareAtPrice`, `inStock`/`lowStock`, `sku`, `ratingAverage`/`ratingCount`, and
`variantSummary` — quick-view can render an instant "shell" from data it already has the moment the
trigger is clicked. What it does **not** carry: the full `images[]` gallery (list responses only
include `primaryImage`) and `group`/category context. `useProductControllerFindBySlug(product.slug)`
— the exact hook `ProductDetailView` uses — supplies `data.images` (sorted the same way the PDP
sorts them: by `sortOrder`, replicated inline) and confirms the rest. This plan does **not** attempt
a "instant shell + progressively hydrate the gallery" two-stage render (extra state-machine
complexity for a preview surface) — the whole dialog body renders a skeleton until the detail fetch
resolves, matching the simplicity of `ProductDetailSkeleton`'s own approach, just condensed to the
dialog's narrower footprint (single image + a few text-skeleton rows, no tabs/related section).

### TASK-086 — coexistence with the stretched link

`ProductCard`'s stretched-link pattern (`::after` pseudo-element at `z-10` covering the whole card)
already coexists with the wishlist heart and (after the rename) `hoverAction`, both pinned at
`z-20` — a real DOM sibling positioned above the pseudo-element in stacking order intercepts the
click before it can reach the anchor's `::after` overlay; nothing needs to call
`preventDefault()`/`stopPropagation()` (the existing `WishlistToggleButton` already proves this
works with zero such calls). The quick-view trigger button follows the exact same placement
mechanism, so no new interaction-safety code is needed — only a regression RTL test that asserts
clicking the trigger does not trigger client-side navigation (`next/navigation`'s mocked `push` is
never called).

## Frontend (Next.js — FSD)

### shared/ui

- `product-card.tsx` — prop rename `quickAdd` → `hoverAction` (this branch's exclusive file); JSDoc
  updated to describe it generically; render logic/positioning unchanged.

### widgets/product-detail (append-only export change)

- `index.ts` — additionally export `ProductImageGallery` (from `ui/product-image-gallery.tsx`) and
  `ProductStockIndicator` (from `ui/product-stock-indicator.tsx`); both files are otherwise
  untouched.

### widgets/product-quick-view (new)

- `ui/product-quick-view-trigger.tsx` — `ProductQuickViewTrigger({ product: PublicProductEntity })`:
  an `Eye`-icon (`lucide-react`) button, `aria-label={dict.quickView.trigger(product.name)}`; owns
  `mounted`/`open` local state exactly like `ProductCardActions`'s `CartSheet` (mount on first
  click, so a grid of cards never mounts dozens of idle dialogs); renders `<ProductQuickView>` once
  mounted.
- `ui/product-quick-view.tsx` — `ProductQuickView({ product, open, onOpenChange })`: the `Dialog` +
  responsive `DialogContent` (see §Technical Design), fetches
  `useProductControllerFindBySlug(product.slug, { query: { enabled: open } })`, renders
  `<ProductQuickViewSkeleton>` while pending/no data yet, otherwise a two-column
  (`grid-cols-1 sm:grid-cols-2`) layout: `ProductImageGallery` (sorted `images`) on one side; name
  (`DialogTitle`), rating (`RatingStars`), SKU, price/compare-at-price, `ProductStockIndicator`,
  read-only `ColorDots` (when `variantSummary.colors.length > 1`) with the PDP-pointer caption,
  `AddToCartButton` (`disabled={!inStock}`), `WishlistToggleButton` (`variant="inline"`), and the
  "Переглянути повну сторінку товару" `Link` on the other. A screen-reader-only
  `DialogDescription` (`dict.quickView.dialogDescription(product.name)`) satisfies the
  `dialog.tsx` a11y convention.
- `ui/product-quick-view-skeleton.tsx` — condensed skeleton (one square image placeholder + a
  handful of text-skeleton rows), mirrors `ProductDetailSkeleton`'s block-for-block philosophy at a
  smaller footprint — no tabs/related section to skeleton since quick-view has neither.
- `index.ts` — exports `ProductQuickViewTrigger` only (the dialog/skeleton are internal).

### features / entities

- No new `features/`/`entities/` slice — quick-view composes existing `AddToCartButton`
  (`features/add-to-cart`), `WishlistToggleButton` (`features/toggle-wishlist`), and the
  `entities/product` re-exports (`useProductControllerFindBySlug`, `PublicProductEntity`). All
  already accept a bare `productId`/render standalone — no prop-surface changes needed on either.

### features/product-filters (TASK-084)

- `ui/product-filters.tsx` — new optional `collapsible?: boolean` prop (default `false`); when
  `true`, each of the five section blocks (search / brand / device / price / specs) renders inside a
  `<details>` wrapping the existing card `<div>` (card chrome unchanged), `open` defaulting to
  whether that section currently holds an active value (mirrors the existing `hasActiveFilters`
  logic, computed per-section instead of once for the whole panel). `<summary>` reuses the existing
  `cardTitleClass` heading text + a chevron icon that rotates via a `group-open:` Tailwind variant on
  the `<details>` element (no JS state needed — `<details open>` is the single source of truth).

### widgets/product-list (TASK-084 + TASK-086 wiring)

- `ui/product-list-view.tsx` — `ProductFilters` inside the `<Sheet>` gains `collapsible`; the footer
  button's label becomes `dict.filters.mobileApply(count)` (from the live-count query, §Technical
  Design) with `disabled={count === 0}`; the scrollable `SheetContent` className gains
  `overscroll-contain`.
- `ui/product-list.tsx` — `<ProductCard hoverAction={<ProductQuickViewTrigger product={product} />}
.../>` added alongside the existing `action` prop.
- `ui/product-list-item.tsx` — a small persistent icon button (`ProductQuickViewTrigger`, same
  component, no visual variant needed — its own `size-8`/`size-9` footprint fits the thumbnail
  corner) pinned at the 150px thumbnail's top-right corner (currently unused in this layout).

### Other card-rendering widgets (TASK-086 wiring, `hoverAction` prop addition only)

- `widgets/product-grid/ui/product-grid.tsx`
- `widgets/promo/ui/promo-deals.tsx`
- `widgets/recently-viewed/ui/recently-viewed.tsx`
- `widgets/search-results/ui/search-results-view.tsx`
- `widgets/product-detail/ui/product-compatible.tsx`
- `widgets/product-detail/ui/product-related.tsx`

### widgets/wishlist (TASK-084 forced rider only)

- `ui/wishlist-view.tsx` — footer button label becomes `dict.filters.mobileApply(visible.length)`
  (no new query — `visible` is already computed for the results grid on the same render).

### widgets/index.ts (append-only)

- One new line: `export { ProductQuickViewTrigger } from "./product-quick-view";`

## API Contract

No backend changes. Both tasks consume existing, already-generated Orval hooks:

| Method | Path                  | Used by                                                                           |
| ------ | --------------------- | --------------------------------------------------------------------------------- |
| GET    | `/api/products`       | TASK-084 live count (`useProductControllerFindAll`, already used by the grid)     |
| GET    | `/api/products/:slug` | TASK-086 detail fetch (`useProductControllerFindBySlug`, already used by the PDP) |
| POST   | `/api/cart/items`     | TASK-086 `AddToCartButton` (already used everywhere else)                         |
| POST   | `/api/wishlist`       | TASK-086 `WishlistToggleButton` (already used everywhere else)                    |

No `npm run swagger:export` / `npm run generate:api` step is needed for this plan.

## Dictionary changes

`apps/store-client/src/shared/config/dictionary.ts`:

- `filters` block (append at the END, before its closing `},`):
  ```ts
  // TASK-084 — mobile drawer polish: live result count on the sticky "Apply" footer.
  // Ukrainian pluralization mirrors dict.catalog.loadMore's mod10/mod100 rule.
  mobileApply: (n: number) => {
    if (n === 0) return "Немає товарів за цими фільтрами";
    const mod10 = n % 10;
    const mod100 = n % 100;
    let word = "товарів";
    if (mod10 === 1 && mod100 !== 11) word = "товар";
    else if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
      word = "товари";
    return `Показати ${n} ${word}`;
  },
  // TASK-084 — per-section collapse inside the mobile drawer (native <details>).
  sectionToggleAria: (section: string) => `Розгорнути/згорнути «${section}»`,
  ```
  (`mobileApply`'s existing string value is replaced in place by the function above — not a new
  key, so it is edited at its existing line, not appended; both existing call sites
  (`product-list-view.tsx`, `wishlist-view.tsx`) are updated to pass a count in the same commit so
  the build never has a dangling string-vs-function mismatch.)
- New top-level `quickView` block, appended at the very end of `dictionary.ts` (after the existing
  `newsletterForm` block, before the closing `} as const;`):
  ```ts
  // TASK-086 — product quick-view modal (widgets/product-quick-view).
  quickView: {
    trigger: (name: string) => `Швидкий перегляд «${name}»`,
    title: "Швидкий перегляд",
    dialogDescription: (name: string) =>
      `Швидкий перегляд товару «${name}»: ціна, наявність і швидке додавання в кошик.`,
    loadError: "Не вдалося завантажити товар. Спробуйте ще раз.",
    viewFullDetails: "Переглянути повну сторінку товару",
    variantsNote: "Кольори та інші варіанти доступні на сторінці товару.",
  },
  ```
  (Reuses `dict.product.sku`/`inStockLabel`/`lowStock`/`outOfStock`/`codeLabel` and
  `dict.productCard.priceFrom`/`wishlistAddAria`/`wishlistRemoveAria` where applicable — no
  duplicate copy.)

## Tasks

### TASK-084: Mobile filter drawer polish

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No (pure UI
composition over existing, already-tested filter primitives; RTL coverage required, not TDD) ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] `ProductFilters` accepts `collapsible?: boolean` (default `false`); when `true`, each of the
      five sections renders inside a `<details>` whose `open` default reflects whether that section
      currently holds an active filter value; the desktop `<aside>` call site is unchanged
      (`collapsible` omitted there)
- [ ] `product-list-view.tsx`'s `<Sheet>` footer button label is
      `dict.filters.mobileApply(count)`, where `count` comes from a `useProductControllerFindAll`
      call gated on `filtersOpen`, sharing React Query's cache with the grid's own query for the
      same `params` (no duplicate network request when the grid has already fetched); the button is
      `disabled` when `count === 0`
- [ ] The Sheet's scrollable content div gains `overscroll-contain` (scroll-chaining fix)
- [ ] `wishlist-view.tsx`'s footer button label is `dict.filters.mobileApply(visible.length)` (no
      new query — reuses the existing `visible` array)
- [ ] `dict.filters.mobileApply` changes from a string to `(n: number) => string` in place, mirroring
      `dict.catalog.loadMore`'s Ukrainian mod10/mod100 pluralization; both call sites compile and
      pass a count
- [ ] RTL: opening the mobile drawer with N matching products shows the live count on the footer
      button; toggling a filter inside the drawer updates the count without closing the drawer;
      zero-match filters disable the button and show the empty-state copy; a section with an active
      filter starts expanded, one without starts collapsed
- [ ] Existing `product-list-view.test.tsx`/`product-list.test.tsx`/wishlist drawer tests still pass
      (verify at implementation time whether the extra `useProductControllerFindAll` subscription in
      `ProductListView` needs any MSW handler adjustment — the existing `*/api/products` handler in
      `product-list-view.test.tsx` already serves both callers)
- [ ] `npm run test -w apps/store-client` green (verify with `--runInBand` if parallel-flaky, per
      memory note `store-client-jest-parallel-flake`)
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/product-filters.tsx` — `collapsible` prop,
  per-section `<details>` wrapping
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — `collapsible` on the Sheet
  instance, live-count query, footer button label/disabled state, `overscroll-contain`
- `apps/store-client/src/widgets/wishlist/ui/wishlist-view.tsx` — footer button label rider
- `apps/store-client/src/shared/config/dictionary.ts` — `filters.mobileApply` type change +
  `filters.sectionToggleAria` append
- New/updated RTL specs: `product-filters.test.tsx` (collapsible behavior), extend
  `product-list-view.test.tsx` (live count, disabled zero-state), spot-check
  `wishlist-view.test.tsx` if it exists (footer label)

---

### TASK-086-A: Quick-view core — `ProductCard` seam rename + the `product-quick-view` widget

**Type:** feat · **Scope:** store-client · **Complexity:** L (4-8h) · **TDD Required:** No (UI
composition over already-tested primitives — `AddToCartButton`, `WishlistToggleButton`,
`ProductImageGallery`, `ProductStockIndicator`, `ColorDots`, `RatingStars` are all reused verbatim;
RTL coverage required) · **Depends on:** —

**Acceptance Criteria:**

- [ ] `shared/ui/product-card.tsx`: `quickAdd` prop renamed to `hoverAction` (same overlay
      container/positioning/hover-focus-reveal behavior; JSDoc generalized); confirmed zero other
      callers exist before the rename (grep) so no other file needs touching by this criterion alone
- [ ] `widgets/product-detail/index.ts` additionally exports `ProductImageGallery` and
      `ProductStockIndicator` (both files otherwise untouched)
- [ ] New `widgets/product-quick-view/` — `ProductQuickViewTrigger` (eye-icon button, mount-on-open
      lazy pattern mirroring `ProductCardActions`'s `CartSheet`), `ProductQuickView` (the `Dialog`),
      `ProductQuickViewSkeleton`
- [ ] `ProductQuickView` fetches `useProductControllerFindBySlug(product.slug, { query: { enabled:
    open } })`; renders the skeleton while pending; on error shows `dict.quickView.loadError`
      inline (dialog stays open, no crash) with a retry affordance (`refetch()`)
- [ ] Dialog content: gallery (images sorted by `sortOrder`, mirrors the PDP), name as `DialogTitle`,
      sr-only `DialogDescription`, rating, SKU, price/compare-at-price with the same
      `onSale`/`discountPercent` computation `ProductDetailView` uses, `ProductStockIndicator`,
      read-only `ColorDots` (only when `variantSummary.colors.length > 1`) + `dict.quickView.variantsNote`,
      real `AddToCartButton`/`WishlistToggleButton`, and a `dict.quickView.viewFullDetails` link to
      `/products/{slug}`
- [ ] Mobile: `DialogContent` fullscreen below `sm` (`max-sm:` overrides per §Technical Design);
      desktop: two-column layout capped at `sm:max-w-2xl lg:max-w-3xl`
- [ ] a11y: Escape closes, focus returns to the trigger button on close (native Radix behavior,
      assert it), Tab reaches the trigger via keyboard and Enter/Space opens it
- [ ] RTL: clicking the trigger does NOT call the mocked `next/navigation` push/router (stretched-link
      coexistence regression test); opening shows the skeleton then the loaded content; add-to-cart
      and wishlist-toggle inside the dialog call the same mutations their standalone unit tests
      already assert (MSW-mocked); closing and reopening re-fetches per `enabled: open` (or serves
      from cache — assert whichever the implementation lands on, documented in the test)
- [ ] `npm run test -w apps/store-client -- product-quick-view` green
- [ ] `npm run lint`/`typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card.tsx` — `quickAdd` → `hoverAction` rename
- `apps/store-client/src/widgets/product-detail/index.ts` — export append
- `apps/store-client/src/widgets/product-quick-view/ui/product-quick-view-trigger.tsx`
- `apps/store-client/src/widgets/product-quick-view/ui/product-quick-view.tsx`
- `apps/store-client/src/widgets/product-quick-view/ui/product-quick-view-skeleton.tsx`
- `apps/store-client/src/widgets/product-quick-view/index.ts`
- `apps/store-client/src/widgets/product-quick-view/ui/*.test.tsx` (trigger + dialog specs)
- `apps/store-client/src/shared/config/dictionary.ts` — new `quickView` block (appended at the end)

---

### TASK-086-B: Quick-view wiring — plug the trigger into every product-card render site

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** TASK-086-A

**Acceptance Criteria:**

- [ ] `widgets/product-list/ui/product-list.tsx` — grid `<ProductCard hoverAction={<ProductQuickViewTrigger
    product={product} />} .../>`
- [ ] `widgets/product-list/ui/product-list-item.tsx` — persistent icon-button trigger pinned at the
      thumbnail's top-right corner (list-row layout has no `hoverAction` slot to plug into)
- [ ] `widgets/product-grid/ui/product-grid.tsx`, `widgets/promo/ui/promo-deals.tsx`,
      `widgets/recently-viewed/ui/recently-viewed.tsx`,
      `widgets/search-results/ui/search-results-view.tsx`,
      `widgets/product-detail/ui/product-compatible.tsx`,
      `widgets/product-detail/ui/product-related.tsx` — same `hoverAction` wiring
- [ ] `widgets/index.ts` — append `export { ProductQuickViewTrigger } from "./product-quick-view";`
- [ ] RTL coverage on at least the two primary surfaces (`product-list.tsx` grid,
      `product-list-item.tsx` list row) confirming the trigger renders and opens the dialog with that
      card's product; the remaining five sites get a lighter smoke assertion (renders without
      throwing, trigger present) rather than full duplicate dialog-content coverage — the dialog's
      own behavior is already fully covered by TASK-086-A's specs
- [ ] Full `npm run test -w apps/store-client` green (verify with `--runInBand` if parallel-flaky)
- [ ] `npm run build`/`lint`/`typecheck -w apps/store-client` clean

**Files to create/modify:**

- The eight files listed in §In Scope point 3 above
- `apps/store-client/src/widgets/index.ts`
- Existing test files for each of the eight sites — extended with the trigger-presence assertion

---

### TASK-J (shared): manual QA / smoke pass

**Type:** test · **Scope:** store-client · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-084, TASK-086-B

**Acceptance Criteria:**

- [ ] On a running stack, at a 375px-wide mobile viewport: open the catalog filters drawer, check a
      brand filter — footer count updates live and is grammatically correct at 1/3/5 results;
      collapse/expand a section by tap; drag the filter list past its top/bottom bound — the page
      behind the drawer does not visibly scroll
- [ ] Quick-view opens from the catalog grid, the homepage PopularRail, search results, and a PDP
      related-products rail; gallery/price/stock/rating render correctly; add-to-cart and wishlist
      toggle both work from inside the dialog and reflect in the header cart/wishlist badges; Escape
      and the close button both dismiss it; on a narrow viewport the dialog is fullscreen; clicking
      "Переглянути повну сторінку товару" navigates to the real PDP
- [ ] Result appended to `docs/manual-qa-pending.md` as one combined `### TASK-084` block and one
      `### TASK-086` block (two separate headers — they're two BACKLOG rows)

**Files to create/modify:**

- `docs/manual-qa-pending.md` — append-only

## Migration Steps

1. TASK-084 — independent, can land first or in parallel with 086-A (touches disjoint files except
   the shared `dictionary.ts`, where both only append/edit within their own owned blocks).
2. TASK-086-A — the `product-card.tsx` rename + the widget core, before any call site is wired.
3. TASK-086-B — wiring sweep, after 086-A's dialog is proven correct in isolation.
4. TASK-J — manual smoke pass once everything above is green.
5. Full gates on `develop` after merge: typecheck/lint/build for `store-client`; unit tests
   (`--runInBand` if the parallel-flake memory note applies); this group has no e2e/int/Playwright
   surface of its own (no backend change), but the orchestrator's full-gate pass on `develop` still
   runs the existing Playwright suite to catch any incidental regression on `/products` or the PDP.

## Risks & Mitigations

| Risk                                                                                                                                                                     | Mitigation                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Wiring `hoverAction` at 8 render sites is mechanical but touches many files — a missed site would leave quick-view inconsistently available                              | Enumerated exhaustively in §In Scope point 3 from a repo-wide grep of every `<ProductCard>`/card-composing render site; TASK-086-B's acceptance criteria lists all eight explicitly, not "etc."              |
| `dict.filters.mobileApply`'s type change is a breaking change for any consumer that isn't updated in the same commit                                                     | Both current consumers (`product-list-view.tsx`, `wishlist-view.tsx`) are identified and updated in TASK-084 itself; TypeScript would fail the build on any missed call site (string vs. function)           |
| The live-count query in `ProductListView` could be mistaken for a new network request per keystroke                                                                      | It shares the exact `params` value (and therefore React Query cache key) the grid's own query already uses — gated on `filtersOpen` so it doesn't even subscribe while the drawer is closed                  |
| Reusing `ProductImageGallery`/`ProductStockIndicator` cross-widget (from `widgets/product-detail`) could be seen as violating FSD's "widgets don't import widgets" ideal | Same-layer widget-to-widget imports are already an established, working pattern in this codebase (`product-card-actions.tsx` already imports `CartSheet` from `widgets/cart`) — not a new precedent          |
| A `Dialog` styled fullscreen on mobile via `max-sm:` overrides could visually clash with `DialogPrimitive.Content`'s default centered transform classes                  | Explicit override list given in §Technical Design (`inset-0 top-0 left-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 rounded-none`) neutralizes every centering/sizing class at `max-sm` |
| Renaming `quickAdd` → `hoverAction` could silently break a caller this recon missed                                                                                      | TASK-086-A's first acceptance criterion requires a fresh repo-wide grep for `quickAdd=` immediately before the rename, not a one-time recon claim taken on faith                                             |

## Notes

- TASK-084 and TASK-086 are independent features sharing one plan file (and one worktree/branch)
  purely per the late-wave-2 orchestration's grouping (`docs/plans/152-...md` Group D) — they do not
  depend on each other and can be implemented/reviewed in either order.
- The `hoverAction` rename is the only edit to `shared/ui/product-card.tsx` in this plan — no visual
  or behavioral change to the badges, wishlist corner, price row, or stretched link.
- `dict.filters.mobileApply`'s Ukrainian pluralization duplicates `dict.catalog.loadMore`'s
  mod10/mod100 formula inline rather than extracting a shared helper — this matches the existing
  codebase convention (the two current pluralized dict entries, `loadMore` and `countInList` in
  `wishlist`, are each already independent, un-extracted inline implementations).
- Quick-view's "read-only colours, link out for real switching" decision (§Technical Design) is the
  main deliberate scope-limiting call in this plan; if the owner later wants inline switching, it
  is a follow-up, not a gap in this pass.
