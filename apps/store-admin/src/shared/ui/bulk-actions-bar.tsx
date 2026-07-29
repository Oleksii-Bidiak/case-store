"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";

const t = dict.common.table;

/**
 * BulkActionsBar — the bar that appears above a table while rows are selected
 * (TASK-353).
 *
 * Generalised from `features/category-bulk-status/ui/category-bulk-actions-bar.tsx`
 * (TASK-293), which hard-coded activate/deactivate. Two things are kept verbatim
 * because they were deliberate there:
 *
 * - `role="status"`. The bar APPEARING is itself the feedback that a selection
 *   exists, and its count changes as rows are picked. A polite live region
 *   reports both without stealing focus from the table.
 * - Rendering nothing at zero. An always-present bar with disabled buttons reads
 *   as broken; an absent one reads as "nothing selected", which is the truth.
 *
 * `selectedCount` must be the count of rows on the CURRENT page —
 * `useRowSelection` already derives it that way. A count spanning pages the
 * operator cannot see would be a footgun on a destructive action.
 */

export interface BulkAction {
  /** Button text. Usually takes the count, e.g. `Схвалити (3)`. */
  label: string;
  onClick: () => void;
  variant?: React.ComponentProps<typeof Button>["variant"];
  /** Disable this one action while leaving the rest usable. */
  disabled?: boolean;
}

export interface BulkActionsBarProps {
  /** Rows selected ON THE CURRENT PAGE. Zero renders nothing. */
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  /** Disables every control — pass the mutation's `isPending`. */
  isPending?: boolean;
  className?: string;
}

export function BulkActionsBar({
  selectedCount,
  actions,
  onClear,
  isPending = false,
  className,
}: BulkActionsBarProps) {
  if (selectedCount === 0) return null;

  return (
    <div
      role="status"
      data-slot="bulk-actions-bar"
      className={cn(
        "mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2",
        className,
      )}
    >
      <span className="text-sm font-medium">
        {t.selectedCount(selectedCount)}
      </span>
      {actions.map((action) => (
        <Button
          key={action.label}
          type="button"
          variant={action.variant ?? "outline"}
          size="sm"
          disabled={isPending || action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={isPending}
        onClick={onClear}
      >
        {t.clearSelection}
      </Button>
    </div>
  );
}
