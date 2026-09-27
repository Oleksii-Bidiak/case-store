import type { Metadata } from "next";
import * as Sentry from "@sentry/nextjs";
import {
  InfoView,
  INFO_FAQS,
  type InfoAbout,
  type InfoFaq,
  type InfoPageLink,
  type InfoSectionSource,
  type InfoService,
} from "@/widgets/info-support";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema, buildFaqPageSchema } from "@/shared/lib/schema";
import { fetchActiveAddonServices } from "@/shared/api/addon-services-server";
import { fetchFaqItems } from "@/shared/api/faq-server";
import {
  fetchPublishedPage,
  fetchPublishedPages,
} from "@/shared/api/pages-server";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { sanitizeHtml } from "@/shared/lib/sanitize-html";
import { buildHubMetadata } from "@/shared/lib/seo/server";
import {
  INFO_HUB_SECTION_SLUGS,
  INFO_SLUG_INLINED_ON_HUB,
  SITE_URL,
  dict,
  isInfoSlugInlinedOnHub,
  type InfoHubSectionKey,
} from "@/shared/config";

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
 * TASK-565 — the page is found by a FIXED slug (`INFO_SLUG_INLINED_ON_HUB`), so
 * renaming, unpublishing or deleting it quietly put the placeholder text back on
 * the hub. A 404 is therefore reported to Sentry as a warning — it is a content
 * problem the owner can fix, and the admin page list marks that row as
 * «вбудована в /info» so nobody renames it unawares. An outage is not reported
 * here: it is not a content problem, and every other reader on the page sees it
 * too.
 *
 * The body is sanitized here, on the server, rather than inside `InfoView` —
 * that view is a client component, and pulling the DOMPurify/jsdom bundle into
 * the client just to re-clean already-sanitized admin HTML would be pure weight.
 */
async function getAbout(): Promise<InfoAbout | null> {
  let page;
  try {
    page = await fetchPublishedPage(INFO_SLUG_INLINED_ON_HUB, "INFO");
  } catch {
    // The reader throws on an outage since TASK-793; this route renders anyway.
    return null;
  }
  if (!page) {
    Sentry.captureMessage(
      `/info: the «Про нас» page (INFO, slug "${INFO_SLUG_INLINED_ON_HUB}") is ` +
        "missing or unpublished — the hub shows its placeholder text instead. " +
        "Publish an INFO page with that slug in the admin «Сторінки».",
      "warning",
    );
    return null;
  }
  return {
    heading: page.title,
    intro: page.excerpt?.trim() || null,
    html: sanitizeHtml(page.content),
    href: `/info/${page.slug}`,
  };
}

/**
 * One of the blocks /info renders from its own INFO page (TASK-560). A 404 is
 * `"missing"` — the owner unpublished or deleted it, so the block disappears
 * rather than resurrecting text they removed; a failed read is `"unavailable"`
 * and the block falls back to its static copy.
 */
async function getSection(slug: string): Promise<InfoSectionSource> {
  try {
    const page = await fetchPublishedPage(slug, "INFO");
    if (!page) return "missing";
    return {
      heading: page.title,
      intro: page.excerpt?.trim() || null,
      html: sanitizeHtml(page.content),
    };
  } catch {
    return "unavailable";
  }
}

async function getSections(): Promise<
  Record<InfoHubSectionKey, InfoSectionSource>
> {
  const keys = Object.keys(INFO_HUB_SECTION_SLUGS) as InfoHubSectionKey[];
  const sources = await Promise.all(
    keys.map((key) => getSection(INFO_HUB_SECTION_SLUGS[key])),
  );
  return Object.fromEntries(
    keys.map((key, index) => [key, sources[index]]),
  ) as Record<InfoHubSectionKey, InfoSectionSource>;
}

/** TASK-561 — the add-on services the store really sells, at catalog prices. */
async function getServices(): Promise<InfoService[]> {
  const services = await fetchActiveAddonServices();
  return services.map(({ id, name, description, price }) => ({
    id,
    name,
    description,
    price,
  }));
}

/**
 * TASK-560 — every published help page /info does not already render inline,
 * as a link. `fetchPublishedPages` never throws (an outage is an empty list),
 * which is right here: a missing list of links does not stop the hub.
 */
async function getOtherPages(): Promise<InfoPageLink[]> {
  const pages = await fetchPublishedPages("INFO");
  return pages
    .filter((page) => !isInfoSlugInlinedOnHub(page.slug))
    .map((page) => ({ title: page.title, href: `/info/${page.slug}` }));
}

export default async function InfoPage() {
  // Contacts come from the shared, `site-contact` tagged fetcher (TASK-345) —
  // this page used to hold its own untagged copy, so admin edits took up to an
  // hour to appear here while the footer updated at once.
  const [contact, faqs, about, sections, services, pages] = await Promise.all([
    fetchSiteContactSettings(),
    getFaqs(),
    getAbout(),
    getSections(),
    getServices(),
    getOtherPages(),
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
      <InfoView
        contact={contact}
        faqs={faqs}
        about={about}
        sections={sections}
        services={services}
        pages={pages}
      />
    </div>
  );
}
