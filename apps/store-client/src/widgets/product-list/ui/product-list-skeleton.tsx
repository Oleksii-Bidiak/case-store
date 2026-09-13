import { Skeleton } from "@/shared/ui";
import type { CatalogView } from "@/features/product-filters";

/** Uneven chip widths so the placeholder row reads as words, not as a bar. */
const CHIP_WIDTHS = ["w-24", "w-28", "w-20", "w-32", "w-24", "w-28"] as const;

/**
 * Filter-card heights for the desktop rail. Five entries = the five sections
 * `ProductFilters` ALWAYS renders (keyword, availability, brand, device,
 * price); the sixth — spec facets — appears only once a category is picked, and
 * a skeleton that reserved it would leave a hole on the default `/products`
 * view. Keep in sync with `features/product-filters/ui/product-filters.tsx`:
 * a rail shorter than the real panel re-introduces the very jump this variant
 * exists to remove.
 */
const FILTER_CARD_HEIGHTS = ["h-20", "h-14", "h-28", "h-40", "h-32"] as const;

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
}

/** Loading fallback for the product results — grid cards or list rows. */
export function ProductListSkeleton({
  view = "grid",
  withSidebar = false,
}: ProductListSkeletonProps) {
  const results =
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
        className="grid grid-cols-1 items-stretch gap-[18px] min-[390px]:grid-cols-2 lg:grid-cols-4"
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

  if (!withSidebar) {
    return results;
  }

  return (
    <div aria-hidden="true">
      {/* Category chips row — one scrollable line of h-9 pills. Widths are
          written out in full (not built from a template literal) because
          Tailwind only generates classes it can find verbatim in the source. */}
      <div className="mb-5 flex items-center gap-2 overflow-hidden pb-1">
        {CHIP_WIDTHS.map((width, i) => (
          <Skeleton key={i} className={`h-9 shrink-0 rounded-full ${width}`} />
        ))}
      </div>

      {/* Toolbar: mobile filters button (left) + view toggle & sort (right). */}
      <div className="mb-5 flex items-center gap-3">
        <Skeleton className="h-11 w-32 rounded-xl lg:hidden" />
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="hidden h-11 w-24 rounded-xl lg:block" />
          <Skeleton className="h-11 w-48 max-w-full rounded-xl" />
        </div>
      </div>

      {/* Same fixed+fluid split as ProductListView: 268px filter rail + results. */}
      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors ProductListView's sidebar grid; a named grid-cols-N cannot express it */}
      <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-[268px_1fr]">
        <div className="hidden flex-col gap-3.5 lg:flex">
          {FILTER_CARD_HEIGHTS.map((height, i) => (
            <Skeleton key={i} className={`w-full rounded-2xl ${height}`} />
          ))}
        </div>

        <div className="min-w-0">{results}</div>
      </div>
    </div>
  );
}
