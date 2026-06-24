"use client";

import Link from "next/link";
import { ArrowLeft, ShoppingBag } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { CartItemRow } from "./cart-item-row";
import { CartSummary } from "./cart-summary";
import { CartSkeleton } from "./cart-skeleton";

/**
 * CartView — client orchestrator for the cart page. Fetches the cart (guest or
 * user) and renders loading, error, empty, and populated states. Works for
 * anonymous visitors via the cartToken cookie — no auth required.
 */
export function CartView() {
  // Don't fetch until the auth bootstrap refresh has settled. Firing during the
  // mount-time /api/auth/refresh window would request the cart as a guest (token
  // not yet in memory, cartToken cleared by login), minting a fresh empty cart
  // and caching it as the user's — the TASK-118 reload bug.
  const { isInitializing } = useAuth();
  const { data, isLoading, isError, refetch } = useGetCart({
    query: { enabled: !isInitializing },
  });

  if (isInitializing || isLoading) {
    return <CartSkeleton />;
  }

  if (isError) {
    return (
      <div className="flex flex-col items-start gap-4">
        <p role="alert" className="text-destructive">
          {dict.cart.loadError}
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-border px-4 py-2 text-foreground hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.common.retry}
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
        <span className="flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBag className="size-9" aria-hidden="true" />
        </span>
        <h2
          id="empty-cart-heading"
          className="font-display text-2xl font-bold text-foreground"
        >
          {dict.cart.emptyHeading}
        </h2>
        <p className="text-muted-foreground">{dict.cart.emptySubtitle}</p>
        <Link
          href="/products"
          className="rounded-lg bg-primary px-6 py-3 font-semibold text-primary-foreground hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.cart.shopNow}
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {dict.cart.title}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dict.cart.itemTypes(cart?.totals.uniqueItems ?? 0)}
        </p>
      </div>

      {/* Announce totals changes to assistive tech after each mutation refetch. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {dict.cart.updatedAria(
          cart?.totals.itemCount ?? 0,
          cart?.totals.subtotal ?? "0",
        )}
      </p>

      <div className="flex flex-col gap-8 lg:grid lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ul>
            {items.map((item) => (
              <CartItemRow key={item.id} item={item} />
            ))}
          </ul>
          <Link
            href="/products"
            className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            {dict.cart.continueShopping}
          </Link>
        </div>
        {cart && (
          <div className="lg:self-start">
            <CartSummary totals={cart.totals} />
          </div>
        )}
      </div>
    </div>
  );
}
