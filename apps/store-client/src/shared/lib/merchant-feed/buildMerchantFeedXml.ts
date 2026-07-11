import { stripFormatting, truncateAtWord } from "@/shared/lib/seo";
import { escapeXml } from "./escapeXml";

/**
 * Narrow product shape for the Merchant Center feed (plan 148, Decision 1).
 *
 * Deliberately NOT the generated `PublicProductEntity` — the builder only
 * needs these 8 fields, and a small local type keeps it pure and its unit
 * tests trivial to set up. The route handler does the narrowing map.
 */
export interface MerchantFeedProduct {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  price: string;
  inStock: boolean;
  brand: { name: string } | null;
  primaryImage: { url: string } | null;
}

export interface BuildMerchantFeedXmlInput {
  products: MerchantFeedProduct[];
  siteUrl: string;
  siteName: string;
  currency: string;
  channelDescription: string;
  fallbackDescription: string;
}

/**
 * Google's `description` attribute limit (5000 chars) — intentionally distinct
 * from `SEO_DESCRIPTION_MAX` (155), which is meta-tag sized.
 */
export const DESCRIPTION_MAX = 5000;

/**
 * Build a complete Google Merchant Center product feed: an RSS 2.0 document
 * with the `g:` namespace, one `<item>` per eligible product.
 *
 * Pure — never throws. Field mapping per plan 148 Decisions 2–6:
 * - description: `stripFormatting` + `truncateAtWord(…, 5000)`, falling back
 *   to `fallbackDescription` so no item ships a blank `<description>`.
 * - `g:brand`: real Brand relation, `siteName` fallback for unbranded goods.
 * - `g:condition` is always `"new"`; `g:identifier_exists` is always
 *   `"false"` (no gtin/mpn anywhere in the schema).
 * - Products missing an image or a finite positive price are skipped entirely
 *   (Decision 4) — Merchant would disapprove them anyway; one bad product must
 *   never invalidate the rest of the feed.
 */
export function buildMerchantFeedXml(input: BuildMerchantFeedXmlInput): string {
  const {
    products,
    siteUrl,
    siteName,
    currency,
    channelDescription,
    fallbackDescription,
  } = input;

  const items = products
    .filter(isEligible)
    .map((product) =>
      buildItem(product, { siteUrl, siteName, currency, fallbackDescription }),
    );

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0">`,
    `  <channel>`,
    `    <title>${escapeXml(siteName)}</title>`,
    `    <link>${escapeXml(siteUrl)}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    ...items,
    `  </channel>`,
    `</rss>`,
    ``,
  ].join("\n");
}

/** Decision 4 — skip items Merchant Center would disapprove anyway. */
function isEligible(product: MerchantFeedProduct): boolean {
  if (!product.primaryImage?.url) return false;
  const price = Number(product.price);
  return product.price.trim().length > 0 && Number.isFinite(price) && price > 0;
}

function buildItem(
  product: MerchantFeedProduct,
  ctx: {
    siteUrl: string;
    siteName: string;
    currency: string;
    fallbackDescription: string;
  },
): string {
  const stripped = stripFormatting(product.description ?? "");
  const description =
    stripped.length > 0
      ? truncateAtWord(stripped, DESCRIPTION_MAX)
      : ctx.fallbackDescription;

  return [
    `    <item>`,
    `      <g:id>${escapeXml(product.id)}</g:id>`,
    `      <title>${escapeXml(product.name)}</title>`,
    `      <description>${escapeXml(description)}</description>`,
    `      <link>${escapeXml(`${ctx.siteUrl}/products/${product.slug}`)}</link>`,
    // isEligible guarantees primaryImage here.
    `      <g:image_link>${escapeXml(product.primaryImage!.url)}</g:image_link>`,
    `      <g:price>${escapeXml(`${product.price} ${ctx.currency}`)}</g:price>`,
    `      <g:availability>${product.inStock ? "in_stock" : "out_of_stock"}</g:availability>`,
    `      <g:condition>new</g:condition>`,
    `      <g:brand>${escapeXml(product.brand?.name ?? ctx.siteName)}</g:brand>`,
    `      <g:identifier_exists>false</g:identifier_exists>`,
    `    </item>`,
  ].join("\n");
}
