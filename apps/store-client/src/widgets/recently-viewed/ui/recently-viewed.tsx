"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { ProductCardImage } from "@/shared/ui";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import {
  subscribeRecentlyViewed,
  getRecentlyViewedSnapshot,
  getRecentlyViewedServerSnapshot,
  clearRecentlyViewed,
} from "../model/recently-viewed-storage";

/**
 * RecentlyViewed — a grid of the products the visitor recently opened, read from
 * localStorage. Renders nothing until it has items (so the homepage never shows
 * an empty section), which is the common case until the product page starts
 * recording views. Client Component.
 */
export function RecentlyViewed() {
  // useSyncExternalStore keeps the server snapshot ([]) and the client
  // localStorage snapshot in sync without a setState-in-effect, so there is no
  // hydration mismatch. clearRecentlyViewed() notifies the store to re-render.
  const items = useSyncExternalStore(
    subscribeRecentlyViewed,
    getRecentlyViewedSnapshot,
    getRecentlyViewedServerSnapshot,
  );

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="recently-viewed-heading"
      className="mx-auto w-full max-w-7xl px-4"
    >
      <div className="mb-6 flex items-center justify-between">
        <h2
          id="recently-viewed-heading"
          className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl"
        >
          {dict.home.recentlyViewed.heading}
        </h2>
        <button
          type="button"
          onClick={clearRecentlyViewed}
          className="cursor-pointer text-sm font-semibold text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {dict.home.recentlyViewed.clear}
        </button>
      </div>

      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => {
          const onSale =
            item.compareAtPrice != null &&
            Number(item.compareAtPrice) > Number(item.price);
          return (
            <li key={item.id} className="relative">
              <Link
                href={`/products/${item.slug}`}
                className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lift)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div
                  className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${pickProductGradient(
                    item.slug || item.name,
                  )}`}
                >
                  <ProductCardImage
                    src={item.imageUrl ?? undefined}
                    alt={item.imageAlt ?? item.name}
                    blurDataUrl={item.blurDataUrl ?? undefined}
                    initial={(item.name?.[0] ?? "?").toUpperCase()}
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1.5 p-3">
                  <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
                    {item.name}
                  </h3>
                  <div className="mt-auto flex items-baseline gap-2">
                    <p
                      className={`font-display text-base font-bold tracking-tight ${
                        onSale ? "text-sale" : "text-foreground"
                      }`}
                    >
                      {formatMoney(item.price)}
                    </p>
                    {onSale && item.compareAtPrice && (
                      <p className="text-xs text-muted-foreground line-through">
                        {formatMoney(item.compareAtPrice)}
                      </p>
                    )}
                  </div>
                </div>
              </Link>
              <div className="absolute top-2.5 right-2.5 z-10">
                <WishlistToggleButton
                  productId={item.id}
                  productName={item.name}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
