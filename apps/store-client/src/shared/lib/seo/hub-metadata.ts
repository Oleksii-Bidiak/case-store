import type { Metadata } from "next";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import type { HubSlug } from "@/shared/config";
import { buildOgImages } from "./og-images";
import { resolveSeo, toMetadataTitle } from "./resolveSeo";
import { resolveSiteName } from "./resolve-site-name";

export interface HubMetadataInput {
  /** Which hub this is — the slug of its `PageKind.HUB` row. */
  slug: HubSlug;
  /** Absolute canonical URL of the hub route. */
  canonical: string;
  /** The route's built-in title, used when no hub row supplies one. */
  fallbackTitle: string;
  /** The route's built-in description, used when no hub row supplies one. */
  fallbackDescription: string;
  /** Open Graph `type`; hubs are listings, so "website" unless stated. */
  ogType?: "website" | "article";
}

/**
 * Build a listing hub's metadata from its admin-managed `HUB` page row
 * (TASK-435).
 *
 * The six hubs (`/categories`, `/blog`, `/legal`, `/contact`, `/info`, `/promo`)
 * are routes implemented in this app, not documents in the database — there is
 * nothing for an admin to write. A `HUB` page row exists only to give each of
 * them a `metaTitle`/`metaDescription` the owner controls from the panel.
 *
 * Precedence, most specific first:
 *
 * ```
 * 1. the hub row's metaTitle / metaDescription  — what the owner typed for THIS hub
 * 2. the hub row's title / excerpt              — a row exists, its meta fields are blank
 * 3. this route's dictionary strings            — no row at all, or the API is down
 * ```
 *
 * The global `SeoSettings` defaults are deliberately NOT a tier here, which is
 * why `resolveSeo` is called with them blanked out. They are store-wide, while
 * the dictionary string is written for this exact hub — and TASK-432's whole
 * point is that the more specific text wins. Letting the global default outrank
 * "Блог" would put one sentence about the shop on all six hubs, the defect that
 * task existed to remove. `SeoSettings` still supplies the title template, the
 * store name and the default OG image, none of which are page text.
 *
 * Never throws: both reads degrade to null, and the dictionary tier covers it.
 */
export async function buildHubMetadata({
  slug,
  canonical,
  fallbackTitle,
  fallbackDescription,
  ogType = "website",
}: HubMetadataInput): Promise<Metadata> {
  const [page, seo] = await Promise.all([
    fetchPublishedPage(slug, "HUB"),
    fetchSeoSettings(),
  ]);

  const resolved = resolveSeo({
    entityTitle: page?.metaTitle,
    entityDescription: page?.metaDescription,
    content: { name: page?.title, description: page?.excerpt },
    // Title/description defaults blanked on purpose (see the doc comment); the
    // OG image is a picture, not page text, so it still comes from settings.
    settings: {
      defaultMetaTitle: null,
      defaultMetaDescription: null,
      defaultOgImage: seo?.defaultOgImage ?? null,
    },
  });

  const siteName = resolveSiteName(seo);
  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName,
    fallback: fallbackTitle,
  });
  const description = resolved.description ?? fallbackDescription;

  return {
    title,
    description,
    alternates: { canonical },
    // A segment's `openGraph` replaces the root layout's wholesale (Next merges
    // metadata shallowly), so siteName/locale/images are re-stated here — same
    // shape as /legal/[slug].
    openGraph: {
      title: title.absolute,
      description,
      url: canonical,
      siteName,
      locale: "uk_UA",
      type: ogType,
      images: buildOgImages({ ogImage: resolved.ogImage }),
    },
  };
}
