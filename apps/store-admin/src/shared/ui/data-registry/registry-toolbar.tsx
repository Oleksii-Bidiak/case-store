"use client";

import * as React from "react";
import { ListFilterIcon, RefreshCwIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { Button } from "../button";
import { TableSearch } from "../data-table/table-search";
import { useAnnouncer } from "../live-announcer";

const r = dict.common.registry;

export interface RegistrySearch {
  /** The committed term (the URL param). */
  value: string;
  /** Names the searched fields: «Номер, ім'я, телефон, email або ТТН…». */
  placeholder: string;
  /** Accessible name — per screen («Пошук замовлень»). */
  label: string;
  /** Query param. Default `search`. */
  param?: string;
  /**
   * Present = LOCAL search (wave 198, block «Контент»): the needle stays in the
   * caller's state and only hides rows — for the unpaginated, drag-reorderable
   * lists where a URL param would imply a server-side narrowing that never
   * happens (see `TableSearch`'s `local` mode). `value` is then the caller's
   * committed needle.
   */
  onChange?: (value: string | undefined) => void;
}

export interface RegistryToolbarProps {
  search: RegistrySearch;
  /** «Фільтри» — present when the screen has a filter sheet. */
  filters?: {
    /** Applied filters = chips on screen. Zero shows no badge. */
    count: number;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  };
  /** The «Колонки» popover (desktop only — it hides itself below md). */
  columnsMenu?: React.ReactNode;
  /** The «Вид» menu. */
  viewsMenu?: React.ReactNode;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  className?: string;
}

/**
 * ONE row, in a fixed order (OrdersProposal П1): search → «Фільтри» →
 * «Колонки» → «Вид» → (space) → refresh. Below md it wraps and the search takes
 * the whole first line.
 */
export function RegistryToolbar({
  search,
  filters,
  columnsMenu,
  viewsMenu,
  onRefresh,
  isRefreshing = false,
  className,
}: RegistryToolbarProps) {
  const { announcePolite } = useAnnouncer();
  // Same contract as TableToolbar: announce when a refresh FINISHED, because a
  // refetch that lands on identical data changes nothing on screen.
  const wasRefreshing = React.useRef(false);
  React.useEffect(() => {
    if (wasRefreshing.current && !isRefreshing) {
      announcePolite(dict.common.table.refreshed);
    }
    wasRefreshing.current = isRefreshing;
  }, [announcePolite, isRefreshing]);

  return (
    <div
      data-slot="registry-toolbar"
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      <TableSearch
        variant="registry"
        value={search.value}
        param={search.param}
        mode={search.onChange ? "local" : "url"}
        onChange={search.onChange}
        placeholder={search.placeholder}
        label={search.label}
        className="basis-full md:max-w-150 md:flex-1 md:basis-auto"
      />
      {filters ? (
        <Button
          type="button"
          variant={filters.open ? "secondary" : "outline"}
          size="sm"
          aria-expanded={filters.open}
          onClick={() => filters.onOpenChange(true)}
        >
          <ListFilterIcon aria-hidden="true" />
          {r.filters}
          {filters.count > 0 ? (
            <>
              <span
                aria-hidden="true"
                className="inline-flex min-w-4.5 justify-center rounded-full bg-primary px-1.25 text-xs leading-4.5 text-primary-foreground tabular-nums"
              >
                {filters.count}
              </span>
              <span className="sr-only">{r.filtersApplied(filters.count)}</span>
            </>
          ) : null}
        </Button>
      ) : null}
      {columnsMenu}
      {viewsMenu}
      {onRefresh ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="ml-auto"
          onClick={onRefresh}
          disabled={isRefreshing}
          aria-label={dict.common.table.refreshAria}
        >
          <RefreshCwIcon
            aria-hidden="true"
            className={cn(
              isRefreshing && "animate-spin motion-reduce:animate-none",
            )}
          />
        </Button>
      ) : null}
    </div>
  );
}
