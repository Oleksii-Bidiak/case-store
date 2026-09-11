"use client";

import Link from "next/link";
import { CheckCircle2, ShoppingBag } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { Skeleton } from "@/shared/ui";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/shared/ui";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { CartItemRow } from "./cart-item-row";

interface CartSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * CartSheet — the header mini-cart slide-out (design import). Opens from the
 * header cart button and reuses the cached `useGetCart` query and the existing
 * `CartItemRow` (optimistic quantity + remove logic) — no new cart logic here.
 * The full `/cart` page stays available via the "Перейти в кошик" link.
 */
export function CartSheet({ open, onOpenChange }: CartSheetProps) {
  // Share the badge's cached cart query; hold until the auth bootstrap settles
  // so it never reflects a transient empty guest cart minted on refresh (TASK-118).
  const { isInitializing } = useAuth();
  const { data, isLoading, isError, refetch } = useGetCart({
    query: { enabled: !isInitializing },
  });

  const cart = data?.data;
  const items = cart?.items ?? [];
  const count = cart?.totals.itemCount ?? 0;
  // Same rule as the cart page (TASK-403): a line the API withdrew from sale
  // blocks checkout. "Перейти в кошик" below stays live — that is where the
  // shopper removes it; the rows carry the badge via the shared CartItemRow.
  const hasUnavailableItems = items.some((item) => !item.isActive);
  const close = () => onOpenChange(false);

  const loading = isInitializing || isLoading;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        aria-describedby={undefined}
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="font-display text-lg font-bold text-foreground">
            {dict.cart.title}
            {count > 0 && (
              <span className="text-muted-foreground"> · {count}</span>
            )}
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="flex flex-col gap-4 p-5" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3">
                <Skeleton className="size-16 shrink-0 rounded-lg" />
                <div className="flex flex-1 flex-col gap-2 py-1">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="mt-auto h-8 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && isError && (
          <div className="flex flex-1 flex-col items-start gap-4 p-5">
            <p role="alert" className="text-destructive">
              {dict.cart.loadError}
            </p>
            <button
              type="button"
              onClick={() => refetch()}
              className="rounded-lg border border-border px-4 py-2 text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {dict.common.retry}
            </button>
          </div>
        )}

        {!loading && !isError && items.length === 0 && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
            <span className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShoppingBag className="size-8" aria-hidden="true" />
            </span>
            <div>
              <b className="block font-display text-base font-bold text-foreground">
                {dict.cart.emptyHeading}
              </b>
              <span className="text-sm text-muted-foreground">
                {dict.cart.emptySubtitle}
              </span>
            </div>
            <Link
              href="/products"
              onClick={close}
              className="rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
            >
              {dict.cart.shopNow}
            </Link>
          </div>
        )}

        {!loading && !isError && items.length > 0 && (
          <>
            <ul className="flex-1 overflow-y-auto px-5">
              {items.map((item) => (
                // `onNavigate` closes the sheet when a line's product link is
                // clicked — otherwise the navigation happens behind the open
                // overlay and looks like a no-op (TASK-204).
                // `showAddons` (TASK-409): the add-on services used to be
                // suppressed here to keep the mini-cart compact, which meant a
                // shopper who never opened the full cart page never saw them —
                // and never bought one. The offers are now in both places.
                <CartItemRow
                  key={item.id}
                  item={item}
                  showAddons
                  onNavigate={close}
                />
              ))}
            </ul>

            <div className="border-t border-border bg-card px-5 py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  {dict.cart.total}
                </span>
                <span className="font-display text-xl font-bold tracking-tight text-foreground">
                  {formatMoney(cart?.totals.subtotal ?? "0")}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-success">
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {dict.cart.sheetShipping}
              </p>
              {hasUnavailableItems ? (
                // A real disabled <button>, not a styled link: a link with
                // `aria-disabled` still navigates on Enter.
                <>
                  <button
                    type="button"
                    disabled
                    aria-describedby="cart-sheet-checkout-blocked"
                    className="mt-3.5 flex h-12 w-full cursor-not-allowed items-center justify-center rounded-xl bg-muted font-semibold text-muted-foreground"
                  >
                    {dict.cart.checkout}
                  </button>
                  <p
                    id="cart-sheet-checkout-blocked"
                    className="mt-2 text-center text-xs font-medium text-destructive"
                  >
                    {dict.cart.checkoutBlocked}
                  </p>
                </>
              ) : (
                <Link
                  href="/checkout"
                  onClick={close}
                  className="mt-3.5 flex h-12 items-center justify-center rounded-xl bg-primary font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                >
                  {dict.cart.checkout}
                </Link>
              )}
              <Link
                href="/cart"
                onClick={close}
                className="mt-2.5 flex h-11 items-center justify-center rounded-xl border-[1.5px] border-border font-semibold text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {dict.cart.viewCartFull}
              </Link>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
