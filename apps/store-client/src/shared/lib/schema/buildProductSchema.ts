import type {
  PublicProductEntity,
  ProductImageEntity,
} from "@/shared/api/generated/models";
// Imported from the MODULE, not the `@/shared/lib/seo` barrel: that barrel also
// re-exports `indexnow`, which pulls in `@sentry/nextjs`. `shared/lib/index.ts`
// re-exports this schema module, so a barrel import here would drag Sentry into
// every component that touches `@/shared/lib` — and under Jest, where
// `@sentry/nextjs` does not resolve, that takes down the whole suite.
import { stripFormatting } from "@/shared/lib/seo/resolveSeo";

/** Inputs for {@link buildProductSchema}. */
export interface BuildProductSchemaInput {
  product: PublicProductEntity;
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
 * - `aggregateRating` is emitted from the product's approved-review summary
 *   (`ratingAverage` / `ratingCount`) when it has at least one review; omitted
 *   otherwise so Google never sees an empty rating.
 *
 * Pure function — no React/routing/API dependency (unit-testable).
 */
export function buildProductSchema(
  input: BuildProductSchemaInput,
): Record<string, unknown> {
  const { product, images, siteUrl, currency, brandName } = input;
  const url = `${siteUrl}/products/${product.slug}`;

  const price = resolvePrice(product.price);
  const inStock = product.inStock;

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

  // Schema.org `description` is plain text, and product descriptions are rich
  // text since TASK-361 — emit the stripped form, or the JSON-LD Google reads
  // would be a soup of <p>/<br> tags. Reuses the same `stripFormatting` the
  // meta-description tier-3 fallback and the merchant feed already use, so all
  // three derive identical prose from one description.
  const descriptionText =
    typeof product.description === "string"
      ? stripFormatting(product.description)
      : "";
  if (descriptionText.length > 0) {
    schema.description = descriptionText;
  }
  if (typeof product.sku === "string" && product.sku.length > 0) {
    schema.sku = product.sku;
  }
  if (imageUrls.length > 0) {
    schema.image = imageUrls;
  }
  if (product.ratingCount > 0 && product.ratingAverage !== null) {
    schema.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: product.ratingAverage,
      reviewCount: product.ratingCount,
      bestRating: 5,
      worstRating: 1,
    };
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
