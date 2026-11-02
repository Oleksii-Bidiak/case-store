"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { TableHead } from "./table";
import { LabelTooltip } from "./tooltip";

interface SortableColumnHeaderProps {
  /** Backend sort key (e.g. "createdAt"). */
  field: string;
  /** Visible column label. */
  label: string;
  /** Current active sort field from the URL. */
  sortBy?: string;
  sortOrder?: "asc" | "desc";
  /** Called with this column's `field` on click (wire to `useTableSort.onSort`). */
  onSort: (field: string) => void;
  /**
   * One sentence saying what the column's numbers mean (TASK-408). Surfaced as a
   * tooltip on hover and keyboard focus and, for assistive tech, as the sort
   * button's `aria-describedby` — a DESCRIPTION, never part of the button's
   * accessible name, which has to stay "Сортувати за …".
   */
  hint?: string;
  /**
   * Also show `hint` as the sort button's tooltip (a Radix tooltip since
   * TASK-1978; the prop name predates it, when it was the native `title`).
   * Default `true`; pass `false` when the header draws its own tooltip (wave
   * 198), so two tooltips do not stack on hover. The description for assistive
   * tech stays.
   */
  hintAsTitle?: boolean;
  /** Hide this column below `md` (forwarded to the underlying `TableHead`). */
  hideOnMobile?: boolean;
  className?: string;
  /**
   * What the button shows instead of the plain `label` — e.g. the label plus
   * an info tooltip (wave 198). The accessible name stays «Сортувати за: label».
   */
  content?: ReactNode;
  /** Extra attributes for the `<th>` (width style, data attributes). */
  headProps?: Omit<ComponentProps<"th">, "children" | "className">;
  /** Classes for the sort button (the registry pads it like its cells). */
  buttonClassName?: string;
  /** Rendered after the button inside the `<th>` — a resize handle. */
  children?: ReactNode;
}

/**
 * SortableColumnHeader — a dumb, accessible sortable `<th>` (TASK-147).
 *
 * Renders the column label as a `<button>` with an asc/desc/none chevron and
 * sets `aria-sort` on the header. No URL or data knowledge — it only reports
 * clicks via `onSort`; the table's `useTableSort` owns the state.
 */
export function SortableColumnHeader({
  field,
  label,
  sortBy,
  sortOrder,
  onSort,
  hint,
  hintAsTitle = true,
  hideOnMobile,
  className,
  content,
  headProps,
  buttonClassName,
  children,
}: SortableColumnHeaderProps) {
  const hintId = useId();
  const isActive = sortBy === field;
  const ariaSort = isActive
    ? sortOrder === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const Icon = !isActive
    ? ChevronsUpDownIcon
    : sortOrder === "asc"
      ? ChevronUpIcon
      : ChevronDownIcon;

  const sortButton = (
    <button
      type="button"
      onClick={() => onSort(field)}
      aria-label={dict.common.sortByAria(label)}
      aria-describedby={hint ? hintId : undefined}
      className={cn(
        "flex w-full items-center gap-1 px-4 py-2 text-left font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        buttonClassName,
      )}
    >
      <span>{content ?? label}</span>
      <Icon
        className={cn("size-4 shrink-0", !isActive && "opacity-40")}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <TableHead
      {...headProps}
      aria-sort={ariaSort}
      hideOnMobile={hideOnMobile}
      className={cn("p-0", className)}
    >
      {hint && hintAsTitle ? (
        // TASK-1978: a Radix tooltip (hover AND keyboard focus) instead of
        // the native `title`, which focus never showed.
        <LabelTooltip label={hint}>{sortButton}</LabelTooltip>
      ) : (
        sortButton
      )}
      {hint ? (
        <span id={hintId} className="sr-only">
          {hint}
        </span>
      ) : null}
      {children}
    </TableHead>
  );
}
