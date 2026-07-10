"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dict } from "@/shared/config";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Build an href for a given page number, preserving all other filters. */
  buildHref: (page: number) => string;
}

/**
 * Compute the page items to display, truncating with ellipses for large
 * page counts: [1] … [cur-1] [cur] [cur+1] … [last].
 */
function getPageItems(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const items: (number | "ellipsis")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);
  if (start > 2) items.push("ellipsis");
  for (let page = start; page <= end; page++) items.push(page);
  if (end < total - 1) items.push("ellipsis");
  items.push(total);
  return items;
}

const arrowBase =
  "inline-flex size-[42px] items-center justify-center rounded-[11px] border-[1.5px] border-border bg-card transition-colors";
const numberBase =
  "inline-flex h-[42px] min-w-[42px] items-center justify-center rounded-[11px] border-[1.5px] px-1.5 font-mono text-sm font-semibold transition-colors";

export function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: PaginationProps) {
  const items = getPageItems(currentPage, totalPages);
  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav
      aria-label={dict.catalog.paginationAria}
      className="flex items-center justify-center gap-2"
    >
      {isFirst ? (
        <span
          aria-disabled="true"
          className={`${arrowBase} pointer-events-none text-muted-foreground/50`}
        >
          <ChevronLeft className="size-[18px]" />
          <span className="sr-only">{dict.catalog.paginationPreviousAria}</span>
        </span>
      ) : (
        <Link
          href={buildHref(currentPage - 1)}
          aria-label={dict.catalog.paginationPreviousAria}
          className={`${arrowBase} text-muted-foreground hover:border-primary hover:text-foreground`}
        >
          <ChevronLeft className="size-[18px]" />
        </Link>
      )}

      <ul className="flex items-center gap-2">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <li
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="px-1 text-muted-foreground"
            >
              …
            </li>
          ) : (
            <li key={item}>
              <Link
                href={buildHref(item)}
                aria-current={item === currentPage ? "page" : undefined}
                className={
                  item === currentPage
                    ? `${numberBase} border-primary bg-primary text-primary-foreground`
                    : `${numberBase} border-border bg-card text-foreground hover:border-primary`
                }
              >
                {item}
              </Link>
            </li>
          ),
        )}
      </ul>

      {isLast ? (
        <span
          aria-disabled="true"
          className={`${arrowBase} pointer-events-none text-muted-foreground/50`}
        >
          <ChevronRight className="size-[18px]" />
          <span className="sr-only">{dict.catalog.paginationNextAria}</span>
        </span>
      ) : (
        <Link
          href={buildHref(currentPage + 1)}
          aria-label={dict.catalog.paginationNextAria}
          className={`${arrowBase} text-foreground hover:border-primary`}
        >
          <ChevronRight className="size-[18px]" />
        </Link>
      )}
    </nav>
  );
}
