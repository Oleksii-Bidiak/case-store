"use client";

import { useGetCart } from "@/entities/cart";
import { Skeleton } from "@/shared/ui";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
}

/** Narrow the loosely-typed generated nullable string fields to a usable string. */
function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

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
        Could not load cart summary.
      </p>
    );
  }

  const cart = data?.data;
  const items = cart?.items ?? [];

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>

      <ul className="flex flex-col gap-3">
        {items.map((item) => {
          const variantName = asString(item.variantName);
          return (
            <li
              key={item.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="flex flex-col">
                <span className="text-foreground">{item.productName}</span>
                {variantName && (
                  <span className="text-muted-foreground">{variantName}</span>
                )}
                <span className="text-muted-foreground">
                  {item.quantity} × {formatPrice(item.price)}
                </span>
              </div>
              <span className="text-foreground">
                {formatPrice(item.lineTotal)}
              </span>
            </li>
          );
        })}
      </ul>

      <hr className="border-border" />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>Subtotal</span>
        <span>{formatPrice(cart?.totals.subtotal ?? "0")}</span>
      </div>

      <p className="text-sm text-muted-foreground">
        Prices shown reflect your cart at this moment.
      </p>
    </div>
  );
}
