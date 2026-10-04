"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LoaderCircleIcon } from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { countLabel, type PluralForms } from "@/shared/lib/plural";
import { useMediaQuery } from "@/shared/lib/use-media-query";
import { dict } from "@/shared/config";
import { Checkbox } from "../checkbox";
import { ErrorState } from "../error-state";
import { SortableColumnHeader } from "../sortable-column-header";
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "../table";
import type { RegistryDensity } from "./registry-settings-store";
import type { RegistrySelection } from "./use-registry-selection";
import {
  DEFAULT_MIN_COLUMN_WIDTH,
  type RegistryColumn,
} from "./use-data-registry";
import { RowActionsMenu, type RowActionItem } from "./row-actions-menu";

const r = dict.common.registry;

/** Mirror of Tailwind's `max-md:` — below it the caller's cards replace rows. */
export const REGISTRY_CARD_QUERY = "(max-width: 47.999rem)";

/** Arrow-key step of a resize handle; Shift multiplies it by five. */
const RESIZE_STEP = 10;

/**
 * Clicks on these never open the row: they are controls with their own job.
 * Checked against the click target and only within the row itself.
 */
const INTERACTIVE =
  "a,button,input,select,textarea,label,[role=checkbox],[role=menuitem],[role=separator],[data-registry-interactive]";

export interface RegistryCardParts {
  /** The row's «⋯» menu, or `null`. */
  actions: React.ReactNode;
  /** The row's selection checkbox, or `null`. */
  select: React.ReactNode;
  href?: string;
}

export interface RegistrySort {
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  onSort: (field: string) => void;
}

export interface RegistryTableProps<T> {
  /** Accessible name of the table / card list — usually the screen title. */
  label: string;
  /** Visible columns, in display order. */
  columns: readonly RegistryColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Names the record: selection checkbox, card group, default «⋯» label. */
  getRowLabel: (row: T) => string;
  /** Makes the row open the record. Rendered as a real link (`rowLink`). */
  getRowHref?: (row: T) => string | undefined;
  /** Effective width per column id. */
  widths: Readonly<Record<string, number>>;
  onResize?: (id: string, width: number) => void;
  density?: RegistryDensity;
  /** Present = selectable. */
  selection?: RegistrySelection;
  rowActions?: (row: T) => readonly RowActionItem[];
  rowActionsLabel?: (row: T) => string;
  sort?: RegistrySort;
  /** Adds the «Разом на сторінці» row; columns supply `footer`. */
  totals?: boolean;
  itemForms: PluralForms;
  /** Below md: the caller's card instead of a row. */
  renderCard?: (row: T, parts: RegistryCardParts) => React.ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  errorMessage?: React.ReactNode;
  onRetry?: () => void;
  isRetrying?: boolean;
  /** Dims the rows under a spinner — pass `isFetching && !isLoading`. */
  isRefetching?: boolean;
  /** «Замовлень ще немає» — nothing exists yet. */
  emptyState: React.ReactNode;
  /** The search term, when one is applied: «Нічого не знайдено за запитом…». */
  searchQuery?: string;
  /** Filters (not a search) emptied the list. */
  isFiltered?: boolean;
  className?: string;
}

const cellPadding: Record<RegistryDensity, string> = {
  comfortable: "px-2 py-2.5",
  compact: "px-3 py-1.25",
};

/**
 * The registry's table (OrdersProposal П1–П3б, П7).
 *
 * ── Layout ──────────────────────────────────────────────────────────────────
 * `table-fixed` with an explicit width per column: the widths the operator
 * drags are then exactly the widths painted (an auto layout widens a column to
 * its longest cell and ignores the handle). The table is at least as wide as
 * its box and scrolls sideways past it. The header is sticky inside a box
 * capped at the viewport height — sticky needs the scroll container to be the
 * box, since a sideways-scrolling box is a scroll container anyway.
 *
 * ── The row opens the record ────────────────────────────────────────────────
 * The `rowLink` column carries a real `<a>` (keyboard, middle-click, «open in
 * new tab»); a click anywhere else on the row navigates too, Ctrl/⌘/Shift-click
 * and a middle click open a new tab. Controls inside the row — the checkbox,
 * «⋯», inner links, the resize handle — keep their own job, and so do clicks
 * that bubble out of a menu portalled from the row.
 */
export function RegistryTable<T>({
  label,
  columns,
  rows,
  getRowId,
  getRowLabel,
  getRowHref,
  widths,
  onResize,
  density = "comfortable",
  selection,
  rowActions,
  rowActionsLabel,
  sort,
  totals = false,
  itemForms,
  renderCard,
  isLoading = false,
  isError = false,
  errorMessage,
  onRetry,
  isRetrying = false,
  isRefetching = false,
  emptyState,
  searchQuery,
  isFiltered = false,
  className,
}: RegistryTableProps<T>) {
  const router = useRouter();
  const isMobile = useMediaQuery(renderCard ? REGISTRY_CARD_QUERY : null);
  const [live, setLive] = React.useState<{ id: string; width: number } | null>(
    null,
  );

  const widthOf = (id: string) =>
    live?.id === id ? live.width : (widths[id] ?? DEFAULT_MIN_COLUMN_WIDTH);
  const hasActions = Boolean(rowActions);
  const pad = cellPadding[density];

  const open = (event: React.MouseEvent<HTMLElement>, href?: string) => {
    if (!href) return;
    const row = event.currentTarget;
    const target = event.target as Element;
    // Bubbled out of a portal (a menu opened from this row): not a row click.
    if (!row.contains(target)) return;
    const control = target.closest(INTERACTIVE);
    if (control && row.contains(control)) return;
    // Selecting text in a cell is not an intent to open the record.
    if (window.getSelection?.()?.toString()) return;
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.button === 1
    ) {
      window.open(href, "_blank", "noopener");
      return;
    }
    router.push(href);
  };

  const onAux = (event: React.MouseEvent<HTMLElement>, href?: string) => {
    if (event.button !== 1) return;
    open(event, href);
  };

  const selectControl = (row: T) => {
    if (!selection) return null;
    const id = getRowId(row);
    return (
      <Checkbox
        checked={selection.isSelected(id)}
        onCheckedChange={() => selection.toggle(id)}
        aria-label={r.selectRowAria(getRowLabel(row))}
      />
    );
  };

  const actionsControl = (row: T) => {
    if (!rowActions) return null;
    return (
      <RowActionsMenu
        label={rowActionsLabel?.(row) ?? r.rowActionsAria(getRowLabel(row))}
        items={rowActions(row)}
      />
    );
  };

  /* ── states ─────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <RegistrySkeleton
        label={label}
        columns={columns}
        widthOf={widthOf}
        selectable={Boolean(selection)}
        hasActions={hasActions}
        className={className}
      />
    );
  }

  if (isError && rows.length === 0) {
    return (
      <ErrorState
        variant="card"
        message={errorMessage}
        onRetry={onRetry}
        isRetrying={isRetrying}
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    const message = searchQuery
      ? r.noResults(searchQuery)
      : isFiltered
        ? dict.common.table.emptyFiltered
        : emptyState;
    return (
      <div
        data-slot="registry-empty"
        className={cn(
          "rounded-lg border px-6 py-10 text-center text-sm text-muted-foreground",
          className,
        )}
      >
        {message}
      </div>
    );
  }

  const overlay = isRefetching ? (
    <div
      data-slot="registry-refetch"
      aria-hidden="true"
      className="absolute inset-0 z-10 flex items-center justify-center bg-background/60"
    >
      <LoaderCircleIcon className="size-6 animate-spin text-primary motion-reduce:animate-none" />
    </div>
  ) : null;

  /* ── cards (below md) ───────────────────────────────────────────────── */

  if (isMobile && renderCard) {
    return (
      <div
        className={cn("relative", className)}
        aria-busy={isRefetching || undefined}
      >
        <ul aria-label={label} className="flex flex-col gap-3">
          {rows.map((row) => {
            const href = getRowHref?.(row);
            return (
              <li
                key={getRowId(row)}
                aria-label={getRowLabel(row)}
                onClick={(event) => open(event, href)}
                onAuxClick={(event) => onAux(event, href)}
                className={cn(
                  "rounded-lg border bg-card p-3 shadow-card",
                  href && "cursor-pointer",
                  selection?.isSelected(getRowId(row)) &&
                    "border-primary/40 bg-primary/7",
                )}
              >
                {renderCard(row, {
                  actions: actionsControl(row),
                  select: selectControl(row),
                  href,
                })}
              </li>
            );
          })}
        </ul>
        {overlay}
      </div>
    );
  }

  /* ── table ──────────────────────────────────────────────────────────── */

  const tableWidth =
    columns.reduce((sum, column) => sum + widthOf(column.id), 0) +
    (selection ? 36 : 0) +
    (hasActions ? 44 : 0);

  // The totals label spans from the first column up to the first one that
  // has a footer of its own.
  const firstFooter = columns.findIndex((column) => column.footer);
  const labelSpan = Math.max(
    1,
    firstFooter === -1 ? columns.length : firstFooter,
  );

  return (
    <div
      data-slot="registry-table"
      aria-busy={isRefetching || undefined}
      className={cn(
        "relative max-h-svh overflow-auto rounded-lg border shadow-card",
        className,
      )}
    >
      <table
        aria-label={label}
        data-density={density}
        className="min-w-full table-fixed caption-bottom border-collapse text-sm"
        style={{ width: tableWidth }}
      >
        <colgroup>
          {selection ? <col className="w-9" /> : null}
          {columns.map((column) => (
            <col key={column.id} style={{ width: widthOf(column.id) }} />
          ))}
          {hasActions ? <col className="w-11" /> : null}
        </colgroup>
        <TableHeader className="sticky top-0 z-2 bg-muted">
          <TableRow className="hover:bg-transparent">
            {selection ? (
              <TableHead className="w-9 pr-0 pl-2">
                <Checkbox
                  checked={selection.pageChecked}
                  onCheckedChange={selection.togglePage}
                  aria-label={dict.common.table.selectAll}
                />
              </TableHead>
            ) : null}
            {columns.map((column) => {
              const width = widthOf(column.id);
              const handle =
                onResize && column.resizable !== false ? (
                  <ResizeHandle
                    label={column.label}
                    width={width}
                    minWidth={column.minWidth ?? DEFAULT_MIN_COLUMN_WIDTH}
                    onLive={(next) =>
                      setLive(
                        next === null ? null : { id: column.id, width: next },
                      )
                    }
                    onCommit={(next) => onResize(column.id, next)}
                  />
                ) : null;
              const headProps = {
                "data-column-id": column.id,
                style: { width },
              } as React.ComponentProps<"th">;
              const align =
                column.align === "end" ? "justify-end text-right" : "";
              if (sort && column.sortField) {
                return (
                  <SortableColumnHeader
                    key={column.id}
                    field={column.sortField}
                    label={column.label}
                    content={column.header}
                    hint={column.sortHint}
                    hintAsTitle={column.sortHintAsTitle}
                    sortBy={sort.sortBy}
                    sortOrder={sort.sortOrder}
                    onSort={sort.onSort}
                    hideOnMobile={column.hideOnMobile}
                    headProps={headProps}
                    className="relative"
                    buttonClassName={cn("h-10 px-2 py-2", align)}
                  >
                    {handle}
                  </SortableColumnHeader>
                );
              }
              return (
                <TableHead
                  key={column.id}
                  {...headProps}
                  hideOnMobile={column.hideOnMobile}
                  className={cn(
                    "relative h-10 px-2",
                    column.align === "end" && "text-right",
                  )}
                >
                  {column.header ?? column.label}
                  {handle}
                </TableHead>
              );
            })}
            {hasActions ? <TableHead className="w-11 px-0" /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const id = getRowId(row);
            const href = getRowHref?.(row);
            const selected = selection?.isSelected(id) ?? false;
            return (
              <TableRow
                key={id}
                data-state={selected ? "selected" : undefined}
                onClick={(event) => open(event, href)}
                onAuxClick={(event) => onAux(event, href)}
                className={cn(
                  "hover:bg-muted/50 data-[state=selected]:bg-primary/7",
                  href && "cursor-pointer",
                )}
              >
                {selection ? (
                  <td className={cn("w-9 pr-0 pl-2 align-top", pad)}>
                    {selectControl(row)}
                  </td>
                ) : null}
                {columns.map((column) => (
                  <TableCell
                    key={column.id}
                    data-column-id={column.id}
                    hideOnMobile={column.hideOnMobile}
                    className={cn(
                      "overflow-hidden align-top break-words whitespace-normal",
                      pad,
                      column.align === "end" && "text-right",
                      column.className,
                    )}
                  >
                    {column.rowLink && href ? (
                      <Link
                        href={href}
                        className="rounded-xs outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {column.cell(row)}
                      </Link>
                    ) : (
                      column.cell(row)
                    )}
                  </TableCell>
                ))}
                {hasActions ? (
                  <td className="w-11 py-1 pr-1.5 pl-0 text-right align-top">
                    {actionsControl(row)}
                  </td>
                ) : null}
              </TableRow>
            );
          })}
        </TableBody>
        {totals ? (
          <TableFooter className="hidden border-t-2 bg-muted font-semibold md:table-footer-group">
            <TableRow className="hover:bg-transparent">
              {selection ? <td /> : null}
              <td colSpan={labelSpan} className="px-3 py-2.5 whitespace-nowrap">
                {r.totalsOnPage(countLabel(rows.length, itemForms))}
              </td>
              {columns.slice(labelSpan).map((column) => (
                <td
                  key={column.id}
                  className={cn(
                    "px-2 py-2.5 whitespace-nowrap tabular-nums",
                    column.align === "end" && "text-right",
                  )}
                >
                  {column.footer?.(rows)}
                </td>
              ))}
              {hasActions ? <td /> : null}
            </TableRow>
          </TableFooter>
        ) : null}
      </table>
      {overlay}
    </div>
  );
}

/* ── resize handle ──────────────────────────────────────────────────────── */

interface ResizeHandleProps {
  label: string;
  width: number;
  minWidth: number;
  /** The width while dragging (`null` when the drag ends). */
  onLive: (width: number | null) => void;
  onCommit: (width: number) => void;
}

/**
 * The right edge of a header cell. A 1 px line, 3 px primary while hovered or
 * dragged, with «N px» beside it during a drag. Keyboard: it is a focusable
 * `separator` with `aria-valuenow`; ←/→ change the width by 10 px (Shift: 50),
 * Home goes to the column's floor.
 */
function ResizeHandle({
  label,
  width,
  minWidth,
  onLive,
  onCommit,
}: ResizeHandleProps) {
  const [drag, setDrag] = React.useState<{
    startX: number;
    startWidth: number;
    current: number;
  } | null>(null);

  const clamp = (value: number) => Math.max(minWidth, Math.round(value));

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={r.resizeColumnAria(label)}
      aria-valuenow={drag?.current ?? width}
      aria-valuemin={minWidth}
      tabIndex={0}
      data-state={drag ? "dragging" : undefined}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setDrag({ startX: event.clientX, startWidth: width, current: width });
        onLive(width);
      }}
      onPointerMove={(event) => {
        if (!drag) return;
        const next = clamp(drag.startWidth + event.clientX - drag.startX);
        if (next === drag.current) return;
        setDrag({ ...drag, current: next });
        onLive(next);
      }}
      onPointerUp={(event) => {
        if (!drag) return;
        event.currentTarget.releasePointerCapture?.(event.pointerId);
        // Against the START width: during a drag `width` is already the live
        // one, so comparing with it would never commit.
        const { current: next, startWidth } = drag;
        setDrag(null);
        onLive(null);
        if (next !== startWidth) onCommit(next);
      }}
      onPointerCancel={() => {
        setDrag(null);
        onLive(null);
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? RESIZE_STEP * 5 : RESIZE_STEP;
        let next: number | null = null;
        if (event.key === "ArrowRight") next = width + step;
        else if (event.key === "ArrowLeft") next = width - step;
        else if (event.key === "Home") next = minWidth;
        if (next === null) return;
        event.preventDefault();
        const clamped = clamp(next);
        if (clamped !== width) onCommit(clamped);
      }}
      className="group/resize absolute inset-y-0 -right-1 z-1 flex w-2 cursor-col-resize touch-none justify-center outline-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          "my-2 w-px bg-muted-foreground/45 transition-all group-hover/resize:my-0 group-hover/resize:w-0.75 group-hover/resize:bg-primary group-focus-visible/resize:my-0 group-focus-visible/resize:w-0.75 group-focus-visible/resize:bg-primary motion-reduce:transition-none",
          drag && "my-0 w-0.75 bg-primary",
        )}
      />
      {drag ? (
        <span className="absolute top-1.5 right-2.5 z-5 rounded-sm bg-foreground px-2 text-xs leading-4.5 font-medium whitespace-nowrap text-background">
          {r.widthPx(drag.current)}
        </span>
      ) : null}
    </div>
  );
}

/* ── skeleton ───────────────────────────────────────────────────────────── */

function RegistrySkeleton<T>({
  label,
  columns,
  widthOf,
  selectable,
  hasActions,
  className,
}: {
  label: string;
  columns: readonly RegistryColumn<T>[];
  widthOf: (id: string) => number;
  selectable: boolean;
  hasActions: boolean;
  className?: string;
}) {
  const bar =
    "h-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none";
  const hide = (column: RegistryColumn<T>) =>
    column.hideOnMobile ? "hidden md:table-cell" : undefined;
  return (
    <div
      data-slot="registry-skeleton"
      aria-busy="true"
      className={cn("overflow-hidden rounded-lg border shadow-card", className)}
    >
      <span role="status" className="sr-only">
        {dict.common.loading}
      </span>
      <table aria-label={label} className="w-full table-fixed text-sm">
        <thead className="bg-muted">
          <tr className="border-b">
            {selectable ? <th className="w-9" /> : null}
            {columns.map((column) => (
              <th
                key={column.id}
                className={cn("h-10 px-2 text-left font-medium", hide(column))}
                style={{ width: widthOf(column.id) }}
              >
                {column.label}
              </th>
            ))}
            {hasActions ? <th className="w-11" /> : null}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 5 }, (_, index) => (
            <tr key={index} className="border-b last:border-0">
              {selectable ? (
                <td className="px-2 py-3">
                  <div className="size-4 animate-pulse rounded-sm bg-muted motion-reduce:animate-none" />
                </td>
              ) : null}
              {columns.map((column) => (
                <td key={column.id} className={cn("px-2 py-3", hide(column))}>
                  <div className={bar} />
                </td>
              ))}
              {hasActions ? <td /> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
