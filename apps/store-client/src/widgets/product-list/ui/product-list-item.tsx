import Link from "next/link";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge, ProductCardImage, RatingStars } from "@/shared/ui";
import { ProductCardActions } from "@/widgets/product-card-actions";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductListItem — horizontal product row for the catalog "list" view. Reuses
 * the same price / sale / "new" logic and sub-primitives as `ProductCard`, laid
 * out as a wide row: gradient image on the left, then name + rating, with the
 * price and add-to-cart actions pinned to the bottom.
 */
export function ProductListItem({ product }: { product: PublicProductEntity }) {
  const summary = product.variantSummary;
  const colors = summary?.colors ?? [];
  const hasVariants = colors.length > 1;

  const advertisedPrice =
    summary && Number(summary.priceFrom) < Number(product.price)
      ? summary.priceFrom
      : product.price;
  const showFrom = advertisedPrice !== product.price || hasVariants;

  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(advertisedPrice);

  const discountPercent =
    onSale && product.compareAtPrice
      ? Math.round(
          (1 - Number(advertisedPrice) / Number(product.compareAtPrice)) * 100,
        )
      : 0;

  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  const gradient = pickProductGradient(product.slug || product.name);

  return (
    <article className="group flex flex-col gap-5 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-colors hover:border-primary/30 sm:flex-row">
      <div
        className={`relative flex size-[150px] shrink-0 items-center justify-center overflow-hidden rounded-xl bg-gradient-to-br [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-105 ${gradient}`}
      >
        <ProductCardImage
          src={product.primaryImage?.url}
          alt={product.primaryImage?.alt ?? product.name}
          blurDataUrl={product.primaryImage?.blurDataUrl}
          initial={(product.name?.[0] ?? "?").toUpperCase()}
        />
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {onSale && (
            <Badge variant="sale" className="shadow-sm">
              −{discountPercent}%
            </Badge>
          )}
          {isNew && !onSale && (
            <Badge variant="success" className="shadow-sm">
              {dict.product.newBadge}
            </Badge>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="text-base leading-snug font-semibold">
          <Link
            href={`/products/${product.slug}`}
            className="text-foreground transition-colors hover:text-primary"
          >
            {product.name}
          </Link>
        </h3>
        <div className="mt-2">
          <RatingStars
            average={product.ratingAverage}
            count={product.ratingCount}
          />
        </div>

        <div className="mt-auto flex flex-wrap items-end justify-between gap-4 pt-4">
          <div className="flex items-baseline gap-2">
            {showFrom && (
              <span className="text-xs text-muted-foreground">
                {dict.productCard.priceFrom}
              </span>
            )}
            <p
              className={`font-display text-2xl font-bold tracking-tight ${
                onSale ? "text-sale" : "text-foreground"
              }`}
            >
              {formatMoney(advertisedPrice)}
            </p>
            {onSale && product.compareAtPrice && (
              <p className="text-sm text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice)}
              </p>
            )}
          </div>
          <div className="w-full sm:w-[280px]">
            <ProductCardActions product={product} />
          </div>
        </div>
      </div>
    </article>
  );
}
