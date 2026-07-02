import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config";
import {
  fetchAllActiveProducts,
  fetchAllPublishedPages,
} from "@/shared/lib/schema";
import { BLOG_POSTS, blogPublishedAt } from "@/widgets/blog";

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
  ];

  // Blog posts are a static seed (no backend yet — TASK-170), so their routes
  // are known synchronously and always included.
  const blogRoutes: MetadataRoute.Sitemap = BLOG_POSTS.map((post) => {
    const published = blogPublishedAt(post.slug);
    return {
      url: `${SITE_URL}/blog/${post.slug}`,
      lastModified: published ? new Date(published) : now,
      changeFrequency: "monthly",
      priority: 0.6,
    };
  });

  // Published static pages are fetched independently so a failure of one source
  // never drops the other.
  const [productRoutes, pageRoutes] = await Promise.all([
    fetchProductRoutes(),
    fetchPageRoutes(),
  ]);

  return [...staticRoutes, ...productRoutes, ...pageRoutes, ...blogRoutes];
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
    console.error("[sitemap] Failed to fetch products:", err);
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
    console.error("[sitemap] Failed to fetch pages:", err);
    return [];
  }
}
