import type {
  ProductEntity,
  ProductImageEntity,
} from "@/shared/api/generated/models";

/** Inputs for {@link buildProductSchema}. */
export interface BuildProductSchemaInput {
  product: ProductEntity;
  images: ProductImageEntity[];
  siteUrl: string;
  currency: string;
  brandName: string;
}

/**
 * Build a Schema.org Product JSON-LD graph from the product detail response.
 *
 * Each product is a first-class position (TASK-142), so `price`, `sku`, and
 * `availability` come straight off the position row:
 * - `price` is the position's price. `offers` is omitted when no usable price.
 * - `availability` is InStock when the position has stock, else OutOfStock.
 * - `sku`, `description`, and `image` are omitted when absent.
 * - `aggregateRating` / `review` are intentionally deferred — the API exposes no
 *   review data yet (see plan 033, decision A7).
 *
 * Pure function — no React/routing/API dependency (unit-testable).
 */
export function buildProductSchema(
  input: BuildProductSchemaInput,
): Record<string, unknown> {
  const { product, images, siteUrl, currency, brandName } = input;
  const url = `${siteUrl}/products/${product.slug}`;

  const price = resolvePrice(product.price);
  const inStock = product.stock > 0;

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

/** The position price string when valid, otherwise null. */
function resolvePrice(price: string): string | null {
  const value = Number(price);
  return price.trim().length > 0 && Number.isFinite(value) ? price : null;
}
