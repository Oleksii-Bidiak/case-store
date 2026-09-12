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
          onClick={() =>
            updateParams({ page: page - 1 <= 1 ? undefined : String(page - 1) })
          }
        >
          {dict.common.previous}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || page >= totalPages}
          onClick={() => updateParams({ page: String(page + 1) })}
        >
          {dict.common.next}
        </Button>
      </div>
    </div>
  );
}
