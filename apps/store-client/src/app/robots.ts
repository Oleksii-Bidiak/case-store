import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config";

/**
 * robots.txt — allow crawling of public content, point crawlers to the sitemap,
 * and disallow private, non-indexable routes (cart, checkout, orders, auth).
 */
export default function robots(): MetadataRoute.Robots {
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
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
