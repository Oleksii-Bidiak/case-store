"use client";

import { SlidersHorizontal } from "lucide-react";
import { dict } from "@/shared/config";

interface FiltersButtonProps {
  /** Filters active INSIDE the drawer — badged when above zero. */
  activeCount: number;
  /** Open the filters drawer. */
  onClick: () => void;
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
export function FiltersButton({ activeCount, onClick }: FiltersButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- the toolbar's 1.5px control border, shared with SortSelect and ViewToggle; moved here from two call sites (net −2), no border-width token yet
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-border bg-card px-4 text-sm font-semibold text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
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
