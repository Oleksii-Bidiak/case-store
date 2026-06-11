"use client";

import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetCartQueryKey,
  useClearCart,
  type CartTotals,
} from "@/entities/cart";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
}

/**
 * CartSummary — order totals panel with a checkout placeholder and a
 * clear-cart action. Total equals subtotal for MVP (no discount/shipping yet).
 */
export function CartSummary({ totals }: { totals: CartTotals }) {
  const queryClient = useQueryClient();

  const clearCart = useClearCart({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() }),
    },
  });

  const handleClear = () => {
    if (window.confirm("Remove all items from your cart?")) {
      clearCart.mutate();
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold text-foreground">Order Summary</h2>

      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="text-foreground">{formatPrice(totals.subtotal)}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {totals.itemCount} item{totals.itemCount !== 1 ? "s" : ""}
      </p>

      <hr className="border-border" />

      <div className="flex items-center justify-between font-semibold text-foreground">
        <span>Total</span>
        <span>{formatPrice(totals.subtotal)}</span>
      </div>

      <Link
        href="/checkout"
        aria-label="Proceed to checkout"
        className="w-full rounded-lg bg-primary px-6 py-3 text-center font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Proceed to Checkout
      </Link>

      <button
        type="button"
        onClick={handleClear}
        disabled={clearCart.isPending}
        className="w-full rounded-lg border border-destructive px-6 py-2 text-sm text-destructive hover:bg-destructive/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      >
        {clearCart.isPending ? "Clearing…" : "Clear cart"}
      </button>

      {clearCart.error && (
        <p role="alert" className="text-sm text-destructive">
          Could not clear the cart. Please try again.
        </p>
      )}
    </div>
  );
}
