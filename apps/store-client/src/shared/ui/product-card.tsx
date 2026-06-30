import type { ReactNode } from "react";
import Link from "next/link";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge } from "./badge";
import { ProductCardImage } from "./product-card-image";
import { RatingStars } from "./rating-stars";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductCard — "dumb" presentational card for a single product.
 *
 * Links to the product detail page. When the list API returns a `primaryImage`
 * the card renders it (optimized via `next/image` inside `ProductCardImage`);
 * otherwise it falls back to a styled gradient placeholder (a product's initial
 * over a deterministic gradient) so the grid never looks empty. Sale, discount %
 * and New badges derive from existing entity fields.
 *
 * `action` is an optional slot (e.g. an AddToCart button) rendered below the
 * price. It lives OUTSIDE the navigation <Link> so an interactive control is
 * never nested in an anchor — keeps the markup valid and accessible. shared/ui
 * stays free of feature imports; widgets inject the action.
 *
 * `priority` marks above-the-fold cards (the first grid row) for eager loading
 * to improve LCP; the listing widget passes it for `index < 4`.
 */
export function ProductCard({
  product,
  action,
  priority = false,
}: {
  product: PublicProductEntity;
  action?: ReactNode;
  priority?: boolean;
}) {
  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price);

  const discountPercent =
    onSale && product.compareAtPrice
      ? Math.round(
          (1 - Number(product.price) / Number(product.compareAtPrice)) * 100,
        )
      : 0;

  // "New" is a 30-day recency badge; it intentionally reads the current time.
  // The card renders server-side per request, so this is deterministic enough —
  // a product crossing the boundary between renders is harmless.
  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  const gradient = pickProductGradient(product.slug || product.name);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lift)]">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <div
          className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${gradient}`}
        >
          <ProductCardImage
            src={product.primaryImage?.url}
            alt={product.primaryImage?.alt ?? product.name}
            initial={(product.name?.[0] ?? "?").toUpperCase()}
            priority={priority}
          />

          <div className="absolute left-2.5 top-2.5 flex flex-col gap-1">
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

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
            {product.name}
          </h3>
          <RatingStars
            average={product.ratingAverage}
            count={product.ratingCount}
          />
          <div className="mt-auto flex items-baseline gap-2">
            <p
              className={`text-lg font-bold tracking-tight font-display ${onSale ? "text-sale" : "text-foreground"}`}
            >
              {formatMoney(product.price)}
            </p>
            {onSale && product.compareAtPrice && (
              <p className="text-sm text-muted-foreground line-through">
                {formatMoney(product.compareAtPrice)}
              </p>
            )}
          </div>
        </div>
      </Link>

      {action && <div className="px-4 pb-4">{action}</div>}
    </article>
  );
}
