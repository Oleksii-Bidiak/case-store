import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

/**
 * robots.txt — allow crawling of public content, point crawlers to the sitemap,
 * and disallow private, non-indexable routes (cart, checkout, orders, auth).
 *
 * When the admin flips the site-wide `noindexSite` kill switch (SeoSettings,
 * TASK-239) the whole site is disallowed and the sitemap link is dropped — used
 * to keep a staging deploy out of search. Any fetch error falls back to the
 * normal allow-all rules so a transient API outage never accidentally hides the
 * production site.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const seo = await fetchSeoSettings();

  if (seo?.noindexSite) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/cart",
        "/checkout",
        "/orders",
        "/account",
        "/login",
        "/register",
        "/search",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
