"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCategoryControllerGetRootCategories } from "@/shared/api";
import { useProductControllerAdminFindAll } from "@/entities/product";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import { ProductStatusToggle } from "@/features/product-status-toggle";
import { useProductBulkStatus } from "@/features/product-bulk-status";
import { ProductDeleteAction } from "@/features/product-delete";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { useRowSelection } from "@/shared/lib/use-row-selection";
import {
  Badge,
  BulkActionsBar,
  Button,
  Checkbox,
  LiveAnnouncer,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableFilters,
  TableHead,
  TableHeader,
  TablePagination,
  TableRow,
  TableSearch,
  TableSelectCell,
  TableSelectHead,
  TableToolbar,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { colorsInUse, formatCurrency, formatDate } from "@/shared/lib";
import { useProductBulkColor } from "../model/use-product-bulk-color";
import { useProductBulkGroup } from "../model/use-product-bulk-group";
import { AdminProductTableSkeleton } from "./admin-product-table-skeleton";
import { MoveToGroupDialog } from "./move-to-group-dialog";
import { SetColorDialog } from "./set-color-dialog";

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
 * TASK-423 took this table's three hand-rolled controls — a search FORM with a
 * «Пошук» button, two bare native `<select>`s, and a page size of 10 — and
 * replaced them with the shared search-as-you-type box, `TableFilters` and
 * `TablePagination`. It also added the third bulk action, «Перемістити до групи»:
 * a variant group means nothing until every position in it points at the same
 * group, so nine positions used to cost nine full form saves with the family
 * half-formed in between.
 *
 * TASK-427 added the three things a catalogue list could not do: open a product
 * without opening its form (the name links to the read-only card), remove one
 * (the row's delete action, behind `products:delete`), and find one that was
 * removed (the «Видалені» filter). The deleted view is read-only by
 * construction — a tombstoned product accepts no write, so its row carries no
 * link, no status toggle, no checkbox and no actions.
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
  // TASK-423: 10 was the lowest page size in the panel and the reason the product
  // list felt like the slowest screen in it. 20 is the one default everywhere now,
  // and `?limit=` lets the operator ask for 50 or 100 when reconciling an import.
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();

  // Column sort lives in the URL (TASK-147); replaces the previously hardcoded
  // createdAt/desc.
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  // TASK-230: the guarded admin listing — includes deactivated products (the
  // public GET /products is active-only now) and bypasses the server cache.
  // TASK-362: status and stock filters live in the URL alongside search/sort, so
  // a restock worklist («приховані», «немає в наявності») is a shareable link
  // rather than a set of clicks the operator repeats every morning.
  const statusParam = searchParams.get("status") ?? "";
  const stockParam = searchParams.get("stock") ?? "";
  // TASK-427: soft-deleted products were unreachable from every admin read —
  // `DELETE` was an action with no way back to its own result. `?deleted=only`
  // swaps the listing over to the tombstones; anything else lists the live
  // products, which is what the operator wants 99 visits out of 100.
  const deletedParam = searchParams.get("deleted") ?? "";
  const isDeletedView = deletedParam === "only";

  const { data, isLoading, isFetching, isError, refetch } =
    useProductControllerAdminFindAll({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      sortBy,
      sortOrder,
      isActive:
        statusParam === "active"
          ? true
          : statusParam === "hidden"
            ? false
            : undefined,
      outOfStock: stockParam === "out" ? true : undefined,
      // Sent only when asked for: the API treats an absent flag as "live
      // products", and the storefront listing ignores it entirely.
      deleted: isDeletedView ? true : undefined,
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

  // TASK-423: the same two filters, declared as data so the chips, the clear-all
  // and the page reset come from the shared control rather than from two
  // hand-rolled native <select>s that had none of them.
  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.products.filterStatus,
      allLabel: dict.products.filterStatusAll,
      options: [
        { value: "active", label: dict.products.filterStatusActive },
        { value: "hidden", label: dict.products.filterStatusHidden },
      ],
    },
    {
      param: "stock",
      label: dict.products.filterStock,
      allLabel: dict.products.filterStockAll,
      options: [{ value: "out", label: dict.products.filterStockOut }],
    },
    // TASK-427. Two values, not three: the API returns the live rows or the
    // tombstones, never a mixed page — `ProductEntity` carries no per-row
    // deleted marker, so a mixed listing could not be read.
    {
      param: "deleted",
      label: dict.products.filterDeleted,
      allLabel: dict.products.filterDeletedAll,
      options: [{ value: "only", label: dict.products.filterDeletedOnly }],
    },
  ];

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

  // ── bulk «Перемістити до групи» (TASK-423 / AD-PROD-33) ───────────────────
  const [isGroupDialogOpen, setGroupDialogOpen] = useState(false);
  // Fetched only once the dialog is open: the group list is of no use to anyone
  // reading the table, and loading it on every visit to /products would be a
  // request per page view for a control most visits never touch.
  const groupsQuery = useProductGroupControllerFindAll(undefined, {
    query: { enabled: isGroupDialogOpen },
  });
  const bulkGroup = useProductBulkGroup({
    onSuccess: () => {
      selection.clear();
      setGroupDialogOpen(false);
    },
  });

  // ── bulk «Задати колір» (TASK-487 / owner decision B-10) ──────────────────
  // Colour is the strongest facet in accessories and the one nobody filled in:
  // it arrives as a variant axis, and the product form edits one position at a
  // time. The endpoint writes both halves — the axis JSON and the `Колір`
  // characteristic the catalogue filters on.
  const [isColorDialogOpen, setColorDialogOpen] = useState(false);
  const bulkColor = useProductBulkColor({
    onSuccess: () => {
      selection.clear();
      setColorDialogOpen(false);
    },
  });

  const selectedIds = [...selection.selectedIds];
  const isMutating =
    bulk.isPending || bulkGroup.isPending || bulkColor.isPending;

  return (
    <div className="flex flex-col gap-4">
      <TableToolbar
        className="mb-0"
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        search={
          <TableSearch
            value={searchParam}
            placeholder={dict.products.searchPlaceholder}
            label={dict.products.searchAria}
          />
        }
        filters={
          <TableFilters
            filters={filters}
            values={{
              status: statusParam,
              stock: stockParam,
              deleted: deletedParam,
            }}
          />
        }
        selectAll={
          products.length > 0 && !isDeletedView ? (
            <Checkbox
              checked={selection.headerChecked}
              onCheckedChange={selection.toggleAll}
              disabled={isMutating}
              aria-label={dict.common.table.selectAll}
            />
          ) : null
        }
      />

      {/* Every bulk action and every row action writes to a product, and a
          tombstoned product accepts no writes at all (`findById` excludes it, so
          activate / move-to-group / edit all 404). The banner says why the row
          actions are missing rather than leaving an operator clicking at
          nothing. */}
      {isDeletedView && (
        <p className="rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
          {dict.products.deletedNotice}
        </p>
      )}

      <BulkActionsBar
        selectedCount={selection.selectedCount}
        isPending={isMutating}
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
          // TASK-423 / AD-PROD-33. Note what is NOT here: a bulk delete. Product
          // deletion is a soft delete that mangles slug and sku, and is not
          // something to hand an operator behind a checkbox column — the API has
          // no bulk form of it for the same reason.
          {
            label: dict.products.bulk.moveToGroup(selection.selectedCount),
            onClick: () => setGroupDialogOpen(true),
          },
          // TASK-487. Sits beside «Перемістити до групи» on purpose: assembling
          // a colour family and giving its positions their colours is one job,
          // and doing the second half one product at a time is why the colour
          // facet was empty everywhere before this.
          {
            label: dict.products.bulk.setColor(selection.selectedCount),
            onClick: () => setColorDialogOpen(true),
          },
        ]}
      />

      <MoveToGroupDialog
        open={isGroupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        selectedCount={selection.selectedCount}
        groups={groupsQuery.data?.data ?? []}
        isLoadingGroups={groupsQuery.isLoading}
        isPending={bulkGroup.isPending}
        onConfirm={(groupId) => bulkGroup.setGroup(selectedIds, groupId)}
      />

      <SetColorDialog
        open={isColorDialogOpen}
        onOpenChange={setColorDialogOpen}
        selectedCount={selection.selectedCount}
        // Suggestions come from the rows already on screen — no second
        // round-trip, and the page the operator is looking at is exactly the
        // neighbourhood whose spelling they should match.
        suggestions={colorsInUse(products)}
        isPending={bulkColor.isPending}
        onConfirm={(color) => bulkColor.setColor(selectedIds, color)}
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
                  disabled={isMutating || isDeletedView}
                  label={dict.common.table.selectAll}
                />
                <TableHead className="w-16">{dict.products.colPhoto}</TableHead>
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
                  hint={dict.products.colStockHint}
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
                    disabled={isMutating || isDeletedView}
                    label={dict.products.bulk.selectRow(product.name)}
                  />
                  {/* Thumbnail + a «без фото» chip (TASK-362). `primaryImage`
                      is already hydrated by the list query's enrichment step, so
                      this costs no extra request — and after a catalogue import,
                      which deliberately brings no photos, this column IS the
                      operator's worklist. */}
                  <TableCell label={dict.products.colPhoto}>
                    {product.primaryImage?.url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- admin thumbnail off arbitrary upload hosts; next/image would need every one allowlisted
                      <img
                        src={product.primaryImage.url}
                        alt=""
                        loading="lazy"
                        className="size-10 rounded border border-border object-cover"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {dict.products.noPhoto}
                      </span>
                    )}
                  </TableCell>
                  <TableCell
                    label={dict.products.colName}
                    className="font-medium"
                  >
                    {/* TASK-427: the name is the way into the read-only card —
                        the one place an operator can LOOK at a product without
                        opening a form full of inputs. A tombstoned product has
                        no card (every by-id read excludes it), so its name is
                        plain text rather than a link to a 404. */}
                    {isDeletedView ? (
                      <span className="block">{product.name}</span>
                    ) : (
                      <Link
                        href={`/products/${product.id}`}
                        className="block hover:text-primary hover:underline"
                      >
                        {product.name}
                      </Link>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {[product.sku, product.brand?.name]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
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
                    {isDeletedView ? (
                      <Badge variant="secondary">
                        {dict.products.deletedBadge}
                      </Badge>
                    ) : (
                      <ProductStatusToggle
                        productId={product.id}
                        isActive={product.isActive}
                      />
                    )}
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
                    {formatDate(product.createdAt)}
                  </TableCell>
                  <TableCell
                    label={dict.common.actions}
                    className="text-right max-md:text-left"
                  >
                    {isDeletedView ? (
                      <span className="text-sm text-muted-foreground">
                        {dict.products.cardEmptyValue}
                      </span>
                    ) : (
                      <span className="inline-flex flex-wrap justify-end gap-2 max-md:justify-start">
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/products/${product.id}/edit`}>
                            {dict.common.edit}
                          </Link>
                        </Button>
                        {/* Renders nothing without `products:delete` — the
                            server guard is the real boundary, this only keeps a
                            manager from meeting a 403 they cannot act on. */}
                        <ProductDeleteAction
                          productId={product.id}
                          name={product.name}
                        />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && !isError && products.length > 0 && (
        <TablePagination
          page={page}
          totalPages={totalPages}
          pageSize={pageSize}
        />
      )}
    </div>
  );
}
