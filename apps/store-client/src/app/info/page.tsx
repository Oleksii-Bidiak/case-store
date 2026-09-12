import type { Metadata } from "next";
import {
  InfoView,
  INFO_FAQS,
  type InfoAbout,
  type InfoFaq,
} from "@/widgets/info-support";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/shared/lib/schema";
import { fetchFaqItems } from "@/shared/api/faq-server";
import { fetchPublishedPage } from "@/shared/api/pages-server";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { sanitizeHtml } from "@/shared/lib/sanitize-html";
import { buildHubMetadata } from "@/shared/lib/seo";
import { INFO_SLUG_INLINED_ON_HUB, SITE_URL, dict } from "@/shared/config";

// TASK-435 — the hub's own title/description are admin-managed through the
// `info` HUB page row; the dictionary strings stay as the fallback.
export function generateMetadata(): Promise<Metadata> {
  return buildHubMetadata({
    slug: "info",
    canonical: `${SITE_URL}/info`,
    fallbackTitle: dict.info.heading,
    fallbackDescription: dict.info.deliveryIntro,
  });
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

/**
 * The "Про нас" section's copy, from the CMS: the `about` page (kind INFO).
 *
 * TASK-435 — this is the first piece of `/info` that stopped being hardcoded.
 * Returns null when the page is missing, unpublished or the API is down, and the
 * section then renders its original static text. That fallback is the rule for
 * this whole route, not a nicety: `/info` carries delivery, warranty and contact
 * information, so it must render even when the API does not answer.
 *
 * The body is sanitized here, on the server, rather than inside `InfoView` —
 * that view is a client component, and pulling the DOMPurify/jsdom bundle into
 * the client just to re-clean already-sanitized admin HTML would be pure weight.
 */
async function getAbout(): Promise<InfoAbout | null> {
  const page = await fetchPublishedPage(INFO_SLUG_INLINED_ON_HUB, "INFO");
  if (!page) return null;
  return {
    heading: page.title,
    intro: page.excerpt?.trim() || null,
    html: sanitizeHtml(page.content),
    href: `/info/${page.slug}`,
  };
}

export default async function InfoPage() {
  // Contacts come from the shared, `site-contact` tagged fetcher (TASK-345) —
  // this page used to hold its own untagged copy, so admin edits took up to an
  // hour to appear here while the footer updated at once.
  const [contact, faqs, about] = await Promise.all([
    fetchSiteContactSettings(),
    getFaqs(),
    getAbout(),
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
      <InfoView contact={contact} faqs={faqs} about={about} />
    </div>
  );
}
