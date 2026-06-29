import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { pageControllerFindBySlug } from "@/shared/api/generated/pages/pages";
import type { PageEntity } from "@/shared/api/generated/models";
import { sanitizeHtml } from "@/shared/lib/sanitize-html";
import { SITE_URL, dict } from "@/shared/config";

/** Fetch a published page by slug; returns null on 404 / any API error. */
async function getPage(slug: string): Promise<PageEntity | null> {
  try {
    const { data } = await pageControllerFindBySlug(slug);
    return data;
  } catch {
    return null;
  }
}

interface InfoPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: InfoPageProps): Promise<Metadata> {
  const { slug } = await params;

  const page = await getPage(slug);
  if (!page) {
    return { title: dict.meta.pageFallbackTitle };
  }

  const canonical = `${SITE_URL}/info/${page.slug}`;
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

export default async function InfoPage({ params }: InfoPageProps) {
  const { slug } = await params;

  // A draft / missing page resolves to 404 on the API; any error → Next 404.
  const page = await getPage(slug);
  if (!page) {
    notFound();
  }

  // Sanitize admin-authored HTML server-side before rendering it raw.
  const safeHtml = sanitizeHtml(page.content);

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="mb-8 text-3xl font-bold text-foreground">{page.title}</h1>
      <div
        className="prose prose-slate max-w-none"
        dangerouslySetInnerHTML={{ __html: safeHtml }}
      />
    </article>
  );
}
