import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  CategoryChipsSkeleton,
  FilterCardSkeleton,
  filterRailSections,
  type CatalogView,
} from "@/features/product-filters";

interface ProductListSkeletonProps {
  view?: CatalogView;
  /**
   * Mirror the whole catalogue shell, not just the results (TASK-416): the
   * category chips row, the toolbar and the 268px desktop filter rail from
   * `ProductListView`. Route-level `loading.tsx` and the page's `<Suspense>`
   * fallback stand in for that entire widget, so without this the catalogue
   * appeared as a bare full-width grid and then jumped left by a whole column
   * the moment the real view mounted.
   */
  withSidebar?: boolean;
  /**
   * Draw the category chips row (`withSidebar` only). `ProductListView` hides
   * it when the route locks the category — `/categories/[slug]` and
   * `/catalog/[category]/[device]` — so those fallbacks pass `false`, or the
   * placeholder row would collapse and pull everything up on mount.
   */
  withCategoryChips?: boolean;
  /**
   * Reserve the subcategory chips row under it (`subcategoryChipsOf` is
   * non-empty for the active category). Only a page that has the category tree
   * can know; a `loading.tsx` gets no searchParams and leaves it out.
   */
  withSubcategoryChips?: boolean;
  /** A category is active → the rail ends with «Характеристики» (TASK-515). */
  hasCategory?: boolean;
  /** The route fixes the device → the rail has no «Сумісний пристрій». */
  lockedDevice?: boolean;
  /** The route fixes the discount (`/promo`) → the rail has no «Знижки». */
  lockedOnSale?: boolean;
}

/**
 * One grid cell, shaped like the `ProductCard` + `ProductCardActions` pair the
 * catalogue renders — block for block, so the real card fills the box instead
 * of growing out of it (TASK-869). The old cell was a bare image and two bars,
 * 164px shorter than the card at 1440: the skeleton's second row sat where the
 * real first row's price and «Купити» land, and the whole grid redrew taller.
 *
 * Heights, top to bottom: the bordered frame; the edge-to-edge square image;
 * the `p-4 gap-2` body with the two-line title (`line-clamp-2`, 2 × 20px), the
 * rating row (16px), the colour-dots row (14px) and the price (`text-lg`,
 * 28px, pushed down by `mt-auto`);
 * then the `px-4 pb-4` action block — the stock line and the 40px Buy +
 * heart row. The stock line («В наявності · доставка 1–2 дні») wraps onto a
 * second line wherever the card is narrower than ~216px — two columns up to
 * ~455px and four columns from `lg` to ~1296px — which no breakpoint pair
 * follows, so the placeholder sets the same dictionary copy in the same
 * `text-xs` flex row, transparent on a pulsing background: it wraps exactly
 * where the real line does, at every width.
 *
 * The second title line, the rating row and the colour-dots row are drawn for
 * every cell, and `ProductList` renders its cards with `reserveRows`, which
 * holds the same three rows open when a product has a one-line name, no
 * reviews or a single colour. So every card in the grid is this box whatever
 * its data: the first /products page (no variant card) and /promo (variants
 * in most rows) both land on the placeholder to the pixel. Before, the rows
 * followed the data — a variant card stretched its row 22px past a
 * placeholder without the colour row, and a page without one shrank 22px
 * short of a placeholder with it, the shift adding up down the page.
 */
function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <Skeleton className="h-4 w-24" />
        {/* The `ColorDots` row (14px swatches, `gap-1.5`) — the real card
            keeps it too via `reserveRows`, see the docblock. */}
        <div
          className="flex items-center gap-1.5"
          data-testid="color-dots-skeleton"
        >
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="size-3.5 rounded-full" />
          ))}
        </div>
        <Skeleton className="mt-auto h-7 w-20" />
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        <p
          className="flex items-center gap-1.5 text-xs select-none"
          data-testid="stock-line-skeleton"
        >
          <span className="w-1.5 shrink-0" />
          {/* The flex item is blockified; the inner span stays inline, so
              the pulse paints one bar per wrapped line, not one slab. */}
          <span className="min-w-0">
            <span className="animate-pulse rounded-md bg-muted text-transparent box-decoration-clone">
              {dict.productCard.inStockLine}
            </span>
          </span>
        </p>
        <div className="flex gap-2">
          <Skeleton className="h-10 flex-1" />
          <Skeleton className="h-10 w-10.5 shrink-0 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Loading fallback for the product results — grid cards or list rows. */
export function ProductListSkeleton({
  view = "grid",
  withSidebar = false,
  withCategoryChips = true,
  withSubcategoryChips = false,
  hasCategory = false,
  lockedDevice = false,
  lockedOnSale = false,
}: ProductListSkeletonProps) {
  const items =
    view === "list" ? (
      <div className="flex flex-col gap-3.5" aria-hidden="true">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex gap-5 rounded-2xl border border-border bg-card p-4"
          >
            <Skeleton className="size-[150px] shrink-0 rounded-xl" />
            <div className="flex flex-1 flex-col gap-3 py-1">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-auto h-9 w-full" />
            </div>
          </div>
        ))}
      </div>
    ) : (
      // Byte-identical to the real grid in `ProductList` (1 / 2 / 4 columns) —
      // same columns, same gap, so swapping skeletons for cards does not reflow.
      // Guarded by a parity test in `product-list.test.tsx` (TASK-415): never
      // edit this class list without editing `ProductList`'s to match.
      <div
        className="grid grid-cols-1 items-stretch gap-4 md:gap-6 min-[390px]:grid-cols-2 lg:grid-cols-4"
        aria-hidden="true"
      >
        {Array.from({ length: 12 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    );

  // The results column of `ProductList`: the «Знайдено товарів: N» line (one
  // text-sm line, 20px) and the cards under it, `gap-6` apart. Without the line
  // the cards sat 44px above where the real ones land, on every catalogue
  // route (TASK-869).
  const results = (
    <div className="flex flex-col gap-6" aria-hidden="true">
      <Skeleton className="h-5 w-40" data-testid="result-count-skeleton" />
      {items}
    </div>
  );

  if (!withSidebar) {
    return results;
  }

  return (
    <div aria-hidden="true">
      {/* Category chips — the feature's own placeholder, the one the view
          shows until its category tree is there, so the two are the same box
          row for row (TASK-515). */}
      {withCategoryChips && (
        <CategoryChipsSkeleton withSubcategories={withSubcategoryChips} />
      )}

      {/* Toolbar: mobile filters button (left) + view toggle & sort (right).
          The toggle is two 44px buttons in a padded, bordered segment — 54px
          tall, not 44 — and it sets the row's height on desktop, so a 44px
          placeholder left the whole grid 10px too high until the swap
          (TASK-515). The sort trigger's width follows its «Спочатку: …» label. */}
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-11 w-32 rounded-xl lg:hidden" />
        <div className="ml-auto flex min-w-0 items-center gap-3">
          <Skeleton className="hidden h-13.5 w-25.5 rounded-xl lg:block" />
          <Skeleton className="h-11 w-48 max-w-full rounded-xl sm:w-66" />
        </div>
      </div>

      {/* Same fixed+fluid split as ProductListView: 268px filter rail + results. */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors ProductListView's sidebar grid; a named grid-cols-N cannot express it */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        <div
          className="hidden flex-col gap-3.5 lg:flex"
          data-testid="filter-rail-skeleton"
        >
          {/* WHICH cards, in what order, comes from `filterRailSections` — the
              list `ProductFilters` gates its own sections on — and each card is
              the feature's own placeholder: the same box «Виробник» and
              «Характеристики» keep holding until their data lands, so the rail
              does not lose a card on swap and regain it a second later
              (TASK-515). A new section without a height fails typecheck. */}
          {filterRailSections({
            hasCategory,
            lockedDevice,
            lockedOnSale,
          }).map((section) => (
            <FilterCardSkeleton key={section} section={section} />
          ))}
        </div>

        <div className="min-w-0">{results}</div>
      </div>
    </div>
  );
}
