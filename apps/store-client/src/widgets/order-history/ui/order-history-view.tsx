"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";
import { OrderStatusBadge, useGetOrders } from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import { useGetMyReturns, type ReturnEntity } from "@/entities/return";
import { ReturnRequestButton } from "@/features/return-request";
import { Badge, Button } from "@/shared/ui";
import { dict, H1_CLASS } from "@/shared/config";
import { formatDate, formatMoney } from "@/shared/lib";
import { OrderHistorySkeleton } from "./order-history-skeleton";

/**
 * The status of the NEWEST return request per order (TASK-608). The API lists
 * newest first, so the first row seen for an order is the one to show — an
 * order can carry several requests (one unit now, another next week), and the
 * latest is what the customer is waiting on.
 */
function latestReturnStatusByOrder(
  returns: readonly ReturnEntity[],
): Map<string, string> {
  const byOrder = new Map<string, string>();
  for (const row of returns) {
    if (!byOrder.has(row.orderId)) byOrder.set(row.orderId, row.status);
  }
  return byOrder;
}

/** Existing Badge variants only; the look is Д-в's call (plan 196 register). */
const RETURN_BADGE_VARIANT: Record<
  string,
  "secondary" | "success" | "outline"
> = {
  REFUNDED: "success",
  REJECTED: "outline",
};

function ReturnStatusBadge({ status }: { status: string | undefined }) {
  if (!status) return null;
  const label = dict.returnRequest.statusLabels[status] ?? status;
  return (
    <Badge
      variant={RETURN_BADGE_VARIANT[status] ?? "secondary"}
      aria-label={dict.returnRequest.statusAria(label)}
    >
      {label}
    </Badge>
  );
}

/**
 * OrderHistoryView — client orchestrator for `/orders`. Auth-gated like the
 * account/checkout views. Lists the signed-in user's orders (newest first) with
 * a status badge and total; each row links to its confirmation/detail page.
 */
export function OrderHistoryView() {
  const router = useRouter();
  const { isAuthenticated, isInitializing } = useAuth();

  const { data, isLoading, isError } = useGetOrders(undefined, {
    query: { enabled: isAuthenticated },
  });

  // TASK-608: one request for every return the customer has, instead of one
  // `GET /orders/:id/returns` per row. A failure here costs the page nothing but
  // the return badges, so it is deliberately not part of the loading/error gate.
  const { data: myReturns } = useGetMyReturns({
    query: { enabled: isAuthenticated },
  });

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace("/login?redirect=/orders");
    }
  }, [isInitializing, isAuthenticated, router]);

  if (isInitializing || !isAuthenticated || isLoading) {
    return <OrderHistorySkeleton />;
  }

  const orders = data?.data ?? [];
  const latestReturn = latestReturnStatusByOrder(myReturns?.data ?? []);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className={`${H1_CLASS} text-foreground`}>
        {dict.orderHistory.title}
      </h1>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.orderHistory.loadError}
        </p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-card border border-border p-8">
          <p className="text-muted-foreground">{dict.orderHistory.empty}</p>
          <Button asChild>
            <Link href="/products">{dict.orderHistory.emptyCta}</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id} className="flex flex-wrap items-center gap-3">
              <Link
                href={`/orders/${order.id}/confirmation`}
                className="flex flex-1 flex-wrap items-center justify-between gap-3 rounded-card border border-border p-4 shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-foreground">
                    {dict.orderHistory.orderNumber} #
                    {order.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {formatDate(order.createdAt)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <OrderStatusBadge
                    status={order.status}
                    srLabel={dict.orderHistory.statusSr}
                  >
                    {dict.order.orderStatusLabels[order.status] ?? order.status}
                  </OrderStatusBadge>
                  <ReturnStatusBadge status={latestReturn.get(order.id)} />
                  <span className="font-semibold text-foreground">
                    {formatMoney(order.total)}
                  </span>
                </div>
              </Link>

              {order.status === "PENDING" && (
                <CancelOrderButton orderId={order.id} />
              )}

              {/* TASK-373. DELIVERED only, and not SHIPPED, even though the API
                  accepts both: a parcel still in transit is not something to
                  file a return about, and offering it there invites a claim on
                  goods the customer has not seen yet. The one legitimate case —
                  a refusal at the counter — comes back to us as an undelivered
                  parcel, which is an operator's job, not a form's. */}
              {order.status === "DELIVERED" && (
                <ReturnRequestButton
                  orderId={order.id}
                  orderNumber={`#${order.id.slice(0, 8).toUpperCase()}`}
                  items={order.items}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
