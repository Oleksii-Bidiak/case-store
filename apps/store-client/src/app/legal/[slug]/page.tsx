import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  fetchPublishedPage,
  fetchPublishedPages,
} from "@/shared/api/pages-server";
import { resolveSlugRedirect } from "@/shared/lib/slug-redirect";
import { LegalDocView, type LegalOtherDoc } from "@/widgets/legal-doc";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import { resolveSeo, toMetadataTitle } from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { SITE_URL, SITE_NAME, dict } from "@/shared/config";

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

  // Fetch the page and the global SEO settings in parallel; both degrade to null
  // on error (getPage → 404 fallback, fetchSeoSettings → resolveSeo tolerates null).
  const [page, seo] = await Promise.all([getPage(slug), fetchSeoSettings()]);
  if (!page) {
    return { title: dict.meta.pageFallbackTitle };
  }

  // Precedence via the shared helper — identical tiering to the product route
  // (TASK-268 review): the page's own metaTitle/metaDescription (tier 1) →
  // SeoSettings defaults (tier 2) → the page title/excerpt-or-body (tier 3),
  // with the `%s` brand template + 60/155 truncation applied. This makes the
  // live `/legal/<slug>` metadata match the admin SERP preview exactly, and
  // properly brands/optimizes the TASK-184 canonical legal pages.
  const resolved = resolveSeo({
    entityTitle: page.metaTitle,
    entityDescription: page.metaDescription,
    settings: seo,
    content: { name: page.title, description: page.excerpt || page.content },
  });
  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName: SITE_NAME,
    fallback: page.title,
  });
  const description = resolved.description;
  const canonical = `${SITE_URL}/legal/${page.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title: title.absolute,
      description,
      url: canonical,
      type: "article",
      images: resolved.ogImage ? [{ url: resolved.ogImage }] : undefined,
    },
  };
}

export default async function LegalDocPage({ params }: LegalDocPageProps) {
  const { slug } = await params;

  // A draft / missing page resolves to 404 on the API; any error → Next 404.
  const page = await getPage(slug);
  if (!page) {
    // TASK-285: an admin may have renamed the slug — serve a permanent (308)
    // redirect to the current address instead of a dead 404. For the status
    // codes to actually reach the wire, this route deliberately has NO
    // route-level loading.tsx: a loading boundary streams a 200 shell before
    // permanentRedirect()/notFound() can set the status (same rationale as
    // /categories/[slug]). The page is light — content is server-fetched
    // before render — so no inner <Suspense> skeleton is needed either.
    const newSlug = await resolveSlugRedirect("PAGE", slug);
    if (newSlug) {
      permanentRedirect(`/legal/${newSlug}`);
    }
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
