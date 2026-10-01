import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";
import {
  filterRailSections,
  type CatalogView,
  type FilterSectionId,
} from "@/features/product-filters";

/** Uneven chip widths so the placeholder row reads as words, not as a bar. */
const CHIP_WIDTHS = ["w-24", "w-28", "w-20", "w-32", "w-24", "w-28"] as const;

/**
 * Placeholder height per filter card, measured on the live rail at 1440px
 * (2026-10-01, seeded catalogue): keyword 94, availability 109, sale 109,
 * brand 113, device 159, price 165 px — rounded onto the spacing scale, so the
 * default `/products` rail is 818px against the real 817px. «Характеристики»
 * depends on the category's facet list (543–763px on the seed); `h-140` is the
 * typical value and starts below the fold, where a mismatch shifts nothing.
 *
 * Only the HEIGHTS live here. WHICH cards are drawn, and in what order, comes
 * from `filterRailSections` — the same list `ProductFilters` gates its own
 * sections on (TASK-515) — so a new section reaches the skeleton the day it
 * ships, and a missing height fails typecheck instead of silently shortening
 * the rail.
 */
const FILTER_CARD_HEIGHT: Record<FilterSectionId, string> = {
  search: "h-24",
  availability: "h-27",
  onSale: "h-27",
  brand: "h-28",
  device: "h-40",
  price: "h-41",
  specs: "h-140",
};

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
      {/* Category chips row — one scrollable line of h-9 pills. Widths are
          written out in full (not built from a template literal) because
          Tailwind only generates classes it can find verbatim in the source. */}
      {withCategoryChips && (
        <div className="mb-5 flex items-center gap-2 overflow-hidden pb-1">
          {CHIP_WIDTHS.map((width, i) => (
            <Skeleton
              key={i}
              className={`h-9 shrink-0 rounded-full ${width}`}
            />
          ))}
        </div>
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
          {filterRailSections({
            hasCategory,
            lockedDevice,
            lockedOnSale,
          }).map((section) => (
            <Skeleton
              key={section}
              data-section={section}
              className={cn("w-full rounded-2xl", FILTER_CARD_HEIGHT[section])}
            />
          ))}
        </div>

        <div className="min-w-0">{results}</div>
      </div>
    </div>
  );
}
