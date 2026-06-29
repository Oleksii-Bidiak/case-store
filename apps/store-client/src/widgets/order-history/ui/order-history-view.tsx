"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/entities/session";
import { useGetOrders } from "@/entities/order";
import { CancelOrderButton } from "@/features/cancel-order";
import { Button } from "@/shared/ui";
import { dict } from "@/shared/config";
import { formatMoney } from "@/shared/lib";
import { OrderHistorySkeleton } from "./order-history-skeleton";

/** Token-based badge colours per status value (no raw hex) — mirrors confirmation. */
const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-primary/10 text-primary",
  PROCESSING: "bg-primary/20 text-primary",
  SHIPPED: "bg-primary/30 text-primary",
  DELIVERED: "bg-primary/10 text-primary font-semibold",
  CANCELLED: "bg-destructive/10 text-destructive",
  REFUNDED: "bg-destructive/10 text-destructive",
};

const dateFormatter = new Intl.DateTimeFormat("uk-UA", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
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

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace("/login?redirect=/orders");
    }
  }, [isInitializing, isAuthenticated, router]);

  if (isInitializing || !isAuthenticated || isLoading) {
    return <OrderHistorySkeleton />;
  }

  const orders = data?.data ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
        {dict.orderHistory.title}
      </h1>

      {isError ? (
        <p role="alert" className="text-sm text-destructive">
          {dict.orderHistory.loadError}
        </p>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border p-8">
          <p className="text-muted-foreground">{dict.orderHistory.empty}</p>
          <Button asChild>
            <Link href="/products">{dict.orderHistory.emptyCta}</Link>
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center gap-3">
              <Link
                href={`/orders/${order.id}/confirmation`}
                className="flex flex-1 flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4 shadow-card transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  <span
                    aria-label={`${dict.orderHistory.statusSr}: ${
                      dict.order.orderStatusLabels[order.status] ?? order.status
                    }`}
                    className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                      STATUS_BADGE[order.status] ??
                      "bg-muted text-muted-foreground"
                    }`}
                  >
                    {dict.order.orderStatusLabels[order.status] ?? order.status}
                  </span>
                  <span className="font-semibold text-foreground">
                    {formatMoney(order.total)}
                  </span>
                </div>
              </Link>

              {order.status === "PENDING" && (
                <CancelOrderButton orderId={order.id} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
