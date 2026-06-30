"use client";

import Link from "next/link";
import type { WishlistItemEntity } from "@/entities/wishlist";
import { AddToCartButton } from "@/features/add-to-cart";
import { WishlistToggleButton } from "@/features/toggle-wishlist";
import { ProductCardImage } from "@/shared/ui";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";

/**
 * WishlistItemCard — a single saved product on the `/wishlist` grid.
 *
 * The wishlist API returns a trimmed product summary (name, slug, image, price,
 * stock) rather than the full `PublicProductEntity` the catalog `ProductCard`
 * expects (no rating / variant-summary), so this is a dedicated, lighter card.
 * It reuses the shared `ProductCardImage`, the heart toggle (which removes the
 * product here), and the compact AddToCartButton. The product position id is
 * directly buyable, so it doubles as the cart target.
 */
export function WishlistItemCard({ item }: { item: WishlistItemEntity }) {
  const onSale =
    item.compareAtPrice != null &&
    Number(item.compareAtPrice) > Number(item.price);
  const outOfStock = item.stock <= 0 || !item.isActive;
  const gradient = pickProductGradient(item.productSlug || item.productName);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lift)]">
      <div
        className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${gradient}`}
      >
        <ProductCardImage
          src={item.imageUrl ?? undefined}
          alt={item.productName}
          initial={(item.productName?.[0] ?? "?").toUpperCase()}
        />

        {/* Heart removes the product from the wishlist (it is already saved). */}
        <div className="absolute right-2.5 top-2.5 z-20">
          <WishlistToggleButton
            productId={item.productId}
            productName={item.productName}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
          <Link
            href={`/products/${item.productSlug}`}
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
