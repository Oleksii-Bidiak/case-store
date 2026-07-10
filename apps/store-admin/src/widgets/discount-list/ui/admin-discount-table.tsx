"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  useAdminListDiscounts,
  type DiscountEntity,
} from "@/entities/discount";
import { DiscountStatusToggle } from "@/features/discount-status-toggle";
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
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
 * Paginated, searchable discount table for the admin panel.
 *
 * Search (by code) and page state live in the URL (`?search=`, `?page=`). Shows
 * the redeemed count vs. the global cap and a one-click deactivate action.
 */
export function AdminDiscountTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const { data, isLoading, isError } = useAdminListDiscounts({
    page,
    limit: PAGE_SIZE,
    search: searchParam || undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const discounts = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const updateParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname);
  };

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
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
                <TableHead>{dict.discounts.colCode}</TableHead>
                <TableHead hideOnMobile>{dict.discounts.colType}</TableHead>
                <TableHead>{dict.discounts.colValue}</TableHead>
                <TableHead hideOnMobile>{dict.discounts.colRedeemed}</TableHead>
                <TableHead>{dict.discounts.colExpires}</TableHead>
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
