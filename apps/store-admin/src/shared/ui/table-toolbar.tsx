"use client";

import * as React from "react";
import { RefreshCwIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "./button";
import { useAnnouncer } from "./live-announcer";

const t = dict.common.table;

/**
 * TableToolbar — the one row above an admin table: search, filters, refresh
 * (TASK-353).
 *
 * ── Why a refresh button exists at all ───────────────────────────────────────
 * `app/providers.tsx` pins `staleTime` to five minutes for every admin query.
 * TanStack Query's `refetchOnWindowFocus` defaults to `true`, but a focus
 * refetch is a no-op while the data is still fresh — so for five minutes an
 * admin table shows what it showed when you opened it, and before TASK-353
 * there was no control anywhere in store-admin to force otherwise. Two operators
 * on the same order queue would silently disagree about what was in it.
 *
 * ── What this button is NOT ──────────────────────────────────────────────────
 * It is not a substitute for cache invalidation. A mutation that forgets to
 * invalidate its key is a bug, and a refresh button hides that bug: the operator
 * presses it, the data corrects itself, and nobody learns. Keep invalidating on
 * mutation; this is for changes made somewhere else — another operator, a
 * webhook, a cron.
 */

export interface TableToolbarProps {
  /** Search input. Rendered first and allowed to grow. */
  search?: React.ReactNode;
  /** Filter controls (Selects, Tabs). Rendered after search. */
  filters?: React.ReactNode;
  /**
   * Mirror of the select-all checkbox for card-mode viewports.
   *
   * The header cell that normally carries select-all lives in `<thead>`, which
   * card mode hides below `md`. Without this slot an operator on a phone could
   * select rows one by one but never select the page. Rendered `md:hidden`, so
   * on a desktop the header checkbox stays the only one.
   */
  selectAll?: React.ReactNode;
  /** Called when the operator asks for fresh data. Usually a `refetch`. */
  onRefresh?: () => void;
  /** Drives the spinner and disables the button. Pass the query's `isFetching`. */
  isRefreshing?: boolean;
  /** Extra controls pinned to the right (e.g. "Створити", export). */
  actions?: React.ReactNode;
  className?: string;
}

export function TableToolbar({
  search,
  filters,
  selectAll,
  onRefresh,
  isRefreshing = false,
  actions,
  className,
}: TableToolbarProps) {
  const { announcePolite } = useAnnouncer();
  // A refetch that lands on identical data changes nothing on screen, so the
  // press would otherwise be silent for a screen-reader user. Announce on the
  // falling edge of `isRefreshing` — i.e. when it actually finished, not when
  // it was asked for.
  const wasRefreshing = React.useRef(false);
  React.useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) announcePolite(t.refreshed);
    wasRefreshing.current = isRefreshing;
  }, [announcePolite, isRefreshing]);

  return (
    <div
      data-slot="table-toolbar"
      className={cn(
        "mb-4 flex flex-wrap items-center gap-2 md:flex-nowrap",
        className,
      )}
    >
      {search ? <div className="min-w-0 flex-1">{search}</div> : null}
      {filters}
      {selectAll ? (
        <div className="flex items-center gap-2 md:hidden">{selectAll}</div>
      ) : null}
      <div className="ml-auto flex items-center gap-2">
        {actions}
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label={t.refreshAria}
          >
            <RefreshCwIcon
              className={cn("size-4", isRefreshing && "animate-spin")}
              aria-hidden="true"
            />
            <span className="max-sm:sr-only">
              {isRefreshing ? t.refreshing : t.refresh}
            </span>
          </Button>
        ) : null}
      </div>
    </div>
  );
}
