import type { Metadata } from "next";
import { InfoView, INFO_FAQS, type InfoFaq } from "@/widgets/info-support";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/shared/lib/schema";
import { fetchFaqItems } from "@/shared/api/faq-server";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.info.heading,
  description: dict.info.deliveryIntro,
  alternates: { canonical: `${SITE_URL}/info` },
};

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
  // Contacts come from the shared, `site-contact` tagged fetcher (TASK-345) —
  // this page used to hold its own untagged copy, so admin edits took up to an
  // hour to appear here while the footer updated at once.
  const [contact, faqs] = await Promise.all([
    fetchSiteContactSettings(),
    getFaqs(),
  ]);

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
