"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  OrderEntityStatus,
  orderStatusBadgeVariant,
  orderStatusLabel,
  paymentStatusBadgeVariant,
  paymentStatusLabel,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
import { useTableSort } from "@/shared/lib/use-table-sort";
import {
  Badge,
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SortableColumnHeader,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsList,
  TabsTrigger,
} from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatCurrency } from "@/shared/lib";
import { AdminOrderTableSkeleton } from "./admin-order-table-skeleton";

const PAGE_SIZE = 20;
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
 * only valid because the admin endpoint accepts a CSV `status` param. Each `value`
 * is written verbatim to the URL; "Всі" clears the filter (`value: ""`).
 */
const STATUS_TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: OrderEntityStatus.PENDING, label: dict.orders.tabNew },
  {
    value: `${OrderEntityStatus.CONFIRMED},${OrderEntityStatus.PROCESSING}`,
    label: dict.orders.tabProcessing,
  },
  { value: OrderEntityStatus.SHIPPED, label: dict.orders.tabShipped },
  { value: "", label: dict.orders.tabAll },
];

/**
 * Radix `Tabs.Root` value used when the current `?status=` doesn't match any
 * preset (e.g. a `DELIVERED` deep link or a single `CONFIRMED` from the Select):
 * it matches no `TabsTrigger`, so no tab renders active — the honest state.
 */
const CUSTOM_TAB = "__custom__";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * Paginated order table for the admin panel, listing orders across all users.
 *
 * Status filter and page state live in the URL (`?status=`, `?page=`). The order
 * and customer IDs are shown truncated; full detail is one click away.
 */
export function AdminOrderTable() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const statusParam = searchParams.get("status") ?? "";
  // TASK-248 deep-link: `?unpaidInTransit=true` filters to active-but-unpaid
  // orders (the needs-action widget's target). The status <Select> has no option
  // for this compound preset — reconciling it is deferred to TASK-250's tabs.
  const unpaidInTransit = searchParams.get("unpaidInTransit") === "true";
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

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
    router.replace(queryString ? `${pathname}?${queryString}` : pathname);
  };

  // Column sort lives in the URL (TASK-147).
  const { sortBy, sortOrder, onSort } = useTableSort(
    searchParams,
    updateParams,
  );

  const { data, isLoading, isFetching, isError } =
    useAdminOrderControllerFindAll({
      page,
      limit: PAGE_SIZE,
      // The generated `status` param is a plain string (CSV) since TASK-250, so
      // single (`PENDING`) and multi (`CONFIRMED,PROCESSING`) values pass straight
      // through — no enum cast needed.
      status: statusParam || undefined,
      // TASK-248 deep-link: active-but-unpaid ("in-transit") filter.
      unpaidInTransit: unpaidInTransit || undefined,
      sortBy,
      sortOrder,
    });

  const orders = data?.data ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  const handleStatusChange = (value: string) => {
    updateParams({
      status: value === ALL_OPTION ? undefined : value,
      page: undefined,
    });
  };

  // The active preset tab is the one whose value exactly matches the current
  // `?status=` string; otherwise CUSTOM_TAB → no tab renders active.
  const activeTab = STATUS_TABS.some((tab) => tab.value === statusParam)
    ? statusParam
    : CUSTOM_TAB;

  const handleTabChange = (value: string) => {
    updateParams({ status: value || undefined, page: undefined });
  };

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList aria-label={dict.orders.tabsAria}>
          {STATUS_TABS.map((tab) => (
            <TabsTrigger key={tab.value || "all"} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex items-center gap-2">
        <Select
          value={statusParam || ALL_OPTION}
          onValueChange={handleStatusChange}
        >
          <SelectTrigger
            className="w-48"
            aria-label={dict.orders.filterStatusAria}
          >
            <SelectValue placeholder={dict.orders.allStatuses} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_OPTION}>
              {dict.orders.allStatuses}
            </SelectItem>
            {STATUS_FILTER_OPTIONS.map((status) => (
              <SelectItem key={status} value={status}>
                {orderStatusLabel(status)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <AdminOrderTableSkeleton />
      ) : isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.orders.loadError}
        </p>
      ) : orders.length === 0 ? (
        <div className="rounded-md border border-border p-8 text-center text-sm text-muted-foreground">
          {statusParam
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
                <TableRow key={order.id}>
                  <TableCell
                    label={dict.orders.colOrder}
                    className="font-mono text-xs"
                  >
                    {order.id.slice(0, 8)}…
                  </TableCell>
                  <TableCell label={dict.orders.colCustomer}>
                    {order.customer ? (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm">{order.customer.email}</span>
                        {(order.customer.firstName ||
                          order.customer.lastName) && (
                          <span className="text-xs text-muted-foreground">
                            {[order.customer.firstName, order.customer.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="font-mono text-xs text-muted-foreground">
                        {order.userId.slice(0, 8)}…
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
                    {dateFormatter.format(new Date(order.createdAt))}
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
