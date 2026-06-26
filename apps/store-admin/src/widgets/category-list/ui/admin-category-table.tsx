"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAdminCategoryControllerFindAllWithProductCount } from "@/entities/category";
import { CategoryStatusToggle } from "@/features/category-status-toggle";
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
import { AdminCategoryTableSkeleton } from "./admin-category-table-skeleton";

const PAGE_SIZE = 20;

/**
 * Paginated, searchable category table for the admin panel.
 *
 * Search and page state live in the URL (`?search=`, `?page=`). Parent names are
 * resolved in-memory from the same response page via a `Map<id, name>`. Unlike
 * the storefront, the admin list omits the `isActive` filter so inactive
 * categories are visible too.
 */
export function AdminCategoryTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const { data, isLoading, isError } =
    useAdminCategoryControllerFindAllWithProductCount({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      sortBy: "sortOrder",
      sortOrder: "asc",
    });

  const categories = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const nameById = new Map(
    categories.map((category) => [category.id, category.name]),
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

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleSearchSubmit} className="flex gap-2" role="search">
        <Input
          type="search"
          placeholder={dict.categories.searchPlaceholder}
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          className="max-w-xs"
          aria-label={dict.categories.searchAria}
        />
        <Button type="submit" variant="outline">
          {dict.common.search}
        </Button>
      </form>

      {isLoading ? (
        <AdminCategoryTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.categories.loadError}
        </p>
      ) : categories.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {searchParam
            ? dict.categories.emptyMatch(searchParam)
            : dict.categories.empty}
        </div>
      ) : (
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dict.categories.colName}</TableHead>
                <TableHead>{dict.categories.colSlug}</TableHead>
                <TableHead>{dict.categories.colParent}</TableHead>
                <TableHead>{dict.categories.colProducts}</TableHead>
                <TableHead>{dict.categories.colSort}</TableHead>
                <TableHead>{dict.categories.colStatus}</TableHead>
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.slug}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {category.parentId
                      ? (nameById.get(category.parentId) ?? "—")
                      : dict.categories.root}
                  </TableCell>
                  <TableCell>{category.productCount}</TableCell>
                  <TableCell>{category.sortOrder}</TableCell>
                  <TableCell>
                    <CategoryStatusToggle
                      categoryId={category.id}
                      isActive={category.isActive}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild variant="outline" size="sm">
                      <Link href={`/categories/${category.id}/edit`}>
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

      {!isLoading && !isError && categories.length > 0 && (
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
