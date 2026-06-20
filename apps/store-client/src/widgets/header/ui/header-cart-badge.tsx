"use client";

import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useGetCart } from "@/entities/cart";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * HeaderCartBadge — cart icon link with a live item-count badge.
 * Reads the cart (guest or user) via the cached useGetCart query; the badge
 * is only rendered when there is at least one item.
 */
export function HeaderCartBadge({ className }: { className?: string }) {
  const { data } = useGetCart();
  const count = data?.data?.totals.itemCount ?? 0;

  return (
    <Link
      href="/cart"
      aria-label={dict.header.cartAria}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ShoppingCart className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-sale px-1.5 text-xs font-semibold text-sale-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
