import type { Metadata } from "next";
import { ContactView } from "@/widgets/contact";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { fetchSiteContactSettings } from "@/shared/api/site-contact-server";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.meta.contactTitle,
  description: dict.meta.contactDescription,
  alternates: { canonical: `${SITE_URL}/contact` },
};

export default async function ContactPage() {
  // Admin-managed contact details (TASK-154) through the shared, `site-contact`
  // tagged fetcher (TASK-345). This page used to carry its own untagged copy, so
  // an admin edit reached the footer instantly but left /contact stale for up to
  // an hour — not acceptable for details a shopper is legally entitled to find
  // current.
  const contact = await fetchSiteContactSettings();

  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.contact.breadcrumbHome, item: SITE_URL },
          { name: dict.contact.breadcrumb, item: `${SITE_URL}/contact` },
        ])}
      />
      <ContactView contact={contact} />
    </div>
  );
}
