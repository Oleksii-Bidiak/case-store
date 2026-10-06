"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { toast } from "@/shared/ui/toast";
import {
  OrderEntityStatus,
  OrderNumber,
  deliveryMethodLabel,
  deliverySnapshot,
  formatOrderNumber,
  isShippingCostPending,
  orderDeliveryMethod,
  orderDerivedMarks,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindAll,
  type OrderEntity,
} from "@/entities/order";
// The CSV endpoint is not part of what `@/entities/order` re-exports, and that
// barrel is another wave's file. A widget may read `@/shared` directly (the
// product list already does).
import { adminOrderControllerExport } from "@/shared/api";
import {
  useGetDeliverySettings,
  useListAdminPickupPoints,
} from "@/entities/delivery";
import { PERM } from "@/entities/permission";
import { useAuth } from "@/entities/session";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import {
  Badge,
  Button,
  DataRegistry,
  ExportMenu,
  LiveAnnouncer,
  SummaryValue,
  pageSizeFrom,
  useDataRegistry,
  type FilterChip,
  type RegistryCardParts,
  type RegistryColumn,
  type RowActionItem,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import {
  countLabel,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatTime,
  formatUAPhone,
  isValidUAPhone,
} from "@/shared/lib";

import { downloadCsv } from "@/shared/lib/download-csv";
import { cn } from "@/shared/lib/utils";
import {
  ALL_VIEW,
  QUICK_VIEWS,
  activeQuickView,
  hasNonStatusFilters,
  orderFilterChips,
  orderFiltersToQuery,
  orderFiltersToUrl,
  paymentMethodLabel,
  readOrderFilters,
} from "../model/order-filters";
import { OrderFilterSheet } from "./order-filter-sheet";

const d = dict.orders;

const EXPORT_FILENAME = "orders.csv";

/** Where a confirmed order is expected to carry a waybill already. */
const NEEDS_TTN: readonly string[] = [
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
];

/* ── Reading a row ──────────────────────────────────────────────────────── */

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const address = (order: OrderEntity): Record<string, unknown> =>
  (order.shippingAddress ?? {}) as Record<string, unknown>;

const phoneText = (raw: string | undefined): string | undefined =>
  raw ? (isValidUAPhone(raw) ? formatUAPhone(raw) : raw) : undefined;

const emailOf = (order: OrderEntity): string | undefined =>
  order.customer?.email ?? order.guest?.email ?? undefined;

/**
 * «Ірина Мельник» + «+380 67 214 55 90» (П1). The name is the account's, else
 * the recipient's, else the email; the second line is the phone — the guest's,
 * or the one on the delivery address — and the email only when there is no
 * phone (an account order taken before addresses carried one).
 */
function clientOf(order: OrderEntity): {
  name: string;
  contact?: string;
  guest: boolean;
  isId?: boolean;
} {
  const shipping = address(order);
  if (order.guest) {
    return {
      name: order.guest.name || "—",
      contact: phoneText(order.guest.phone) ?? order.guest.email ?? undefined,
      guest: true,
    };
  }
  if (order.customer) {
    const own = [order.customer.firstName, order.customer.lastName]
      .filter(Boolean)
      .join(" ");
    const recipient = [text(shipping.firstName), text(shipping.lastName)]
      .filter(Boolean)
      .join(" ");
    const name = own || recipient || order.customer.email;
    const phone = phoneText(text(shipping.phone));
    return {
      name,
      contact:
        phone ??
        (name !== order.customer.email ? order.customer.email : undefined),
      guest: false,
    };
  }
  // No account joined (a deleted user): the id is all there is.
  return {
    name: order.userId ? `${order.userId.slice(0, 8)}…` : "—",
    guest: false,
    isId: true,
  };
}

/** What the registry knows beyond the row: the courier's free-from threshold. */
export interface DeliveryContext {
  /**
   * `courierFreeFrom` of the delivery settings — only for a session holding
   * `settings:delivery`; `undefined` otherwise, and the cell then says just
   * «безкоштовно». The CURRENT threshold: the order snapshots no threshold.
   */
  courierFreeFrom?: string | null;
}

/**
 * The «Доставка» cell (ДН-1.11): the method over one detail line.
 *  - Нова Пошта   «Київ · Відділення №1»
 *  - Самовивіз    «Магазин на Хрещатику» (the snapshot's point name)
 *  - Курʼєр       «Київ · 150 ₴», at 0 «Київ · безкоштовно (від 2 000 ₴)»
 *  - Інша         «Уточнити вартість доставки», in the warning tone
 */
export function deliveryShort(
  order: OrderEntity,
  context: DeliveryContext = {},
): { method: string; detail: string; toQuote: boolean } {
  const method = orderDeliveryMethod(order);
  const snap = deliverySnapshot(order.shippingAddress);
  const join = (...parts: Array<string | undefined>) =>
    parts.filter(Boolean).join(" · ") || "—";
  const label = deliveryMethodLabel(method);

  if (method === "OTHER" || isShippingCostPending(order)) {
    return { method: label, detail: d.deliveryCostToQuote, toQuote: true };
  }
  if (method === "PICKUP") {
    return {
      method: label,
      detail: snap.pickupPointName ?? join(snap.city, snap.address1),
      toQuote: false,
    };
  }
  if (method === "COURIER") {
    const cost = Number(order.shippingCost);
    const price =
      cost > 0
        ? formatCurrency(order.shippingCost)
        : context.courierFreeFrom
          ? d.deliveryFreeFromShort(formatCurrency(context.courierFreeFrom))
          : d.deliveryFreeShort;
    return { method: label, detail: join(snap.city, price), toQuote: false };
  }
  return {
    method: label,
    detail: join(snap.city, snap.npWarehouseName ?? snap.address1),
    toQuote: false,
  };
}

/**
 * «ТТН …» wherever a waybill was typed; «ТТН не вказано» only for a Nova
 * Poshta order that is due one — a pickup or the shop's courier never is.
 */
function waybill(
  order: OrderEntity,
): { label: string; missing: boolean } | null {
  if (order.trackingNumber) {
    return { label: d.ttnValue(order.trackingNumber), missing: false };
  }
  return orderDeliveryMethod(order) === "NOVA_POSHTA" &&
    NEEDS_TTN.includes(order.status)
    ? { label: d.ttnMissing, missing: true }
    : null;
}

/** Kopecks, so a page of «29.99» rows adds up without float drift. */
function pageSum(rows: readonly OrderEntity[]): number {
  return (
    rows.reduce((sum, row) => sum + Math.round(Number(row.total) * 100), 0) /
    100
  );
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
  if (sortBy === "total") return asc ? d.sortTotalAsc : d.sortTotalDesc;
  if (sortBy === "status") return asc ? d.sortStatusAsc : d.sortStatusDesc;
  return asc ? d.sortCreatedAsc : d.sortCreatedDesc;
}

const orderHref = (order: OrderEntity) => `/orders/${order.id}`;
const rowLabel = (order: OrderEntity) => d.rowAria(formatOrderNumber(order.id));
const getRowId = (order: OrderEntity) => order.id;

/* ── Cells ──────────────────────────────────────────────────────────────── */

function ClientCell({ order }: { order: OrderEntity }) {
  const client = clientOf(order);
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "text-foreground",
            client.isId && "font-mono text-xs text-muted-foreground",
          )}
        >
          {client.name}
        </span>
        {client.guest ? <Badge variant="warning">{d.guestBadge}</Badge> : null}
      </span>
      {client.contact ? (
        <span className="text-xs break-all text-muted-foreground">
          {client.contact}
        </span>
      ) : null}
    </span>
  );
}

function StatusCell({ order, now }: { order: OrderEntity; now: number }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge variant={orderStatusBadgeVariant(order.status)}>
        {orderStatusLabel(order.status)}
      </Badge>
      {/* TASK-470 / 471 / 472: the derived marks of B-1, beside the status
          they qualify. The clock is `dataUpdatedAt` — «Очікує оплати · N хв»
          is a statement about the rows that were fetched. */}
      {orderDerivedMarks(order, now).map((mark) => (
        <Badge key={mark.kind} variant={mark.variant}>
          {mark.label}
        </Badge>
      ))}
    </span>
  );
}

/** Method (500) over its detail; the waybill line under both where it exists. */
function DeliveryCell({
  order,
  context,
}: {
  order: OrderEntity;
  context: DeliveryContext;
}) {
  const delivery = deliveryShort(order, context);
  const ttn = waybill(order);
  return (
    <span className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium text-foreground">{delivery.method}</span>
      <span
        className={cn(
          "text-xs",
          delivery.toQuote
            ? "font-medium text-warning"
            : "break-words text-muted-foreground",
        )}
      >
        {delivery.detail}
      </span>
      {ttn ? (
        <span
          className={cn(
            "text-xs",
            ttn.missing
              ? "font-medium text-warning"
              : "text-muted-foreground tabular-nums",
          )}
        >
          {ttn.label}
        </span>
      ) : null}
    </span>
  );
}

function PaymentStatusBadge({ order }: { order: OrderEntity }) {
  return (
    <Badge variant={paymentStatusBadgeVariant(order.paymentStatus)}>
      {paymentStatusLabel(order.paymentStatus)}
    </Badge>
  );
}

/**
 * Width the default-visible columns may share at 1440: content area 1136 minus
 * the «⋯» column and the box border (no checkbox column — no bulk actions yet).
 */
export const ORDER_COLUMNS_WIDTH_BUDGET = 1136 - 44 - 2;

export function buildColumns(
  now: number,
  delivery: DeliveryContext = {},
): RegistryColumn<OrderEntity>[] {
  return [
    {
      id: "number",
      label: d.colNumber,
      locked: true,
      rowLink: true,
      defaultWidth: 104,
      minWidth: 96,
      cell: (order) => <OrderNumber id={order.id} />,
    },
    {
      id: "created",
      label: d.colCreated,
      sortField: "createdAt",
      defaultWidth: 104,
      cell: (order) => (
        <span className="flex flex-col gap-0.5 tabular-nums">
          <span className="text-foreground">{formatDate(order.createdAt)}</span>
          <span className="text-xs text-muted-foreground">
            {formatTime(order.createdAt)}
          </span>
        </span>
      ),
    },
    {
      id: "client",
      label: d.colCustomer,
      defaultWidth: 200,
      minWidth: 140,
      cell: (order) => <ClientCell order={order} />,
    },
    {
      id: "status",
      label: d.colStatus,
      sortField: "status",
      defaultWidth: 190,
      minWidth: 140,
      cell: (order) => <StatusCell order={order} now={now} />,
    },
    {
      id: "payment",
      label: d.colPayment,
      defaultWidth: 150,
      cell: (order) => (
        <span className="flex flex-col items-start gap-0.5">
          <PaymentStatusBadge order={order} />
          <span className="text-xs text-muted-foreground">
            {paymentMethodLabel(order.paymentMethod)}
          </span>
        </span>
      ),
    },
    {
      id: "delivery",
      label: d.colDelivery,
      defaultWidth: 180,
      minWidth: 140,
      cell: (order) => <DeliveryCell order={order} context={delivery} />,
    },
    {
      id: "total",
      label: d.colTotal,
      sortField: "total",
      align: "end",
      defaultWidth: 104,
      className: "font-medium tabular-nums",
      cell: (order) => formatCurrency(order.total),
      footer: (rows) => formatCurrency(pageSum(rows)),
    },
    {
      id: "items",
      label: d.colItemsShort,
      align: "end",
      defaultWidth: 56,
      minWidth: 48,
      className: "text-muted-foreground tabular-nums",
      cell: (order) => order.items.length,
      footer: (rows) => rows.reduce((sum, row) => sum + row.items.length, 0),
    },
    // Hidden by default; one click away in «Колонки».
    {
      id: "customerType",
      label: d.colCustomerType,
      defaultVisible: false,
      defaultWidth: 130,
      cell: (order) =>
        order.customer ? (
          <Badge variant="secondary">{d.customerTypeAccount}</Badge>
        ) : order.guest ? (
          <Badge variant="warning">{d.customerTypeGuest}</Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "paymentMethod",
      label: d.colPaymentMethod,
      defaultVisible: false,
      defaultWidth: 150,
      cell: (order) => paymentMethodLabel(order.paymentMethod),
    },
    {
      id: "email",
      label: d.colEmail,
      defaultVisible: false,
      defaultWidth: 220,
      cell: (order) => (
        <span className="break-all">{emailOf(order) ?? "—"}</span>
      ),
    },
    {
      id: "city",
      label: d.colCity,
      defaultVisible: false,
      defaultWidth: 140,
      cell: (order) => text(address(order).city) ?? "—",
    },
    {
      id: "updated",
      label: d.colUpdated,
      defaultVisible: false,
      defaultWidth: 150,
      cell: (order) => (
        <span className="text-muted-foreground tabular-nums">
          {formatDateTime(order.updatedAt)}
        </span>
      ),
    },
  ];
}

/** One order below md (OrdersProposal П7). */
function renderCard(
  order: OrderEntity,
  parts: RegistryCardParts,
  now: number,
  delivery: DeliveryContext,
) {
  const client = clientOf(order);
  const marks = orderDerivedMarks(order, now);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        {parts.href ? (
          <Link
            href={parts.href}
            className="rounded-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <OrderNumber id={order.id} />
          </Link>
        ) : (
          <OrderNumber id={order.id} />
        )}
        <Badge variant={orderStatusBadgeVariant(order.status)}>
          {orderStatusLabel(order.status)}
        </Badge>
      </div>
      {marks.length ? (
        <div className="flex flex-wrap justify-end gap-1">
          {marks.map((mark) => (
            <Badge key={mark.kind} variant={mark.variant}>
              {mark.label}
            </Badge>
          ))}
        </div>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-foreground">{client.name}</span>
          {client.guest ? (
            <Badge variant="warning">{d.guestBadge}</Badge>
          ) : null}
        </span>
        <b className="font-semibold text-foreground tabular-nums">
          {formatCurrency(order.total)}
        </b>
      </div>
      <div className="flex items-center gap-2">
        <PaymentStatusBadge order={order} />
        <span className="text-xs text-muted-foreground">
          {paymentMethodLabel(order.paymentMethod)}
        </span>
      </div>
      {/* ДН-1.12: the delivery under its caption, the same two lines as the
          table cell. */}
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {d.colDelivery}
        </span>
        <DeliveryCell order={order} context={delivery} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {formatDateTime(order.createdAt)}
        </span>
        {parts.actions}
      </div>
    </div>
  );
}

/**
 * The order queue on the shared registry (wave 198, TASK-1045 / TASK-732,
 * OrdersProposal П1–П8).
 *
 * The URL contract is the one the dashboard tiles and the e2e deep links rely
 * on, unchanged: `?status=` (one status or a CSV — the quick views write it
 * verbatim, «Усі» drops it), `?search=`, `?paymentStatus=`, `?paymentMethod=`,
 * the seven signal booleans, `?dateFrom=`/`?dateTo=`, sort, page and size —
 * plus, since TASK-648, `?deliveryMethod=` (a CSV) and `?pickupPointId=` (the
 * deep link from a pickup point's «⋯» on `/settings/delivery`).
 *
 * What moved, nothing removed: the three selects and the six toggles went into
 * «Фільтри», «Переглянути» became a row click + «⋯ → Відкрити», «Експорт CSV»
 * became «Експорт ▾ → CSV», «Тип клієнта» became the «гість» badge in the
 * client cell (the column stays in «Колонки»).
 *
 * No checkbox column and no bulk bar: bulk status change needs the dry-run API
 * (TASK-1045's API tail), and a selection with nothing to do is noise.
 */
export function AdminOrderTable() {
  const searchParams = useSearchParams();
  const { can } = useAuth();
  const canWriteOrders = can(PERM.ordersWrite);

  // TASK-336: free-text search over order number / email / phone.
  const searchParam = searchParams.get("search") ?? "";
  const filters = readOrderFilters(searchParams);
  const statusParam = searchParams.get("status") ?? "";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const query = orderFiltersToQuery(filters, searchParam);
  const { data, dataUpdatedAt, isLoading, isFetching, isError, refetch } =
    useAdminOrderControllerFindAll(
      { ...query, page, limit: pageSize, sortBy, sortOrder },
      // The order queue is the table two operators stare at simultaneously —
      // the one place where the panel-wide five-minute `staleTime` is wrong.
      { query: OPERATIONAL_LIST_QUERY },
    );

  const orders = useMemo(() => data?.data ?? [], [data]);
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;

  // TASK-648: both reads need `settings:delivery` and are not asked without
  // it — the cell then says just «безкоштовно», the chip «Точка самовивозу».
  const canReadDelivery = can(PERM.settingsDelivery);
  const deliverySettings = useGetDeliverySettings({
    query: { enabled: canReadDelivery },
  });
  const pickupPoints = useListAdminPickupPoints({
    query: { enabled: canReadDelivery && filters.pickupPointId !== "" },
  });
  const courierFreeFrom = deliverySettings.data?.data?.courierFreeFrom;
  const pickupPointNames = useMemo(
    () =>
      Object.fromEntries(
        (pickupPoints.data?.data ?? []).map((point) => [point.id, point.name]),
      ),
    [pickupPoints.data],
  );
  const deliveryContext = useMemo<DeliveryContext>(
    () => ({ courierFreeFrom }),
    [courierFreeFrom],
  );

  const columns = useMemo(
    () => buildColumns(dataUpdatedAt, deliveryContext),
    [dataUpdatedAt, deliveryContext],
  );
  const registry = useDataRegistry({
    tableId: "orders",
    columns,
    rows: orders,
    getRowId,
  });

  const [isExporting, setIsExporting] = useState(false);

  /**
   * CSV of the CURRENT FILTERS — not the visible page (TASK-425). A truncated
   * file says so through the sticky `toast.error`; the row count is read off
   * the file, which is sound only because the server flattens every field to
   * one physical line (`toSingleCsvLine`).
   */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const csv = await adminOrderControllerExport(query);
      const exported = Math.max(0, csv.split("\r\n").length - 1);
      downloadCsv(csv, EXPORT_FILENAME);
      if (total > exported) {
        toast.error(d.exportTruncated(exported, total));
      } else {
        toast.success(d.exportSuccess(exported));
      }
    } catch {
      toast.error(d.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  const chips: FilterChip[] = orderFilterChips(filters, pickupPointNames).map(
    (chip) => ({
      key: chip.key,
      label: chip.label,
      onRemove: () => updateParams({ ...chip.clear, page: undefined }),
    }),
  );

  const rowActions = (order: OrderEntity): RowActionItem[] => {
    const href = orderHref(order);
    const number = formatOrderNumber(order.id);
    const items: RowActionItem[] = [
      { label: d.rowOpen, href },
      { label: d.rowOpenNewTab, href, newTab: true },
      {
        label: d.rowCopyNumber,
        onSelect: () => copy(number, d.copiedNumber(number)),
      },
    ];
    if (order.trackingNumber) {
      const ttn = order.trackingNumber;
      items.push({
        label: d.rowCopyTtn,
        onSelect: () => copy(ttn, d.copiedTtn),
      });
    }
    // The card's status control, behind the same `orders:write` it needs
    // there. A link, not an inline picker: the move needs the server's list of
    // legal transitions and the unpaid-shipment / return dialogs of the card.
    if (canWriteOrders) {
      items.push({
        label: d.rowChangeStatus,
        href: `${href}#order-status`,
        separatorBefore: true,
      });
    }
    return items;
  };

  // «Немає замовлень зі статусом …» when ONLY a status narrowed the list,
  // the generic filtered sentence when anything else did.
  const otherFilters = hasNonStatusFilters(filters);
  const emptyState =
    statusParam && !otherFilters
      ? d.emptyStatus(filters.status.map(orderStatusLabel).join(", "))
      : d.empty;

  return (
    <LiveAnnouncer>
      <DataRegistry
        registry={registry}
        title={d.heading}
        headerActions={
          <>
            <ExportMenu
              foundLabel={countLabel(total, d.itemForms)}
              selectedIds={[]}
              selectable={false}
              columns={registry.visibleColumnIds}
              formats={["csv"]}
              footnote={d.exportFootnote}
              onExport={() => void handleExport()}
              disabled={isExporting}
            />
            {/* TASK-341 / 715: a phone order starts here — only for a session
                that may create one. */}
            {canWriteOrders ? (
              <Button asChild>
                <Link href="/orders/new">{d.createCta}</Link>
              </Button>
            ) : null}
          </>
        }
        quickViews={{
          items: QUICK_VIEWS,
          activeId: activeQuickView(statusParam),
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
          count: chips.length,
          renderSheet: ({ open, onOpenChange }) => (
            <OrderFilterSheet
              open={open}
              onOpenChange={onOpenChange}
              applied={filters}
              search={searchParam}
              onApply={(next) =>
                updateParams({ ...orderFiltersToUrl(next), page: undefined })
              }
            />
          ),
        }}
        views={{ defaultName: d.viewDefault }}
        onRefresh={() => void refetch()}
        isRefreshing={isFetching}
        chips={chips}
        onClearAllChips={() =>
          updateParams({
            ...Object.fromEntries(
              orderFilterChips(filters).flatMap((chip) =>
                Object.keys(chip.clear).map((key) => [key, undefined]),
              ),
            ),
            page: undefined,
          })
        }
        summary={
          data ? (
            <>
              {d.summaryFound}{" "}
              <SummaryValue>{countLabel(total, d.itemForms)}</SummaryValue>
            </>
          ) : null
        }
        sortLabel={sortLabel(sortBy, sortOrder)}
        updatedAt={data ? dataUpdatedAt : undefined}
        itemForms={d.itemForms}
        getRowLabel={rowLabel}
        getRowHref={orderHref}
        rowActions={rowActions}
        sort={{ sortBy, sortOrder, onSort }}
        totals
        renderCard={(order, parts) =>
          renderCard(order, parts, dataUpdatedAt, deliveryContext)
        }
        isLoading={isLoading}
        isError={isError}
        errorMessage={d.loadError}
        onRetry={() => void refetch()}
        isRetrying={isFetching}
        isRefetching={isFetching && !isLoading}
        emptyState={emptyState}
        searchQuery={searchParam || undefined}
        isFiltered={otherFilters}
        pagination={{ page, totalPages, pageSize }}
      />
    </LiveAnnouncer>
  );
}
