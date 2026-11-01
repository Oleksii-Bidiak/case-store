import Link from "next/link";
import type { PublicProductEntity } from "@/shared/api/generated/models";
import { formatMoney, getCardPricing, pickProductGradient } from "@/shared/lib";
import { dict } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Badge, ProductCardImage, RatingStars } from "@/shared/ui";
import { DeviceFitMark } from "@/features/device-fit";
import { ProductCardActions } from "@/widgets/product-card-actions";
import { ProductQuickViewTrigger } from "@/widgets/product-quick-view";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductListItem — the catalog «list» row (Catalog mockup §4, TASK-1958).
 *
 *   < 768px — a 96px photo beside the body (name, rating, fit mark); the buy
 *             area spans the full width under both: price, stock line, then
 *             «Купити» and the heart pushed to the right.
 *   ≥ 768px — three columns, centred: a 132px photo, the body (plus a
 *             «Швидкий перегляд» pill), and a 250px buy column — price over
 *             the stock line over the buttons, like a card footer.
 *
 * A flex row that wraps, not a grid, so the column widths stay on the spacing
 * scale (`size-24` / `size-33` / `w-62.5`) without an arbitrary template. Same
 * price / sale / «new» logic as `ProductCard`.
 */
export function ProductListItem({ product }: { product: PublicProductEntity }) {
  // Each card is ONE position (TASK-142), so it advertises its OWN price; the
  // «від» prefix only survives on the group's cheapest position (TASK-199).
  const { advertisedPrice, showFrom, onSale, discountPercent } =
    getCardPricing(product);

  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  const gradient = pickProductGradient(product.slug || product.name);

  return (
    <article
      data-slot="product-list-item"
      className="flex flex-wrap gap-x-3 gap-y-2.5 rounded-card bg-card p-2.5 shadow-card md:flex-nowrap md:items-center md:gap-4 md:p-3"
    >
      <div
        // Hover zoom + `object-contain` both live in `ProductCardImage`.
        className={`relative flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-menu bg-gradient-to-br md:size-33 ${gradient}`}
      >
        <ProductCardImage
          src={product.primaryImage?.url}
          alt={product.primaryImage?.alt ?? product.name}
          blurDataUrl={product.primaryImage?.blurDataUrl}
          initial={(product.name?.[0] ?? "?").toUpperCase()}
          // A fixed 96 / 132px thumbnail — without this the grid default
          // downloads ~full-viewport candidates (TASK-210).
          sizes="(max-width: 767px) 96px, 132px"
        />
        <div className="absolute top-1.5 left-1.5 z-10 flex flex-col gap-1">
          {onSale && <Badge variant="sale">−{discountPercent}%</Badge>}
          {isNew && !onSale && (
            <Badge variant="success">{dict.product.newBadge}</Badge>
          )}
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <h3 className="line-clamp-3 text-base leading-snug font-semibold">
          <Link
            href={`/products/${product.slug}`}
            className="rounded-sm text-foreground transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
          >
            {product.name}
          </Link>
        </h3>
        <RatingStars
          average={product.ratingAverage}
          count={product.ratingCount}
        />
        {/* «Підходить до / Не для <модель>» (TASK-1953) — under the rating in
            a list row, one truncating line; the full text is in its `title`.
            The slot is reserved for products with compatibility data, so the
            mark appears without moving the row. */}
        <DeviceFitMark
          compatibleDeviceModelIds={product.compatibleDeviceModelIds}
          layout="truncate"
          reserveSpace
          className="max-w-full"
        />
        {/* Quick view — a pill in the body from 768px (Catalog mockup §4);
            hidden below that, where the row has no room for it. */}
        <div className="hidden md:block">
          <ProductQuickViewTrigger
            product={product}
            className="size-8 rounded-full bg-muted shadow-none backdrop-blur-none hover:bg-muted/70"
          />
        </div>
      </div>

      {/* The buy area: full width under photo + body below 768px, a 250px
          column from 768px. */}
      <div className="flex basis-full flex-wrap items-center gap-x-3 gap-y-2 md:w-62.5 md:shrink-0 md:basis-auto md:flex-col md:flex-nowrap md:items-stretch">
        <div className="flex flex-wrap items-baseline gap-x-2">
          {showFrom && (
            <span className="text-xs text-muted-foreground">
              {dict.productCard.priceFrom}
            </span>
          )}
          <p
            className={cn(
              "text-lg font-bold whitespace-nowrap tabular-nums",
              onSale ? "text-sale" : "text-foreground",
            )}
          >
            {formatMoney(advertisedPrice)}
          </p>
          {onSale && product.compareAtPrice && (
            <p className="text-sm whitespace-nowrap text-muted-foreground tabular-nums line-through">
              {formatMoney(product.compareAtPrice)}
            </p>
          )}
        </div>
        <div className="min-w-0 flex-1 md:flex-none">
          <ProductCardActions product={product} showFit={false} layout="list" />
        </div>
      </div>
    </article>
  );
}
