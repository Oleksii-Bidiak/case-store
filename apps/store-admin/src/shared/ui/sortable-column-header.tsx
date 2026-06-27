"use client";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
} from "lucide-react";

import { cn } from "@/shared/lib/utils";
import { dict } from "@/shared/config";
import { TableHead } from "./table";

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
  className?: string;
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
  className,
}: SortableColumnHeaderProps) {
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

  return (
    <TableHead aria-sort={ariaSort} className={cn("p-0", className)}>
      <button
        type="button"
        onClick={() => onSort(field)}
        aria-label={dict.common.sortByAria(label)}
        className="flex w-full items-center gap-1 px-2 py-2 text-left font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <span>{label}</span>
        <Icon
          className={cn("size-4 shrink-0", !isActive && "opacity-40")}
          aria-hidden="true"
        />
      </button>
    </TableHead>
  );
}
