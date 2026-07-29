"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCategoryControllerGetRootCategories } from "@/shared/api";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { ProductStatusToggle } from "@/features/product-status-toggle";
import { useProductBulkStatus } from "@/features/product-bulk-status";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import {
  BulkActionsBar,
  Button,
  Checkbox,
  Input,
  LiveAnnouncer,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSelectCell,
  TableSelectHead,
  TableToolbar,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { AdminProductTableSkeleton } from "./admin-product-table-skeleton";

const PAGE_SIZE = 10;

/**
 * Paginated, searchable, sortable product table for the admin panel.
 *
 * Search, page and sort state live in the URL (`?search=`, `?page=`,
 * `?sortBy=&sortOrder=`) so the view is shareable and survives refreshes. Unlike
 * the public storefront, the admin list omits the `isActive` filter so both
 * active and inactive products show.
 *
 * TASK-355 added the toolbar (with a real refresh control), multi-select and
 * bulk activate/deactivate. The selection is scoped to the page on screen — see
 * `useRowSelection`; rows picked on another page are remembered but never acted
 * on, so the count in the bulk bar is always something the operator can see.
 *
 * `LiveAnnouncer` MUST wrap the table rather than sit inside it — the same split
 * `AdminCategoryTree` and `MessageInbox` make, for the same reason.
 * `useRowSelection` and `useProductBulkStatus` both call `useAnnouncer()`, and a
 * hook called in the very component that renders the provider reads the context
 * from ABOVE it, which is the default no-op. Every selection and bulk-status
 * announcement would be silently dropped, and nothing on screen would look
 * wrong.
 */
export function AdminProductTable() {
  return (
    <LiveAnnouncer>
      <AdminProductTableView />
    </LiveAnnouncer>
  );
}

function AdminProductTableView() {
  const searchParams = useSearchParams();

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  const [searchInput, setSearchInput] = useState(searchParam);

  const updateParams = useUrlParams();

  // Column sort lives in the URL (TASK-147); replaces the previously hardcoded
  // createdAt/desc.
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  // TASK-230: the guarded admin listing — includes deactivated products (the
  // public GET /products is active-only now) and bypasses the server cache.
  const { data, isLoading, isFetching, isError, refetch } =
    useProductControllerAdminFindAll({
      page,
      limit: PAGE_SIZE,
      search: searchParam || undefined,
      sortBy,
      sortOrder,
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

  const handleSearchSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    updateParams({ search: searchInput.trim() || undefined, page: undefined });
  };

  const products = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const selection = useRowSelection({
    rowIds: products.map((product) => product.id),
    getLabel: (id) => productNames.get(id) ?? id,
    messages: {
      selected: dict.common.table.announceSelected,
      deselected: dict.common.table.announceDeselected,
      selectedAll: dict.common.table.announceSelectedAll,
      cleared: dict.common.table.announceCleared,
    },
  });

  const bulk = useProductBulkStatus({ onSuccess: selection.clear });

  const selectedIds = [...selection.selectedIds];

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
        }
        selectAll={
          products.length > 0 ? (
            <Checkbox
              checked={selection.headerChecked}
              onCheckedChange={selection.toggleAll}
              disabled={bulk.isPending}
              aria-label={dict.common.table.selectAll}
            />
          ) : null
        }
      />

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        isPending={bulk.isPending}
        onClear={selection.clear}
        actions={[
          {
            label: dict.products.bulk.activate(selection.selectedCount),
            onClick: () => bulk.setStatus(selectedIds, true),
          },
          {
            label: dict.products.bulk.deactivate(selection.selectedCount),
            onClick: () => bulk.setStatus(selectedIds, false),
          },
        ]}
      />

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
        <div className="relative rounded-lg border border-border shadow-card overflow-hidden">
          {isFetching && !isLoading && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/60"
            >
              <Loader2 className="size-6 animate-spin text-primary" />
            </div>
          )}
          <Table layout="card">
            <TableHeader>
              <TableRow>
                <TableSelectHead
                  checked={selection.headerChecked}
                  onCheckedChange={selection.toggleAll}
                  disabled={bulk.isPending}
                  label={dict.common.table.selectAll}
                />
                <SortableColumnHeader
                  field="name"
                  label={dict.products.colName}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead>{dict.products.colCategory}</TableHead>
                <SortableColumnHeader
                  field="price"
                  label={dict.products.colPrice}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead>{dict.products.colStatus}</TableHead>
                <SortableColumnHeader
                  field="stock"
                  label={dict.products.colStock}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <SortableColumnHeader
                  field="createdAt"
                  label={dict.products.colCreated}
                  sortBy={sortBy}
                  sortOrder={sortOrder}
                  onSort={onSort}
                />
                <TableHead className="text-right">
                  {dict.common.actions}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow
                  key={product.id}
                  rowLabel={product.name}
                  data-state={
                    selection.isSelected(product.id) ? "selected" : undefined
                  }
                >
                  <TableSelectCell
                    checked={selection.isSelected(product.id)}
                    onSelect={({ shiftKey }) =>
                      shiftKey
                        ? selection.extendTo(product.id)
                        : selection.toggle(product.id)
                    }
                    disabled={bulk.isPending}
                    label={dict.products.bulk.selectRow(product.name)}
                  />
                  <TableCell
                    label={dict.products.colName}
                    className="font-medium"
                  >
                    {product.name}
                  </TableCell>
                  <TableCell
                    label={dict.products.colCategory}
                    className="text-muted-foreground"
                  >
                    {categoryNames.get(product.categoryId) ?? "—"}
                  </TableCell>
                  <TableCell label={dict.products.colPrice}>
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell label={dict.products.colStatus}>
                    <ProductStatusToggle
                      productId={product.id}
                      isActive={product.isActive}
                    />
                  </TableCell>
                  <TableCell
                    label={dict.products.colStock}
                    className="tabular-nums"
                  >
                    {/* Single wrapper keeps the compound "free / reserved /
                        physical" display (TASK-254) as one flex item in the
                        card cell's justify-between row. */}
                    <span>
                      <span className="font-medium text-foreground">
                        {product.stock}
                      </span>
                      <span className="text-muted-foreground">
                        {" / "}
                        {product.reservedQty}
                        {" / "}
                        {product.physicalQty}
                      </span>
                    </span>
                  </TableCell>
                  <TableCell
                    label={dict.products.colCreated}
                    className="text-muted-foreground"
                  >
                    {new Date(product.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell
                    label={dict.common.actions}
                    className="text-right max-md:text-left"
                  >
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
