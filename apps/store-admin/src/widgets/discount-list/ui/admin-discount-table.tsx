"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useAdminListDiscounts,
  type DiscountEntity,
} from "@/entities/discount";
import { DiscountStatusToggle } from "@/features/discount-status-toggle";
import {
  Button,
  Input,
  LiveAnnouncer,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
} from "@/shared/ui";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { dict } from "@/shared/config";
import { AdminDiscountTableSkeleton } from "./admin-discount-table-skeleton";

const PAGE_SIZE = 20;

/** Format a discount's value cell by type (e.g. "10%" or "₴50.00"). */
function formatValue(discount: DiscountEntity): string {
  return discount.type === "PERCENT"
    ? `${Number(discount.value)}%`
    : `₴${discount.value}`;
}

/** Format the expiry cell (date only, or an em dash when unbounded). */
function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) return dict.discounts.noExpiry;
  return new Date(expiresAt).toLocaleDateString("uk-UA");
}

/**
 * Paginated, searchable, sortable discount table for the admin panel.
 *
 * Search, page and sort state all live in the URL (`?search=`, `?page=`,
 * `?sortBy=&sortOrder=`), so a view survives a refresh and can be pasted to a
 * colleague.
 *
 * The sort is SERVER-side and was already implemented: `DiscountListQueryDto`
 * has accepted `sortBy`/`sortOrder` since TASK-147, but this table hard-coded
 * `createdAt desc` and never offered the control (TASK-355). Only the four keys
 * the DTO's `@IsIn` allows are wired — `code`, `redeemedCount`, `expiresAt` are
 * visible columns; `createdAt` stays the default and has no column of its own.
 *
 * `LiveAnnouncer` wraps the view rather than sitting inside it — the toolbar
 * calls `useAnnouncer()` to confirm a finished refresh, and a hook called in the
 * same component that renders the provider would read the default no-op context.
 * TASK-355 shipped the toolbar here without a provider anywhere in the tree, so
 * the confirmation was dropped silently: the refetch still ran, nothing on screen
 * differed, and only a screen-reader user was left without feedback (TASK-357).
 */
export function AdminDiscountTable() {
  return (
    <LiveAnnouncer>
      <AdminDiscountView />
    </LiveAnnouncer>
  );
}

function AdminDiscountView() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const updateParams = useUrlParams();

  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, isLoading, isError, isFetching, refetch } =
    useAdminListDiscounts({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      sortBy,
      sortOrder,
    });

  const discounts = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <form
            onSubmit={handleSearchSubmit}
            className="flex gap-2"
            role="search"
          >
            <Input
              type="search"
              placeholder={dict.discounts.searchPlaceholder}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="max-w-xs"
              aria-label={dict.discounts.searchAria}
            />
            <Button type="submit" variant="outline">
              {dict.common.search}
            </Button>
          </form>
        }
      />

      {isLoading ? (
        <AdminDiscountTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.discounts.loadError}
        </p>
      ) : discounts.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.discounts.emptyMatch(searchParam)
            : dict.discounts.empty}
        </div>
      ) : (
        <div className="rounded-lg border border-border shadow-card overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableColumnHeader
                  field="code"
                  label={dict.discounts.colCode}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead hideOnMobile>{dict.discounts.colType}</TableHead>
                <TableHead>{dict.discounts.colValue}</TableHead>
                <SortableColumnHeader
                  field="redeemedCount"
                  label={dict.discounts.colRedeemed}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                  hideOnMobile
                />
                <SortableColumnHeader
                  field="expiresAt"
                  label={dict.discounts.colExpires}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead>{dict.discounts.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {discounts.map((discount) => (
                <TableRow key={discount.id}>
                  <TableCell className="font-medium">{discount.code}</TableCell>
                  <TableCell hideOnMobile className="text-muted-foreground">
                    {discount.type === "PERCENT"
                      ? dict.discounts.typePercent
                      : dict.discounts.typeFixed}
                  </TableCell>
                  <TableCell>{formatValue(discount)}</TableCell>
                  <TableCell hideOnMobile>
                    {dict.discounts.redeemedOf(
                      discount.redeemedCount,
                      discount.maxRedemptions,
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatExpiry(discount.expiresAt)}
                  </TableCell>
                  <TableCell>
                    <DiscountStatusToggle
                      discountId={discount.id}
                      isActive={discount.isActive}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/discounts/${discount.id}/edit`}>
                        {dict.common.edit}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && discounts.length > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {dict.common.pageOf(page, totalPages)}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() =>
                updateParams({
                  page: page - 1 <= 1 ? undefined : String(page - 1),
                })
              }
            >
              {dict.common.previous}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateParams({ page: String(page + 1) })}
            >
              {dict.common.next}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
