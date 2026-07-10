"use client";

import * as React from "react";

import { cn } from "@/shared/lib/utils";

/**
 * Table layout mode (TASK-258).
 *
 * - `"scroll"` (default, unchanged): horizontal scroll inside the
 *   `overflow-x-auto` wrapper, table markup untouched at any width.
 * - `"card"`: below `md`, each `TableRow` renders as a bordered block ("card")
 *   and each `TableCell` stacks with its `label` as a left-aligned caption;
 *   at `md` and above, renders as a normal `<table>` (identical to
 *   `"scroll"` mode) — the card transform is a `max-md:` variant only.
 */
type TableLayout = "scroll" | "card";

const TableLayoutContext = React.createContext<TableLayout>("scroll");

interface TableProps extends React.ComponentProps<"table"> {
  /** Layout mode below `md`. Defaults to `"scroll"` (today's behavior). */
  layout?: TableLayout;
}

function Table({ layout = "scroll", className, ...props }: TableProps) {
  return (
    <TableLayoutContext.Provider value={layout}>
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          data-slot="table"
          className={cn(
            "w-full caption-bottom text-sm",
            layout === "card" && "max-md:block",
            className,
          )}
          {...props}
        />
      </div>
    </TableLayoutContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const layout = React.useContext(TableLayoutContext);
  return (
    <thead
      data-slot="table-header"
      className={cn(
        "bg-muted [&_tr]:border-b",
        layout === "card" && "max-md:hidden",
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const layout = React.useContext(TableLayoutContext);
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        "[&_tr:last-child]:border-0",
        layout === "card" && "max-md:block",
        className,
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  const layout = React.useContext(TableLayoutContext);
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-accent has-aria-expanded:bg-accent data-[state=selected]:bg-muted",
        layout === "card" &&
          "max-md:mb-3 max-md:flex max-md:flex-col max-md:gap-0 max-md:rounded-lg max-md:border max-md:border-border max-md:p-4 max-md:shadow-card max-md:last:mb-0",
        className,
      )}
      {...props}
    />
  );
}

interface TableHeadProps extends React.ComponentProps<"th"> {
  /** Hide this column below `md` (works in both layout modes). */
  hideOnMobile?: boolean;
}

function TableHead({ className, hideOnMobile, ...props }: TableHeadProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-10 px-4 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        hideOnMobile && "hidden md:table-cell",
        className,
      )}
      {...props}
    />
  );
}

interface TableCellProps extends React.ComponentProps<"td"> {
  /**
   * Card-mode caption (usually the same dict string as the column's header).
   * Rendered as a `data-label` attribute + `before:` pseudo-element caption,
   * active only when the parent `Table` has `layout="card"`. Ignored in
   * `"scroll"` mode. Cells without a label simply stack uncaptioned.
   */
  label?: string;
  /** Hide this cell below `md` (works in both layout modes). */
  hideOnMobile?: boolean;
}

function TableCell({
  className,
  label,
  hideOnMobile,
  children,
  ...props
}: TableCellProps) {
  const layout = React.useContext(TableLayoutContext);
  const isCard = layout === "card";
  // Screen readers do not announce the CSS `before:content-[attr(data-label)]`
  // caption, so the card-mode label is duplicated as an sr-only text prefix.
  // Skipped for hideOnMobile cells (display:none below md; at md+ the visible
  // column header already provides the association).
  const announceLabel = isCard && !hideOnMobile && label !== undefined;
  return (
    <td
      data-slot="table-cell"
      data-label={isCard ? label : undefined}
      className={cn(
        "px-4 py-3 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        // Card stack treatment — skipped for hideOnMobile cells (they are
        // `display: none` below `md` anyway, and the flex classes would
        // otherwise fight the `hidden` utility in the cascade).
        isCard &&
          !hideOnMobile &&
          "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-3 max-md:border-b max-md:border-border/60 max-md:px-0 max-md:py-1.5 max-md:whitespace-normal max-md:last:border-b-0",
        isCard &&
          !hideOnMobile &&
          label !== undefined &&
          "max-md:before:shrink-0 max-md:before:text-xs max-md:before:font-medium max-md:before:tracking-wide max-md:before:uppercase max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
        hideOnMobile && "hidden md:table-cell",
        className,
      )}
      {...props}
    >
      {announceLabel && <span className="sr-only">{label}: </span>}
      {children}
    </td>
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
};
