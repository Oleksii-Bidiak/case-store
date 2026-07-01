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

export const metadata: Metadata = {
  title: dict.meta.homeTitle,
  description: dict.meta.homeDescription,
};

export default function HomePage() {
  return (
    <div className="flex flex-col gap-14 pb-16">
      <JsonLd schema={buildOrganizationSchema(SITE_URL, SITE_NAME)} />
      <JsonLd schema={buildWebSiteSchema(SITE_URL, SITE_NAME)} />

      <HeroBanner />
      <TrustStrip />
      <CategoryNav />
      <PopularRail />
      <PromoBanner />
      <RecentlyViewed />
      <Newsletter />
    </div>
  );
}
