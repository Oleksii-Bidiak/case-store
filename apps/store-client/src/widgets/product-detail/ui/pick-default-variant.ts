import type { ProductVariantEntity } from "@/entities/product";

/**
 * Pick the default variant for the product detail page (TASK-126).
 *
 * The product card advertises `product.price` (the base/lowest price) and its
 * sale badge. To make the PDP's default selection match what the shopper
 * clicked, we pre-select the active variant with the numerically lowest price
 * — not the alphabetically-first active variant the API returns (which caused
 * the "wrong variant opened" report). Returns `null` when there is no active
 * variant, in which case the PDP shows the base product price.
 */
export function pickCheapestActiveVariantId(
  variants: ProductVariantEntity[],
): string | null {
  const active = variants.filter((variant) => variant.isActive);
  if (active.length === 0) {
    return null;
  }
  return active.reduce((cheapest, variant) =>
    Number(variant.price) < Number(cheapest.price) ? variant : cheapest,
  ).id;
}
