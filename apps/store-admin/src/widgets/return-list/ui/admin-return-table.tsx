"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  returnStatusBadgeVariant,
  returnStatusLabel,
  useAdminReturnControllerFindAll,
  type AdminReturnControllerFindAllParams,
  type ReturnEntity,
} from "@/entities/return";
import { OrderNumber, formatOrderNumber } from "@/entities/order";
import { returnedValueOf } from "@/features/return-resolve";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import { toast } from "@/shared/ui/toast";
import {
  Badge,
  DataRegistry,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type RegistryCardParts,
  type RegistryColumn,
  type RowActionItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { countLabel, formatCurrency, formatDate } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import {
  ALL_VIEW,
  RETURN_QUICK_VIEWS,
  activeReturnView,
  returnAge,
  returnUnits,
} from "../model/return-views";
import { ReturnFilterSheet } from "./return-filter-sheet";

const d = dict.returns;

/* ── Reading a row ──────────────────────────────────────────────────────── */

const returnHref = (rma: ReturnEntity) => `/returns/${rma.id}`;
const orderHref = (rma: ReturnEntity) => `/orders/${rma.orderId}`;
const rowLabel = (rma: ReturnEntity) => d.rowAria(formatOrderNumber(rma.id));
const getRowId = (rma: ReturnEntity) => rma.id;

/** What the goods coming back are worth — `null` when a line has no price. */
function goodsValue(rma: ReturnEntity): string | null {
  return returnedValueOf(rma.items);
}

function copy(value: string, success: string) {
  const write = navigator.clipboard?.writeText(value);
  if (!write) {
    toast.error(d.copyFailed);
    return;
  }
  write.then(
    () => toast.success(success),
    () => toast.error(d.copyFailed),
  );
}

function sortLabel(sortBy: string, sortOrder: "asc" | "desc"): string {
  const asc = sortOrder === "asc";
  if (sortBy === "status") return asc ? d.sortStatusAsc : d.sortStatusDesc;
  if (sortBy === "refundedAmount") {
    return asc ? d.sortRefundedAsc : d.sortRefundedDesc;
  }
  return asc ? d.sortRequestedAsc : d.sortRequestedDesc;
}

/* ── Cells ──────────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={returnStatusBadgeVariant(status)}>
      {returnStatusLabel(status)}
    </Badge>
  );
}

function AgeLine({ rma, now }: { rma: ReturnEntity; now: number }) {
  const age = returnAge(rma, now);
  if (!age) return null;
  return (
    <span
      className={cn(
        "text-xs",
        age.tone === "warning"
          ? "font-medium text-warning"
          : "text-muted-foreground",
      )}
    >
      {age.label}
    </span>
  );
}

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the «⋯» column and the box border (no checkbox column — no bulk actions).
 */
export const RETURN_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

/**
 * Columns of the register (ReturnsProposal Р1). Sortable only where the API
 * sorts (`requestedAt`, `status`, `refundedAmount`).
 *
 * «Клієнт» from the artboard is not drawn: a return row carries no customer —
 * only `orderId` (TASK-1056's API tail). «Повернуто» stays its own column
 * rather than a second line under «Сума», because it is the one the list sorts
 * money by.
 */
export function buildReturnColumns(
  now: number,
): RegistryColumn<ReturnEntity>[] {
  return [
    {
      id: "number",
      label: d.colReturn,
      locked: true,
      rowLink: true,
      defaultWidth: 104,
      minWidth: 96,
      cell: (rma) => <OrderNumber id={rma.id} />,
    },
    {
      id: "order",
      label: d.colOrder,
      defaultWidth: 112,
      minWidth: 96,
      cell: (rma) => (
        <Link
          href={orderHref(rma)}
          className="rounded-xs text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <OrderNumber id={rma.orderId} />
        </Link>
      ),
    },
    {
      id: "reason",
      label: d.colReason,
      defaultWidth: 260,
      minWidth: 140,
      cell: (rma) =>
        rma.reason ? (
          <span className="line-clamp-2 text-foreground">{rma.reason}</span>
        ) : (
          <span className="text-muted-foreground">{d.noReason}</span>
        ),
    },
    {
      id: "units",
      label: d.colItems,
      align: "end",
      defaultWidth: 56,
      minWidth: 48,
      className: "tabular-nums",
      cell: (rma) => returnUnits(rma),
    },
    {
      id: "amount",
      label: d.colAmount,
      align: "end",
      defaultWidth: 112,
      className: "font-medium tabular-nums",
      cell: (rma) => {
        const value = goodsValue(rma);
        return value === null ? "—" : formatCurrency(value);
      },
    },
    {
      id: "refunded",
      label: d.colRefunded,
      sortField: "refundedAmount",
      align: "end",
      defaultWidth: 112,
      className: "tabular-nums",
      // Null is not zero: "nothing has been refunded yet" and "we refunded
      // 0 ₴" are different facts. Sorting keeps them apart too — the
      // repository pushes NULLs last in both directions.
      cell: (rma) =>
        rma.refundedAmount === null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          formatCurrency(rma.refundedAmount)
        ),
    },
    {
      id: "status",
      label: d.colStatus,
      sortField: "status",
      defaultWidth: 160,
      minWidth: 120,
      cell: (rma) => <StatusBadge status={rma.status} />,
    },
    {
      id: "requested",
      label: d.colRequested,
      sortField: "requestedAt",
      defaultWidth: 160,
      minWidth: 120,
      cell: (rma) => (
        <span className="flex flex-col gap-0.5">
          <span className="text-foreground tabular-nums">
            {formatDate(rma.requestedAt)}
          </span>
          <AgeLine rma={rma} now={now} />
        </span>
      ),
    },
  ];
}

/** One return below md (ReturnsProposal Р2). */
function renderCard(rma: ReturnEntity, parts: RegistryCardParts, now: number) {
  const value = goodsValue(rma);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {parts.href ? (
          <Link
            href={parts.href}
            className="rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <OrderNumber id={rma.id} />
          </Link>
        ) : (
          <OrderNumber id={rma.id} />
        )}
        <StatusBadge status={rma.status} />
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 min-w-0 text-sm text-foreground">
          {rma.reason ?? d.noReason}
        </span>
        <b className="shrink-0 font-semibold text-foreground tabular-nums">
          {value === null ? "—" : formatCurrency(value)}
        </b>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{d.units(returnUnits(rma))}</span>
        <AgeLine rma={rma} now={now} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDate(rma.requestedAt)} · {formatOrderNumber(rma.orderId)}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}

/**
 * The returns queue (TASK-340) on the shared registry (wave 198, TASK-1056,
 * ReturnsProposal Р1/Р2/Р6).
 *
 * The URL contract is unchanged — `?status=`, `?search=`, sort, page and size —
 * so the dashboard tile and any pasted link land where they did. What moved,
 * nothing removed: the status select became quick views by stage (and a pill
 * group in «Фільтри»), «Переглянути» became a row click plus «⋯ → Відкрити»,
 * the truncated `abcd1234…` ids became the shared «#ABCD1234» (TASK-1038),
 * «Позиції» (lines) became «Шт.» (units).
 *
 * The default sort (`requestedAt` desc) is sent explicitly: it matches the DTO
 * default, and omitting it would make "no param" and "the default param" two
 * cache entries for the same page. `createdAt`, the shared default, does not
 * exist on this endpoint and would come back a 400 from the `@IsIn` guard.
 *
 * Not drawn, because the API does not provide them (TASK-1056's API tails):
 * the customer and phone, per-status counts on the views, the refunded total
 * in the summary, an export.
 */
export function AdminReturnTable() {
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status") ?? "";
  const searchParam = searchParams.get("search") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
    "requestedAt",
  );

  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useAdminReturnControllerFindAll(
      {
        page,
        limit: pageSize,
        search: searchParam || undefined,
        status:
          (statusParam as AdminReturnControllerFindAllParams["status"]) ||
          undefined,
        sortBy,
        sortOrder,
      },
      // A returns queue is worked by whoever is on shift; a five-minute-old view
      // means two operators refunding the same request.
      { query: OPERATIONAL_LIST_QUERY },
    );

  const returns = useMemo(() => data?.data ?? [], [data]);
  const total = data?.meta?.total ?? 0;
  const totalPages = data?.meta?.totalPages ?? 1;

  const columns = useMemo(
    () => buildReturnColumns(dataUpdatedAt),
    [dataUpdatedAt],
  );
  const registry = useDataRegistry({
    tableId: "returns",
    columns,
    rows: returns,
    getRowId,
  });

  const rowActions = (rma: ReturnEntity): RowActionItem[] => {
    const href = returnHref(rma);
    const number = formatOrderNumber(rma.id);
    return [
      { label: d.rowOpen, href },
      { label: d.rowOpenNewTab, href, newTab: true },
      {
        label: d.rowCopyNumber,
        onSelect: () => copy(number, d.copiedNumber(number)),
      },
      { label: d.rowOpenOrder, href: orderHref(rma), separatorBefore: true },
    ];
  };

  // Every status is a quick view, so a status never needs a chip — the lit
  // view already says it. An unknown deep-linked one still filters the list.
  const statusView = activeReturnView(statusParam);

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        showHeader={false}
        quickViews={{
          items: RETURN_QUICK_VIEWS,
          activeId: statusView,
          onChange: (id) =>
            updateParams({
              status: id === ALL_VIEW ? undefined : id,
              page: undefined,
            }),
        }}
        search={{
          value: searchParam,
          placeholder: d.searchPlaceholder,
          label: d.searchAria,
        }}
        filters={{
          count: statusParam && !statusView ? 1 : 0,
          renderSheet: ({ open, onOpenChange }) => (
            <ReturnFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={{ status: statusParam }}
              onApply={(next) =>
                updateParams({
                  status: next.status || undefined,
                  page: undefined,
                })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => void refetch()}
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
        itemForms={d.itemForms}
        getRowLabel={rowLabel}
        getRowHref={returnHref}
        rowActions={rowActions}
        sort={{ sortBy, sortOrder, onSort }}
        renderCard={(rma, parts) => renderCard(rma, parts, dataUpdatedAt)}
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={
          statusParam ? d.emptyStatus(returnStatusLabel(statusParam)) : d.empty
        }
        searchQuery={searchParam || undefined}
        pagination={{ page, totalPages, pageSize }}
      />
    </LiveAnnouncer>
  );
}
