"use client";

import { useGetCart } from "@/entities/cart";
import { Skeleton } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";

/**
 * CheckoutOrderSummary — read-only cart summary shown alongside the checkout
 * form. Reuses the cached `useGetCart` query (no extra network round-trip) so the
 * totals stay in sync with the cart page.
 */
export function CheckoutOrderSummary() {
  const { data, isLoading, isError } = useGetCart();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-px w-full" />
        <Skeleton className="h-5 w-2/3" />
      </div>
    );
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.checkout.summaryError}
      </p>
    );
  }

  const cart = data?.data;
  const items = cart?.items ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold text-foreground">
        {dict.checkout.summaryTitle}
      </h2>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-foreground">{item.productName}</span>
                <span className="text-muted-foreground">
                  {item.quantity} × {formatMoney(item.price)}
                </span>
              </div>
              <span className="text-foreground">
                {formatMoney(item.lineTotal)}
              </span>
            </li>
          );
        })}
      </ul>

      <hr className="border-border" />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>{dict.checkout.subtotal}</span>
        <span>{formatMoney(cart?.totals.subtotal ?? "0")}</span>
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {dict.checkout.deliveryEstimateLabel}
        </span>
        <span className="text-foreground">
          {dict.checkout.deliveryEstimateValue}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">
        {dict.checkout.pricesDisclaimer}
      </p>
    </div>
  );
}
