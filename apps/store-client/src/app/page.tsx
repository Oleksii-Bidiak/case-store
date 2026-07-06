import type { Metadata } from "next";
import {
  HeroBanner,
  TrustStrip,
  CategoryNav,
  PopularRail,
  PromoBanner,
  RecentlyViewed,
  Newsletter,
} from "@/widgets";
import { JsonLd } from "@/shared/ui";
import {
  buildOrganizationSchema,
  buildWebSiteSchema,
} from "@/shared/lib/schema";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";
import { fetchPublishedBanners } from "@/shared/api/banners-server";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";

export const metadata: Metadata = {
  title: dict.meta.homeTitle,
  description: dict.meta.homeDescription,
};

export default async function HomePage() {
  // Admin-managed homepage banners (ISR, tag `banners`). Each region falls back
  // to its hardcoded content when its placement group is empty, so the homepage
  // always renders even if the API is unreachable.
  const banners = await fetchPublishedBanners();

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

  return (
    <div className="flex flex-col gap-14 pb-16">
      <JsonLd
        schema={buildOrganizationSchema(SITE_URL, SITE_NAME, socialLinks)}
      />
      <JsonLd schema={buildWebSiteSchema(SITE_URL, SITE_NAME)} />

      <HeroBanner
        heroSlides={banners.HERO_SLIDE}
        promoTiles={banners.PROMO_TILE}
      />
      <TrustStrip />
      <CategoryNav />
      <PopularRail />
      <PromoBanner banner={banners.PROMO_BANNER[0]} />
      <RecentlyViewed />
      <Newsletter />
    </div>
  );
}
