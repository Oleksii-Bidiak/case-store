"use client";

import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui";
import { dict } from "@/shared/config";

interface FiltersDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Products the current selection yields. `undefined` while the first count is
   * still in flight («Рахуємо…»); `0` switches the footer to the reset action.
   */
  resultCount: number | undefined;
  /**
   * Undo the selection from inside the drawer — what the footer offers when
   * nothing matches. Each consumer passes its OWN reset (the catalogue's clears
   * everything but a route-locked segment, `/search` keeps the query, the
   * wishlist resets its client-side state), so the drawer never has to know
   * which filters exist.
   */
  onReset: () => void;
  /**
   * The reset's label — the SAME string the page's own empty-state reset uses,
   * so one action has one name wherever it appears (TASK-516). Defaults to the
   * panel's «Скинути фільтри».
   */
  resetLabel?: string;
  /** The filter panel, rendered in its `collapsible` form. */
  children: ReactNode;
}

/**
 * FiltersDrawer — the mobile filter drawer shared by the catalogue, `/search`
 * and the wishlist (TASK-804).
 *
 * There were three copies, and they had drifted: the catalogue and the
 * wishlist DISABLED their only labelled action at zero results, so the one way
 * out of a filter that matched nothing was the × in the corner — the
 * «Скинути фільтри» button lay under the drawer, on the page behind it — while
 * `/search` left the same button enabled and closed onto an empty grid. The
 * widths and the iOS scroll-chaining guard differed too.
 *
 * Now the footer always offers something that works:
 *   - N > 0 → «Показати N товарів», which closes the drawer onto the results;
 *   - 0     → the consumer's reset, with the «Немає товарів за цими фільтрами»
 *     line kept above it (announced politely). The drawer stays open, so the
 *     shopper watches the count come back and can refine from there;
 *   - still counting → «Рахуємо…», which closes like «Показати».
 *
 * It is ONE `<button>` whose label and action change, not two buttons swapped
 * in and out: focus stays where the shopper left it when the count moves
 * between zero and not-zero.
 */
export function FiltersDrawer({
  open,
  onOpenChange,
  resultCount,
  onReset,
  resetLabel = dict.filters.clear,
  children,
}: FiltersDrawerProps) {
  const nothingMatches = resultCount === 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        // `overscroll-contain` stops iOS Safari scroll-chaining — dragging past
        // the top/bottom of the filter list no longer rubber-bands the page
        // underneath the open drawer (TASK-084). `max-w-[88vw]` keeps a strip
        // of the page visible on the narrowest phones, so the drawer reads as
        // a drawer; a viewport fraction has no spacing-token equivalent.
        // eslint-disable-next-line tailwindcss/no-arbitrary-value -- viewport-fraction cap, see above
        className="w-86 max-w-[88vw] gap-0 overflow-y-auto overscroll-contain p-0"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="font-display text-lg font-bold">
            {dict.filters.legend}
          </SheetTitle>
        </SheetHeader>
        <div className="p-4">{children}</div>
        <SheetFooter className="border-t border-border">
          <p
            aria-live="polite"
            className={
              nothingMatches
                ? "text-center text-sm text-muted-foreground"
                : "sr-only"
            }
          >
            {nothingMatches ? dict.filters.mobileApply(0) : ""}
          </p>
          <button
            type="button"
            onClick={nothingMatches ? onReset : () => onOpenChange(false)}
            // 15px is the catalogue drawer's CTA size from the mockup (TASK-084),
            // carried over verbatim — the type scale has no 15px step.
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mockup CTA size, see above
            className="h-12 w-full rounded-xl bg-primary text-[15px] font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {nothingMatches
              ? resetLabel
              : resultCount == null
                ? dict.filters.mobileApplyPending
                : dict.filters.mobileApply(resultCount)}
          </button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
