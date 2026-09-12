import type { Metadata } from "next";
import {
  HeroBanner,
  TrustStrip,
  CategoryNav,
  PopularRail,
  RecommendationCarousels,
  PromoBanner,
  RecentlyViewed,
  Newsletter,
} from "@/widgets";
import { JsonLd } from "@/shared/ui";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
} from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";
import { fetchPublishedBanners } from "@/shared/api/banners-server";
import { fetchPublishedCarouselsByPlacement } from "@/shared/api/carousels-server";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import {
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
} from "@/shared/lib/seo";

/**
 * Homepage metadata routed through the shared precedence helper (the SeoSettings
 * defaults → the localized home strings). The homepage is not an entity, so no
 * `content` is passed: since TASK-432 content outranks the global default, and a
 * dictionary constant handed to `content` would permanently shadow whatever the
 * owner types in /settings/seo. The localized strings stay as the call-site
 * fallback (`fallback:` / `?? dict…`) instead.
 *
 * `toMetadataTitle` brands the derived title (`Головна | <store name>`)
 * explicitly — Next 16 does not apply the root `title.template` to a
 * `generateMetadata` title — closing the geo-audit "Головна without brand" gap
 * (plan 116 gap 3). `fetchSeoSettings()` is a tagged native fetch, deduped with
 * the component's own call below within the request.
 */
export async function generateMetadata(): Promise<Metadata> {
  const seo = await fetchSeoSettings();
  const resolved = resolveSeo({ settings: seo });
  const siteName = resolveSiteName(seo);

  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName,
    fallback: dict.meta.homeTitle,
  });
  const description = resolved.description ?? dict.meta.homeDescription;

  return {
    title,
    description,
    // TASK-432: the homepage had no openGraph block of its own, so a shared link
    // showed the root layout's site-wide title/description rather than the
    // homepage's own resolved pair. Same shape as /legal/[slug], plus explicit
    // `images`: Next replaces the root `openGraph` wholesale once a segment
    // declares one, so without this line the most-shared page of the store would
    // lose its OG card entirely (see `buildOgImages`).
    openGraph: {
      title: title.absolute,
      description,
      url: SITE_URL,
      siteName,
      locale: "uk_UA",
      type: "website",
      images: buildOgImages({ ogImage: resolved.ogImage }),
    },
  };
}

export default async function HomePage() {
  // Admin-managed homepage banners (ISR, tag `banners`). Each region falls back
  // to its hardcoded content when its placement group is empty, so the homepage
  // always renders even if the API is unreachable.
  const banners = await fetchPublishedBanners();

  // Admin-managed carousels (TASK-139; ISR, tag `carousels`), split by placement
  // (TASK-288) so the same carousel never renders twice: HOME_TABS feeds the
  // «Популярне» tab rail, HOME_RAILS the standalone rails below it. Resilient
  // like the banners fetch — an unreachable API yields empty groups, PopularRail
  // falls back to its query-driven tabs and RecommendationCarousels renders
  // nothing, so the homepage always renders.
  const carousels = await fetchPublishedCarouselsByPlacement();

  // Admin-managed social links feed the Organization `sameAs` (brand-entity
  // signal for AI/search). Deduped with the footer's fetch of the same tagged
  // endpoint; degrades to no `sameAs` when unset or the API is unreachable.
  // The SiteContactSettings support channels (viber/telegram/instagram) are
  // merged with the broader brand-authority profiles from SeoSettings
  // (`additionalSameAsLinks` — Facebook/YouTube/LinkedIn/... — TASK-239).
  const [contact, seo] = await Promise.all([
    fetchSiteContactSettings(),
    fetchSeoSettings(),
  ]);
  const socialLinks = [
    contact?.viberLink,
    contact?.telegramLink,
    contact?.instagramLink,
    ...(seo?.additionalSameAsLinks ?? []),
  ];
  // The brand-entity name Google reads for the knowledge panel — from the same
  // admin-managed field as the page titles, so a rename can never leave the
  // JSON-LD claiming a different company than the `<title>` (TASK-433).
  const siteName = resolveSiteName(seo);

  return (
    <div className="flex flex-col gap-14 pb-16">
      {/* `logo` (TASK-299) is a recommended Organization property — Google reads it
          for the brand's knowledge panel; it is the admin-uploaded logo or absent. */}
      <JsonLd
        schema={buildOrganizationSchema(
          SITE_URL,
          siteName,
          socialLinks,
          seo?.logoUrl,
        )}
      />
      <JsonLd schema={buildWebSiteSchema(SITE_URL, siteName)} />

      <HeroBanner
        heroSlides={banners.HERO_SLIDE}
        promoTiles={banners.PROMO_TILE}
      />
      <TrustStrip />
      <CategoryNav />
      <PopularRail carousels={carousels.HOME_TABS} />
      {/* Owner-approved default (plan 154): admin carousels COEXIST below the
          PopularRail, grouped with the other product-rail section. */}
      <RecommendationCarousels carousels={carousels.HOME_RAILS} />
      <PromoBanner banner={banners.PROMO_BANNER[0]} />
      <RecentlyViewed />
      <Newsletter />
    </div>
  );
}
