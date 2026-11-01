"use client";

import { useId } from "react";
import { Skeleton } from "@/shared/ui";
import { dict } from "@/shared/config";
import { CategoryTree, type CategoryTreeProps } from "./category-tree";

// The rail's card, like the filter cards under it (`ProductFilters`), with the
// mockup's tighter 14px padding for a list of rows.
const panelClass = "rounded-2xl border border-border bg-card p-3.5 shadow-card";
const headingClass =
  "mb-2 px-1.5 text-xs font-bold tracking-wider text-muted-foreground uppercase";

/**
 * The first panel of the desktop filter rail (TASK-2011): «КАТЕГОРІЯ» over the
 * category tree. A `<nav>` named by its heading — it is where the shopper moves
 * between categories, not a filter of the current one.
 */
export function CategoryTreePanel(props: CategoryTreeProps) {
  const headingId = useId();
  return (
    <nav aria-labelledby={headingId} className={panelClass}>
      <p id={headingId} className={headingClass}>
        {dict.filters.categoryTreeTitle}
      </p>
      <CategoryTree {...props} />
    </nav>
  );
}

interface CategoryTreePanelSkeletonProps {
  /**
   * Rows to reserve — `categoryTreeRowCount` of the page's tree and category
   * when the caller has them, so the placeholder is the panel's own height.
   */
  rows?: number;
}

/**
 * The panel's placeholder: the same card, heading line and 36px rows `gap-0.5`
 * apart (TASK-515 — the skeleton is the box it stands in for, so the filter
 * cards under it do not move when the tree lands).
 */
export function CategoryTreePanelSkeleton({
  rows = 6,
}: CategoryTreePanelSkeletonProps) {
  return (
    <div
      aria-hidden="true"
      data-testid="category-tree-skeleton"
      className={panelClass}
    >
      <div className="mb-2 px-1.5">
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="flex flex-col gap-0.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-9 rounded-menu" />
        ))}
      </div>
    </div>
  );
}
