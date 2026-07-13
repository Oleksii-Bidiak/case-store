"use client";

import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";

const t = dict.categories.tree.bulk;

export interface CategoryBulkActionsBarProps {
  selectedCount: number;
  isPending: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onClear: () => void;
}

/**
 * The bulk-action bar (TASK-293) — rendered only while the selection is non-empty,
 * above the treegrid.
 *
 * `role="status"`: appearing at all IS the feedback that a selection exists, and the
 * count changes as rows are picked; a polite live region reports both to a screen
 * reader without stealing focus from the grid.
 */
export function CategoryBulkActionsBar({
  selectedCount,
  isPending,
  onActivate,
  onDeactivate,
  onClear,
}: CategoryBulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2"
    >
      <span className="text-sm font-medium">
        {t.selectedCount(selectedCount)}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={onActivate}
      >
        {t.activate(selectedCount)}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={onDeactivate}
      >
        {t.deactivate(selectedCount)}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={onClear}
      >
        {t.clear}
      </Button>
    </div>
  );
}
