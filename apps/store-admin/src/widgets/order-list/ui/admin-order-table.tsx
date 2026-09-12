"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useUrlParams } from "@/shared/lib/use-url-params";
import {
  OrderEntityStatus,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
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
import { AdminOrderTableSkeleton } from "./admin-order-table-skeleton";

const ALL_OPTION = "__all__";

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
        sortBy,
        sortOrder,
      },
      // The order queue is the table two operators stare at simultaneously —
      // the one place where the panel-wide five-minute `staleTime` is wrong.
      { query: OPERATIONAL_LIST_QUERY },
    );

  const orders = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

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
                values={{ status: statusParam }}
              />
            </div>
          }
          actions={
            /* TASK-341: a phone order starts here. */
            <Button asChild>
              <Link href="/orders/new">{dict.orders.createCta}</Link>
            </Button>
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
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">{order.guest.email}</span>
                          <span className="text-xs text-muted-foreground">
                            {order.guest.name} · {dict.orders.guestBadge}
                          </span>
                        </div>
                      ) : (
                        <span className="font-mono text-xs text-muted-foreground">
                          {order.userId ? `${order.userId.slice(0, 8)}…` : "—"}
                        </span>
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
