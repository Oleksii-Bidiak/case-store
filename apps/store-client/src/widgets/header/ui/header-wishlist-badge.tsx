"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useGetWishlist } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * HeaderWishlistBadge — wishlist icon link with a live saved-count badge.
 * Reads the wishlist (guest or user) via the cached useGetWishlist query; the
 * badge is only rendered when at least one product is saved. Mirrors
 * HeaderCartBadge.
 */
export function HeaderWishlistBadge({ className }: { className?: string }) {
  // Mirror the cart badge: hold the query until auth bootstrap settles so the
  // badge never reflects a transient empty guest wishlist minted during refresh
  // (TASK-118).
  const { isInitializing } = useAuth();
  const { data } = useGetWishlist({ query: { enabled: !isInitializing } });
  const count = data?.data?.itemCount ?? 0;

  return (
    <Link
      href="/wishlist"
      aria-label={dict.wishlist.headerAria}
      className={cn(
        "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Heart className="size-5" aria-hidden="true" />
      {count > 0 && (
        <span className="absolute -top-1 -right-1 inline-flex min-w-5 items-center justify-center rounded-full bg-sale px-1.5 text-xs font-semibold text-sale-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
