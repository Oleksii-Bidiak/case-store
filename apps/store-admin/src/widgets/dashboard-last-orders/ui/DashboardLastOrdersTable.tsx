"use client";

import Link from "next/link";
import {
  orderStatusBadgeVariant,
  orderStatusLabel,
  useAdminOrderControllerFindAll,
} from "@/entities/order";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/shared/ui";
import { formatCurrency } from "@/shared/lib";
import { dict } from "@/shared/config";
import { DashboardLastOrdersTableSkeleton } from "./DashboardLastOrdersTableSkeleton";

/** Number of recent orders shown on the dashboard. */
const LAST_ORDERS_LIMIT = 5;

/** Mirrors AdminOrderTable's date rendering so the two tables read consistently. */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

/**
 * «Останні замовлення» — the dashboard's last-5-orders widget (TASK-249).
 *
 * Self-fetching (independent of the dashboard summary query), mirroring
 * `NeedsActionWidget`'s pattern: it reuses the existing admin order-list
 * contract (`GET /api/admin/orders?limit=5&sortBy=createdAt&sortOrder=desc`) —
 * no new endpoint. Each row's mono-truncated id, customer email/name stack and
 * status badge mirror `AdminOrderTable`; the action links into the order detail.
 */
export function DashboardLastOrdersTable() {
  const { data, isLoading, isError } = useAdminOrderControllerFindAll({
    limit: LAST_ORDERS_LIMIT,
    sortBy: "createdAt",
    sortOrder: "desc",
  });

  if (isLoading) {
    return <DashboardLastOrdersTableSkeleton />;
  }

  if (isError || !data) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 shadow-card">
        <h3 className="mb-4 text-sm font-medium text-muted-foreground">
          {dict.dashboard.lastOrders}
        </h3>
        <p role="alert" className="text-sm text-destructive">
          {dict.orders.loadError}
        </p>
      </div>
    );
  }

  const orders = data.data;

  return (
    <div className="rounded-lg border border-border bg-card p-6 shadow-card">
      <h3 className="mb-4 text-sm font-medium text-muted-foreground">
        {dict.dashboard.lastOrders}
      </h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{dict.orders.colOrder}</TableHead>
            <TableHead>{dict.orders.colCustomer}</TableHead>
            <TableHead>{dict.orders.colStatus}</TableHead>
            <TableHead>{dict.orders.colTotal}</TableHead>
            <TableHead>{dict.orders.colCreated}</TableHead>
            <TableHead className="text-right">{dict.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="py-6 text-center text-sm text-muted-foreground"
              >
                {dict.dashboard.noLastOrders}
              </TableCell>
            </TableRow>
          ) : (
            orders.map((order) => (
              <TableRow key={order.id}>
                <TableCell className="font-mono text-xs">
                  {order.id.slice(0, 8)}…
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
                  ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                      {order.userId.slice(0, 8)}…
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={orderStatusBadgeVariant(order.status)}>
                    {orderStatusLabel(order.status)}
                  </Badge>
                </TableCell>
                <TableCell>{formatCurrency(order.total)}</TableCell>
                <TableCell className="text-muted-foreground">
                  {dateFormatter.format(new Date(order.createdAt))}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/orders/${order.id}`}>{dict.common.view}</Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
