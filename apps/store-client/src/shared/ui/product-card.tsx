import type { ReactNode } from "react";
import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { formatMoney, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge } from "./badge";
import { RatingStars } from "./rating-stars";
import { ColorDots } from "./color-dots";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductCard — "dumb" presentational card for a single product.
 *
 * Uses the "stretched link" pattern: only the product name is a real <Link>, but
 * its `::after` overlay stretches over the whole card so the entire card is
 * clickable. This lets the optional `quickAdd` overlay sit ABOVE the link
 * (higher z-index) and stay independently clickable — without nesting an
 * interactive control inside an anchor (invalid + inaccessible). shared/ui stays
 * free of feature imports; widgets inject `quickAdd`/`action`.
 *
 * When the list API reports multiple variant colours, the card renders a
 * `ColorDots` row from `product.variantSummary` and an advertised "from {price}"
 * prefix. `quickAdd` is revealed on hover and on keyboard focus (focus-within),
 * so it is reachable without a pointer.
 */
export function ProductCard({
  product,
  action,
  quickAdd,
}: {
  product: PublicProductEntity;
  /** Optional control rendered below the price (always visible). */
  action?: ReactNode;
  /** Optional quick-add control overlaid on the image, shown on hover/focus. */
  quickAdd?: ReactNode;
}) {
  const summary = product.variantSummary;
  const colors = summary?.colors ?? [];
  const hasVariants = colors.length > 1;

  // Advertised price: the group's cheapest ("from") when it is below this
  // position's own price; otherwise the position price as-is.
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

  // "New" is a 30-day recency badge; it intentionally reads the current time.
  // The card renders server-side per request, so this is deterministic enough —
  // a product crossing the boundary between renders is harmless.
  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  const gradient = pickProductGradient(product.slug || product.name);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[var(--shadow-lift)] has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring has-[[data-card-link]:focus-visible]:ring-offset-2 has-[[data-card-link]:focus-visible]:ring-offset-background">
      <div
        className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br ${gradient}`}
      >
        {product.primaryImage ? (
          // next/image optimization + remote-host config deferred to TASK-074.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.primaryImage.url}
            alt={product.primaryImage.alt ?? product.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* Styled placeholder — product has no image. */
          <div className="flex h-full w-full items-center justify-center">
            <span
              aria-hidden="true"
              className="text-6xl font-bold tracking-tight opacity-60 select-none font-display"
            >
              {(product.name?.[0] ?? "?").toUpperCase()}
            </span>
            <ImageIcon
              className="absolute bottom-3 right-3 size-5 opacity-50"
              aria-hidden="true"
            />
          </div>
        )}

        <div className="absolute left-2.5 top-2.5 z-20 flex flex-col gap-1">
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

        {/* Quick-add overlay — sits above the stretched link (z-20) so it stays
            independently clickable. Hidden (and non-interactive to pointers)
            until hover or keyboard focus enters the card, then slides up. */}
        {quickAdd && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-2 p-2.5 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100">
            {quickAdd}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
          <Link
            href={`/products/${product.slug}`}
            data-card-link
            className="after:absolute after:inset-0 after:z-10 after:content-[''] focus:outline-none"
          >
            {product.name}
          </Link>
        </h3>
        <RatingStars
          average={product.ratingAverage}
          count={product.ratingCount}
        />
        {hasVariants && <ColorDots colors={colors} />}
        <div className="mt-auto flex items-baseline gap-2">
          {showFrom && (
            <span className="text-xs text-muted-foreground">
              {dict.productCard.priceFrom}
            </span>
          )}
          <p
            className={`text-lg font-bold tracking-tight font-display ${onSale ? "text-sale" : "text-foreground"}`}
          >
            {formatMoney(advertisedPrice)}
          </p>
          {onSale && product.compareAtPrice && (
            <p className="text-sm text-muted-foreground line-through">
              {formatMoney(product.compareAtPrice)}
            </p>
          )}
        </div>
      </div>

      {action && <div className="relative z-20 px-4 pb-4">{action}</div>}
    </article>
  );
}
