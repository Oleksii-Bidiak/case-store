"use client";

import type { ProductVariantEntity } from "@/entities/product";

interface ProductVariantSelectorProps {
  variants: ProductVariantEntity[];
  selectedVariantId: string | null;
  onVariantChange: (variantId: string) => void;
  /** Base product price, used to decide whether to surface a variant's price. */
  basePrice: string;
}

const priceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatPrice(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount) ? priceFormatter.format(amount) : value;
}

/**
 * ProductVariantSelector — renders selectable variant buttons. Out-of-stock
 * variants are disabled; inactive variants are not rendered. Renders nothing
 * when the product has no variants (the parent shows the base price instead).
 */
export function ProductVariantSelector({
  variants,
  selectedVariantId,
  onVariantChange,
  basePrice,
}: ProductVariantSelectorProps) {
  const activeVariants = variants.filter((variant) => variant.isActive);

  if (activeVariants.length === 0) {
    return null;
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-foreground">
        Choose a variant
      </legend>
      <div className="flex flex-wrap gap-2">
        {activeVariants.map((variant) => {
          const isSelected = variant.id === selectedVariantId;
          const outOfStock = variant.stock === 0;
          const showPrice = variant.price !== basePrice;

          return (
            <button
              key={variant.id}
              type="button"
              aria-pressed={isSelected}
              disabled={outOfStock}
              onClick={() => onVariantChange(variant.id)}
              className={`flex flex-col items-start gap-1 rounded-lg border-2 px-4 py-2 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
                isSelected
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-primary"
              }`}
            >
              <span className="text-sm font-medium text-foreground">
                {variant.name}
              </span>
              {showPrice && (
                <span className="text-sm text-muted-foreground">
                  {formatPrice(variant.price)}
                </span>
              )}
              <span
                className={`text-xs ${
                  outOfStock ? "text-destructive" : "text-muted-foreground"
                }`}
              >
                {outOfStock ? "Out of stock" : `In stock (${variant.stock})`}
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
