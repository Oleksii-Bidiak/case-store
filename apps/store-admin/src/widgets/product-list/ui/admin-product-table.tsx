"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  categoryNamesById,
  useCategoryControllerGetAdminTree,
  useCategoryControllerGetCategoryTree,
} from "@/entities/category";
import { PERM } from "@/entities/permission";
import {
  useProductControllerAdminFindAll,
  type ProductEntity,
} from "@/entities/product";
import { useProductGroupControllerFindAll } from "@/entities/product-group";
import { useAuth } from "@/entities/session";
import { useProductStatusSetter } from "@/features/product-status-toggle";
import { useProductBulkStatus } from "@/features/product-bulk-status";
import { useProductBulkColor } from "@/features/product-bulk-color";
import { useProductBulkGroup } from "@/features/product-bulk-group";
import { useProductBulkUndo } from "@/features/product-bulk-undo";
import { ProductDeleteAction } from "@/features/product-delete";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { toast } from "@/shared/ui/toast";
import {
  Button,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  treeComboboxItems,
  useDataRegistry,
  type FilterChip,
  type RowActionItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { colorsInUse, countLabel } from "@/shared/lib";
import { MoveToGroupDialog } from "./move-to-group-dialog";
import { SetColorDialog } from "./set-color-dialog";
import {
  EMPTY_PRODUCT_FILTERS,
  ProductFilterSheet,
  useProductFilterBrands,
  useProductFilterDevices,
  type ProductFilters,
} from "./product-filter-sheet";
import { productColumns, renderProductCard } from "./product-registry-columns";

const d = dict.products;
const t = d.bulk;

/* ── quick views ────────────────────────────────────────────────────────── */

type ViewId = "all" | "active" | "hidden" | "out" | "deleted";

/**
 * Each quick view is a PRESET of the three URL params the old selects wrote
 * (`status`, `stock`, `deleted`), so every link shared before wave 198 —
 * `?status=hidden`, `?stock=out`, `?deleted=only` — still opens the same list,
 * now with its view highlighted.
 */
const VIEW_PARAMS: Record<
  ViewId,
  { status?: string; stock?: string; deleted?: string }
> = {
  all: {},
  active: { status: "active" },
  hidden: { status: "hidden" },
  out: { stock: "out" },
  deleted: { deleted: "only" },
};

const VIEW_ORDER: readonly ViewId[] = [
  "all",
  "active",
  "hidden",
  "out",
  "deleted",
];

function viewOf(status: string, stock: string, deleted: string): ViewId | "" {
  for (const id of VIEW_ORDER) {
    const preset = VIEW_PARAMS[id];
    if (
      (preset.status ?? "") === status &&
      (preset.stock ?? "") === stock &&
      (preset.deleted ?? "") === deleted
    ) {
      return id;
    }
  }
  return "";
}

/** The listing filter each quick view stands for — for its counter. */
const VIEW_QUERY: Record<
  ViewId,
  { isActive?: boolean; outOfStock?: boolean; deleted?: boolean }
> = {
  all: {},
  active: { isActive: true },
  hidden: { isActive: false },
  out: { outOfStock: true },
  deleted: { deleted: true },
};

/**
 * The counters on the quick views: the API's own `meta.total` of a one-row
 * request per view — never a number derived from the page on screen. They
 * count the whole catalogue (like the artboard's «Усі 178» next to «Знайдено
 * 12»), so they answer "how big is each worklist", not "how many match".
 */
function useViewCount(view: ViewId) {
  return useProductControllerAdminFindAll({
    page: 1,
    limit: 1,
    ...VIEW_QUERY[view],
  });
}

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  const asc = sortOrder === "asc";
  switch (sortBy) {
    case "name":
      return asc ? d.sortNameAsc : d.sortNameDesc;
    case "price":
      return asc ? d.sortPriceAsc : d.sortPriceDesc;
    case "stock":
      return asc ? d.sortStockAsc : d.sortStockDesc;
    default:
      return asc ? d.sortCreatedAsc : d.sortCreatedDesc;
  }
}

const digitsOnly = (value: string | null) =>
  value && /^\d+$/.test(value) ? value : "";

/**
 * The product list on the shared registry (wave 198, TASK-1048,
 * ProductsProposal Т1–Т7). What moved where, so nothing the old table did is
 * lost:
 *
 * - the three selects (status, stock, deleted) → the quick views AND the
 *   «Фільтри» sheet, writing the very same URL params;
 * - the per-row status toggle → a read-only «Показується / Приховано» badge and
 *   «⋯ → Показати / Приховати» (`products:write`, TASK-1323);
 * - «Редагувати» and «Видалити» → «⋯» (`products:write` / `products:delete`);
 * - the bulk bar → the registry's permanent bar (TASK-838) with the same four
 *   actions; the persistent «Скасувати останню масову дію» (TASK-837) → the
 *   bar's «⋯», plus a «Скасувати» toast after every bulk write;
 * - «Створено» and its sort → «Колонки» (hidden by default; «Оновлено» shows).
 *
 * Every bulk endpoint — and so the undo — needs `products:write`. Without it
 * there is no checkbox column, no bulk bar and no «Додати товар» (Т6).
 *
 * The selection survives paging (registry rule). The undo snapshot therefore
 * reads every row the operator has SEEN this visit, not just the page on
 * screen — a product picked on page 1 and acted on from page 2 still gets its
 * previous value back.
 *
 * `LiveAnnouncer` wraps the view: the bulk hooks announce through
 * `useAnnouncer()`, which must run BELOW the provider.
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
  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );
  const { can } = useAuth();
  const canWrite = can(PERM.productsWrite);
  const canDelete = can(PERM.productsDelete);

  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);
  const statusParam = searchParams.get("status") ?? "";
  const stockParam = searchParams.get("stock") ?? "";
  const deletedParam = searchParams.get("deleted") ?? "";
  const isDeletedView = deletedParam === "only";
  const categoryParam = searchParams.get("categoryId") ?? "";
  const brandParam = searchParams.get("brandId") ?? "";
  const deviceParam = searchParams.get("deviceModelId") ?? "";
  const minPriceParam = digitsOnly(searchParams.get("minPrice"));
  const maxPriceParam = digitsOnly(searchParams.get("maxPrice"));

  const { data, isLoading, isFetching, isError, refetch, dataUpdatedAt } =
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
      inStock: stockParam === "in" ? true : undefined,
      // Sent only when asked for: an absent flag means "live products".
      deleted: isDeletedView ? true : undefined,
      categoryId: categoryParam || undefined,
      brandId: brandParam || undefined,
      deviceModelId: deviceParam || undefined,
      minPrice: minPriceParam ? Number(minPriceParam) : undefined,
      maxPrice: maxPriceParam ? Number(maxPriceParam) : undefined,
    });

  const viewCounts = {
    all: useViewCount("all"),
    active: useViewCount("active"),
    hidden: useViewCount("hidden"),
    out: useViewCount("out"),
    deleted: useViewCount("deleted"),
  };

  // TASK-717: the category of a product is a LEAF, often three levels down, so
  // names come from the whole tree — the admin tree for a `categories:write`
  // holder, the public (active-only, levels 1–4) tree otherwise.
  const canReadAdminTree = can(PERM.categoriesWrite);
  const adminTreeQuery = useCategoryControllerGetAdminTree({
    query: { enabled: canReadAdminTree },
  });
  const publicTreeQuery = useCategoryControllerGetCategoryTree({
    query: { enabled: !canReadAdminTree },
  });
  const tree = canReadAdminTree
    ? adminTreeQuery.data?.data
    : publicTreeQuery.data?.data;
  const categoryNames = useMemo(() => categoryNamesById(tree), [tree]);
  const categoryItems = useMemo(() => treeComboboxItems(tree), [tree]);

  // Names for the brand / device chips — asked only while such a filter is
  // applied. The sheet reads the same two lists (same cache entries) on open.
  const brandsQuery = useProductFilterBrands(Boolean(brandParam));
  const devicesQuery = useProductFilterDevices(Boolean(deviceParam));

  const products = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total;
  const totalPages = data?.meta?.totalPages ?? 1;

  const columns = useMemo(
    () => productColumns({ isDeletedView, categoryNames }),
    [categoryNames, isDeletedView],
  );

  const filterKey = [
    searchParam,
    statusParam,
    stockParam,
    deletedParam,
    categoryParam,
    brandParam,
    deviceParam,
    minPriceParam,
    maxPriceParam,
  ].join("|");

  const registry = useDataRegistry({
    tableId: "products",
    columns,
    rows: products,
    getRowId: getProductId,
    selectionResetKey: filterKey,
  });
  const { selection } = registry;

  // Every row seen this visit, for the undo snapshot (see the doc comment).
  const seenRows = useRef(new Map<string, ProductEntity>());
  useEffect(() => {
    for (const product of products) seenRows.current.set(product.id, product);
  }, [products]);

  /* ── bulk writes + undo ────────────────────────────────────────────── */

  const bulkUndo = useProductBulkUndo();
  const undoToastId = useRef<string | number | null>(null);
  const pendingStatus = useRef<boolean>(true);
  const latestUndo = useRef({ run: bulkUndo.undo, available: false });

  /** Commit the prepared undo and offer it in a toast, naming what changed. */
  const offerUndo = (message: (label: string) => string) => {
    const count = bulkUndo.commit();
    if (count === null) return;
    undoToastId.current = toast.undo(message(countLabel(count, d.itemForms)), {
      onUndo: () => {
        // Read at CLICK time: the toast outlives renders, and a used-up or
        // superseded offer must not replay a stale snapshot.
        const latest = latestUndo.current;
        if (latest.available) latest.run();
      },
    });
  };

  const bulk = useProductBulkStatus({
    onSuccess: () => {
      selection.clear();
      offerUndo(pendingStatus.current ? d.toastShown : d.toastHidden);
    },
  });

  const [isGroupDialogOpen, setGroupDialogOpen] = useState(false);
  // Fetched only once the dialog is open (TASK-423).
  const groupsQuery = useProductGroupControllerFindAll(undefined, {
    query: { enabled: isGroupDialogOpen },
  });
  const bulkGroup = useProductBulkGroup({
    onSuccess: () => {
      selection.clear();
      setGroupDialogOpen(false);
      offerUndo(d.toastGrouped);
    },
  });

  const [isColorDialogOpen, setColorDialogOpen] = useState(false);
  const bulkColor = useProductBulkColor({
    onSuccess: () => {
      selection.clear();
      setColorDialogOpen(false);
      offerUndo(d.toastColored);
    },
  });

  const isMutating =
    bulk.isPending ||
    bulkGroup.isPending ||
    bulkColor.isPending ||
    bulkUndo.isPending;
  // An undo replayed while a newer forward write is in flight would land first
  // and let that write commit an offer that can never be reached (TASK-837).
  const undoAvailable = bulkUndo.canUndo && !isMutating;
  useEffect(() => {
    latestUndo.current = { run: bulkUndo.undo, available: undoAvailable };
  });

  const runUndo = useCallback(() => {
    if (undoToastId.current !== null) toast.dismiss(undoToastId.current);
    bulkUndo.undo();
  }, [bulkUndo]);

  const selectedIds = () => [...selection.selectedIds];
  const snapshotRows = (ids: readonly string[]) =>
    ids
      .map((id) => seenRows.current.get(id))
      .filter((row): row is ProductEntity => row !== undefined);

  const setStatus = (isActive: boolean) => {
    const ids = selectedIds();
    pendingStatus.current = isActive;
    bulkUndo.prepare("status", ids, snapshotRows(ids), isActive);
    bulk.setStatus(ids, isActive);
  };

  /* ── row actions ───────────────────────────────────────────────────── */

  const statusSetter = useProductStatusSetter();
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const rowActions = (product: ProductEntity): RowActionItem[] => {
    const items: RowActionItem[] = [
      { label: d.rowOpen, href: `/products/${product.id}` },
    ];
    if (canWrite) {
      items.push({
        label: dict.common.edit,
        href: `/products/${product.id}/edit`,
      });
    }
    items.push({
      label: d.rowPreview,
      href: `/products/preview/${product.slug}`,
      newTab: true,
    });
    if (canWrite) {
      items.push({
        label: product.isActive
          ? dict.statusToggle.productDeactivate
          : dict.statusToggle.productActivate,
        onSelect: () => statusSetter.setActive(product.id, !product.isActive),
        disabled: statusSetter.isPending,
        separatorBefore: true,
      });
    }
    if (canDelete) {
      items.push({
        label: d.rowDelete,
        onSelect: () => setDeleteTarget({ id: product.id, name: product.name }),
        destructive: true,
        separatorBefore: !canWrite,
      });
    }
    return items;
  };

  /* ── filters, chips ────────────────────────────────────────────────── */

  const activeView = viewOf(statusParam, stockParam, deletedParam);

  const applied: ProductFilters = {
    status: isDeletedView
      ? "deleted"
      : statusParam === "active" || statusParam === "hidden"
        ? statusParam
        : "",
    stock: stockParam === "in" || stockParam === "out" ? stockParam : "",
    categoryId: categoryParam,
    brandId: brandParam,
    minPrice: minPriceParam,
    maxPrice: maxPriceParam,
    deviceModelId: deviceParam,
  };

  const clear = (...keys: string[]) =>
    updateParams(
      Object.fromEntries([...keys, "page"].map((key) => [key, undefined])),
    );

  const chips: FilterChip[] = [];
  // A combination a quick view already shows needs no chip as well.
  if (!activeView) {
    if (applied.status && applied.status !== "deleted") {
      chips.push({
        key: "status",
        label: d.chipStatus(
          applied.status === "active"
            ? d.filterStatusActive
            : d.filterStatusHidden,
        ),
        onRemove: () => clear("status"),
      });
    }
    if (isDeletedView) {
      chips.push({
        key: "deleted",
        label: d.chipStatus(d.filterDeleted),
        onRemove: () => clear("deleted"),
      });
    }
    if (applied.stock) {
      chips.push({
        key: "stock",
        label: d.chipStock(
          applied.stock === "in" ? d.filterStockIn : d.filterStockOut,
        ),
        onRemove: () => clear("stock"),
      });
    }
  }
  if (categoryParam) {
    chips.push({
      key: "category",
      label: d.chipCategory(
        categoryNames.get(categoryParam) ?? d.cardEmptyValue,
      ),
      onRemove: () => clear("categoryId"),
    });
  }
  if (brandParam) {
    chips.push({
      key: "brand",
      label: d.chipBrand(
        brandsQuery.brands.find((brand) => brand.id === brandParam)?.name ??
          d.cardEmptyValue,
      ),
      onRemove: () => clear("brandId"),
    });
  }
  if (minPriceParam || maxPriceParam) {
    chips.push({
      key: "price",
      label: d.chipPrice(minPriceParam, maxPriceParam),
      onRemove: () => clear("minPrice", "maxPrice"),
    });
  }
  if (deviceParam) {
    chips.push({
      key: "device",
      label: d.chipDevice(
        devicesQuery.items.find((item) => item.value === deviceParam)?.label ??
          d.cardEmptyValue,
      ),
      onRemove: () => clear("deviceModelId"),
    });
  }

  const isFiltered = Boolean(
    statusParam ||
    stockParam ||
    categoryParam ||
    brandParam ||
    deviceParam ||
    minPriceParam ||
    maxPriceParam,
  );

  const viewItems = VIEW_ORDER.map((id) => ({
    id,
    label:
      id === "all"
        ? d.viewAll
        : id === "active"
          ? d.viewActive
          : id === "hidden"
            ? d.viewHidden
            : id === "out"
              ? d.viewOut
              : d.filterDeleted,
    count: viewCounts[id].data?.meta?.total,
  }));

  const refreshAll = () => {
    void refetch();
    for (const id of VIEW_ORDER) void viewCounts[id].refetch();
  };

  const selectable = canWrite && !isDeletedView;

  return (
    <>
      <DataRegistry
        registry={registry}
        title={d.heading}
        description={isDeletedView ? d.deletedNotice : undefined}
        headerActions={
          canWrite ? (
            <Button asChild>
              <Link href="/products/new">{d.add}</Link>
            </Button>
          ) : null
        }
        quickViews={{
          items: viewItems,
          activeId: activeView,
          onChange: (id) => {
            const preset = VIEW_PARAMS[id as ViewId];
            updateParams({
              status: preset.status,
              stock: preset.stock,
              deleted: preset.deleted,
              page: undefined,
            });
          },
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: chips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <ProductFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={applied}
              categories={categoryItems}
              onApply={(next) =>
                updateParams({
                  status:
                    next.status === "active" || next.status === "hidden"
                      ? next.status
                      : undefined,
                  deleted: next.status === "deleted" ? "only" : undefined,
                  stock: next.stock || undefined,
                  categoryId: next.categoryId || undefined,
                  brandId: next.brandId || undefined,
                  deviceModelId: next.deviceModelId || undefined,
                  minPrice: next.minPrice || undefined,
                  maxPrice: next.maxPrice || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={refreshAll}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            ...Object.fromEntries(
              Object.keys(EMPTY_PRODUCT_FILTERS).map((key) => [key, undefined]),
            ),
            status: undefined,
            stock: undefined,
            deleted: undefined,
            page: undefined,
          })
        }
        summary={
          total === undefined ? null : (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          )
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        updatedAt={dataUpdatedAt || undefined}
        itemForms={d.itemForms}
        getRowLabel={getProductName}
        getRowHref={
          isDeletedView ? undefined : (product) => `/products/${product.id}`
        }
        rowActions={isDeletedView ? undefined : rowActions}
        sort={{ sortBy, sortOrder, onSort }}
        totals
        renderCard={renderProductCard}
        selectable={selectable}
        bulk={{
          idleHint: d.bulkIdleHint,
          isPending: isMutating,
          overflowWhenIdle: true,
          overflow: [
            {
              label: t.undo,
              onSelect: runUndo,
              disabled: !undoAvailable,
            },
          ],
          actions: (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={() => setStatus(true)}
              >
                {d.bulkShow}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={() => setStatus(false)}
              >
                {d.bulkHide}
              </Button>
              {/* No bulk delete, on purpose: a soft delete frees slug and
                  артикул, and the API has no bulk form of it either. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={() => setGroupDialogOpen(true)}
              >
                {d.bulkGroup}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={() => setColorDialogOpen(true)}
              >
                {d.bulkColor}
              </Button>
            </>
          ),
        }}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={d.empty}
        searchQuery={searchParam || undefined}
        isFiltered={isFiltered}
        pagination={{ page, totalPages, pageSize }}
      />

      {/* TASK-812: the hide / clear-colour AlertDialogs (portalled). */}
      {bulk.confirmDialog}
      {bulkColor.confirmDialog}

      <MoveToGroupDialog
        open={isGroupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        selectedCount={selection.selectedCount}
        groups={groupsQuery.data?.data ?? []}
        isLoadingGroups={groupsQuery.isLoading}
        isPending={bulkGroup.isPending}
        onConfirm={(groupId) => {
          const ids = selectedIds();
          bulkUndo.prepare("group", ids, snapshotRows(ids), groupId);
          bulkGroup.setGroup(ids, groupId);
        }}
      />

      <SetColorDialog
        open={isColorDialogOpen}
        onOpenChange={setColorDialogOpen}
        selectedCount={selection.selectedCount}
        // Suggestions come from the rows on screen — the neighbourhood whose
        // spelling the operator should match.
        suggestions={colorsInUse(products)}
        isPending={bulkColor.isPending}
        onConfirm={(color) => {
          const ids = selectedIds();
          bulkUndo.prepare("color", ids, snapshotRows(ids), color);
          bulkColor.setColor(ids, color);
        }}
      />

      {deleteTarget ? (
        <ProductDeleteAction
          productId={deleteTarget.id}
          name={deleteTarget.name}
          open
          onOpenChange={(open) => {
            if (!open) setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
  );
}

function getProductId(product: ProductEntity): string {
  return product.id;
}

function getProductName(product: ProductEntity): string {
  return product.name;
}
