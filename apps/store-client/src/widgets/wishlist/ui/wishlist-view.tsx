"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { useGetWishlist } from "@/entities/wishlist";
import { useAuth } from "@/entities/session";
import { dict } from "@/shared/config";
import { WishlistItemCard } from "./wishlist-item-card";
import { WishlistSkeleton } from "./wishlist-skeleton";

/**
 * WishlistView — client orchestrator for the `/wishlist` page. Reads the saved
 * products (guest or user) via the cached useGetWishlist query, gated on auth
 * bootstrap (TASK-118), and renders loading / error / empty / populated states.
 *
 * Works for guests (wishlistToken cookie) and users alike; after login the
 * query is invalidated so the merged list appears.
 */
export function WishlistView() {
  // Hold the query until auth bootstrap settles so the page never flashes a
  // transient empty guest wishlist minted during refresh (TASK-118 pattern).
  const { isInitializing } = useAuth();
  const { data, isPending, isError } = useGetWishlist({
    query: { enabled: !isInitializing },
  });

  if (isInitializing || isPending) {
    return <WishlistSkeleton />;
  }

  if (isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {dict.wishlist.error}
      </p>
    );
  }

  // Defensive: drop optimistic placeholders (productId only) that may exist
  // mid-toggle — only fully-hydrated items have a slug to render/link.
  const items = (data?.data?.items ?? []).filter((item) =>
    Boolean(item.productSlug),
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card px-6 py-16 text-center">
        <Heart className="size-10 text-muted-foreground" aria-hidden="true" />
        <div className="flex flex-col gap-1">
          <h1 className="text-lg font-semibold text-foreground">
            {dict.wishlist.emptyHeading}
          </h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {dict.wishlist.emptyBody}
          </p>
        </div>
        <Link
          href="/products"
          className="inline-flex items-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.wishlist.emptyCta}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-foreground">
          {dict.wishlist.heading}
        </h1>
        <p className="text-sm text-muted-foreground">
          {dict.wishlist.count(items.length)}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <WishlistItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}
