"use client";

import { LayoutGrid, List } from "lucide-react";
import { dict } from "@/shared/config";

export type CatalogView = "grid" | "list";

interface ViewToggleProps {
  view: CatalogView;
  onChange: (view: CatalogView) => void;
  className?: string;
}

/**
 * Grid / list results view switch for a listing toolbar (TASK-1958,
 * Catalog.dc.html §6). One pill that offers the OTHER view — «Списком» while
 * the grid is shown, «Плиткою» while the list is — so it costs one control's
 * width and fits the phone toolbar beside «Фільтри» and the sort; the old
 * two-button segmented control did not, and was hidden below `lg`.
 *
 * The visible word appears from `sm`; below it the pill is icon-only, so the
 * accessible name is always the full action («Показати списком»), which also
 * contains the visible word (WCAG 2.5.3 label-in-name). It is an action
 * button, not a pressed toggle: its label already changes with the state, and
 * `aria-pressed` on top of a changing label would announce it twice.
 */
export function ViewToggle({ view, onChange, className }: ViewToggleProps) {
  const next: CatalogView = view === "grid" ? "list" : "grid";
  const Icon = next === "list" ? List : LayoutGrid;
  const label = next === "list" ? dict.filters.viewList : dict.filters.viewGrid;
  const ariaLabel =
    next === "list" ? dict.filters.viewListAria : dict.filters.viewGridAria;

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      title={ariaLabel}
      onClick={() => onChange(next)}
      // eslint-disable-next-line tailwindcss/no-arbitrary-value -- the toolbar's 1.5px control border, shared with FiltersButton and SortSelect; no border-width token yet
      className={`inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-xl border-[1.5px] border-border bg-card px-3 text-sm font-semibold whitespace-nowrap text-foreground transition-interactive hover:border-foreground/35 hover:bg-muted active:scale-98 motion-reduce:active:scale-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring sm:px-4 ${className ?? ""}`}
    >
      <Icon aria-hidden="true" className="size-4.5" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
