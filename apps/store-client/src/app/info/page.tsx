import type { Metadata } from "next";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { InfoView, INFO_FAQS, type InfoFaq } from "@/widgets/info-support";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/shared/lib/schema";
import { fetchFaqItems } from "@/shared/api/faq-server";
import { serverFetch } from "@/shared/api/server-fetch";
import { SITE_URL, dict } from "@/shared/config";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const metadata: Metadata = {
  title: dict.info.heading,
  description: dict.info.deliveryIntro,
  alternates: { canonical: `${SITE_URL}/info` },
};

/**
 * Admin-managed contact details (TASK-154), fetched with ISR like the footer.
 * Returns null on any error — the view falls back to the localized defaults.
 */
async function getContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await serverFetch(`${API_BASE_URL}/api/site-contact`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: SiteContactSettingsEntity };
    return body.data ?? null;
  } catch {
    return null;
  }
}

/**
 * Load the admin-managed FAQ list (ISR-tagged `faq`) and map it onto the
 * storefront's `{ q, a }` shape. Falls back to the static `INFO_FAQS` when the
 * API is unreachable or returns nothing, so the FAQ section is never blank.
 */
async function getFaqs(): Promise<readonly InfoFaq[]> {
  const items = await fetchFaqItems();
  if (!items || items.length === 0) {
    return INFO_FAQS;
  }
  return items.map((item) => ({ q: item.question, a: item.answer }));
}

export default async function InfoPage() {
  const [contact, faqs] = await Promise.all([getContactSettings(), getFaqs()]);

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.info.breadcrumbHome, item: SITE_URL },
          { name: dict.info.heading, item: `${SITE_URL}/info` },
        ])}
      />
      <JsonLd
        schema={buildFaqPageSchema(
          faqs.map((faq) => ({ question: faq.q, answer: faq.a })),
        )}
      />
      <InfoView contact={contact} faqs={faqs} />
    </div>
  );
}
