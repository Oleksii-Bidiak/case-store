"use client";

import Link from "next/link";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { ProductCardImage } from "@/shared/ui";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { isOnSale } from "../model/wishlist-catalog";

/**
 * WishlistListItem — a saved product rendered as a horizontal row (the list view
 * of the redesigned wishlist). Reuses the shared image, the compact
 * AddToCartButton and the heart toggle (which removes the item here). Ratings are
 * not shown because the wishlist item summary carries none (unlike the catalog
 * ProductCard).
 *
 * Phones (TASK-1958 — the list view is offered at every width now): the row is
 * a 96px thumbnail beside the title, with the price and the buttons on a full-
 * width second line (Catalog.dc.html §8), instead of squeezing the buy block
 * into the ~170px left beside a 130px thumbnail. The body is `contents` below
 * `sm`, so its title and buy block become the row's own flex items and wrap;
 * from `sm` it is the usual column beside a 150px thumbnail.
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
    <article className="flex flex-wrap items-start gap-x-3 gap-y-2.5 rounded-2xl border border-border bg-card p-2.5 shadow-card sm:flex-nowrap sm:items-stretch sm:gap-5 sm:p-4">
      <div
        className={`relative size-24 shrink-0 overflow-hidden rounded-xl bg-gradient-to-br sm:size-37.5 ${gradient}`}
      >
        <ProductCardImage
          src={item.imageUrl ?? undefined}
          alt={item.productName}
          initial={(item.productName?.[0] ?? "?").toUpperCase()}
          // Fixed thumbnail (`size-24 sm:size-37.5` above) — without this the
          // grid default downloads ~full-viewport candidates (TASK-210).
          sizes="(max-width: 639px) 96px, 150px"
        />
        {onSale && (
          <span className="absolute top-2 left-2 rounded-md bg-sale px-2 py-0.5 text-xs font-bold text-sale-foreground">
            −{discount}%
          </span>
        )}
        {/* Quick-view — like the catalog list row (ProductListItem), the row
            thumbnail has no hover-reveal slot, so the trigger is a small
            persistent icon pinned to its top-right corner. A 96px phone
            thumbnail has no room for it beside the sale badge, so it shows
            from `sm` (the mockup hides it below 768 too); the product page
            is one tap away on the title. */}
        <div className="absolute top-2 right-2 z-10 hidden sm:block">
          <ProductQuickViewTrigger
            product={{ name: item.productName, slug: item.productSlug }}
            className="size-8"
          />
        </div>
      </div>

      <div className="contents sm:flex sm:min-w-0 sm:flex-1 sm:flex-col">
        <h3 className="min-w-0 flex-1 text-sm leading-snug font-semibold text-foreground sm:flex-none sm:text-base">
          <Link
            href={`/products/${item.productSlug}`}
            className="transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.productName}
          </Link>
        </h3>

        <div className="flex basis-full flex-wrap items-center justify-between gap-x-3 gap-y-2 sm:mt-auto sm:basis-auto sm:items-end sm:gap-4 sm:pt-4">
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

          <div className="flex min-w-0 flex-1 basis-56 items-stretch gap-2 sm:w-70 sm:flex-none">
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
