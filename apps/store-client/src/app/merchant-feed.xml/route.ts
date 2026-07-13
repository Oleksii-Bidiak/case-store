import * as Sentry from "@sentry/nextjs";
import { SITE_URL, SITE_NAME, CURRENCY, dict } from "@/shared/config";
import { fetchAllActiveProducts } from "@/shared/lib/schema";
import {
  buildMerchantFeedXml,
  type MerchantFeedProduct,
} from "@/shared/lib/merchant-feed";

/**
 * Google Merchant Center product feed (plan 148, TASK-281): RSS 2.0 + `g:`
 * namespace, one `<item>` per active product with a usable image and price.
 * Submitted directly in the Merchant dashboard (Products → Feeds → scheduled
 * fetch) — not referenced from robots.txt/sitemap.xml.
 *
 * Caching mirrors the `llms.txt`/`indexnow.txt` route family (Decision 7):
 * a `Cache-Control` header instead of `export const dynamic`/`revalidate`.
 *
 * On fetch failure the route degrades to a valid empty-channel feed with a
 * `200` — Merchant Center treats a `5xx` as a failed scheduled fetch and can
 * suspend the feed, while an empty channel just re-syncs on the next pull.
 */
export async function GET(): Promise<Response> {
  let products: MerchantFeedProduct[] = [];
  try {
    const all = await fetchAllActiveProducts();
    products = all.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      slug: p.slug,
      price: p.price,
      inStock: p.inStock,
      brand: p.brand ? { name: p.brand.name } : null,
      primaryImage: p.primaryImage ? { url: p.primaryImage.url } : null,
    }));
  } catch (err) {
    console.error("[merchant-feed] Failed to fetch products:", err);
    // The empty feed is served with a 200 on purpose (see above), so nothing else
    // signals the failure — without an explicit capture (console.* does not reach
    // Sentry from the Node runtime) an emptied Merchant feed would go unnoticed.
    Sentry.captureException(err, { tags: { route: "merchant-feed" } });
    // fall through with products = [] — a valid, empty-channel feed beats a 500
  }

  const xml = buildMerchantFeedXml({
    products,
    siteUrl: SITE_URL,
    siteName: SITE_NAME,
    currency: CURRENCY,
    channelDescription: dict.meta.rootDescription,
    fallbackDescription: dict.meta.productFallbackDescription,
  });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
