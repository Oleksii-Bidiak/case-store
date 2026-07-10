"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useGetWishlist } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

/**
 * HeaderWishlistBadge — wishlist action as a labelled icon (heart + "Обране"
 * label from `sm` up) with a live saved-count badge. Reads the wishlist (guest
 * or user) via the cached useGetWishlist query, held until the auth bootstrap
 * settles (TASK-118 pattern). Mirrors the header action-cluster styling.
 */
export function HeaderWishlistBadge({ className }: { className?: string }) {
  const { isInitializing } = useAuth();
  const { data } = useGetWishlist({ query: { enabled: !isInitializing } });
  const count = data?.data?.itemCount ?? 0;

  return (
    <Link
      href="/wishlist"
      aria-label={dict.wishlist.headerAria}
      className={cn(
        "relative flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-1.5 text-[11px] text-foreground transition-colors hover:bg-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Heart className="size-[22px]" aria-hidden="true" />
      <span className="hidden sm:inline">{dict.header.wishlistLabel}</span>
      {count > 0 && (
        <span className="absolute top-0.5 right-1 inline-flex min-w-4 items-center justify-center rounded-full bg-sale px-1 text-[10px] font-bold text-sale-foreground">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
