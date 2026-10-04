"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import {
  useAdminListDiscounts,
  type DiscountEntity,
} from "@/entities/discount";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useDiscountStatus } from "@/features/discount-status-toggle";
import {
  Callout,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type QuickView,
  type RowActionItem,
} from "@/shared/ui";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { countLabel } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  buildDiscountColumns,
  copyDiscountCode,
  renderDiscountCard,
} from "./discount-registry-columns";

const d = dict.discounts;

const ALL_VIEW = "all";
const DISABLED_VIEW = "disabled";

const getRowId = (discount: DiscountEntity) => discount.id;
const getRowLabel = (discount: DiscountEntity) => discount.code;
const editHref = (discount: DiscountEntity) => `/discounts/${discount.id}/edit`;

/** One-row requests: the API's own `meta.total` per view. */
const COUNT_QUERY = { page: 1, limit: 1 } as const;

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  const asc = sortOrder === "asc";
  switch (sortBy) {
    case "code":
      return asc ? d.sortCodeAsc : d.sortCodeDesc;
    case "redeemedCount":
      return asc ? d.sortRedeemedAsc : d.sortRedeemedDesc;
    case "expiresAt":
      return asc ? d.sortExpiresAsc : d.sortExpiresDesc;
    default:
      return asc ? d.sortCreatedAsc : d.sortCreatedDesc;
  }
}

/**
 * The promo-code register on the shared registry (wave 198, DiscountsProposal
 * ПК1–ПК2, ПК6–ПК8, TASK-1085).
 *
 * The URL contract grew, nothing was dropped: `?search=`, `?page=`, `?limit=`,
 * `?sortBy=&sortOrder=` (TASK-355) as before, plus `?isActive=false` for the
 * «Вимкнені» view — the one state filter the API has.
 *
 * What moved: the status cell's «Деактивувати» button became «Вимкнути…» in
 * «⋯», behind an AlertDialog that names the consequences (ПК6); the «Редагувати»
 * button became a row click plus «⋯ → Редагувати». New in «⋯»: «Копіювати код»,
 * «Дублювати» (a new draft seeded from this code) and «Увімкнути» — which used
 * to need the edit form. Every write is `discounts:write`, the key the whole
 * admin discount controller requires.
 *
 * Not drawn, because the API does not provide them (TASK-1085 API tails): the
 * date-aware views «Діють · Заплановані · Закінчились» (the list filters by
 * `isActive` only — the badge reads the dates per row, but a view would count
 * and page wrongly), «Замовлення з цим кодом» (the orders list cannot filter by
 * promo code), bulk actions (no bulk endpoint).
 *
 * `LiveAnnouncer` wraps the view — the toolbar confirms a refresh through it
 * (TASK-357).
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
  const updateParams = useUrlParams();
  const { can } = useAuth();
  const canWrite = can(PERM.discountsWrite);
  const status = useDiscountStatus();

  const searchParam = searchParams.get("search") ?? "";
  const isActiveParam = searchParams.get("isActive");
  const isActive =
    isActiveParam === "false"
      ? false
      : isActiveParam === "true"
        ? true
        : undefined;
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, dataUpdatedAt, isLoading, isError, isFetching, refetch } =
    useAdminListDiscounts({
      page,
      limit: pageSize,
      search: searchParam || undefined,
      isActive,
      sortBy,
      sortOrder,
    });
  const allCount = useAdminListDiscounts(COUNT_QUERY);
  const disabledCount = useAdminListDiscounts({
    ...COUNT_QUERY,
    isActive: false,
  });

  const discounts = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const columns = useMemo(
    () => buildDiscountColumns({ now: dataUpdatedAt }),
    [dataUpdatedAt],
  );
  const registry = useDataRegistry({
    tableId: "discounts",
    columns,
    rows: discounts,
    getRowId,
  });

  const rowActions = (discount: DiscountEntity): RowActionItem[] => [
    { label: d.rowEdit, href: editHref(discount) },
    {
      label: d.rowCopyCode,
      onSelect: () => copyDiscountCode(discount.code),
    },
    {
      label: d.rowDuplicate,
      href: `/discounts/new?from=${discount.id}`,
    },
    discount.isActive
      ? {
          label: d.rowDisable,
          onSelect: () => status.requestDeactivate(discount),
          separatorBefore: true,
          disabled: status.isPending,
        }
      : {
          label: d.rowEnable,
          onSelect: () => status.activate(discount),
          separatorBefore: true,
          disabled: status.isPending,
        },
  ];

  const quickViews: QuickView[] = [
    { id: ALL_VIEW, label: d.viewAll, count: allCount.data?.meta?.total },
    {
      id: DISABLED_VIEW,
      label: d.viewDisabled,
      count: disabledCount.data?.meta?.total,
    },
  ];
  const activeView =
    isActive === false ? DISABLED_VIEW : isActive === undefined ? ALL_VIEW : "";

  const refresh = () => {
    void refetch();
    void allCount.refetch();
    void disabledCount.refetch();
  };

  return (
    <div className="flex flex-col gap-4">
      {canWrite ? null : <Callout variant="strip">{d.readOnlyNotice}</Callout>}
      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        quickViews={{
          items: quickViews,
          activeId: activeView,
          onChange: (id) =>
            updateParams({
              isActive: id === DISABLED_VIEW ? "false" : undefined,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        onRefresh={refresh}
        isRefreshing={isFetching}
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        updatedAt={dataUpdatedAt || undefined}
        itemForms={d.itemForms}
        getRowLabel={getRowLabel}
        getRowHref={editHref}
        rowActions={canWrite ? rowActions : undefined}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={(discount, parts) =>
          renderDiscountCard(discount, parts, dataUpdatedAt)
        }
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={d.empty}
        searchQuery={searchParam || undefined}
        isFiltered={isActive !== undefined}
        pagination={{ page, totalPages, pageSize }}
      />
      {status.confirmDialog}
    </div>
  );
}
