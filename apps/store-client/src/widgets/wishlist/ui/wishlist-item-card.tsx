"use client";

import Link from "next/link";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import {
  ProductCardBadges,
  ProductCardImage,
  ProductCardSoldOutVeil,
} from "@/shared/ui";
import { formatMoney, getCardPricing, pickProductGradient } from "@/shared/lib";
import { cn } from "@/shared/lib/utils";
import { isInStock } from "../model/wishlist-catalog";
import { WishlistCardActions } from "./wishlist-card-actions";

/**
 * WishlistItemCard — a single saved product on the `/wishlist` grid.
 *
 * The wishlist API returns a trimmed product summary (name, slug, image, price,
 * maxQty) rather than the full `PublicProductEntity` the catalog `ProductCard`
 * expects (no rating / variant-summary), so this is a dedicated, lighter card
 * with the catalogue card's frame. Since Д3-2 (TASK-1300) its footer is the
 * catalogue's action block too — `WishlistCardActions`: the fit mark for the
 * saved devices, the stock line, «Купити» and the heart, which sits in the
 * action row (not on the photo) and removes the product with an undo. The
 * product position id is directly buyable, so it doubles as the cart target.
 *
 * Status parity with the catalogue card (TASK-875): the same
 * `ProductCardBadges` stack (sold out, then −N %) and the same
 * `ProductCardSoldOutVeil` over a sold-out photo, the discount from the shared
 * `getCardPricing`, and the same whole-card focus ring keyed off the stretched
 * link. «Новинка» is the one badge it cannot show: the item carries the date it
 * was SAVED, not the product's creation date the 30-day badge reads.
 *
 * The image takes `ProductCardImage`'s default `sizes` (TASK-530): the wishlist
 * grid is the catalogue's `PRODUCT_GRID_CLASS` beside the same 268px rail, so
 * the slots are the same width and `PRODUCT_GRID_IMAGE_SIZES` fits them.
 */
export function WishlistItemCard({
  item,
  compatibleDeviceModelIds,
  onRemove,
}: {
  item: WishlistItemEntity;
  /** From the product card (`useWishlistFacets`); `undefined` while it loads. */
  compatibleDeviceModelIds: readonly string[] | undefined;
  onRemove: (item: WishlistItemEntity) => void;
}) {
  const { onSale, discountPercent } = getCardPricing({
    price: item.price,
    compareAtPrice: item.compareAtPrice,
  });
  // maxQty is the API-side cap (min of the per-item limit and stock, TASK-231);
  // 0 means out of stock — the raw stock figure never reaches the client. A
  // withdrawn product (`isActive: false`) reads as sold out too.
  const inStock = isInStock(item);
  const gradient = pickProductGradient(item.productSlug || item.productName);

  return (
    // The ProductCard frame and states (TASK-2171, TASK-2079) — keep the two
    // identical (TASK-875): lift only while in stock.
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-card transition-interactive hover:border-foreground/25 has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-3 has-[[data-card-link]:focus-visible]:outline-solid has-[[data-card-link]:focus-visible]:outline-ring",
        inStock &&
          "hover:-translate-y-1 hover:shadow-lift active:-translate-y-px active:shadow-card motion-reduce:hover:translate-y-0 motion-reduce:active:translate-y-0",
      )}
    >
      <div
        className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${gradient}`}
      >
        <ProductCardImage
          src={item.imageUrl ?? undefined}
          alt={item.productName}
          initial={(item.productName?.[0] ?? "?").toUpperCase()}
        />
        {!inStock && <ProductCardSoldOutVeil />}
        <ProductCardBadges
          inStock={inStock}
          discountPercent={onSale ? discountPercent : 0}
        />

        {/* Quick-view — the same hover-reveal overlay the catalog ProductCard
            injects into its `hoverAction` slot: hidden (and non-interactive to
            pointers) until the card is hovered or receives keyboard focus, then
            slides up. Above the stretched link (z-20) so it opens without
            navigating. The trigger only needs the item's name + slug. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-1.5 p-2.5 opacity-0 transition-interactive group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:translate-y-0">
          <ProductQuickViewTrigger
            product={{ name: item.productName, slug: item.productSlug }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 min-h-10 text-sm font-medium text-card-foreground decoration-1 underline-offset-3 group-hover:underline">
          <Link
            href={`/products/${item.productSlug}`}
            data-card-link
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element requires an explicit content value; empty string is the only correct one
            className="after:absolute after:inset-0 after:z-10 after:content-[''] focus:outline-none"
          >
            {item.productName}
          </Link>
        </h3>

        <div className="mt-auto flex items-baseline gap-2">
          <p
            className={`text-lg font-bold tracking-tight font-display ${onSale ? "text-sale" : "text-foreground"}`}
          >
            {formatMoney(item.price)}
          </p>
          {onSale && item.compareAtPrice && (
            <p className="text-sm text-muted-foreground line-through">
              {formatMoney(item.compareAtPrice)}
            </p>
          )}
        </div>
      </div>

      {/* Above the stretched link so its controls stay clickable — the
          `ProductCard` `action` slot, same padding. */}
      <div className="relative z-20 px-4 pb-4">
        <WishlistCardActions
          item={item}
          compatibleDeviceModelIds={compatibleDeviceModelIds}
          onRemove={onRemove}
        />
      </div>
    </article>
  );
}
