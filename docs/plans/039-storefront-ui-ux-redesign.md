# Plan 039 — Storefront UI/UX Redesign (store-client)

**Roadmap phase:** Phase 5 — Polish & Production (layered on Phases 1–4 complete)
**Created:** 2026-06-20
**Status:** Planning
**Scope:** `apps/store-client` only — frontend polish, no data-model changes except noted backend implications

---

## User Story

As a shopper on the mobile-accessories storefront, I want a visually polished, conversion-optimised experience that feels on par with leading Ukrainian phone-accessory retailers, so that I trust the store, find products quickly, and complete purchases without friction.

---

## 1. Competitor Analysis Summary

### 1.1 ivan-chohol.ua (Primary Design Reference)

**Visual Design**

- White/light-grey background with clean sans-serif typography; price prominently bolded.
- Accent colours used only for CTAs and sale badges — not sprayed across every element.
- Product cards show: image, name, original/sale price with strikethrough, colour-swatch variant pickers, delivery ETA line ("Відправка протягом 2 днів"), and installment-payment logos.
- "Hit Product" and "Sale" label badges on cards — visually differentiated from each other.
- MagSafe / certification badges directly on card images (trust anchors without needing the user to open the PDP).

**Navigation & Header**

- Full device-type mega-menu (iPhone → model → accessory type) with deep hierarchical filtering.
- Prominent phone number + WhatsApp/Telegram links in header — contact always one click away.
- Language/region toggle at the top.

**Trust Signals**

- Installment-payment partner logos (Privat Bank, Monobank) visible on card level.
- "European Product" country-of-origin badge.
- Physical store location + Google Maps integration in footer.
- WhatsApp/Telegram/Viber omni-channel support links.

**UX Patterns Worth Adopting**

1. Delivery ETA line on product card.
2. Colour-swatch variant pickers on product card (visible without opening PDP).
3. Sale badge distinct from other badges (never just red text — dedicated chip).
4. Installment summary line near CTA ("від X грн/місяць").
5. Out-of-stock visual treatment on card (greyed image + "Немає в наявності" label).
6. Trust badge strip near checkout CTA.

---

### 1.2 ktc.ua (Catalog/Filters/UX Reference)

**Visual Design**

- High-contrast neutral palette (white + dark grey) with blue/orange accent for price and CTAs.
- Heavy use of white space; product imagery given generous room to breathe.
- Breadcrumb navigation throughout.
- Section-level curated collections ("Special Gifts", "Game Zone") alongside standard grid.

**Navigation & Search**

- Prominent "Catalog" entry point in main nav that opens a full-width mega-menu.
- City selector in header (personalises delivery ETA and stock info).
- Cart counter badge always visible in header.
- Financing ("від X грн/міс") displayed as a secondary line under every price.

**Trust Architecture**

- 15+ physical store locations prominently listed.
- Service-centre / warranty section always accessible from header or footer.
- Business-founding-year displayed ("2002–2026") — communicates longevity.
- Call-centre hours inline ("9:00 – 20:00").
- Viber / Telegram / WhatsApp / iMessage multi-channel support.

**Filtering / Catalog UX**

- Filter sidebar is sticky; filters apply without full-page reload.
- Active filter chips displayed above results (easy removal).
- Result count always visible ("знайдено X товарів").
- Trade-in program promoted in header — cross-sell / value differentiator.

**UX Patterns Worth Adopting**

1. Active-filter chip strip above product grid.
2. Cart item counter badge in header (always visible).
3. Sticky filter panel with clear-all affordance.
4. "Found N products" count prominently above grid.
5. Footer trust strip: store count, years operating, support hours.
6. Breadcrumbs on every inner page (PDP already has them; catalog and auth pages do not).

---

### 1.3 ash-mobile.com.ua PDP (Note: page returned HTTP 423 — analysis based on ivan-chohol + ktc patterns + vertical best practices)

Best-practice PDP patterns for the phone-accessories vertical:

- Image gallery with zoom on hover / tap (magnifier or lightbox).
- Variant selector shows price delta per variant, marks out-of-stock options as disabled with visual cross.
- Sticky "Add to Cart" bar on mobile that follows the user as they read the description.
- Short "key specs" bullet list above the fold (material, compatibility, dimensions).
- Expandable description / specifications / reviews tabs below the fold.
- "In stock: X left" urgency indicator when stock is low (e.g. < 5 units).
- Related products / "frequently bought together" carousel at the bottom.
- Delivery ETA and free-shipping threshold notice near the Add-to-Cart button.
- Social proof: star rating summary + review count link.

---

### 1.4 Synthesised Design / UX Patterns to Adopt

| Pattern                                                      | Source                 | Priority                     |
| ------------------------------------------------------------ | ---------------------- | ---------------------------- |
| Cart item counter badge in header                            | ktc.ua                 | High                         |
| Sale / badge chips on product card (distinct, not just text) | ivan-chohol            | High                         |
| Delivery ETA line on card + PDP                              | ivan-chohol            | High                         |
| Active filter chips strip above product grid                 | ktc.ua                 | High                         |
| Sticky mobile Add-to-Cart bar on PDP                         | industry best practice | High                         |
| Out-of-stock visual treatment on card                        | ivan-chohol            | High                         |
| Low-stock urgency indicator on PDP                           | industry best practice | Medium                       |
| Variant colour swatches on card                              | ivan-chohol            | Medium                       |
| Key-specs bullet list on PDP (above fold)                    | industry best practice | Medium                       |
| Expandable description/specs tabs on PDP                     | industry best practice | Medium                       |
| Related products / upsell section on PDP                     | industry best practice | Medium                       |
| Trust badge strip near checkout CTA                          | ivan-chohol / ktc.ua   | Medium                       |
| Footer multi-column layout with trust signals                | ktc.ua                 | Medium                       |
| Breadcrumbs on catalog and auth pages                        | ktc.ua                 | Low                          |
| "Found N products" count with active filters                 | ktc.ua                 | Low                          |
| Image zoom / lightbox on PDP                                 | industry best practice | Low                          |
| Wishlist / save-for-later on card + PDP                      | ivan-chohol            | Deferred                     |
| Installment payment partners display                         | ivan-chohol / ktc.ua   | Deferred (no payment module) |

---

## 2. Gap Analysis — Current vs. Required

> Ground truth: code inspection of `apps/store-client/src` on 2026-06-20.

| Area                          | Current State (from code)                                                                                                                                                                                                                              | Gap / What's Missing                                                                                                                                      | Severity |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| **Design tokens**             | Tokens defined in `globals.css` as CSS vars: generic blue `#2563eb` primary, `#0f172a` foreground, `#f1f5f9` muted. No `--color-success`, `--color-warning`, `--color-sale`, `--color-stock-low`. No typographic scale vars. No explicit shadow scale. | Missing semantic sale/success/warning tokens. No typography scale. One-dimensional radius.                                                                | High     |
| **Shared UI kit**             | Only `Skeleton`, `JsonLd`, `ProductCard`, `CheckoutSkeleton` exist in `shared/ui`. No Button, Input, Select, Badge, Tabs, Dialog, Toast primitives. shadcn/ui not installed.                                                                           | No reusable UI primitives — every component hand-rolls its own button/input classes, leading to visual inconsistency.                                     | High     |
| **Header**                    | `layout.tsx`: plain text logo, 3 nav links ("Products", "Cart", auth), no cart counter badge.                                                                                                                                                          | Missing: cart counter badge, search bar in header, mobile hamburger menu, sticky behaviour on scroll.                                                     | High     |
| **Product card**              | `shared/ui/product-card.tsx`: image area is empty `bg-muted` placeholder (no `<img>`/`<Image>` element), no variant swatches, no delivery ETA, no badge variety, no Add-to-Cart on card, no rating display.                                            | Card image not rendered from real URL. No AddToCart shortcut. No quick-view UX. No trust signals.                                                         | High     |
| **Hero banner**               | `hero-banner.tsx`: full-width blue block with headline + paragraph + one CTA. Static, no image, no visual richness.                                                                                                                                    | No hero image/media, no secondary CTA, no promotional badge or urgency element. Visually plain.                                                           | High     |
| **Category nav**              | `category-nav.tsx`: grid of linked tiles, image area is empty `bg-muted` span, text label only.                                                                                                                                                        | No category icon/image rendered. Plain tiles look like placeholders.                                                                                      | High     |
| **Product list page**         | `product-list-view.tsx`: sidebar filters + grid. Filter sidebar works but uses raw `<select>` and `<input>` HTML elements — no visual styling treatment.                                                                                               | No active-filter chips above grid. Sort control is inside the sidebar (not above grid). No "found N products" header line that moves when filters change. | Medium   |
| **Filter panel**              | `product-filters.tsx`: functional but renders unstyled HTML `<select>` + `<input>` elements; raw `border-border` fieldset.                                                                                                                             | No visual filter chips. Price range is two plain text inputs (not a slider or visual range). No mobile drawer/sheet for filters.                          | Medium   |
| **Product detail page (PDP)** | `product-detail-view.tsx`: breadcrumb, 2-col layout (gallery left, info right), variant selector, description paragraph, AddToCart button. No tabs, no specs, no related products, no stock count, no delivery info.                                   | Missing: key-specs above fold, description/specs tabs, low-stock indicator, sticky mobile ATC bar, related products, trust badges near ATC, image zoom.   | High     |
| **Image gallery**             | `product-image-gallery.tsx`: main image + thumbnail strip. Uses `<img>` (Next.js `<Image>` deferred). No zoom.                                                                                                                                         | No zoom/lightbox. `<img>` without `width`/`height` causes layout shift.                                                                                   | Medium   |
| **Cart page**                 | `cart-view.tsx`: item list + summary sidebar. Uses `window.confirm()` for clear-cart.                                                                                                                                                                  | No mini-cart flyout in header. No cross-sell suggestions. `window.confirm()` is visually broken — needs a proper confirmation dialog.                     | Medium   |
| **Checkout**                  | `checkout-view.tsx`: address form + order summary. Plain HTML inputs, no step indicator.                                                                                                                                                               | No visual step indicator (1. Address → 2. Review → 3. Confirm). No delivery ETA on order summary. Inputs are raw — no shared Input component.             | Medium   |
| **Auth pages**                | `login/page.tsx`, `register/page.tsx`: minimal form pages in `(auth)/layout.tsx`.                                                                                                                                                                      | No page-level breadcrumb. Auth layout is bare — no trust signals or brand reinforcement.                                                                  | Low      |
| **Footer**                    | `layout.tsx`: 1-line footer with copyright only.                                                                                                                                                                                                       | Missing: multi-column link groups (Shop, Support, About), trust signals (payment icons, secure badge), social links, contact info.                        | High     |
| **Mobile responsiveness**     | Grid breakpoints exist but no mobile hamburger menu, no mobile filter drawer, no sticky ATC bar on PDP.                                                                                                                                                | Critical mobile UX gaps at header and PDP level.                                                                                                          | High     |
| **Typography**                | Geist Sans via `next/font`. No typographic scale defined beyond Tailwind defaults. `text-sm`, `text-base` used inconsistently.                                                                                                                         | No defined heading hierarchy in design tokens. Font pairing feels generic/developer-grade.                                                                | Medium   |
| **Feedback / toasts**         | No toast/notification system — AddToCart shows inline success label; errors show inline `<p role="alert">`.                                                                                                                                            | No global toast provider. Success and error feedback is localised and inconsistent.                                                                       | Medium   |
| **Loading states**            | `Skeleton` primitive exists. Used in CategoryNav, ProductGrid, Cart.                                                                                                                                                                                   | PDP skeleton exists but the overall skeleton density is low — individual widgets have varying quality.                                                    | Low      |
| **Accessibility**             | Good baseline: aria-labels, focus-visible rings, sr-only live regions, semantic HTML.                                                                                                                                                                  | `window.confirm()` in CartSummary is not accessible. No skip-nav link. No focus trap in potential modals.                                                 | Medium   |

---

## 3. Design Direction

### 3.1 Brand Identity for Mobile Accessories Vertical

The current `#2563eb` blue is a developer/SaaS colour — not retail-warm. Leading Ukrainian phone-accessory stores use neutral bases with a more energetic or warm accent. Proposed direction: **neutral-warm** base with a **vivid primary** that communicates reliability without feeling cold.

### 3.2 Proposed Design Token Updates (`globals.css`)

All token changes go in `globals.css` only — never raw hex in markup. This is the only file that needs to change to recolour the entire storefront.

```css
/* Proposed replacements / additions — light mode */

/* Primary — warmer, high-contrast blue-indigo (more retail, less SaaS) */
--color-primary: #4f46e5; /* indigo-600 */
--color-primary-foreground: #ffffff;

/* Secondary — for secondary CTAs (e.g. "View Details") */
--color-secondary: #f4f4f5;
--color-secondary-foreground: #18181b;

/* Sale / promotional accent — vivid red-orange */
--color-sale: #e11d48; /* rose-600 */
--color-sale-foreground: #ffffff;

/* Success — stock / order confirmed */
--color-success: #16a34a; /* green-600 */
--color-success-foreground: #ffffff;

/* Warning — low stock */
--color-warning: #d97706; /* amber-600 */
--color-warning-foreground: #ffffff;

/* Tighten radius for a crisper retail feel */
--radius: 0.375rem; /* was 0.5rem */

/* Shadow scale (new) */
--shadow-card: 0 1px 3px 0 rgb(0 0 0 / 0.08), 0 1px 2px -1px rgb(0 0 0 / 0.06);
--shadow-elevated:
  0 4px 6px -1px rgb(0 0 0 / 0.08), 0 2px 4px -2px rgb(0 0 0 / 0.06);
```

New semantic utility classes (map in `@theme inline` block):

- `--color-sale` → `bg-sale`, `text-sale`, `border-sale`
- `--color-success` → `bg-success`, `text-success`
- `--color-warning` → `bg-warning`, `text-warning`

### 3.3 Typography

- Keep **Geist Sans** — well-optimised, modern, works well for e-commerce. No change needed.
- Add a typographic rhythm convention: headings use `tracking-tight`; body uses default tracking; secondary text uses `text-muted-foreground`.
- Document the scale in a `shared/config/typography.ts` constant object (no runtime cost — aids consistency).

### 3.4 Shared UI Kit in store-client

**Decision: introduce shadcn/ui in store-client.**

Rationale:

- The admin panel already uses shadcn/ui. Having it in the storefront too means:
  - One component authoring pattern across both apps.
  - Store-client gets `Button`, `Badge`, `Dialog`, `Tabs`, `Toast`, `Drawer`, `Sheet` for free (own-the-source model — zero lock-in).
  - No hand-rolled button/input class strings duplicated across 15+ components.
- shadcn/ui components live in `shared/ui/` (per FSD) — they are "dumb" presentational shells wired to Tailwind tokens.
- Orval hooks remain untouched; shadcn adds only UI primitives.

Install target: `npx shadcn@latest init` in `apps/store-client` with the existing Tailwind v4 config, then add individual components as needed per task.

---

## 4. Scoped, Sequenced Tasks

### TASK-068: UI/UX Redesign — parent / coordination

**Type:** feat
**Scope:** store-client
**Complexity:** L (coordination task — individual sub-tasks sized separately)
**TDD Required:** No
**Depends on:** TASK-059 (baseURL alignment)

This is the parent task. All sub-tasks below belong to it. Marking it done only after all sub-tasks are done.

**Acceptance Criteria:**

- [ ] All sub-tasks TASK-068-A through TASK-068-J are marked done.
- [ ] `npm run build -w apps/store-client` passes.
- [ ] `npm run lint -w apps/store-client` passes with zero errors.
- [ ] `npm run typecheck -w apps/store-client` passes.

---

### TASK-068-A: Design Token Refresh + shadcn/ui Bootstrap

**Type:** chore
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** —

**Goal:** Update `globals.css` with the new token set and initialise shadcn/ui in store-client so subsequent tasks can pull primitives from it.

**Acceptance Criteria:**

- [ ] `globals.css` updated with `--color-sale`, `--color-success`, `--color-warning`, updated `--color-primary` (#4f46e5), `--radius: 0.375rem`, `--shadow-card`, `--shadow-elevated`.
- [ ] `@theme inline` block in `globals.css` maps all new tokens to Tailwind utilities (`bg-sale`, `text-sale`, `bg-success`, `text-success`, `bg-warning`, `text-warning`).
- [ ] `npx shadcn@latest init` run and committed; `components.json` present in `apps/store-client`.
- [ ] Core shadcn components copied into `shared/ui/`: `Button`, `Badge`, `Input`, `Select`, `Skeleton` (replacing hand-rolled), `Separator`, `Dialog`, `Tabs`, `Sheet`, `Sonner` (toast).
- [ ] Existing `shared/ui/skeleton.tsx` updated to re-export from the shadcn Skeleton to stay API-compatible.
- [ ] `npm run build -w apps/store-client` still passes.
- [ ] No Orval-generated files modified.

**Files to create/modify:**

- `apps/store-client/src/app/globals.css` — token updates
- `apps/store-client/components.json` — shadcn config (new)
- `apps/store-client/src/shared/ui/button.tsx` — shadcn Button (new)
- `apps/store-client/src/shared/ui/badge.tsx` — shadcn Badge (new)
- `apps/store-client/src/shared/ui/input.tsx` — shadcn Input (new)
- `apps/store-client/src/shared/ui/select.tsx` — shadcn Select (new)
- `apps/store-client/src/shared/ui/dialog.tsx` — shadcn Dialog (new)
- `apps/store-client/src/shared/ui/tabs.tsx` — shadcn Tabs (new)
- `apps/store-client/src/shared/ui/sheet.tsx` — shadcn Sheet (new)
- `apps/store-client/src/shared/ui/sonner.tsx` — shadcn Sonner toast (new)
- `apps/store-client/src/shared/ui/separator.tsx` — shadcn Separator (new)
- `apps/store-client/src/shared/ui/index.ts` — re-export all new primitives

---

### TASK-068-B: Header Redesign (logo, nav, cart badge, search, mobile menu)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** TASK-068-A

**Goal:** Rebuild `layout.tsx` header and `widgets/header` into a polished, sticky header that includes a cart item-count badge, a search input, and a mobile slide-out menu (Sheet from shadcn).

**Acceptance Criteria:**

- [ ] Header is sticky on scroll (`sticky top-0 z-50 backdrop-blur-sm bg-background/95`).
- [ ] Logo uses a styled text mark (or `next/image` SVG) — not plain text.
- [ ] Cart link renders a badge with live item count from the `useGetCart` hook; badge only visible when count > 0.
- [ ] Search bar is visible in header on desktop (≥ `md`); collapses to icon on mobile.
- [ ] Mobile breakpoint (< `md`): hamburger icon opens a `Sheet` component with full nav links.
- [ ] `HeaderAuth` widget unchanged in API — only visual refresh (use `Button` primitive).
- [ ] Header height is `h-16` on desktop, passes WCAG focus-visible ring tests.
- [ ] `aria-label="Primary navigation"` on the `<nav>` element.
- [ ] `npm run build -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx` — sticky header wrapper, remove inline nav HTML
- `apps/store-client/src/widgets/header/ui/header.tsx` — new dedicated Header widget (new)
- `apps/store-client/src/widgets/header/ui/header-auth.tsx` — visual refresh (Button primitive)
- `apps/store-client/src/widgets/header/ui/header-cart-badge.tsx` — cart count badge (new)
- `apps/store-client/src/widgets/header/ui/header-search.tsx` — inline search input (new)
- `apps/store-client/src/widgets/header/ui/mobile-menu.tsx` — Sheet-based mobile nav (new)
- `apps/store-client/src/widgets/header/index.ts` — barrel update

---

### TASK-068-C: Product Card Redesign (image, badges, ATC on hover)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** TASK-068-A

**Goal:** Redesign `shared/ui/product-card.tsx` so it renders the real product image via `next/image`, shows a styled Sale/New badge chip using the `Badge` primitive, surfaces a hover-reveal "Add to Cart" button, shows a stock-out visual state, and uses the new design tokens.

**Acceptance Criteria:**

- [ ] Product image rendered via `next/image` with `fill` layout inside an `aspect-square` container; `sizes` prop set appropriately.
- [ ] Placeholder shown when no image URL is available (blurred low-res placeholder or `bg-muted` with icon).
- [ ] "Sale" badge uses `<Badge variant="sale">` (maps to `bg-sale text-sale-foreground`).
- [ ] "New" badge available and assigned to products created within the last 30 days (derived from `product.createdAt`).
- [ ] Card hover state: subtle `shadow-card` elevation + "Add to Cart" button overlay or slide-up bar appears.
- [ ] Out-of-stock state: grey overlay on image + "Out of Stock" text block; card is still linkable.
- [ ] Card does not call Orval hooks directly — "Add to Cart" overlay emits `onAddToCart` callback; parent (`ProductGrid`, `ProductList`) wires in the `useAddToCart` hook per FSD.
- [ ] Component is a Server Component (no `"use client"` needed for the card shell); ATC overlay is a separate thin Client Component.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/shared/ui/product-card.tsx` — full rewrite
- `apps/store-client/src/shared/ui/product-card-atc-overlay.tsx` — hover ATC button (client component, new)
- `apps/store-client/src/shared/ui/badge.tsx` — ensure sale variant exists

---

### TASK-068-D: Homepage Redesign (hero, category tiles, featured grid)

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** TASK-068-A, TASK-068-C

**Goal:** Redesign the homepage so the HeroBanner has visual richness (gradient or pattern background, optional hero image via `next/image`), category tiles show icons or images, and the featured product section gains a section-level trust strip.

**Acceptance Criteria:**

- [ ] `HeroBanner`: background uses a gradient or hero image; headline uses a larger typographic treatment (`text-5xl md:text-6xl`); secondary CTA added alongside "Shop Now".
- [ ] Category tiles: image/icon area is no longer an empty `bg-muted` span — accepts a `categoryImageUrl` prop (optional; falls back to a styled placeholder icon derived from category name).
- [ ] Homepage features a horizontal "trust strip" below the hero: 3–4 icon+text items (e.g. "Free shipping over $50", "30-day returns", "Secure payment", "24/7 support").
- [ ] "Latest Products" section renamed to "Featured Products" and visually distinguished from the catalog page.
- [ ] All sections use consistent `mx-auto max-w-7xl px-4` container.
- [ ] Page still uses Server Components where possible; only `CategoryNav` and `ProductGrid` remain as Client Components (already the case).
- [ ] Lighthouse performance score does not regress (no render-blocking resources added).
- [ ] `npm run build -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/hero-banner/ui/hero-banner.tsx` — redesign
- `apps/store-client/src/widgets/hero-banner/ui/trust-strip.tsx` — new trust strip (new)
- `apps/store-client/src/widgets/category-nav/ui/category-nav.tsx` — pass image URL
- `apps/store-client/src/widgets/category-nav/ui/category-nav-skeleton.tsx` — update to match
- `apps/store-client/src/app/page.tsx` — add trust strip, update section labels

---

### TASK-068-E: Product List Page / Filter Panel Redesign

**Type:** feat
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** TASK-068-A, TASK-068-C

**Goal:** Replace the raw HTML `<select>` / `<input>` elements in the filter panel with shadcn/ui `Select` and `Input` primitives. Add active-filter chips above the product grid. Move the sort control to above the grid (standard e-commerce pattern). Add a mobile filter drawer using `Sheet`.

**Acceptance Criteria:**

- [ ] `ProductFilters` uses shadcn `Select` (not native `<select>`) for Category and Sort.
- [ ] `ProductFilters` uses shadcn `Input` for the search and price-range fields.
- [ ] Active filter chips strip rendered above the product grid: each active filter (category, search, min/max price) shows as a `Badge` chip with an `×` remove button; removing a chip calls `onFilterChange`.
- [ ] Sort control moved to above-grid row (right-aligned, `<Select>`) alongside the "Found N products" count (left-aligned). The sidebar retains category + price filters only.
- [ ] On mobile (`< lg`): sidebar filters are hidden; a "Filters" button opens a `Sheet` (slide-over drawer) with the filter panel.
- [ ] "Clear all filters" button in the chip strip (only visible when any filter is active).
- [ ] `npm run lint -w apps/store-client` zero errors.

**Files to create/modify:**

- `apps/store-client/src/features/product-filters/ui/product-filters.tsx` — redesign with shadcn primitives
- `apps/store-client/src/features/product-filters/ui/active-filter-chips.tsx` — new chip strip (new)
- `apps/store-client/src/features/product-filters/ui/mobile-filter-drawer.tsx` — new Sheet wrapper (new)
- `apps/store-client/src/widgets/product-list/ui/product-list-view.tsx` — add chips, sort row, mobile filter trigger
- `apps/store-client/src/widgets/product-list/ui/product-list.tsx` — move "found N" count here

---

### TASK-068-F: Product Detail Page (PDP) Redesign

**Type:** feat
**Scope:** store-client
**Complexity:** L (4–8 h)
**TDD Required:** No
**Depends on:** TASK-068-A, TASK-068-C

**Goal:** Enrich the PDP with the patterns identified in the competitor analysis: key-specs block, description/specs tabs, low-stock indicator, trust badges near the ATC button, sticky mobile ATC bar, and a related products section.

**Acceptance Criteria:**

- [ ] Price section shows: current price (large), compareAtPrice (strikethrough), Sale badge — all using new tokens.
- [ ] Stock indicator: "In Stock" (green `text-success`) / "Low Stock: X left" (amber `text-warning`, shown when `variant.stock < 5`) / "Out of Stock" (red, ATC disabled).
- [ ] Key-specs bullet list (max 4 bullets) displayed above the fold between price and variant selector. Data sourced from the product's `metadata` JSON field (if populated) or a placeholder "add product specs" prompt.
- [ ] Description and "Specifications" displayed in a `Tabs` component (shadcn Tabs) beneath the main 2-col layout. "Reviews" tab shown as disabled placeholder (no backend data yet).
- [ ] Trust badge strip between ATC button and description: 3 icons + labels (e.g. "Secure checkout", "Easy returns", "Fast delivery").
- [ ] Related products: a horizontally scrollable row of up to 4 `ProductCard` components from the same category. Fetched via existing `useProductControllerFindAll` hook filtered by `categoryId` and excluding the current product. Skeleton shown while loading.
- [ ] Mobile sticky ATC bar: fixed bottom bar (z-50) with product name truncated, price, and ATC button. Only visible on `< md` breakpoint when the main ATC button is scrolled out of view (use `IntersectionObserver`).
- [ ] `next/image` used for all PDP images (replace `<img>` elements).
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/widgets/product-detail/ui/product-detail-view.tsx` — major extension
- `apps/store-client/src/widgets/product-detail/ui/product-image-gallery.tsx` — swap `<img>` → `<Image>`
- `apps/store-client/src/widgets/product-detail/ui/product-trust-badges.tsx` — new (new)
- `apps/store-client/src/widgets/product-detail/ui/product-specs-tabs.tsx` — new Tabs component (new)
- `apps/store-client/src/widgets/product-detail/ui/product-stock-indicator.tsx` — new (new)
- `apps/store-client/src/widgets/product-detail/ui/product-related.tsx` — new related products (new)
- `apps/store-client/src/widgets/product-detail/ui/mobile-atc-bar.tsx` — new sticky bar (new)
- `apps/store-client/src/widgets/product-detail/ui/product-detail-skeleton.tsx` — update to match

---

### TASK-068-G: Cart Page Redesign (dialog for clear, trust strip, upsell)

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** TASK-068-A

**Goal:** Replace `window.confirm()` with a proper `Dialog` (shadcn) for the clear-cart confirmation. Polish the CartSummary panel to include a trust badge strip. Add a simple upsell/continue-shopping link.

**Acceptance Criteria:**

- [ ] "Clear cart" triggers a shadcn `Dialog` confirmation instead of `window.confirm()`.
- [ ] CartSummary panel includes a mini trust strip: lock icon + "Secure checkout" text.
- [ ] CartSummary shows shipping notice ("Free shipping on orders over $50" or similar configurable constant from `shared/config`).
- [ ] "Continue shopping" link with arrow icon below the cart item list (links to `/products`).
- [ ] CartItemRow uses `Button` and `Input` (number) primitives for quantity controls (replace inline class strings).
- [ ] Empty cart state is visually richer: larger illustration or icon, warmer copy.
- [ ] `npm run lint -w apps/store-client` zero errors.

**Files to create/modify:**

- `apps/store-client/src/widgets/cart/ui/cart-summary.tsx` — Dialog + trust strip
- `apps/store-client/src/widgets/cart/ui/cart-item-row.tsx` — Button/Input primitives
- `apps/store-client/src/widgets/cart/ui/cart-view.tsx` — empty state, continue shopping

---

### TASK-068-H: Checkout Visual Polish (step indicator, input primitives)

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** TASK-068-A

**Goal:** Replace raw `<input>` / `<textarea>` elements in CheckoutAddressForm with shadcn `Input` primitives. Add a visual step indicator at the top of the checkout page. Add delivery-ETA placeholder to the order summary.

**Acceptance Criteria:**

- [ ] Visual step indicator: "1. Shipping — 2. Review — 3. Confirm" shown as a styled stepper above the form. Step 1 active.
- [ ] `CheckoutAddressForm` uses shadcn `Input` for all fields.
- [ ] The submit button uses shadcn `Button` (`variant="default"`, `size="lg"`).
- [ ] `CheckoutOrderSummary` shows a "Estimated delivery" placeholder line ("3–5 business days").
- [ ] Auth-layout (`(auth)/layout.tsx`) updated: centred card layout with brand mark and a "Secure & trusted" line below the form.
- [ ] `npm run typecheck -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/features/checkout/ui/checkout-address-form.tsx` — Input primitives
- `apps/store-client/src/widgets/checkout/ui/checkout-view.tsx` — step indicator
- `apps/store-client/src/widgets/checkout/ui/checkout-step-indicator.tsx` — new (new)
- `apps/store-client/src/widgets/checkout/ui/checkout-order-summary.tsx` — delivery ETA
- `apps/store-client/src/app/(auth)/layout.tsx` — card layout polish

---

### TASK-068-I: Footer Redesign (multi-column, trust signals)

**Type:** feat
**Scope:** store-client
**Complexity:** S (1–2 h)
**TDD Required:** No
**Depends on:** TASK-068-A

**Goal:** Replace the single-line footer with a full multi-column footer that includes link groups, trust signals (payment method icons), and contact information — consistent with ktc.ua and ivan-chohol.ua patterns.

**Acceptance Criteria:**

- [ ] Footer has 3–4 columns: "Shop" (links to categories, all products), "Support" (FAQ placeholder, contact, returns policy placeholder), "Company" (About placeholder, privacy placeholder), "Contact" (email placeholder, phone placeholder).
- [ ] Bottom bar: copyright + payment method icon strip (SVG icons for Visa, Mastercard, cash-on-delivery or equivalent — static SVG, no API dependency).
- [ ] Trust icons row: shield (secure), package (fast shipping), refresh (returns) — using Lucide React icons (install `lucide-react` as a dependency).
- [ ] Footer is responsive: 1-column on mobile, 2-col on `sm`, 4-col on `lg`.
- [ ] Footer background uses `bg-card` to distinguish from page `bg-background`.
- [ ] `npm run build -w apps/store-client` passes.

**Files to create/modify:**

- `apps/store-client/src/app/layout.tsx` — replace inline footer JSX with `<Footer />` widget
- `apps/store-client/src/widgets/footer/ui/footer.tsx` — new (new)
- `apps/store-client/src/widgets/footer/index.ts` — barrel (new)
- `apps/store-client/src/widgets/index.ts` — add Footer to barrel

---

### TASK-068-J: Mobile / A11y Pass + Toast System

**Type:** refactor
**Scope:** store-client
**Complexity:** M (2–4 h)
**TDD Required:** No
**Depends on:** TASK-068-A through TASK-068-I

**Goal:** Final cross-cutting pass: add a toast provider for success/error notifications, add a skip-navigation link, verify all interactive elements have focus-visible rings, and run a manual mobile audit at 375 px width.

**Acceptance Criteria:**

- [ ] Sonner toast provider mounted in `app/providers.tsx`.
- [ ] `AddToCartButton` emits a success toast ("Added to cart") instead of / in addition to the inline "Added ✓" label.
- [ ] Error states that currently use `window.confirm()` or inline `<p role="alert">` use toasts for transient notifications (non-blocking errors); blocking errors (stock-out, server error) remain as inline alerts.
- [ ] Skip-navigation link added at the top of `layout.tsx`: `<a href="#main-content" className="sr-only focus:not-sr-only ...">Skip to content</a>`. `<main>` gets `id="main-content"`.
- [ ] Manual audit at 375 px: header mobile menu opens/closes cleanly, filter drawer opens/closes, PDP sticky ATC bar visible, cart page usable without horizontal scroll.
- [ ] All interactive elements (`<button>`, `<a>`, `<input>`, `<select>`) have visible `focus-visible:ring-2 focus-visible:ring-ring` styles.
- [ ] `npm run build && npm run lint && npm run typecheck` all pass in `apps/store-client`.
- [ ] No Orval-generated files modified.

**Files to create/modify:**

- `apps/store-client/src/app/providers.tsx` — add `<Toaster />` from shadcn Sonner
- `apps/store-client/src/app/layout.tsx` — skip-nav link, `id="main-content"` on `<main>`
- `apps/store-client/src/features/add-to-cart/ui/add-to-cart-button.tsx` — emit toast on success
- Various widgets — focus-visible ring audit and fixes

---

## 5. Backend Implications

Most tasks in this plan are **pure frontend** — no API changes required.

The following items have **conditional** backend notes:

| Item                           | Implication                                                                                                                                                                                                                                     | Blocking?             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Product card/PDP — "New" badge | Derived from `product.createdAt` — already returned by API. No backend change needed.                                                                                                                                                           | No                    |
| PDP — Key specs bullets        | Reads from `product.metadata` JSON field (already in Prisma schema). No migration needed. Backend should ensure `metadata` is returned in the product response (verify via Swagger).                                                            | No                    |
| PDP — Low-stock indicator      | Reads from `variant.stock` — already returned by API. No backend change needed.                                                                                                                                                                 | No                    |
| PDP — Related products         | Uses existing `GET /api/products?categoryId=X&limit=4` — no new endpoint needed.                                                                                                                                                                | No                    |
| PDP — Reviews / ratings tab    | Shown as a disabled placeholder. **Future work**: requires a `Review` model (already in Prisma schema per TASK-006), a Review module (not yet implemented), and a `GET /api/products/:slug/reviews` endpoint. Track as a separate backlog item. | No (placeholder only) |
| Footer — delivery ETA          | Static placeholder ("3–5 business days"). No backend.                                                                                                                                                                                           | No                    |
| Installment payment display    | Deferred (no payment module yet — TASK-034 still ⬜).                                                                                                                                                                                           | Deferred              |

**Recommendation:** If a rating/review feature is desired before the redesign is live, plan it as TASK-069 (separate plan). The PDP tab will display a placeholder with a "Reviews coming soon" message until that plan is complete.

---

## 6. Task Summary Table

| Task ID    | Title                                      | Complexity | Depends On     |
| ---------- | ------------------------------------------ | ---------- | -------------- |
| TASK-068   | UI/UX Redesign — parent                    | L          | TASK-059       |
| TASK-068-A | Design Token Refresh + shadcn/ui Bootstrap | S          | —              |
| TASK-068-B | Header Redesign                            | M          | TASK-068-A     |
| TASK-068-C | Product Card Redesign                      | M          | TASK-068-A     |
| TASK-068-D | Homepage Redesign                          | M          | TASK-068-A, -C |
| TASK-068-E | Product List / Filter Panel Redesign       | M          | TASK-068-A, -C |
| TASK-068-F | PDP Redesign                               | L          | TASK-068-A, -C |
| TASK-068-G | Cart Page Redesign                         | S          | TASK-068-A     |
| TASK-068-H | Checkout Visual Polish                     | S          | TASK-068-A     |
| TASK-068-I | Footer Redesign                            | S          | TASK-068-A     |
| TASK-068-J | Mobile / A11y Pass + Toast System          | M          | TASK-068-A…-I  |

**Recommended execution order:** A → (B, C, G, H, I in parallel) → (D, E, F once C is done) → J

---

## 7. Definition of Done

- [ ] All TASK-068-A through TASK-068-J sub-tasks complete.
- [ ] `npm run build && npm run lint && npm run typecheck` pass in `apps/store-client`.
- [ ] No Orval-generated files modified.
- [ ] Manual smoke test on Chrome 375px (mobile) and 1440px (desktop) showing no obvious layout breaks.
- [ ] Lighthouse mobile performance score >= 70 (not a regression from current).
- [ ] WCAG 2.1 AA: no missing focus rings, no colour-contrast violations on primary/sale tokens (verify with browser accessibility inspector).
- [ ] `BACKLOG.md` updated with all sub-task entries marked ✅.
