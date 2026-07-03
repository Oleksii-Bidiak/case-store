import type { Metadata } from "next";
import { PromoView } from "@/widgets/promo";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.promoTitle,
  description: dict.meta.promoDescription,
  alternates: { canonical: `${SITE_URL}/promo` },
};

/**
 * `/promo` — the Акції (promotions) landing page. Static shell + client widgets;
 * the deals grid reads real on-sale products.
 */
export default function PromoPage() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.promo.breadcrumbHome, item: SITE_URL },
          { name: dict.promo.breadcrumb, item: `${SITE_URL}/promo` },
        ])}
      />
      <PromoView />
    </div>
  );
}
