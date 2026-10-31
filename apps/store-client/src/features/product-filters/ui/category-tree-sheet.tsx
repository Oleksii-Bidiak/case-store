"use client";

import { List } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { subcategoryCount } from "../model/category-tree";
import { CategoryTree, type CategoryTreeProps } from "./category-tree";

interface CategoryTreeSheetProps extends Omit<CategoryTreeProps, "onNavigate"> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The tree has not arrived yet: the button keeps its place with the neutral
   * «Категорія» label and the sheet is not offered.
   */
  pending?: boolean;
  /**
   * Products the current listing yields, for the footer's «Показати N
   * товарів». `undefined` while the count is in flight («Рахуємо…»).
   */
  resultCount: number | undefined;
  /** Extra classes for the toolbar button (its width in the toolbar row). */
  className?: string;
}

/**
 * The category tree below `lg` (TASK-2011): a «Підкатегорії · N» toolbar
 * button beside «Фільтри» that opens the SAME tree as the desktop rail in a
 * bottom sheet. Picking a node follows its link and closes the sheet; the
 * footer closes it onto the current results. Esc, the overlay and the × close
 * it too, and focus is trapped and returned to the button by the `Sheet`
 * primitive (Radix Dialog).
 */
export function CategoryTreeSheet({
  open,
  onOpenChange,
  pending = false,
  resultCount,
  className,
  ...tree
}: CategoryTreeSheetProps) {
  const label = pending
    ? dict.filters.categoryTreeTitle
    : dict.filters.subcategoriesButton(
        subcategoryCount(tree.categories, tree.currentSlug),
      );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className={cn(
            "inline-flex h-11 min-w-0 shrink-0 items-center justify-center gap-2 rounded-xl border-chip border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors duration-150 ease-out hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground motion-reduce:transition-none lg:hidden",
            className,
          )}
        >
          <List aria-hidden="true" className="size-4.5 shrink-0" />
          <span className="truncate">{label}</span>
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        // A fixed sheet's percentage height is of the viewport: ≈83% leaves the
        // page visible above it, so it reads as a sheet over the listing.
        className="max-h-5/6 gap-0 rounded-t-xl p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="font-display text-lg font-bold">
            {dict.filters.categoryTreeTitle}
          </SheetTitle>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
          <CategoryTree {...tree} onNavigate={() => onOpenChange(false)} />
        </div>
        <SheetFooter className="border-t border-border">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="h-12 w-full rounded-xl bg-primary text-base font-bold text-primary-foreground outline-none transition-colors duration-150 ease-out hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 motion-reduce:transition-none"
          >
            {resultCount === 0
              ? dict.filters.subcategoriesNothing
              : resultCount == null
                ? dict.filters.mobileApplyPending
                : dict.filters.mobileApply(resultCount)}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
