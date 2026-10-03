import { Skeleton } from "@/shared/ui";
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
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
          </div>
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
