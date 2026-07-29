import type { ReactNode } from "react";
import Link from "next/link";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { formatMoney, getCardPricing, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge } from "./badge";
import { ProductCardImage } from "./product-card-image";
import { RatingStars } from "./rating-stars";
import { ColorDots } from "./color-dots";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductCard — "dumb" presentational card for a single product.
 *
 * Uses the "stretched link" pattern: only the product name is a real <Link>, but
 * its `::after` overlay stretches over the whole card so the entire card is
 * clickable. This lets the optional `hoverAction` overlay sit ABOVE the link
 * (higher z-index) and stay independently clickable — without nesting an
 * interactive control inside an anchor (invalid + inaccessible). shared/ui stays
 * free of feature imports; widgets inject `hoverAction`/`action`.
 *
 * When the list API reports multiple variant colours, the card renders a
 * `ColorDots` row from `product.variantSummary`. The price is ALWAYS this
 * position's own `product.price` (each card is one first-class position); the
 * "від {price}" prefix only appears on the group's cheapest position — see
 * `getCardPricing` (TASK-199). `hoverAction` is revealed on hover and on keyboard
 * focus (focus-within), so it is reachable without a pointer.
 *
 * The product image is optimized via `next/image` inside `ProductCardImage`,
 * which also renders the gradient/initial fallback when there is no image.
 * `priority` marks above-the-fold cards (the first grid row) for eager loading
 * to improve LCP; the listing widget passes it for `index < 4`.
 */
export function ProductCard({
  product,
  action,
  hoverAction,
  wishlist,
  priority = false,
  imageSizes,
}: {
  product: PublicProductEntity;
  /** Optional control rendered below the price (always visible). */
  action?: ReactNode;
  /**
   * Optional control overlaid on the bottom of the image, revealed on hover and
   * keyboard focus (a generic hover-reveal slot — quick-view is its first real
   * consumer). Sits above the stretched link (z-20) so it stays independently
   * clickable without nesting an interactive control inside the card anchor.
   */
  hoverAction?: ReactNode;
  /**
   * Optional wishlist heart pinned to the image's top-right corner (always
   * visible, above the stretched link so it stays independently clickable).
   * Injected by widgets; shared/ui stays free of feature imports.
   */
  wishlist?: ReactNode;
  priority?: boolean;
  /**
   * `sizes` forwarded to the card image. Contexts where the card width is NOT
   * the responsive grid default (e.g. fixed-width rail slides) must pass their
   * real slot width so small viewports don't download full-width images
   * (TASK-210).
   */
  imageSizes?: string;
}) {
  const summary = product.variantSummary;
  const colors = summary?.colors ?? [];
  const hasVariants = colors.length > 1;

  // Each card is ONE position (TASK-142), so it advertises its OWN price; the
  // «від» prefix only survives on the group's cheapest position (TASK-199).
  const { advertisedPrice, showFrom, onSale, discountPercent } =
    getCardPricing(product);

  // "New" is a 30-day recency badge; it intentionally reads the current time.
  // The card renders server-side per request, so this is deterministic enough —
  // a product crossing the boundary between renders is harmless.
  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  const gradient = pickProductGradient(product.slug || product.name);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-border bg-card transition-all duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-lift has-[[data-card-link]:focus-visible]:ring-2 has-[[data-card-link]:focus-visible]:ring-ring has-[[data-card-link]:focus-visible]:ring-offset-2 has-[[data-card-link]:focus-visible]:ring-offset-background">
      <div
        className={`relative aspect-square w-full overflow-hidden bg-gradient-to-br [&_img]:transition-transform [&_img]:duration-500 group-hover:[&_img]:scale-105 ${gradient}`}
      >
        {/* Sold-out products are dimmed rather than hidden (TASK-362): they stay
            browsable and indexable, but a shopper can tell at a glance across a
            grid, instead of only finding out on the product page. The card is
            `shared/ui` and already receives the whole entity, so this needs no
            new prop — `inStock` is derived server-side from the position row. */}
        <ProductCardImage
          src={product.primaryImage?.url}
          alt={product.primaryImage?.alt ?? product.name}
          blurDataUrl={product.primaryImage?.blurDataUrl}
          initial={(product.name?.[0] ?? "?").toUpperCase()}
          priority={priority}
          sizes={imageSizes}
        />
        {!product.inStock && (
          <span
            aria-hidden="true"
            className="absolute inset-0 z-10 bg-card/55"
          />
        )}

        <div className="absolute left-2.5 top-2.5 z-20 flex flex-col gap-1">
          {!product.inStock && (
            <Badge variant="secondary" className="shadow-sm">
              {dict.product.outOfStock}
            </Badge>
          )}
          {onSale && (
            <Badge variant="sale" className="shadow-sm">
              −{discountPercent}%
            </Badge>
          )}
          {isNew && !onSale && product.inStock && (
            <Badge variant="success" className="shadow-sm">
              {dict.product.newBadge}
            </Badge>
          )}
        </div>

        {/* Wishlist heart — pinned top-right, above the stretched link (z-20) so
            it stays independently clickable without nesting a control in the
            anchor. */}
        {wishlist && (
          <div className="absolute right-2.5 top-2.5 z-20">{wishlist}</div>
        )}

        {/* Hover-reveal overlay — sits above the stretched link (z-20) so it
            stays independently clickable. Hidden (and non-interactive to
            pointers) until hover or keyboard focus enters the card, then slides
            up. */}
        {hoverAction && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 translate-y-2 p-2.5 opacity-0 transition-all duration-200 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
            {hoverAction}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
          <Link
            href={`/products/${product.slug}`}
            data-card-link
            // eslint-disable-next-line tailwindcss/no-arbitrary-value -- pseudo-element requires an explicit content value; empty string is the only correct one
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
