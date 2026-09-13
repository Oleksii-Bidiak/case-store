"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dict } from "@/shared/config";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  /** Build an href for a given page number, preserving all other filters. */
  buildHref: (page: number) => string;
  /**
   * Accessible name for the `<nav>`. Defaults to the shared «Навігація
   * сторінками», which is what every paged listing wants; pass one only where a
   * page carries two separate paginations that must be told apart.
   */
  ariaLabel?: string;
  /** Extra classes for the `<nav>` (spacing is the caller's business). */
  className?: string;
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

/**
 * The storefront's ONE numbered pagination (TASK-417).
 *
 * It used to live in `widgets/product-list`, which is why `/search` grew its own
 * bare prev/next pair and the blog hub a "load more" link: three listings, three
 * different controls, three different keyboard and screen-reader behaviours. It
 * is a dumb shared primitive — links only, no data access, no router — so every
 * paged listing renders the same control, and a caller supplies the hrefs.
 *
 * Navigation is `<Link>`-based on purpose: a page is addressable, shareable and
 * crawlable, and prev/next carry `rel` so crawlers read the sequence. The
 * current page is marked `aria-current="page"`; the disabled ends stay in the
 * DOM as inert `<span>`s so the control does not change width at the edges.
 */
export function Pagination({
  currentPage,
  totalPages,
  buildHref,
  ariaLabel,
  className,
}: PaginationProps) {
  const items = getPageItems(currentPage, totalPages);
  const isFirst = currentPage <= 1;
  const isLast = currentPage >= totalPages;

  return (
    <nav
      aria-label={ariaLabel ?? dict.catalog.paginationAria}
      className={`flex items-center justify-center gap-2${className ? ` ${className}` : ""}`}
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
          rel="prev"
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
          rel="next"
          aria-label={dict.catalog.paginationNextAria}
          className={`${arrowBase} text-foreground hover:border-primary`}
        >
          <ChevronRight className="size-[18px]" />
        </Link>
      )}
    </nav>
  );
}
