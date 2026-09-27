import type { MetadataRoute } from "next";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL, pageRouteFor } from "@/shared/config";
import {
  fetchAllActiveCategories,
  fetchAllActiveProducts,
  fetchAllCompatLandingPages,
  fetchAllPublishedPages,
  fetchAllPublishedPosts,
} from "@/shared/lib/schema/server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

// In Next.js 16 metadata routes are cached (statically generated) by default,
// which would call the API at BUILD time. `force-dynamic` opts into request-time
// generation so the sitemap always reflects the live catalogue and never depends
// on the API being reachable during `next build`.
export const dynamic = "force-dynamic";

/**
 * Dynamic sitemap.xml: static storefront pages plus one entry per active
 * product. On any fetch failure it logs and returns the static routes only, so
 * the route never crashes.
 *
 * Under the site-wide `noindexSite` kill switch (TASK-550) the sitemap is an
 * empty `<urlset>`: robots.txt already drops its `Sitemap:` line then, but the
 * URL itself would otherwise keep handing every product address to anyone who
 * asks. Same settings read as robots.ts, so a failed fetch (null) fails open.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const seo = await fetchSeoSettings();
  if (seo?.noindexSite) {
    return [];
  }

  const now = new Date();
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, lastModified: now, changeFrequency: "daily", priority: 1 },
    {
      url: `${SITE_URL}/products`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/categories`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/blog`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/legal`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${SITE_URL}/info`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
    {
      url: `${SITE_URL}/promo`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/contact`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  ];

  // Products, categories, published static pages, and blog posts are fetched
  // independently so a failure of one source never drops the others.
  const [productRoutes, categoryRoutes, pageRoutes, blogRoutes, compatRoutes] =
    await Promise.all([
      fetchProductRoutes(),
      fetchCategoryRoutes(),
      fetchPageRoutes(),
      fetchBlogRoutes(now),
      fetchCompatRoutes(now),
    ]);

  return [
    ...staticRoutes,
    ...productRoutes,
    ...categoryRoutes,
    ...pageRoutes,
    ...blogRoutes,
    ...compatRoutes,
  ];
}

/**
 * A silently dropped source is real damage (those URLs fall out of the index),
 * and `console.error` alone never reaches Sentry from the Node runtime — only an
 * explicit capture does. The log stays for local/`docker logs` debugging.
 */
function reportSourceFailure(source: string, err: unknown): void {
  console.error(`[sitemap] Failed to fetch ${source}:`, err);
  Sentry.captureException(err, { tags: { route: "sitemap", source } });
}

async function fetchProductRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const products = await fetchAllActiveProducts();
    return products.map((product) => ({
      url: `${SITE_URL}/products/${product.slug}`,
      lastModified: new Date(product.updatedAt),
      changeFrequency: "weekly",
      priority: 0.8,
    }));
  } catch (err) {
    reportSourceFailure("products", err);
    return [];
  }
}

async function fetchCategoryRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    // One tree request covers every active category — root and nested levels
    // are all real /categories/[slug] landing pages (TASK-277).
    const categories = await fetchAllActiveCategories();
    return categories.map((category) => ({
      url: `${SITE_URL}/categories/${category.slug}`,
      lastModified: new Date(category.updatedAt),
      changeFrequency: "weekly",
      priority: 0.7,
    }));
  } catch (err) {
    reportSourceFailure("categories", err);
    return [];
  }
}

/**
 * One entry per compatibility landing page — `/catalog/<категорія>/<модель>`,
 * «Чохли для iPhone 15 Pro» (TASK-490, owner decision B-10 §5).
 *
 * The API returns exactly the pairs that have at least one visible product, so
 * this branch never lists a URL that 404s and never omits one that answers 200.
 * These are the ONLY facet combinations with an indexable address of their own;
 * every other facet stays a query param that is `noindex` and canonicalises back
 * onto the category, which is why there is nothing else to emit here.
 *
 * `lastModified: now` because a pair owns no timestamp (it is a cross, not a
 * row) — same honest stand-in the blog branch uses for a post without a
 * `publishedAt`. `priority` sits below the category's 0.7: a compat page is a
 * narrower slice of a category that is itself already in this sitemap.
 */
async function fetchCompatRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const pages = await fetchAllCompatLandingPages();
    return pages.map((page) => ({
      url: `${SITE_URL}/catalog/${page.categorySlug}/${page.deviceSlug}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    }));
  } catch (err) {
    reportSourceFailure("compat landing pages", err);
    return [];
  }
}

async function fetchBlogRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    // Every page of published posts (TASK-551 — one page of 100 used to drop the
    // 101st post from the index), unlisted ones included: a post kept out of the
    // feed is still a public document (TASK-436), and a sitemap that omitted it
    // while its URL answered 200 would be the cloaking-shaped design the owner
    // rejected. Unlike the /blog grid's reader, this one THROWS on failure, so an
    // outage reaches Sentry below instead of passing for a blog with no posts.
    // The sitemap itself still ships (200) without articles for that one request
    // — the route is force-dynamic, so the next crawl gets the full list back.
    const posts = await fetchAllPublishedPosts();
    return posts.map((post) => ({
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: post.publishedAt ? new Date(post.publishedAt) : now,
      changeFrequency: "monthly",
      priority: 0.6,
    }));
  } catch (err) {
    reportSourceFailure("blog posts", err);
    return [];
  }
}

/**
 * One entry per published page that HAS an address (TASK-435): LEGAL rows under
 * `/legal/<slug>`, INFO rows under `/info/<slug>`. HUB rows are skipped — they
 * are meta tags for a listing route, and that route is already in the static
 * list above, so emitting them here would duplicate those six URLs.
 */
async function fetchPageRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const pages = await fetchAllPublishedPages();
    return pages.flatMap((page) => {
      const route = pageRouteFor(page.kind, page.slug);
      if (!route) return [];
      return [
        {
          url: `${SITE_URL}${route}`,
          lastModified: new Date(page.updatedAt),
          changeFrequency: "monthly" as const,
          priority: 0.5,
        },
      ];
    });
  } catch (err) {
    reportSourceFailure("pages", err);
    return [];
  }
}
