"use client";

import * as React from "react";
import { SquareCheckIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { countLabel, type PluralForms } from "@/shared/lib/plural";
import { dict } from "@/shared/config";
import { Button } from "../button";
import { RowActionsMenu, type RowActionItem } from "./row-actions-menu";

const r = dict.common.registry;

export interface RegistryBulkBarProps {
  /** Selected across ALL pages — the registry keeps the selection. */
  selectedCount: number;
  /** What is counted: «замовлення / замовлення / замовлень». */
  itemForms: PluralForms;
  /** Shown while nothing is selected: what selecting rows is FOR. */
  idleHint: React.ReactNode;
  /** The screen's bulk actions (buttons). Rendered only while active. */
  actions?: React.ReactNode;
  /** Adds «Експорт вибраних». */
  onExportSelected?: () => void;
  onClear: () => void;
  /** «Вибір зберігається, коли гортаєте сторінки». Default `true`. */
  showKeptHint?: boolean;
  /** Rarely used bulk actions behind «⋯». */
  overflow?: readonly RowActionItem[];
  /** Disable the controls — pass the bulk mutation's `isPending`. */
  isPending?: boolean;
  className?: string;
}

/**
 * The bulk bar v2 (OrdersProposal П1/П2). Unlike `shared/ui/bulk-actions-bar`
 * it is ALWAYS there on a selectable screen: idle it is a dashed hint that
 * teaches what selecting is for, active it carries the count and the actions.
 * A bar that pops in pushes the table down under the cursor at the exact
 * moment the operator ticks a box; a permanent one does not move.
 *
 * The count lives in a `role="status"` region so a screen reader hears each
 * change without the focus leaving the checkbox.
 */
export function RegistryBulkBar({
  selectedCount,
  itemForms,
  idleHint,
  actions,
  onExportSelected,
  onClear,
  showKeptHint = true,
  overflow,
  isPending = false,
  className,
}: RegistryBulkBarProps) {
  const active = selectedCount > 0;
  const summary = active
    ? r.bulkSelected(countLabel(selectedCount, itemForms))
    : "";

  return (
    <div
      data-slot="registry-bulk-bar"
      data-state={active ? "active" : "idle"}
      className={cn(
        "flex min-h-11 flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm",
        active
          ? "border-primary/40 bg-primary/6 text-foreground"
          : "border-dashed text-muted-foreground",
        className,
      )}
    >
      <span role="status" className={active ? "font-semibold" : "sr-only"}>
        {summary}
      </span>
      {active ? (
        <>
          {actions}
          {onExportSelected ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={onExportSelected}
            >
              {r.bulkExportSelected}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={onClear}
          >
            {dict.common.table.clearSelection}
          </Button>
          {overflow && overflow.length > 0 ? (
            <RowActionsMenu label={r.bulkMoreAria} items={overflow} />
          ) : null}
          {showKeptHint ? (
            <span className="ml-auto text-xs text-muted-foreground">
              {r.bulkKeptHint}
            </span>
          ) : null}
        </>
      ) : (
        <span className="flex items-center gap-2">
          <SquareCheckIcon aria-hidden="true" className="size-4 shrink-0" />
          {idleHint}
        </span>
      )}
    </div>
  );
}
