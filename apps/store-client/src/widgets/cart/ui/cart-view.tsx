"use client";

import Link from "next/link";
import { useGetCart } from "@/entities/cart";
import { CartItemRow } from "./cart-item-row";
import { CartSummary } from "./cart-summary";
import { CartSkeleton } from "./cart-skeleton";

/**
 * CartView — client orchestrator for the cart page. Fetches the cart (guest or
 * user) and renders loading, error, empty, and populated states. Works for
 * anonymous visitors via the cartToken cookie — no auth required.
 */
export function CartView() {
  const { data, isLoading, isError, refetch } = useGetCart();

  if (isLoading) {
    return <CartSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-destructive">
          Something went wrong while loading your cart. Please try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-border px-4 py-2 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Retry
        </button>
      </div>
    );
  }

  const cart = data?.data;
  const items = cart?.items ?? [];

  if (items.length === 0) {
    return (
      <section
        aria-labelledby="empty-cart-heading"
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <h2
          id="empty-cart-heading"
          className="text-xl font-semibold text-foreground"
        >
          Your cart is empty
        </h2>
        <p className="text-muted-foreground">
          Looks like you haven&apos;t added anything yet.
        </p>
        <Link
          href="/products"
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Shop now
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shopping Cart</h1>
        <p className="text-sm text-muted-foreground">
          {cart?.totals.uniqueItems} item type
          {cart?.totals.uniqueItems !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Announce totals changes to assistive tech after each mutation refetch. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        Cart updated: {cart?.totals.itemCount} items, subtotal{" "}
        {cart?.totals.subtotal}.
      </p>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <ul className="lg:col-span-2">
          {items.map((item) => (
            <CartItemRow key={item.id} item={item} />
          ))}
        </ul>
        {cart && (
          <div className="lg:self-start">
            <CartSummary totals={cart.totals} />
          </div>
        )}
      </div>
    </div>
  );
}
