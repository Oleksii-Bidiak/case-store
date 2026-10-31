import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { PRODUCT_GRID_CLASS } from "@/shared/config/product-grid";
import {
  CategoryTreePanelSkeleton,
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
   * Draw the category tree — its panel at the top of the rail and its
   * «Підкатегорії» button in the toolbar below `lg` (`withSidebar` only,
   * TASK-2011). `ProductListView` leaves the tree out only where the route
   * fixes the device (`/catalog/[category]/[device]`), so that fallback passes
   * `false`.
   */
  withCategoryTree?: boolean;
  /**
   * Rows the tree panel will draw — `categoryTreeRowCount` of the page's tree
   * and category. Only a page that has the tree can know; a `loading.tsx` gets
   * no searchParams and takes the panel's default.
   */
  categoryTreeRows?: number;
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
 * heart row. The stock line is stock only — «В наявності», no delivery promise
 * since TASK-2080 — and fits one line at every card width today. The
 * placeholder still sets the same dictionary copy (`inStockLine`) in the same
 * `text-xs` flex row, transparent on a pulsing background, so if the copy ever
 * grows again it wraps exactly where the real line does, with no width to
 * keep in sync.
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
  withCategoryTree = true,
  categoryTreeRows,
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
      // The same `PRODUCT_GRID_CLASS` as the real grid in `ProductList` —
      // same columns, same gap, so swapping skeletons for cards does not reflow.
      // Guarded by a parity test in `product-list.test.tsx` (TASK-415).
      <div className={PRODUCT_GRID_CLASS} aria-hidden="true">
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
      {/* Toolbar: the same rows and gaps as ProductListView. Every control is
          44px tall since the toggle became one pill shown at every width
          (TASK-1958): icon-only 44px below `sm`, «Списком» beside the icon
          from `sm`. With the category tree (TASK-2011), «Фільтри» and
          «Підкатегорії» share the first row below `md` and sort + view wrap
          under them. The sort trigger's width follows its «Спочатку: …»
          label. */}
      <div className="mb-5 flex flex-wrap items-center gap-2 sm:gap-3">
        {withCategoryTree ? (
          <div className="flex w-full gap-2 sm:gap-3 md:w-auto lg:hidden">
            <Skeleton className="h-11 flex-1 rounded-xl md:w-32 md:flex-none" />
            <Skeleton className="h-11 flex-1 rounded-xl md:w-44 md:flex-none" />
          </div>
        ) : (
          <Skeleton className="h-11 w-32 rounded-xl lg:hidden" />
        )}
        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          <Skeleton className="h-11 w-40 max-w-full rounded-xl sm:w-66" />
          <Skeleton className="h-11 w-11 shrink-0 rounded-xl sm:w-30" />
        </div>
      </div>

      {/* Same fixed+fluid split as ProductListView: 268px filter rail + results. */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors ProductListView's sidebar grid; a named grid-cols-N cannot express it */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        <div
          className="hidden flex-col gap-3.5 lg:flex"
          data-testid="filter-rail-skeleton"
        >
          {/* The tree panel first, as in the rail (TASK-2011) — the feature's
              own placeholder, the one the view shows until its tree is there. */}
          {withCategoryTree && (
            <CategoryTreePanelSkeleton rows={categoryTreeRows} />
          )}
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
            // The catalogue rail tops its filters with «З урахуванням моїх
            // пристроїв» (TASK-2077); the section list drops it on compat pages.
            withMyDevices: true,
          }).map((section) => (
            <FilterCardSkeleton key={section} section={section} />
          ))}
        </div>

        <div className="min-w-0">{results}</div>
      </div>
    </div>
  );
}
