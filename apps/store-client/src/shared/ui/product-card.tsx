"use client";

import Link from "next/link";
import type { ProductEntity } from "@/shared/api/generated/models";

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

/** Format a decimal string price ("29.99") as a currency string. */
function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
}

/**
 * ProductCard — "dumb" presentational card for a single product.
 * Links to the product detail page. No business logic; AddToCart is
 * added later as a feature (TASK-032).
 */
export function ProductCard({ product }: { product: ProductEntity }) {
  const onSale =
    product.compareAtPrice != null &&
    Number(product.compareAtPrice) > Number(product.price);

  return (
    <article className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card">
      <Link
        href={`/products/${product.slug}`}
        className="flex flex-1 flex-col focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="relative aspect-square w-full bg-muted">
          {onSale && (
            <span className="absolute left-2 top-2 rounded-md bg-destructive px-2 py-0.5 text-xs font-semibold text-destructive-foreground">
              Sale
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h3 className="line-clamp-2 text-sm font-medium text-card-foreground group-hover:text-primary">
            {product.name}
          </h3>
          <div className="mt-auto flex items-baseline gap-2">
            <p className="text-base font-semibold text-foreground">
              {formatPrice(product.price)}
            </p>
            {onSale && product.compareAtPrice && (
              <p className="text-sm text-muted-foreground line-through">
                {formatPrice(product.compareAtPrice)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}
