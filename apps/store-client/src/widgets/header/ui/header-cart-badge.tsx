"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { useAuth } from "@/entities/session";
import { CartSheet } from "@/widgets/cart";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={dict.cart.openAria}
        className={cn(
          "relative inline-flex h-11 cursor-pointer items-center gap-2.5 rounded-xl bg-primary px-3 text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:pr-4",
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

      <CartSheet open={open} onOpenChange={setOpen} />
    </>
  );
}
