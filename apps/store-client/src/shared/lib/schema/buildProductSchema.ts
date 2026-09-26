import type {
  PublicProductEntity,
  ProductImageEntity,
} from "@/shared/api/generated/models";
// Imported from the MODULE, not the `@/shared/lib/seo` barrel. Until TASK-570 the
// barrel re-exported `indexnow`, which pulls in `@sentry/nextjs`, and
// `shared/lib/index.ts` re-exports this schema module — a barrel import here
// would have dragged Sentry into every component touching `@/shared/lib`. The
// barrel is pure now (guarded by `seo-barrel.test.ts`); the direct import stays
// as the narrowest dependency.
import { stripFormatting } from "@/shared/lib/seo/resolveSeo";
import { RETURN_POLICY } from "@/shared/config/return-policy";

/** Inputs for {@link buildProductSchema}. */
export interface BuildProductSchemaInput {
  product: PublicProductEntity;
  images: ProductImageEntity[];
  siteUrl: string;
  currency: string;
  /**
   * Brand for a product that has none of its own — the store's name.
   *
   * Named `brandName` until the TASK-437 GEO audit caught what that name was
   * hiding: the schema emitted it UNCONDITIONALLY, so an Anker cable was
   * published to Google as brand "CaseStore" while `merchant-feed.xml` sent
   * `product.brand?.name` for the same item. Two of our own feeds disagreed
   * about the manufacturer of every branded product in the catalogue, and the
   * call site's comment described the fallback behaviour this code did not have.
   */
  fallbackBrandName: string;
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
  const { product, images, siteUrl, currency, fallbackBrandName } = input;
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
    // The product's real manufacturer wins; the store name stands in only for an
    // unbranded item. This is the rule `merchant-feed.xml` already applies to
    // `g:brand`, so the two feeds finally agree.
    brand: {
      "@type": "Brand",
      name: product.brand?.name ?? fallbackBrandName,
    },
  };

  // Schema.org `description` is plain text, and product descriptions are rich
  // text since TASK-361 — emit the stripped form, or the JSON-LD Google reads
  // would be a soup of <p>/<br> tags. Reuses the same `stripFormatting` the
  // meta-description tier-2 fallback and the merchant feed already use, so all
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
      // TASK-556 — the statutory 14-day return window (see RETURN_POLICY).
      // Google's merchant listings read this; without it a product carries no
      // return information at all. `returnFees` is deliberately NOT stated: who
      // pays the return shipping is the owner's call and is written nowhere yet,
      // and a guessed value in structured data is a false claim, not a gap.
      // `shippingDetails` is absent for the same reason — there is no delivery
      // tariff data to derive it from (its own BACKLOG row).
      hasMerchantReturnPolicy: {
        "@type": "MerchantReturnPolicy",
        applicableCountry: RETURN_POLICY.country,
        returnPolicyCategory:
          "https://schema.org/MerchantReturnFiniteReturnWindow",
        merchantReturnDays: RETURN_POLICY.days,
        returnMethod: "https://schema.org/ReturnByMail",
      },
    };
  }

  return schema;
}

/** The position price string when valid, otherwise null. */
function resolvePrice(price: string): string | null {
  const value = Number(price);
  return price.trim().length > 0 && Number.isFinite(value) ? price : null;
}
