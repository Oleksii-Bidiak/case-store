import type { Metadata } from "next";
import { LegalHubView, type LegalHubDoc } from "@/widgets/legal-doc";
import { JsonLd } from "@/shared/ui";
import {
  buildBreadcrumbSchema,
  fetchAllPublishedPages,
} from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

export const metadata: Metadata = {
  title: dict.legal.hub.heading,
  description: dict.legal.hub.subtitle,
  alternates: { canonical: `${SITE_URL}/legal` },
};

/** All published static pages for the hub. Never throws → empty list on error. */
async function getDocs(): Promise<LegalHubDoc[]> {
  try {
    const pages = await fetchAllPublishedPages();
    return pages.map((page) => ({
      slug: page.slug,
      title: page.title,
      excerpt: page.excerpt,
      updatedAt: page.updatedAt,
    }));
  } catch {
    return [];
  }
}

export default async function LegalHubPage() {
  const docs = await getDocs();

  return (
    <div className="mx-auto w-full max-w-[1000px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.legal.breadcrumbHome, item: SITE_URL },
          { name: dict.legal.hub.heading, item: `${SITE_URL}/legal` },
        ])}
      />
      <LegalHubView docs={docs} />
    </div>
  );
}
