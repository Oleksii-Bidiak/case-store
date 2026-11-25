"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { ShoppingCart } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

// The mini-cart is closed on every first paint, so its code stays out of the
// page's first-load JS (TASK-2524): it loads on the first open and is
// preloaded on intent (hover, focus or touch on the button). The slice's own
// file, not its barrel: `import()` of the barrel would carry the whole cart
// widget (CartView included) into the chunk.
const CartSheet = dynamic(
  () => import("@/widgets/cart/ui/cart-sheet").then((m) => m.CartSheet),
  { ssr: false },
);
const preloadCartSheet = () => {
  // A failed preload is retried by the real open, which owns the error.
  import("@/widgets/cart/ui/cart-sheet").catch(() => {});
};

/**
 * HeaderCartBadge — the prominent cart action: a filled primary button with the
 * cart icon, a live item-count badge, and (from `sm` up) the "Кошик" label plus
 * the running subtotal. Opens the mini-cart slide-out (the full `/cart` page is
 * still reachable from inside it). Collapses to an icon + badge on small screens.
 *
 * Reads the cart (guest or user) via the cached useGetCart query, held until the
 * auth bootstrap settles so it never reflects a transient empty guest cart minted
 * during refresh (TASK-118).
 */
export function HeaderCartBadge({ className }: { className?: string }) {
  const { isInitializing } = useAuth();
  const { data } = useGetCart({ query: { enabled: !isInitializing } });
  const totals = data?.data?.totals;
  const count = totals?.itemCount ?? 0;

  const [open, setOpen] = useState(false);
  // Mounted on the first open and kept mounted afterwards, so the close
  // animation and Radix's focus handling run exactly as before.
  const [sheetMounted, setSheetMounted] = useState(false);
  const openSheet = () => {
    setSheetMounted(true);
    setOpen(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        onPointerEnter={preloadCartSheet}
        onFocus={preloadCartSheet}
        onTouchStart={preloadCartSheet}
        aria-label={dict.cart.openAria}
        className={cn(
          "relative inline-flex h-11 items-center gap-2.5 rounded-xl bg-primary px-3 text-primary-foreground transition-interactive hover:bg-primary-hover hover:shadow-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring active:scale-98 active:bg-primary active:shadow-none motion-reduce:active:scale-100 sm:pr-4",
          className,
        )}
      >
        <span className="relative inline-flex">
          <ShoppingCart className="size-5" aria-hidden="true" />
          {count > 0 && (
            <span className="absolute -top-2 -right-2.5 inline-flex min-w-5 items-center justify-center rounded-full border border-primary bg-card px-1 text-[11px] font-bold text-primary">
              {count > 99 ? "99+" : count}
            </span>
          )}
        </span>
        <span className="hidden flex-col items-start leading-tight sm:flex">
          <span className="text-[11px] opacity-80">
            {dict.header.cartLabel}
          </span>
          <span
            className="font-mono text-sm font-bold"
            aria-label={dict.header.cartTotalAria}
          >
            {formatMoney(totals?.subtotal ?? "0")}
          </span>
        </span>
      </button>

      {sheetMounted && <CartSheet open={open} onOpenChange={setOpen} />}
    </>
  );
}
