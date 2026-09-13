"use client";

/**
 * TablePagination — the footer row every paginated admin table shares
 * (TASK-423).
 *
 * Seventeen tables had grown their own copy of "Сторінка N з M" plus two
 * buttons, each writing `?page=` slightly differently (one forgot to drop
 * `page=1`, so the first page had two distinct URLs). Extracting it is what makes
 * {@link PageSizeSelect} land everywhere: the size control belongs next to the
 * page controls, and a table that renders this gets both or neither.
 *
 * The `page=1` → absent rule matters more than it looks: it is what makes a
 * freshly-loaded list and a list you paged back to the start of the same URL, so
 * TanStack Query serves one cache entry instead of two.
 */

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { Button } from "../button";
import { PageSizeSelect } from "./page-size-select";

export interface TablePaginationProps {
  /** Current 1-based page. */
  page: number;
  /** Total pages as reported by `meta.totalPages`. */
  totalPages: number;
  /** Current page size — pass `pageSizeFrom(searchParams)`. */
  pageSize: number;
  /** Hide the rows-per-page control (a table whose DTO caps `limit` lower). */
  hidePageSize?: boolean;
  disabled?: boolean;
  className?: string;
}

export function TablePagination({
  page,
  totalPages,
  pageSize,
  hidePageSize = false,
  disabled = false,
  className,
}: TablePaginationProps) {
  const updateParams = useUrlParams();

  /**
   * The page this footer last asked the URL for, or null when the URL is the
   * authority again.
   *
   * `page` arrives from `useSearchParams()`, so it only catches up a render
   * after `updateParams` lands. Two clicks inside that gap both stepped from
   * the same stale number, and the second `router.replace()` overwrote the
   * first with its own value: two clicks on «Далі», one page moved, and nothing
   * on screen to say the second was swallowed.
   *
   * The step is therefore read out of the ref at CLICK time, not out of a
   * render-time `const`. Writing a ref does not re-render, so a render-time
   * value would be exactly as stale as the prop it was meant to replace — the
   * first version of this fix was, and the test below caught it.
   *
   * Cleared by an effect on every change of `page`, not just when it reaches
   * the requested number: anything else that rewrites `?page=` (a search or a
   * filter resetting it to 1) is the URL overruling this footer, and the ref
   * must not outlive that. An effect rather than a render-time guard because
   * `react-hooks/refs` forbids touching a ref during render — and nothing is
   * lost, since the ref is read in a click handler, which cannot run before
   * that effect has flushed.
   */
  const requestedRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    requestedRef.current = null;
  }, [page]);

  /** Step `delta` pages from wherever the last click left us. */
  const step = (delta: number) => {
    const from = requestedRef.current ?? page;
    const target = Math.min(Math.max(from + delta, 1), Math.max(totalPages, 1));
    if (target === from) return;
    requestedRef.current = target;
    updateParams({ page: target <= 1 ? undefined : String(target) });
  };

  return (
    <div
      data-slot="table-pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm text-muted-foreground">
          {dict.common.pageOf(page, totalPages)}
        </p>
        {!hidePageSize && (
          <PageSizeSelect value={pageSize} disabled={disabled} />
        )}
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page <= 1}
          onClick={() => step(-1)}
        >
          {dict.common.previous}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => step(1)}
        >
          {dict.common.next}
        </Button>
      </div>
    </div>
  );
}
