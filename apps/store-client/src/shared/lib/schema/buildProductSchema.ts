import type {
  ProductEntity,
  ProductImageEntity,
  ProductVariantEntity,
} from "@/shared/api/generated/models";

/** Inputs for {@link buildProductSchema}. */
export interface BuildProductSchemaInput {
  product: ProductEntity;
  images: ProductImageEntity[];
  variants: ProductVariantEntity[];
  siteUrl: string;
  currency: string;
  brandName: string;
}

/**
 * Build a Schema.org Product JSON-LD graph from the product detail response.
 *
 * - `price` is the lowest active-variant price when variants exist, otherwise
 *   the product-level price. `offers` is omitted entirely when no usable price.
 * - `availability` is InStock when any active variant has stock (or when there
 *   are no variants), else OutOfStock.
 * - `sku`, `description`, and `image` are omitted when absent.
 * - `aggregateRating` / `review` are intentionally deferred — the API exposes no
 *   review data yet (see plan 033, decision A7).
 *
 * Pure function — no React/routing/API dependency (unit-testable).
 */
export function buildProductSchema(
  input: BuildProductSchemaInput,
): Record<string, unknown> {
  const { product, images, variants, siteUrl, currency, brandName } = input;
  const url = `${siteUrl}/products/${product.slug}`;

  const activeVariants = variants.filter((v) => v.isActive);
  const price = resolvePrice(activeVariants, product.price);
  const inStock =
    activeVariants.length > 0 ? activeVariants.some((v) => v.stock > 0) : true;

  const imageUrls = [...images]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((img) => img.url)
    .filter((u): u is string => typeof u === "string" && u.length > 0);

  const schema: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    brand: { "@type": "Brand", name: brandName },
  };

  if (
    typeof product.description === "string" &&
    product.description.length > 0
  ) {
    schema.description = product.description;
  }
  if (typeof product.sku === "string" && product.sku.length > 0) {
    schema.sku = product.sku;
  }
  if (imageUrls.length > 0) {
    schema.image = imageUrls;
  }
  if (price !== null) {
    schema.offers = {
      "@type": "Offer",
      url,
      priceCurrency: currency,
      price,
      availability: inStock
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
    };
  }

  return schema;
}

/**
 * Lowest active-variant price (formatted to 2 decimals) when present, otherwise
 * the product price string as-is. Returns null when no valid price exists.
 */
function resolvePrice(
  activeVariants: ProductVariantEntity[],
  fallback: string,
): string | null {
  const variantPrices = activeVariants
    .map((v) => Number(v.price))
    .filter((n) => Number.isFinite(n) && n >= 0);

  if (variantPrices.length > 0) {
    return Math.min(...variantPrices).toFixed(2);
  }

  const fb = Number(fallback);
  return fallback.trim().length > 0 && Number.isFinite(fb) ? fallback : null;
}
