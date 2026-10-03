"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  OrderNumber,
  orderStatusBadgeVariant,
  orderStatusLabel,
  useAdminOrderControllerFindAll,
  type OrderEntity,
} from "@/entities/order";
import {
  Badge,
  Button,
  ErrorState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { CardHeaderLink } from "@/shared/ui/card-header-link";
import { formatCurrency, formatDateTime } from "@/shared/lib";
import { dict } from "@/shared/config";
import { DashboardLastOrdersTableSkeleton } from "./DashboardLastOrdersTableSkeleton";

/** Number of recent orders shown on the dashboard. */
const LAST_ORDERS_LIMIT = 5;

/** The customer's name for the phone card — a name reads faster than an email. */
function customerName(order: OrderEntity): string {
  if (order.customer) {
    const name = [order.customer.firstName, order.customer.lastName]
      .filter(Boolean)
      .join(" ");
    return name || order.customer.email;
  }
  if (order.guest) return order.guest.name || order.guest.email || "—";
  return "—";
}

/** Card chrome + heading row with «Усі замовлення →», shared by every state. */
function LastOrdersCard({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium text-muted-foreground">
          {dict.dashboard.lastOrders}
        </h3>
        <CardHeaderLink href="/orders">
          {dict.dashboard.allOrdersLink}
        </CardHeaderLink>
      </div>
      {children}
    </div>
  );
}

/**
 * «Останні замовлення» — the dashboard's last-5-orders widget (TASK-249).
 *
 * Self-fetching (independent of the dashboard summary query), mirroring
 * `NeedsActionWidget`'s pattern: it reuses the existing admin order-list
 * contract (`GET /api/admin/orders?limit=5&sortBy=createdAt&sortOrder=desc`) —
 * no new endpoint. The customer email/name stack and status badge mirror
 * `AdminOrderTable`; the action links into the order detail.
 *
 * Wave 198 (TASK-1037/1038):
 * - the order is named «#7C1E9A42» (`OrderNumber`, the full id in its title)
 *   instead of a lower-case «7c1e9a42…»;
 * - «Усі замовлення →» in the header, kept while the block is failing too;
 * - a failure is an `ErrorState` with «Повторити» re-asking this list only;
 * - below `md` the table becomes a list of cards (number + status / name +
 *   total / date), each opening the order — the table scrolled sideways at 390.
 */
export function DashboardLastOrdersTable() {
  const { data, isLoading, isError, isFetching, refetch } =
    useAdminOrderControllerFindAll({
      limit: LAST_ORDERS_LIMIT,
      sortBy: "createdAt",
      sortOrder: "desc",
    });

  if (isLoading) {
    return <DashboardLastOrdersTableSkeleton />;
  }

  if (isError || !data) {
    return (
      <LastOrdersCard>
        <ErrorState
          message={dict.dashboard.lastOrdersLoadError}
          onRetry={() => void refetch()}
          isRetrying={isFetching}
        />
      </LastOrdersCard>
    );
  }

  const orders = data.data;

  if (orders.length === 0) {
    return (
      <LastOrdersCard>
        <p className="py-6 text-center text-sm text-muted-foreground">
          {dict.dashboard.noLastOrders}
        </p>
      </LastOrdersCard>
    );
  }

  return (
    <LastOrdersCard>
      {/* Phones: one card per order — the whole card is the link. */}
      <ul
        aria-label={dict.dashboard.lastOrders}
        className="flex flex-col gap-3 md:hidden"
      >
        {orders.map((order) => (
          <li key={order.id}>
            <Link
              href={`/orders/${order.id}`}
              className="flex flex-col gap-2 rounded-md border border-border p-3 text-foreground outline-none transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="flex items-center justify-between gap-2">
                <OrderNumber id={order.id} />
                <Badge variant={orderStatusBadgeVariant(order.status)}>
                  {orderStatusLabel(order.status)}
                </Badge>
              </span>
              <span className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate">{customerName(order)}</span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {formatCurrency(order.total)}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDateTime(order.createdAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="max-md:hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{dict.orders.colOrder}</TableHead>
              <TableHead>{dict.orders.colCustomer}</TableHead>
              <TableHead>{dict.orders.colStatus}</TableHead>
              <TableHead>{dict.orders.colTotal}</TableHead>
              <TableHead>{dict.orders.colCreated}</TableHead>
              <TableHead className="text-right">
                {dict.common.actions}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell>
                  <OrderNumber id={order.id} />
                </TableCell>
                <TableCell>
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
                  ) : order.guest ? (
                    // Guest order (TASK-338): there is no account, so the contact
                    // typed at checkout IS the customer. Falling through to the
                    // userId branch would print "null…" — and worse, would hide the
                    // one identifier an operator can actually call back.
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
                <TableCell>
                  <Badge variant={orderStatusBadgeVariant(order.status)}>
                    {orderStatusLabel(order.status)}
                  </Badge>
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatCurrency(order.total)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(order.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/orders/${order.id}`}>{dict.common.view}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </LastOrdersCard>
  );
}
