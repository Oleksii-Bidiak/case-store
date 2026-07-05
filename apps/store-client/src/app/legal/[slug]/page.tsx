import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  fetchPublishedPage,
  fetchPublishedPages,
} from "@/shared/api/pages-server";
import { LegalDocView, type LegalOtherDoc } from "@/widgets/legal-doc";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { SITE_URL, dict } from "@/shared/config";

/**
 * Fetch a published page by slug through the ISR-tagged server fetcher; returns
 * null on 404 (draft / scheduled / missing) or any API error.
 */
const getPage = fetchPublishedPage;

/** Other published pages (for the "інші правові документи" grid). Never throws. */
async function getOtherDocs(currentSlug: string): Promise<LegalOtherDoc[]> {
  const pages = await fetchPublishedPages();
  return pages
    .filter((page) => page.slug !== currentSlug)
    .map((page) => ({ slug: page.slug, title: page.title }));
}

interface LegalDocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: LegalDocPageProps): Promise<Metadata> {
  const { slug } = await params;

  const page = await getPage(slug);
  if (!page) {
    return { title: dict.meta.pageFallbackTitle };
  }

  const canonical = `${SITE_URL}/legal/${page.slug}`;
  const description = page.metaDescription ?? page.excerpt ?? undefined;

  return {
    title: page.metaTitle ?? page.title,
    description,
    alternates: { canonical },
    openGraph: {
      title: page.metaTitle ?? page.title,
      description,
      url: canonical,
      type: "article",
    },
  };
}

export default async function LegalDocPage({ params }: LegalDocPageProps) {
  const { slug } = await params;

  // A draft / missing page resolves to 404 on the API; any error → Next 404.
  const page = await getPage(slug);
  if (!page) {
    notFound();
  }

  const otherDocs = await getOtherDocs(slug);

  return (
    <div className="mx-auto w-full max-w-[1160px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.legal.breadcrumbHome, item: SITE_URL },
          { name: page.title, item: `${SITE_URL}/legal/${page.slug}` },
        ])}
      />
      <LegalDocView page={page} otherDocs={otherDocs} />
    </div>
  );
}
