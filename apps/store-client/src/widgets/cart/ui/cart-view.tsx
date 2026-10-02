"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ShoppingBag } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { getGetCartQueryKey, useClearCart, useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { dict, STICKY_ASIDE_TOP, H1_CLASS } from "@/shared/config";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  OrderTrustStrip,
} from "@/shared/ui";
import { CartItemRow } from "./cart-item-row";
import { CartSummary } from "./cart-summary";
import { CartSkeleton } from "./cart-skeleton";

/**
 * CartView — client orchestrator for the cart page (Cart.dc.html redesign).
 * Fetches the cart (guest or user), renders loading / error / empty / populated
 * states. Works for anonymous visitors via the cartToken cookie — no auth
 * required.
 *
 * Add-on services (TASK-174) are fully server-owned: each line carries its
 * resolved `availableAddons` / `selectedAddonIds`, and `totals.addonsTotal` is
 * computed by the API — there is no client-side selection state to keep in sync
 * any more (the old `Record<string, boolean>` stub is gone), and a selection now
 * survives a reload and reaches the placed order.
 */
export function CartView() {
  const queryClient = useQueryClient();

  // Don't fetch until the auth bootstrap refresh has settled (TASK-118).
  const { isInitializing } = useAuth();
  const { data, isLoading, isError, refetch } = useGetCart({
    query: { enabled: !isInitializing },
  });

  const [confirmOpen, setConfirmOpen] = useState(false);

  const clearCart = useClearCart({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetCartQueryKey() });
        setConfirmOpen(false);
      },
    },
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
  // A line the API withdrew from sale (TASK-403) blocks checkout until it is
  // removed — the summary explains why, each row carries the badge.
  const hasUnavailableItems = items.some((item) => !item.isActive);

  if (items.length === 0) {
    return (
      <section
        aria-labelledby="empty-cart-heading"
        className="flex flex-col items-center gap-4 py-16 text-center"
      >
        <span className="flex size-20 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBag className="size-9" aria-hidden="true" />
        </span>
        {/* The empty cart is still the /cart page, so its title is the page h1
            (TASK-751) — same role and scale as the wishlist's empty state. */}
        <h1 id="empty-cart-heading" className={`${H1_CLASS} text-foreground`}>
          {dict.cart.emptyHeading}
        </h1>
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
    // No bottom padding here: the room for the fixed mobile «До сплати» bar is
    // reserved by <body> below the footer (globals.css, TASK-864).
    <div className="flex flex-col gap-6">
      {/* Breadcrumbs */}
      <nav
        aria-label={dict.product.breadcrumbAria}
        className="flex items-center gap-1.5 text-[13px] text-muted-foreground"
      >
        <Link href="/" className="transition-colors hover:text-foreground">
          {dict.cart.breadcrumbHome}
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground">{dict.cart.breadcrumb}</span>
      </nav>

      <h1 className={`${H1_CLASS} text-foreground`}>
        {dict.cart.title} · {dict.cart.countShort(cart?.totals.itemCount ?? 0)}
      </h1>

      {/* Announce totals changes to assistive tech after each mutation refetch. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {dict.cart.updatedAria(
          cart?.totals.itemCount ?? 0,
          cart?.totals.subtotal ?? "0",
        )}
      </p>

      {/* eslint-disable-next-line tailwindcss/no-arbitrary-value -- fixed+fluid column layout has no named grid-cols-N equivalent */}
      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        {/* Line items */}
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
          <ul>
            {items.map((item) => (
              <CartItemRow key={item.id} item={item} showAddons />
            ))}
          </ul>
          <div className="flex items-center justify-between px-[22px] py-4">
            <Link
              href="/products"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="size-4" aria-hidden="true" />
              {dict.cart.addExtra}
            </Link>
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="text-sm text-muted-foreground transition-colors hover:text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.cart.clear}
            </button>
          </div>
        </div>

        {/* Summary only. The delivery and payment pickers that used to sit here
            were UI stubs — uncontrolled selects and a radio group default-checked
            on "Картка онлайн", none of which reached the API (TASK-331). Showing a
            payment method the shop cannot take is worse than showing none: the
            real choice lives on /checkout, where it is wired to the order. */}
        {cart && (
          <div className={`flex flex-col gap-4 lg:sticky ${STICKY_ASIDE_TOP}`}>
            <CartSummary
              totals={cart.totals}
              hasUnavailableItems={hasUnavailableItems}
            />
            {/* Trust strip under the summary at every width (TASK-864). */}
            <OrderTrustStrip />
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dict.cart.clearTitle}</DialogTitle>
            <DialogDescription>{dict.cart.clearDescription}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">{dict.cart.clearCancel}</Button>
            </DialogClose>
            <Button
              variant="destructive"
              disabled={clearCart.isPending}
              onClick={() => clearCart.mutate()}
            >
              {clearCart.isPending
                ? dict.cart.clearing
                : dict.cart.clearConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {clearCart.error && (
        <p role="alert" className="text-sm text-destructive">
          {dict.cart.clearError}
        </p>
      )}
    </div>
  );
}
