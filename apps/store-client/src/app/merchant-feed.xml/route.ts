import * as Sentry from "@sentry/nextjs";
import { SITE_URL, SITE_NAME, CURRENCY, dict } from "@/shared/config";
import { fetchAllActiveProducts } from "@/shared/lib/schema";
import { buildCategoryPathMap } from "@/shared/lib/category-path";
import { categoryControllerGetCategoryTree } from "@/shared/api/generated/categories/categories";
import type { CategoryTreeNodeEntity } from "@/shared/api/generated/models";
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
    // The category tree feeds `g:product_type` (TASK-432). It is fetched in
    // parallel with the products and its failure is contained: an empty path map
    // costs the feed its (optional) product_type elements, while a rejection here
    // would drop the whole catalogue. Walked once into an id → breadcrumb map, so
    // the per-product lookup below stays O(1).
    const [all, categoryTree] = await Promise.all([
      fetchAllActiveProducts(),
      categoryControllerGetCategoryTree().catch((err: unknown) => {
        console.error("[merchant-feed] Failed to fetch category tree:", err);
        Sentry.captureException(err, {
          tags: { route: "merchant-feed", part: "category-tree" },
        });
        return { data: [] as CategoryTreeNodeEntity[] };
      }),
    ]);
    const categoryPaths = buildCategoryPathMap(categoryTree.data ?? []);

    products = all.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      slug: p.slug,
      price: p.price,
      inStock: p.inStock,
      brand: p.brand ? { name: p.brand.name } : null,
      primaryImage: p.primaryImage ? { url: p.primaryImage.url } : null,
      categoryPath: p.categoryId
        ? (categoryPaths.get(p.categoryId) ?? null)
        : null,
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
