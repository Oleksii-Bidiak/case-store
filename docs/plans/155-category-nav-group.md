# Plan 155 — Category Nav Group: Deep Mega-Menu (TASK-082) + Category Tile Images (TASK-083)

> **Status:** ⬜ To Do
> **Phase:** Roadmap — «Пізніша хвиля» (post-Етап-7 backlog), Group C of `docs/plans/152-late-wave-2-orchestration.md`
> **Created:** 2026-07-11
> **Last Updated:** 2026-07-11
> **BACKLOG tasks:** TASK-082, TASK-083 (two rows, one plan, one worktree/branch)
> **Orchestration:** implemented in worktree `feature/082-category-nav` (branch created from
> `develop`) by the **build** agent, per `docs/plans/152-late-wave-2-orchestration.md` §Фаза 2,
> Group C. **store-client only** — no API, no schema, no admin changes.

## Owner decision (FINAL, 2026-07-11)

- **TASK-083:** no upload endpoint. The admin category form keeps its existing plain URL-input
  for `Category.image` (`apps/store-admin/src/features/category-form/ui/category-form.tsx`
  L183–195, already shipped) — this plan does **not** touch the admin app. See §Design decision:
  `<img>`, not `next/image` below for a technical consequence of this decision that shapes how the
  storefront renders the image (not a blocker, just a design call this plan makes explicitly).

## Recon facts (2026-07-11, develop @ d05ef2e) — not re-verified, read for design details

- `GET /categories/tree` (`CategoryController.getCategoryTree` → `CategoryRepository.findCategoryTree`,
  `apps/store-api/src/category/category.repository.ts` L236–270) already returns **active root
  categories with up to 3 nested levels of active children**, sorted by `sortOrder` ascending at
  every level. No query params. The Orval hook `useCategoryControllerGetCategoryTree` (no args,
  route `GET /api/categories/tree`) is already generated and already consumed in
  `widgets/product-list/ui/product-list-view.tsx` (~L165, feeds `CategoryChips`),
  `widgets/category-detail/ui/subcategory-chips.tsx` (TASK-277), and
  `widgets/categories/ui/categories-view.tsx` (the `/categories` hub). **No backend or Orval work
  in this plan.**
- `CategoryTreeNodeEntity` (`apps/store-api/src/category/entities/category-tree-node.entity.ts`)
  already carries `image: string | null` on every node (root and every nested child) — mirrors
  `CategoryEntity.image` used by the flat `useCategoryControllerGetRootCategories` hook. Both
  generated TypeScript models already have `image` typed; no regen needed.
- The mega-menu currently sits on the **flat** `useCategoryControllerGetRootCategories` hook in
  two places: the desktop "Каталог" panel in `widgets/header/ui/header-search.tsx` (L242–293) and
  the mobile `Sheet` category list in `widgets/header/ui/header.tsx` (L152–170). Both need to
  switch to the tree hook and render **one additional level** — the tree's root `children` array —
  as a **desktop flyout** and a **mobile accordion**, respectively. Per TASK-082's own BACKLOG
  framing ("the nested level below [the root dropdown]") and the `SubcategoryChips`/`CategoryChips`
  precedent (TASK-236/277, both stop at direct children), this plan renders exactly **one** extra
  level — root → direct children. Grandchildren (`children[].children`) are out of scope, same as
  every other existing consumer of this tree.
- `Category.image` (`schema.prisma` L122, `String?`) is fully wired end-to-end already (repository
  inputs, both entities, admin form) — the only gap is the **storefront tile render**. Two files:
  `widgets/category-nav/ui/category-nav.tsx` (home page grid, backed by the flat
  `CategoryEntity[]`) and the `/categories` hub's child-tile grid in
  `widgets/categories/ui/categories-view.tsx`, whose icon/gradient fallback comes from
  `widgets/categories/model/category-visuals.ts` (`pickCategoryIcon`/`categoryGradient` — pure
  functions, unchanged; they become the **fallback tier**, not something this plan replaces).

## Overview

Two independent, small, `store-client`-only UI features that both revolve around the category
tree:

1. **TASK-082** — deepen the existing "Каталог" mega-menu (root-category dropdown, shipped in
   TASK-167-A) by one level: desktop gets a two-pane flyout (roots on the left, the hovered/
   focused root's direct children on the right), mobile gets an accordion inside the existing
   header `Sheet` (tap a chevron to reveal a root's direct children without navigating away).
2. **TASK-083** — render `Category.image` (already admin-editable, already returned by both
   category endpoints) as the tile background on the two places that currently only show a
   keyword-matched icon + gradient: the homepage `CategoryNav` grid and the `/categories` hub's
   child-tile grid. The icon + gradient becomes the fallback for categories with no image (or a
   broken image URL), not a placeholder.

Both features are read-only consumers of data that already exists; no controller, service,
repository, DTO, or schema change is required anywhere in this plan.

## Scope

### In Scope

- `widgets/header/ui/header-search.tsx` — desktop "Каталог" panel switches from
  `useCategoryControllerGetRootCategories` to `useCategoryControllerGetCategoryTree`; renders a
  two-column flyout (roots + the active root's children) with hover/focus reveal and a small
  keyboard affordance (`ArrowRight`/`ArrowLeft` between the two panes, `Escape` closes and returns
  focus to the trigger button). **Root links keep navigating on click exactly as they do today** —
  the flyout is purely an additive preview, not a replacement for that click (see §Design decision:
  preview vs. drill-down for why this was chosen over the alternative).
- `widgets/header/ui/header.tsx` + a new `widgets/header/ui/header-mobile-categories.tsx` — the
  mobile `Sheet`'s category list is extracted into its own sub-widget (matching the existing
  `HeaderSearch`/`HeaderAuth`/`HeaderCartBadge`/`HeaderWishlistBadge` per-concern split already
  used in this folder), fetches the tree hook itself, and renders an accordion: each root category
  is a `Link` (navigates) plus, when it has children, a separate chevron `button` (expands/
  collapses a `<ul>` of its direct children in place, does not navigate).
- `widgets/category-nav/ui/category-nav.tsx` — home page category tiles render `Category.image`
  (when present and loadable) inside the existing 48px icon slot, falling back to the existing
  keyword-matched icon + tinted tile on missing/broken image.
- `widgets/categories/ui/categories-view.tsx` (+ doc-comment touch-up in
  `widgets/categories/model/category-visuals.ts`, whose exported `pickCategoryIcon`/
  `categoryGradient` become the documented fallback tier) — the `/categories` hub's child-tile
  grid renders `Category.image` filling the existing `aspect-square` tile, falling back to the
  existing gradient + icon.
- One new shared presentational primitive, `shared/ui/category-tile-image.tsx`, factoring the
  "show the image if present and it hasn't failed to load, otherwise show the caller's fallback
  markup" logic that both tile surfaces above need identically. Placed in `shared/ui/` (not
  duplicated per-widget) because `widgets/category-nav` and `widgets/categories` are FSD peers —
  neither may import from the other — and both need the exact same per-tile `onError` behavior.
- `shared/config/dictionary.ts` — two new keys appended to the end of the `header` block (see
  §Dictionary additions). No new keys needed in `home.categories`/`categories` for this plan (both
  namespaces are "owned" by this branch per the orchestration checklist, i.e. safe to edit without
  a cross-branch conflict, but nothing here requires new copy in them).
- New/updated component tests: `header-search.test.tsx` (existing file, handler + new assertions),
  `header-mobile-categories.test.tsx` (new file), `category-tile-image.test.tsx` (new file),
  `category-nav.test.tsx` (new file — none exists today), `categories-view.test.tsx` (existing
  file, one new case).
- One combined manual-QA pass appended to `docs/manual-qa-pending.md` (see §Manual QA).

### Out of Scope

- Any backend/API/schema/Orval work (both endpoints and both `image` fields already ship).
- An image-upload endpoint for `Category.image` (owner decision — URL-input stays).
- Any admin-panel change (`apps/store-admin` is untouched by this branch).
- Rendering the tree's third/fourth level (grandchildren) anywhere — this plan adds exactly one
  level, matching every existing tree consumer.
- The `/categories` hub's **rail** (root-category icon list on the left of `categories-view.tsx`)
  — that is a compact icon nav row, not a "tile", and recon scopes TASK-083 to tiles only. Left
  untouched.
- `widgets/hero-banner/ui/hero-category-sidebar.tsx` and `widgets/promo/ui/promo-deals.tsx` — both
  also consume category data (`useCategoryControllerGetRootCategories`) but are not named in
  recon and are not part of the mega-menu or the tile grids this plan touches. Left untouched, on
  the flat hook, unchanged.
- `apps/store-client/src/app/page.tsx` and `shared/ui/product-card.tsx` — hotspot files owned by
  other Late-Wave-2 branches (TASK-139 and TASK-084/086 respectively); this branch does not touch
  either.

## User Stories

1. As a shopper on desktop, I want to hover (or keyboard-focus) a category in the "Каталог"
   dropdown and immediately see its subcategories next to it, so I can jump straight to a narrow
   listing without an extra page load — while a normal click on the category name still takes me
   straight to that category's own page, exactly like it does today.
2. As a shopper on mobile, I want to tap a chevron next to a category in the slide-out menu to
   expand its subcategories in place (without leaving the menu or navigating away), so I can
   browse the hierarchy before committing to a page.
3. As a shopper browsing the homepage or the `/categories` hub, I want to recognize categories by
   a real photo when the store has set one, so the grid feels curated rather than generic — while
   categories without a photo still look intentional via the existing icon + color treatment.

## Technical Design

### Design decision: preview vs. drill-down for the desktop flyout

Two shapes were considered for "add a second level" to the desktop panel:

1. **Drill-down** (mirrors `CategoriesView`'s rail): a root category with children becomes a
   non-navigating `button` — clicking it only reveals its children in a second pane; reaching the
   root category's own page requires a further click on a "Усі в «Name»" link inside that pane.
2. **Preview** (chosen): the root stays a real `Link` that navigates on click, exactly as today;
   hovering or keyboard-focusing it _additionally_ reveals its children in a second pane, with zero
   extra click required.

Option 1 is tempting for consistency with `CategoriesView`, but it silently **changes already-
shipped behavior**: today, clicking any root category in this exact panel navigates immediately
(TASK-167-A). Converting every root-with-children into a select-only button would mean shoppers who
already know "click a category name here to go there" now need two clicks for any category that
has subcategories — a real regression outside what "render the second level" asks for. Option 2 is
purely additive: existing click behavior is unchanged, and the panel only gains a new,
zero-cost-to-use preview surfaced by hover/focus. This panel is also **desktop-only**
(`hidden ... md:block` on its wrapper — the mobile experience is the entirely separate `Sheet`
accordion), so hover is a safe, unconditionally-available input on every device that ever renders
it; there is no touchscreen-desktop edge case to worry about. Option 2 is used throughout this
plan. (Recorded here rather than silently dropped, in case the owner would in fact prefer the
drill-down UX — see §Notes.)

### Design decision: `<img>`, not `next/image`, for `Category.image`

`next/image` validates any remote `src` against `next.config.ts`'s `images.remotePatterns`
allow-list (`apps/store-client/next.config.ts` — currently the store-api uploads origin plus the
`picsum.photos` dev-seed domain) and **throws at render time** for any host not on that list;
`onError` only catches network-level failures on an _already-allowed_ host, not a
remotePatterns-rejection.

Product images are safe with `next/image` (`cart-item-row.tsx`, `order-item-row.tsx`,
`product-image-gallery.tsx`, `product-card-image.tsx`) because they are only ever produced by the
store-api upload/sharp pipeline (TASK-093) — always the whitelisted uploads origin. `Category.image`
is different: per the owner's FINAL decision above, it stays a **free-text URL** with no upload
pipeline, so an admin can legitimately paste any external image host. Using `next/image` here would
crash the storefront the first time an admin points `Category.image` at a non-whitelisted CDN.

This is not a new problem this plan invents — the codebase already has **two** identical fields and
has already solved this the same way: `BlogPost.coverImageUrl` (also a plain admin URL-input, no
upload endpoint) is rendered with a plain `<img>` + `// eslint-disable-next-line
@next/next/no-img-element`, bypassing the optimizer (and its allow-list) entirely, in both
`widgets/blog/ui/blog-article-view.tsx` (L96–103, the article cover) **and**
`widgets/header/ui/header-search.tsx` (the blog-suggestion thumbnails inside the search dropdown,
same pattern). This plan follows that exact, already-reviewed precedent for both `Category.image`
render sites. (Flagged non-blocking in §Notes for the owner's awareness, since the orchestration
brief mentioned `next/image` — this is a deliberate, reasoned deviation, not an oversight.)

### Desktop flyout — `widgets/header/ui/header-search.tsx`

Replace the `useCategoryControllerGetRootCategories({...})` call with
`useCategoryControllerGetCategoryTree()` (no params). `categories` becomes
`CategoryTreeNodeEntity[]` (each carrying `children: CategoryTreeNodeEntity[]`).

New local state: `activeRootId: string | undefined` (which root's children the right pane shows —
set on `onMouseEnter`/`onFocus` of a root's `Link`). Default (nothing hovered/focused yet, or the
panel just opened) resolves to the **first** root, mirroring the same "default to the first group"
convention `categories-view.tsx` already uses (`activeRoot = roots.find(...) ?? roots[0]`) — so the
right pane is never blank on open:

```ts
const activeRoot =
  categories.find((c) => c.id === activeRootId) ?? categories[0];
```

Panel structure (both columns use the Tailwind width **scale**, `w-64` — no new arbitrary bracket
values, per the TASK-260 `tailwindcss/no-arbitrary-value` lint rule; the previous single-column
panel's `w-72` is dropped from the outer `div`, which now shrinks-to-fit its flex-row children
instead of declaring an explicit width):

```tsx
<div role="menu" aria-label={dict.header.catalogAria} className="absolute top-[calc(100%+8px)] left-0 z-50 rounded-2xl border border-border bg-popover p-2 shadow-lift">
  {/* pending → 6 skeleton rows (unchanged); error → dict.catalog.categoriesError alert (unchanged) */}
  {!catPending && !catError && (
    <>
      <div className="flex">
        <ul className="w-64 pr-2">
          {categories.map((category) => (
            <li key={category.id}>
              <Link
                ref={(el) => { rootLinkRefs.current[category.id] = el; }}
                href={`/categories/${category.slug}`}
                role="menuitem"
                aria-haspopup={category.children.length > 0 ? "true" : undefined}
                aria-expanded={category.children.length > 0 ? category.id === activeRoot?.id : undefined}
                onMouseEnter={() => setActiveRootId(category.id)}
                onFocus={() => setActiveRootId(category.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight" && category.children[0]) {
                    e.preventDefault();
                    childLinkRefs.current[category.children[0].id]?.focus();
                  }
                }}
                onClick={() => setCatalogOpen(false)}
                className="... (existing menuitem classes, unchanged)"
              >
                {category.name}
              </Link>
            </li>
          ))}
          {categories.length === 0 && (/* existing dict.catalog.noCategories row, unchanged */)}
        </ul>

        {activeRoot && activeRoot.children.length > 0 && (
          <div
            role="group"
            aria-label={dict.header.catalogSubcategoriesAria}
            className="w-64 border-l border-border pl-2"
          >
            <ul>
              {activeRoot.children.map((child) => (
                <li key={child.id}>
                  <Link
                    ref={(el) => { childLinkRefs.current[child.id] = el; }}
                    href={`/categories/${child.slug}`}
                    role="menuitem"
                    onKeyDown={(e) => {
                      if (e.key === "ArrowLeft") {
                        e.preventDefault();
                        rootLinkRefs.current[activeRoot.id]?.focus();
                      }
                    }}
                    onClick={() => setCatalogOpen(false)}
                    className="... (same menuitem classes as root items)"
                  >
                    {child.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="mt-0.5 border-t border-border pt-2">
        <Link href="/categories" role="menuitem" onClick={() => setCatalogOpen(false)} className="... (existing catalogAll classes, unchanged)">
          {dict.header.catalogAll}
        </Link>
      </div>
    </>
  )}
</div>
```

Notes on the a11y choice: the outer `role="menu"` + root `role="menuitem"` are the pre-existing
top-level semantics (recon says don't re-litigate them) — this plan does not change them. The
right pane is a `role="group"` (a valid child of `menu`, used for visually/semantically grouping a
subset of `menuitem`s under a label) rather than a second, nested `role="menu"` — two
simultaneously-visible sibling `menu`s is not a valid APG shape (nested `menu` is reserved for a
popup triggered _from_ a `menuitem`, not an always-in-DOM second pane), while `group` is exactly
the "these items belong together" semantic this two-pane layout needs.

Escape (shared `keydown` effect already closes `catalogOpen`/`searchOpen`) additionally calls
`.focus()` on the "Каталог" trigger button (new `catalogTriggerRef`) when it was the catalog panel
that closed — so keyboard users don't lose their place.

### Mobile accordion — new `widgets/header/ui/header-mobile-categories.tsx`

Extracted rather than left inline in `header.tsx`, for two reasons: it matches this folder's
existing one-concern-per-file convention (`HeaderSearch`/`HeaderAuth`/`HeaderCartBadge`/
`HeaderWishlistBadge` are all separate files with their own hook + their own test), and it lets the
new component be unit-tested in isolation without also having to stub `header.tsx`'s other
data dependencies (auth session, cart, wishlist) that a full `<Header />` render would pull in —
none of `header.tsx`'s own sub-widgets are tested that way today either (`header-search.test.tsx`/
`header-auth.test.tsx` both render only their own component, not the full `Header`).

```tsx
"use client";
interface HeaderMobileCategoriesProps {
  /** Close the parent Sheet on any navigation — mirrors every other mobile link in header.tsx. */
  onNavigate: () => void;
}
export function HeaderMobileCategories({ onNavigate }: HeaderMobileCategoriesProps) {
  const { data, isPending, isError } = useCategoryControllerGetCategoryTree();
  const categories = data?.data ?? [];
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  if (isPending) return (/* 5 skeleton rows, aria-hidden, mirrors header-search's 6-row pattern */);
  if (isError) return (<p role="alert" className="px-3 py-2 text-sm text-destructive">{dict.catalog.categoriesError}</p>);
  if (categories.length === 0) return null;

  return (
    <>
      <hr className="my-1 border-border" />
      <p className="px-3 py-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        {dict.header.catalogButton}
      </p>
      {categories.map((category) => {
        const hasChildren = category.children.length > 0;
        const isOpen = Boolean(openIds[category.id]);
        return (
          <div key={category.id}>
            <div className="flex items-center">
              <Link href={`/categories/${category.slug}`} onClick={onNavigate} className={`${MOBILE_LINK_CLASS} flex-1`}>
                {category.name}
              </Link>
              {hasChildren && (
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`mobile-subcats-${category.id}`}
                  aria-label={dict.header.toggleSubcategoriesAria(category.name)}
                  onClick={() => setOpenIds((prev) => ({ ...prev, [category.id]: !prev[category.id] }))}
                  className="flex size-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
                </button>
              )}
            </div>
            {hasChildren && isOpen && (
              <ul id={`mobile-subcats-${category.id}`} className="ml-3 flex flex-col gap-0.5 border-l border-border py-1 pl-3">
                {category.children.map((child) => (
                  <li key={child.id}>
                    <Link href={`/categories/${child.slug}`} onClick={onNavigate} className={MOBILE_LINK_CLASS}>
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </>
  );
}
```

`MOBILE_LINK_CLASS` is exported from `header.tsx` (or duplicated as a matching local constant —
implementer's call; `export const` is simplest) so both files share the exact link styling. The
root `Link` and the chevron `button` are two separate sibling elements (a "split control"), not one
element nested inside the other, so there is no click-suppression ambiguity to worry about (unlike,
e.g., a native `<details>/<summary>` with an interactive element inside the summary, which has
inconsistent cross-browser behavior for whether the inner element's click also toggles the
disclosure — deliberately avoided here). Independent multi-open state (`Record<string, boolean>`,
not single-open) mirrors the existing FAQ accordion pattern already in this codebase
(`widgets/info-support/ui/info-view.tsx` L330–334, `openFaq: Record<number, boolean>`) — no new
interaction pattern invented, same disclosure-button shape (`aria-expanded` on a `<button>`), just
applied to a category tree instead of Q&A pairs.

`header.tsx` changes: delete its own `useCategoryControllerGetRootCategories` call and the inline
`{categories.length > 0 && (...)}` block (L152–170), replace with
`<HeaderMobileCategories onNavigate={() => setMenuOpen(false)} />` at the same position in the
`<nav>`. No other part of `header.tsx` changes.

### Category tile images

#### Shared primitive — `shared/ui/category-tile-image.tsx`

Both tile surfaces need identical "show the image if present and it hasn't failed to load,
otherwise show the caller's fallback markup" logic, and — being FSD peer widgets — neither
`category-nav` nor `categories` may import from the other, so this is factored once into
`shared/ui/`, generalized to accept the fallback as a render prop since the two call sites' fallback
markup differs (icon badge vs. gradient+icon square):

```tsx
"use client";
import { useState, type ReactNode } from "react";

interface CategoryTileImageProps {
  src?: string | null;
  /** "" for decorative use when an adjacent, visible caption already names the
   *  category inside the same link (both call sites in this plan use "") — a
   *  non-empty alt would double-announce the name to screen readers. */
  alt: string;
  className?: string;
  /** Icon/gradient markup rendered when there is no image, or it fails to load. */
  fallback: ReactNode;
}

export function CategoryTileImage({
  src,
  alt,
  className,
  fallback,
}: CategoryTileImageProps) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <>{fallback}</>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Category.image is a
    // free-text admin URL (no upload endpoint, no host allowlist) — see plan 155
    // §Design decision; mirrors the existing BlogPost.coverImageUrl precedent.
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className={className}
      onError={() => setFailed(true)}
    />
  );
}
```

Exported from `shared/ui/index.ts` (appended at the end of the file, after `JsonLd`).

#### `widgets/category-nav/ui/category-nav.tsx` (`CategoryEntity[]`, home grid, 48px icon slot)

```tsx
<span className="inline-flex size-12 items-center justify-center overflow-hidden rounded-xl">
  <CategoryTileImage
    src={category.image}
    alt=""
    className="size-full object-cover"
    fallback={
      <span className={`flex size-full items-center justify-center ${tile}`}>
        <Icon className="size-6 transition-transform duration-200 group-hover:scale-110" />
      </span>
    }
  />
</span>
```

`CategoryNav`'s render swaps its inline `<li>` body for a small local `CategoryTile({ category })`
component (own `key`-scoped state lives inside `CategoryTileImage` itself, so no extra local state
is needed here) wrapping the markup above plus the unchanged name/description `<span>`s below it.

#### `widgets/categories/ui/categories-view.tsx` (`CategoryTreeNodeEntity[]`, `/categories` hub, `aspect-square` tile)

```tsx
<div className="relative mb-3.5 aspect-square overflow-hidden rounded-[13px]">
  <CategoryTileImage
    src={child.image}
    alt=""
    className="size-full object-cover"
    fallback={
      <div
        className="flex size-full items-center justify-center"
        style={{ background: categoryGradient(index) }}
      >
        <Icon className="size-10 text-white" aria-hidden="true" />
      </div>
    }
  />
</div>
```

`CategoriesView`'s `children.map((child, index) => ...)` swaps its tile markup for the block above
(kept inline or extracted to a local `CategoryTile({ child, index })` — implementer's call, purely
a readability decision since all per-tile state now lives inside `CategoryTileImage`).
`categoryGradient`/`pickCategoryIcon` imports from `category-visuals.ts` are unchanged — that file
gets only a doc-comment update noting it is now explicitly the fallback tier for the image (its
exported functions' signatures and behavior do not change; **no functional edit** to
`category-visuals.ts` is otherwise required by this plan, despite it being named in recon as one of
the two touch points for TASK-083 — the executable change lives in `categories-view.tsx`, which
consumes it).

### Dictionary additions

Appended to the **end** of the existing `header` block in
`apps/store-client/src/shared/config/dictionary.ts` (after `cartTotalAria`, before the block's
closing `},`):

```ts
    // TASK-082 — mega-menu second level (desktop flyout + mobile accordion).
    catalogSubcategoriesAria: "Підкатегорії",
    toggleSubcategoriesAria: (name: string) => `Підкатегорії категорії «${name}»`,
```

No other dictionary changes. `home.categories` and `categories` are listed as owned/safe-to-edit by
this branch per the orchestration checklist, but this plan's designs need no new copy there —
existing `dict.catalog.categoriesError`/`dict.catalog.noCategories` are **reused as-is** (read,
not written) for the tree's loading/error/empty states in both the desktop flyout and the mobile
accordion, exactly as the pre-existing flat-hook version already did.

## Data Model

None. `Category.image` (`schema.prisma` L122) and both entities that expose it already exist and
are unchanged by this plan.

## API Contract

None. `GET /api/categories/tree` and `GET /api/categories` (root list) are both pre-existing,
unchanged endpoints; both already-generated Orval hooks (`useCategoryControllerGetCategoryTree`,
`useCategoryControllerGetRootCategories`) are reused as-is. No `swagger:export`/`generate:api` run
is needed for this plan (still copy the pre-generated `shared/api/generated/**` tree from the main
repo into the worktree per the orchestration checklist — the tree is gitignored and absent in a
fresh worktree regardless of whether this plan changes it).

## Tasks

### TASK-082-A: Desktop mega-menu flyout (second level)

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] `header-search.tsx`'s catalog panel reads `useCategoryControllerGetCategoryTree()` instead of
      `useCategoryControllerGetRootCategories(...)`; loading (skeleton rows), error
      (`dict.catalog.categoriesError`), and empty (`dict.catalog.noCategories`) states are
      preserved
- [ ] Every root link's `href`/`onClick` (navigate + close panel) is unchanged from today, even for
      roots that have children — the flyout is additive-only (see §Design decision: preview vs.
      drill-down)
- [ ] Panel renders two columns (`w-64` each, Tailwind scale — no new arbitrary bracket values)
      when the active root has children; one column (roots only) when it doesn't or there are no
      roots at all
- [ ] Hovering a root (`onMouseEnter`) and keyboard-focusing a root (`onFocus`, e.g. via `Tab`)
      both reveal that root's children in the right pane; on first open, the pane defaults to the
      first root's children (never blank)
- [ ] Root items with children carry `aria-haspopup="true"`/`aria-expanded`; the right pane is
      `role="group"` with `aria-label={dict.header.catalogSubcategoriesAria}` (not a nested
      `role="menu"`)
- [ ] `ArrowRight` on a root with children moves focus to its first child; `ArrowLeft` on a child
      moves focus back to its parent root
- [ ] Clicking any root link, any child link, or the "Усі категорії" link closes the panel
      (`setCatalogOpen(false)`) and navigates to the expected href
- [ ] `Escape` closes the panel (existing shared effect, unchanged) and additionally moves focus
      back to the "Каталог" trigger button
- [ ] New dict keys `dict.header.catalogSubcategoriesAria`/`dict.header.toggleSubcategoriesAria`
      appended at the end of the `header` block
- [ ] `header-search.test.tsx`'s `setupHandlers()` mocks `*/api/categories/tree` (nested fixture,
      ≥2 roots, ≥1 root with 2 children) instead of `*/api/categories` — required because
      `onUnhandledRequest: "error"` (`shared/test/setup.ts` L41) fails every existing test in this
      file the moment the component's actual request no longer matches the old handler
- [ ] All pre-existing tests in `header-search.test.tsx` (TASK-218/275 suites) still pass unchanged
      against the new handler
- [ ] New tests: default-active-root-on-open, hover reveals a different root's children,
      keyboard-focus reveals the same, a root-with-children's link still navigates on click,
      `ArrowRight`/`ArrowLeft` pane traversal, `Escape` returns focus to the trigger button,
      loading/error/empty states
- [ ] Tests pass: `npm run test -w apps/store-client -- header-search`
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-search.tsx`
- `apps/store-client/src/widgets/header/ui/header-search.test.tsx`
- `apps/store-client/src/shared/config/dictionary.ts` — `header` block, append-only

---

### TASK-082-B: Mobile Sheet accordion (second level)

**Type:** feat · **Scope:** store-client · **Complexity:** M (2-4h) · **TDD Required:** No ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `widgets/header/ui/header-mobile-categories.tsx` exports `HeaderMobileCategories({
    onNavigate })`, fetching `useCategoryControllerGetCategoryTree()` itself (not a prop from
      `header.tsx`) — mirrors how `HeaderCartBadge`/`HeaderWishlistBadge` each own their own fetch
- [ ] Renders the same "Каталог" section heading + `<hr>` the inline block used to (unchanged
      copy/position); hidden entirely when the tree is empty (`return null`, matching the existing
      `categories.length > 0` guard)
- [ ] Loading → skeleton rows (`aria-hidden`); error → `role="alert"` with
      `dict.catalog.categoriesError`
- [ ] Each root category renders as a `Link` (navigates + calls `onNavigate`) plus, only when it
      has children, a separate sibling chevron `button` (`aria-expanded`, `aria-controls` pointing
      at the revealed `<ul>`'s `id`, `aria-label={dict.header.toggleSubcategoriesAria(category.name)}`)
      that toggles that root's children open/closed **without** navigating — the `Link` and the
      `button` are siblings, not one nested in the other (avoids `<details>/<summary>`-style
      click-suppression ambiguity)
- [ ] Multiple roots can be expanded independently at once (`Record<string, boolean>` state, not
      single-open) — mirrors the existing FAQ accordion in `widgets/info-support/ui/info-view.tsx`
- [ ] Each child link navigates + calls `onNavigate` (closes the parent `Sheet`, same as every
      other link already in the mobile menu)
- [ ] `header.tsx` deletes its own `useCategoryControllerGetRootCategories` call and inline
      category block (L152–170), replacing it with
      `<HeaderMobileCategories onNavigate={() => setMenuOpen(false)} />` at the same position
- [ ] New `header-mobile-categories.test.tsx`: renders roots + hides children by default, chevron
      click expands/collapses (and only that root, others unaffected), two roots can be expanded
      simultaneously, root link click still navigates while chevron click does not, child link
      click calls `onNavigate`, loading/error/empty states, chevron absent for a childless root
- [ ] Tests pass: `npm run test -w apps/store-client -- header-mobile-categories`
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/widgets/header/ui/header-mobile-categories.tsx` (new)
- `apps/store-client/src/widgets/header/ui/header-mobile-categories.test.tsx` (new)
- `apps/store-client/src/widgets/header/ui/header.tsx`

---

### TASK-083-A: Shared `CategoryTileImage` primitive + home page tiles

**Type:** feat · **Scope:** store-client · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** —

**Acceptance Criteria:**

- [ ] New `shared/ui/category-tile-image.tsx` exports `CategoryTileImage({ src, alt, className,
    fallback })`: renders a plain `<img>` (per §Design decision, not `next/image`) with
      `loading="lazy"` when `src` is present and hasn't errored; renders `fallback` when `src` is
      falsy or after `onError` fires; failure state is local to each mounted instance (no leakage
      across sibling tiles)
- [ ] Exported from `shared/ui/index.ts` (appended at the end, after `JsonLd`)
- [ ] `CategoryNav`'s tile renders `category.image` via `CategoryTileImage` inside the existing
      48px (`size-12 rounded-xl`) slot; `alt=""` (decorative — the visible
      `<span>{category.name}</span>` caption inside the same `Link` already supplies the accessible
      name); fallback is the existing keyword-matched icon + tinted background (`styleFor()`,
      unchanged)
- [ ] No visual regression for categories without an `image` (byte-identical fallback markup/
      classes to the current icon+tile render)
- [ ] New `category-tile-image.test.tsx`: renders the image when `src` is set; renders `fallback`
      when `src` is absent/null; renders `fallback` after `onError` fires
      (`fireEvent.error(img)`); two instances with different `src`/fallback don't affect each
      other's state
- [ ] New `category-nav.test.tsx` (none exists today): renders the icon/gradient fallback when
      `image` is null, renders the `<img>` when `image` is set, falls back to the icon after
      `onError` fires, existing loading/error/empty states (`CategoryNavSkeleton`,
      `dict.catalog.categoriesError`/`noCategories`) still covered
- [ ] Tests pass: `npm run test -w apps/store-client -- category-tile-image category-nav`
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/shared/ui/category-tile-image.tsx` (new)
- `apps/store-client/src/shared/ui/category-tile-image.test.tsx` (new)
- `apps/store-client/src/shared/ui/index.ts` (append export)
- `apps/store-client/src/widgets/category-nav/ui/category-nav.tsx`
- `apps/store-client/src/widgets/category-nav/ui/category-nav.test.tsx` (new)

---

### TASK-083-B: `/categories` hub tiles

**Type:** feat · **Scope:** store-client · **Complexity:** S (1-2h) · **TDD Required:** No ·
**Depends on:** TASK-083-A (reuses `CategoryTileImage`)

**Acceptance Criteria:**

- [ ] `CategoriesView`'s child-tile grid renders `child.image` via `CategoryTileImage` filling the
      existing `aspect-square` tile (`size-full object-cover`); `alt=""` (decorative — the tile's
      `<b>{child.name}</b>` caption sits below the image inside the same `Link`); fallback is the
      existing `categoryGradient(index)` background + `pickCategoryIcon` icon
- [ ] `category-visuals.ts` gets a doc-comment update only (documents `pickCategoryIcon`/
      `categoryGradient` as the fallback tier); no functional change to its exports
- [ ] No visual regression for children without an `image`
- [ ] `categories-view.test.tsx` gains one new case: a child with `image` set renders an `<img>`
      with that `src`; existing cases (rail, group switch, brands strip) still pass against MSW
      tree fixtures that omit `image` (falls back correctly when the field is absent/`null`)
- [ ] Tests pass: `npm run test -w apps/store-client -- categories-view`
- [ ] `npm run lint -w apps/store-client` / `npm run typecheck -w apps/store-client` clean

**Files to create/modify:**

- `apps/store-client/src/widgets/categories/ui/categories-view.tsx`
- `apps/store-client/src/widgets/categories/model/category-visuals.ts` (doc comment only)
- `apps/store-client/src/widgets/categories/ui/categories-view.test.tsx`

## Migration Steps

1. TASK-083-A — shared `CategoryTileImage` primitive + home tiles (no dependency on anything else).
2. TASK-083-B — `/categories` tiles (depends on 083-A's primitive).
3. TASK-082-A — desktop flyout (independent of the TASK-083 pair).
4. TASK-082-B — mobile accordion extraction (independent of A; both A and B append to the same
   `header` dict block — do both edits in the same working session to avoid a same-file diff
   getting awkward, not because of any cross-branch conflict risk, since this is one worktree).
5. Full gates on the branch (see §Test & Gate Strategy).
6. Manual QA pass (see §Manual QA) appended to `docs/manual-qa-pending.md`.
7. Full gates on `develop` after the orchestrator merges (per plan 152 §Фаза 3) — not this
   branch's responsibility.

## Test & Gate Strategy (worktree — per plan 152's checklist)

This branch is `store-client`-only: no `apps/store-api` or `apps/store-admin` change, so
`npx prisma generate` is only needed as part of the generic worktree bootstrap (`npm install` at
the worktree root touches the whole monorepo), not because this plan's code needs it.

1. **Bootstrap:** `npm install` (not `npm ci`) at the worktree root; `npx prisma generate` with an
   inline dummy `DATABASE_URL` (per plan 152's universal checklist item 1 — required for the
   monorepo install to type-check cleanly even though this branch never touches `store-api`).
2. **Copy generated API trees** (gitignored, absent in a fresh worktree):
   `cp -rf D:/projects/store-ai/apps/store-client/src/shared/api/generated/. <wt>/apps/store-client/src/shared/api/generated/`
   — `store-admin`'s generated tree is not needed (this branch never imports from `store-admin`).
3. No `.env` needed for `store-client` unit tests/lint/typecheck/build (Next.js config already
   defaults `NEXT_PUBLIC_API_URL` to `http://localhost:3001` when unset — see `next.config.ts`
   L14–16).
4. **No e2e/integration/Playwright** in the worktree. Run, **synchronously in one Bash call**:
   - `npm run lint -w apps/store-client`
   - `npm run typecheck -w apps/store-client`
   - `npm run test -w apps/store-client` (full suite; per the `store-client-jest-parallel-flake`
     memory note, if the full run is red, re-confirm with `npm run test -w apps/store-client --
--runInBand` before treating it as a real failure — parallel workers are known to time out
     heavy MSW suites on this machine even when green serially)
   - `npm run build -w apps/store-client`
5. Conventional commits (`feat(header): ...`, `feat(catalog): ...`, etc.). `BACKLOG.md` untouched.
   `docs/manual-qa-pending.md` gets one `### TASK-082` and one `### TASK-083` block appended at the
   very end of the file (append-only). `dictionary.ts` — only the `header` block gains new lines,
   at its end. `shared/ui/index.ts` — one new export line appended at the end.
6. Hotspot guard: this branch must not touch `apps/store-client/src/app/page.tsx` (TASK-139's
   hotspot) or `apps/store-client/src/shared/ui/product-card.tsx` (TASK-084/086's hotspot).

## Manual QA (append to `docs/manual-qa-pending.md`)

On a running stack, with seed data that includes at least one category with ≥2 levels and at
least one `Category.image` set to a real reachable URL:

- **Desktop:** open "Каталог", hover across a few roots — the right pane swaps to each root's
  subcategories without flicker; Tab through the roots with the keyboard and confirm the same;
  `ArrowRight`/`ArrowLeft` move focus between panes; `Escape` closes the panel and returns focus to
  the "Каталог" button; clicking a root's own name still navigates straight to that root category
  (even when it has children); clicking a subcategory navigates to `/categories/<slug>`.
- **Mobile (or a narrow viewport):** open the header `Sheet`, tap a root category's chevron —
  subcategories expand in place without closing the menu; tapping the category name itself
  navigates and closes the `Sheet`; two roots can be expanded at once.
- **Tile images:** a category with `Category.image` set shows the real photo on both the homepage
  grid and the `/categories` hub tile; a category without one still shows the icon + gradient
  exactly as before; temporarily pointing `Category.image` at a broken/unreachable URL falls back
  to the icon without a console error spamming or a broken-image icon flashing.

## Risks & Mitigations

| Risk                                                                                                                                                                                                      | Mitigation                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switching `header-search.tsx`/`header.tsx` off the flat root-categories hook could silently drop a query-param behavior (`isActive`/`sortBy`/`sortOrder`) the old hook call passed explicitly             | The tree endpoint hardcodes `isActive: true` + `sortOrder: asc` server-side (recon-verified, `category.repository.ts` L248–250) — behaviorally equivalent, just not client-specified; called out explicitly in TASK-082-A/B's acceptance criteria                                                                                                                                             |
| `onUnhandledRequest: "error"` means the `header-search.tsx` handler-path change is a hard requirement, not a nice-to-have — easy to forget mid-refactor and get a wall of unrelated-looking test failures | Called out explicitly as its own acceptance-criteria bullet with the exact line reference (`shared/test/setup.ts` L41)                                                                                                                                                                                                                                                                        |
| Plain `<img>` for `Category.image` (vs. the `next/image` wording in the orchestration brief) could be read as a deviation from instructions                                                               | Documented as a deliberate, precedent-backed design decision in §Design decision, with the exact prior art (`BlogPost.coverImageUrl`, two render sites) cited; flagged non-blocking in this plan's structured output for the owner's awareness                                                                                                                                                |
| Two-pane flyout hover/focus swap could disorient a screen-reader user mid-`Tab` if the right pane's DOM nodes unmount/remount without any live-region announcement                                        | Accepted trade-off, documented in-line — matches the common real-world "hover-preview mega menu" pattern (e.g. most large e-commerce sites); a full APG Menu-with-submenus implementation (`Home`/`End`/typeahead) is out of scope for this task's size, noted as a possible future polish item, not a regression (the pre-existing single-column panel had zero arrow-key navigation at all) |
| The rejected "drill-down" alternative (root-with-children becomes a non-navigating button, `CategoriesView`-style) might actually be what the owner pictured when writing "deep mega-menu"                | Recorded explicitly in §Design decision + §Notes as a considered, rejected-but-reversible alternative — swapping to it later is a contained, single-file change (`header-search.tsx`'s root `Link`→`button`), not a re-architecture                                                                                                                                                           |

## Notes

- Neither TASK-082 nor TASK-083 touches `apps/store-api` or `apps/store-admin` — confirmed no
  schema/migration/Orval step is needed anywhere in this plan.
- `hero-category-sidebar.tsx` and `promo-deals.tsx` also render category data but are not part of
  either recon'd touch-list; left untouched to keep this branch's diff minimal and merge-safe.
- The desktop flyout and mobile accordion intentionally use two different interaction metaphors
  (hover/focus-reveal panel vs. tap-to-expand accordion) because that is the standard, expected
  shape for each input modality — this is not an inconsistency to reconcile.
- If, after reading §Design decision: preview vs. drill-down, the owner would actually prefer the
  `CategoriesView`-style drill-down (root-with-children becomes a selectable, non-navigating
  button, with a separate "Усі в «Name»" link doing the navigating), that is a legitimate
  alternative this plan considered and can be swapped in with a contained follow-up; it was not
  the default here because it changes existing click-to-navigate behavior beyond what recon's
  "render the second level" asked for.
