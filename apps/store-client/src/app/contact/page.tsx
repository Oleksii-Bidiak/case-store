import type { Metadata } from "next";
import type { SiteContactSettingsEntity } from "@/shared/api/generated/models";
import { ContactView } from "@/widgets/contact";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export const metadata: Metadata = {
  title: dict.meta.contactTitle,
  description: dict.meta.contactDescription,
  alternates: { canonical: `${SITE_URL}/contact` },
};

/**
 * Admin-managed contact details (TASK-154), fetched with ISR like the footer.
 * Returns null on any error — the view falls back to the localized defaults.
 */
async function getContactSettings(): Promise<SiteContactSettingsEntity | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/site-contact`, {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: SiteContactSettingsEntity };
    return body.data ?? null;
  } catch {
    return null;
  }
}

export default async function ContactPage() {
  const contact = await getContactSettings();

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
