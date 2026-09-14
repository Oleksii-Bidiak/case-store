"use client";

import { useState } from "react";
import Link from "next/link";
import { Clock3, Download, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import { toast } from "@/shared/ui/toast";
import {
  OrderEntityStatus,
  OrderEntityPaymentStatus,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
// The payment-METHOD enum and the CSV endpoint are not part of what
// `@/entities/order` re-exports, and that barrel is another wave's file. A widget
// may read `@/shared` directly (the product list already does), so this is the
// honest import rather than a duplicated string union.
import {
  adminOrderControllerExport,
  OrderEntityPaymentMethod,
} from "@/shared/api";
import { useTableSort } from "@/shared/lib/use-table-sort";
import { OPERATIONAL_LIST_QUERY } from "@/shared/lib/query-freshness";
import {
  Badge,
  Button,
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
  TableToolbar,
  Tabs,
  TabsList,
  TabsTrigger,
  pageSizeFrom,
  type TableFilterDef,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency, formatDateTime } from "@/shared/lib";
import { downloadCsv } from "../model/download-csv";
import { AdminOrderTableSkeleton } from "./admin-order-table-skeleton";

const ALL_OPTION = "__all__";

const EXPORT_FILENAME = "orders.csv";

/**
 * Payment-status filter options (TASK-425). Every value of the enum: an
 * operator's question is as often "what failed" as it is "what is unpaid".
 *
 * TASK-472 added PARTIALLY_REFUNDED here at the same time as it added it to the
 * enum. "Every value" is the rule this list lives by, and a new payment status
 * that the list cannot be filtered by is a status the operator can only find by
 * scrolling — which is how a half-refunded order gets forgotten.
 */
const PAYMENT_STATUS_FILTER_OPTIONS = [
  OrderEntityPaymentStatus.PENDING,
  OrderEntityPaymentStatus.PAID,
  OrderEntityPaymentStatus.FAILED,
  OrderEntityPaymentStatus.PARTIALLY_REFUNDED,
  OrderEntityPaymentStatus.REFUNDED,
];

/**
 * Ukrainian labels for the payment METHOD (TASK-425).
 *
 * A near-copy of the map in `features/order-create` — deliberately not imported
 * from there: a widget reaching into a feature's UI file for a constant is a
 * worse dependency than three duplicated strings. Their shared home is
 * `entities/order` beside `paymentStatusLabel`, which is where this belongs the
 * moment either file is touched again.
 */
const PAYMENT_METHOD_LABELS: Record<string, string> = {
  [OrderEntityPaymentMethod.ON_DELIVERY]: dict.orders.paymentMethodOnDelivery,
  [OrderEntityPaymentMethod.ONLINE]: dict.orders.paymentMethodOnline,
  [OrderEntityPaymentMethod.INSTALLMENTS]:
    dict.orders.paymentMethodInstallments,
};

const STATUS_FILTER_OPTIONS = [
  OrderEntityStatus.PENDING,
  OrderEntityStatus.CONFIRMED,
  OrderEntityStatus.PROCESSING,
  OrderEntityStatus.SHIPPED,
  OrderEntityStatus.DELIVERED,
  OrderEntityStatus.CANCELLED,
  OrderEntityStatus.REFUNDED,
];

/**
 * Lifecycle preset tabs (TASK-250) — a quick-access layer over the existing
 * `?status=` param. "В обробці" is a multi-status filter (`CONFIRMED,PROCESSING`),
 * only valid because the admin endpoint accepts a CSV `status` param. Each status
 * `value` is written verbatim to the URL.
 *
 * "Всі" carries the `ALL_OPTION` sentinel rather than the `""` it held until
 * TASK-405: the empty string is not a legal Radix `Tabs` value, so that tab could
 * never render active, and clicking it fed `""` back into a controlled
 * `Tabs.Root`. The sentinel never reaches the URL — `handleTabChange` maps it
 * back to "no `?status=`", exactly as the `<Select>` beside it already did.
 */
const STATUS_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: OrderEntityStatus.PENDING, label: dict.orders.tabNew },
  {
    value: `${OrderEntityStatus.CONFIRMED},${OrderEntityStatus.PROCESSING}`,
    label: dict.orders.tabProcessing,
  },
  { value: OrderEntityStatus.SHIPPED, label: dict.orders.tabShipped },
  { value: ALL_OPTION, label: dict.orders.tabAll },
];

/**
 * Radix `Tabs.Root` value used when the current `?status=` doesn't match any
 * preset (e.g. a `DELIVERED` deep link or a single `CONFIRMED` from the Select):
 * it matches no `TabsTrigger`, so no tab renders active — the honest state.
 */
const CUSTOM_TAB = "__custom__";

/**
 * Paginated order table for the admin panel, listing orders across all users.
 *
 * Status filter and page state live in the URL (`?status=`, `?page=`). The order
 * and customer IDs are shown truncated; full detail is one click away.
 *
 * TASK-354 moved the controls into `TableToolbar` and added the refresh button.
 * The lifecycle Tabs sit in the toolbar's `filters` slot next to the Select,
 * inside their own wrapper so the two wrap against each other instead of
 * fighting the toolbar's `md:flex-nowrap` row. Their deep-link contract is
 * untouched — this is a relayout, not a rework.
 */
export function AdminOrderTable() {
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status") ?? "";
  // TASK-336: free-text search over order number / email / phone — what an
  // operator actually holds when a customer rings up.
  const searchParam = searchParams.get("search") ?? "";
  // TASK-248 deep-link: `?unpaidInTransit=true` filters to active-but-unpaid
  // orders (the needs-action widget's target). The status <Select> has no option
  // for this compound preset — reconciling it is deferred to TASK-250's tabs.
  const unpaidInTransit = searchParams.get("unpaidInTransit") === "true";
  // TASK-425: the queue filters. Payment status and method are ordinary
  // single-value filters; `pendingOverdue` is a SERVER-side predicate — the
  // threshold lives in the API's PENDING_STALE_HOURS, shared with the dashboard
  // tile, so the chip and the tile can never answer differently.
  const paymentStatusParam = searchParams.get("paymentStatus") ?? "";
  const paymentMethodParam = searchParams.get("paymentMethod") ?? "";
  const pendingOverdue = searchParams.get("pendingOverdue") === "true";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = pageSizeFrom(searchParams);

  const updateParams = useUrlParams();

  // Column sort lives in the URL (TASK-147).
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  // TASK-423: the focus-sensitive `lastPushedRef` guard this table hand-rolled
  // (forms.md rule 1b) now lives inside the shared `TableSearch` — it was the
  // reference implementation for it, and keeping a local copy was how the other
  // twelve tables ended up without one.

  const { data, isLoading, isFetching, isError, refetch } =
    useAdminOrderControllerFindAll(
      {
        page,
        limit: pageSize,
        // The generated `status` param is a plain string (CSV) since TASK-250, so
        // single (`PENDING`) and multi (`CONFIRMED,PROCESSING`) values pass straight
        // through — no enum cast needed.
        status: statusParam || undefined,
        // TASK-336: matches order-number prefix, email and phone, for account AND
        // guest orders alike.
        search: searchParam || undefined,
        // TASK-248 deep-link: active-but-unpaid ("in-transit") filter.
        unpaidInTransit: unpaidInTransit || undefined,
        // TASK-425. Cast for the same reason the subscriber table casts its
        // status: the value comes off the URL as a string, and an illegal one is
        // rejected by the DTO rather than pretended away here.
        paymentStatus: paymentStatusParam
          ? (paymentStatusParam as OrderEntityPaymentStatus)
          : undefined,
        paymentMethod: paymentMethodParam
          ? (paymentMethodParam as OrderEntityPaymentMethod)
          : undefined,
        pendingOverdue: pendingOverdue || undefined,
        sortBy,
        sortOrder,
      },
      // The order queue is the table two operators stare at simultaneously —
      // the one place where the panel-wide five-minute `staleTime` is wrong.
      { query: OPERATIONAL_LIST_QUERY },
    );

  const orders = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;
  const total = data?.meta?.total ?? 0;

  const [isExporting, setIsExporting] = useState(false);

  /**
   * CSV of the CURRENT SELECTION — every active filter, not the visible page
   * (TASK-425). The server caps the row count; rather than restating that cap
   * here (two copies of a number is how they drift), the file's own row count is
   * compared against `meta.total`, which this table already holds. A truncated
   * export reports itself through `toast.error`, which stays on screen: a
   * spreadsheet that is quietly missing half the orders is the one outcome the
   * operator must not scroll past.
   */
  const handleExport = async () => {
    setIsExporting(true);
    try {
      const csv = await adminOrderControllerExport({
        status: statusParam || undefined,
        search: searchParam || undefined,
        unpaidInTransit: unpaidInTransit || undefined,
        paymentStatus: paymentStatusParam
          ? (paymentStatusParam as OrderEntityPaymentStatus)
          : undefined,
        paymentMethod: paymentMethodParam
          ? (paymentMethodParam as OrderEntityPaymentMethod)
          : undefined,
        pendingOverdue: pendingOverdue || undefined,
      });
      // Rows = lines minus the header, which is only sound because the SERVER
      // now guarantees one order occupies one physical line: `toCsvRow` runs
      // every field through `toSingleCsvLine` before escaping it.
      //
      // It used to rest on the assumption that no exported field can contain a
      // newline, which was false — `customerName` and `city` are free text (a
      // max length and a trim, no character rules), and a correctly QUOTED
      // multi-line field still spans several physical lines. One such order at
      // the server's row cap inflated this count up to `total`, skipped the
      // truncation branch below, and handed the operator a green success toast
      // for a file silently missing every order past the cap. Do not relax the
      // server-side flattening without replacing this count.
      const exported = Math.max(0, csv.split("\r\n").length - 1);
      downloadCsv(csv, EXPORT_FILENAME);
      if (total > exported) {
        toast.error(dict.orders.exportTruncated(exported, total));
      } else {
        toast.success(dict.orders.exportSuccess(exported));
      }
    } catch {
      toast.error(dict.orders.exportError);
    } finally {
      setIsExporting(false);
    }
  };

  const filters: TableFilterDef[] = [
    {
      param: "status",
      label: dict.orders.filterStatusAria,
      allLabel: dict.orders.allStatuses,
      options: STATUS_FILTER_OPTIONS.map((status) => ({
        value: status,
        label: orderStatusLabel(status),
      })),
      // A lifecycle tab can set a multi-status preset this Select has no single
      // option for; the chip still has to be readable and clearable.
      resolveLabel: (raw) =>
        raw
          .split(",")
          .map((status) => orderStatusLabel(status))
          .join(", "),
    },
    // TASK-425: "has the money arrived" was not answerable from this table at
    // all — the payment column could be read but never filtered on.
    {
      param: "paymentStatus",
      label: dict.orders.filterPaymentStatusAria,
      allLabel: dict.orders.allPaymentStatuses,
      options: PAYMENT_STATUS_FILTER_OPTIONS.map((status) => ({
        value: status,
        label: paymentStatusLabel(status),
      })),
    },
    // Separate from the status above because they answer different questions: a
    // cash-on-delivery order is unpaid until the courier hands it over, a card
    // order that is unpaid means the money never arrived.
    {
      param: "paymentMethod",
      label: dict.orders.filterPaymentMethodAria,
      allLabel: dict.orders.allPaymentMethods,
      options: Object.values(OrderEntityPaymentMethod).map((method) => ({
        value: method,
        label: PAYMENT_METHOD_LABELS[method] ?? method,
      })),
    },
  ];

  // The active preset tab is the one whose value exactly matches the current
  // `?status=` string, with an absent filter standing for the "Всі" sentinel;
  // otherwise CUSTOM_TAB → no tab renders active.
  const currentTabValue = statusParam || ALL_OPTION;
  const activeTab = STATUS_TABS.some((tab) => tab.value === currentTabValue)
    ? currentTabValue
    : CUSTOM_TAB;

  const handleTabChange = (value: string) => {
    updateParams({
      status: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  return (
    <LiveAnnouncer>
      <div className="flex flex-col gap-4">
        <TableToolbar
          className="mb-0"
          onRefresh={() => void refetch()}
          isRefreshing={isFetching}
          search={
            <TableSearch
              value={searchParam}
              placeholder={dict.orders.searchPlaceholder}
              label={dict.orders.searchAria}
            />
          }
          filters={
            <div className="flex flex-wrap items-center gap-2">
              <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList aria-label={dict.orders.tabsAria}>
                  {STATUS_TABS.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value}>
                      {tab.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
              <TableFilters
                filters={filters}
                values={{
                  status: statusParam,
                  paymentStatus: paymentStatusParam,
                  paymentMethod: paymentMethodParam,
                }}
              />
              {/* TASK-425: "waiting too long". A toggle rather than a Select
                  option, because it is not a value of any one column — it is a
                  server predicate over status AND age. `aria-pressed` is what
                  makes it a toggle for a screen reader; the visual state is the
                  filled variant. */}
              <Button
                type="button"
                variant={pendingOverdue ? "secondary" : "outline"}
                size="sm"
                aria-pressed={pendingOverdue}
                aria-label={dict.orders.overdueChipAria}
                onClick={() =>
                  updateParams({
                    pendingOverdue: pendingOverdue ? undefined : "true",
                    page: undefined,
                  })
                }
              >
                <Clock3 aria-hidden="true" className="size-3.5" />
                {dict.orders.overdueChip}
              </Button>
            </div>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* TASK-425: the CURRENT SELECTION as CSV — the filters as applied,
                  not the page on screen. */}
              <Button
                type="button"
                variant="outline"
                disabled={isExporting}
                onClick={() => void handleExport()}
              >
                {isExporting ? (
                  <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  <Download aria-hidden="true" className="size-4" />
                )}
                {dict.orders.exportCsv}
              </Button>
              {/* TASK-341: a phone order starts here. */}
              <Button asChild>
                <Link href="/orders/new">{dict.orders.createCta}</Link>
              </Button>
            </div>
          }
        />

        {isLoading ? (
          <AdminOrderTableSkeleton />
        ) : isError ? (
          <p role="alert" className="text-sm text-destructive">
            {dict.orders.loadError}
          </p>
        ) : orders.length === 0 ? (
          <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
            {/* A search miss names the query, not the status filter: "no PENDING
              orders" would be a lie when the operator typed a phone number. */}
            {searchParam
              ? dict.orders.emptySearch(searchParam)
              : statusParam
                ? dict.orders.emptyStatus(orderStatusLabel(statusParam))
                : dict.orders.empty}
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
                  <TableHead>{dict.orders.colOrder}</TableHead>
                  <TableHead>{dict.orders.colCustomer}</TableHead>
                  {/* TASK-425: account or guest, as its own column. It was
                      inferable from whether a name sat under the email; an
                      operator should not have to infer it. */}
                  <TableHead>{dict.orders.colCustomerType}</TableHead>
                  <SortableColumnHeader
                    field="status"
                    label={dict.orders.colStatus}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <TableHead>{dict.orders.colPayment}</TableHead>
                  <SortableColumnHeader
                    field="total"
                    label={dict.orders.colTotal}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSort={onSort}
                  />
                  <TableHead>{dict.orders.colItems}</TableHead>
                  <SortableColumnHeader
                    field="createdAt"
                    label={dict.orders.colCreated}
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
                {orders.map((order) => (
                  <TableRow
                    key={order.id}
                    rowLabel={dict.orders.rowAria(order.id.slice(0, 8))}
                  >
                    <TableCell
                      label={dict.orders.colOrder}
                      className="font-mono text-xs"
                    >
                      {order.id.slice(0, 8)}…
                    </TableCell>
                    <TableCell label={dict.orders.colCustomer}>
                      {order.customer ? (
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">
                            {order.customer.email}
                          </span>
                          {(order.customer.firstName ||
                            order.customer.lastName) && (
                            <span className="text-xs text-muted-foreground">
                              {[
                                order.customer.firstName,
                                order.customer.lastName,
                              ]
                                .filter(Boolean)
                                .join(" ")}
                            </span>
                          )}
                        </div>
                      ) : order.guest ? (
                        // Guest order (TASK-338): the contact typed at checkout is
                        // the only way to reach this buyer, so show it rather than
                        // an id that does not exist.
                        //
                        // The primary line falls back to the phone because the
                        // email is legitimately null on an order the operator took
                        // over the phone (TASK-426 made it optional). Reading the
                        // email alone left this cell blank on exactly the orders
                        // the operator created themselves — the one contact they
                        // had just typed in, invisible.
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">
                            {order.guest.email || order.guest.phone}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {order.guest.name
                              ? `${order.guest.name} · ${dict.orders.guestBadge}`
                              : dict.orders.guestBadge}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {order.userId ? `${order.userId.slice(0, 8)}…` : "—"}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label={dict.orders.colCustomerType}>
                      {order.customer ? (
                        <Badge variant="secondary">
                          {dict.orders.customerTypeAccount}
                        </Badge>
                      ) : order.guest ? (
                        <Badge variant="warning">
                          {dict.orders.customerTypeGuest}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell label={dict.orders.colStatus}>
                      <Badge variant={orderStatusBadgeVariant(order.status)}>
                        {orderStatusLabel(order.status)}
                      </Badge>
                    </TableCell>
                    <TableCell label={dict.orders.colPayment}>
                      <Badge
                        variant={paymentStatusBadgeVariant(order.paymentStatus)}
                      >
                        {paymentStatusLabel(order.paymentStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell label={dict.orders.colTotal}>
                      {formatCurrency(order.total)}
                    </TableCell>
                    <TableCell label={dict.orders.colItems}>
                      {order.items.length}
                    </TableCell>
                    <TableCell
                      label={dict.orders.colCreated}
                      className="text-muted-foreground"
                    >
                      {formatDateTime(order.createdAt)}
                    </TableCell>
                    <TableCell
                      label={dict.common.actions}
                      className="text-right max-md:text-left"
                    >
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/orders/${order.id}`}>
                          {dict.common.view}
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!isLoading && !isError && orders.length > 0 && (
          <TablePagination
            page={page}
            totalPages={totalPages}
            pageSize={pageSize}
          />
        )}
      </div>
    </LiveAnnouncer>
  );
}
