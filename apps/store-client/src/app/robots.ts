import type { MetadataRoute } from "next";
import { SITE_URL } from "@/shared/config";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

/**
 * robots.txt — allow crawling of public content, point crawlers to the sitemap,
 * and disallow private, non-indexable routes (cart, checkout, orders, auth).
 *
 * AI-friendly policy (TASK-282, mirrors llms.txt from TASK-194): the named AI
 * crawlers (GPTBot, Google-Extended, PerplexityBot, ClaudeBot) get an explicit
 * `allow: "/"` stanza. IMPORTANT robots.txt spec rule: a crawler that matches a
 * *named* `User-agent` group uses ONLY that group — it does NOT inherit or merge
 * with the `*` group. The AI rule must therefore duplicate the service-path
 * disallow list (via the shared SERVICE_DISALLOW constant), otherwise those bots
 * would be explicitly allowed onto /cart, /checkout, etc. Do not "clean up" the
 * duplication.
 *
 * When the admin flips the site-wide `noindexSite` kill switch (SeoSettings,
 * TASK-239) the whole site is disallowed and the sitemap link is dropped — used
 * to keep a staging deploy out of search. AI bots are covered too: with no
 * matching named group they fall back to `*` by spec. Any fetch error falls back
 * to the normal allow-all rules so a transient API outage never accidentally
 * hides the production site.
 */

// Service/private paths hidden from every crawler. Referenced by BOTH rule
// blocks below (see spec note above — named groups don't inherit from `*`).
const SERVICE_DISALLOW = [
  "/cart",
  "/checkout",
  "/orders",
  "/account",
  "/login",
  "/register",
  "/search",
];

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
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: SERVICE_DISALLOW,
      },
      {
        // AI-friendly policy (mirrors llms.txt, TASK-194): explicit allow for
        // the named AI crawlers, same service-path exclusions as everyone else.
        userAgent: ["GPTBot", "Google-Extended", "PerplexityBot", "ClaudeBot"],
        allow: "/",
        disallow: SERVICE_DISALLOW,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
