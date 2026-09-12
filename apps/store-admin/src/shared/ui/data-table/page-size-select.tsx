"use client";

/**
 * PageSizeSelect — one page size across every admin table (TASK-423).
 *
 * ── What it replaces ────────────────────────────────────────────────────────
 * Three hard-coded constants and no control anywhere: products paged at 10,
 * the audit log at 50, everything else at 20. An operator working a queue could
 * not ask for more rows, and the number they got depended on which screen they
 * were on — so "page 3" meant three different positions in three different lists.
 *
 * 20 is the default everywhere now. 50 and 100 are offered because the two tasks
 * that actually want a long page — reconciling a catalogue import, sweeping a
 * moderation queue — are exactly the ones where paging is the cost.
 *
 * ── Why the cap is 100 and not more ─────────────────────────────────────────
 * Every list DTO on the API allow-lists `limit` with `@Max(100)`. A larger option
 * here would be a 400 the operator reads as a broken screen, so the options are
 * the contract, and {@link pageSizeFrom} clamps anything else back to the
 * default rather than forwarding a hand-edited `?limit=5000`.
 */

import * as React from "react";

import { cn } from "@/shared/lib/utils";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { dict } from "@/shared/config";
import { Label } from "../label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../select";
import { SELECT_PANEL_CLASS } from "./table-filters";

const t = dict.common.table;

/** The page sizes the admin offers. Also the allow-list `?limit=` is clamped to. */
export const PAGE_SIZE_OPTIONS = [20, 50, 100] as const;

/** The size a table uses when the URL says nothing. */
export const DEFAULT_PAGE_SIZE = 20;

/** The query param the page size lives in. */
export const PAGE_SIZE_PARAM = "limit";

/**
 * Read the page size out of the URL, clamped to {@link PAGE_SIZE_OPTIONS}.
 *
 * Pure (not a hook) so a table can call it with its own `useSearchParams()`
 * result and a test can call it with a bare `URLSearchParams`.
 */
export function pageSizeFrom(params: {
  get(name: string): string | null;
}): number {
  const raw = Number(params.get(PAGE_SIZE_PARAM));
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
    ? raw
    : DEFAULT_PAGE_SIZE;
}

export interface PageSizeSelectProps {
  /** Current size — normally `pageSizeFrom(searchParams)`. */
  value: number;
  disabled?: boolean;
  className?: string;
}

export function PageSizeSelect({
  value,
  disabled = false,
  className,
}: PageSizeSelectProps) {
  const updateParams = useUrlParams();
  const id = React.useId();

  return (
    <div
      data-slot="page-size-select"
      className={cn("flex items-center gap-2", className)}
    >
      <Label
        htmlFor={id}
        className="text-sm whitespace-nowrap text-muted-foreground"
      >
        {t.pageSizeLabel}
      </Label>
      <Select
        value={String(value)}
        disabled={disabled}
        onValueChange={(next) =>
          updateParams({
            // The default is the URL-absent shape, so a plain view keeps a clean
            // link rather than carrying `?limit=20` into everything shared.
            [PAGE_SIZE_PARAM]:
              Number(next) === DEFAULT_PAGE_SIZE ? undefined : next,
            // A different page size renumbers the pages — page 7 of 20-row pages
            // is not page 7 of 100-row pages, and would often not exist.
            page: undefined,
          })
        }
      >
        <SelectTrigger id={id} size="sm" className="w-20">
          <SelectValue />
        </SelectTrigger>
        <SelectContent position="popper" className={SELECT_PANEL_CLASS}>
          {PAGE_SIZE_OPTIONS.map((option) => (
            <SelectItem key={option} value={String(option)}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
