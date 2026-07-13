import type { MetadataRoute } from "next";
import * as Sentry from "@sentry/nextjs";
import { SITE_URL } from "@/shared/config";
import {
  fetchAllActiveCategories,
  fetchAllActiveProducts,
  fetchAllPublishedPages,
} from "@/shared/lib/schema";
import { fetchPublishedPosts } from "@/shared/api/blog-server";

// In Next.js 16 metadata routes are cached (statically generated) by default,
// which would call the API at BUILD time. `force-dynamic` opts into request-time
// generation so the sitemap always reflects the live catalogue and never depends
// on the API being reachable during `next build`.
export const dynamic = "force-dynamic";

/**
 * Dynamic sitemap.xml: static storefront pages plus one entry per active
 * product. On any fetch failure it logs and returns the static routes only, so
 * the route never crashes.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
  const [productRoutes, categoryRoutes, pageRoutes, blogRoutes] =
    await Promise.all([
      fetchProductRoutes(),
      fetchCategoryRoutes(),
      fetchPageRoutes(),
      fetchBlogRoutes(now),
    ]);

  return [
    ...staticRoutes,
    ...productRoutes,
    ...categoryRoutes,
    ...pageRoutes,
    ...blogRoutes,
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

async function fetchBlogRoutes(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    // One page of up to 100 published posts covers the current catalogue.
    const { posts } = await fetchPublishedPosts({ limit: 100 });
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

async function fetchPageRoutes(): Promise<MetadataRoute.Sitemap> {
  try {
    const pages = await fetchAllPublishedPages();
    return pages.map((page) => ({
      url: `${SITE_URL}/legal/${page.slug}`,
      lastModified: new Date(page.updatedAt),
      changeFrequency: "monthly",
      priority: 0.5,
    }));
  } catch (err) {
    reportSourceFailure("pages", err);
    return [];
  }
}
