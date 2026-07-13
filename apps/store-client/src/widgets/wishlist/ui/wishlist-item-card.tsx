"use client";

import Link from "next/link";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";
import { ProductCardImage } from "@/shared/ui";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";

/**
 * Wishlist grid: `repeat(auto-fill, minmax(232px, 1fr))` inside the
 * `max-w-[1320px]` page, minus the 268px sidebar + 28px gap on `lg`. The
 * widest a column gets is ~313px (three 18px-gapped columns in the 976px
 * content area), so cap the srcset hint at 320px instead of the generic
 * viewport-based default (TASK-210).
 */
const WISHLIST_GRID_SIZES =
  "(max-width: 639px) calc(100vw - 2rem), (max-width: 1023px) calc(50vw - 2rem), 320px";

/**
 * WishlistItemCard — a single saved product on the `/wishlist` grid.
 *
 * The wishlist API returns a trimmed product summary (name, slug, image, price,
 * maxQty) rather than the full `PublicProductEntity` the catalog `ProductCard`
 * expects (no rating / variant-summary), so this is a dedicated, lighter card.
 * It reuses the shared `ProductCardImage`, the heart toggle (which removes the
 * product here), and the compact AddToCartButton. The product position id is
 * directly buyable, so it doubles as the cart target.
 */
export function WishlistItemCard({ item }: { item: WishlistItemEntity }) {
  const onSale =
    item.compareAtPrice != null &&
    Number(item.compareAtPrice) > Number(item.price);
  // maxQty is the API-side cap (min of the per-item limit and stock, TASK-231);
  // 0 means out of stock — the raw stock figure never reaches the client.
  const outOfStock = item.maxQty <= 0 || !item.isActive;
  const gradient = pickProductGradient(item.productSlug || item.productName);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift">
      <div
        className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${gradient}`}
      >
        <ProductCardImage
          src={item.imageUrl ?? undefined}
          alt={item.productName}
          initial={(item.productName?.[0] ?? "?").toUpperCase()}
          sizes={WISHLIST_GRID_SIZES}
        />

        {/* Heart removes the product from the wishlist (it is already saved). */}
        <div className="absolute right-2.5 top-2.5 z-20">
          <WishlistToggleButton
            productId={item.productId}
            productName={item.productName}
          />
        </div>

        {/* Quick-view — the same hover-reveal overlay the catalog ProductCard
            injects into its `hoverAction` slot: hidden (and non-interactive to
            pointers) until the card is hovered or receives keyboard focus, then
            slides up. Above the stretched link (z-20) so it opens without
            navigating. The trigger only needs the item's name + slug. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-2 p-2.5 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
          <ProductQuickViewTrigger
            product={{ name: item.productName, slug: item.productSlug }}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
          <Link
            href={`/products/${item.productSlug}`}
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element requires an explicit content value; empty string is the only correct one
            className="after:absolute after:inset-0 after:z-10 after:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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

        {/* Above the stretched link so it stays clickable. */}
        <div className="relative z-20 pt-1">
          <AddToCartButton
            productId={item.productId}
            compact
            outOfStock={outOfStock}
            ariaLabel={dict.productCard.quickAddAria(item.productName)}
          />
        </div>
      </div>
    </article>
  );
}
