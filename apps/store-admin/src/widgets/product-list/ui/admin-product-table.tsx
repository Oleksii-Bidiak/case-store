"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCategoryControllerGetRootCategories } from "@/shared/api";
import { useProductControllerFindAll } from "@/entities/product";
import { ProductStatusToggle } from "@/features/product-status-toggle";
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
import { AdminProductTableSkeleton } from "./admin-product-table-skeleton";

const PAGE_SIZE = 10;

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/**
 * Paginated, searchable product table for the admin panel.
 *
 * Search and page state live in the URL (`?search=`, `?page=`) so the view is
 * shareable and survives refreshes. Unlike the public storefront, the admin
 * list omits the `isActive` filter so both active and inactive products show.
 */
export function AdminProductTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const { data, isLoading, isError } = useProductControllerFindAll({
    page,
    limit: PAGE_SIZE,
    search: searchParam || undefined,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  const categoriesQuery = useCategoryControllerGetRootCategories({
    limit: 100,
  });
  const categoryNames = new Map(
    (categoriesQuery.data?.data ?? []).map((category) => [
      category.id,
      category.name,
    ]),
  );

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

  const products = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
        <Input
          type="search"
          placeholder={dict.products.searchPlaceholder}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="max-w-xs"
          aria-label={dict.products.searchAria}
        />
        <Button type="submit" variant="outline">
          {dict.common.search}
        </Button>
      </form>

      {isLoading ? (
        <AdminProductTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.products.loadError}
        </p>
      ) : products.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.products.emptyMatch(searchParam)
            : dict.products.empty}
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.products.colName}</TableHead>
                <TableHead>{dict.products.colCategory}</TableHead>
                <TableHead>{dict.products.colPrice}</TableHead>
                <TableHead>{dict.products.colStatus}</TableHead>
                <TableHead>{dict.products.colCreated}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryNames.get(product.categoryId) ?? "—"}
                  </TableCell>
                  <TableCell>
                    {priceFormatter.format(Number(product.price))}
                  </TableCell>
                  <TableCell>
                    <ProductStatusToggle
                      productId={product.id}
                      isActive={product.isActive}
                    />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(product.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/products/${product.id}/edit`}>
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

      {!isLoading && !isError && products.length > 0 && (
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
