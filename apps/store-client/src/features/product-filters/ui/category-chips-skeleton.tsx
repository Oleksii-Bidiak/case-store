import { Skeleton } from "@/shared/ui";
import { cn } from "@/shared/lib/utils";

/** Uneven chip widths so the placeholder row reads as words, not as a bar. */
const ROOT_CHIP_WIDTHS = [
  "w-24",
  "w-28",
  "w-20",
  "w-32",
  "w-24",
  "w-28",
] as const;
const CHILD_CHIP_WIDTHS = ["w-28", "w-24", "w-32", "w-20"] as const;

interface CategoryChipsSkeletonProps {
  /** Reserve the subcategory row too (`subcategoryChipsOf` is non-empty). */
  withSubcategories?: boolean;
}

/**
 * Placeholder for `CategoryChips` — the same box, row for row: the `mb-5`
 * column with a `gap-2` between rows, each row a line of `h-9` pills over a
 * `pb-1` scrollbar gutter (40px; 88px with the subcategory row).
 *
 * Used wherever the chips are not on screen yet (TASK-515): inside the
 * catalogue skeleton, and by `ProductListView` itself while it has no category
 * tree, so the toolbar and the grid under the row stay put when the chips land.
 * Widths are written out in full because Tailwind only generates classes it
 * can find verbatim in the source.
 */
export function CategoryChipsSkeleton({
  withSubcategories = false,
}: CategoryChipsSkeletonProps) {
  const row = (widths: readonly string[], className?: string) => (
    <div
      className={cn("flex items-center gap-2 overflow-hidden pb-1", className)}
    >
      {widths.map((width, i) => (
        <Skeleton key={i} className={cn("h-9 shrink-0 rounded-full", width)} />
      ))}
    </div>
  );

  return (
    <div
      className="mb-5 flex flex-col gap-2"
      aria-hidden="true"
      data-testid="category-chips-skeleton"
    >
      {row(ROOT_CHIP_WIDTHS)}
      {withSubcategories && row(CHILD_CHIP_WIDTHS, "pl-1")}
    </div>
  );
}
