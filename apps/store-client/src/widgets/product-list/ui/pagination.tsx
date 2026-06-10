"use client";

import Link from "next/link";

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

const itemBase = "rounded-md px-3 py-2 text-sm";

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
      aria-label="Pagination"
      className="flex items-center justify-center gap-1"
    >
      {isFirst ? (
        <span
          aria-disabled="true"
          className={`${itemBase} text-muted-foreground`}
        >
          Previous
        </span>
      ) : (
        <Link
          href={buildHref(currentPage - 1)}
          className={`${itemBase} text-foreground hover:bg-muted`}
        >
          Previous
        </Link>
      )}

      <ul className="flex items-center gap-1">
        {items.map((item, index) =>
          item === "ellipsis" ? (
            <li
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="px-2 text-muted-foreground"
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
                    ? `${itemBase} bg-primary font-medium text-primary-foreground`
                    : `${itemBase} text-foreground hover:bg-muted`
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
          className={`${itemBase} text-muted-foreground`}
        >
          Next
        </span>
      ) : (
        <Link
          href={buildHref(currentPage + 1)}
          className={`${itemBase} text-foreground hover:bg-muted`}
        >
          Next
        </Link>
      )}
    </nav>
  );
}
