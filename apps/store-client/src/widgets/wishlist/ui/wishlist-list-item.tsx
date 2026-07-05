"use client";

import Link from "next/link";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { ProductCardImage } from "@/shared/ui";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { isOnSale } from "./wishlist-filters";

/**
 * WishlistListItem — a saved product rendered as a horizontal row (the list view
 * of the redesigned wishlist). Reuses the shared image, the compact
 * AddToCartButton and the heart toggle (which removes the item here). Ratings are
 * not shown because the wishlist item summary carries none (unlike the catalog
 * ProductCard).
 */
export function WishlistListItem({ item }: { item: WishlistItemEntity }) {
  const onSale = isOnSale(item);
  // maxQty is the API-side cap (min of the per-item limit and stock, TASK-231);
  // 0 means out of stock — the raw stock figure never reaches the client.
  const outOfStock = item.maxQty <= 0 || !item.isActive;
  const discount = onSale
    ? Math.round((1 - Number(item.price) / Number(item.compareAtPrice)) * 100)
    : 0;
  const gradient = pickProductGradient(item.productSlug || item.productName);

  return (
    <article className="flex gap-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div
        className={`relative size-[130px] shrink-0 overflow-hidden rounded-xl bg-gradient-to-br sm:size-[150px] ${gradient}`}
      >
        <ProductCardImage
          src={item.imageUrl ?? undefined}
          alt={item.productName}
          initial={(item.productName?.[0] ?? "?").toUpperCase()}
          // Fixed thumbnail (`size-[130px] sm:size-[150px]` above) — without
          // this the grid default downloads ~full-viewport candidates
          // (TASK-210).
          sizes="(max-width: 639px) 130px, 150px"
        />
        {onSale && (
          <span className="absolute top-2 left-2 rounded-md bg-sale px-2 py-0.5 text-xs font-bold text-sale-foreground">
            −{discount}%
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base leading-snug font-semibold text-foreground">
          <Link
            href={`/products/${item.productSlug}`}
            className="transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.productName}
          </Link>
        </h3>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
          <div className="flex flex-col leading-tight">
            {onSale && item.compareAtPrice && (
              <span className="font-mono text-[13px] text-muted-foreground line-through">
                {formatMoney(item.compareAtPrice)}
              </span>
            )}
            <b
              className={`font-display text-2xl font-bold ${
                onSale ? "text-sale" : "text-foreground"
              }`}
            >
              {formatMoney(item.price)}
            </b>
          </div>

          <div className="flex w-[280px] max-w-full items-stretch gap-2">
            <div className="flex-1">
              <AddToCartButton
                productId={item.productId}
                compact
                outOfStock={outOfStock}
                ariaLabel={dict.productCard.quickAddAria(item.productName)}
              />
            </div>
            <WishlistToggleButton
              productId={item.productId}
              productName={item.productName}
              variant="inline"
            />
          </div>
        </div>
      </div>
    </article>
  );
}
