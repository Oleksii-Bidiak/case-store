import Link from "next/link";
import { ImageIcon } from "lucide-react";
import type { ProductEntity } from "@/shared/api/generated/models";
import { formatMoney } from "@/shared/lib";
import { dict } from "@/shared/config";
import { Badge } from "./badge";

const NEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * ProductCard — "dumb" presentational card for a single product.
 *
 * Links to the product detail page. The product *list* API returns no image
 * URL (images live only on the detail response), so the card shows a styled
 * placeholder; if the entity ever carries an image field, swap the placeholder
 * for next/image here. Sale and New badges derive from existing entity fields.
 */
export function ProductCard({ product }: { product: ProductEntity }) {
  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price);

  // "New" is a 30-day recency badge; it intentionally reads the current time.
  // The card renders server-side per request, so this is deterministic enough —
  // a product crossing the boundary between renders is harmless.
  const createdMs = new Date(product.createdAt).getTime();
  // eslint-disable-next-line react-hooks/purity -- recency badge needs current time
  const isNew = Date.now() - createdMs < NEW_WINDOW_MS;

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-[var(--shadow-elevated)]">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-square w-full overflow-hidden bg-muted">
          {/* Placeholder — the list endpoint returns no image URL. */}
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <ImageIcon className="size-12" aria-hidden="true" />
          </div>

          <div className="absolute left-2 top-2 flex flex-col gap-1">
            {onSale && <Badge variant="sale">{dict.product.saleBadge}</Badge>}
            {isNew && !onSale && (
              <Badge variant="success">{dict.product.newBadge}</Badge>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-sm font-medium text-card-foreground transition-colors group-hover:text-primary">
            {product.name}
          </h3>
          <div className="mt-auto flex items-baseline gap-2">
            <p
              className={`text-base font-semibold ${onSale ? "text-sale" : "text-foreground"}`}
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
    </article>
  );
}
