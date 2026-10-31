"use client";

import { SlidersHorizontal } from "lucide-react";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

interface FiltersButtonProps {
  /** Filters active INSIDE the drawer — badged when above zero. */
  activeCount: number;
  /** Open the filters drawer. */
  onClick: () => void;
  /**
   * Extra classes — its width in the toolbar row: half of the first row beside
   * «Підкатегорії» on a phone (TASK-2011).
   */
  className?: string;
}

/**
 * The «Фільтри» button of a listing toolbar — opens `FiltersDrawer` below `lg`,
 * where the filter rail is hidden (TASK-876). One component for the catalogue
 * and `/search`, which used to hand-copy it and drifted (a 2px border and a
 * 20px icon on one page, 1.5px and 18px on the other).
 *
 * `shrink-0` keeps it whole on a 320px phone: the sort pill beside it is the
 * one that gives way and truncates its label.
 */
export function FiltersButton({
  activeCount,
  onClick,
  className,
}: FiltersButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border-chip border-border bg-card px-4 text-sm font-semibold text-foreground transition-interactive hover:border-foreground/35 hover:bg-muted active:scale-98 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring lg:hidden",
        className,
      )}
    >
      <SlidersHorizontal aria-hidden="true" className="size-4.5" />
      {dict.filters.filtersButton}
      {activeCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-primary-foreground">
          {activeCount}
        </span>
      )}
    </button>
  );
}
