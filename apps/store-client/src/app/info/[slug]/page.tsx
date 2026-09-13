import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import {
  fetchPublishedPage,
  fetchPublishedPages,
} from "@/shared/api/pages-server";
import { resolvePageRedirect } from "@/shared/lib/page-redirect";
import {
  INFO_DOC_HUB,
  LegalDocView,
  type LegalOtherDoc,
} from "@/widgets/legal-doc";
import { JsonLd } from "@/shared/ui";
import { buildBreadcrumbSchema } from "@/shared/lib/schema";
import {
  buildOgImages,
  resolveSeo,
  resolveSiteName,
  toMetadataTitle,
} from "@/shared/lib/seo";
import { fetchSeoSettings } from "@/shared/api/seo-settings-server";
import { INFO_SLUG_INLINED_ON_HUB, SITE_URL, dict } from "@/shared/config";

/**
 * `/info/<slug>` — admin-authored help / reference pages (TASK-435).
 *
 * The mirror of `/legal/[slug]`, down to the metadata tiering and the 308
 * slug-redirect path; the only differences are the kind it asks the API for and
 * the hub chrome it hands the document view. Asking for `INFO` explicitly is
 * what guarantees a legal document can never be served here (the API 404s a kind
 * mismatch) and that a HUB row — which has no address of its own — never can.
 */

/** Fetch a published INFO page by slug; null on 404 / wrong kind / API error. */
const getPage = (slug: string) => fetchPublishedPage(slug, "INFO");

/** Other published help pages (for the sibling grid). Never throws. */
async function getOtherDocs(currentSlug: string): Promise<LegalOtherDoc[]> {
  const pages = await fetchPublishedPages("INFO");
  return pages
    .filter((page) => page.slug !== currentSlug)
    .map((page) => ({ slug: page.slug, title: page.title }));
}

interface InfoDocPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: InfoDocPageProps): Promise<Metadata> {
  const { slug } = await params;

  const [page, seo] = await Promise.all([getPage(slug), fetchSeoSettings()]);
  if (!page) {
    return { title: dict.meta.pageFallbackTitle };
  }

  // Same three tiers as /legal/[slug]: the page's own meta (tier 1) → its
  // title/excerpt-or-body (tier 2) → the SeoSettings defaults (tier 3), with the
  // `%s` brand template and 60/155 truncation applied.
  const resolved = resolveSeo({
    entityTitle: page.metaTitle,
    entityDescription: page.metaDescription,
    settings: seo,
    content: { name: page.title, description: page.excerpt || page.content },
  });
  const siteName = resolveSiteName(seo);
  const title = toMetadataTitle(resolved, {
    settings: seo,
    siteName,
    fallback: page.title,
  });
  const description = resolved.description;
  // The hub renders one INFO page inline (the "Про нас" block), so that page's
  // text exists at two addresses. This route stays reachable, but points its
  // canonical at the hub instead of competing with it — the sitemap agrees, and
  // both read the slug from the same constant so they cannot drift apart.
  const canonical =
    page.slug === INFO_SLUG_INLINED_ON_HUB
      ? `${SITE_URL}/info`
      : `${SITE_URL}/info/${page.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Replaces the root layout's `openGraph` wholesale (Next merges metadata
    // shallowly), so siteName/locale/images are re-stated here.
    openGraph: {
      title: title.absolute,
      description,
      url: canonical,
      siteName,
      locale: "uk_UA",
      type: "article",
      images: buildOgImages({
        entityOgImage: page.ogImage,
        defaultOgImage: resolved.ogImage,
      }),
    },
  };
}

export default async function InfoDocPage({ params }: InfoDocPageProps) {
  const { slug } = await params;

  const page = await getPage(slug);
  if (!page) {
    // TASK-285: an admin may have renamed the slug — and since TASK-435 they may
    // also have changed its KIND, which moves it to /legal/<slug> under the same
    // slug and records nothing in the rename ledger. `resolvePageRedirect`
    // answers both, and returns null for a real 404.
    //
    // It also resolves the rename case THROUGH the page's kind, which matters
    // here: the ledger is keyed by entity rather than by route, so a renamed
    // LEGAL slug requested under /info/ used to 308 into another /info/ address
    // that then 404s. It now 404s once, honestly.
    //
    // For those status codes to actually reach the wire, this route deliberately
    // has NO route-level loading.tsx: a loading boundary streams a 200 shell
    // before permanentRedirect()/notFound() can set the status (same rationale
    // as /legal/[slug] and /categories/[slug]). The page is light — content is
    // server-fetched before render — so no inner <Suspense> skeleton either.
    const target = await resolvePageRedirect(slug, `/info/${slug}`);
    if (target) {
      permanentRedirect(target);
    }
    notFound();
  }

  const otherDocs = await getOtherDocs(slug);

  return (
    // eslint-disable-next-line tailwindcss/no-arbitrary-value -- mirrors the grandfathered /legal/[slug] document shell (same template, so the two surfaces must align pixel-for-pixel)
    <div className="mx-auto w-full max-w-[1160px] px-4 pt-[22px] pb-16 sm:px-6">
      <JsonLd
        schema={buildBreadcrumbSchema([
          { name: dict.info.breadcrumbHome, item: SITE_URL },
          { name: dict.info.heading, item: `${SITE_URL}/info` },
          { name: page.title, item: `${SITE_URL}/info/${page.slug}` },
        ])}
      />
      <LegalDocView page={page} otherDocs={otherDocs} hub={INFO_DOC_HUB} />
    </div>
  );
}
